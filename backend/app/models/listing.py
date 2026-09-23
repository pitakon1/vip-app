"""房源上架单模型。

承载「业主或房源上架经纪人发布房源」所需的：目标档案(property)、发布侧(owner/broker)、
挂牌价/租金、分佣配置、联系人与去重状态。档案(Property)与上架单(Listing)为 1:N 关系：
同一套房平台上一份档案，多渠道可有多份上架单。
"""
from datetime import datetime
from enum import Enum
from typing import Optional
import uuid

from sqlmodel import Field

from .base import TimestampMixin


class ListingType(str, Enum):
    """上架类型：租/售。"""

    rent = "rent"
    sell = "sell"


class PublisherType(str, Enum):
    """发布侧：业主自主发布 或 房源上架经纪人发布。"""

    owner = "owner"
    broker = "broker"


class ListingStatus(str, Enum):
    """上架审核状态。"""

    pending = "pending"  # 待平台审核
    active = "active"  # 上架中
    rented = "rented"  # 已租
    sold = "sold"  # 已售成交
    closed = "closed"  # 已下架
    cancelled = "cancelled"
    rejected = "rejected"  # 审核驳回
    expired = "expired"  # 真房源保鲜到期未复验（Celery 自动流转，见 freshness_service）


class MandateType(str, Enum):
    """委托方式：独家/快速成交 或 非独家委托。"""

    exclusive = "exclusive"
    non_exclusive = "non_exclusive"


class NonExclusiveSplit(str, Enum):
    """非独家委托的房源方:客源方分成档位。"""

    sp_65_35 = "sp_65_35"  # 客源65 / 房源35
    sp_50_50 = "sp_50_50"  # 客源50 / 房源50
    sp_30_70 = "sp_30_70"  # 客源30 / 房源70
    sp_20_80 = "sp_20_80"  # 客源20 / 房源80


class DedupeState(str, Enum):
    """上架单的去重归档状态。"""

    new = "new"  # 新档案
    merged = "merged"  # 已并入主档案/主上架单（该单停用）
    suspect = "suspect"  # 疑似重复，待审核
    blocked = "blocked"  # 明确重复被阻断，待审核


class Listing(TimestampMixin, table=True):
    """房源上架单表。"""

    __tablename__ = "listings"

    property_id: uuid.UUID = Field(foreign_key="properties.id", index=True)
    listing_type: ListingType = Field(default=ListingType.rent, index=True)
    publisher: PublisherType = Field(default=PublisherType.owner, index=True)
    publisher_user_id: uuid.UUID = Field(foreign_key="users.id", index=True)
    publisher_broker_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="broker_partners.id", index=True,
        description="房源上架经纪人（broker 发布时必填）",
    )
    owner_id: uuid.UUID = Field(foreign_key="owners.id", index=True)
    status: ListingStatus = Field(default=ListingStatus.pending, index=True)

    # 挂牌/租金
    asking_price: Optional[float] = Field(default=None, description="挂牌价(sell)")
    monthly_rent: Optional[float] = Field(default=None, description="租金(rent)")
    currency: str = Field(default="THB", max_length=3)

    # 分佣配置
    sale_commission_rate: Optional[float] = Field(
        default=None, description="卖房佣金比例 %（3-6）"
    )
    rental_commission_months: Optional[float] = Field(
        default=None, description="租房佣金月数（1/1.5/2/3）"
    )
    mandate_type: MandateType = Field(default=MandateType.non_exclusive)
    split_option: Optional[NonExclusiveSplit] = Field(
        default=None, description="非独家分成档位"
    )
    buyer_side_rate: Optional[float] = Field(
        default=None, description="客源方可分比例 %（0-100）"
    )
    listing_side_rate: Optional[float] = Field(
        default=None, description="房源方可分比例 %（=100-buyer_side）"
    )
    owner_commission_rate: float = Field(default=100, description="业主自主发布佣金 100%")

    # 业主联系方式（后台选填、可隐藏，不显示前端）
    owner_contact_visible: bool = Field(default=False)
    owner_contact_name: Optional[str] = None
    owner_contact_phone: Optional[str] = None
    owner_contact_channel: Optional[str] = None  # tel/line/wechat/email

    # 经纪人联系方式（显示前端）
    broker_company: Optional[str] = None
    broker_real_name: Optional[str] = None
    broker_phone: Optional[str] = None
    broker_wechat: Optional[str] = None
    broker_line: Optional[str] = None
    broker_whatsapp: Optional[str] = None

    # 去重归档
    dedupe_state: DedupeState = Field(default=DedupeState.new, index=True)
    merged_into_listing_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="listings.id"
    )
    reject_reason: Optional[str] = None
    reviewed_at: Optional[datetime] = None

    # ---- 真房源保鲜（对标贝壳，见 models/verification.py 的说明）----
    last_verified_at: Optional[datetime] = Field(
        default=None, description="最近一次核验通过时间"
    )
    next_revalidate_at: Optional[datetime] = Field(
        default=None, index=True,
        description="下次必须复验的时间；到期未复验由 revalidate_listings 任务标记 expired",
    )
    verification_status: str = Field(
        default="unverified", index=True,
        description="保鲜状态：unverified/verified/pending/expired（C 端徽标口径）",
    )
    expired_at: Optional[datetime] = Field(
        default=None, description="因保鲜到期被自动下架的时间"
    )