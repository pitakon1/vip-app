"""分佣拆分规则路由。

分佣配置：一笔成交（lease_id）可按角色拆成多条佣金结算（listing_agent /
client_agent / handler / partner_company / platform）。本表定义「某成交类型下，某
角色分多少百分比」，是提成与分佣的配置入口。

仅 admin 可维护（分佣影响全公司分成，属敏感财务配置）。结算时由
leases._collect_split_roles 读取生效规则自动拆分。
"""
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlmodel import Session, select

from app.db import get_session
from app.core.auth import require_admin
from app.core.pagination import Page, PaginationParams, paginate_query
from app.models import (
    CommissionRole,
    CommissionSplitRule,
    DealType,
    SplitRuleScope,
    User,
)

router = APIRouter(prefix="/commission-split-rules", tags=["commission-split-rules"])


class SplitRuleCreate(BaseModel):
    deal_type: DealType = DealType.new_rental
    role: CommissionRole
    percent: float = Field(ge=0, le=100, description="该角色分成比例（%）")
    scope: SplitRuleScope = SplitRuleScope.all
    partner_id: Optional[uuid.UUID] = None  # scope=by_partner 时生效
    is_active: bool = True
    effective_from: Optional[datetime] = None
    effective_to: Optional[datetime] = None


class SplitRuleUpdate(BaseModel):
    deal_type: Optional[DealType] = None
    role: Optional[CommissionRole] = None
    percent: Optional[float] = Field(default=None, ge=0, le=100)
    scope: Optional[SplitRuleScope] = None
    partner_id: Optional[uuid.UUID] = None
    is_active: Optional[bool] = None
    effective_from: Optional[datetime] = None
    effective_to: Optional[datetime] = None


class SplitRuleResponse(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: Optional[str] = None
    deal_type: Optional[str] = None
    role: Optional[str] = None
    percent: Optional[float] = None
    scope: Optional[str] = None
    partner_id: Optional[str] = None
    is_active: Optional[bool] = None
    effective_from: Optional[datetime] = None
    effective_to: Optional[datetime] = None
    created_at: Optional[str] = None


def _to_dict(r: CommissionSplitRule) -> dict:
    return {
        **r.model_dump(),
        "id": str(r.id),
        "deal_type": r.deal_type,
        "role": r.role.value,
        "scope": r.scope.value,
        "partner_id": str(r.partner_id) if r.partner_id else None,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


@router.get("", response_model=Page[SplitRuleResponse])
def list_split_rules(
    pagination: PaginationParams = Depends(),
    deal_type: Optional[DealType] = None,
    role: Optional[CommissionRole] = None,
    partner_id: Optional[uuid.UUID] = None,
    active_only: bool = False,
    session: Session = Depends(get_session),
    user: User = Depends(require_admin),
):
    """分佣拆分规则列表（admin）。"""
    conditions = [CommissionSplitRule.deleted_at.is_(None)]
    if deal_type:
        conditions.append(CommissionSplitRule.deal_type == deal_type.value)
    if role:
        conditions.append(CommissionSplitRule.role == role)
    if partner_id:
        conditions.append(
            CommissionSplitRule.scope == SplitRuleScope.by_partner,
            CommissionSplitRule.partner_id == partner_id,
        )
    if active_only:
        conditions.append(CommissionSplitRule.is_active.is_(True))

    stmt = (
        select(CommissionSplitRule)
        .where(*conditions)
        .order_by(CommissionSplitRule.created_at.desc())
    )
    page = paginate_query(session, stmt, pagination)
    page.items = [_to_dict(r) for r in page.items]
    return page


@router.post("", status_code=201, response_model=SplitRuleResponse)
def create_split_rule(
    req: SplitRuleCreate,
    session: Session = Depends(get_session),
    user: User = Depends(require_admin),
):
    """新增分佣拆分规则（admin）。"""
    if req.scope == SplitRuleScope.by_partner and not req.partner_id:
        raise HTTPException(
            status_code=400, detail="partner_id is required for by_partner scope"
        )
    rule = CommissionSplitRule(**req.model_dump(), created_by=user.id)
    session.add(rule)
    session.commit()
    session.refresh(rule)
    return _to_dict(rule)


@router.patch("/{rule_id}", response_model=SplitRuleResponse)
def update_split_rule(
    rule_id: uuid.UUID,
    req: SplitRuleUpdate,
    session: Session = Depends(get_session),
    user: User = Depends(require_admin),
):
    """更新分佣拆分规则（admin）。"""
    rule = session.get(CommissionSplitRule, rule_id)
    if not rule or rule.deleted_at:
        raise HTTPException(status_code=404, detail="Split rule not found")
    data = req.model_dump(exclude_unset=True)
    if data.get("scope") == SplitRuleScope.by_partner and not data.get("partner_id") and not rule.partner_id:
        raise HTTPException(
            status_code=400, detail="partner_id is required for by_partner scope"
        )
    for key, value in data.items():
        setattr(rule, key, value)
    session.add(rule)
    session.commit()
    session.refresh(rule)
    return _to_dict(rule)


@router.delete("/{rule_id}")
def delete_split_rule(
    rule_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(require_admin),
):
    """软删除分佣拆分规则（admin）。"""
    rule = session.get(CommissionSplitRule, rule_id)
    if not rule or rule.deleted_at:
        raise HTTPException(status_code=404, detail="Split rule not found")
    rule.deleted_at = datetime.utcnow()
    session.add(rule)
    session.commit()
    return {"ok": True}