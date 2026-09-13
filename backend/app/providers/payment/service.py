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
from sqlmodel import Session, select

from .base import PaymentChannel, PaymentRequest, RefundRequest
from .router import payment_router
from ...models.payment import Payment, PaymentStatus
from ...models.lease import Lease
from ...models.employee import Employee
from ...models.notification import Notification, NotificationChannel, NotificationStatus
from ...core.events import publish_event

logger = structlog.get_logger()

# 内存幂等缓存：记录最近处理过的 webhook 事务键（生产环境替换为 Redis）
_WEBHOOK_MEMO: set = set()
_WEBHOOK_MEMO_MAX = 10000


def _mark_webhook_seen(key: str) -> bool:
    """返回 False 表示该 key 已处理过（幂等）。"""
    if key in _WEBHOOK_MEMO:
        return False
    _WEBHOOK_MEMO.add(key)
    if len(_WEBHOOK_MEMO) > _WEBHOOK_MEMO_MAX:
        # 简单防内存膨胀：清空重建
        _WEBHOOK_MEMO.clear()
        _WEBHOOK_MEMO.add(key)
    return True


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
        return {"ok": True, "payment_id": str(payment.id), "status": PaymentStatus.refunded.value}

    def handle_webhook(
        self,
        session: Session,
        channel: str,
        payload: dict,
        headers: dict,
    ) -> dict:
        """统一 webhook：验签 → 幂等 → 解析 → 落库 → 触发业务事件。"""
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
        if not tx_id:
            return {"ok": True, "ignored": True, "reason": "no transaction_id"}

        # 3. 幂等检查
        memo_key = f"{channel}:{tx_id}"
        if not _mark_webhook_seen(memo_key):
            return {"ok": True, "ignored": True, "reason": "duplicate webhook"}

        # 4. 落库：通过渠道交易号定位支付单
        payment = session.exec(
            select(Payment).where(
                Payment.channel_transaction_id == tx_id,
                Payment.deleted_at.is_(None),
            )
        ).first()
        if not payment:
            return {"ok": True, "ignored": True, "reason": "payment not found"}

        # 已处于终态的支付单不再变更
        if payment.status in (PaymentStatus.succeeded, PaymentStatus.refunded):
            return {"ok": True, "ignored": True, "reason": "payment already final"}

        event_status = parsed.get("status", "")
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

        if changed:
            session.add(payment)
            session.commit()
            session.refresh(payment)

        logger.info(
            "payment.webhook.handled",
            payment_id=str(payment.id),
            channel=channel,
            status=payment.status.value,
        )
        return {"ok": True, "payment_id": str(payment.id), "status": payment.status.value}


# 全局单例
payment_service = PaymentService()
