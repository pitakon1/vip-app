"""降价提醒服务：检测价格下调并生成通知。

说明：
- 本模块不构建调度器。调用方（例如价格更新端点，或后续的 Celery 定时任务）
  在房源价格发生变动后，调用 :func:`notify_if_price_dropped` 即可自动为满足
  条件的订阅生成通知。
- 每个订阅只触发一次（触发后写入 notified_at，不再重复）。
"""
import uuid
from typing import Optional

from sqlmodel import Session, select

from app.models import Notification, NotificationChannel, NotificationStatus, PriceAlert


def notify_if_price_dropped(
    session: Session,
    new_price: float,
    property_id: Optional[uuid.UUID] = None,
    listing_id: Optional[uuid.UUID] = None,
) -> int:
    """为价格已下调到低于订阅价的活跃订阅生成通知。

    参数：
        session: 数据库会话（由调用方负责 commit）。
        new_price: 下调后的新价格。
        property_id: 目标房源 id；与 listing_id 至少提供一个用于筛选订阅。
        listing_id: 目标上架单 id（可选，若提供则仅匹配该单的订阅）。

    返回：
        触发通知的订阅数量。
    """
    if property_id is None and listing_id is None:
        return 0

    conditions = [PriceAlert.deleted_at.is_(None), PriceAlert.notified_at.is_(None)]
    if property_id is not None:
        conditions.append(PriceAlert.property_id == property_id)
    if listing_id is not None:
        conditions.append(PriceAlert.listing_id == listing_id)

    alerts = list(session.exec(select(PriceAlert).where(*conditions)).all())
    hit = [a for a in alerts if a.subscribed_price is not None and a.subscribed_price > new_price]

    for alert in hit:
        alert.notified_at = alert.updated_at
        alert.version = (alert.version or 1) + 1
        session.add(
            Notification(
                user_id=alert.user_id,
                channel=NotificationChannel.in_app,
                recipient=str(alert.user_id),
                subject="price_drop",
                content="你关注的房源降价了",
                template_key="price_alert.price_drop",
                status=NotificationStatus.queued,
                related_entity_type="property",
                related_entity_id=alert.property_id,
            )
        )
        session.add(alert)

    return len(hit)