"""ACN 经纪人合作网络路由：房源贡献角色 + 贡献度分佣。

## 鉴权口径

- **写**（登记/撤销贡献、计算并落库分佣方案）限员工：这是分钱的动作。
- **读**：
  - `/acn/roles` 角色字典：所有登录用户可读，前端要用它渲染；
  - `/acn/me/contributions` 本人贡献：所有登录用户可用（经纪人自查自己的贡献）；
  - 房源维度的贡献/方案：员工全量；非员工仅当自己是该房源的在册贡献者，
    否则 404（贡献表里带着佣金比例，等同于资金信息）。

## 为什么分佣方案要先 preview 再落库

分佣是**会反复重算**的：录入人换了、客源方加了一个人，都要重算。
`preview` 让前端先看到「这样分每人是多少」再决定落库，避免每次试算都在
库里留一条无人认领的草案。
"""
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict
from sqlmodel import Session, select

from app.core.auth import (
    STAFF_ROLES,
    get_current_user,
    owner_id_of,
    require_admin,
    require_employee,
)
from app.db import get_session
from app.models import (
    ACNRole,
    ACN_ROLE_LABELS,
    DEFAULT_ROLE_WEIGHTS,
    CommissionSplitPlan,
    Property,
    PropertyContribution,
    SplitDeal,
    User,
    UserRole,
)
from app.services import acn_service

router = APIRouter(prefix="/acn", tags=["acn"])




def _is_contributor(session: Session, user: User, property_id: uuid.UUID) -> bool:
    """当前用户是否为该房源的在册贡献者（员工身份另有放行，见调用处）。"""
    row = session.exec(
        select(PropertyContribution).where(
            PropertyContribution.property_id == property_id,
            PropertyContribution.user_id == user.id,
            PropertyContribution.status == "active",
            PropertyContribution.deleted_at.is_(None),
        )
    ).first()
    return row is not None


def _require_property_readable(session: Session, user: User, property_id: uuid.UUID) -> None:
    """房源维度信息的读取门槛：员工 / 本人有贡献的房源 / 业主本人名下房源。

    **刻意不用 `can_view_property`**：该函数对租客角色返回 True（C 端详情页
    依赖它全量浏览），但 ACN 贡献表里带着佣金比例与分佣金额，属于资金信息，
    租客绝不能看到。这里按「是否利益相关方」重新判定。
    不可见统一 404，不暴露「存在但你没权限」。
    """
    if user.role in STAFF_ROLES:
        return
    if _is_contributor(session, user, property_id):
        return
    if user.role == UserRole.owner:
        prop = session.get(Property, property_id)
        if prop is not None and not prop.deleted_at:
            owner_id = owner_id_of(session, user)
            if owner_id and prop.owner_id == owner_id:
                return
    raise HTTPException(status_code=404, detail="Property not found")


# --------------------------------------------------------------- 请求/响应模型
class ContributionIn(BaseModel):
    role: ACNRole
    user_id: Optional[uuid.UUID] = None
    partner_id: Optional[uuid.UUID] = None
    listing_id: Optional[uuid.UUID] = None
    weight: Optional[float] = None
    share_rate: Optional[float] = None
    note: Optional[str] = None


