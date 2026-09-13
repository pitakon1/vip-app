"""即时聊天模型。

客户 / 房东可直接咨询工作人员（agent/admin/owner/tenant 任意组合）。
实时推送通过 WebSocket（/ws/chat/{conversation_id}），历史记录落库。
"""
import uuid
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from sqlalchemy import Column, JSON
from sqlmodel import Field

from .base import TimestampMixin


class MessageType(str, Enum):
    text = "text"
    image = "image"
    file = "file"
    system = "system"


class Conversation(TimestampMixin, table=True):
    """会话表。participant_ids 存参与用户 id 列表。"""

    __tablename__ = "chats"

    title: Optional[str] = None
    # 关联对象（可选）：如房源 property / 租约 lease
    entity_type: Optional[str] = None
    entity_id: Optional[uuid.UUID] = None
    participant_ids: List[Any] = Field(
        default_factory=list, sa_column=Column(JSON, nullable=False, default=list)
    )
    created_by: uuid.UUID = Field(foreign_key="users.id")


class Message(TimestampMixin, table=True):
    """消息表。"""

    __tablename__ = "chat_messages"

    conversation_id: uuid.UUID = Field(foreign_key="chats.id", index=True)
    sender_id: uuid.UUID = Field(foreign_key="users.id")
    body: str = ""
    message_type: MessageType = Field(default=MessageType.text, index=True)
    attachments: Optional[Dict[str, Any]] = Field(
        default=None, sa_column=Column(JSON, nullable=True)
    )
    read_at: Optional[datetime] = None
    # 服务端冗余分片：接收方是否已读（可扩展为每个接收者一条）
    recipients_read: Optional[List[Any]] = Field(
        default=None, sa_column=Column(JSON, nullable=True)
    )