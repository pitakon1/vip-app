"""降价提醒服务：检测价格下调并生成通知。

说明：
- 本模块不构建调度器。调用方（例如价格更新端点，或后续的 Celery 定时任务）
  在房源价格发生变动后，调用 :func:`notify_if_price_dropped` 即可自动为满足
  条件的订阅生成通知。
- 每个订阅只触发一次（触发后写入 notified_at，不再重复）。

**不要手动维护 `version`**：`app.core.concurrency.install_version_bumper()`
注册了全局 `before_update` 事件，任何 UPDATE 都会自动把 `version` 自增 1。
此处再手写一次会导致每次通知 `version` 跳 2，且基数与全局口径（`or 0`）不一致。
"""
import math
import uuid
from datetime import datetime
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

    # 价格缺失必须先挡住，再谈"是否降价"。
    # `subscribed_price > new_price` 在 new_price 为 None/0/NaN 时对任何订阅都成立，
    # 于是房源价格字段被清空、漏填或脏数据时，会给**所有**订阅者群发一遍"降价了"。
    # 把数据缺失误报成业务事件，比不通知更糟——用户会据此判断市场。
    if new_price is None:
        return 0
    try:
        new_price = float(new_price)
    except (TypeError, ValueError):
        return 0
    if not math.isfinite(new_price) or new_price <= 0:
        return 0

    conditions = [PriceAlert.deleted_at.is_(None), PriceAlert.notified_at.is_(None)]
    if property_id is not None:
        conditions.append(PriceAlert.property_id == property_id)
    if listing_id is not None:
        conditions.append(PriceAlert.listing_id == listing_id)

    alerts = list(session.exec(select(PriceAlert).where(*conditions)).all())
    hit = [a for a in alerts if a.subscribed_price is not None and a.subscribed_price > new_price]

    for alert in hit:
        # 必须是「现在」而不是 alert.updated_at——后者是该记录的上次更新时间，
        # 语义上完全不等于「已发出通知的时间」，且 TTL 判定/排查都会读到错误时间。
        alert.notified_at = datetime.utcnow()
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