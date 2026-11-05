"""预约看房路由：访客提交预约、员工确认、状态流转。

对应设计文档访客转化闭环：
- POST   /viewings                提交预约（支持未登录访客，也支持登录用户）
- GET    /viewings/mine           我发起的预约（租客/员工）
- GET    /viewings                预约列表（员工/管理员）
- PATCH  /viewings/{id}           更新状态（员工确认/完成/取消/爽约）
"""
import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import or_
from sqlmodel import Session, select

from app.db import get_session
from app.core.auth import get_current_user, require_employee
from app.core.pagination import Page, PaginationParams, paginate_query
from app.services.data_scope import staff_employee_ids_in_scope
from app.models import (
    Employee,
    Property,
    User,
    UserRole,
    ViewingAppointment,
    ViewingStatus,
)

router = APIRouter(prefix="/viewings", tags=["viewings"])

# 预约状态流转白名单：pending→confirmed→completed/cancelled/no_show；禁止回退
# （confirmed→pending）与跳步（pending→completed），已完成/已取消/爽约为终态
_VIEWING_TRANSITIONS = {
    ViewingStatus.pending: {
        ViewingStatus.confirmed,
        ViewingStatus.cancelled,
        ViewingStatus.no_show,
    },
    ViewingStatus.confirmed: {
        ViewingStatus.completed,
        ViewingStatus.cancelled,
        ViewingStatus.no_show,
    },
    ViewingStatus.completed: set(),
    ViewingStatus.cancelled: set(),
    ViewingStatus.no_show: set(),
}


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


# ---------------- 响应模型（OpenAPI 契约） ----------------
class ViewingOut(BaseModel):
    """预约看房对外字段（含房源标题/地址等附加信息）。"""

    model_config = ConfigDict(extra="allow")

    id: Optional[str] = None
    property_id: Optional[str] = None
    property_title: Optional[str] = None
    property_address: Optional[str] = None
    scheduled_at: Optional[str] = None
    notes: Optional[str] = None
    visitor_name: Optional[str] = None
    visitor_phone: Optional[str] = None
    visitor_email: Optional[str] = None
    status: Optional[str] = None
    assigned_to: Optional[str] = None
    lead_id: Optional[str] = None
    completed_at: Optional[str] = None
    cancel_reason: Optional[str] = None
    created_at: Optional[str] = None


class ViewingListOut(BaseModel):
    """我的预约列表（非分页结构：items + total）。"""

    model_config = ConfigDict(extra="allow")

    items: Optional[List[ViewingOut]] = None
    total: Optional[int] = None


def _scoped_employee_ids(session: Session, user: User):
    """当前员工可管理的 `employees.id` 集合；None 表示不限（admin / scope=all）。"""
    if user.role == UserRole.admin:
        return None
    return staff_employee_ids_in_scope(session, user)


def _can_manage(session: Session, user: User, v: ViewingAppointment) -> bool:
    """能否查看/操作该预约：admin 全部；其余限未分配、本人/同组、或本人发起。

    此前任意员工都能 GET 任意预约详情（含访客手机号），并可通过 PATCH 改派给任何人。
    """
    if user.id == v.requester_user_id:
        return True
    if user.role == UserRole.admin:
        return True
    if user.role not in (UserRole.agent, UserRole.employee, UserRole.partner_admin):
        return False
    emp_ids = _scoped_employee_ids(session, user)
    if emp_ids is None:
        return True
    if v.assigned_to is None:
        return True  # 未分配的新预约：同组员工都可见，避免队列无人处理
    return v.assigned_to in emp_ids


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

    # 同一房源同一时段已有待确认/已确认的预约时拒绝堆积
    conflicting = session.exec(
        select(ViewingAppointment).where(
            ViewingAppointment.property_id == req.property_id,
            ViewingAppointment.scheduled_at == req.scheduled_at,
            ViewingAppointment.status.in_(
                (ViewingStatus.pending, ViewingStatus.confirmed)
            ),
            ViewingAppointment.deleted_at.is_(None),
        )
    ).first()
    if conflicting:
        raise HTTPException(
            status_code=409,
            detail="This time slot is already booked for the property",
        )

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


