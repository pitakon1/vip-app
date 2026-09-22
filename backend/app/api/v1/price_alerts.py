"""降价提醒路由（price-alerts）。

用户订阅/取消订阅指定房源的降价通知，分页查看自己的降价提醒列表，并查询
某房源的订阅状态。
"""
import uuid
from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlmodel import Session, select

from app.db import get_session
from app.core.auth import get_current_user
from app.core.pagination import Page, PaginationParams, paginate_query
from app.models import (
    Listing,
    ListingStatus,
    ListingType,
    PriceAlert,
    Property,
    User,
)
from app.services.price_alert import notify_if_price_dropped  # noqa: F401  # 导出帮助函数

router = APIRouter(prefix="/price-alerts", tags=["price-alerts"])


class PriceAlertCreate(BaseModel):
    """`POST /price-alerts` 请求体。"""

    property_id: uuid.UUID
    listing_id: Optional[uuid.UUID] = None


class PriceAlertItemOut(BaseModel):
    """`GET /price-alerts` 单条降价提醒（附带房源标题/地址/照片/当前价）。"""

    model_config = ConfigDict(extra="allow")

    id: Optional[str] = None
    property_id: Optional[str] = None
    listing_id: Optional[str] = None
    title: Optional[str] = None
    room_number: Optional[str] = None
    address: Optional[str] = None
    subscribed_price: Optional[float] = None
    current_price: Optional[float] = None
    currency: Optional[str] = None
    property_type: Optional[str] = None
    listing_type: Optional[str] = None
    photo: Optional[Any] = None
    notified_at: Optional[str] = None
    status: Optional[str] = None
    created_at: Optional[str] = None


class PriceAlertStatusOut(BaseModel):
    """`GET /price-alerts/status/{property_id}`。"""

    model_config = ConfigDict(extra="allow")

    ok: Optional[bool] = None
    property_id: Optional[str] = None
    subscribed: Optional[bool] = None


def _price_for_listing(li: Listing):
    """取某种上架单的当前挂牌价（按租/售类型取对应价格列）。"""
    if li.listing_type == ListingType.rent:
        return li.monthly_rent
    return li.asking_price


@router.post("")
def subscribe(
    req: PriceAlertCreate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """订阅指定房源的降价提醒（幂等：已订阅则直接返回）。"""
    prop = session.get(Property, req.property_id)
    if not prop or prop.deleted_at:
        raise HTTPException(status_code=404, detail="Property not found")

    existing = session.exec(
        select(PriceAlert).where(
            PriceAlert.user_id == user.id,
            PriceAlert.property_id == req.property_id,
            PriceAlert.deleted_at.is_(None),
        )
    ).first()
    if existing:
        return {
            "ok": True,
            "subscribed": True,
            "id": str(existing.id),
            "subscribed_price": existing.subscribed_price,
            "currency": existing.currency,
        }

    # 捕获当前价格与币种：优先按给定 listing，否则退回 property 月租金。
    currency = prop.currency or "THB"
    subscribed_price: Optional[float] = prop.monthly_rent
    listing_id: Optional[uuid.UUID] = None
    if req.listing_id:
        li = session.get(Listing, req.listing_id)
        if li and not li.deleted_at and li.property_id == req.property_id:
            listing_id = li.id
            if li.currency:
                currency = li.currency
            price = _price_for_listing(li)
            if price is not None:
                subscribed_price = price

    alert = PriceAlert(
        user_id=user.id,
        property_id=req.property_id,
        listing_id=listing_id,
        subscribed_price=subscribed_price,
        currency=currency,
    )
    session.add(alert)
    session.commit()
    session.refresh(alert)
    return {
        "ok": True,
        "subscribed": True,
        "id": str(alert.id),
        "subscribed_price": alert.subscribed_price,
        "currency": alert.currency,
        "created_at": alert.created_at.isoformat() if alert.created_at else None,
    }


@router.delete("/{property_id}")
def unsubscribe(
    property_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """取消订阅（软删除）。"""
    alert = session.exec(
        select(PriceAlert).where(
            PriceAlert.user_id == user.id,
            PriceAlert.property_id == property_id,
            PriceAlert.deleted_at.is_(None),
        )
    ).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Price alert not found")

    alert.deleted_at = datetime.utcnow()
    session.add(alert)
    session.commit()
    return {"ok": True, "subscribed": False, "property_id": str(property_id)}


@router.get("", response_model=Page[PriceAlertItemOut])
def list_my_alerts(
    pagination: PaginationParams = Depends(),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """我的降价提醒列表（附带房源标题/地址/当前价格）。"""
    query = (
        select(PriceAlert)
        .where(
            PriceAlert.user_id == user.id,
            PriceAlert.deleted_at.is_(None),
        )
        .order_by(PriceAlert.created_at.desc())
    )
    page = paginate_query(session, query, pagination)
    props = {
        p.id: p
        for p in session.exec(
            select(Property).where(
                Property.id.in_([a.property_id for a in page.items])
            )
        ).all()
    }
    # 每套房源对应的公开上架单（优先租单）：供 App 跳转公开详情页。
    prop_ids = list(props.keys())
    listing_map: dict = {}
    for li in session.exec(
        select(Listing).where(
            Listing.property_id.in_(prop_ids) if prop_ids else Listing.id.is_(None),
            Listing.deleted_at.is_(None),
            Listing.status == ListingStatus.active,
        )
    ).all():
        cur = listing_map.get(li.property_id)
        if cur is None or (
            li.listing_type == ListingType.rent and cur.listing_type != ListingType.rent
        ):
            listing_map[li.property_id] = li

    items = []
    for a in page.items:
        p = props.get(a.property_id)
        li = listing_map.get(a.property_id)
        listing_type = li.listing_type.value if li else None
        current_price = None
        if li:
            current_price = _price_for_listing(li)
        elif p:
            current_price = p.monthly_rent
        items.append(
            {
                "id": str(a.id),
                "property_id": str(a.property_id),
                "listing_id": str(li.id) if li else None,
                "title": p.room_number if p else None,
                "room_number": p.room_number if p else None,
                "address": p.address if p else None,
                "subscribed_price": a.subscribed_price,
                "current_price": current_price,
                "currency": a.currency or (p.currency if p else "THB"),
                "property_type": p.property_type if p else None,
                "listing_type": listing_type,
                "photo": (p.photos[0] if p and p.photos else None),
                "notified_at": a.notified_at.isoformat() if a.notified_at else None,
                "status": p.status.value if p else None,
                "created_at": a.created_at.isoformat() if a.created_at else None,
            }
        )
    page.items = items
    return page


@router.get("/status/{property_id}", response_model=PriceAlertStatusOut)
def get_subscribe_status(
    property_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """查询是否已订阅该房源的降价提醒（供前端渲染开关态）。"""
    alert = session.exec(
        select(PriceAlert).where(
            PriceAlert.user_id == user.id,
            PriceAlert.property_id == property_id,
            PriceAlert.deleted_at.is_(None),
        )
    ).first()
    return {"ok": True, "property_id": str(property_id), "subscribed": bool(alert)}