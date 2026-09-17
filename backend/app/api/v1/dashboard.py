"""Dashboard 路由：运营数据概览。"""
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, func
from sqlmodel import Session, select

from app.db import get_session
from app.core.auth import require_agent, require_admin
from app.core.cache import get_cache, set_cache
from app.schemas.dashboard import (
    DashboardSummaryOut,
    ExpiringLeasesOut,
    FinancialReconciliationOut,
    OperationalTrendOut,
    PropertyStatusDistributionOut,
    RecentPaymentsOut,
)
from app.models import (
    Lead,
    LeadStage,
    Lease,
    LeaseStatus,
    MaintenanceTicket,
    Property,
    PropertyStatus,
    Payment,
    PaymentStatus,
    Tenant,
    User,
    ViewingAppointment,
)

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def _prop_name(p: Property | None) -> str | None:
    """房源展示名：房号优先，其次地址（与 Property.display_name 同一口径）。"""
    return p.display_name if p is not None else None


def _shift_month(back: int) -> tuple[int, int]:
    """返回「当前月往前推 back 个月」的 (年, 月)。

    用整数月序号做减法，避免 `datetime.replace(month=负数)` 抛
    `ValueError: month must be in 1..12`（months 超过当前月份时会越界）。
    """
    now = datetime.utcnow()
    total = now.year * 12 + (now.month - 1) - back
    return total // 12, total % 12 + 1


def _month_keys(months: int) -> list[str]:
    """近 months 个月的月份标签（`YYYY-MM`），从最早到最新。"""
    return [
        f"{year:04d}-{month:02d}" for year, month in (
            _shift_month(back) for back in range(months - 1, -1, -1)
        )
    ]


def _monthly_counts(session: Session, model, date_field, start: datetime) -> dict[str, int]:
    """按月统计行数，聚合下推到 SQL（GROUP BY 年月），避免把窗口内所有行拉进内存。"""
    year_expr = func.extract("year", date_field)
    month_expr = func.extract("month", date_field)
    rows = session.exec(
        select(year_expr, month_expr, func.count(model.id))
        .where(model.deleted_at.is_(None), date_field >= start)
        .group_by(year_expr, month_expr)
    ).all()
    return {
        f"{int(year):04d}-{int(month):02d}": int(count or 0)
        for year, month, count in rows
        if year is not None and month is not None
    }


