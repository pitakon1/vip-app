"""服务套餐订阅模型。

`service_packages` 既支持原「年度托管套餐」（type=annual_management/full_service，
按年计费），也支持三种通用计费方式（billing_model=monthly/per_use/annual）：

- 按月 monthly：billing_interval 个月，amount = unit_price * billing_interval，end_date 按月推进
- 按次 per_use ：不看日期看次数，quota_total 总次数 / quota_used 已用次数，end_date 可留空
- 按年 annual ：billing_interval 年（默认 1），amount = unit_price * billing_interval

字段 owner_id, property_id, type(annual_management/full_service), commission_rate,
management_fee_rate, start_date, end_date, status。
"""
from datetime import datetime
from enum import Enum
from typing import Optional
import uuid

from sqlmodel import Field

from .base import TimestampMixin


class ServicePackageType(str, Enum):
    """托管套餐类型枚举。"""

    annual_management = "annual_management"  # 年度托管（收租 + 代缴 + 托管费）
    full_service = "full_service"  # 全托管（含维修/清洁等增值服务）


class ServiceBillingModel(str, Enum):
    """服务套餐计费方式枚举。"""

    monthly = "monthly"  # 按月计费
    per_use = "per_use"  # 按次计费（看次数，不看日期）
    annual = "annual"  # 按年计费（默认，兼容旧数据）


class ServicePackageStatus(str, Enum):
    """套餐状态枚举。"""

    active = "active"
    pending = "pending"
    expired = "expired"
    cancelled = "cancelled"


class ServicePackage(TimestampMixin, table=True):
    """服务套餐订阅表。"""

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
    end_date: Optional[datetime] = Field(default=None, index=True)
    status: ServicePackageStatus = Field(
        default=ServicePackageStatus.active, index=True
    )
    auto_renew: bool = Field(default=True, description="每年自动续费提醒")
    # ---- 三种计费方式（既有行向后兼容默认 annual）----
    billing_model: ServiceBillingModel = Field(
        default=ServiceBillingModel.annual, index=True
    )
    billing_interval: int = Field(
        default=1, description="monthly/annual 周期数（单位=月/年）；per_use 忽略"
    )
    unit_price: float = Field(
        default=0, description="单价（月度/年度单价，或按次单价）"
    )
    quota_total: int = Field(default=0, description="per_use 总次数")
    quota_used: int = Field(default=0, description="per_use 已用次数")
