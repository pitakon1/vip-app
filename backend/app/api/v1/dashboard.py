"""Dashboard 路由：运营数据概览。"""
from collections import defaultdict
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlmodel import Session, select

from app.db import get_session
from app.core.auth import require_agent, require_admin
from app.core.cache import get_cache, set_cache
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


@router.get("/summary")
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


@router.get("/recent-payments")
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
    users = {u.id: u for u in session.exec(select(User)).all()}
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


@router.get("/expiring-leases")
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
    props = {
        p.id: p for p in session.exec(select(Property)).all()
    }
    tenants = {
        t.id: t for t in session.exec(select(Tenant)).all()
    }
    users = {
        u.id: u for u in session.exec(select(User)).all()
    }
    return {
        "items": [
            {
                "id": str(lease.id),
                "property_id": str(lease.property_id),
                "property_name": props.get(lease.property_id).title
                if props.get(lease.property_id)
                else None,
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


@router.get("/property-status-distribution")
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


@router.get("/financial-reconciliation")
def financial_reconciliation(
    session: Session = Depends(get_session),
    user: User = Depends(require_admin),
):
    """财务对账明细（Admin）：按房源聚合已收/应收/逾期，并附逐笔记录。

    供管理端「财务对账」页面渲染，形成管理端财权闭环。
    """
    payments = session.exec(
        select(Payment).where(Payment.deleted_at.is_(None))
    ).all()
    props = {p.id: p for p in session.exec(select(Property)).all()}
    now = datetime.utcnow()

    by_property: dict[str, dict] = defaultdict(
        lambda: {
            "received": 0.0,
            "receivable": 0.0,
            "overdue": 0.0,
            "count": 0,
        }
    )
    records = []
    for p in payments:
        prop = props.get(p.property_id)
        key = str(p.property_id) if p.property_id else "none"
        amount = p.amount or 0
        bucket = by_property[key]
        bucket["count"] += 1
        status = "received"
        if p.status == PaymentStatus.succeeded:
            bucket["received"] += amount
        else:
            is_overdue = bool(p.due_date and p.due_date < now)
            if is_overdue:
                bucket["overdue"] += amount
                status = "overdue"
            else:
                bucket["receivable"] += amount
                status = "pending"
        records.append(
            {
                "id": str(p.id),
                "property_id": str(p.property_id) if p.property_id else None,
                "property": prop.title if prop else None,
                "amount": amount,
                "currency": p.currency,
                "payment_type": p.payment_type.value if p.payment_type else None,
                "status": p.status.value if p.status else None,
                "bucket": status,
                "channel": p.channel,
                "due_date": p.due_date.isoformat() if p.due_date else None,
                "paid_at": p.paid_at.isoformat() if p.paid_at else None,
                "created_at": p.created_at.isoformat() if p.created_at else None,
            }
        )

    props_by_str = {str(p.id): p for p in props.values()}
    by_property_list = [
        {
            "property_id": key,
            "property": props_by_str[key].title if key in props_by_str else None,
            "received": round(v["received"], 2),
            "receivable": round(v["receivable"], 2),
            "overdue": round(v["overdue"], 2),
            "count": v["count"],
        }
        for key, v in sorted(by_property.items())
    ]

    totals = {k: round(sum(v[k] for v in by_property.values()), 2) for k in ("received", "receivable", "overdue")}
    totals["count"] = sum(v["count"] for v in by_property.values())
    return {
        "totals": totals,
        "by_property": by_property_list,
        "records": records,
    }


@router.get("/trend")
def operational_trend(
    months: int = 12,
    session: Session = Depends(get_session),
    user: User = Depends(require_admin),
):
    """运营趋势（Admin）：近 N 月新签租约、新线索、营收、新客照看房预约逐月走势。"""
    years = months // 12
    remaining = months % 12
    start = datetime.utcnow()
    start = start.replace(year=start.year - years, month=start.month - remaining, day=1)

    monthly_revenue: dict[str, float] = defaultdict(float)
    for p in session.exec(
        select(Payment).where(
            Payment.deleted_at.is_(None),
            Payment.status == PaymentStatus.succeeded,
            Payment.created_at >= start,
        )
    ).all():
        key = (p.created_at or datetime.utcnow()).strftime("%Y-%m")
        monthly_revenue[key] += p.amount or 0

    def _counts(model, date_field, month_key):
        counts: dict[str, int] = defaultdict(int)
        for row in session.exec(
            select(model).where(
                model.deleted_at.is_(None),
                date_field >= start,
            )
        ).all():
            ts = getattr(row, month_key, None)
            if ts:
                counts[ts.strftime("%Y-%m")] += 1
        return counts

    lease_counts = _counts(Lease, Lease.created_at, "created_at")
    lead_counts = _counts(Lead, Lead.created_at, "created_at")
    viewing_counts = _counts(ViewingAppointment, ViewingAppointment.created_at, "created_at")
    ticket_counts = _counts(MaintenanceTicket, MaintenanceTicket.created_at, "created_at")

    # 生成完整的月份序列
    keys = sorted(
        set(monthly_revenue)
        | set(lease_counts)
        | set(lead_counts)
        | set(viewing_counts)
    )
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
