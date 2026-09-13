"""售房挂牌模型（买卖交易闭环）。"""
from datetime import date
from enum import Enum
from typing import Optional
import uuid

from sqlmodel import Field

from .base import TimestampMixin


class SaleType(str, Enum):
    """挂牌类型。"""

    buy = "buy"          # 挂买
    sell = "sell"        # 挂卖


class ListingStatus(str, Enum):
    """挂牌状态。"""

    active = "active"
    pending = "pending"
    contracted = "contracted"   # 已签署合同
    closed = "closed"           # 已成交
    cancelled = "cancelled"
    expired = "expired"


class AVMMethod(str, Enum):
    """估价方法。"""

    comparable = "comparable"     # 可比交易法
    income = "income"             # 收益法
    cost = "cost"                 # 成本法
    blended = "blended"           # 综合


class SaleListing(TimestampMixin, table=True):
    """售房/求购挂牌表。"""

    __tablename__ = "sale_listings"

    owner_user_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="users.id", index=True,
        description="挂卖者用户（个人卖家）",
    )
    agent_user_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="users.id", index=True,
        description="负责经纪人",
    )
    property_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="properties.id", index=True,
    )
    sale_type: SaleType = Field(default=SaleType.sell, index=True)
    title: str = Field(max_length=255)
    address: Optional[str] = None
    asking_price: float = Field(gt=0)
    currency: str = Field(default="THB", max_length=3)
    size_sqm: Optional[float] = None
    bedrooms: Optional[int] = None
    bathrooms: Optional[int] = None
    description: Optional[str] = None
    status: ListingStatus = Field(default=ListingStatus.active, index=True)
    avail_from: Optional[date] = None
    # 资质/备案号（东南亚多国中介牌照）
    license_ref: Optional[str] = Field(default=None, max_length=100)


class Valuation(TimestampMixin, table=True):
    """房源估价记录（AVM）。"""

    __tablename__ = "valuations"

    property_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="properties.id", index=True
    )
    sale_listing_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="sale_listings.id", index=True
    )
    method: AVMMethod = Field(default=AVMMethod.blended)
    market_value: float = Field(gt=0)
    low_estimate: Optional[float] = None
    high_estimate: Optional[float] = None
    currency: str = Field(default="THB", max_length=3)
    confidence: int = Field(default=50)  # 0-100
    factors: Optional[str] = None        # JSON 字符串：影响因子明细
    created_by: Optional[uuid.UUID] = Field(default=None, foreign_key="users.id")