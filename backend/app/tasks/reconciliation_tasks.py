"""支付对账任务 - 定时对账，检查异常"""
from datetime import datetime, timedelta, timezone
from sqlmodel import Session, select

from app.celery_app import celery_app
from app.db import engine
from app.models.payment import Payment, PaymentStatus

@celery_app.task(name="reconcile_payments")
def reconcile_payments():
    """每小时执行，对账处理中的支付"""
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=24)
    
    with Session(engine) as session:
        # 查找超过 24 小时仍在 processing 的支付
        stuck_payments = session.exec(
            select(Payment).where(
                Payment.status == PaymentStatus.processing,
                Payment.created_at < cutoff,
            )
        ).all()
        
        for payment in stuck_payments:
            # 标记为需要人工检查
            payment.failure_reason = "Stuck in processing for >24h, needs manual review"
            # 不直接改状态，留给人工处理
        
        session.commit()
        return {"stuck_payments": len(stuck_payments)}

@celery_app.task(name="daily_payment_report")
def daily_payment_report():
    """每天 23:00 执行，生成每日收款报告"""
    now = datetime.now(timezone.utc)
    start = now.replace(hour=0, minute=0, second=0)
    
    with Session(engine) as session:
        from sqlalchemy import func
        
        total = session.exec(
            select(func.count(Payment.id)).where(
                Payment.status == PaymentStatus.succeeded,
                Payment.paid_at >= start,
            )
        ).one()
        
        amount = session.exec(
            select(func.sum(Payment.amount)).where(
                Payment.status == PaymentStatus.succeeded,
                Payment.paid_at >= start,
            )
        ).one()
        
        return {"date": start.date().isoformat(), "count": total, "total_amount": amount or 0}
