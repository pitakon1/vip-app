"""佣金费率解析服务：按差异化规则匹配最终适用佣金比例。

优先级（从高到低，同层取最新生效规则）：
  1. by_employee   员工专属
  2. by_department 部门
  3. by_broker     分销商（渠道商）专属
  4. all_employees 全局
  5. broker.base_rate（分销商基础分成比例，>0 时生效）
  6. fallback 1.0（默认 1 个月租金）
"""
import uuid
from datetime import datetime
from typing import Optional

from sqlmodel import Session, select

from app.models import (
    BrokerPartner,
    CommissionRule,
    CommissionRuleScope,
)


def _pick_rate(rules: list[CommissionRule]) -> Optional[float]:
    """取同层规则中最近一条生效的费率。"""
    active = [
        r
        for r in rules
        if r.is_active
        and (r.effective_from is None or r.effective_from <= datetime.utcnow())
        and (r.effective_to is None or r.effective_to >= datetime.utcnow())
    ]
    if not active:
        return None
    best = max(active, key=lambda r: r.created_at or datetime.min)
    return best.rate


def resolve_commission_rate(
    session: Session,
    *,
    deal_type: str,
    employee_id: Optional[uuid.UUID] = None,
    department: Optional[str] = None,
    broker_id: Optional[uuid.UUID] = None,
    broker_base_rate: float = 0.0,
) -> float:
    """解析最终佣金比例（%）。"""
    base = select(CommissionRule).where(
        CommissionRule.deleted_at.is_(None),
        CommissionRule.deal_type == deal_type,
    )

    # 1) 员工专属
    if employee_id:
        rows = session.exec(
            base.where(
                CommissionRule.scope == CommissionRuleScope.by_employee,
                CommissionRule.employee_id == employee_id,
            )
        ).all()
        rate = _pick_rate(rows)
        if rate is not None:
            return rate

    # 2) 部门
    if department:
        rows = session.exec(
            base.where(
                CommissionRule.scope == CommissionRuleScope.by_department,
                CommissionRule.department == department,
            )
        ).all()
        rate = _pick_rate(rows)
        if rate is not None:
            return rate

    # 3) 分销商专属
    if broker_id:
        rows = session.exec(
            base.where(
                CommissionRule.scope == CommissionRuleScope.by_broker,
                CommissionRule.broker_id == broker_id,
            )
        ).all()
        rate = _pick_rate(rows)
        if rate is not None:
            return rate

    # 4) 全局
    rows = session.exec(
        base.where(CommissionRule.scope == CommissionRuleScope.all_employees)
    ).all()
    rate = _pick_rate(rows)
    if rate is not None:
        return rate

    # 5) 分销商基础分成比例
    if broker_base_rate and broker_base_rate > 0:
        return broker_base_rate

    return 1.0


def get_broker_base_rate(session: Session, broker_id: Optional[uuid.UUID]) -> float:
    if not broker_id:
        return 0.0
    b = session.get(BrokerPartner, broker_id)
    return b.base_rate if b else 0.0