class ContributionOut(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: Optional[str] = None
    property_id: Optional[str] = None
    listing_id: Optional[str] = None
    role: Optional[str] = None
    role_label: Optional[str] = None
    user_id: Optional[str] = None
    partner_id: Optional[str] = None
    weight: Optional[float] = None
    effective_weight: Optional[float] = None
    share_rate: Optional[float] = None
    status: Optional[str] = None
    granted_at: Optional[str] = None
    revoked_at: Optional[str] = None
    note: Optional[str] = None


class SplitPreviewIn(BaseModel):
    property_id: uuid.UUID
    commission_total: float
    currency: str = "THB"


class SplitPlanIn(BaseModel):
    property_id: uuid.UUID
    commission_total: float
    currency: str = "THB"
    deal_id: Optional[uuid.UUID] = None
    lease_id: Optional[uuid.UUID] = None
    apply_to_deal: bool = True
    note: Optional[str] = None


def _contribution_dict(c: PropertyContribution) -> dict:
    role_value = c.role.value if hasattr(c.role, "value") else str(c.role)
    return {
        "id": str(c.id),
        "property_id": str(c.property_id),
        "listing_id": str(c.listing_id) if c.listing_id else None,
        "role": role_value,
        "role_label": ACN_ROLE_LABELS.get(role_value, role_value),
        "user_id": str(c.user_id) if c.user_id else None,
        "partner_id": str(c.partner_id) if c.partner_id else None,
        "weight": c.weight,
        "effective_weight": round(acn_service._effective_weight(c), 2),
        "share_rate": c.share_rate,
        "status": c.status,
        "granted_at": c.granted_at.isoformat() if c.granted_at else None,
        "revoked_at": c.revoked_at.isoformat() if c.revoked_at else None,
        "note": c.note,
    }


def _plan_dict(plan: CommissionSplitPlan) -> dict:
    return {
        "id": str(plan.id),
        "property_id": str(plan.property_id) if plan.property_id else None,
        "deal_id": str(plan.deal_id) if plan.deal_id else None,
        "lease_id": str(plan.lease_id) if plan.lease_id else None,
        "commission_total": plan.commission_total,
        "currency": plan.currency,
        "entries": plan.entries or [],
        "participant_count": plan.participant_count,
        "status": plan.status,
        "computed_at": plan.computed_at.isoformat() if plan.computed_at else None,
        "note": plan.note,
    }


# --------------------------------------------------------------- 角色字典
@router.get("/roles")
def list_roles(user: User = Depends(get_current_user)):
    """ACN 角色字典（含默认权重），前端渲染选择器用。

    三端暂无调用方：接口就绪，前端页面待做（见 tools_contract_check --orphans 清单）。"""
    return [
        {
            "value": role.value,
            "label": ACN_ROLE_LABELS.get(role.value, role.value),
            "default_weight": DEFAULT_ROLE_WEIGHTS.get(role.value, 0.0),
        }
        for role in ACNRole
    ]


@router.get("/me/contributions", response_model=List[ContributionOut])
def my_contributions(
    limit: int = Query(100, ge=1, le=500),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """当前账号的 ACN 贡献列表（经纪人自查：我在哪些房源上是什么角色）。

    三端暂无调用方：接口就绪，前端页面待做（见 tools_contract_check --orphans 清单）。"""
    rows = session.exec(
        select(PropertyContribution)
        .where(
            PropertyContribution.user_id == user.id,
            PropertyContribution.deleted_at.is_(None),
        )
        .order_by(PropertyContribution.granted_at.desc())
        .limit(limit)
    ).all()
    return [_contribution_dict(c) for c in rows]


# --------------------------------------------------------------- 房源贡献
@router.get("/properties/{property_id}/profile")
def property_profile(
    property_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """房源 ACN 角色构成：谁在哪个角色上，还缺哪些角色。

    三端暂无调用方：接口就绪，前端页面待做（见 tools_contract_check --orphans 清单）。"""
    _require_property_readable(session, user, property_id)
    return acn_service.profile_of(session, property_id)


@router.get(
    "/properties/{property_id}/contributions", response_model=List[ContributionOut]
)
def list_contributions(
    property_id: uuid.UUID,
    include_revoked: bool = False,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """房源贡献列表。默认只返回有效贡献，`include_revoked=true` 连已撤销一起看。

    三端暂无调用方：接口就绪，前端页面待做（见 tools_contract_check --orphans 清单）。"""
    _require_property_readable(session, user, property_id)
    query = select(PropertyContribution).where(
        PropertyContribution.property_id == property_id,
        PropertyContribution.deleted_at.is_(None),
    )
    if not include_revoked:
        query = query.where(PropertyContribution.status == "active")
    rows = session.exec(query.order_by(PropertyContribution.granted_at)).all()
    return [_contribution_dict(c) for c in rows]


@router.post("/properties/{property_id}/contributions", response_model=ContributionOut)
def grant_contribution(
    property_id: uuid.UUID,
    payload: ContributionIn,
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """登记房源贡献角色（限员工）。同一 (房源, 角色, 主体) 幂等覆盖。

    三端暂无调用方：接口就绪，前端页面待做（见 tools_contract_check --orphans 清单）。"""
    if payload.share_rate is not None and not (0 < payload.share_rate <= 100):
        raise HTTPException(status_code=400, detail="share_rate 须在 (0, 100] 区间")
    try:
        contribution = acn_service.grant_contribution(
            session,
            property_id,
            payload.role,
            user_id=payload.user_id,
            partner_id=payload.partner_id,
            listing_id=payload.listing_id,
            weight=payload.weight,
            share_rate=payload.share_rate,
            note=payload.note,
            granted_by=user.id,
        )
    except acn_service.ContributionConflictError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return _contribution_dict(contribution)


@router.delete("/contributions/{contribution_id}", response_model=ContributionOut)
def revoke_contribution(
    contribution_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """撤销贡献（限员工）。留痕不删行，分佣争议时可回溯。

    三端暂无调用方：接口就绪，前端页面待做（见 tools_contract_check --orphans 清单）。"""
    try:
        contribution = acn_service.revoke_contribution(session, contribution_id)
    except acn_service.ContributionConflictError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return _contribution_dict(contribution)


# --------------------------------------------------------------- 分佣
@router.post("/split-plans/preview")
def preview_split(
    payload: SplitPreviewIn,
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """试算分佣（限员工，不落库）。

    三端暂无调用方：接口就绪，前端页面待做（见 tools_contract_check --orphans 清单）。"""
    contributions = acn_service.active_contributions(session, payload.property_id)
    try:
        return acn_service.compute_split(
            contributions, payload.commission_total, currency=payload.currency
        )
    except acn_service.NoContributionError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/split-plans")
def create_split_plan(
    payload: SplitPlanIn,
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """计算并落库分佣方案；`apply_to_deal=true` 时同时生成 `SplitDeal` 应付款项。

    三端暂无调用方：接口就绪，前端页面待做（见 tools_contract_check --orphans 清单）。"""
    if payload.apply_to_deal and not payload.deal_id:
        raise HTTPException(
            status_code=400,
            detail="apply_to_deal=True 时必须提供 deal_id",
        )
    try:
        plan = acn_service.split_plan_for_property(
            session,
            payload.property_id,
            payload.commission_total,
            currency=payload.currency,
            deal_id=payload.deal_id,
            lease_id=payload.lease_id,
            note=payload.note,
        )
    except acn_service.NoContributionError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    applied: list = []
    if payload.apply_to_deal and payload.deal_id:
        applied = acn_service.apply_plan_to_split_deals(
            session, plan, deal_id=payload.deal_id
        )
    result = _plan_dict(plan)
    result["split_deals"] = [
        {
            "id": str(row.id),
            "participant_role": row.participant_role,
            "split_rate": row.split_rate,
            "split_amount": row.split_amount,
            "status": row.status,
        }
        for row in applied
    ]
    return result


@router.get("/split-plans", response_model=List[dict])
def list_split_plans(
    property_id: Optional[uuid.UUID] = None,
    deal_id: Optional[uuid.UUID] = None,
    limit: int = Query(100, ge=1, le=500),
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """分佣方案列表（限员工）。

    三端暂无调用方：接口就绪，前端页面待做（见 tools_contract_check --orphans 清单）。"""
    query = select(CommissionSplitPlan).where(
        CommissionSplitPlan.deleted_at.is_(None)
    )
    if property_id:
        query = query.where(CommissionSplitPlan.property_id == property_id)
    if deal_id:
        query = query.where(CommissionSplitPlan.deal_id == deal_id)
    rows = session.exec(
        query.order_by(CommissionSplitPlan.computed_at.desc()).limit(limit)
    ).all()
    return [_plan_dict(p) for p in rows]


@router.get("/split-plans/{plan_id}")
def get_split_plan(
    plan_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """分佣方案详情（限员工：含每个人分多少钱）。

    三端暂无调用方：接口就绪，前端页面待做（见 tools_contract_check --orphans 清单）。"""
    plan = session.get(CommissionSplitPlan, plan_id)
    if not plan or plan.deleted_at:
        raise HTTPException(status_code=404, detail="Split plan not found")
    result = _plan_dict(plan)
    # 方案可能已落成 SplitDeal，一并带出，方便对账
    if plan.deal_id:
        rows = session.exec(
            select(SplitDeal).where(
                SplitDeal.deal_id == plan.deal_id, SplitDeal.deleted_at.is_(None)
            )
        ).all()
        result["split_deals"] = [
            {
                "id": str(row.id),
                "participant_role": row.participant_role,
                "participant_user_id": (
                    str(row.participant_user_id) if row.participant_user_id else None
                ),
                "participant_partner_id": (
                    str(row.participant_partner_id)
                    if row.participant_partner_id
                    else None
                ),
                "split_rate": row.split_rate,
                "split_amount": row.split_amount,
                "status": row.status,
            }
            for row in rows
        ]
    return result
