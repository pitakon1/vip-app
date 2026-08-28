"""领域事件 Outbox 模式：写入 events 表，由 Celery 任务异步发布到 Redis Streams"""
from typing import Optional
from sqlmodel import Session
import structlog
import uuid
import json

logger = structlog.get_logger()

def publish_event(
    session: Session,
    event_type: str,
    entity_type: str,
    entity_id: uuid.UUID,
    payload: dict,
):
    """将领域事件写入 Outbox 表（事务内完成）"""
    from ..models.event import Event, EventStatus
    
    event = Event(
        id=uuid.uuid4(),
        event_type=event_type,
        entity_type=entity_type,
        entity_id=entity_id,
        payload=payload,
        status=EventStatus.pending,
    )
    session.add(event)
    logger.info("event_published", event_type=event_type, 
                entity_type=entity_type, entity_id=str(entity_id))
