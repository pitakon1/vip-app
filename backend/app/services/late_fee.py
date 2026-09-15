"""逾期滞纳金计提规则。

规则（参数见 `app.config`）：
- 只对「租金」类型的待缴支付单计提，已支付/已取消/已退款的一律为 0；
- 到期后有宽限期（`LATE_FEE_GRACE_DAYS`），宽限期内不计提；
- 超出宽限期后按日费率（`LATE_FEE_DAILY_RATE`）线性计提；
- 封顶为本金的 `LATE_FEE_CAP_RATIO`，避免长期逾期产生天价费用。

计提额是「按逾期天数重算」而不是逐日累加，因此定时任务可重复执行而不会重复计费；
人工减免单独记在 `Payment.late_fee_waived`，不影响重算结果。
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Session, select

from app.config import settings
from app.models.payment import Payment, PaymentStatus, PaymentType


def _as_utc(value: datetime) -> datetime:
    """统一成带时区的 UTC，避免 naive/aware 相减报错。"""
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def overdue_days(due_date: datetime, now: Optional[datetime] = None) -> int:
    """已逾期天数（不足一天按一天算，到期当天为 0）。"""
    now = now or datetime.now(timezone.utc)
    delta = _as_utc(now) - _as_utc(due_date)
    return max(delta.days, 0) if delta.total_seconds() > 0 else 0


def computable(payment: Payment) -> bool:
    """是否属于计提范围：租金 + 待支付 + 有到期日 + 未删除。"""
    return bool(
        settings.LATE_FEE_ENABLED
        and not payment.deleted_at
        and payment.payment_type == PaymentType.rent
        and payment.status == PaymentStatus.pending
        and payment.due_date is not None
    )


def compute_late_fee(
    amount: float, due_date: datetime, now: Optional[datetime] = None
) -> float:
    """按本金与到期日重算应计提的滞纳金（已含宽限期与封顶）。"""
    if not settings.LATE_FEE_ENABLED:
        return 0.0
    chargeable_days = overdue_days(due_date, now) - settings.LATE_FEE_GRACE_DAYS
    if chargeable_days <= 0:
        return 0.0
    fee = amount * settings.LATE_FEE_DAILY_RATE * chargeable_days
    cap = amount * settings.LATE_FEE_CAP_RATIO
    return round(min(fee, cap), 2)


def late_fee_for(payment: Payment, now: Optional[datetime] = None) -> float:
    """单个支付单当前应计提的滞纳金；不在计提范围时返回 0。"""
    if not computable(payment):
        return 0.0
    return compute_late_fee(payment.amount, payment.due_date, now)


def accrue_late_fees(session: Session, now: Optional[datetime] = None) -> list[Payment]:
    """扫描所有待缴租金单，重算并写回 `late_fee_accrued`。

    返回本次滞纳金「变大」的支付单，供调用方发通知（未变化的不返回，避免重复提醒）。
    """
    now = now or datetime.now(timezone.utc)
    payments = session.exec(
        select(Payment).where(
            Payment.deleted_at.is_(None),
            Payment.payment_type == PaymentType.rent,
            Payment.status == PaymentStatus.pending,
            Payment.due_date.is_not(None),
        )
    ).all()

    changed: list[Payment] = []
    for payment in payments:
        fee = late_fee_for(payment, now)
        if fee <= payment.late_fee_accrued:
            # 未变化或人工减免后回退（不应发生）都不动，保持幂等
            continue
        payment.late_fee_accrued = fee
        payment.late_fee_updated_at = now
        # 减免额不应超过重算后的毛额
        payment.late_fee_waived = min(payment.late_fee_waived, fee)
        session.add(payment)
        changed.append(payment)

    session.commit()
    return changed