"""支付回调幂等与丢单防护的回归测试（对应 P0-2 / P0-3 修复）。

修复前的缺陷（原实现见 git 历史 `providers/payment/service.py`）：
1. 幂等用**进程内 set**：生产 `uvicorn --workers 4`，各进程互不可见 → 同一回调重复入账；
   且集合超 10000 条整体 clear()，历史键全丢。
2. 幂等标记发生在 `commit()` **之前**：commit 失败后渠道重投被判「重复」直接丢弃。
3. 回调查不到本地支付单时返回 200 → 渠道不再重投 → 支付永久丢失。

本文件锁住修复后的四条契约：
- 同一事件重复投递 → 第二次为 duplicate，业务只生效一次
- **同一交易号的不同事件**（processing → succeeded）都能各自生效（不能被折叠）
- 匹配不到支付单 → 抛 UnmatchedWebhookError（端点映射 409）且留档 unmatched
- 兜底键生效：回调早于下单落库时，靠 idempotency_key 仍能补上匹配
"""
import uuid

import pytest
from sqlmodel import select

from app.models.payment import Payment, PaymentStatus, PaymentType
from app.models.payment_webhook_event import PaymentWebhookEvent, WEBHOOK_UNMATCHED
from app.providers.payment.promptpay_provider import PromptPayProvider
from app.providers.payment.service import payment_service, UnmatchedWebhookError


@pytest.fixture(autouse=True)
def _assume_signature_verified(monkeypatch):
    """让验签通过，专注测「验签之后」的幂等与匹配契约。

    验签本身是 fail closed 的（缺验签材料一律拒绝，见各 provider 的
    `verify_webhook`），所以回调测试不能再依赖"某个渠道恰好不验签"。
    这里显式放行，把测试范围限定在幂等 / 匹配逻辑上。
    """
    monkeypatch.setattr(
        PromptPayProvider, "verify_webhook", lambda self, payload, headers: True
    )


def _make_payment(session, *, tx_id=None, status=PaymentStatus.pending, idem=None):
    """建一张支付单（channel=promptpay；验签由上方 fixture 放行）。"""
    pay = Payment(
        payer_id=uuid.uuid4(),
        amount=6000,
        currency="THB",
        payment_type=PaymentType.rent,
        status=status,
        channel="promptpay",
        channel_transaction_id=tx_id,
        idempotency_key=idem or str(uuid.uuid4()),
    )
    session.add(pay)
    session.commit()
    session.refresh(pay)
    return pay


def _hook(session, payload):
    return payment_service.handle_webhook(session, "promptpay", payload, headers={})


def test_duplicate_event_applies_once(session):
    """同一事件重复投递：业务只生效一次，第二次返回 duplicate。"""
    pay = _make_payment(session, tx_id="TX-1")
    payload = {"transaction_id": "TX-1", "id": "EVT-1", "event": "payment.succeeded", "amount": 6000}

    first = _hook(session, payload)
    assert first.get("status") == PaymentStatus.succeeded.value

    session.refresh(pay)
    assert pay.status == PaymentStatus.succeeded

    second = _hook(session, payload)
    assert second.get("ignored") is True
    assert second.get("reason") == "duplicate webhook"

    rows = session.exec(
        select(PaymentWebhookEvent).where(PaymentWebhookEvent.channel == "promptpay")
    ).all()
    assert len(rows) == 1, f"同一事件只应留一行，实际 {len(rows)}"


def test_same_transaction_different_status_both_apply(session):
    """回归保护：同一交易号的 processing 与 succeeded 不能被折叠成一个。

    这是本修复最关键的一条——若幂等键只取 transaction_id，
    Stripe 的 payment_intent.processing 会先占键，后到的 succeeded 被当重复丢掉，
    比原缺陷更严重。故幂等键必须含渠道事件 id 或业务状态。
    """
    pay = _make_payment(session, tx_id="TX-2")

    processing = _hook(
        session, {"transaction_id": "TX-2", "id": "EVT-A", "event": "payment.processing"}
    )
    assert processing.get("ignored") is not True, "processing 事件应被接受"

    succeeded = _hook(
        session, {"transaction_id": "TX-2", "id": "EVT-B", "event": "payment.succeeded", "amount": 6000}
    )
    assert succeeded.get("status") == PaymentStatus.succeeded.value, (
        "同一交易号的成功事件被当成重复丢弃了 —— 幂等键粒度过粗"
    )

    session.refresh(pay)
    assert pay.status == PaymentStatus.succeeded


def test_unmatched_webhook_raises_and_keeps_record(session):
    """匹配不到支付单：抛 UnmatchedWebhookError（端点→409）并留档，绝不返回成功。"""
    payload = {"transaction_id": "TX-NOPE", "id": "EVT-NOPE", "event": "payment.succeeded"}

    with pytest.raises(UnmatchedWebhookError):
        _hook(session, payload)

    rows = session.exec(
        select(PaymentWebhookEvent).where(
            PaymentWebhookEvent.status == WEBHOOK_UNMATCHED
        )
    ).all()
    assert len(rows) == 1
    assert rows[0].transaction_id == "TX-NOPE"
    assert rows[0].processed_at is None


def test_fallback_match_by_idempotency_key(session):
    """回调早于下单落库：交易号还没写回，靠 idempotency_key 兜底匹配。"""
    idem = "order-ref-777"
    pay = _make_payment(session, tx_id=None, idem=idem)

    # 渠道回调里带的是我们的幂等键（下单时放进 metadata / out_trade_no），
    # 此时 channel_transaction_id 尚未回写，只能靠兜底键匹配。
    result = _hook(
        session,
        {"transaction_id": "TX-LATE", "event": "payment.succeeded", "metadata": {"idempotency_key": idem}},
    )
    assert result.get("payment_id") == str(pay.id)

    session.refresh(pay)
    assert pay.status == PaymentStatus.succeeded

    row = session.exec(
        select(PaymentWebhookEvent).where(PaymentWebhookEvent.payment_id == pay.id)
    ).first()
    assert row is not None
    assert "idempotency_key" in (row.note or ""), f"应记录兜底匹配来源，实际 note={row.note}"


def test_payload_without_reference_key_raises_value_error(session):
    """报文没有任何引用键：抛 ValueError（端点→400，重投无用），但仍留档。"""
    with pytest.raises(ValueError):
        _hook(session, {"event": "payment.succeeded"})

    rows = session.exec(select(PaymentWebhookEvent)).all()
    assert len(rows) == 1
    assert "no reference key" in (rows[0].note or "")
