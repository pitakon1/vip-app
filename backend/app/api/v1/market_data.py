"""数据与决策壁垒路由：市场指数/报告、房源匹配评分、流失预警。"""
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from app.db import get_session
from app.core.auth import get_current_user
from app.core.pagination import PaginationParams, paginate
from app.models import (
    User,
    UserRole,
    Lead,
    Property,
    MarketIndex,
    MarketReport,
    PropertyMatch,
    ChurnSignal,
)

router = APIRouter(prefix="/market-data", tags=["market-data"])

_ADMIN_ROLES = (UserRole.admin, UserRole.agent, UserRole.employee)


class IndexIn(BaseModel):
    market_code: str
    index_type: str = "sale"
    period: str
    value: float
    delta_pct: Optional[float] = None
    sample_count: int = 0
    avg_price_sqm: Optional[float] = None
    avg_rent: Optional[float] = None
    currency: str = "THB"


class ReportIn(BaseModel):
    market_code: str
    report_type: str = "district"
    area: Optional[str] = None
    property_type: Optional[str] = None
    period: str
    summary: Optional[str] = None
    metrics_json: Optional[str] = None


class MatchIn(BaseModel):
    lead_id: Optional[uuid.UUID] = None
    user_id: Optional[uuid.UUID] = None
    property_id: uuid.UUID
    score: int = 0
    reason: Optional[str] = None


