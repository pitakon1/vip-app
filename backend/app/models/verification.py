"""真房源保鲜：核验记录与到期复验。

## 为什么需要（对标贝壳 + 泰国行业痛点）

贝壳的「真房源」不是一句口号，而是一套**可运营的保鲜机制**：
房源上架后必须在约定周期内被再次核验（实勘 / 房东确认），逾期未核验的房源
会被降权甚至下架。它解决的是信息行业的通病：**过期房源、钓鱼房源**。

泰国的情况比国内更糟——主流平台（DDproperty / Hipflat / FazWaz / PropertyScout）
是聚合型房源站，同一套房不同代理不同平台不同价，**房屋已租出但广告还挂着**
是行业公害，因为没人有动力去下架（下架等于放弃线索）。

本平台已有 `Property.dedupe_key`（一房一档）+ `Listing`（1:N 上架单）的地基，
缺的是「这份档案多久没被核验过」这个时间维度。本模型补上：

- 每条核验留痕（谁、什么时候、用什么方式、结论是什么、证据在哪）；
- 核验后写入 `Listing.next_revalidate_at`，到期由 Celery 任务自动流转；
- C 端据此展示「已核验 / 待核验 / 已过期」徽标——**把保鲜状态变成可卖的信任**。

设计取舍：核验挂在 `Listing`（上架单）上而不是只挂 `Property`（档案）——
同一套档案在不同渠道可能状态不一致（A 中介已租出、B 中介还在挂），
上架单才是「对外可见的那一条」，保鲜必须作用于对外可见单位。
"""
import uuid
from datetime import datetime
from enum import Enum
from typing import Optional

from sqlalchemy import Column, JSON
from sqlmodel import Field

from .base import TimestampMixin


class VerificationMethod(str, Enum):
    """核验方式（可信度递减）。"""

    on_site = "on_site"                # 经纪人实勘：到场拍照/视频
    owner_confirm = "owner_confirm"    # 房东确认：电话 / LINE / 微信回访
    platform_audit = "platform_audit"  # 平台抽检：运营抽样复核
    system = "system"                  # 系统自动：如价格长期无变动


class VerificationResult(str, Enum):
    """核验结论。"""

    verified = "verified"            # 房源真实、价格有效
    price_changed = "price_changed"  # 房源真实但价格已变（需同步挂牌价）
    unavailable = "unavailable"      # 已租/已售/房东撤单 → 下架
    unreachable = "unreachable"      # 联系不上房东 → 不直接下架，转待核验降权


class ListingVerificationStatus(str, Enum):
    """上架单的保鲜状态（C 端徽标口径）。"""

    unverified = "unverified"  # 从未核验
    verified = "verified"      # 保鲜期内
    pending = "pending"        # 临近到期，等待复验（仍展示，但降权）
    expired = "expired"        # 已过期，对外不展示为「有效房源」


class PropertyVerification(TimestampMixin, table=True):
    """房源核验记录（留痕，一房源可多条）。"""

    __tablename__ = "property_verifications"

    property_id: uuid.UUID = Field(foreign_key="properties.id", index=True)
    listing_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="listings.id", index=True,
        description="被核验的上架单（对外可见单位）",
    )
    method: VerificationMethod = Field(index=True)
    result: VerificationResult = Field(index=True)
    verified_by_user_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="users.id", index=True
    )
    verified_by_partner_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="broker_partners.id", index=True
    )
    verified_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    next_due_at: datetime = Field(
        index=True, description="下次必须复验的时间；到期未复验则自动过期"
    )
    # 证据：{photos: [...], video: "...", price_seen: 12000, note: "..."}
    evidence: Optional[dict] = Field(
        default=None, sa_column=Column(JSON, nullable=True, comment="核验证据快照")
    )
    note: Optional[str] = Field(default=None, max_length=500)
