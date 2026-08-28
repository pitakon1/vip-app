"""佣金结算模型。

对应设计文档中的员工佣金结算主数据。
"""
from datetime import datetime
from enum import Enum
from typing import Optional
import uuid

from sqlmodel import Field

from .base import TimestampMixin


class DealType(str, Enum):
    """成交类型枚举。"""

    new_rental = "new_rental"
    renewal = "renewal"
    management = "management"


class SettlementStatus(str, Enum):
    """结算状态枚举。"""

    pending = "pending"
    approved = "approved"
    paid = "paid"


class CommissionSettlement(TimestampMixin, table=True):
    """佣金结算表。"""

    __tablename__ = "commission_settlements"

    employee_id: uuid.UUID = Field(foreign_key="employees.id", index=True)
    lease_id: uuid.UUID = Field(foreign_key="leases.id", index=True)
    deal_type: DealType = Field(index=True)
    commission_base: float = Field(default=0)
    commission_rate: float = Field(default=0)
    commission_amount: float = Field(default=0)
    currency: str = Field(default="THB", max_length=3)
    status: SettlementStatus = Field(
        default=SettlementStatus.pending, index=True
    )
    settled_at: Optional[datetime] = None
    paid_at: Optional[datetime] = None
