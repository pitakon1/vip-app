"""业主路由：业主个人信息、房源与租金收入。"""
import uuid
from collections import defaultdict
from datetime import datetime
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import false
from sqlmodel import Session, select

from app.db import get_session
from app.core.auth import require_owner
from app.core.payments import is_past_due
from app.models import (
    Document,
    Owner,
    Project,
    Property,
    PropertyStatus,
    Payment,
    PaymentType,
    PaymentStatus,
    School,
    User,
)
from app.providers.geo import haversine_km, lat_lng_bounds
from app.schemas.owners import AnnualFinancialSummaryOut, OwnerIncomeOut

router = APIRouter(prefix="/owners", tags=["owners"])


class OwnerUpdate(BaseModel):
    nationality: Optional[str] = None
    tax_id: Optional[str] = None
    address: Optional[str] = None
    contact_preference: Optional[str] = None


class MarketingItemOut(BaseModel):
    """`GET /owners/me/marketing` 中的单条可推广房源。"""

    model_config = ConfigDict(extra="allow")

    id: Optional[str] = None
    title: Optional[str] = None
    address: Optional[str] = None
    monthly_rent: Optional[float] = None
    currency: Optional[str] = None
    property_type: Optional[str] = None
    size_sqm: Optional[float] = None
    bedrooms: Optional[int] = None
    bathrooms: Optional[int] = None
    photo: Optional[Any] = None
    status: Optional[str] = None
    share_url: Optional[str] = None


class MarketingOut(BaseModel):
    """`GET /owners/me/marketing`。"""

    model_config = ConfigDict(extra="allow")

    items: List[MarketingItemOut] = Field(default_factory=list)
    total_vacant: Optional[int] = None
    total_properties: Optional[int] = None


class PricingSuggestionDetailOut(BaseModel):
    """`GET /owners/me/pricing-suggestion` 中单条建议明细。"""

    model_config = ConfigDict(extra="allow")

    direction: Optional[str] = None
    diff_pct: Optional[float] = None
    suggested: Optional[float] = None


class PricingItemOut(BaseModel):
    """`GET /owners/me/pricing-suggestion` 中的单条房源比价结果。"""

    model_config = ConfigDict(extra="allow")

    property_id: Optional[str] = None
    title: Optional[str] = None
    monthly_rent: Optional[float] = None
    currency: Optional[str] = None
    property_type: Optional[str] = None
    peer_count: Optional[int] = None
    peer_avg: Optional[float] = None
    peer_range: Optional[List[Optional[float]]] = None
    suggestion: Optional[PricingSuggestionDetailOut] = None


class PricingMarketOut(BaseModel):
    """`GET /owners/me/pricing-suggestion` 中的市场基准说明。"""

    model_config = ConfigDict(extra="allow")

    based_on: Optional[str] = None
    currency: Optional[str] = None


class PricingSuggestionOut(BaseModel):
    """`GET /owners/me/pricing-suggestion`。"""

    model_config = ConfigDict(extra="allow")

    items: List[PricingItemOut] = Field(default_factory=list)
    market: Optional[PricingMarketOut] = None


def _get_owner(session: Session, user: User) -> Owner:
    """根据当前用户获取业主记录。"""
    owner = session.exec(
        select(Owner).where(
            Owner.user_id == user.id,
            Owner.deleted_at.is_(None),
        )
    ).first()
    if not owner:
        raise HTTPException(status_code=404, detail="Owner profile not found")
    return owner


@router.get("/me", response_model=Owner)
def get_my_owner_info(
    session: Session = Depends(get_session),
    user: User = Depends(require_owner),
):
    """业主个人信息。"""
    return _get_owner(session, user)


@router.patch("/me")
def update_my_owner_info(
    req: OwnerUpdate,
    session: Session = Depends(get_session),
    user: User = Depends(require_owner),
):
    """更新业主个人信息。"""
    owner = _get_owner(session, user)
    update_data = req.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(owner, key, value)
    session.add(owner)
    session.commit()
    session.refresh(owner)
    return owner


