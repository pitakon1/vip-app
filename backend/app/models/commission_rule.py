"""佣金规则配置模型。

允许管理员配置按成交类型区分的佣金比例，作为佣金结算的自动化依据（v1.9）。
"""
from datetime import datetime
from enum import Enum
from typing import Optional
import uuid

from sqlmodel import Field

from .base import TimestampMixin


class CommissionRuleScope(str, Enum):
    """规则适用范围。"""

    all_employees = "all_employees"
    by_department = "by_department"
    by_employee = "by_employee"


class CommissionRule(TimestampMixin, table=True):
    """佣金规则表。"""

    __tablename__ = "commission_rules"

    name: str = Field(max_length=100)
    deal_type: str = Field(
        default="new_rental", index=True
    )  # deal_type: new_rental/renewal/management
    rate: float = Field(default=0.0, gt=0, le=100)  # 百分比,如 5 表示 5%
    scope: CommissionRuleScope = Field(
        default=CommissionRuleScope.all_employees, index=True
    )
    department: Optional[str] = None  # scope=by_department 时生效
    employee_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="employees.id"
    )  # scope=by_employee 时生效
    cap_amount: Optional[float] = None  # 单笔封顶金额
    minimum_amount: Optional[float] = None  # 佣金起算门槛
    description: Optional[str] = None
    is_active: bool = Field(default=True, index=True)
    effective_from: Optional[datetime] = None
    effective_to: Optional[datetime] = None