@router.get("/summary", response_model=DashboardSummaryOut)
def get_summary(
    session: Session = Depends(get_session),
    user: User = Depends(require_agent),
):
    """获取运营概览：房源总数、空置、已出租、即将到期合同、即将到期租金等。"""
    cache_key = "cache:dashboard:summary"
    cached = get_cache(cache_key)
    if cached is not None:
        return cached

    total = session.exec(
        select(func.count(Property.id)).where(Property.deleted_at.is_(None))
    ).one()
    vacant = session.exec(
        select(func.count(Property.id)).where(
            Property.deleted_at.is_(None),
            Property.status == PropertyStatus.vacant,
        )
    ).one()
    rented = session.exec(
        select(func.count(Property.id)).where(
            Property.deleted_at.is_(None),
            Property.status == PropertyStatus.rented,
        )
    ).one()
    maintenance = session.exec(
        select(func.count(Property.id)).where(
            Property.deleted_at.is_(None),
            Property.status == PropertyStatus.maintenance,
        )
    ).one()

    now = datetime.utcnow()
    thirty_days_later = now + timedelta(days=30)
    expiring_leases = session.exec(
        select(func.count(Lease.id)).where(
            Lease.end_date <= thirty_days_later,
            Lease.end_date >= now,
            Lease.status == LeaseStatus.active,
            Lease.deleted_at.is_(None),
        )
    ).one()

    seven_days_later = now + timedelta(days=7)
    upcoming_payments = session.exec(
        select(func.count(Payment.id)).where(
            Payment.due_date <= seven_days_later,
            Payment.due_date >= now,
            Payment.status == PaymentStatus.pending,
            Payment.deleted_at.is_(None),
        )
    ).one()

    # 月度收入（已成功的付款）
    monthly_revenue = session.exec(
        select(func.coalesce(func.sum(Payment.amount), 0)).where(
            Payment.status == PaymentStatus.succeeded,
            Payment.deleted_at.is_(None),
        )
    ).one()

    # 活跃租约的月租金总收入
    active_lease_revenue = session.exec(
        select(func.coalesce(func.sum(Lease.monthly_rent), 0)).where(
            Lease.status == LeaseStatus.active,
            Lease.deleted_at.is_(None),
        )
    ).one()

    # 入住率
    occupancy_rate = round(rented / total * 100, 1) if total > 0 else 0

    # 活跃线索数
    active_leads = session.exec(
        select(func.count(Lead.id)).where(
            Lead.stage != LeadStage.closed,
            Lead.deleted_at.is_(None),
        )
    ).one()

    # 已成交线索数
    closed_leads = session.exec(
        select(func.count(Lead.id)).where(
            Lead.stage == LeadStage.closed,
            Lead.deleted_at.is_(None),
        )
    ).one()

    # 成交率
    conversion_rate = round(closed_leads / (closed_leads + active_leads) * 100, 1) if (closed_leads + active_leads) > 0 else 0

    result = {
        "total_properties": total,
        "vacant": vacant,
        "rented": rented,
        "maintenance": maintenance,
        "expiring_leases": expiring_leases,
        "upcoming_payments": upcoming_payments,
        "monthly_revenue": float(monthly_revenue),
        "active_lease_revenue": float(active_lease_revenue),
        "occupancy_rate": occupancy_rate,
        "active_leads": active_leads,
        "closed_leads": closed_leads,
        "conversion_rate": conversion_rate,
    }
    set_cache(cache_key, result, ttl=60)
    return result


@router.get("/recent-payments", response_model=RecentPaymentsOut)
def get_recent_payments(
    session: Session = Depends(get_session),
    user: User = Depends(require_agent),
):
    """获取最近 10 笔付款记录（附带付款人名称）。"""
    payments = session.exec(
        select(Payment)
        .where(Payment.deleted_at.is_(None))
        .order_by(Payment.created_at.desc())
        .limit(10)
    ).all()
    payer_ids = {p.payer_id for p in payments if p.payer_id}
    users = (
        {u.id: u for u in session.exec(select(User).where(User.id.in_(payer_ids))).all()}
        if payer_ids
        else {}
    )
    return {
        "items": [
            {
                "id": str(p.id),
                "amount": p.amount,
                "currency": p.currency,
                "payment_type": p.payment_type.value if p.payment_type else None,
                "status": p.status.value if p.status else None,
                "channel": p.channel,
                "due_date": p.due_date.isoformat() if p.due_date else None,
                "paid_at": p.paid_at.isoformat() if p.paid_at else None,
                "created_at": p.created_at.isoformat() if p.created_at else None,
                "description": p.description,
                "payer_name": users.get(p.payer_id).full_name
                if users.get(p.payer_id)
                else None,
            }
            for p in payments
        ]
    }


