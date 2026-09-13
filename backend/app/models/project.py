"""项目/楼盘模型。

对应设计文档中的楼盘/小区主数据。
"""
from typing import Any, Dict, Optional

from sqlalchemy import Column, JSON
from sqlmodel import Field

from .base import TimestampMixin


class Project(TimestampMixin, table=True):
    """项目/楼盘表。"""

    __tablename__ = "projects"

    name: str = Field(index=True)
    address: str
    district: Optional[str] = Field(default=None, index=True)
    city: Optional[str] = Field(default=None, index=True)
    province: Optional[str] = Field(default=None, index=True, description="省/府/州")
    country: Optional[str] = Field(default=None)
    nearest_subway: Optional[str] = Field(
        default=None, index=True, description="最近地铁站/轻轨站"
    )
    developer: Optional[str] = None
    property_management_company: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    total_units: Optional[int] = None
    completion_year: Optional[int] = None
    amenities: Optional[Dict[str, Any]] = Field(
        default=None,
        sa_column=Column(JSON, nullable=True, comment="配套设施 JSON"),
    )
