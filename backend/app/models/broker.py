"""分销体系模型：外部经纪人/渠道商、转介绍裂变、联合单分成。"""
from datetime import datetime
from enum import Enum
from typing import Optional
import uuid

from sqlmodel import Field

from .base import TimestampMixin


class BrokerLevel(str, Enum):
    """渠道商等级。"""

    silver = "silver"
    gold = "gold"
    platinum = "platinum"
    franchisor = "franchisor"  # 加盟/区域总代


class BrokerStatus(str, Enum):
    """渠道商状态。"""

    pending = "pending"
    active = "active"
    suspended = "suspended"
    terminated = "terminated"


class BrokerType(str, Enum):
    """渠道类型。"""

    individual = "individual"        # 独立经纪人
    agency = "agency"                # 中介机构/分销商
    franchise = "franchise"          # 加盟商
    affiliate = "affiliate"          # 转介绍影响者


class BrokerPartner(TimestampMixin, table=True):
    """外部经纪人/渠道商身份（开放分销主体）。"""

    __tablename__ = "broker_partners"

    user_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="users.id", index=True,
        description="绑定的登录账号（可选）",
    )
    partner_name: str = Field(max_length=255)
    broker_type: BrokerType = Field(default=BrokerType.individual)
    level: BrokerLevel = Field(default=BrokerLevel.silver)
    status: BrokerStatus = Field(default=BrokerStatus.pending, index=True)
    invite_code: str = Field(unique=True, index=True, max_length=40)
    contact_name: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    country: str = Field(default="TH", max_length=4)
    base_rate: float = Field(default=0.0)   # 默认分成比例 0-100
    upline_partner_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="broker_partners.id",
        description="上级渠道商（多级裂变）",
    )
    referred_by_partner_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="broker_partners.id",
        description="推荐人渠道商",
    )
    commission_paid: float = Field(default=0)
    deal_count: int = Field(default=0)
    approved_at: Optional[datetime] = None


class Referral(TimestampMixin, table=True):
    """转介绍裂变记录（线索/看房/成交归因）。"""

    __tablename__ = "referrals"

    referrer_user_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="users.id", index=True
    )
    referrer_partner_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="broker_partners.id", index=True
    )
    invite_code: str = Field(index=True, max_length=40)
    referred_user_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="users.id", index=True
    )
    referred_name: Optional[str] = None
    referred_phone: Optional[str] = None
    source: str = Field(default="link")   # link / qr / code / 线下
    channel: str = Field(default="direct")
    property_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="properties.id", index=True
    )
    project_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="projects.id", index=True
    )
    status: str = Field(default="referred")  # referred/converted/closed/credited
    reward_status: str = Field(default="none")  # none/qualified/paid
    converted_at: Optional[datetime] = None
    credited_at: Optional[datetime] = None
    reward_amount: float = Field(default=0)


class SplitDeal(TimestampMixin, table=True):
    """联合单分成（内部员工 + 外部渠道协同收费拆分）。"""

    __tablename__ = "split_deals"

    deal_id: uuid.UUID = Field(foreign_key="property_deals.id", index=True)
    commission_total: float = Field(gt=0)
    currency: str = Field(default="THB", max_length=3)
    participant_role: str = Field(max_length=20)  # agent / employee / broker / referral
    participant_user_id: Optional[uuid.UUID] = Field(default=None, foreign_key="users.id")
    participant_employee_id: Optional[uuid.UUID] = Field(default=None, foreign_key="employees.id")
    participant_partner_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="broker_partners.id"
    )
    split_rate: float = Field(gt=0)   # 0-100
    split_amount: float = Field(gt=0)
    status: str = Field(default="pending")  # pending/approved/paid