@router.get("/indices")
def list_indices(
    market_code: Optional[str] = None,
    index_type: Optional[str] = None,
    period: Optional[str] = None,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """市场指数（公开数据）。"""
    query = (
        select(MarketIndex)
        .where(MarketIndex.deleted_at.is_(None), MarketIndex.published.is_(True))
        .order_by(MarketIndex.period.desc())
    )
    if market_code:
        query = query.where(MarketIndex.market_code == market_code.upper())
    if index_type:
        query = query.where(MarketIndex.index_type == index_type)
    if period:
        query = query.where(MarketIndex.period == period)
    rows = session.exec(query).all()
    return [
        {
            "id": str(i.id),
            "market_code": i.market_code,
            "index_type": i.index_type,
            "period": i.period,
            "value": i.value,
            "delta_pct": i.delta_pct,
            "sample_count": i.sample_count,
            "avg_price_sqm": i.avg_price_sqm,
            "avg_rent": i.avg_rent,
            "currency": i.currency,
        }
        for i in rows
    ]


@router.post("/indices")
def create_index(
    req: IndexIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    if user.role not in _ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="No permission")
    idx = MarketIndex(
        market_code=req.market_code.upper(),
        index_type=req.index_type,
        period=req.period,
        value=req.value,
        delta_pct=req.delta_pct,
        sample_count=req.sample_count,
        avg_price_sqm=req.avg_price_sqm,
        avg_rent=req.avg_rent,
        currency=req.currency,
    )
    session.add(idx)
    session.commit()
    session.refresh(idx)
    return {"id": str(idx.id), "market_code": idx.market_code, "period": idx.period, "value": idx.value}


@router.get("/reports")
def list_reports(
    market_code: Optional[str] = None,
    period: Optional[str] = None,
    pagination: PaginationParams = Depends(),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    query = (
        select(MarketReport)
        .where(MarketReport.deleted_at.is_(None), MarketReport.published.is_(True))
        .order_by(MarketReport.period.desc())
    )
    if market_code:
        query = query.where(MarketReport.market_code == market_code.upper())
    if period:
        query = query.where(MarketReport.period == period)
    items = session.exec(query).all()
    total = len(items)
    offset, limit = pagination.offset, pagination.limit
    return paginate(
        [
            {
                "id": str(r.id),
                "market_code": r.market_code,
                "report_type": r.report_type,
                "area": r.area,
                "property_type": r.property_type,
                "period": r.period,
                "summary": r.summary,
                "published_at": r.published_at.isoformat() if r.published_at else None,
            }
            for r in items
        ][offset : offset + limit],
        total,
        pagination,
    )


@router.post("/reports")
def create_report(
    req: ReportIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    if user.role not in _ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="No permission")
    r = MarketReport(
        market_code=req.market_code.upper(),
        report_type=req.report_type,
        area=req.area,
        property_type=req.property_type,
        period=req.period,
        summary=req.summary,
        metrics_json=req.metrics_json,
        published=True,
        published_at=datetime.utcnow(),
    )
    session.add(r)
    session.commit()
    session.refresh(r)
    return {"id": str(r.id), "market_code": r.market_code, "period": r.period}


# —— 房源匹配评分 ——


def _compute_match(lead: Lead, prop: Property) -> int:
    """简化的匹配评分：预算区间 + 物业类型 + 面积 + 空置状态。"""
    score = 0
    if prop.status == "vacant":
        score += 30
    # 预算匹配
    if lead.budget_min and lead.budget_max:
        if lead.budget_min <= prop.monthly_rent <= lead.budget_max:
            score += 40
        elif lead.budget_min <= prop.monthly_rent * 1.2:
            score += 15
    # 面积偏好（lead 无面积字段则跳过）
    score += 10
    return min(100, score)


@router.post("/matches/compute")
def compute_matches(
    lead_id: uuid.UUID,
    limit: int = 10,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """为指定线索计算房源匹配推荐并写入记录。"""
    if user.role not in _ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="No permission")
    lead = session.get(Lead, lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    props = session.exec(
        select(Property).where(Property.deleted_at.is_(None), Property.status == "vacant")
    ).all()
    scored = sorted(
        ((_compute_match(lead, p), p) for p in props), key=lambda x: x[0], reverse=True
    )[:limit]
    results = []
    for score, prop in scored:
        existing = session.exec(
            select(PropertyMatch).where(
                PropertyMatch.lead_id == lead_id,
                PropertyMatch.property_id == prop.id,
                PropertyMatch.deleted_at.is_(None),
            )
        ).first()
        if existing:
            existing.score = score
            session.add(existing)
        else:
            existing = PropertyMatch(
                lead_id=lead_id,
                property_id=prop.id,
                score=score,
            )
            session.add(existing)
        session.commit()
        session.refresh(existing)
        results.append(
            {
                "id": str(existing.id),
                "property_id": str(prop.id),
                "room_number": prop.room_number,
                "address": prop.address,
                "monthly_rent": prop.monthly_rent,
                "currency": prop.currency,
                "score": score,
            }
        )
    return {"lead_id": str(lead_id), "total": len(results), "items": results}


@router.get("/matches")
def list_matches(
    lead_id: Optional[uuid.UUID] = None,
    user_id: Optional[uuid.UUID] = None,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    query = (
        select(PropertyMatch)
        .where(PropertyMatch.deleted_at.is_(None))
        .order_by(PropertyMatch.score.desc())
    )
    if lead_id:
        query = query.where(PropertyMatch.lead_id == lead_id)
    if user_id:
        query = query.where(PropertyMatch.user_id == user_id)
    rows = session.exec(query).all()
    return [
        {
            "id": str(m.id),
            "lead_id": str(m.lead_id) if m.lead_id else None,
            "property_id": str(m.property_id),
            "score": m.score,
            "reason": m.reason,
            "seen": m.seen,
            "created_at": m.created_at.isoformat() if m.created_at else None,
        }
        for m in rows
    ]


# —— 流失预警 ——


@router.get("/churn-signals")
def list_churn_signals(
    level: Optional[str] = None,
    is_resolved: Optional[bool] = None,
    pagination: PaginationParams = Depends(),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """流失预警信号（管理/经纪人跟进）。"""
    if user.role not in _ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="No permission")
    query = (
        select(ChurnSignal)
        .where(ChurnSignal.deleted_at.is_(None))
        .order_by(ChurnSignal.triggered_at.desc())
    )
    if level:
        query = query.where(ChurnSignal.level == level)
    if is_resolved is not None:
        query = query.where(ChurnSignal.is_resolved == is_resolved)
    items = session.exec(query).all()
    total = len(items)
    offset, limit = pagination.offset, pagination.limit
    return paginate(
        [
            {
                "id": str(s.id),
                "tenant_id": str(s.tenant_id) if s.tenant_id else None,
                "user_id": str(s.user_id) if s.user_id else None,
                "lease_id": str(s.lease_id) if s.lease_id else None,
                "signal_type": s.signal_type,
                "level": s.level,
                "detail": s.detail,
                "triggered_at": s.triggered_at.isoformat() if s.triggered_at else None,
                "is_resolved": s.is_resolved,
                "suggested_action": s.suggested_action,
            }
            for s in items
        ][offset : offset + limit],
        total,
        pagination,
    )


@router.post("/churn-signals")
def create_churn_signal(
    signal_type: str = "lease_expiring",
    level: str = "info",
    detail: Optional[str] = None,
    suggested_action: Optional[str] = None,
    tenant_id: Optional[uuid.UUID] = None,
    user_id: Optional[uuid.UUID] = None,
    lease_id: Optional[uuid.UUID] = None,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    if user.role not in _ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="No permission")
    sig = ChurnSignal(
        signal_type=signal_type,
        level=level,
        detail=detail,
        suggested_action=suggested_action,
        tenant_id=tenant_id,
        user_id=user_id,
        lease_id=lease_id,
    )
    session.add(sig)
    session.commit()
    session.refresh(sig)
    return {
        "id": str(sig.id),
        "signal_type": sig.signal_type,
        "level": sig.level,
        "triggered_at": sig.triggered_at.isoformat() if sig.triggered_at else None,
    }


@router.post("/churn-signals/{signal_id}/resolve")
def resolve_churn_signal(
    signal_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    if user.role not in _ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="No permission")
    sig = session.get(ChurnSignal, signal_id)
    if not sig:
        raise HTTPException(status_code=404, detail="Signal not found")
    sig.is_resolved = True
    sig.resolved_at = datetime.utcnow()
    session.add(sig)
    session.commit()
    return {"id": str(sig.id), "is_resolved": True}