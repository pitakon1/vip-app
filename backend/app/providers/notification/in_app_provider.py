"""站内信通知适配器。

直接将通知记录写入 notifications 表。recipient 为 user_id（字符串形式的 UUID）。
"""
import uuid
from datetime import datetime
from typing import Optional

from sqlmodel import Session

from app.db import engine
from app.models.notification import (
    Notification,
    NotificationChannel as ModelNotificationChannel,
    NotificationStatus,
)

from .base import (
    NotificationChannel,
    NotificationMessage,
    NotificationProvider,
    NotificationResult,
)


def _to_model_channel(channel: NotificationChannel) -> ModelNotificationChannel:
    """将适配器层枚举转换为模型层枚举（两者字符串值一致）。"""
    return ModelNotificationChannel(channel.value)


class InAppProvider(NotificationProvider):
    """站内信适配器：将通知持久化到数据库。"""

    channel = NotificationChannel.IN_APP

    def __init__(self, session: Optional[Session] = None):
        """
        :param session: 可选外部会话；若不提供则在 send 时内部创建并提交。
        """
        self._external_session = session

    def send(self, message: NotificationMessage) -> NotificationResult:
        try:
            user_id = uuid.UUID(message.recipient)
        except (ValueError, TypeError) as e:
            return NotificationResult(
                success=False,
                error_message=f"Invalid user_id for in_app notification: {message.recipient!r} ({e})",
            )

        related_entity_id: Optional[uuid.UUID] = None
        if message.related_entity_id:
            try:
                related_entity_id = uuid.UUID(message.related_entity_id)
            except (ValueError, TypeError):
                related_entity_id = None

        notification = Notification(
            user_id=user_id,
            channel=_to_model_channel(message.channel),
            template_key=message.template_key,
            recipient=message.recipient,
            subject=message.title or None,
            content=message.content or "",
            status=NotificationStatus.sent,
            sent_at=datetime.utcnow(),
            related_entity_type=message.related_entity_type,
            related_entity_id=related_entity_id,
        )

        try:
            if self._external_session is not None:
                self._external_session.add(notification)
                self._external_session.commit()
                self._external_session.refresh(notification)
            else:
                with Session(engine) as session:
                    session.add(notification)
                    session.commit()
                    session.refresh(notification)
        except Exception as e:
            return NotificationResult(
                success=False,
                error_message=f"Failed to persist in_app notification: {e}",
            )

        return NotificationResult(
            success=True,
            message_id=str(notification.id),
        )
