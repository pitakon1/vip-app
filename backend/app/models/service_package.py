"""年度托管套餐订阅模型。

对应设计文档中的 `service_packages`（年度托管套餐订阅）：
owner_id, property_id, type(annual_management/full_service), commission_rate,
management_fee_rate, start_date, end_date, status。
"""
from datetime import datetime
from enum import Enum
import uuid

from sqlmodel import Field

from .base import TimestampMixin


class ServicePackageType(str, Enum):
    """托管套餐类型枚举。"""

    annual_management = "annual_management"  # 年度托管（收租 + 代缴 + 托管费）
    full_service = "full_service"  # 全托管（含维修/清洁等增值服务）


class ServicePackageStatus(str, Enum):
    """套餐状态枚举。"""

    active = "active"
    pending = "pending"
    expired = "expired"
    cancelled = "cancelled"


class ServicePackage(TimestampMixin, table=True):
    """年度托管套餐订阅表。"""

    __tablename__ = "service_packages"

    owner_id: uuid.UUID = Field(foreign_key="owners.id", index=True)
    property_id: uuid.UUID = Field(foreign_key="properties.id", index=True)
    type: ServicePackageType = Field(index=True)
    commission_rate: float = Field(default=1.0, description="佣金 = N 个月租金")
    management_fee_rate: float = Field(
        default=0.5, description="托管费 = N 个月租金/年"
    )
    amount: float = Field(default=0, description="套餐总费用（佣金 + 托管费）")
    currency: str = Field(default="THB", max_length=3)
    start_date: datetime
    end_date: datetime = Field(index=True)
    status: ServicePackageStatus = Field(
        default=ServicePackageStatus.active, index=True
    )
    auto_renew: bool = Field(default=True, description="每年自动续费提醒")
