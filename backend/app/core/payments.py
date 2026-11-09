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

# 「待缴」口径：processing（已上传凭证/渠道处理中）仍是未结清账单，必须计入待缴；
# failed 表示扣款失败但账单仍欠费，同样计入。succeeded/refunded/expired/disputed
# 属于已结清或已关闭，不再计入待缴。
UNPAID_PAYMENT_STATUSES = (
    PaymentStatus.pending,
    PaymentStatus.processing,
    PaymentStatus.failed,
)


def is_past_due(payment: Payment, now: datetime) -> bool:
    """是否已过缴费截止日（due_date 为空的单不算逾期）。"""
    return bool(payment.due_date and payment.due_date < now)


def bill_bucket(payment: Payment, now: datetime) -> str:
    """单笔账单对租客/业主的展示分桶：received / pending / overdue / closed。

    逾期只看 `due_date`，与列表筛选、待缴合计、逾期笔数共用这一处口径。
    """
    if payment.status == PaymentStatus.succeeded:
        return "received"
    if payment.status in UNPAID_PAYMENT_STATUSES:
        return "overdue" if is_past_due(payment, now) else "pending"
    return "closed"


def payment_bucket(payment: Payment, now: datetime) -> str:
    """对账分桶：返回 received / overdue / pending。"""
    if payment.status == PaymentStatus.succeeded:
        return "received"
    if payment.status == PaymentStatus.failed:
        return "overdue"
    if is_past_due(payment, now) and payment.status != PaymentStatus.refunded:
        return "overdue"
    return "pending"
