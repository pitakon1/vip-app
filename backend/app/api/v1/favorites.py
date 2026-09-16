"""房源收藏路由（favorites）。

用户收藏/取消收藏意向房源，并分页查看收藏列表。
"""

import uuid
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlmodel import Session, select

from app.db import get_session
from app.core.auth import get_current_user
from app.core.pagination import Page, PaginationParams, paginate
from app.models import Favorite, Property, User

router = APIRouter(prefix="/favorites", tags=["favorites"])


class FavoriteToggle(BaseModel):
    property_id: uuid.UUID
    notes: Optional[str] = None


class FavoriteItemOut(BaseModel):
    """`GET /favorites` 中的单条收藏（附带房源标题/地址/月租金）。"""

    model_config = ConfigDict(extra="allow")

    id: Optional[str] = None
    property_id: Optional[str] = None
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
    from datetime import datetime

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
    favs = session.exec(
        select(Favorite)
        .where(
            Favorite.user_id == user.id,
            Favorite.deleted_at.is_(None),
        )
        .order_by(Favorite.created_at.desc())
    ).all()
    props = {p.id: p for p in session.exec(select(Property)).all()}
    items = []
    for f in favs:
        p = props.get(f.property_id)
        items.append(
            {
                "id": str(f.id),
                "property_id": str(f.property_id),
                "title": p.room_number if p else None,
                "room_number": p.room_number if p else None,
                "address": p.address if p else None,
                "monthly_rent": p.monthly_rent if p else None,
                "currency": p.currency if p else "THB",
                "property_type": p.property_type if p else None,
                "photo": (p.photos[0] if p and p.photos else None),
                "notes": f.notes,
                "status": p.status.value if p else None,
                "created_at": f.created_at.isoformat() if f.created_at else None,
            }
        )
    total = len(items)
    offset = pagination.offset
    limit = pagination.limit
    return paginate(items[offset : offset + limit], total, pagination)


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
