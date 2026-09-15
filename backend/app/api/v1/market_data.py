"""数据与决策壁垒路由：市场指数/报告、房源匹配评分、流失预警。

匹配结果与流失信号不止于「看」：`/matches/{id}/notify` 把推荐推送给租客，
`/churn-signals/{id}/assign` 把预警派发给员工跟进，与既有的 `/resolve` 形成闭环。
"""
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from app.db import get_session
from app.core.auth import get_current_user
from app.core.events import publish_event
from app.core.pagination import PaginationParams, paginate
from app.models import (
    User,
    UserRole,
    Employee,
    Lead,
    Lease,
    Notification,
    NotificationChannel,
    NotificationStatus,
    Property,
    MarketIndex,
    MarketReport,
    PropertyMatch,
    ChurnSignal,
)

router = APIRouter(prefix="/market-data", tags=["market-data"])

_ADMIN_ROLES = (UserRole.admin, UserRole.agent, UserRole.employee)


def _require_staff(user: User) -> None:
    if user.role not in _ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="No permission")


def _notify_user(
    session: Session,
    user_id: Optional[uuid.UUID],
    template_key: str,
    subject: str,
    content: str,
    entity_type: str,
    entity_id: uuid.UUID,
) -> bool:
    """写入站内通知并幂等去重（同一收件人 + 同一模板 + 同一实体只推一次）。

    返回 True 表示本次真正新建了通知。
    """
    if not user_id:
        return False
    exists = session.exec(
        select(Notification).where(
            Notification.template_key == template_key,
            Notification.related_entity_id == entity_id,
            Notification.user_id == user_id,
        )
    ).first()
    if exists:
        return False
    session.add(
        Notification(
            id=uuid.uuid4(),
            user_id=user_id,
            channel=NotificationChannel.in_app,
            template_key=template_key,
            recipient=str(user_id),
            subject=subject,
            content=content,
            status=NotificationStatus.queued,
            related_entity_type=entity_type,
            related_entity_id=entity_id,
        )
    )
    return True


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


