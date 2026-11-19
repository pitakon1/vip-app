"""合作公司 Webhook 投递。

约定（与路线图 F3 一致）：
- 事件按 partner 订阅过滤（`PartnerWebhook.events` 为空 = 订阅全部）；
- 每次投递写入 `partner_webhook_events`，成功/失败都留痕，失败按指数退避重试；
- 请求头 `X-Partner-Signature: sha256=<hmac>`，签名串为 `f"{timestamp}.{body}"`，
  接收方用同一 secret 重算即可校验完整性。
"""
import hashlib
import hmac
import json
import uuid
from datetime import datetime, timedelta
from typing import Any, Dict, Optional

from sqlmodel import Session, select

from app.core.logging import get_logger
from app.models import PartnerWebhook, PartnerWebhookEvent

logger = get_logger(__name__)

MAX_ATTEMPTS = 5


def sign(secret: str, timestamp: int, body: str) -> str:
    """计算签名（与接收方约定一致的算法）。"""
    msg = f"{timestamp}.{body}".encode("utf-8")
    return hmac.new(secret.encode("utf-8"), msg, hashlib.sha256).hexdigest()


def create_events(
    session: Session,
    partner_id: Optional[uuid.UUID],
    event: str,
    payload: Optional[Dict[str, Any]] = None,
) -> int:
    """为订阅了该事件的公司 Webhook 生成待投递记录（不实际发请求）。"""
    if not partner_id:
        return 0
    hooks = session.exec(
        select(PartnerWebhook).where(
            PartnerWebhook.partner_id == partner_id,
            PartnerWebhook.is_active == True,  # noqa: E712
            PartnerWebhook.deleted_at.is_(None),
        )
    ).all()
    created = 0
    for hook in hooks:
        events = hook.events or []
        if events and event not in events:
            continue
        session.add(
            PartnerWebhookEvent(
                partner_id=partner_id,
                webhook_id=hook.id,
                event=event,
                payload=payload or {},
                status="pending",
            )
        )
        created += 1
    return created


def deliver_event(session: Session, ev: PartnerWebhookEvent) -> bool:
    """投递单个事件；失败写入重试时间。返回是否成功。"""
    import urllib.error
    import urllib.request

    hook = session.get(PartnerWebhook, ev.webhook_id)
    if not hook or hook.deleted_at is not None or not hook.is_active:
        ev.status = "failed"
        ev.response_body = "webhook disabled"
        session.add(ev)
        return False

    body = json.dumps(ev.payload or {}, ensure_ascii=False, default=str)
    timestamp = int(datetime.utcnow().timestamp())
    signature = sign(hook.secret, timestamp, body)
    ev.attempts = (ev.attempts or 0) + 1
    req = urllib.request.Request(
        hook.url,
        data=body.encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "X-Partner-Event": ev.event,
            "X-Partner-Timestamp": str(timestamp),
            "X-Partner-Signature": f"sha256={signature}",
        },
        method="POST",
    )
    ok = False
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:  # noqa: S310
            code = resp.getcode()
            text = resp.read(300).decode("utf-8", "ignore")
        ev.response_code = code
        ev.response_body = text[:500]
        ok = 200 <= code < 300
    except urllib.error.HTTPError as exc:
        ev.response_code = exc.code
        ev.response_body = str(exc.reason)[:500]
    except Exception as exc:  # 网络不可达 / 超时
        ev.response_code = None
        ev.response_body = str(exc)[:500]

    hook.last_status_code = ev.response_code
    hook.last_delivery_at = datetime.utcnow()
    session.add(hook)
    if ok:
        ev.status = "success"
        ev.next_retry_at = None
    elif ev.attempts >= MAX_ATTEMPTS:
        ev.status = "failed"
        ev.next_retry_at = None
    else:
        ev.status = "pending"
        ev.next_retry_at = datetime.utcnow() + timedelta(
            minutes=2 ** ev.attempts
        )
    session.add(ev)
    try:
        session.commit()
    except Exception:
        session.rollback()
        logger.warning("partner.webhook.commit_failed", exc_info=True)
    return ok


def deliver_pending(session: Session, limit: int = 50) -> int:
    """投递到期的待发事件（供后台任务/手动重试复用）。"""
    now = datetime.utcnow()
    rows = session.exec(
        select(PartnerWebhookEvent)
        .where(
            PartnerWebhookEvent.status == "pending",
            PartnerWebhookEvent.deleted_at.is_(None),
            (PartnerWebhookEvent.next_retry_at.is_(None))
            | (PartnerWebhookEvent.next_retry_at <= now),
        )
        .limit(limit)
    ).all()
    sent = 0
    for ev in rows:
        if deliver_event(session, ev):
            sent += 1
    return sent