@router.get("/expiring-leases", response_model=ExpiringLeasesOut)
def get_expiring_leases(
    session: Session = Depends(get_session),
    user: User = Depends(require_agent),
):
    """获取 30 天内即将到期的租约（附带房源与租客名称）。"""
    now = datetime.utcnow()
    thirty_days_later = now + timedelta(days=30)
    leases = session.exec(
        select(Lease)
        .where(
            Lease.end_date <= thirty_days_later,
            Lease.end_date >= now,
            Lease.status == LeaseStatus.active,
            Lease.deleted_at.is_(None),
        )
        .order_by(Lease.end_date.asc())
    ).all()
    # 只加载被这批租约引用的房源 / 租客 / 用户，避免全表加载
    prop_ids = {lease.property_id for lease in leases}
    props = {}
    if prop_ids:
        props = {
            p.id: p
            for p in session.exec(select(Property).where(Property.id.in_(prop_ids))).all()
        }
    tenant_ids = {lease.tenant_id for lease in leases}
    tenants = {}
    if tenant_ids:
        tenants = {
            t.id: t
            for t in session.exec(select(Tenant).where(Tenant.id.in_(tenant_ids))).all()
        }
    user_ids = {t.user_id for t in tenants.values() if t.user_id}
    users = {}
    if user_ids:
        users = {
            u.id: u
            for u in session.exec(select(User).where(User.id.in_(user_ids))).all()
        }
    return {
        "items": [
            {
                "id": str(lease.id),
                "property_id": str(lease.property_id),
                "property_name": _prop_name(props.get(lease.property_id)),
                "tenant_id": str(lease.tenant_id),
                "tenant_name": users.get(tenants.get(lease.tenant_id).user_id).full_name
                if tenants.get(lease.tenant_id)
                and users.get(tenants[lease.tenant_id].user_id)
                else None,
                "monthly_rent": lease.monthly_rent,
                "currency": lease.currency,
                "end_date": lease.end_date.isoformat(),
                "days_left": max(0, (lease.end_date - now).days),
            }
            for lease in leases
        ]
    }


@router.get(
    "/property-status-distribution", response_model=PropertyStatusDistributionOut
)
def get_property_status_distribution(
    session: Session = Depends(get_session),
    user: User = Depends(require_agent),
):
    """获取房源状态分布。"""
    statuses = session.exec(
        select(Property.status, func.count(Property.id))
        .where(Property.deleted_at.is_(None))
        .group_by(Property.status)
    ).all()
    return {
        "items": [
            {"status": str(s), "count": c} for s, c in statuses
        ]
    }


@router.get("/financial-reconciliation", response_model=FinancialReconciliationOut)
def financial_reconciliation(
    limit: int = Query(200, ge=1, le=2000),
    offset: int = Query(0, ge=0),
    session: Session = Depends(get_session),
    user: User = Depends(require_admin),
):
    """财务对账明细（Admin）：按房源聚合已收/应收/逾期，并附逐笔记录。

    供管理端「财务对账」页面渲染，形成管理端财权闭环。

    - `totals` / `by_property` 由 SQL 条件聚合（CASE WHEN）得出，按房源分桶；
    - `records` 为逐笔明细，按创建时间倒序分页（`limit`/`offset`，默认 200 条），
      总笔数由 `records_total` 给出；
    - 房源名只按被引用的 ID 加载，不做全表加载。
    """
    now = datetime.utcnow()
    # 分桶口径：succeeded → 已收；否则到期日已过 → 逾期；未到期或无到期日 → 应收
    is_received = Payment.status == PaymentStatus.succeeded
    is_overdue = (
        ~is_received & Payment.due_date.is_not(None) & (Payment.due_date < now)
    )
    is_receivable = ~is_received & ~is_overdue

    def _sum(condition):
        return func.coalesce(func.sum(case((condition, Payment.amount), else_=0.0)), 0.0)

    grouped = session.exec(
        select(
            Payment.property_id,
            func.count(Payment.id),
            _sum(is_received),
            _sum(is_receivable),
            _sum(is_overdue),
        )
        .where(Payment.deleted_at.is_(None))
        .group_by(Payment.property_id)
    ).all()

    by_property = []
    key_to_id = {}
    for property_id, count, received, receivable, overdue in grouped:
        key = str(property_id) if property_id else "none"
        if property_id:
            key_to_id[key] = property_id
        by_property.append(
            {
                "property_id": key,
                "property": None,  # 稍后按 ID 回填名称
                "received": round(float(received or 0), 2),
                "receivable": round(float(receivable or 0), 2),
                "overdue": round(float(overdue or 0), 2),
                "count": int(count or 0),
            }
        )
    by_property.sort(key=lambda row: row["property_id"])

    totals = {
        "received": round(sum(row["received"] for row in by_property), 2),
        "receivable": round(sum(row["receivable"] for row in by_property), 2),
        "overdue": round(sum(row["overdue"] for row in by_property), 2),
        "count": sum(row["count"] for row in by_property),
    }

    conditions = Payment.deleted_at.is_(None)
    records_total = session.exec(
        select(func.count(Payment.id)).where(conditions)
    ).one()
    payments = session.exec(
        select(Payment)
        .where(conditions)
        .order_by(Payment.created_at.desc(), Payment.id)
        .offset(offset)
        .limit(limit)
    ).all()

    records = []
    for p in payments:
        if p.status == PaymentStatus.succeeded:
            bucket = "received"
        elif p.due_date and p.due_date < now:
            bucket = "overdue"
        else:
            bucket = "pending"
        if p.property_id:
            key_to_id.setdefault(str(p.property_id), p.property_id)
        records.append(
            {
                "id": str(p.id),
                "property_id": str(p.property_id) if p.property_id else None,
                "property": None,  # 稍后按 ID 回填名称
                "amount": p.amount or 0,
                "currency": p.currency,
                "payment_type": p.payment_type.value if p.payment_type else None,
                "status": p.status.value if p.status else None,
                "bucket": bucket,
                "channel": p.channel,
                "due_date": p.due_date.isoformat() if p.due_date else None,
                "paid_at": p.paid_at.isoformat() if p.paid_at else None,
                "created_at": p.created_at.isoformat() if p.created_at else None,
                "reconciliation_status": p.reconciliation_status or "unreconciled",
                "reconciled_at": p.reconciled_at.isoformat() if p.reconciled_at else None,
            }
        )

    # 只加载对账用到的房源（含已软删除的，保证历史记录仍能显示名称）
    props = {}
    if key_to_id:
        props = {
            p.id: p
            for p in session.exec(
                select(Property).where(Property.id.in_(set(key_to_id.values())))
            ).all()
        }

    for row in by_property:
        row["property"] = _prop_name(props.get(key_to_id.get(row["property_id"])))
    for record in records:
        property_id = record["property_id"]
        record["property"] = _prop_name(props.get(key_to_id.get(property_id)))

    return {
        "totals": totals,
        "by_property": by_property,
        "records": records,
        "records_total": records_total,
    }


