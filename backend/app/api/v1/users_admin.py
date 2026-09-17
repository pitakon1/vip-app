"""账号管理 API（管理员开通/编辑/启停账号、重置密码）。

权限点：account:list / account:create / account:update /
       account:deactivate / account:reset_password
"""
import uuid
from datetime import date as date_type, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlmodel import Session, select

from app.db import get_session
from app.core.auth import get_current_user
from app.core.rbac import require_permission, get_user_permissions
from app.core.pagination import Page, PaginationParams, paginate_query
from app.core.security import get_password_hash
from app.schemas.user import AccountMeOut, UserAdminOut
from app.models import (
    Employee,
    Lead,
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


def _batch_extras(
    session: Session, user_ids: list[uuid.UUID]
) -> tuple[dict, dict]:
    """批量取员工档案与分组名。

    原实现对每个用户各查 2~3 次（列表 20 条即 40~60 次查询，N+1），
    这里改为按 id 批量 `in_()` + join，固定 2 次查询。
    """
    if not user_ids:
        return {}, {}

    employees = session.exec(
        select(Employee).where(
            Employee.user_id.in_(user_ids), Employee.deleted_at.is_(None)
        )
    ).all()
    emp_map = {e.user_id: e for e in employees}

    rows = session.exec(
        select(UserGroupMember.user_id, UserGroup.name)
        .join(UserGroup, UserGroup.id == UserGroupMember.group_id)
        .where(UserGroupMember.user_id.in_(user_ids))
    ).all()
    groups_map: dict[uuid.UUID, list[str]] = {}
    for uid, name in rows:
        groups_map.setdefault(uid, []).append(name)

    return emp_map, groups_map


def _serialize_user(u: User, emp_map: dict, groups_map: dict) -> dict:
    emp = emp_map.get(u.id)
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
        "groups": groups_map.get(u.id, []),
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


def _serialize_one(session: Session, u: User) -> dict:
    """单用户序列化（创建/编辑后返回）。"""
    emp_map, groups_map = _batch_extras(session, [u.id])
    return _serialize_user(u, emp_map, groups_map)


@router.get("", response_model=Page[UserAdminOut])
def list_users(
    pagination: PaginationParams = Depends(),
    role: Optional[UserRole] = None,
    keyword: Optional[str] = None,
    session: Session = Depends(get_session),
    user: User = Depends(require_permission("account:list")),
):
    """账号列表（分页/角色/关键词过滤）。"""
    conditions = [User.deleted_at.is_(None)]
    if role:
        conditions.append(User.role == role)
    if keyword:
        kw = f"%{keyword}%"
        conditions.append(
            (User.full_name.like(kw)) | (User.email.like(kw)) | (User.phone.like(kw))
        )
    stmt = (
        select(User)
        .where(*conditions)
        .order_by(User.created_at.desc())
    )
    page = paginate_query(session, stmt, pagination)
    emp_map, groups_map = _batch_extras(session, [u.id for u in page.items])
    page.items = [_serialize_user(u, emp_map, groups_map) for u in page.items]
    return page


@router.post("", status_code=201, response_model=UserAdminOut)
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
    return _serialize_one(session, new_user)


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
    return _serialize_one(session, u)


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


@router.delete("/{user_id}")
def delete_user(
    user_id: uuid.UUID,
    session: Session = Depends(get_session),
    admin: User = Depends(require_permission("account:deactivate")),
):
    """删除账号（软删除）。

    采用软删除：置 deleted_at 并停用、令牌失效，避免硬删造成历史单据
    外键孤儿；同时处理关联数据（员工档案软删、名下线索责任人置空）。
    """
    u = session.get(User, user_id)
    if not u or u.deleted_at:
        raise HTTPException(status_code=404, detail="User not found")
    if u.id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")

    u.deleted_at = datetime.now()
    u.is_active = False
    # 递增令牌版本号，使该账号已签发的令牌全部失效
    u.token_version = int(u.token_version or 0) + 1
    session.add(u)

    # 名下员工档案一并软删
    emp = session.exec(
        select(Employee).where(
            Employee.user_id == u.id, Employee.deleted_at.is_(None)
        )
    ).first()
    if emp:
        emp.deleted_at = datetime.now()
        session.add(emp)

    # 名下线索的责任人置空，避免孤儿引用（线索本身保留）
    leads = session.exec(
        select(Lead).where(Lead.assigned_to == u.id, Lead.deleted_at.is_(None))
    ).all()
    for lead in leads:
        lead.assigned_to = None
        session.add(lead)

    session.commit()
    return {"id": str(u.id), "ok": True, "deleted": True}


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
    # 改密后旧令牌立即失效：递增令牌版本号，使此前签发的 access/refresh 令牌被拒绝
    u.token_version = int(u.token_version or 0) + 1
    session.add(u)
    session.commit()
    return {"id": str(u.id), "ok": True}


@router.get("/me", response_model=AccountMeOut)
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