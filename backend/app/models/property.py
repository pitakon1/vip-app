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


class DedupeType(str, Enum):
    """去重档案类型：房源唯一档案定位方式。"""

    project = "project"  # 结构化唯一键：楼盘 project_id + 楼栋 + 房号
    free_address = "free_address"  # 自由地址 + 房号归一化哈希
    none = "none"  # 未定位（不参与去重）


class Orientation(str, Enum):
    """朝向。

    泰国西晒极强（下午西向房间温度显著高于其他朝向），朝向是租客与买家的
    硬决策因素，老站把它做成房源列表的筛选项，原模型缺失。
    """

    north = "north"
    south = "south"
    east = "east"
    west = "west"
    northeast = "northeast"
    northwest = "northwest"
    southeast = "southeast"
    southwest = "southwest"


class Decoration(str, Enum):
    """装修状况。

    替代原来 `furnished: bool` 的表达力不足：一个布尔无法区分
    「毛坯 / 简装 / 精装 / 豪装 / 带家具家电」，而这几档直接影响租金定价。
    """

    bare = "bare"  # 毛坯
    simple = "simple"  # 简装
    standard = "standard"  # 精装
    luxury = "luxury"  # 豪装
    fully_furnished = "fully_furnished"  # 带家具家电


class Property(TimestampMixin, table=True):
    """房源表。"""

    __tablename__ = "properties"

    project_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="projects.id"
    )
    owner_id: uuid.UUID = Field(foreign_key="owners.id", index=True)
    # 创建人（房源归属人）：记录是哪位员工把房源录进来的，用于「管理员看全部、
    # 销售/经纪只看自己录的」的数据隔离。历史房源该列为 NULL，仅管理员可见，
    # 管理员可通过指派接口补归属。指向 users.id 而非 employees.id——admin 账号
    # 可能没有员工档案（如超管），用 users.id 才能覆盖全部角色。
    created_by: Optional[uuid.UUID] = Field(
        default=None, foreign_key="users.id", index=True
    )
    room_number: str = Field(max_length=50)
    floor: Optional[int] = None
    building: Optional[str] = None
    address: str
    # 去重档案字段：同一套房在平台上一份档案（唯一键约束），多份上架单
    dedupe_type: DedupeType = Field(default=DedupeType.none)
    dedupe_key: Optional[str] = Field(
        default=None, max_length=200, index=True,
        unique=True, sa_column_kwargs={"nullable": True},
        description="规范化唯一键（project|building|room 或 地址哈希），唯一索引防重复档案",
    )
    address_norm: Optional[str] = Field(
        default=None, max_length=300, index=True, description="规范化地址（供相似度比对）"
    )
    property_type: str = Field(default="apartment")  # apartment/house/condo/commercial
    # 租金仅租售混合档案中的租侧有值；纯售房源允许为空（租侧展示与价格筛选按 NULL 处理）
    monthly_rent: Optional[float] = Field(default=None)
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
    # 以下三项为 C 端决策必需字段（对标贝壳 / 补齐老站口径）
    orientation: Optional[Orientation] = Field(default=None, index=True)
    decoration: Optional[Decoration] = Field(default=None, index=True)
    amenities: Optional[List[str]] = Field(
        default=None,
        sa_column=Column(JSON, nullable=True, comment="配套设施标签（东南亚口径，如空调/泳池/健身房/停车位/电梯/阳台）"),
        description="配套设施多选标签，前端筛选与详情展示共用",
    )
    listing_no: Optional[str] = Field(
        default=None, max_length=32, index=True,
        description="对外房源编号（如 FY0027536），客服与经纪人对外沟通的引用号",
    )
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
