"""房源收藏模型。

支持用户（租客/访客）收藏意向房源，构成「找房 → 收藏 → 预约 → 看房」意愿沉淀（v1.9）。
"""
import uuid

from sqlmodel import Field, UniqueConstraint

from .base import TimestampMixin


class Favorite(TimestampMixin, table=True):
    """房源收藏表。"""

    __tablename__ = "favorites"
    __table_args__ = (
        UniqueConstraint("user_id", "property_id", name="uq_favorite_user_property"),
    )

    user_id: uuid.UUID = Field(foreign_key="users.id", index=True)
    property_id: uuid.UUID = Field(foreign_key="properties.id", index=True)
    notes: str = Field(default="", max_length=200)