@router.get("/me/properties", response_model=List[Property])
def get_my_properties(
    session: Session = Depends(get_session),
    user: User = Depends(require_owner),
    school_id: Optional[uuid.UUID] = None,
    school_radius_km: float = 3.0,
):
    """业主的房源列表（admin 无业主档案时返回全部房源）。

    `school_id + school_radius_km`：按学校找房（空间筛选），口径与 `/properties` 一致——
    先用经纬度包围盒粗筛小区，再用 haversine 精算半径，收敛成「半径内的小区 ID 集合」。
    """
    owner = session.exec(
        select(Owner).where(
            Owner.user_id == user.id,
            Owner.deleted_at.is_(None),
        )
    ).first()
    conditions = [Property.deleted_at.is_(None)]
    if owner:
        conditions.append(Property.owner_id == owner.id)
    # 按学校找房（复用 /properties 的空间筛选逻辑，与 C 端口径对齐）
    if school_id:
        school = session.get(School, school_id)
        if not school or school.deleted_at:
            raise HTTPException(status_code=404, detail="School not found")
        if school.lat is None or school.lng is None:
            # 没有坐标就算不出距离，不能拿全量冒充满足条件的结果
            raise HTTPException(status_code=400, detail="该学校缺少经纬度，无法按距离筛选")
        lat_min, lat_max, lng_min, lng_max = lat_lng_bounds(
            school.lat, school.lng, school_radius_km
        )
        candidates = session.exec(
            select(Project.id, Project.lat, Project.lng).where(
                Project.deleted_at.is_(None),
                Project.lat.is_not(None),
                Project.lng.is_not(None),
                Project.lat >= lat_min,
                Project.lat <= lat_max,
                Project.lng >= lng_min,
                Project.lng <= lng_max,
            )
        ).all()
        near_ids = [
            pid
            for pid, plat, plng in candidates
            if haversine_km(school.lat, school.lng, plat, plng) <= school_radius_km
        ]
        # 半径内无小区时必须显式置空，否则该条件会被整个跳过而返回全量
        conditions.append(Property.project_id.in_(near_ids) if near_ids else false())
    stmt = select(Property).where(*conditions)
    properties = session.exec(
        stmt.order_by(Property.created_at.desc())
    ).all()
    return properties


@router.get("/me/documents", response_model=List[Document])
def get_my_documents(
    session: Session = Depends(get_session),
    user: User = Depends(require_owner),
):
    """业主的文档列表（合同、收据、税务发票等）。"""
    owner = _get_owner(session, user)
    documents = session.exec(
        select(Document)
        .where(Document.owner_id == owner.id, Document.deleted_at.is_(None))
        .order_by(Document.created_at.desc())
    ).all()
    return documents


