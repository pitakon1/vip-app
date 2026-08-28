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
    payer_id: uuid.UUID = Field(foreign_key="users.id")
    payee_id: Optional[uuid.UUID] = Field(default=None, foreign_key="users.id")
    amount: float = Field(gt=0)
    currency: str = Field(default="THB", max_length=3)
    payment_type: PaymentType = Field(index=True)
    status: PaymentStatus = Field(default=PaymentStatus.pending, index=True)
    channel: Optional[str] = None  # stripe/promptpay/wechat/alipay/wise 等
    channel_transaction_id: Optional[str] = None
    idempotency_key: str = Field(unique=True, index=True)
    due_date: Optional[datetime] = None
    paid_at: Optional[datetime] = None
    failure_reason: Optional[str] = None
    receipt_url: Optional[str] = None
    description: Optional[str] = None
