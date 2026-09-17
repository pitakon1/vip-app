"""收付款模型。

对应设计文档中的收付款/对账主数据，覆盖租金、押金、佣金、服务费、税费等。
"""
from datetime import datetime
from enum import Enum
from typing import Optional
import uuid

from sqlmodel import Field

from .base import TimestampMixin


class PaymentType(str, Enum):
    """收款类型枚举。"""

    rent = "rent"
    deposit = "deposit"
    commission = "commission"
    service_fee = "service_fee"
    utility = "utility"
    tax = "tax"
    refund = "refund"


class PaymentStatus(str, Enum):
    """收款状态枚举。"""

    pending = "pending"
    processing = "processing"
    succeeded = "succeeded"
    failed = "failed"
    refunded = "refunded"
    disputed = "disputed"
    expired = "expired"


class Payment(TimestampMixin, table=True):
    """收付款表。"""

    __tablename__ = "payments"

    lease_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="leases.id", index=True
    )
    property_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="properties.id"
    )
    payer_id: uuid.UUID = Field(foreign_key="users.id", index=True)
    payee_id: Optional[uuid.UUID] = Field(default=None, foreign_key="users.id")
    amount: float = Field(gt=0)
    currency: str = Field(default="THB", max_length=3)
    payment_type: PaymentType = Field(index=True)
    status: PaymentStatus = Field(default=PaymentStatus.pending, index=True)
    channel: Optional[str] = None  # stripe/promptpay/wechat/alipay/wise 等
    channel_transaction_id: Optional[str] = None
    idempotency_key: str = Field(unique=True, index=True)
    due_date: Optional[datetime] = Field(default=None, index=True)
    paid_at: Optional[datetime] = None
    failure_reason: Optional[str] = None
    receipt_url: Optional[str] = None
    description: Optional[str] = None

    # 逾期滞纳金：accrued 为按逾期天数「重算」出来的毛额（非累加，任务可重复执行），
    # waived 为人工减免额，实收 = amount + accrued - waived。
    # server_default 必须与迁移 0013 一致，否则 schema 漂移检测会报 modify_default。
    late_fee_accrued: float = Field(
        default=0, ge=0, sa_column_kwargs={"server_default": "0"}
    )
    late_fee_waived: float = Field(
        default=0, ge=0, sa_column_kwargs={"server_default": "0"}
    )
    late_fee_updated_at: Optional[datetime] = None

    # 财务对账核销：记录管理端核对到账的时间、操作人、备注与核销状态。
    reconciled_at: Optional[datetime] = None
    reconciled_by: Optional[uuid.UUID] = Field(
        default=None, foreign_key="users.id"
    )
    reconciliation_note: Optional[str] = None
    reconciliation_status: Optional[str] = Field(
        default="unreconciled",
        sa_column_kwargs={"server_default": "'unreconciled'"},
    )

    @property
    def late_fee_due(self) -> float:
        """尚需缴纳的滞纳金（毛额扣除已减免）。"""
        return round(max(self.late_fee_accrued - self.late_fee_waived, 0.0), 2)

    @property
    def total_due(self) -> float:
        """逾期单的实际应缴总额（本金 + 未减免滞纳金）。"""
        return round(self.amount + self.late_fee_due, 2)
