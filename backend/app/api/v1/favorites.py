"""房源收藏路由（favorites）。

用户收藏/取消收藏意向房源，并分页查看收藏列表。
"""

import uuid
from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict
from sqlmodel import Session, select

from app.db import get_session
from app.core.auth import get_current_user
from app.core.pagination import Page, PaginationParams, paginate_query
from app.models import Favorite, Listing, ListingStatus, ListingType, Property, User

router = APIRouter(prefix="/favorites", tags=["favorites"])


class FavoriteToggle(BaseModel):
    property_id: uuid.UUID
    notes: Optional[str] = None


class FavoriteItemOut(BaseModel):
    """`GET /favorites` 中的单条收藏（附带房源标题/地址/月租金）。"""

    model_config = ConfigDict(extra="allow")

    id: Optional[str] = None
    property_id: Optional[str] = None
    listing_id: Optional[str] = None
    title: Optional[str] = None
    room_number: Optional[str] = None
    address: Optional[str] = None
    monthly_rent: Optional[float] = None
    currency: Optional[str] = None
    property_type: Optional[str] = None
    photo: Optional[Any] = None
    notes: Optional[str] = None
    status: Optional[str] = None
    created_at: Optional[str] = None


class FavoriteStatusOut(BaseModel):
    """`GET /favorites/status/{property_id}`。"""

    model_config = ConfigDict(extra="allow")

    ok: Optional[bool] = None
    property_id: Optional[str] = None
    favorited: Optional[bool] = None


@router.post("")
def add_favorite(
    req: FavoriteToggle,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """收藏房源（幂等：已收藏则直接返回）。"""
    prop = session.get(Property, req.property_id)
    if not prop or prop.deleted_at:
        raise HTTPException(status_code=404, detail="Property not found")

    existing = session.exec(
        select(Favorite).where(
            Favorite.user_id == user.id,
            Favorite.property_id == req.property_id,
            Favorite.deleted_at.is_(None),
        )
    ).first()
    if existing:
        return {"ok": True, "favorited": True, "id": str(existing.id)}

    fav = Favorite(user_id=user.id, property_id=req.property_id, notes=req.notes or "")
    session.add(fav)
    session.commit()
    session.refresh(fav)
    return {
        "ok": True,
        "favorited": True,
        "id": str(fav.id),
        "created_at": fav.created_at.isoformat() if fav.created_at else None,
    }


@router.delete("/{property_id}")
def remove_favorite(
    property_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """取消收藏（软删除）。"""
    fav = session.exec(
        select(Favorite).where(
            Favorite.user_id == user.id,
            Favorite.property_id == property_id,
            Favorite.deleted_at.is_(None),
        )
    ).first()
    if not fav:
        raise HTTPException(status_code=404, detail="Favorite not found")

    fav.deleted_at = datetime.utcnow()
    session.add(fav)
    session.commit()
    return {"ok": True, "favorited": False, "property_id": str(property_id)}


@router.get("", response_model=Page[FavoriteItemOut])
def list_favorites(
    pagination: PaginationParams = Depends(),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """我的收藏列表（附带房源标题/地址/月租金）。"""
    query = (
        select(Favorite)
        .where(
            Favorite.user_id == user.id,
            Favorite.deleted_at.is_(None),
        )
        .order_by(Favorite.created_at.desc())
    )
    page = paginate_query(session, query, pagination)
    props = {
        p.id: p
        for p in session.exec(
            select(Property).where(
                Property.id.in_([f.property_id for f in page.items])
            )
        ).all()
    }
    # 每套房源对应的公开上架单（优先租单）：供 App 收藏列表跳转公开详情页。
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
    page.items = [
        {
            "id": str(f.id),
            "property_id": str(f.property_id),
            "listing_id": str(listing_map[f.property_id].id)
            if f.property_id in listing_map
            else None,
            "title": p.room_number if (p := props.get(f.property_id)) else None,
            "room_number": p.room_number if (p := props.get(f.property_id)) else None,
            "address": p.address if (p := props.get(f.property_id)) else None,
            "monthly_rent": p.monthly_rent if (p := props.get(f.property_id)) else None,
            "currency": p.currency if (p := props.get(f.property_id)) else "THB",
            "property_type": p.property_type if (p := props.get(f.property_id)) else None,
            "photo": (p.photos[0] if (p := props.get(f.property_id)) and p.photos else None),
            "notes": f.notes,
            "status": p.status.value if (p := props.get(f.property_id)) else None,
            "created_at": f.created_at.isoformat() if f.created_at else None,
        }
        for f in page.items
    ]
    return page


@router.get("/status/{property_id}", response_model=FavoriteStatusOut)
def get_favorite_status(
    property_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """查询是否已收藏某房源（供前端渲染收藏态）。"""
    fav = session.exec(
        select(Favorite).where(
            Favorite.user_id == user.id,
            Favorite.property_id == property_id,
            Favorite.deleted_at.is_(None),
        )
    ).first()
    return {"ok": True, "property_id": str(property_id), "favorited": bool(fav)}


@router.get("/status")
def get_favorites_batch_status(
    property_ids: str = Query(
        ..., description="逗号分隔的房源 ID 列表（最多 100 个）"
    ),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """批量查询收藏状态（供列表页一次渲染，替代逐条 N+1 请求）。"""
    try:
        ids = [uuid.UUID(pid.strip()) for pid in property_ids.split(",") if pid.strip()]
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid property_ids")
    ids = ids[:100]
    if not ids:
        return {"items": []}
    favs = session.exec(
        select(Favorite).where(
            Favorite.user_id == user.id,
            Favorite.property_id.in_(ids),
            Favorite.deleted_at.is_(None),
        )
    ).all()
    fav_set = {str(f.property_id) for f in favs}
    return {
        "items": [
            {"property_id": str(pid), "favorited": str(pid) in fav_set}
            for pid in ids
        ]
    }
