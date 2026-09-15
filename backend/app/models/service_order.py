"""推荐服务订单模型。

对应设计文档中的增值服务订单主数据，覆盖保洁、空调清洗、网络安装、税费代缴等。
"""
from datetime import datetime
from enum import Enum
from typing import Optional
import uuid

from sqlmodel import Field

from .base import TimestampMixin


class ServiceType(str, Enum):
    """服务类型枚举。"""

    cleaning = "cleaning"
    ac_cleaning = "ac_cleaning"
    wifi_install = "wifi_install"
    utility_payment = "utility_payment"
    insurance = "insurance"
    tax_payment = "tax_payment"
    annual_management = "annual_management"


class ServiceOrderStatus(str, Enum):
    """服务订单状态枚举。"""

    pending = "pending"
    assigned = "assigned"
    in_progress = "in_progress"
    completed = "completed"
    cancelled = "cancelled"


class ServiceOrder(TimestampMixin, table=True):
    """推荐服务订单表。"""

    __tablename__ = "service_orders"

    orderer_id: uuid.UUID = Field(foreign_key="users.id", index=True)
    orderer_type: str  # owner/tenant
    property_id: uuid.UUID = Field(foreign_key="properties.id", index=True)
    service_type: ServiceType = Field(index=True)
    status: ServiceOrderStatus = Field(
        default=ServiceOrderStatus.pending, index=True
    )
    scheduled_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    provider_id: Optional[str] = None  # 外包商 ID
    amount: float = Field(default=0)
    currency: str = Field(default="THB", max_length=3)
    payment_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="payments.id"
    )
    notes: Optional[str] = None
    rating: Optional[int] = Field(default=None, ge=1, le=5)
    # 服务评价：评分（rating）之外的文字反馈与评价时间，
    # reviewed_at 非空即为「已评价」，用于禁止重复评价
    review_comment: Optional[str] = None
    reviewed_at: Optional[datetime] = None
