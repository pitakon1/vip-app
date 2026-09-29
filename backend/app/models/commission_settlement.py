"""佣金结算模型。

对应设计文档中的员工佣金结算主数据。
"""
from datetime import datetime
from enum import Enum
from typing import Optional
import uuid

from sqlmodel import Field

from .base import TimestampMixin


class DealType(str, Enum):
    """成交类型枚举。"""

    new_rental = "new_rental"
    renewal = "renewal"
    management = "management"


class SettlementStatus(str, Enum):
    """结算状态枚举。"""

    pending = "pending"
    approved = "approved"
    paid = "paid"


class CommissionRole(str, Enum):
    """佣金结算角色（同一成交按角色拆多条分佣）。

    - listing_agent    房源方（上架）经纪人
    - client_agent     客源方（客户渠道）经纪人
    - handler          平台经办/处理人
    - partner_company  合作公司（公司整体分成）
    - platform         平台方
    """

    listing_agent = "listing_agent"
    client_agent = "client_agent"
    handler = "handler"
    partner_company = "partner_company"
    platform = "platform"


class CommissionSettlement(TimestampMixin, table=True):
    """佣金结算表。

    一条成交（lease_id）可拆成多条结算（按角色写入：
    listing_agent / client_agent / handler / partner_company / platform），
    便于把「业绩」追踪到每个经纪/销售并拆分提成。`employee_id` 为
    个人经纪人时必填；company/partner_company 类走 `partner_id`。
    """

    __tablename__ = "commission_settlements"

    employee_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="employees.id", index=True
    )
    role: CommissionRole = Field(
        default=CommissionRole.platform, index=True
    )
    partner_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="partners.id", index=True
    )
    lease_id: uuid.UUID = Field(foreign_key="leases.id", index=True)
    contract_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="contracts.id", index=True
    )
    deal_type: DealType = Field(index=True)
    commission_base: float = Field(default=0)
    commission_rate: float = Field(default=0)
    commission_amount: float = Field(default=0)
    split_percent: float = Field(default=0)  # 该角色在本笔成交中的分成比例（%）
    currency: str = Field(default="THB", max_length=3)
    status: SettlementStatus = Field(
        default=SettlementStatus.pending, index=True
    )
    settled_at: Optional[datetime] = None
    paid_at: Optional[datetime] = None


class SplitRuleScope(str, Enum):
    """分佣规则适用范围。"""

    all = "all"  # 全局（所有成交）
    by_partner = "by_partner"  # 仅特定合作公司生效


class CommissionSplitRule(TimestampMixin, table=True):
    """分佣规则：按成交类型 + 角色配置分成比例。

    一条成交可按角色拆分成多条佣金结算；该表定义「某成交类型下，某角色分多少」。
    scope=by_partner 时只对 partner 指定的合作公司生效。
    """

    __tablename__ = "commission_split_rules"

    deal_type: str = Field(default="new_rental", index=True)
    role: CommissionRole = Field(index=True)
    percent: float = Field(default=0, ge=0, le=100)  # 该角色分成比例（%）
    partner_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="partners.id", index=True
    )  # scope=by_partner 时生效
    scope: SplitRuleScope = Field(default=SplitRuleScope.all, index=True)
    is_active: bool = Field(default=True, index=True)
    effective_from: Optional[datetime] = None
    effective_to: Optional[datetime] = None
    created_by: Optional[uuid.UUID] = Field(default=None, foreign_key="users.id")
