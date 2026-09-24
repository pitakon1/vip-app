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
    # 时区配置：业务市场在泰国，统一用曼谷本地时间。
    # 这会让下方所有 `crontab(hour=...)` 定时任务按曼谷本地时间触发——
    # 此前配的是 Asia/Shanghai，实际比曼谷早 1 小时，催缴/报表/备份都会提前一小时跑。
    timezone="Asia/Bangkok",
    enable_utc=True,
    # 任务执行配置
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    # 结果过期时间（秒）
    result_expires=86400,
    # 任务路由：按任务名路由到队列（原配置按 `app.tasks.payment.*` 等模块名匹配，
    # 但实际任务名是自定义的、模块名也不存在，导致路由配置从未生效）。
    # 与 docker-compose 中 worker 的 `-Q default,notification,maintenance` 保持一致。
    task_routes={
        "publish_pending_events": {"queue": "notification"},
        "send_pending_notifications": {"queue": "notification"},
        "check_expiring_leases": {"queue": "notification"},
        "check_upcoming_rent_payments": {"queue": "notification"},
        "accrue_late_fees": {"queue": "notification"},
        "reconcile_payments": {"queue": "default"},
        "daily_payment_report": {"queue": "default"},
        "daily_backup_sync": {"queue": "maintenance"},
        "revalidate_listings": {"queue": "notification"},
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
    'accrue-late-fees': {
        'task': 'accrue_late_fees',
        'schedule': crontab(hour=9, minute=30),  # 每天 9:30，晚于催缴提醒
    },
    'reconcile-payments': {
        'task': 'reconcile_payments',
        'schedule': 3600.0,  # 每小时
    },
    'daily-payment-report': {
        'task': 'daily_payment_report',
        'schedule': crontab(hour=23, minute=0),
    },
    'daily-backup-sync': {
        'task': 'daily_backup_sync',
        'schedule': crontab(hour=2, minute=0),  # 每天凌晨 2:00 数据备份/同步
    },
    'revalidate-listings': {
        'task': 'revalidate_listings',
        'schedule': crontab(hour=10, minute=0),  # 每天 10:00 真房源保鲜复验
    },
}

# 自动发现任务模块
celery_app.autodiscover_tasks(["app.tasks"])
