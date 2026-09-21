"""项目/楼盘模型。

对应设计文档中的楼盘/小区主数据。
"""
from datetime import datetime
from enum import Enum
from typing import Any, Dict, Optional
import uuid

from sqlalchemy import Column, JSON
from sqlmodel import Field

from .base import TimestampMixin


class Tenure(str, Enum):
    """产权类型。

    泰国特有的合规项（贝壳没有、但本地必需）：公寓可享永久产权且有「外国人
    49% 配额」限制，而土地/别墅外国人只能拿 30 年租赁权。这个字段直接决定
    一套房外国人能不能买、以什么形式持有。
    """

    freehold = "freehold"  # 永久产权
    leasehold = "leasehold"  # 租赁产权（通常 30 年）
    mixed = "mixed"  # 混合（同一项目不同楼栋不一致）


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
    # 开发商实体：替代原 developer 字符串（字符串无法聚合/成页/被收录）
    # 原 developer 字符串字段保留，供迁移期匹配与回填，后续可下线。
    developer_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="developers.id", index=True
    )
    total_units: Optional[int] = None
    completion_year: Optional[int] = None
    # 以下为小区 C 端详情页的必需参数（对标老站小区页的信息结构）
    total_buildings: Optional[int] = Field(default=None, description="楼盘栋数")
    total_floors: Optional[int] = Field(default=None, description="总楼层数")
    parking_spaces: Optional[int] = Field(default=None, description="停车位数")
    management_fee_per_sqm: Optional[float] = Field(
        default=None, description="物业管理费（泰铢/平米/月）"
    )
    open_date: Optional[datetime] = Field(default=None, description="开盘日期")
    avg_price: Optional[float] = Field(default=None, description="均价（泰铢/平米）")
    tenure: Optional[Tenure] = Field(default=None, index=True, description="产权类型")
    foreign_quota_pct: Optional[float] = Field(
        default=None, description="外国人可购配额百分比（公寓法定 49%）"
    )
    payment_plan: Optional[Dict[str, Any]] = Field(
        default=None,
        sa_column=Column(
            JSON, nullable=True, comment="期房付款方案：定金/首付比例/尾款比例"
        ),
    )
    amenities: Optional[Dict[str, Any]] = Field(
        default=None,
        sa_column=Column(JSON, nullable=True, comment="配套设施 JSON"),
    )
