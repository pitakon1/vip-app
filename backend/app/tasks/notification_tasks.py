"""通知发送任务 - 处理 queued 通知，通过各渠道发送"""
from datetime import datetime
from sqlmodel import Session, select

from app.celery_app import celery_app
from app.db import engine
from app.models.notification import Notification, NotificationStatus
from app.providers.notification import notification_router, NotificationMessage, NotificationChannel

@celery_app.task(name="send_pending_notifications", bind=True, max_retries=3)
def send_pending_notifications(self):
    """每 30 秒执行一次，发送 queued 通知"""
    with Session(engine) as session:
        notifications = session.exec(
            select(Notification).where(
                Notification.status == NotificationStatus.queued
            ).limit(50)
        ).all()
        
        if not notifications:
            return {"sent": 0}
        
        sent_count = 0
        for notif in notifications:
            try:
                message = NotificationMessage(
                    channel=NotificationChannel(notif.channel),
                    recipient=notif.recipient,
                    title=notif.subject or "",
                    content=notif.content,
                    template_key=notif.template_key,
                )
                result = notification_router.send(message)
                
                if result.success:
                    notif.status = NotificationStatus.sent
                    notif.message_id = result.message_id
                    notif.sent_at = datetime.utcnow()
                    sent_count += 1
                else:
                    notif.retry_count += 1
                    notif.error_message = result.error_message
                    if notif.retry_count >= 3:
                        notif.status = NotificationStatus.failed
            except Exception as e:
                notif.retry_count += 1
                notif.error_message = str(e)
                if notif.retry_count >= 3:
                    notif.status = NotificationStatus.failed
        
        session.commit()
        return {"sent": sent_count}
