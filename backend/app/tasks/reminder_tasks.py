"""定时提醒任务 - 租金到期、合同到期提醒"""
from datetime import datetime, timedelta, timezone
from sqlmodel import Session, select

from app.celery_app import celery_app
from app.db import engine
from app.models.lease import Lease, LeaseStatus
from app.models.payment import Payment, PaymentStatus, PaymentType
from app.models.notification import Notification, NotificationChannel, NotificationStatus
from app.core.events import publish_event
import uuid

@celery_app.task(name="check_expiring_leases")
def check_expiring_leases():
    """每天 9:00 执行，检查即将到期的合同（30天/7天/1天前）"""
    now = datetime.now(timezone.utc)
    
    with Session(engine) as session:
        for days_before in [30, 7, 1]:
            target_date = now + timedelta(days=days_before)
            start = target_date.replace(hour=0, minute=0, second=0)
            end = target_date.replace(hour=23, minute=59, second=59)
            
            leases = session.exec(
                select(Lease).where(
                    Lease.end_date >= start,
                    Lease.end_date <= end,
                    Lease.status == LeaseStatus.active,
                )
            ).all()
            
            for lease in leases:
                # 创建通知记录
                notif = Notification(
                    id=uuid.uuid4(),
                    user_id=lease.tenant_id,  # 需要通过 tenant 找到 user_id
                    channel=NotificationChannel.in_app,
                    template_key="lease_expiring",
                    recipient=str(lease.tenant_id),
                    subject=f"您的租约将在 {days_before} 天后到期",
                    content=f"租约编号 {lease.id} 将在 {days_before} 天后到期，请联系我们续约。",
                    status=NotificationStatus.queued,
                    related_entity_type="lease",
                    related_entity_id=str(lease.id),
                )
                session.add(notif)
                
                # 发布领域事件
                publish_event(session, "lease.expiring", "lease", lease.id, {
                    "lease_id": str(lease.id),
                    "days_remaining": days_before,
                    "end_date": lease.end_date.isoformat(),
                })
            
            session.commit()
    
    return {"checked": True}

@celery_app.task(name="check_upcoming_rent_payments")
def check_upcoming_rent_payments():
    """每天 9:00 执行，检查即将到期的租金（7天/3天/1天前）"""
    now = datetime.now(timezone.utc)
    
    with Session(engine) as session:
        for days_before in [7, 3, 1]:
            target_date = now + timedelta(days=days_before)
            start = target_date.replace(hour=0, minute=0, second=0)
            end = target_date.replace(hour=23, minute=59, second=59)
            
            payments = session.exec(
                select(Payment).where(
                    Payment.due_date >= start,
                    Payment.due_date <= end,
                    Payment.status == PaymentStatus.pending,
                    Payment.payment_type == PaymentType.rent,
                )
            ).all()
            
            for payment in payments:
                notif = Notification(
                    id=uuid.uuid4(),
                    user_id=payment.payer_id,
                    channel=NotificationChannel.in_app,
                    template_key="rent_due_reminder",
                    recipient=str(payment.payer_id),
                    subject=f"租金缴纳提醒 - {days_before}天后到期",
                    content=f"您的租金 {payment.amount} {payment.currency} 将在 {days_before} 天后到期，请及时缴纳。",
                    status=NotificationStatus.queued,
                    related_entity_type="payment",
                    related_entity_id=str(payment.id),
                )
                session.add(notif)
            
            session.commit()
    
    return {"checked": True}
