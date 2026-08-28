"""领域事件发布任务 - 从 Outbox 表读取 pending 事件，发布到 Redis Streams"""
import json
import structlog
from datetime import datetime, timezone
from sqlmodel import Session, select

from app.celery_app import celery_app
from app.db import engine
from app.models.event import Event, EventStatus
from app.redis_client import get_redis_sync

logger = structlog.get_logger()

@celery_app.task(name="publish_pending_events", bind=True, max_retries=3)
def publish_pending_events(self):
    """每 10 秒执行一次，将 pending 事件发布到 Redis Streams"""
    with Session(engine) as session:
        events = session.exec(
            select(Event).where(Event.status == EventStatus.pending).limit(100)
        ).all()
        
        if not events:
            return {"published": 0}
        
        redis = get_redis_sync()
        published_count = 0
        
        for event in events:
            try:
                # 发布到 Redis Stream
                stream_name = f"events:{event.entity_type}"
                redis.xadd(stream_name, {
                    "event_type": event.event_type,
                    "entity_id": str(event.entity_id),
                    "payload": json.dumps(event.payload, default=str),
                    "event_id": str(event.id),
                })
                
                event.status = EventStatus.published
                event.published_at = datetime.now(timezone.utc)
                published_count += 1
            except Exception as e:
                logger.error("event_publish_failed", event_id=str(event.id), error=str(e))
                event.retry_count += 1
                if event.retry_count >= 3:
                    event.status = EventStatus.failed
        
        session.commit()
        logger.info("events_published", count=published_count)
        return {"published": published_count}
