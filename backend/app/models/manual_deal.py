"""手工补录业绩模型。

平台租约成交由 CommissionSettlement 自动生成业绩；非平台成交
（平台对接客户成交 / 销售自主拓客成交）通过本表手工补录，计入当月业绩。
"""
import uuid
from datetime import date as date_type
from enum import Enum
from typing import Optional

from sqlmodel import Field

from .base import TimestampMixin


class DealSource(str, Enum):
    """补录来源枚举。"""

    platform_customer = "platform_customer"  # 平台对接客户
    self_sourced = "self_sourced"  # 销售自主拓客


class ManualDeal(TimestampMixin, table=True):
    """手工补录业绩表。"""

    __tablename__ = "manual_deals"

    employee_id: uuid.UUID = Field(foreign_key="employees.id", index=True)
    source: DealSource = Field(index=True)
    # 取值 new_rental/renewal/sale_transaction/management。
    # 刻意不复用现有 DealType 枚举：该枚举在 PostgreSQL 上是原生枚举类型，
    # 扩容取值需要 ALTER TYPE，故这里用字符串列避免迁移风险。
    deal_type: str = Field(max_length=32)
    deal_date: date_type = Field(index=True)
    deal_amount: float = Field(default=0)
    commission_amount: float = Field(default=0)
    currency: str = Field(default="THB", max_length=3)
    customer_name: Optional[str] = None
    property_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="properties.id", index=True
    )
    note: Optional[str] = None
    created_by: Optional[uuid.UUID] = Field(default=None, foreign_key="users.id")
