"""售房/求购挂牌路由（买卖交易闭环）。"""
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy import or_
from sqlmodel import Session, select

from app.db import get_session
from app.core.auth import get_current_user
from app.core.cache import delete_cache_pattern, get_cache, set_cache
from app.core.pagination import Page, PaginationParams, paginate_query
from app.models import (
    User,
    UserRole,
    Property,
    SaleListing,
    SaleType,
    ListingStatus,
    Valuation,
    AVMMethod,
)

router = APIRouter(prefix="/sale-listings", tags=["sale-listings"])


class SaleListingIn(BaseModel):
    sale_type: SaleType = SaleType.sell
    title: str
    property_id: Optional[uuid.UUID] = None
    address: Optional[str] = None
    asking_price: float
    currency: str = "THB"
    size_sqm: Optional[float] = None
    bedrooms: Optional[int] = None
    bathrooms: Optional[int] = None
    description: Optional[str] = None
    license_ref: Optional[str] = None


class ValuationIn(BaseModel):
    method: AVMMethod = AVMMethod.blended
    market_value: float
    low_estimate: Optional[float] = None
    high_estimate: Optional[float] = None
    currency: str = "THB"
    confidence: int = 50
    factors: Optional[str] = None


class SaleListingOut(BaseModel):
    """售房/求购挂牌响应（与 _serialize 输出一致）。"""

    model_config = ConfigDict(extra="allow")

    id: Optional[str] = None
    sale_type: Optional[str] = None
    title: Optional[str] = None
    property_id: Optional[str] = None
    owner_user_id: Optional[str] = None
    agent_user_id: Optional[str] = None
    address: Optional[str] = None
    asking_price: Optional[float] = None
    currency: Optional[str] = None
    size_sqm: Optional[float] = None
    bedrooms: Optional[int] = None
    bathrooms: Optional[int] = None
    status: Optional[str] = None
    license_ref: Optional[str] = None
    created_at: Optional[str] = None


class ValuationOut(BaseModel):
    """估价记录响应。"""

    model_config = ConfigDict(extra="allow")

    id: Optional[str] = None
    method: Optional[str] = None
    market_value: Optional[float] = None
    low_estimate: Optional[float] = None
    high_estimate: Optional[float] = None
    currency: Optional[str] = None
    confidence: Optional[int] = None
    factors: Optional[str] = None
    created_at: Optional[str] = None


def _serialize(listing: SaleListing) -> dict:
    return {
        "id": str(listing.id),
        "sale_type": listing.sale_type.value,
        "title": listing.title,
        "property_id": str(listing.property_id) if listing.property_id else None,
        "owner_user_id": str(listing.owner_user_id) if listing.owner_user_id else None,
        "agent_user_id": str(listing.agent_user_id) if listing.agent_user_id else None,
        "address": listing.address,
        "asking_price": listing.asking_price,
        "currency": listing.currency,
        "size_sqm": listing.size_sqm,
        "bedrooms": listing.bedrooms,
        "bathrooms": listing.bathrooms,
        "status": listing.status.value,
        "license_ref": listing.license_ref,
        "created_at": listing.created_at.isoformat() if listing.created_at else None,
    }


