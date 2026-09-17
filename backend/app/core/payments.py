"""收付款公共口径：逾期判定与对账分桶。

对账/工作台多处各自手写 `due_date < now` 判定，口径容易漂移。这里收敛为
公共函数，统一「已到账 / 逾期 / 待收」语义（与 payments 对账导出一致）：

- succeeded        -> received（已到账）
- failed           -> overdue（失败即逾期）
- 其余状态且已过截止日（refunded 除外） -> overdue
- 其余情况          -> pending

注意：dashboard 的对账口径不区分 refunded（refunded 且逾期仍算 overdue），
与本站不同，未强行统一（见 dashboard.py 对应处注释）。
"""
from datetime import datetime

from app.models import Payment, PaymentStatus


def is_past_due(payment: Payment, now: datetime) -> bool:
    """是否已过缴费截止日（due_date 为空的单不算逾期）。"""
    return bool(payment.due_date and payment.due_date < now)


def payment_bucket(payment: Payment, now: datetime) -> str:
    """对账分桶：返回 received / overdue / pending。"""
    if payment.status == PaymentStatus.succeeded:
        return "received"
    if payment.status == PaymentStatus.failed:
        return "overdue"
    if is_past_due(payment, now) and payment.status != PaymentStatus.refunded:
        return "overdue"
    return "pending"
