"""租约模型。

对应设计文档中的租约/合同主数据，关联房源、租客、业主。
"""
from datetime import datetime
from enum import Enum
from typing import Optional
import uuid

from sqlmodel import Field

from .base import TimestampMixin


class LeaseStatus(str, Enum):
    """租约状态枚举。"""

    active = "active"
    expired = "expired"
    terminated = "terminated"
    pending = "pending"


class Lease(TimestampMixin, table=True):
    """租约表。"""

    __tablename__ = "leases"

    property_id: uuid.UUID = Field(foreign_key="properties.id", index=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)
    owner_id: uuid.UUID = Field(foreign_key="owners.id")
    agent_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="employees.id", index=True, description="成交归属员工/经纪"
    )
    start_date: datetime
    end_date: datetime = Field(index=True)
    monthly_rent: float
    currency: str = Field(default="THB", max_length=3)
    deposit_amount: float
    deposit_status: str = Field(default="held")  # held/refunded/forfeited
    status: LeaseStatus = Field(default=LeaseStatus.pending, index=True)
    contract_url: Optional[str] = None  # 合同文件 URL
    contract_hash: Optional[str] = None  # SHA-256 哈希
    special_terms: Optional[str] = None
    renewed_from_lease_id: Optional[uuid.UUID] = None  # 续约关联
