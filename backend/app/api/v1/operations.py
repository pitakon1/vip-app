"""运营数据看板 API（管理员专用）。

提供整体运营数据视图，含：
- 流程转化漏斗（线索 → 带看 → 成交 → 签约）
- 日活 / 周活 / 月活（DAU / WAU / MAU，基于 last_login_at）
- 按国家区分的数据（房源 / 在租 / 月租金 / 本月收款，经 Project.country）
- 线索渠道分布
权限点：data:view（与经营数据查看一致）
"""
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlmodel import Session, select

from app.db import get_session
from app.core.auth import require_admin
from app.models import (
    Lead,
    Lease,
    LeaseStatus,
    Payment,
    PaymentStatus,
    Project,
    Property,
    User,
    ViewingAppointment,
)

router = APIRouter(prefix="/operations", tags=["operations"])


def _day_start(offset_days: int = 0) -> datetime:
    day = (datetime.utcnow() + timedelta(days=offset_days)).date()
    return datetime(day.year, day.month, day.day)


@router.get("/overview")
def operations_overview(
    session: Session = Depends(get_session),
    user: User = Depends(require_admin),
):
    """运营数据看板聚合。"""
    now = datetime.utcnow()
    today = _day_start(0)
    month_start = datetime(now.year, now.month, 1)

    # ---- 转化漏斗 ----
    leads_total = session.exec(
        select(func.count(Lead.id)).where(Lead.deleted_at.is_(None))
    ).one()
    leads_by_stage = dict(
        session.exec(
            select(Lead.stage, func.count(Lead.id))
            .where(Lead.deleted_at.is_(None))
            .group_by(Lead.stage)
        ).all()
    )
    viewings_total = session.exec(
        select(func.count(ViewingAppointment.id)).where(
            ViewingAppointment.deleted_at.is_(None),
            ViewingAppointment.status.in_(["completed", "confirmed", "pending"]),
        )
    ).one()
    closed_leads = session.exec(
        select(func.count(Lead.id)).where(
            Lead.deleted_at.is_(None), Lead.stage == "closed"
        )
    ).one()
    active_leases = session.exec(
        select(func.count(Lease.id)).where(
            Lease.deleted_at.is_(None), Lease.status == LeaseStatus.active
        )
    ).one()
    month_paid = session.exec(
        select(func.coalesce(func.sum(Payment.amount), 0.0)).where(
            Payment.deleted_at.is_(None),
            Payment.status == PaymentStatus.succeeded,
            Payment.paid_at >= month_start,
        )
    ).one()

    def pct(n: int, d: int) -> float:
        return round((n / d * 100), 1) if d else 0.0

    funnel = [
        {"stage": "有效线索", "key": "leads", "value": int(leads_total), "rate": 100.0},
        {
            "stage": "确认带看",
            "key": "viewings",
            "value": int(viewings_total),
            "rate": pct(viewings_total, int(leads_total)),
        },
        {
            "stage": "成交线索",
            "key": "closed",
            "value": int(closed_leads),
            "rate": pct(closed_leads, int(leads_total)),
        },
        {
            "stage": "在租合同",
            "key": "leases",
            "value": int(active_leases),
            "rate": pct(active_leases, int(closed_leads)),
        },
    ]
    leads_by_stage_out = {str(k): int(v) for k, v in leads_by_stage.items()}

    # ---- 活跃度：按 last_login_at ----
    dau = session.exec(
        select(func.count(User.id)).where(User.last_login_at >= today)
    ).one()
    wau = session.exec(
        select(func.count(User.id)).where(User.last_login_at >= _day_start(-6))
    ).one()
    mau = session.exec(
        select(func.count(User.id)).where(User.last_login_at >= _day_start(-29))
    ).one()
    active_by_role = {
        str(k): int(v)
        for k, v in session.exec(
            select(User.role, func.count(User.id))
            .where(User.last_login_at >= _day_start(-29))
            .group_by(User.role)
        ).all()
    }

    # ---- 近 30 日每日活跃 ----
    daily = {}
    for i in range(29, -1, -1):
        key = (_day_start(-i)).date().isoformat()
        daily[key] = 0
    for day, cnt in session.exec(
        select(
            func.date(User.last_login_at),
            func.count(User.id),
        )
        .where(User.last_login_at >= _day_start(-29))
        .group_by(func.date(User.last_login_at))
    ).all():
        daily[str(day)] = int(cnt)

    # ---- 按国家（Project.country） ----
    from sqlalchemy import case as sa_case

    rented_sum = func.sum(sa_case((Property.status == "rented", 1), else_=0))
    country_rows = session.exec(
        select(
            Project.country,
            func.count(Property.id),
            rented_sum,
        )
        .join(Project, Property.project_id == Project.id)
        .where(
            Property.deleted_at.is_(None),
            Project.deleted_at.is_(None),
            Project.country.is_not(None),
        )
        .group_by(Project.country)
    ).all()
    country_list = []
    for country, total, rented in country_rows:
        rented_n = rented or 0
        country_list.append(
            {
                "country": country,
                "properties": int(total),
                "rented": int(rented_n),
                "occupancy": round((rented_n / total * 100), 1) if total else 0.0,
            }
        )
    country_list.sort(key=lambda c: c["properties"], reverse=True)

    # ---- 线索渠道分布 ----
    source_rows = session.exec(
        select(Lead.source, func.count(Lead.id))
        .where(Lead.deleted_at.is_(None), Lead.source.is_not(None))
        .group_by(Lead.source)
    ).all()
    source_list = [{"source": str(s), "count": int(c)} for s, c in source_rows]

    return {
        "funnel": funnel,
        "leads_by_stage": leads_by_stage_out,
        "activity": {"dau": int(dau), "wau": int(wau), "mau": int(mau), "by_role": active_by_role, "daily": daily},
        "by_country": country_list,
        "sources": source_list,
        "revenue": {"month_paid": float(month_paid), "currency": "THB"},
    }


