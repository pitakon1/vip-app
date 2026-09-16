"""佣金规则配置路由。

支持差异化定价：
- 管理员（admin）：维护全局规则，可为指定分销商（broker）配置专属费率
- 分销商管理员（绑定有效 BrokerPartner 的账号）：只能维护本渠道的专属费率
- 员工差异化：scope=by_employee / by_department
结算时按 员工 > 部门 > 分销商 > 全局 > 分销商基础分成 优先级解析（见 services/commission_rates.py）。
"""
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import or_
from sqlmodel import Session, select

from app.db import get_session
from app.core.auth import get_current_user
from app.core.pagination import PaginationParams, paginate_query
from app.models import BrokerPartner, CommissionRule, CommissionRuleScope, Employee, User

router = APIRouter(prefix="/commission-rules", tags=["commission-rules"])


class CommissionRuleCreate(BaseModel):
    name: str
    deal_type: str = "new_rental"
    rate: float
    scope: CommissionRuleScope = CommissionRuleScope.all_employees
    department: Optional[str] = None
    employee_id: Optional[uuid.UUID] = None
    broker_id: Optional[uuid.UUID] = None
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
    broker_id: Optional[uuid.UUID] = None
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
        "broker_id": str(r.broker_id) if r.broker_id else None,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


def _broker_of_user(session: Session, user: User) -> Optional[uuid.UUID]:
    """返回用户绑定的有效分销商 id（未绑定返回 None）。"""
    b = session.exec(
        select(BrokerPartner).where(
            BrokerPartner.user_id == user.id,
            BrokerPartner.status == "active",
            BrokerPartner.deleted_at.is_(None),
        )
    ).first()
    return b.id if b else None


@router.get("")
def list_commission_rules(
    pagination: PaginationParams = Depends(),
    deal_type: Optional[str] = None,
    scope: Optional[CommissionRuleScope] = None,
    broker_id: Optional[uuid.UUID] = None,
    active_only: bool = False,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """佣金规则列表。

    - admin：可查看全部；可按 broker_id / scope 过滤
    - 分销商管理员：自动限定本渠道规则
    """
    my_broker = _broker_of_user(session, user)
    is_admin = user.role.value == "admin"
    if user.role.value != "admin" and not my_broker:
        raise HTTPException(status_code=403, detail="Only admin or broker admin can view commission rules")

    conditions = [CommissionRule.deleted_at.is_(None)]
    if deal_type:
        conditions.append(CommissionRule.deal_type == deal_type)
    if active_only:
        conditions.append(CommissionRule.is_active.is_(True))
    if scope:
        conditions.append(CommissionRule.scope == scope)
    if not is_admin:
        conditions.append(
            or_(
                CommissionRule.broker_id == my_broker,
                CommissionRule.scope == CommissionRuleScope.by_employee,
            )
        )
    elif broker_id:
        conditions.append(CommissionRule.broker_id == broker_id)

    stmt = select(CommissionRule).where(*conditions).order_by(CommissionRule.created_at.desc())
    page = paginate_query(session, stmt, pagination)
    page.items = [_to_dict(r) for r in page.items]
    return page


@router.post("")
def create_commission_rule(
    req: CommissionRuleCreate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """新增佣金规则。

    - admin：任意 scope（含为指定分销商 broker_id 配置专属费率）
    - 分销商管理员：仅能创建 scope=by_broker 且 broker_id=本渠道
    """
    is_admin = user.role.value == "admin"
    my_broker = _broker_of_user(session, user)
    payload = req.model_dump()

    if is_admin:
        pass
    elif my_broker:
        if req.scope == CommissionRuleScope.by_employee:
            # 分销商管理员可为名下员工配置差异化费率
            if not req.employee_id:
                raise HTTPException(status_code=400, detail="Employee required")
            emp = session.get(Employee, req.employee_id)
            if not emp or emp.broker_id != my_broker:
                raise HTTPException(status_code=403, detail="Employee is not in your broker branch")
            payload["broker_id"] = my_broker
            payload["department"] = None
        else:
            payload["scope"] = CommissionRuleScope.by_broker
            payload["broker_id"] = my_broker
            payload["employee_id"] = None
            payload["department"] = None
    else:
        raise HTTPException(status_code=403, detail="Only admin or broker admin can create commission rules")

    rule = CommissionRule(**payload)
    session.add(rule)
    session.commit()
    session.refresh(rule)
    return _to_dict(rule)


@router.get("/{rule_id}")
def get_commission_rule(
    rule_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """佣金规则详情（admin 或本渠道分销商管理员）。"""
    rule = session.get(CommissionRule, rule_id)
    if not rule or rule.deleted_at:
        raise HTTPException(status_code=404, detail="Commission rule not found")
    my_broker = _broker_of_user(session, user)
    if user.role.value != "admin" and rule.broker_id != my_broker:
        raise HTTPException(status_code=403, detail="No access to this rule")
    return _to_dict(rule)


@router.patch("/{rule_id}")
def update_commission_rule(
    rule_id: uuid.UUID,
    req: CommissionRuleUpdate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """更新佣金规则（admin 或本渠道分销商管理员）。"""
    rule = session.get(CommissionRule, rule_id)
    if not rule or rule.deleted_at:
        raise HTTPException(status_code=404, detail="Commission rule not found")
    my_broker = _broker_of_user(session, user)
    if user.role.value != "admin" and rule.broker_id != my_broker:
        raise HTTPException(status_code=403, detail="No access to this rule")
    update_data = req.model_dump(exclude_unset=True)
    if user.role.value != "admin":
        # 分销商管理员不可变更规则归属
        update_data.pop("broker_id", None)
        update_data.pop("scope", None)
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
    user: User = Depends(get_current_user),
):
    """软删除佣金规则（admin 或本渠道分销商管理员）。"""
    rule = session.get(CommissionRule, rule_id)
    if not rule or rule.deleted_at:
        raise HTTPException(status_code=404, detail="Commission rule not found")
    my_broker = _broker_of_user(session, user)
    if user.role.value != "admin" and rule.broker_id != my_broker:
        raise HTTPException(status_code=403, detail="No access to this rule")
    rule.deleted_at = datetime.utcnow()
    session.add(rule)
    session.commit()
    return {"ok": True}