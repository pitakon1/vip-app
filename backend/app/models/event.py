"""领域事件模型。

对应设计文档中的领域事件存储主数据，用于事件溯源与异步任务投递。
"""
from datetime import datetime
from enum import Enum
from typing import Any, Dict, Optional
import uuid

from sqlalchemy import Column, JSON
from sqlmodel import Field

from .base import TimestampMixin


class EventStatus(str, Enum):
    """事件状态枚举。"""

    pending = "pending"
    published = "published"
    failed = "failed"


class Event(TimestampMixin, table=True):
    """领域事件表。"""

    __tablename__ = "events"

    event_type: str = Field(index=True)  # lease.signed, payment.received 等
    entity_type: str = Field(index=True)
    entity_id: uuid.UUID = Field(index=True)
    payload: Dict[str, Any] = Field(sa_column=Column(JSON, nullable=False))
    status: EventStatus = Field(default=EventStatus.pending, index=True)
    published_at: Optional[datetime] = None
    retry_count: int = Field(default=0)
