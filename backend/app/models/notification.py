"""通知记录模型。

对应设计文档中的通知/消息推送主数据，覆盖多渠道（应用内/推送/邮件/短信/IM）。
"""
from datetime import datetime
from enum import Enum
from typing import Optional
import uuid

from sqlmodel import Field

from .base import TimestampMixin


class NotificationChannel(str, Enum):
    """通知渠道枚举。"""

    in_app = "in_app"
    push = "push"
    email = "email"
    sms = "sms"
    wechat = "wechat"
    line = "line"
    whatsapp = "whatsapp"
    facebook = "facebook"


class NotificationStatus(str, Enum):
    """通知状态枚举。"""

    queued = "queued"
    sent = "sent"
    delivered = "delivered"
    failed = "failed"
    read = "read"


class Notification(TimestampMixin, table=True):
    """通知记录表。"""

    __tablename__ = "notifications"

    user_id: uuid.UUID = Field(foreign_key="users.id", index=True)
    channel: NotificationChannel = Field(index=True)
    template_key: Optional[str] = Field(default=None, index=True)
    recipient: str
    subject: Optional[str] = None
    content: str
    status: NotificationStatus = Field(
        default=NotificationStatus.queued, index=True
    )
    sent_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    read_at: Optional[datetime] = None
    retry_count: int = Field(default=0)
    error_message: Optional[str] = None
    related_entity_type: Optional[str] = None
    related_entity_id: Optional[uuid.UUID] = Field(default=None, index=True)
