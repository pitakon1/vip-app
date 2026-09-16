"""运营数据看板 API（管理员专用）。

提供整体运营数据视图，含：
- 流程转化漏斗（线索 → 带看 → 成交 → 签约）
- 日活 / 周活 / 月活（DAU / WAU / MAU，基于 last_login_at）
- 按国家区分的数据（房源 / 在租 / 月租金 / 本月收款，经 Project.country）
- 线索渠道分布
权限点：data:view（与经营数据查看一致）
"""
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict
from sqlalchemy import case as sa_case
from sqlalchemy import func
from sqlmodel import Session, select

from app.db import get_session
from app.core.auth import require_admin
from app.core.cache import get_cache, set_cache
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


class OperationsOverviewOut(BaseModel):
    """运营数据看板聚合。"""

    model_config = ConfigDict(extra="allow")

    funnel: Optional[list] = None
    leads_by_stage: Optional[dict] = None
    activity: Optional[dict] = None
    by_country: Optional[list] = None
    sources: Optional[list] = None
    revenue: Optional[dict] = None


class ActivityTrendOut(BaseModel):
    """活跃趋势（day / week / month 上卷）。"""

    model_config = ConfigDict(extra="allow")

    granularity: Optional[str] = None
    days: Optional[int] = None
    series: Optional[dict] = None


class CountryDetailOut(BaseModel):
    """国家下钻：按城市聚合房源 / 在租 / 出租率。"""

    model_config = ConfigDict(extra="allow")

    country: Optional[str] = None
    total_properties: Optional[int] = None
    cities: Optional[list] = None


class DailyTrendOut(BaseModel):
    """近 N 日活跃趋势（按日）。"""

    model_config = ConfigDict(extra="allow")

    days: Optional[int] = None
    daily: Optional[dict] = None

# 看板聚合较重（十余次查询），加短 TTL 缓存；管理员查看容忍分钟级延迟
OVERVIEW_CACHE_KEY = "operations:overview"
OVERVIEW_CACHE_TTL = 60


def _day_start(offset_days: int = 0) -> datetime:
    day = (datetime.utcnow() + timedelta(days=offset_days)).date()
    return datetime(day.year, day.month, day.day)


def _activity_counts(session: Session, today: datetime) -> tuple[int, int, int]:
    """一次条件聚合同时算出 DAU/WAU/MAU（原实现为 3 次独立 count）。"""
    wau_start = _day_start(-6)
    mau_start = _day_start(-29)
    row = session.exec(
        select(
            func.sum(sa_case((User.last_login_at >= today, 1), else_=0)),
            func.sum(sa_case((User.last_login_at >= wau_start, 1), else_=0)),
            func.sum(sa_case((User.last_login_at >= mau_start, 1), else_=0)),
        ).where(User.last_login_at >= mau_start)
    ).one()
    dau, wau, mau = (int(v or 0) for v in row)
    return dau, wau, mau


def _daily_active(session: Session, days: int) -> dict[str, int]:
    """近 N 日每日活跃用户数（缺失日期补 0）。

    /overview、/activity（day）、/trend 三处原本各写了一遍同样的逻辑。
    """
    start = _day_start(-(days - 1))
    out: dict[str, int] = {}
    for i in range(days - 1, -1, -1):
        out[_day_start(-i).date().isoformat()] = 0
    for day, cnt in session.exec(
        select(func.date(User.last_login_at), func.count(User.id))
        .where(User.last_login_at >= start)
        .group_by(func.date(User.last_login_at))
    ).all():
        out[str(day)] = int(cnt)
    return out


@router.get("/overview", response_model=OperationsOverviewOut)
def operations_overview(
    session: Session = Depends(get_session),
    user: User = Depends(require_admin),
):
    """运营数据看板聚合（60s 缓存）。"""
    cached = get_cache(OVERVIEW_CACHE_KEY)
    if cached is not None:
        return cached

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
    dau, wau, mau = _activity_counts(session, today)
    active_by_role = {
        str(k): int(v)
        for k, v in session.exec(
            select(User.role, func.count(User.id))
            .where(User.last_login_at >= _day_start(-29))
            .group_by(User.role)
        ).all()
    }

    # ---- 近 30 日每日活跃 ----
    daily = _daily_active(session, 30)

    # ---- 按国家（Project.country） ----
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

    payload = {
        "funnel": funnel,
        "leads_by_stage": leads_by_stage_out,
        "activity": {"dau": int(dau), "wau": int(wau), "mau": int(mau), "by_role": active_by_role, "daily": daily},
        "by_country": country_list,
        "sources": source_list,
        "revenue": {"month_paid": float(month_paid), "currency": "THB"},
    }
    set_cache(OVERVIEW_CACHE_KEY, payload, OVERVIEW_CACHE_TTL)
    return payload


@router.get("/activity", response_model=ActivityTrendOut)
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
        return {
            "granularity": "day",
            "days": days,
            "series": _daily_active(session, days),
        }

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


@router.get("/country/{country}", response_model=CountryDetailOut)
def operations_country_detail(
    country: str,
    session: Session = Depends(get_session),
    user: User = Depends(require_admin),
):
    """国家下钻：按城市聚合房源 / 在租 / 出租率。"""
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


@router.get("/trend", response_model=DailyTrendOut)
def operations_activity_trend(
    days: int = 30,
    session: Session = Depends(get_session),
    user: User = Depends(require_admin),
):
    """近 N 日活跃趋势（按日）。"""
    days = max(7, min(90, days))
    return {"days": days, "daily": _daily_active(session, days)}