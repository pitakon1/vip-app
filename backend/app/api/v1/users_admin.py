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
from app.core.auth import get_current_user, serialize_user
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
    data = serialize_user(u)
    data.update(
        is_active=u.is_active,
        is_verified=u.is_verified,
        last_login_at=u.last_login_at.isoformat() if u.last_login_at else None,
        created_at=u.created_at.isoformat() if u.created_at else None,
        groups=groups_map.get(u.id, []),
        employee=(
            {
                "employee_code": emp.employee_code,
                "department": emp.department,
                "position": emp.position,
            }
            if emp
            else None
        ),
    )
    return data


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
    if not req.password or len(req.password) < 6:
        raise HTTPException(status_code=400, detail="Password too short (min 6)")

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
    """编辑账号（角色/资料/启停）。

    安全约定：
    - `is_active` 变更（停用/启用他人）需要额外权限 `account:deactivate`——
      仅持有 `account:update` 不得绕过独立启停权限直接停用账号；
    - 角色改为 `admin` 属提权：仅 admin 本人可授予，且禁止把自己改为 admin；
    - email/phone 提交前查重，避免撞唯一索引 500 或同号多账号歧义；
    - role 变为 agent/employee 时自动创建员工档案（与 create_user 一致），
      变为其他角色时软删档案。
    """
    u = session.get(User, user_id)
    if not u or u.deleted_at:
        raise HTTPException(status_code=404, detail="User not found")

    data = req.model_dump(exclude_unset=True)
    is_active_change = data.pop("is_active", None)
    new_role = data.pop("role", None)
    department = data.pop("department", None)
    position = data.pop("position", None)

    if is_active_change is not None:
        if u.id == admin.id and is_active_change is False:
            raise HTTPException(status_code=400, detail="Cannot deactivate yourself")
        perms = get_user_permissions(session, admin)
        if "account:deactivate" not in perms:
            raise HTTPException(
                status_code=403,
                detail="Access denied. Required permissions: ['account:deactivate']",
            )
        u.is_active = is_active_change

    if new_role:
        if new_role == UserRole.admin and admin.role != UserRole.admin:
            raise HTTPException(
                status_code=403, detail="Only admins can grant the admin role"
            )
        if u.id == admin.id and new_role == UserRole.admin:
            raise HTTPException(
                status_code=400, detail="Cannot change your own role to admin"
            )
        u.role = new_role

    new_email = data.get("email")
    if new_email is not None and new_email != u.email:
        if session.exec(
            select(User).where(User.email == new_email, User.id != u.id)
        ).first():
            raise HTTPException(status_code=409, detail="Email already in use")
    new_phone = data.get("phone")
    if new_phone is not None and new_phone != u.phone:
        if session.exec(
            select(User).where(User.phone == new_phone, User.id != u.id)
        ).first():
            raise HTTPException(status_code=409, detail="Phone already in use")

    for key, value in data.items():
        setattr(u, key, value)

    # 角色联动员工档案：变为 agent/employee 且无档案时自动建档；
    # 变为其他角色（owner/tenant/admin）时软删档案
    if new_role:
        emp = session.exec(
            select(Employee).where(
                Employee.user_id == u.id, Employee.deleted_at.is_(None)
            )
        ).first()
        if new_role in (UserRole.agent, UserRole.employee):
            if not emp:
                session.add(
                    Employee(
                        user_id=u.id,
                        employee_code=f"E{uuid.uuid4().hex[:8].upper()}",
                        department=department,
                        position=position,
                        hire_date=date_type.today(),
                        is_active=True,
                    )
                )
        elif emp:
            emp.deleted_at = datetime.now()
            session.add(emp)

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