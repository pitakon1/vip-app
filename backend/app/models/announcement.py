"""小区公告模型。

对应「我家 - 小区公告」：物业/员工按楼盘发布公告，租客按生效租约所在楼盘读取。
project_id 为空表示平台级公告（对所有小区可见）。
"""
import uuid
from datetime import datetime
from enum import Enum
from typing import Optional

from sqlmodel import Field

from .base import TimestampMixin


class AnnouncementCategory(str, Enum):
    """公告分类。"""

    notice = "notice"  # 通知
    maintenance = "maintenance"  # 维修/停水停电
    event = "event"  # 社区活动
    rule = "rule"  # 管理规定


class Announcement(TimestampMixin, table=True):
    """小区公告表。"""

    __tablename__ = "announcements"

    # 为空表示平台级公告；非空表示仅该楼盘可见
    project_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="projects.id", index=True
    )
    title: str = Field(max_length=200, index=True)
    content: str
    category: AnnouncementCategory = Field(
        default=AnnouncementCategory.notice, index=True
    )
    is_pinned: bool = Field(default=False, index=True)
    published_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    expires_at: Optional[datetime] = Field(default=None, index=True)
    # 归属合作公司：NULL = 平台公告（所有公司可见）
    partner_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="partners.id", index=True
    )
    publisher_user_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="users.id"
    )
    publisher_name: Optional[str] = Field(default=None, max_length=100)
