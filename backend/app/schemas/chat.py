"""聊天相关响应模型。

声明会话与消息的对外契约，避免把 `participant_ids` 之外的内部字段
（如 `recipients_read` 快照、软删除时间）意外暴露给客户端。
"""
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class ConversationOut(BaseModel):
    """会话摘要。"""

    id: str
    title: Optional[str] = None
    entity_type: Optional[str] = None
    entity_id: Optional[str] = None
    participant_ids: List[str] = Field(default_factory=list)
    created_at: str


class MessageOut(BaseModel):
    """单条消息。"""

    id: str
    conversation_id: str
    sender_id: str
    body: str
    message_type: str
    attachments: Optional[Dict[str, Any]] = None
    read_at: Optional[str] = None
    created_at: str