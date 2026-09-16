"""预约看房路由：访客提交预约、员工确认、状态流转。

对应设计文档访客转化闭环：
- POST   /viewings                提交预约（支持未登录访客，也支持登录用户）
- GET    /viewings/mine           我发起的预约（租客/员工）
- GET    /viewings                预约列表（员工/管理员）
- PATCH  /viewings/{id}           更新状态（员工确认/完成/取消/爽约）
"""
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from app.db import get_session
from app.core.auth import get_current_user, require_employee
from app.core.pagination import PaginationParams, paginate_query
from app.models import (
    Employee,
    Property,
    User,
    UserRole,
    ViewingAppointment,
    ViewingStatus,
)

router = APIRouter(prefix="/viewings", tags=["viewings"])


class ViewingCreate(BaseModel):
    property_id: uuid.UUID
    scheduled_at: datetime
    notes: Optional[str] = None
    # 未登录访客信息
    visitor_name: Optional[str] = None
    visitor_phone: Optional[str] = None
    visitor_email: Optional[str] = None


class ViewingUpdate(BaseModel):
    status: Optional[ViewingStatus] = None
    scheduled_at: Optional[datetime] = None
    assigned_to: Optional[uuid.UUID] = None
    completed_at: Optional[datetime] = None
    cancel_reason: Optional[str] = None


def _can_manage(user: User, v: ViewingAppointment) -> bool:
    if user.id == v.requester_user_id:
        return True
    return user.role in (UserRole.admin, UserRole.agent, UserRole.employee)


def _with_property(session: Session, v: ViewingAppointment) -> dict:
    prop = session.get(Property, v.property_id)
    return {
        "id": str(v.id),
        "property_id": str(v.property_id),
        "property_title": prop.display_name if prop else None,
        "property_address": prop.address if prop else None,
        "scheduled_at": v.scheduled_at.isoformat() if v.scheduled_at else None,
        "notes": v.notes,
        "visitor_name": v.visitor_name,
        "visitor_phone": v.visitor_phone,
        "visitor_email": v.visitor_email,
        "status": v.status.value if v.status else None,
        "assigned_to": str(v.assigned_to) if v.assigned_to else None,
        "lead_id": str(v.lead_id) if v.lead_id else None,
        "completed_at": v.completed_at.isoformat() if v.completed_at else None,
        "cancel_reason": v.cancel_reason,
        "created_at": v.created_at.isoformat() if v.created_at else None,
    }


@router.post("")
def create_viewing(
    req: ViewingCreate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """提交预约看房。登录用户自动关联 requester_user_id。"""
    prop = session.get(Property, req.property_id)
    if not prop or prop.deleted_at:
        raise HTTPException(status_code=404, detail="Property not found")

    appointment = ViewingAppointment(
        property_id=req.property_id,
        scheduled_at=req.scheduled_at,
        notes=req.notes,
        requester_user_id=user.id if user.id else None,
        visitor_name=req.visitor_name or (user.full_name if user.id else None),
        visitor_phone=req.visitor_phone,
        visitor_email=str(req.visitor_email) if req.visitor_email else None,
        status=ViewingStatus.pending,
    )
    session.add(appointment)
    session.commit()
    session.refresh(appointment)
    return _with_property(session, appointment)


@router.get("")
def list_viewings(
    pagination: PaginationParams = Depends(),
    status: Optional[ViewingStatus] = None,
    property_id: Optional[uuid.UUID] = None,
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """预约列表（员工/管理员）。"""
    conditions = [ViewingAppointment.deleted_at.is_(None)]
    if status:
        conditions.append(ViewingAppointment.status == status)
    if property_id:
        conditions.append(ViewingAppointment.property_id == property_id)

    stmt = (
        select(ViewingAppointment)
        .where(*conditions)
        .order_by(ViewingAppointment.scheduled_at.asc())
    )
    page = paginate_query(session, stmt, pagination)
    page.items = [_with_property(session, v) for v in page.items]
    return page


@router.get("/mine")
def list_my_viewings(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """我发起的预约（登录用户）。"""
    items = session.exec(
        select(ViewingAppointment)
        .where(
            ViewingAppointment.requester_user_id == user.id,
            ViewingAppointment.deleted_at.is_(None),
        )
        .order_by(ViewingAppointment.scheduled_at.desc())
    ).all()
    return {"items": [_with_property(session, v) for v in items], "total": len(items)}


@router.get("/{viewing_id}")
def get_viewing(
    viewing_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """预约详情。"""
    v = session.get(ViewingAppointment, viewing_id)
    if not v or v.deleted_at:
        raise HTTPException(status_code=404, detail="Viewing not found")
    if not _can_manage(user, v):
        raise HTTPException(status_code=403, detail="Access denied")
    return _with_property(session, v)


@router.patch("/{viewing_id}")
def update_viewing(
    viewing_id: uuid.UUID,
    req: ViewingUpdate,
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """更新预约状态（员工确认/完成/取消/爽约）。"""
    v = session.get(ViewingAppointment, viewing_id)
    if not v or v.deleted_at:
        raise HTTPException(status_code=404, detail="Viewing not found")

    data = req.model_dump(exclude_unset=True)
    # 状态流转时补齐关联字段
    if data.get("status") == ViewingStatus.completed and not data.get("completed_at"):
        data["completed_at"] = datetime.utcnow()
    if data.get("status") == ViewingStatus.confirmed:
        # 未分配员工时，默认绑定当前员工
        if not v.assigned_to and not data.get("assigned_to"):
            emp = session.exec(
                select(Employee).where(
                    Employee.user_id == user.id, Employee.deleted_at.is_(None)
                )
            ).first()
            if emp:
                data["assigned_to"] = emp.id

    for key, value in data.items():
        setattr(v, key, value)
    session.add(v)
    session.commit()
    session.refresh(v)
    return _with_property(session, v)