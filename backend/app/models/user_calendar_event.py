"""用户自定义日程事件模型。

供三端日历聚合展示用户自行添加的自由日程（区别于领域事件 Event）：
- title   自由文本，如「带 XXX 客户看房」
- start_at 事件开始时间
- 按 user_id 隔离（本人可见 / 可改 / 可删），软删除
"""
from datetime import datetime
from typing import Optional
import uuid

from sqlmodel import Field

from .base import TimestampMixin


class UserCalendarEvent(TimestampMixin, table=True):
    """用户日程事件表。"""

    __tablename__ = "user_calendar_events"

    user_id: uuid.UUID = Field(foreign_key="users.id", index=True)
    title: str
    start_at: datetime = Field(index=True)
    end_at: Optional[datetime] = None
    all_day: bool = Field(default=False)
    note: Optional[str] = None