"""账号管理 API（管理员开通/编辑/启停账号、重置密码）。

权限点：account:list / account:create / account:update /
       account:deactivate / account:reset_password
"""
import uuid
from datetime import date as date_type
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy import func
from sqlmodel import Session, select

from app.db import get_session
from app.core.auth import get_current_user
from app.core.rbac import require_permission, seed_permissions, get_user_permissions
from app.core.pagination import PaginationParams, paginate
from app.core.security import get_password_hash
from app.models import (
    Employee,
    User,
    UserGroup,
    UserGroupMember,
    UserRole,
)

router = APIRouter(prefix="/admin/users", tags=["admin-users"])


class UserCreate(BaseModel):
    email: EmailStr
    full_name: str
    password: str = "123456"
    role: UserRole
    phone: Optional[str] = None
    department: Optional[str] = None
    position: Optional[str] = None


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None
    department: Optional[str] = None
    position: Optional[str] = None


class ResetPassword(BaseModel):
    new_password: str


def _serialize_user(session: Session, u: User) -> dict:
    emp = session.exec(
        select(Employee).where(
            Employee.user_id == u.id, Employee.deleted_at.is_(None)
        )
    ).first()
    memberships = session.exec(
        select(UserGroupMember).where(UserGroupMember.user_id == u.id)
    ).all()
    groups: list[str] = []
    if memberships:
        group_ids = [m.group_id for m in memberships]
        rows = session.exec(
            select(UserGroup.name).where(UserGroup.id.in_(group_ids))
        ).all()
        groups = list(rows)
    return {
        "id": str(u.id),
        "email": u.email,
        "phone": u.phone,
        "full_name": u.full_name,
        "role": u.role.value,
        "is_active": u.is_active,
        "is_verified": u.is_verified,
        "last_login_at": u.last_login_at.isoformat() if u.last_login_at else None,
        "created_at": u.created_at.isoformat() if u.created_at else None,
        "groups": groups,
        "employee": (
            {
                "employee_code": emp.employee_code,
                "department": emp.department,
                "position": emp.position,
            }
            if emp
            else None
        ),
    }


@router.get("")
def list_users(
    pagination: PaginationParams = Depends(),
    role: Optional[UserRole] = None,
    keyword: Optional[str] = None,
    session: Session = Depends(get_session),
    user: User = Depends(require_permission("account:list")),
):
    """账号列表（分页/角色/关键词过滤）。"""
    seed_permissions(session)
    conditions = [User.deleted_at.is_(None)]
    if role:
        conditions.append(User.role == role)
    if keyword:
        kw = f"%{keyword}%"
        conditions.append(
            (User.full_name.like(kw)) | (User.email.like(kw)) | (User.phone.like(kw))
        )
    total = session.exec(select(func.count(User.id)).where(*conditions)).one()
    items = session.exec(
        select(User)
        .where(*conditions)
        .order_by(User.created_at.desc())
        .offset(pagination.offset)
        .limit(pagination.limit)
    ).all()
    return paginate([_serialize_user(session, u) for u in items], total, pagination)


@router.post("", status_code=201)
def create_user(
    req: UserCreate,
    session: Session = Depends(get_session),
    user: User = Depends(require_permission("account:create")),
):
    """后台开通账号（agent/employee 自动创建员工档案）。"""
    existing = session.exec(select(User).where(User.email == req.email)).first()
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    new_user = User(
        email=req.email,
        phone=req.phone,
        full_name=req.full_name,
        hashed_password=get_password_hash(req.password),
        role=req.role,
        is_active=True,
        is_verified=True,
    )
    session.add(new_user)
    session.flush()

    if req.role in (UserRole.agent, UserRole.employee):
        session.add(
            Employee(
                user_id=new_user.id,
                employee_code=f"E{uuid.uuid4().hex[:8].upper()}",
                department=req.department,
                position=req.position,
                hire_date=date_type.today(),
                is_active=True,
            )
        )
    session.commit()
    session.refresh(new_user)
    return _serialize_user(session, new_user)


@router.patch("/{user_id}")
def update_user(
    user_id: uuid.UUID,
    req: UserUpdate,
    session: Session = Depends(get_session),
    admin: User = Depends(require_permission("account:update")),
):
    """编辑账号（角色/资料/启停）。"""
    u = session.get(User, user_id)
    if not u or u.deleted_at:
        raise HTTPException(status_code=404, detail="User not found")
    if u.id == admin.id and req.is_active is False:
        raise HTTPException(status_code=400, detail="Cannot deactivate yourself")

    data = req.model_dump(exclude_unset=True)
    new_role = data.pop("role", None)
    department = data.pop("department", None)
    position = data.pop("position", None)

    for key, value in data.items():
        setattr(u, key, value)
    if new_role:
        u.role = new_role

    if department is not None or position is not None:
        emp = session.exec(
            select(Employee).where(
                Employee.user_id == u.id, Employee.deleted_at.is_(None)
            )
        ).first()
        if emp:
            if department is not None:
                emp.department = department
            if position is not None:
                emp.position = position
            session.add(emp)

    session.add(u)
    session.commit()
    session.refresh(u)
    return _serialize_user(session, u)


@router.post("/{user_id}/deactivate")
def deactivate_user(
    user_id: uuid.UUID,
    session: Session = Depends(get_session),
    admin: User = Depends(require_permission("account:deactivate")),
):
    """停用账号（登录态随即失效）。"""
    u = session.get(User, user_id)
    if not u or u.deleted_at:
        raise HTTPException(status_code=404, detail="User not found")
    if u.id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot deactivate yourself")
    u.is_active = False
    session.add(u)
    session.commit()
    return {"id": str(u.id), "is_active": False}


@router.post("/{user_id}/activate")
def activate_user(
    user_id: uuid.UUID,
    session: Session = Depends(get_session),
    admin: User = Depends(require_permission("account:deactivate")),
):
    """启用账号。"""
    u = session.get(User, user_id)
    if not u or u.deleted_at:
        raise HTTPException(status_code=404, detail="User not found")
    u.is_active = True
    session.add(u)
    session.commit()
    return {"id": str(u.id), "is_active": True}


@router.post("/{user_id}/reset-password")
def reset_password(
    user_id: uuid.UUID,
    req: ResetPassword,
    session: Session = Depends(get_session),
    admin: User = Depends(require_permission("account:reset_password")),
):
    """重置指定账号密码。"""
    u = session.get(User, user_id)
    if not u or u.deleted_at:
        raise HTTPException(status_code=404, detail="User not found")
    if not req.new_password or len(req.new_password) < 6:
        raise HTTPException(status_code=400, detail="Password too short (min 6)")
    u.hashed_password = get_password_hash(req.new_password)
    session.add(u)
    session.commit()
    return {"id": str(u.id), "ok": True}


@router.get("/me")
def my_account(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """当前账号信息与权限点（前端菜单与按钮级控制）。"""
    perms = get_user_permissions(session, user)
    return {
        "id": str(user.id),
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role.value,
        "is_active": user.is_active,
        "permissions": sorted(perms),
    }