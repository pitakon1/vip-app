"""佣金规则配置路由（admin）。

允许管理员维护按成交类型区分的佣金规则，作为佣金结算的自动化依据。
"""
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlmodel import Session, select

from app.db import get_session
from app.core.auth import require_admin
from app.core.pagination import PaginationParams, paginate
from app.models import CommissionRule, CommissionRuleScope, User

router = APIRouter(prefix="/commission-rules", tags=["commission-rules"])


class CommissionRuleCreate(BaseModel):
    name: str
    deal_type: str = "new_rental"
    rate: float
    scope: CommissionRuleScope = CommissionRuleScope.all_employees
    department: Optional[str] = None
    employee_id: Optional[uuid.UUID] = None
    cap_amount: Optional[float] = None
    minimum_amount: Optional[float] = None
    description: Optional[str] = None
    is_active: bool = True
    effective_from: Optional[datetime] = None
    effective_to: Optional[datetime] = None


class CommissionRuleUpdate(BaseModel):
    name: Optional[str] = None
    deal_type: Optional[str] = None
    rate: Optional[float] = None
    scope: Optional[CommissionRuleScope] = None
    department: Optional[str] = None
    employee_id: Optional[uuid.UUID] = None
    cap_amount: Optional[float] = None
    minimum_amount: Optional[float] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
    effective_from: Optional[datetime] = None
    effective_to: Optional[datetime] = None


def _to_dict(r: CommissionRule) -> dict:
    return {
        **r.model_dump(exclude={"metadata_"}),
        "id": str(r.id),
        "scope": r.scope.value if r.scope else None,
        "employee_id": str(r.employee_id) if r.employee_id else None,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


@router.get("")
def list_commission_rules(
    pagination: PaginationParams = Depends(),
    deal_type: Optional[str] = None,
    active_only: bool = False,
    session: Session = Depends(get_session),
    user: User = Depends(require_admin),
):
    """佣金规则列表（admin 权限）。"""
    conditions = [CommissionRule.deleted_at.is_(None)]
    if deal_type:
        conditions.append(CommissionRule.deal_type == deal_type)
    if active_only:
        conditions.append(CommissionRule.is_active.is_(True))

    stmt = select(CommissionRule).where(*conditions).order_by(
        CommissionRule.created_at.desc()
    )
    count_stmt = select(func.count(CommissionRule.id)).where(*conditions)
    total = session.exec(count_stmt).one()
    items = session.exec(
        stmt.offset(pagination.offset).limit(pagination.limit)
    ).all()
    return paginate([_to_dict(r) for r in items], total, pagination)


@router.post("")
def create_commission_rule(
    req: CommissionRuleCreate,
    session: Session = Depends(get_session),
    user: User = Depends(require_admin),
):
    """新增佣金规则（admin 权限）。"""
    rule = CommissionRule(**req.model_dump())
    session.add(rule)
    session.commit()
    session.refresh(rule)
    return _to_dict(rule)


@router.get("/{rule_id}")
def get_commission_rule(
    rule_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(require_admin),
):
    """佣金规则详情（admin 权限）。"""
    rule = session.get(CommissionRule, rule_id)
    if not rule or rule.deleted_at:
        raise HTTPException(status_code=404, detail="Commission rule not found")
    return _to_dict(rule)


@router.patch("/{rule_id}")
def update_commission_rule(
    rule_id: uuid.UUID,
    req: CommissionRuleUpdate,
    session: Session = Depends(get_session),
    user: User = Depends(require_admin),
):
    """更新佣金规则（admin 权限）。"""
    rule = session.get(CommissionRule, rule_id)
    if not rule or rule.deleted_at:
        raise HTTPException(status_code=404, detail="Commission rule not found")
    update_data = req.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(rule, key, value)
    session.add(rule)
    session.commit()
    session.refresh(rule)
    return _to_dict(rule)


@router.delete("/{rule_id}")
def delete_commission_rule(
    rule_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(require_admin),
):
    """软删除佣金规则（admin 权限）。"""
    rule = session.get(CommissionRule, rule_id)
    if not rule or rule.deleted_at:
        raise HTTPException(status_code=404, detail="Commission rule not found")
    rule.deleted_at = datetime.utcnow()
    session.add(rule)
    session.commit()
    return {"ok": True}