class MatchNotifyIn(BaseModel):
    """把匹配结果推送给租客；user_id 缺省时用匹配记录上的接收人。"""

    user_id: Optional[uuid.UUID] = None


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
    _require_staff(user)
    lead = session.get(Lead, lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    props = session.exec(
        select(Property).where(Property.deleted_at.is_(None), Property.status == "vacant")
    ).all()
    scored = sorted(
        ((_compute_match(lead, p), p) for p in props), key=lambda x: x[0], reverse=True
    )[:limit]
    existing_rows = session.exec(
        select(PropertyMatch).where(
            PropertyMatch.lead_id == lead_id,
            PropertyMatch.deleted_at.is_(None),
        )
    ).all()
    by_property = {row.property_id: row for row in existing_rows}
    results = []
    for score, prop in scored:
        match = by_property.get(prop.id)
        if match:
            match.score = score
        else:
            match = PropertyMatch(lead_id=lead_id, property_id=prop.id, score=score)
        session.add(match)
        results.append((match, prop, score))
    # 统一提交，避免逐条 commit 造成 N 次往返（uuid 主键在构造时已生成）
    session.flush()
    session.commit()
    return {
        "lead_id": str(lead_id),
        "total": len(results),
        "items": [
            {
                "id": str(match.id),
                "property_id": str(prop.id),
                "room_number": prop.room_number,
                "address": prop.address,
                "monthly_rent": prop.monthly_rent,
                "currency": prop.currency,
                "score": score,
            }
            for match, prop, score in results
        ],
    }


@router.get("/matches")
def list_matches(
    lead_id: Optional[uuid.UUID] = None,
    user_id: Optional[uuid.UUID] = None,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """匹配列表（带上房源信息与推送状态，供撮合页展示与推送）。"""
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
    props: dict = {}
    if rows:
        property_ids = [m.property_id for m in rows]
        props = {
            p.id: p
            for p in session.exec(
                select(Property).where(Property.id.in_(property_ids))
            ).all()
        }
    return [
        {
            "id": str(m.id),
            "lead_id": str(m.lead_id) if m.lead_id else None,
            "user_id": str(m.user_id) if m.user_id else None,
            "property_id": str(m.property_id),
            "room_number": props[m.property_id].room_number if m.property_id in props else None,
            "address": props[m.property_id].address if m.property_id in props else None,
            "monthly_rent": props[m.property_id].monthly_rent if m.property_id in props else None,
            "currency": props[m.property_id].currency if m.property_id in props else None,
            "score": m.score,
            "reason": m.reason,
            "seen": m.seen,
            "notified_at": m.notified_at.isoformat() if m.notified_at else None,
            "created_at": m.created_at.isoformat() if m.created_at else None,
        }
        for m in rows
    ]


@router.post("/matches/{match_id}/notify")
def notify_match(
    match_id: uuid.UUID,
    req: MatchNotifyIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """把匹配结果以站内通知推送给租客。

    仅首次推送会落通知（`notified_at` 既是推送时间也是幂等闸门），
    重复调用只回读状态，不会产生第二条通知。
    """
    _require_staff(user)
    match = session.get(PropertyMatch, match_id)
    if not match or match.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Match not found")
    target = req.user_id or match.user_id
    if not target:
        raise HTTPException(
            status_code=400,
            detail="Match has no recipient, please specify user_id",
        )
    prop = session.get(Property, match.property_id)
    name = prop.display_name if prop else str(match.property_id)
    if prop:
        content = (
            f"为您匹配到房源 {name}（房号 {prop.room_number}），"
            f"月租 {prop.monthly_rent} {prop.currency or 'THB'}，"
            f"匹配度 {match.score} 分，地址：{prop.address}。如需看房请联系您的顾问。"
        )
    else:
        content = f"为您匹配到房源 {name}，匹配度 {match.score} 分。"

    first_push = match.notified_at is None
    created = False
    if first_push:
        created = _notify_user(
            session,
            target,
            "property_match_recommend",
            "为您推荐房源",
            content,
            "property_match",
            match.id,
        )
        match.notified_at = datetime.utcnow()
    if match.user_id is None:
        match.user_id = target
    session.add(match)
    if first_push:
        publish_event(
            session,
            "property_match.notified",
            "property_match",
            match.id,
            {
                "user_id": str(target),
                "property_id": str(match.property_id),
                "score": match.score,
                "notified_by": str(user.id),
            },
        )
    session.commit()
    session.refresh(match)
    return {
        "id": str(match.id),
        "user_id": str(target),
        "notified_at": match.notified_at.isoformat() if match.notified_at else None,
        "notification_created": created,
        "already_notified": not first_push,
    }


# —— 流失预警 ——


class ChurnAssignIn(BaseModel):
    """派发流失预警给员工跟进；assignee_id 缺省时取租约上的负责员工。"""

    assignee_id: Optional[uuid.UUID] = None
    note: Optional[str] = None


def _resolve_assignee(
    session: Session, signal: ChurnSignal, assignee_id: Optional[uuid.UUID]
) -> Optional[Employee]:
    """确定跟进人：优先入参指定的员工，其次信号关联租约上的负责员工。"""
    if assignee_id:
        employee = session.get(Employee, assignee_id)
        if not employee or employee.deleted_at is not None:
            raise HTTPException(status_code=404, detail="Employee not found")
        return employee
    if not signal.lease_id:
        return None
    lease = session.get(Lease, signal.lease_id)
    if not lease or not lease.agent_id:
        return None
    employee = session.get(Employee, lease.agent_id)
    if not employee or employee.deleted_at is not None:
        return None
    return employee


@router.get("/churn-signals")
def list_churn_signals(
    level: Optional[str] = None,
    is_resolved: Optional[bool] = None,
    pagination: PaginationParams = Depends(),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """流失预警信号（管理/经纪人跟进）。"""
    _require_staff(user)
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

    # 跟进人姓名一次性查齐，避免每行回查
    employee_ids = [s.assigned_to for s in items if s.assigned_to]
    names: dict = {}
    if employee_ids:
        employees = session.exec(
            select(Employee).where(Employee.id.in_(employee_ids))
        ).all()
        users = {
            u.id: u
            for u in session.exec(
                select(User).where(User.id.in_([e.user_id for e in employees]))
            ).all()
        }
        names = {
            e.id: (users[e.user_id].full_name if users.get(e.user_id) else None)
            for e in employees
        }

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
                "assigned_to": str(s.assigned_to) if s.assigned_to else None,
                "assigned_to_name": names.get(s.assigned_to) if s.assigned_to else None,
                "assigned_at": s.assigned_at.isoformat() if s.assigned_at else None,
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
    _require_staff(user)
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


@router.post("/churn-signals/{signal_id}/assign")
def assign_churn_signal(
    signal_id: uuid.UUID,
    req: ChurnAssignIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """把流失预警派发给员工跟进：落库跟进人 + 给该员工发站内待办通知。"""
    _require_staff(user)
    sig = session.get(ChurnSignal, signal_id)
    if not sig or sig.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Signal not found")
    if sig.is_resolved:
        raise HTTPException(status_code=400, detail="Signal already resolved")
    employee = _resolve_assignee(session, sig, req.assignee_id)
    if employee is None:
        raise HTTPException(
            status_code=400,
            detail="No assignee available, please specify assignee_id",
        )
    detail = sig.detail or "该租客存在流失风险"
    action = sig.suggested_action or "安排回访，确认续约/复购意向"
    created = _notify_user(
        session,
        employee.user_id,
        "churn_signal_followup",
        "流失预警·待跟进",
        f"{detail}。建议动作：{action}。"
        + (f"备注：{req.note}。" if req.note else "")
        + "请在处理完成后在数据决策页将该信号标记为已处理。",
        "churn_signal",
        sig.id,
    )
    first_assign = sig.assigned_to is None
    sig.assigned_to = employee.id
    sig.assigned_at = datetime.utcnow()
    session.add(sig)
    publish_event(
        session,
        "churn_signal.assigned",
        "churn_signal",
        sig.id,
        {
            "assignee_id": str(employee.id),
            "assignee_user_id": str(employee.user_id),
            "note": req.note,
            "assigned_by": str(user.id),
        },
    )
    session.commit()
    session.refresh(sig)
    return {
        "id": str(sig.id),
        "assigned_to": str(sig.assigned_to),
        "assigned_at": sig.assigned_at.isoformat() if sig.assigned_at else None,
        "notification_created": created,
        "reassigned": not first_assign,
    }


@router.post("/churn-signals/{signal_id}/resolve")
def resolve_churn_signal(
    signal_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    _require_staff(user)
    sig = session.get(ChurnSignal, signal_id)
    if not sig:
        raise HTTPException(status_code=404, detail="Signal not found")
    sig.is_resolved = True
    sig.resolved_at = datetime.utcnow()
    session.add(sig)
    session.commit()
    return {"id": str(sig.id), "is_resolved": True}