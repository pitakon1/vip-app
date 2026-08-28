"""Celery 应用配置模块。

创建 Celery 实例，从 config 读取 broker 和 backend 配置。
"""
from celery import Celery
from celery.schedules import crontab

from app.config import settings

# 创建 Celery 实例
celery_app = Celery(
    "rental_system",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=["app.tasks"],
)

# Celery 配置
celery_app.conf.update(
    # 序列化配置
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    # 时区配置
    timezone="Asia/Shanghai",
    enable_utc=True,
    # 任务执行配置
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    # 结果过期时间（秒）
    result_expires=86400,
    # 任务路由（按模块路由到不同队列）
    task_routes={
        "app.tasks.payment.*": {"queue": "payment"},
        "app.tasks.notification.*": {"queue": "notification"},
        "app.tasks.ai.*": {"queue": "ai"},
    },
    task_default_queue="default",
)

# Celery Beat 定时任务调度
celery_app.conf.beat_schedule = {
    'publish-pending-events': {
        'task': 'publish_pending_events',
        'schedule': 10.0,  # 每 10 秒
    },
    'send-pending-notifications': {
        'task': 'send_pending_notifications',
        'schedule': 30.0,  # 每 30 秒
    },
    'check-expiring-leases': {
        'task': 'check_expiring_leases',
        'schedule': crontab(hour=9, minute=0),  # 每天 9:00
    },
    'check-upcoming-rent-payments': {
        'task': 'check_upcoming_rent_payments',
        'schedule': crontab(hour=9, minute=0),
    },
    'reconcile-payments': {
        'task': 'reconcile_payments',
        'schedule': 3600.0,  # 每小时
    },
    'daily-payment-report': {
        'task': 'daily_payment_report',
        'schedule': crontab(hour=23, minute=0),
    },
}

# 自动发现任务模块
celery_app.autodiscover_tasks(["app.tasks"])