@router.get("", response_model=Page[ViewingOut])
def list_viewings(
    pagination: PaginationParams = Depends(),
    status: Optional[ViewingStatus] = None,
    property_id: Optional[uuid.UUID] = None,
    assigned_to: Optional[uuid.UUID] = None,
    scheduled_from: Optional[datetime] = None,
    scheduled_to: Optional[datetime] = None,
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """预约列表（员工/管理员；非 admin 按本人/同组收窄）。

    `assigned_to` / `scheduled_from` / `scheduled_to` 供员工首页「今日带看」与
    日历按「本人 + 日期区间」取数：此前只能拉默认 20 条再本地按日期筛，
    跨月/跨组时既漏数据又多拉无关记录。
    """
    conditions = [ViewingAppointment.deleted_at.is_(None)]
    if status:
        conditions.append(ViewingAppointment.status == status)
    if property_id:
        conditions.append(ViewingAppointment.property_id == property_id)
    if scheduled_from:
        conditions.append(ViewingAppointment.scheduled_at >= scheduled_from)
    if scheduled_to:
        conditions.append(ViewingAppointment.scheduled_at <= scheduled_to)
    # 归属过滤：此前不带条件，任何员工都能翻到全平台预约（含访客手机号）
    emp_ids = _scoped_employee_ids(session, user)
    if assigned_to is not None:
        # 非 admin 只能指定自己/同组员工，避免借参数翻他人预约
        if emp_ids is not None and assigned_to not in emp_ids:
            raise HTTPException(
                status_code=403,
                detail="Can only filter viewings assigned to yourself or your group",
            )
        conditions.append(ViewingAppointment.assigned_to == assigned_to)
    if emp_ids is not None:
        scope_conds = [ViewingAppointment.assigned_to.is_(None)]
        if emp_ids:
            scope_conds.append(ViewingAppointment.assigned_to.in_(emp_ids))
        scope_conds.append(ViewingAppointment.requester_user_id == user.id)
        conditions.append(or_(*scope_conds))

    stmt = (
        select(ViewingAppointment)
        .where(*conditions)
        .order_by(ViewingAppointment.scheduled_at.asc())
    )
    page = paginate_query(session, stmt, pagination)
    page.items = [_with_property(session, v) for v in page.items]
    return page


@router.get("/mine", response_model=ViewingListOut)
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


@router.get("/{viewing_id}", response_model=ViewingOut)
def get_viewing(
    viewing_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """预约详情。"""
    v = session.get(ViewingAppointment, viewing_id)
    if not v or v.deleted_at:
        raise HTTPException(status_code=404, detail="Viewing not found")
    if not _can_manage(session, user, v):
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
    # 归属校验：此前任何员工都能改任意预约（含改派给其他人）
    if not _can_manage(session, user, v):
        raise HTTPException(status_code=403, detail="Access denied")

    data = req.model_dump(exclude_unset=True)
    # 非 admin 只能把预约派给自己/同组员工，不能跨组改派
    if data.get("assigned_to") is not None and user.role != UserRole.admin:
        emp_ids = _scoped_employee_ids(session, user)
        if emp_ids is not None and data["assigned_to"] not in emp_ids:
            raise HTTPException(
                status_code=403,
                detail="Can only assign viewings to yourself or your group",
            )
    # 状态机校验：仅允许白名单内流转（pending→confirmed→completed/cancelled），非法 409
    new_status = data.get("status")
    if new_status is not None and new_status != v.status:
        if new_status not in _VIEWING_TRANSITIONS.get(v.status, set()):
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Invalid status transition: {v.status.value} -> {new_status.value}"
                ),
            )
    # 指派员工必须真实存在
    if data.get("assigned_to") is not None:
        employee = session.get(Employee, data["assigned_to"])
        if not employee or employee.deleted_at:
            raise HTTPException(status_code=400, detail="Employee not found")
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