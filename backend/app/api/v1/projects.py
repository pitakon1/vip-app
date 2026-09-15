"""项目/楼盘路由：项目 CRUD。"""
import uuid
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlmodel import Session, select

from app.db import get_session
from app.core.auth import get_current_user, require_agent
from app.core.pagination import PaginationParams, paginate
from app.models import Project, User
from app.providers.geo import geo_provider

router = APIRouter(prefix="/projects", tags=["projects"])


class ProjectCreate(BaseModel):
    name: str
    address: str
    district: Optional[str] = None
    city: Optional[str] = None
    province: Optional[str] = None
    country: Optional[str] = None
    nearest_subway: Optional[str] = None
    developer: Optional[str] = None
    property_management_company: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    total_units: Optional[int] = None
    completion_year: Optional[int] = None
    amenities: Optional[Dict[str, Any]] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    district: Optional[str] = None
    city: Optional[str] = None
    province: Optional[str] = None
    country: Optional[str] = None
    nearest_subway: Optional[str] = None
    developer: Optional[str] = None
    property_management_company: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    total_units: Optional[int] = None
    completion_year: Optional[int] = None
    amenities: Optional[Dict[str, Any]] = None


@router.get("")
def list_projects(
    pagination: PaginationParams = Depends(),
    district: Optional[str] = None,
    city: Optional[str] = None,
    province: Optional[str] = None,
    country: Optional[str] = None,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """项目列表（分页）。"""
    conditions = [Project.deleted_at.is_(None)]
    if country:
        conditions.append(Project.country == country)
    if province:
        conditions.append(Project.province == province)
    if city:
        conditions.append(Project.city == city)
    if district:
        conditions.append(Project.district == district)

    stmt = select(Project).where(*conditions).order_by(Project.created_at.desc())
    count_stmt = select(func.count(Project.id)).where(*conditions)
    total = session.exec(count_stmt).one()
    items = session.exec(
        stmt.offset(pagination.offset).limit(pagination.limit)
    ).all()
    return paginate(items, total, pagination)


@router.post("")
def create_project(
    req: ProjectCreate,
    session: Session = Depends(get_session),
    user: User = Depends(require_agent),
):
    """创建项目（agent+ 权限）。"""
    project = Project(**req.model_dump())
    session.add(project)
    session.commit()
    session.refresh(project)
    return project


@router.get("/{project_id}")
def get_project(
    project_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """获取项目详情。"""
    project = session.get(Project, project_id)
    if not project or project.deleted_at:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.patch("/{project_id}")
def update_project(
    project_id: uuid.UUID,
    req: ProjectUpdate,
    session: Session = Depends(get_session),
    user: User = Depends(require_agent),
):
    """更新项目信息。"""
    project = session.get(Project, project_id)
    if not project or project.deleted_at:
        raise HTTPException(status_code=404, detail="Project not found")
    update_data = req.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(project, key, value)
    session.add(project)
    session.commit()
    session.refresh(project)
    return project


@router.post("/{project_id}/geocode")
def geocode_project(
    project_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(require_agent),
):
    """按项目地址解析经纬度并落库，供地图找房使用。

    地址由 name + address + district + city 拼接（东南亚地址里项目名往往比门牌更好定位）；
    使用配置的 Google Geocoding，未配置 key 时走内置 mock，结果仅用于演示。
    """
    project = session.get(Project, project_id)
    if not project or project.deleted_at:
        raise HTTPException(status_code=404, detail="Project not found")
    query = " ".join(
        part for part in (project.name, project.address, project.district, project.city) if part
    ).strip()
    if not query:
        raise HTTPException(status_code=400, detail="Project has no address to geocode")
    result = geo_provider.geocode(query)
    project.lat = result["lat"]
    project.lng = result["lng"]
    session.add(project)
    session.commit()
    session.refresh(project)
    return {
        "project_id": project.id,
        "provider": result.get("provider"),
        "lat": project.lat,
        "lng": project.lng,
    }
