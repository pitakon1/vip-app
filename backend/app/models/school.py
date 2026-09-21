"""学校模型（学区找房的数据底座）。

为什么学校要独立建库、而不是作为房源上的一个字符串字段：
泰国买房的**第一决策因子是国际学校**（而非行政区划划片）。老站把它做成
「学校独立页 + 房源详情页列周边学校实际距离 + 学校页反查附近房源」三层结构，
这是它最值钱的自然搜索流量入口。

因此：学校是一套**会持续积累的字典**，房源/楼盘只存经纬度，距离实时计算
（复用 `app.providers.geo.haversine_km`），不落冗余关联表。
"""
from enum import Enum
from typing import Any, List, Optional

from sqlalchemy import Column, JSON
from sqlmodel import Field

from .base import TimestampMixin


class SchoolStage(str, Enum):
    """办学阶段。"""

    kindergarten = "kindergarten"  # 幼儿园
    primary = "primary"  # 小学
    secondary = "secondary"  # 中学
    high_school = "high_school"  # 高中
    university = "university"  # 大学
    k12 = "k12"  # 一贯制（幼小中高）


class SchoolCurriculum(str, Enum):
    """课程体系。家长选校的核心维度，也是筛选项的取值来源。"""

    ib = "ib"  # IB 国际文凭
    american = "american"  # 美制
    british = "british"  # 英制
    french = "french"  # 法式
    german = "german"  # 德式
    japanese = "japanese"  # 日式
    thai = "thai"  # 泰制
    bilingual = "bilingual"  # 双语
    other = "other"


class School(TimestampMixin, table=True):
    """学校表。"""

    __tablename__ = "schools"

    name: str = Field(index=True, description="学校名称（中文/常用名）")
    name_en: Optional[str] = Field(default=None, index=True, description="英文名")
    name_th: Optional[str] = Field(default=None, description="泰文名")
    stage: SchoolStage = Field(
        default=SchoolStage.k12, index=True, description="办学阶段"
    )
    curriculum: Optional[SchoolCurriculum] = Field(
        default=None, index=True, description="课程体系"
    )

    # 地址与坐标：坐标是学区距离计算的唯一依据，建索引
    address: Optional[str] = None
    district: Optional[str] = Field(default=None, index=True, description="区/县")
    city: Optional[str] = Field(default=None, index=True)
    province: Optional[str] = Field(default=None, index=True)
    country: Optional[str] = Field(default="Thailand")
    lat: Optional[float] = Field(default=None, index=True)
    lng: Optional[float] = Field(default=None, index=True)

    # 学校档案
    phone: Optional[str] = Field(default=None, max_length=50)
    email: Optional[str] = Field(default=None, max_length=200)
    website: Optional[str] = Field(default=None, max_length=500)
    student_count: Optional[int] = Field(default=None, description="在读人数")
    age_range: Optional[str] = Field(
        default=None, max_length=50, description="招生年龄区间，如 2-18 岁"
    )
    tuition_range: Optional[str] = Field(
        default=None, max_length=100, description="学费区间（原文展示，不参与计算）"
    )
    description: Optional[str] = Field(default=None, description="学校介绍（富文本）")
    cover_url: Optional[str] = Field(default=None, max_length=500)
    photos: Optional[List[Any]] = Field(
        default=None, sa_column=Column(JSON, nullable=True, comment="照片 URL 列表")
    )

    # 对外展示排序权重：运营可手动置顶重点学校
    sort_weight: int = Field(default=0, index=True, description="排序权重，越大越靠前")
