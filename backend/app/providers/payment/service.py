"""支付服务：编排支付渠道 provider 调用、状态流转与统一 webhook 处理。

对外暴露三个核心动作：
- create_order:  支付单 → 调用渠道 provider → 生成 checkout_url / QR 码
- query_status:  主动向渠道查询支付状态并同步本地
- refund:        调用渠道 provider 发起退款
- handle_webhook: 统一回调入口（验签 → 幂等 → 解析 → 落库 → 领域事件）
"""
import uuid
from datetime import datetime, timezone
from typing import Optional

import structlog
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from .base import PaymentChannel, PaymentRequest, RefundRequest
from .router import payment_router
from ...models.payment import Payment, PaymentStatus
from ...models.payment_webhook_event import (
    PaymentWebhookEvent,
    WEBHOOK_IGNORED,
    WEBHOOK_PROCESSED,
    WEBHOOK_UNMATCHED,
    build_dedupe_key,
)
from ...models.lease import Lease
from ...models.employee import Employee
from ...models.notification import Notification, NotificationChannel, NotificationStatus
from ...core.events import publish_event

logger = structlog.get_logger()


class UnmatchedWebhookError(Exception):
    """回调验签通过、但本地找不到可匹配的支付单。

    这是**可重试**错误：多为「渠道回调早于下单落库」的时序竞争，
    端点应返回非 2xx（本实现返回 409）让渠道按自己的退避策略重投，
    否则这笔支付会在本地永久停留在 processing。
    """