@router.get("/activity")
def operations_activity(
    days: int = 30,
    granularity: str = "day",
    session: Session = Depends(get_session),
    user: User = Depends(require_admin),
):
    """活跃趋势，支持上卷：granularity = day | week | month。"""
    days = max(7, min(90, days))
    if granularity not in ("day", "week", "month"):
        granularity = "day"
    start = _day_start(-(days - 1))
    rows = session.exec(
        select(
            func.date(User.last_login_at),
            func.count(User.id),
        )
        .where(User.last_login_at >= start)
        .group_by(func.date(User.last_login_at))
    ).all()

    if granularity == "day":
        out: dict[str, int] = {}
        for i in range(days - 1, -1, -1):
            out[_day_start(-i).date().isoformat()] = 0
        for day, cnt in rows:
            out[str(day)] = int(cnt)
        return {"granularity": "day", "days": days, "series": out}

    if granularity == "week":
        buckets: dict[str, int] = {}
        for day, cnt in rows:
            d = datetime.strptime(str(day), "%Y-%m-%d").date()
            iso = d.isocalendar()
            key = f"{iso[0]}-W{iso[1]:02d}"
            buckets[key] = buckets.get(key, 0) + int(cnt)
        ordered = [
            k
            for k in sorted(buckets.keys())
        ]
        return {
            "granularity": "week",
            "days": days,
            "series": {k: buckets.get(k, 0) for k in ordered},
        }

    buckets_m: dict[str, int] = {}
    for day, cnt in rows:
        key = str(day)[:7]  # YYYY-MM
        buckets_m[key] = buckets_m.get(key, 0) + int(cnt)
    return {
        "granularity": "month",
        "days": days,
        "series": {k: buckets_m[k] for k in sorted(buckets_m.keys())},
    }


@router.get("/country/{country}")
def operations_country_detail(
    country: str,
    session: Session = Depends(get_session),
    user: User = Depends(require_admin),
):
    """国家下钻：按城市聚合房源 / 在租 / 出租率。"""
    from sqlalchemy import case as sa_case

    rented_sum = func.sum(sa_case((Property.status == "rented", 1), else_=0))
    rows = session.exec(
        select(
            Project.city,
            func.count(Property.id),
            rented_sum,
        )
        .join(Project, Property.project_id == Project.id)
        .where(
            Property.deleted_at.is_(None),
            Project.deleted_at.is_(None),
            Project.country == country,
        )
        .group_by(Project.city)
    ).all()
    cities = []
    total_props = 0
    for city, total, rented in rows:
        rented_n = rented or 0
        total_props += int(total)
        cities.append(
            {
                "city": city or "未分区",
                "properties": int(total),
                "rented": int(rented_n),
                "occupancy": round((rented_n / total * 100), 1) if total else 0.0,
            }
        )
    cities.sort(key=lambda c: c["properties"], reverse=True)
    return {"country": country, "total_properties": total_props, "cities": cities}


@router.get("/trend")
def operations_activity_trend(
    days: int = 30,
    session: Session = Depends(get_session),
    user: User = Depends(require_admin),
):
    """近 N 日活跃趋势（按日）。"""
    days = max(7, min(90, days))
    daily = {}
    start = _day_start(-(days - 1))
    for i in range(days - 1, -1, -1):
        daily[_day_start(-i).date().isoformat()] = 0
    for day, cnt in session.exec(
        select(
            func.date(User.last_login_at),
            func.count(User.id),
        )
        .where(User.last_login_at >= start)
        .group_by(func.date(User.last_login_at))
    ).all():
        daily[str(day)] = int(cnt)
    return {"days": days, "daily": daily}