@router.get("/me/income", response_model=OwnerIncomeOut)
def get_my_income(
    session: Session = Depends(get_session),
    user: User = Depends(require_owner),
):
    """租金收入汇总 + 待收/逾期闭环。

    返回 `records`（逐笔：received/pending/overdue）供前端直接渲染，
    同时给出已收、应收、逾期三个金额口径，构成房东管钱看板。
    """
    owner = _get_owner(session, user)

    properties = session.exec(
        select(Property).where(
            Property.owner_id == owner.id,
            Property.deleted_at.is_(None),
        )
    ).all()

    property_ids = [p.id for p in properties]
    property_by_id = {p.id: p for p in properties}
    if not property_ids:
        empty = {
            "total_income": 0.0,
            "receivable_total": 0.0,
            "overdue_total": 0.0,
            "currency": "THB",
            "property_count": 0,
            "rented_count": 0,
            "vacant_count": 0,
            "by_property": [],
            "records": [],
        }
        return empty

    payments = session.exec(
        select(Payment).where(
            Payment.property_id.in_(property_ids),
            Payment.payment_type == PaymentType.rent,
            Payment.deleted_at.is_(None),
        )
    ).all()

    now = datetime.utcnow()
    received_total = 0.0   # 已到账
    receivable_total = 0.0  # 应收未收（含逾期）
    overdue_total = 0.0
    records: List[dict] = []
    income_by_property: dict = {}
    receivable_by_property: dict = {}

    for p in payments:
        prop = property_by_id.get(p.property_id)
        title = prop.display_name if prop else None
        month = (p.due_date or p.created_at or now).strftime("%Y-%m") \
            if (p.due_date or p.created_at) else ""
        amount = p.amount or 0

        if p.status == PaymentStatus.succeeded:
            received_total += amount
            status = "received"
            income_by_property[str(p.property_id)] = (
                income_by_property.get(str(p.property_id), 0.0) + amount
            )
        else:
            receivable_total += amount
            is_overdue = is_past_due(p, now)
            if is_overdue:
                overdue_total += amount
            status = "overdue" if is_overdue else "pending"
            receivable_by_property[str(p.property_id)] = (
                receivable_by_property.get(str(p.property_id), 0.0) + amount
            )

        records.append(
            {
                "id": str(p.id),
                "property": title,
                "month": month,
                "amount": amount,
                "status": status,
            }
        )

    rented_count = sum(1 for p in properties if p.status == PropertyStatus.rented)
    vacant_count = sum(1 for p in properties if p.status == PropertyStatus.vacant)
    currency = (payments[0].currency if payments else None) or "THB"

    by_property = [
        {
            "property_id": str(pid),
            "income": income_by_property.get(str(pid), 0.0),
            "receivable": receivable_by_property.get(str(pid), 0.0),
            "monthly_rent": property_by_id[pid].monthly_rent
            if property_by_id.get(pid)
            else 0,
        }
        for pid in property_ids
    ]

    records.sort(key=lambda r: r["id"], reverse=True)
    return {
        "total_income": round(received_total, 2),
        "receivable_total": round(receivable_total, 2),
        "overdue_total": round(overdue_total, 2),
        "currency": currency,
        "property_count": len(properties),
        "rented_count": rented_count,
        "vacant_count": vacant_count,
        "by_property": by_property,
        "records": records,
    }


def _my_properties(session: Session, owner: Owner) -> list:
    return session.exec(
        select(Property).where(
            Property.owner_id == owner.id,
            Property.deleted_at.is_(None),
        )
    ).all()


@router.get("/me/marketing", response_model=MarketingOut)
def get_marketing(
    session: Session = Depends(get_session),
    user: User = Depends(require_owner),
):
    """房源营销推广：空置房源一览并生成分享链接（链接由前端拼装）。"""
    owner = _get_owner(session, user)
    properties = _my_properties(session, owner)
    vacant = [
        p for p in properties if p.status in (PropertyStatus.vacant, PropertyStatus.maintenance)
    ]
    return {
        "items": [
            {
                "id": str(p.id),
                "title": p.display_name,
                "address": p.address,
                "monthly_rent": p.monthly_rent,
                "currency": p.currency,
                "property_type": p.property_type,
                "size_sqm": p.size_sqm,
                "bedrooms": p.bedrooms,
                "bathrooms": p.bathrooms,
                "photo": p.photos[0] if p.photos else None,
                "status": p.status.value,
                "share_url": f"/properties/{p.id}",
            }
            for p in vacant
        ],
        "total_vacant": len(vacant),
        "total_properties": len(properties),
    }


