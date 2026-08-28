"""房源路由：房源 CRUD、照片上传及关联租约查询。"""
import os
import secrets
import shutil
import uuid
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import func
from sqlmodel import Session, select

from app.db import get_session
from app.core.auth import get_current_user, require_agent
from app.core.cache import delete_cache_pattern, get_cache, set_cache
from app.core.pagination import PaginationParams, paginate
from app.models import (
    Property,
    PropertyStatus,
    Lease,
    Owner,
    Project,
    Tenant,
    User,
)

router = APIRouter(prefix="/properties", tags=["properties"])

# 照片上传目录（backend/uploads/properties），由 /uploads 静态服务暴露
UPLOAD_DIR = Path(__file__).resolve().parents[3] / "uploads" / "properties"
ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"}
MAX_PHOTO_SIZE = 10 * 1024 * 1024  # 单张 10MB
MAX_PHOTOS = 20


class PropertyCreate(BaseModel):
    project_id: Optional[uuid.UUID] = None
    owner_id: uuid.UUID
    room_number: str
    floor: Optional[int] = None
    building: Optional[str] = None
    address: str
    property_type: str = "apartment"
    monthly_rent: float
    currency: str = "THB"
    deposit_amount: float = 0
    deposit_months: int = 2
    size_sqm: Optional[float] = None
    bedrooms: Optional[int] = None
    bathrooms: Optional[int] = None
    status: PropertyStatus = PropertyStatus.vacant
    description: Optional[str] = None
    photos: Optional[List[str]] = None
    furnished: bool = False
    available_from: Optional[datetime] = None


class PropertyUpdate(BaseModel):
    project_id: Optional[uuid.UUID] = None
    owner_id: Optional[uuid.UUID] = None
    room_number: Optional[str] = None
    floor: Optional[int] = None
    building: Optional[str] = None
    address: Optional[str] = None
    property_type: Optional[str] = None
    monthly_rent: Optional[float] = None
    currency: Optional[str] = None
    deposit_amount: Optional[float] = None
    deposit_months: Optional[int] = None
    size_sqm: Optional[float] = None
    bedrooms: Optional[int] = None
    bathrooms: Optional[int] = None
    status: Optional[PropertyStatus] = None
    description: Optional[str] = None
    photos: Optional[List[str]] = None
    furnished: Optional[bool] = None
    available_from: Optional[datetime] = None