@router.get("", response_model=Page[SaleListingOut])
def list_sale_listings(
    sale_type: Optional[SaleType] = None,
    status: Optional[ListingStatus] = None,
    q: Optional[str] = Query(
        None, max_length=100, description="关键词：挂牌标题 / 地址 / 描述"
    ),
    pagination: PaginationParams = Depends(),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """分页查询挂牌（公开数据按需过滤，支持关键词搜索）。"""
    keyword = (q or "").strip()
    # 角色影响可见性（非管理员只看对外状态），key 必须带上 role，避免跨角色串缓存
    cache_key = (
        f"cache:sale-listings:list:{pagination.page}:{pagination.page_size}:"
        f"{sale_type.value if sale_type else ''}:{status.value if status else ''}:"
        f"{user.role.value}:{keyword}"
    )
    cached = get_cache(cache_key)
    if cached is not None:
        return cached

    query = select(SaleListing).where(SaleListing.deleted_at.is_(None))
    if sale_type:
        query = query.where(SaleListing.sale_type == sale_type)
    if status:
        query = query.where(SaleListing.status == status)
    else:
        # 非管理员默认只看对外可见状态
        if user.role not in (UserRole.admin, UserRole.agent, UserRole.employee):
            query = query.where(SaleListing.status.in_(
                [ListingStatus.active, ListingStatus.pending]
            ))
    if keyword:
        pattern = f"%{keyword}%"
        query = query.where(
            or_(
                SaleListing.title.ilike(pattern),
                SaleListing.address.ilike(pattern),
                SaleListing.description.ilike(pattern),
            )
        )
    # 总数与分页都下推到 SQL，避免把整表拉进内存后再切片
    stmt = query.order_by(SaleListing.created_at.desc())
    page = paginate_query(session, stmt, pagination)
    page.items = [_serialize(i) for i in page.items]
    set_cache(cache_key, page, ttl=60)
    return page


@router.post("")
def create_sale_listing(
    req: SaleListingIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """发布挂牌（个人卖家/经纪人/管理员）。"""
    if req.property_id:
        prop = session.get(Property, req.property_id)
        if not prop:
            raise HTTPException(status_code=404, detail="Property not found")
    listing = SaleListing(
        title=req.title,
        sale_type=req.sale_type,
        property_id=req.property_id,
        address=req.address,
        asking_price=req.asking_price,
        currency=req.currency,
        size_sqm=req.size_sqm,
        bedrooms=req.bedrooms,
        bathrooms=req.bathrooms,
        description=req.description,
        license_ref=req.license_ref,
        owner_user_id=user.id if req.sale_type == SaleType.sell else None,
        status=ListingStatus.active,
    )
    session.add(listing)
    session.commit()
    session.refresh(listing)
    delete_cache_pattern("cache:sale-listings:*")
    return _serialize(listing)


@router.get("/{listing_id}", response_model=SaleListingOut)
def get_sale_listing(
    listing_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    listing = session.get(SaleListing, listing_id)
    if not listing or listing.deleted_at:
        raise HTTPException(status_code=404, detail="Listing not found")
    return _serialize(listing)


@router.patch("/{listing_id}")
def update_sale_listing(
    listing_id: uuid.UUID,
    req: SaleListingIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """更新挂牌（所有者/经纪人/管理员）。"""
    listing = session.get(SaleListing, listing_id)
    if not listing or listing.deleted_at:
        raise HTTPException(status_code=404, detail="Listing not found")
    can_edit = (
        user.role in (UserRole.admin, UserRole.agent, UserRole.employee)
        or listing.owner_user_id == user.id
    )
    if not can_edit:
        raise HTTPException(status_code=403, detail="No permission")
    for field, value in req.model_dump(exclude_unset=True).items():
        if field == "sale_type":
            continue
        setattr(listing, field, value)
    session.add(listing)
    session.commit()
    session.refresh(listing)
    delete_cache_pattern("cache:sale-listings:*")
    return _serialize(listing)


@router.post("/{listing_id}/status")
def change_listing_status(
    listing_id: uuid.UUID,
    status: ListingStatus,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    listing = session.get(SaleListing, listing_id)
    if not listing or listing.deleted_at:
        raise HTTPException(status_code=404, detail="Listing not found")
    if user.role not in (UserRole.admin, UserRole.agent, UserRole.employee):
        raise HTTPException(status_code=403, detail="No permission")
    listing.status = status
    session.add(listing)
    session.commit()
    session.refresh(listing)
    delete_cache_pattern("cache:sale-listings:*")
    return _serialize(listing)


@router.post("/{listing_id}/valuations")
def create_valuation(
    listing_id: uuid.UUID,
    req: ValuationIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """对挂牌做 AVM 估价。"""
    listing = session.get(SaleListing, listing_id)
    if not listing or listing.deleted_at:
        raise HTTPException(status_code=404, detail="Listing not found")
    val = Valuation(
        sale_listing_id=listing.id,
        property_id=listing.property_id,
        method=req.method,
        market_value=req.market_value,
        low_estimate=req.low_estimate,
        high_estimate=req.high_estimate,
        currency=req.currency,
        confidence=req.confidence,
        factors=req.factors,
        created_by=user.id,
    )
    session.add(val)
    session.commit()
    session.refresh(val)
    return {
        "id": str(val.id),
        "listing_id": str(listing_id),
        "method": val.method.value,
        "market_value": val.market_value,
        "low_estimate": val.low_estimate,
        "high_estimate": val.high_estimate,
        "currency": val.currency,
        "confidence": val.confidence,
        "factors": val.factors,
        "created_at": val.created_at.isoformat() if val.created_at else None,
    }


@router.get("/{listing_id}/valuations", response_model=List[ValuationOut])
def list_valuations(
    listing_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    vals = session.exec(
        select(Valuation)
        .where(Valuation.sale_listing_id == listing_id, Valuation.deleted_at.is_(None))
        .order_by(Valuation.created_at.desc())
    ).all()
    return [
        {
            "id": str(v.id),
            "method": v.method.value,
            "market_value": v.market_value,
            "low_estimate": v.low_estimate,
            "high_estimate": v.high_estimate,
            "currency": v.currency,
            "confidence": v.confidence,
            "factors": v.factors,
            "created_at": v.created_at.isoformat() if v.created_at else None,
        }
        for v in vals
    ]