@router.get("/me/pricing-suggestion", response_model=PricingSuggestionOut)
def get_pricing_suggestion(
    session: Session = Depends(get_session),
    user: User = Depends(require_owner),
):
    """自动定价建议：取同项目/同户型的在租与在售房源月租中位数作为比对基准。"""
    owner = _get_owner(session, user)
    properties = _my_properties(session, owner)
    if not properties:
        return {"items": [], "market": None}

    all_props = session.exec(
        select(Property).where(
            Property.deleted_at.is_(None),
            Property.status == PropertyStatus.rented,
        )
    ).all()
    owned_ids = {p.id for p in properties}

    items = []
    for p in properties:
        # 同类可比房源：同户型，且非自己名下
        comps = [
            q
            for q in all_props
            if q.id not in owned_ids
            and q.property_type == p.property_type
            and q.monthly_rent
        ]
        avg = round(sum(c.monthly_rent for c in comps) / len(comps), 0) if comps else None
        lo = min(c.monthly_rent for c in comps) if comps else None
        hi = max(c.monthly_rent for c in comps) if comps else None
        current = p.monthly_rent
        suggestion = None
        if avg and current:
            diff_pct = round((current - avg) / avg * 100, 1)
            suggestion = {
                "direction": "raise" if current < avg * 0.95 else ("lower" if current > avg * 1.08 else "keep"),
                "diff_pct": diff_pct,
                "suggested": round(avg, 0),
            }
        items.append(
            {
                "property_id": str(p.id),
                "title": p.display_name,
                "monthly_rent": current,
                "currency": p.currency,
                "property_type": p.property_type,
                "peer_count": len(comps),
                "peer_avg": avg,
                "peer_range": [lo, hi] if comps else None,
                "suggestion": suggestion,
            }
        )

    return {
        "items": items,
        "market": {"based_on": "同类在租房源月租", "currency": "THB"},
    }


@router.get("/me/annual-financial-summary", response_model=AnnualFinancialSummaryOut)
def get_annual_financial_summary(
    year: int | None = None,
    session: Session = Depends(get_session),
    user: User = Depends(require_owner),
):
    """年度财务汇总：按月份统计已收租金/其他收入/逾期，形成房东年度对账导出数据。"""
    owner = _get_owner(session, user)
    properties = _my_properties(session, owner)
    if not year:
        year = datetime.utcnow().year
    if not properties:
        # 无房源时也要给出完整口径（此前缺 pending/count，前端会拿到 undefined）
        return {
            "year": year,
            "by_month": [],
            "totals": {"received": 0, "pending": 0, "overdue": 0, "count": 0},
        }

    owned_ids = [p.id for p in properties]
    window_start = datetime(year, 1, 1)
    window_end = datetime(year + 1, 1, 1)

    payments = session.exec(
        select(Payment).where(
            Payment.property_id.in_(owned_ids),
            Payment.deleted_at.is_(None),
            Payment.created_at >= window_start,
            Payment.created_at < window_end,
        )
    ).all()

    monthly: dict[str, dict] = defaultdict(
        lambda: {"received": 0.0, "pending": 0.0, "overdue": 0.0, "count": 0}
    )
    now = datetime.utcnow()
    for p in payments:
        m = (p.created_at or now).strftime("%Y-%m")
        amount = p.amount or 0
        monthly[m]["count"] += 1
        if p.status == PaymentStatus.succeeded:
            monthly[m]["received"] += amount
        elif is_past_due(p, now):
            monthly[m]["overdue"] += amount
        else:
            monthly[m]["pending"] += amount

    by_month = [
        {
            "month": m,
            "received": round(v["received"], 2),
            "pending": round(v["pending"], 2),
            "overdue": round(v["overdue"], 2),
            "count": v["count"],
        }
        for m, v in sorted(monthly.items())
    ]
    totals = {
        "received": round(sum(v["received"] for v in monthly.values()), 2),
        "pending": round(sum(v["pending"] for v in monthly.values()), 2),
        "overdue": round(sum(v["overdue"] for v in monthly.values()), 2),
        "count": sum(v["count"] for v in monthly.values()),
    }
    return {"year": year, "by_month": by_month, "totals": totals}
