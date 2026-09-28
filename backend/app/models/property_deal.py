"""产权成交 + 定金(Escrow)托管模型（买卖交易闭环）。

按揭模型已整体下线（平台不做按揭这类金融业务），遗留表由迁移 0026 删除。
"""
from datetime import date, datetime
from enum import Enum
from typing import Optional
import uuid

from sqlmodel import Field

from .base import TimestampMixin


class PropertyDealStatus(str, Enum):
    """产权成交状态。"""

    drafted = "drafted"
    escrow_pending = "escrow_pending"   # 定金托管中
    signed = "signed"                    # 合同签署
    transferring = "transferring"        # 过户中
    completed = "completed"
    failed = "failed"
    cancelled = "cancelled"


class EscrowStatus(str, Enum):
    """定金托管状态。"""

    deposited = "deposited"
    held = "held"
    released_seller = "released_seller"
    refunded_buyer = "refunded_buyer"


class PropertyDeal(TimestampMixin, table=True):
    """产权成交主表。"""

    __tablename__ = "property_deals"

    sales_user_id: Optional[uuid.UUID] = Field(default=None, foreign_key="users.id", index=True)
    buyer_user_id: Optional[uuid.UUID] = Field(default=None, foreign_key="users.id", index=True)
    sale_listing_id: uuid.UUID = Field(default=None, foreign_key="sale_listings.id", index=True)
    property_id: Optional[uuid.UUID] = Field(default=None, foreign_key="properties.id", index=True)
    sale_price: float = Field(gt=0)
    currency: str = Field(default="THB", max_length=3)
    status: PropertyDealStatus = Field(default=PropertyDealStatus.drafted, index=True)
    signed_at: Optional[datetime] = None
    transfer_date: Optional[date] = None
    transfer_fee: Optional[float] = None
    agent_user_id: Optional[uuid.UUID] = Field(default=None, foreign_key="users.id", index=True)
    notes: Optional[str] = None


class Escrow(TimestampMixin, table=True):
    """定金托管记录。"""

    __tablename__ = "property_escrows"

    deal_id: uuid.UUID = Field(foreign_key="property_deals.id", index=True)
    amount: float = Field(gt=0)
    currency: str = Field(default="THB", max_length=3)
    status: EscrowStatus = Field(default=EscrowStatus.deposited, index=True)
    deposited_at: Optional[datetime] = None
    released_at: Optional[datetime] = None
    refunded_at: Optional[datetime] = None
    handler_user_id: Optional[uuid.UUID] = Field(default=None, foreign_key="users.id")