def _extract_event_id(payload: dict, tx_id: Optional[str]) -> Optional[str]:
    """提取渠道的**事件** id（区别于交易 id）。

    只有渠道确实提供了独立事件 id 时才返回：若 `payload["id"]` 与交易号相同
    （通用/PromptPay 渠道就是这么写的），说明那是交易 id 而非事件 id，
    返回 None 让幂等键退化为「交易号 + 业务状态」，避免把同笔支付的不同
    事件（processing / succeeded）折叠成一条而丢掉成功回调。
    """
    for key in ("event_id", "id"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            value = value.strip()
            if value != tx_id:
                return value
    return None


def _extract_reference_keys(payload: dict) -> tuple[Optional[str], Optional[str]]:
    """从渠道原始报文里尽力提取 (payment_id, idempotency_key) 作为兜底匹配键。

    回调可能早于「下单落库」到达，此时按 `channel_transaction_id` 查不到单子。
    下单时我们已把 `payment_id` / `idempotency_key` 放进 provider 的 metadata
    （见 create_order），所以渠道只要回传了这些字段就能补上匹配。
    各渠道位置不一，这里按常见位置逐个尝试，取不到就返回 None。
    """
    candidates: list[dict] = [payload]
    data = payload.get("data")
    if isinstance(data, dict):
        candidates.append(data)
        obj = data.get("object")
        if isinstance(obj, dict):
            candidates.append(obj)
    for meta_key in ("metadata", "meta"):
        for src in list(candidates):
            meta = src.get(meta_key)
            if isinstance(meta, dict):
                candidates.append(meta)

    payment_id: Optional[str] = None
    idempotency_key: Optional[str] = None
    for src in candidates:
        if not isinstance(src, dict):
            continue
        if not payment_id:
            for key in ("payment_id", "client_reference_id"):
                value = src.get(key)
                if isinstance(value, str) and value.strip():
                    payment_id = value.strip()
                    break
        if not idempotency_key:
            for key in ("idempotency_key", "idempotencyKey", "out_trade_no", "merchant_order_id"):
                value = src.get(key)
                if isinstance(value, str) and value.strip():
                    idempotency_key = value.strip()
                    break
    return payment_id, idempotency_key


def _find_payment(
    session: Session,
    tx_id: Optional[str],
    payment_id_hint: Optional[str],
    idempotency_key_hint: Optional[str],
) -> tuple[Optional[Payment], Optional[str]]:
    """定位支付单，返回 (payment, matched_by)。matched_by 用于留档追溯。"""
    if tx_id:
        found = session.exec(
            select(Payment).where(
                Payment.channel_transaction_id == tx_id,
                Payment.deleted_at.is_(None),
            )
        ).first()
        if found:
            return found, "channel_transaction_id"

    if idempotency_key_hint:
        found = session.exec(
            select(Payment).where(
                Payment.idempotency_key == idempotency_key_hint,
                Payment.deleted_at.is_(None),
            )
        ).first()
        if found:
            return found, "idempotency_key"

    if payment_id_hint:
        try:
            pid = uuid.UUID(payment_id_hint)
        except (ValueError, AttributeError, TypeError):
            pid = None
        if pid is not None:
            found = session.get(Payment, pid)
            if found and not found.deleted_at:
                return found, "payment_id"

    return None, None


def _status_from_result(result) -> str:
    """把 provider 返回的 PaymentResult 归一化为本地状态值。"""
    if result.success:
        return PaymentStatus.succeeded.value
    msg = (result.error_message or "").lower()
    if msg in ("pending", "processing"):
        return PaymentStatus.processing.value
    if msg in ("failed", "failure"):
        return PaymentStatus.failed.value
    if msg in ("canceled", "cancelled", "expired"):
        return PaymentStatus.expired.value
    return PaymentStatus.pending.value


class PaymentService:
    """支付总控服务（单例）。"""

    def create_order(
        self,
        session: Session,
        payment: Payment,
        channel: str,
        customer_email: Optional[str] = None,
    ) -> dict:
        """发起支付：调用渠道 provider 生成收款信息。

        成功后将支付单置为 processing 并保存渠道交易号。
        """
        try:
            provider = payment_router.get_provider(PaymentChannel(channel))
        except (ValueError, KeyError):
            return {"ok": False, "error": f"Unsupported payment channel: {channel}"}

        request = PaymentRequest(
            amount=payment.amount,
            currency=payment.currency,
            channel=PaymentChannel(channel),
            idempotency_key=payment.idempotency_key,
            description=payment.description or "VIP APP Payment",
            customer_email=customer_email,
            metadata={
                "payment_id": str(payment.id),
                "lease_id": str(payment.lease_id) if payment.lease_id else "",
                "payer_id": str(payment.payer_id),
            },
        )

        result = provider.create_payment(request)
        if not result.success:
            payment.status = PaymentStatus.failed
            payment.failure_reason = result.error_message
            session.add(payment)
            session.commit()
            session.refresh(payment)
            logger.warning(
                "payment.create_order_failed",
                payment_id=str(payment.id),
                channel=channel,
                error=result.error_message,
            )
            return {
                "ok": False,
                "payment_id": str(payment.id),
                "error": result.error_message,
            }

        payment.channel = channel
        if result.channel_transaction_id:
            payment.channel_transaction_id = result.channel_transaction_id
        payment.status = PaymentStatus.processing
        session.add(payment)
        session.commit()
        session.refresh(payment)

        logger.info(
            "payment.order_created",
            payment_id=str(payment.id),
            channel=channel,
            amount=payment.amount,
        )
        return {
            "ok": True,
            "payment_id": str(payment.id),
            "channel": channel,
            "checkout_url": result.checkout_url,
            "qr_code_data": result.qr_code_data,
            "channel_transaction_id": payment.channel_transaction_id,
            "status": payment.status.value,
            "expires_at": None,
        }

    def _notify_succeeded(
        self, session: Session, payment: Payment, amount: float, currency: str, channel: str
    ) -> None:
        """支付成功：通知租客缴费已到账，并通知负责员工核销确认。"""
        amount_text = f"{amount} {currency or 'THB'}"
        # 租客：缴费成功确认
        self._notify_once(
            session,
            payment.payer_id,
            "payment_received",
            "缴费成功",
            f"您的缴费 {amount_text} 已到账，感谢您的及时缴纳。",
            payment,
        )
        # 员工：核销确认（租约 agent → Employee.user_id）
        agent_user_id = self._resolve_employee_user_id(session, payment)
        if agent_user_id:
            self._notify_once(
                session,
                agent_user_id,
                "payment_received_admin",
                "收款核销确认",
                f"租户 {payment.payer_id} 的缴费 {amount_text}（{channel}）已到账，请核销。",
                payment,
            )

    def _resolve_employee_user_id(self, session: Session, payment: Payment):
        """通过支付单关联的租约找到负责员工(agent)的 user_id；租约 agent 指向 employees.id。"""
        if not payment.lease_id:
            return None
        lease = session.get(Lease, payment.lease_id)
        if not lease or not lease.agent_id:
            return None
        employee = session.get(Employee, lease.agent_id)
        return employee.user_id if employee else None

    def _notify_once(
        self, session: Session, user_id, template_key: str, subject: str, content: str, payment
    ) -> None:
        """创建站内通知并幂等去重：同一支付单的同一模板只推送一次。"""
        if not user_id:
            return
        exists = session.exec(
            select(Notification).where(
                Notification.template_key == template_key,
                Notification.related_entity_id == payment.id,
            )
        ).first()
        if exists:
            return
        session.add(
            Notification(
                id=uuid.uuid4(),
                user_id=user_id,
                channel=NotificationChannel.in_app,
                template_key=template_key,
                recipient=str(user_id),
                subject=subject,
                content=content,
                status=NotificationStatus.queued,
                related_entity_type="payment",
                related_entity_id=payment.id,
            )
        )

    def query_status(self, session: Session, payment: Payment) -> dict:
        """主动查询渠道支付状态并同步到本地支付单。

        已处于终态（成功/已退款/已过期）的支付单不再查询，也不允许状态回退。
        """
        if payment.status in (
            PaymentStatus.succeeded,
            PaymentStatus.refunded,
            PaymentStatus.expired,
        ):
            return {
                "ok": True,
                "payment_id": str(payment.id),
                "status": payment.status.value,
                "channel_transaction_id": payment.channel_transaction_id,
            }

        if not payment.channel or not payment.channel_transaction_id:
            return {
                "ok": False,
                "status": payment.status.value,
                "error": "Payment has no channel / transaction id",
            }
        try:
            provider = payment_router.get_provider(PaymentChannel(payment.channel))
        except (ValueError, KeyError):
            return {"ok": False, "status": payment.status.value, "error": "unknown channel"}

        result = provider.query_payment(payment.channel_transaction_id)
        local_status = _status_from_result(result)

        # 仅允许状态前进（pending/processing → succeeded/failed/expired），禁止回退
        advanced = {
            PaymentStatus.succeeded: (PaymentStatus.pending, PaymentStatus.processing),
            PaymentStatus.failed: (PaymentStatus.pending, PaymentStatus.processing),
            PaymentStatus.expired: (PaymentStatus.pending, PaymentStatus.processing),
        }.get(PaymentStatus(local_status))

        if advanced and payment.status in advanced:
            if local_status == PaymentStatus.succeeded.value:
                payment.status = PaymentStatus.succeeded
                payment.paid_at = datetime.now(timezone.utc).replace(tzinfo=None)
                self._notify_succeeded(
                    session, payment, payment.amount, payment.currency, payment.channel or ""
                )
                publish_event(
                    session,
                    "payment.received",
                    "payment",
                    payment.id,
                    {
                        "payment_id": str(payment.id),
                        "amount": payment.amount,
                        "currency": payment.currency,
                        "channel": payment.channel,
                    },
                )
            elif local_status == PaymentStatus.failed.value:
                payment.status = PaymentStatus.failed
                payment.failure_reason = result.error_message or "provider reported failure"
            else:
                payment.status = PaymentStatus.expired
            session.add(payment)
            session.commit()
            session.refresh(payment)

        return {
            "ok": True,
            "payment_id": str(payment.id),
            "status": payment.status.value,
            "channel_transaction_id": payment.channel_transaction_id,
        }

    def refund(
        self,
        session: Session,
        payment: Payment,
        amount: Optional[float] = None,
        reason: str = "",
    ) -> dict:
        """退款：有渠道交易号则原路退回，否则标记为线下人工退款。"""
        if payment.status != PaymentStatus.succeeded:
            return {"ok": False, "error": "Only succeeded payments can be refunded"}

        refund_amount = amount if amount is not None else payment.amount

        # 校验退款金额：必须为正，且不能超过已收金额
        if refund_amount <= 0 or refund_amount > payment.amount:
            return {
                "ok": False,
                "error": (
                    f"Invalid refund amount {refund_amount}; "
                    f"must be > 0 and <= {payment.amount}"
                ),
            }

        if payment.channel and payment.channel_transaction_id:
            try:
                provider = payment_router.get_provider(PaymentChannel(payment.channel))
            except (ValueError, KeyError):
                provider = None
            if provider is not None:
                result = provider.refund(
                    RefundRequest(
                        channel_transaction_id=payment.channel_transaction_id,
                        amount=refund_amount,
                        reason=reason,
                    )
                )
                if not result.success:
                    return {
                        "ok": False,
                        "error": result.error_message or "refund failed at channel",
                    }

        # 部分退款：保留 succeeded，仅登记退款原因记录，不清空剩余应缴；
        # 仅当全额退款时置为 refunded。
        is_full_refund = refund_amount >= payment.amount
        if is_full_refund:
            payment.status = PaymentStatus.refunded
        payment.failure_reason = reason or None
        session.add(payment)
        session.commit()
        session.refresh(payment)

        publish_event(
            session,
            "payment.refunded",
            "payment",
            payment.id,
            {
                "payment_id": str(payment.id),
                "amount": refund_amount,
                "currency": payment.currency,
                "channel": payment.channel,
            },
        )
        logger.info("payment.refunded", payment_id=str(payment.id), amount=refund_amount)
        return {
            "ok": True,
            "payment_id": str(payment.id),
            "status": payment.status.value,
        }

    def handle_webhook(
        self,
        session: Session,
        channel: str,
        payload: dict,
        headers: dict,
    ) -> dict:
        """统一 webhook：验签 → 幂等 → 解析 → 落库 → 触发业务事件。

        幂等与留档全部落 `payment_webhook_events` 表（不再用进程内 set）：
        唯一键 `(channel, transaction_id)` 冲突即视为重复投递。
        幂等记录与业务变更**同事务提交**——提交失败则两者一起回滚，
        渠道重投仍能被正常处理，不会出现"标记了但没入账"的丢单。
        """
        try:
            provider = payment_router.get_provider(PaymentChannel(channel))
        except (ValueError, KeyError):
            raise ValueError(f"Unsupported payment channel: {channel}")

        # 1. 验签
        if not provider.verify_webhook(payload, headers):
            logger.warning("payment.webhook.invalid_signature", channel=channel)
            raise PermissionError("Invalid webhook signature")

        # 2. 解析
        parsed = provider.parse_webhook(payload, headers)
        tx_id = parsed.get("transaction_id")
        payment_id_hint, idem_hint = _extract_reference_keys(payload)
        event_status = parsed.get("status", "")
        event_id = _extract_event_id(payload, tx_id)
        dedupe_key = build_dedupe_key(
            channel,
            event_id=event_id,
            transaction_id=tx_id,
            event_status=event_status,
            idempotency_key=idem_hint,
            payload=payload,
        )

        # 3. 定位支付单：渠道交易号优先，其次 idempotency_key / payment_id 兜底。
        #    回调可能早于「下单落库」到达，兜底键就是为这种情况准备的。
        if not (tx_id or idem_hint or payment_id_hint):
            # 报文里没有任何可用于匹配的引用键：属渠道侧报文问题，重投也无用，
            # 按 400 返回（端点上映射为不可重试），但仍留档便于排查对接。
            session.add(
                PaymentWebhookEvent(
                    dedupe_key=dedupe_key,
                    channel=channel,
                    event_id=event_id,
                    transaction_id=None,
                    idempotency_key=None,
                    status=WEBHOOK_UNMATCHED,
                    event_status=event_status,
                    note="webhook carries no reference key",
                    raw_payload=payload,
                )
            )
            session.commit()
            logger.warning("payment.webhook.no_reference_key", channel=channel)
            raise ValueError("webhook carries no reference key")

        payment, matched_by = _find_payment(session, tx_id, payment_id_hint, idem_hint)

        if not payment:
            # 绝不返回 2xx：渠道看到 2xx 就不会重投，这笔支付会在本地永久丢失。
            # 留档 unmatched 供人工/定时补单，同时让渠道按自己的退避策略重投。
            event = PaymentWebhookEvent(
                dedupe_key=dedupe_key,
                channel=channel,
                event_id=event_id,
                transaction_id=tx_id,
                idempotency_key=idem_hint,
                status=WEBHOOK_UNMATCHED,
                event_status=event_status,
                note="no local payment matched; awaiting channel retry",
                raw_payload=payload,
            )
            session.add(event)
            session.commit()
            logger.warning(
                "payment.webhook.unmatched",
                channel=channel,
                transaction_id=tx_id,
                event_id=event_id,
                idempotency_key=idem_hint,
                payment_id_hint=payment_id_hint,
                event_row_id=str(event.id),
            )
            raise UnmatchedWebhookError(
                f"Payment not found for channel={channel} transaction_id={tx_id}"
            )

        # 4. 幂等：插入回调事件行。唯一约束冲突 = 该事件已处理过。
        event = PaymentWebhookEvent(
            dedupe_key=dedupe_key,
            channel=channel,
            event_id=event_id,
            transaction_id=tx_id,
            idempotency_key=idem_hint,
            payment_id=payment.id,
            status=WEBHOOK_PROCESSED,
            event_status=event_status,
            note=f"matched_by={matched_by}",
            raw_payload=payload,
        )
        session.add(event)
        try:
            session.flush()
        except IntegrityError:
            session.rollback()
            logger.info(
                "payment.webhook.duplicate",
                channel=channel,
                transaction_id=tx_id,
                event_id=event_id,
                dedupe_key=dedupe_key,
                payment_id=str(payment.id),
            )
            return {"ok": True, "ignored": True, "reason": "duplicate webhook"}

        # 已处于终态的支付单不再变更（仍留档，便于审计重复投递）
        if payment.status in (PaymentStatus.succeeded, PaymentStatus.refunded):
            event.mark(WEBHOOK_IGNORED, payment.id, "payment already final")
            session.add(event)
            session.commit()
            return {"ok": True, "ignored": True, "reason": "payment already final"}
        changed = False
        if event_status in ("succeeded", "success", "completed"):
            payment.status = PaymentStatus.succeeded
            payment.paid_at = datetime.now(timezone.utc).replace(tzinfo=None)
            changed = True
            self._notify_succeeded(
                session,
                payment,
                float(parsed.get("amount") or payment.amount),
                parsed.get("currency") or payment.currency,
                payment.channel or channel,
            )
            publish_event(
                session,
                "payment.received",
                "payment",
                payment.id,
                {
                    "payment_id": str(payment.id),
                    "amount": float(parsed.get("amount") or payment.amount),
                    "currency": parsed.get("currency") or payment.currency,
                    "channel": payment.channel or channel,
                },
            )
        elif event_status in ("failed", "failure"):
            payment.status = PaymentStatus.failed
            payment.failure_reason = "provider reported failure via webhook"
            changed = True
            publish_event(
                session,
                "payment.failed",
                "payment",
                payment.id,
                {"payment_id": str(payment.id), "reason": payment.failure_reason},
            )
        elif event_status in ("refunded",):
            payment.status = PaymentStatus.refunded
            changed = True
        elif event_status in ("canceled", "cancelled", "expired"):
            payment.status = PaymentStatus.expired
            changed = True

        # 5. 幂等记录与业务变更同一个事务提交：
        #    提交成功 = 业务已生效 + 幂等键已占用；提交失败则两者一起回滚，
        #    渠道重投会重新走完整流程，不会出现「标记了却没入账」。
        session.add(payment)
        session.commit()
        session.refresh(payment)

        logger.info(
            "payment.webhook.handled",
            payment_id=str(payment.id),
            channel=channel,
            status=payment.status.value,
            changed=changed,
            matched_by=matched_by,
        )
        return {"ok": True, "payment_id": str(payment.id), "status": payment.status.value}


# 全局单例
payment_service = PaymentService()
