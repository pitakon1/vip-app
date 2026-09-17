"""房源模型。

对应设计文档中的房源主数据，关联项目与业主。
"""
from datetime import datetime
from enum import Enum
from typing import Any, List, Optional
import uuid

from sqlalchemy import Column, JSON
from sqlmodel import Field

from .base import TimestampMixin


class PropertyStatus(str, Enum):
    """房源租态枚举。"""

    vacant = "vacant"
    rented = "rented"
    renewing = "renewing"
    maintenance = "maintenance"


class Property(TimestampMixin, table=True):
    """房源表。"""

    __tablename__ = "properties"

    project_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="projects.id"
    )
    owner_id: uuid.UUID = Field(foreign_key="owners.id", index=True)
    room_number: str = Field(max_length=50)
    floor: Optional[int] = None
    building: Optional[str] = None
    address: str
    property_type: str = Field(default="apartment")  # apartment/house/condo/commercial
    monthly_rent: float = Field(gt=0)
    currency: str = Field(default="THB", max_length=3)
    deposit_amount: float = Field(default=0)
    deposit_months: int = Field(default=2)
    size_sqm: Optional[float] = None
    bedrooms: Optional[int] = None
    bathrooms: Optional[int] = None
    status: PropertyStatus = Field(default=PropertyStatus.vacant, index=True)
    description: Optional[str] = None
    photos: Optional[List[Any]] = Field(
        default=None, sa_column=Column(JSON, nullable=True, comment="照片 URL 列表")
    )
    furnished: bool = Field(default=False)
    available_from: Optional[datetime] = None
    video_url: Optional[str] = Field(
        default=None, max_length=500, description="视频看房地址（可为站内 /uploads 或外部链接）"
    )

    @property
    def display_name(self) -> str:
        """房源展示名：房号优先，其次地址。

        房源没有 `title` 列，历史代码里多处直接读 `property.title` 会抛
        AttributeError（接口 500）。统一从这里取，避免各处自行拼装。
        """
        return self.room_number or self.address or ""
