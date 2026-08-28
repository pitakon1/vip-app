"""Dashboard 路由：运营数据概览。"""
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlmodel import Session, select

from app.db import get_session
from app.core.auth import require_agent
from app.core.cache import get_cache, set_cache
from app.models import (
    User,
    Property,
    PropertyStatus,
    Lease,
    LeaseStatus,
    Payment,
    PaymentStatus,
    Lead,
    LeadStage,
    Tenant,
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
                "id": str(l.id),
                "property_id": str(l.property_id),
                "property_name": props.get(l.property_id).title
                if props.get(l.property_id)
                else None,
                "tenant_id": str(l.tenant_id),
                "tenant_name": users.get(tenants.get(l.tenant_id).user_id).full_name
                if tenants.get(l.tenant_id)
                and users.get(tenants[l.tenant_id].user_id)
                else None,
                "monthly_rent": l.monthly_rent,
                "currency": l.currency,
                "end_date": l.end_date.isoformat(),
                "days_left": max(0, (l.end_date - now).days),
            }
            for l in leases
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