@router.get("/trend", response_model=OperationalTrendOut)
def operational_trend(
    months: int = Query(12, ge=1, le=120),
    session: Session = Depends(get_session),
    user: User = Depends(require_admin),
):
    """运营趋势（Admin）：近 N 月新签租约、新线索、营收、新客看房预约逐月走势。"""
    year, month = _shift_month(months - 1)
    start = datetime(year, month, 1)

    revenue_year = func.extract("year", Payment.created_at)
    revenue_month = func.extract("month", Payment.created_at)
    revenue_rows = session.exec(
        select(revenue_year, revenue_month, func.sum(Payment.amount))
        .where(
            Payment.deleted_at.is_(None),
            Payment.status == PaymentStatus.succeeded,
            Payment.created_at >= start,
        )
        .group_by(revenue_year, revenue_month)
    ).all()
    monthly_revenue = {
        f"{int(y):04d}-{int(m):02d}": float(total or 0)
        for y, m, total in revenue_rows
        if y is not None and m is not None
    }

    lease_counts = _monthly_counts(session, Lease, Lease.created_at, start)
    lead_counts = _monthly_counts(session, Lead, Lead.created_at, start)
    viewing_counts = _monthly_counts(session, ViewingAppointment, ViewingAppointment.created_at, start)
    ticket_counts = _monthly_counts(session, MaintenanceTicket, MaintenanceTicket.created_at, start)

    # 生成完整的月份序列（含无数据的月份，避免前端折线出现断点）
    keys = _month_keys(months)
    series = [
        {
            "month": k,
            "revenue": round(monthly_revenue.get(k, 0), 2),
            "leases_new": lease_counts.get(k, 0),
            "leads_new": lead_counts.get(k, 0),
            "viewings_new": viewing_counts.get(k, 0),
            "maintenance_new": ticket_counts.get(k, 0),
        }
        for k in keys
    ]
    return {"months": len(keys), "series": series}
