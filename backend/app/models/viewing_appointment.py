"""预约看房模型。

对应设计文档中访客转化漏斗的核心环节：访客（潜在租客）对意向房源
发起看房预约，员工接单并确认，形成「找房 → 预约 → 看房 → 成交」闭环。
"""
from datetime import datetime
from enum import Enum
from typing import Optional
import uuid

from sqlmodel import Field

from .base import TimestampMixin


class ViewingStatus(str, Enum):
    """预约看房状态枚举。"""

    pending = "pending"  # 已提交，待员工确认
    confirmed = "confirmed"  # 已确认，待看房
    completed = "completed"  # 看房完成
    cancelled = "cancelled"  # 已取消
    no_show = "no_show"  # 爽约


class ViewingAppointment(TimestampMixin, table=True):
    """预约看房表。

    - visitor_* 字段用于未注册访客（无需登录也能提交预约）。
    - requester_user_id 记录已登录用户的关联，便于复用线索。
    - 员工确认后绑定 assigned_to 并生成看房任务。
    """

    __tablename__ = "viewing_appointments"

    property_id: uuid.UUID = Field(foreign_key="properties.id", index=True)
    # 已登录用户（租客/访客）可关联；
    requester_user_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="users.id", index=True
    )
    # 未登录访客信息
    visitor_name: Optional[str] = None
    visitor_phone: Optional[str] = None
    visitor_email: Optional[str] = None

    scheduled_at: datetime = Field(index=True)
    notes: Optional[str] = None
    status: ViewingStatus = Field(default=ViewingStatus.pending, index=True)
    assigned_to: Optional[uuid.UUID] = Field(
        default=None, foreign_key="employees.id"
    )
    # 关联线索（如登记了意向，方便 CRM 跟踪）
    lead_id: Optional[uuid.UUID] = Field(default=None, foreign_key="leads.id")
    completed_at: Optional[datetime] = None
    cancel_reason: Optional[str] = None