@router.get("")
def list_properties(
    pagination: PaginationParams = Depends(),
    status: Optional[PropertyStatus] = None,
    project_id: Optional[uuid.UUID] = None,
    owner_id: Optional[uuid.UUID] = None,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """房源列表（分页，可按 status/project_id/owner_id 筛选）。"""
    cache_key = (
        f"cache:properties:list:{pagination.page}:{pagination.page_size}:"
        f"{status.value if status else ''}:{project_id or ''}:{owner_id or ''}"
    )
    cached = get_cache(cache_key)
    if cached is not None:
        return cached

    conditions = [Property.deleted_at.is_(None)]
    if status:
        conditions.append(Property.status == status)
    if project_id:
        conditions.append(Property.project_id == project_id)
    if owner_id:
        conditions.append(Property.owner_id == owner_id)

    stmt = select(Property).where(*conditions).order_by(Property.created_at.desc())
    count_stmt = select(func.count(Property.id)).where(*conditions)
    total = session.exec(count_stmt).one()
    items = session.exec(
        stmt.offset(pagination.offset).limit(pagination.limit)
    ).all()
    result = paginate(items, total, pagination)
    set_cache(cache_key, result, ttl=60)
    return result


@router.post("")
def create_property(
    req: PropertyCreate,
    session: Session = Depends(get_session),
    user: User = Depends(require_agent),
):
    """创建房源（agent+ 权限）。"""
    prop = Property(**req.model_dump())
    session.add(prop)
    session.commit()
    session.refresh(prop)
    delete_cache_pattern("cache:properties:*")
    return prop


@router.get("/{property_id}")
def get_property(
    property_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """获取房源详情（附带项目名称与业主名称）。"""
    cache_key = f"cache:properties:detail:{property_id}"
    cached = get_cache(cache_key)
    if cached is not None:
        return cached

    prop = session.get(Property, property_id)
    if not prop or prop.deleted_at:
        raise HTTPException(status_code=404, detail="Property not found")
    data = prop.model_dump()
    project = session.get(Project, prop.project_id) if prop.project_id else None
    owner = session.get(Owner, prop.owner_id) if prop.owner_id else None
    owner_user = session.get(User, owner.user_id) if owner else None
    data["project_name"] = project.name if project else None
    data["owner_name"] = owner_user.full_name if owner_user else None
    set_cache(cache_key, data, ttl=60)
    return data


@router.patch("/{property_id}")
def update_property(
    property_id: uuid.UUID,
    req: PropertyUpdate,
    session: Session = Depends(get_session),
    user: User = Depends(require_agent),
):
    """更新房源信息。"""
    prop = session.get(Property, property_id)
    if not prop or prop.deleted_at:
        raise HTTPException(status_code=404, detail="Property not found")
    update_data = req.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(prop, key, value)
    session.add(prop)
    session.commit()
    session.refresh(prop)
    delete_cache_pattern("cache:properties:*")
    return prop


@router.delete("/{property_id}")
def delete_property(
    property_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(require_agent),
):
    """软删除房源。"""
    prop = session.get(Property, property_id)
    if not prop or prop.deleted_at:
        raise HTTPException(status_code=404, detail="Property not found")
    prop.deleted_at = datetime.utcnow()
    session.add(prop)
    session.commit()
    delete_cache_pattern("cache:properties:*")
    return {"detail": "Property deleted"}


@router.get("/{property_id}/leases")
def list_property_leases(
    property_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """获取该房源的租约列表（附带租客名称）。"""
    leases = session.exec(
        select(Lease)
        .where(
            Lease.property_id == property_id,
            Lease.deleted_at.is_(None),
        )
        .order_by(Lease.created_at.desc())
    ).all()
    tenants = {t.id: t for t in session.exec(select(Tenant)).all()}
    users = {u.id: u for u in session.exec(select(User)).all()}
    return {
        "items": [
            {
                "id": str(l.id),
                "status": l.status.value if l.status else None,
                "start_date": l.start_date.isoformat() if l.start_date else None,
                "end_date": l.end_date.isoformat() if l.end_date else None,
                "monthly_rent": l.monthly_rent,
                "currency": l.currency,
                "tenant_id": str(l.tenant_id),
                "tenant_name": users.get(tenants[l.tenant_id].user_id).full_name
                if tenants.get(l.tenant_id)
                and users.get(tenants[l.tenant_id].user_id)
                else None,
            }
            for l in leases
        ]
    }


@router.post("/{property_id}/photos")
def upload_property_photos(
    property_id: uuid.UUID,
    files: List[UploadFile] = File(...),
    session: Session = Depends(get_session),
    user: User = Depends(require_agent),
):
    """上传房源照片（multipart，支持多张）。文件保存到本地 uploads 目录并追加到 photos 列表。"""
    prop = session.get(Property, property_id)
    if not prop or prop.deleted_at:
        raise HTTPException(status_code=404, detail="Property not found")
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")
    if len(files) > MAX_PHOTOS:
        raise HTTPException(status_code=400, detail=f"Too many files (max {MAX_PHOTOS})")

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    saved_urls: List[str] = []
    for file in files:
        original_name = file.filename or "photo"
        ext = os.path.splitext(original_name)[1].lower()
        if ext not in ALLOWED_IMAGE_EXTENSIONS:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported image type: {ext or 'none'}",
            )
        filename = f"{property_id}_{secrets.token_hex(8)}{ext}"
        dest = UPLOAD_DIR / filename
        try:
            with dest.open("wb") as buffer:
                shutil.copyfileobj(file.file, buffer, length=1024 * 1024)
        except Exception:
            dest.unlink(missing_ok=True)
            raise HTTPException(status_code=500, detail="Failed to save photo")
        if dest.stat().st_size > MAX_PHOTO_SIZE:
            dest.unlink(missing_ok=True)
            raise HTTPException(status_code=400, detail=f"File too large (max {MAX_PHOTO_SIZE // (1024 * 1024)}MB)")
        saved_urls.append(f"/uploads/properties/{filename}")

    # 追加到 photos 列表
    existing = list(prop.photos or [])
    existing.extend(saved_urls)
    prop.photos = existing
    session.add(prop)
    session.commit()
    session.refresh(prop)
    delete_cache_pattern("cache:properties:*")
    return {"photos": prop.photos, "added": saved_urls}


@router.delete("/{property_id}/photos")
def delete_property_photo(
    property_id: uuid.UUID,
    url: str,
    session: Session = Depends(get_session),
    user: User = Depends(require_agent),
):
    """删除房源照片（按 URL 从 photos 列表移除，并删除本地文件）。"""
    prop = session.get(Property, property_id)
    if not prop or prop.deleted_at:
        raise HTTPException(status_code=404, detail="Property not found")

    photos = list(prop.photos or [])
    if url not in photos:
        raise HTTPException(status_code=404, detail="Photo not found")
    photos.remove(url)
    prop.photos = photos or None
    session.add(prop)
    session.commit()
    session.refresh(prop)
    delete_cache_pattern("cache:properties:*")

    # 仅删除本站点 uploads 目录下的文件（防止误删外部 URL）
    if url.startswith("/uploads/properties/"):
        filename = Path(url).name
        (UPLOAD_DIR / filename).unlink(missing_ok=True)
    return {"photos": prop.photos}
