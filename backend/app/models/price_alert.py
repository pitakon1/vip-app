"""降价提醒订阅模型。

支持用户（租客/访客）订阅指定房源的「降价通知」：当该房源（property / listing）
价格后续下调时（subscribed_price > 新价格），触发通知（见 services/price_alert.py 帮助函数）。
"""
import uuid
from datetime import datetime
from typing import Optional

from sqlmodel import Field, UniqueConstraint

from .base import TimestampMixin


class PriceAlert(TimestampMixin, table=True):
    """降价提醒订阅表。"""

    __tablename__ = "price_alerts"
    __table_args__ = (
        UniqueConstraint("user_id", "property_id", name="uq_price_alert_user_property"),
    )

    user_id: uuid.UUID = Field(foreign_key="users.id", index=True)
    property_id: uuid.UUID = Field(foreign_key="properties.id", index=True)
    # 可选：订阅时针对的具体上架单（租单或售单）
    listing_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="listings.id", index=True
    )
    # 订阅时捕获的当前价格（该 listing/property 的对应价格字段，按 listing_type 取 rent/sell）
    subscribed_price: Optional[float] = Field(default=None)
    currency: str = Field(default="THB", max_length=3)
    # 已发送降价通知的时间：非空表示该订阅已触发过通知，后续不再重复触发
    notified_at: Optional[datetime] = Field(default=None, index=True)