"""通勤测算缓存（Google Routes API 结果）。

按「起点坐标 / 终点坐标 / 出行方式」归一化成 `cache_key`（sha256），
避免同一房源 + 同一工作地点被重复计费调用。默认 24h 过期，
由 `COMMUTE_CACHE_TTL_SECONDS` 控制；过期后覆盖同一条记录。
"""
from datetime import datetime
from typing import Any, Dict

from sqlalchemy import JSON, Column, String
from sqlmodel import Field

from .base import TimestampMixin


class CommuteCache(TimestampMixin, table=True):
    """通勤结果缓存表。"""

    __tablename__ = "commute_cache"

    cache_key: str = Field(
        sa_column=Column(String(64), nullable=False, unique=True, index=True)
    )
    mode: str = Field(
        default="transit",
        sa_column=Column(String(16), nullable=False, default="transit"),
        description="transit | driving | walking | bicycling",
    )
    payload: Dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSON, nullable=False),
        description="完整的通勤结果（含线路/站点/时长/距离）",
    )
    expires_at: datetime = Field(index=True)
