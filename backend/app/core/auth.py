"""FastAPI 认证依赖：从请求头提取 JWT，返回当前用户"""
import uuid
from typing import Optional

from fastapi import Depends, HTTPException, Query, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import false
from sqlmodel import Session, select
from .security import decode_access_token
from ..db import get_session
from ..models.lease import Lease
from ..models.owner import Owner
from ..models.tenant import Tenant
from ..models.user import User, UserRole

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")

# 可选版：请求头缺失时不抛 401，交由依赖体统一判断。
oauth2_scheme_optional = OAuth2PasswordBearer(
    tokenUrl="/api/v1/auth/login", auto_error=False
)

def is_token_revoked(payload: dict, user: User) -> bool:
    """令牌是否已被吊销。

    JWT 自包含且不可撤销，故签发时把账号当前的 `token_version` 写入 `tv` 声明；
    登出 / 重置密码会把 `user.token_version` +1，此处比对不一致即视为已吊销。

    兼容旧令牌：没有 `tv` 声明时按 0 处理，账号未被吊销过（token_version 仍为 0）
    即可继续使用，避免上线时把存量会话全部踢下线。
    """
    return int(payload.get("tv") or 0) != int(user.token_version or 0)

def user_from_token(token: str, session: Session) -> User:
    """校验 JWT 并取出当前用户；无效则抛 401。

    抽成独立函数以便「请求头」与「查询串」两条取令牌路径复用同一套校验
    （签名、有效期、账号状态、令牌版本号吊销）。
    """
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")
    # 转换为 UUID 对象以兼容 SQLite 和 PostgreSQL
    try:
        user_uid = uuid.UUID(user_id) if isinstance(user_id, str) else user_id
    except (ValueError, AttributeError):
        raise HTTPException(status_code=401, detail="Invalid token payload")
    user = session.get(User, user_uid)
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")
    if is_token_revoked(payload, user):
        raise HTTPException(
            status_code=401,
            detail="Token revoked, please login again",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def get_current_user(
    token: str = Depends(oauth2_scheme),
    session: Session = Depends(get_session),
) -> User:
    return user_from_token(token, session)


def get_current_user_allow_query_token(
    header_token: Optional[str] = Depends(oauth2_scheme_optional),
    query_token: Optional[str] = Query(
        None,
        alias="token",
        description="访问令牌。仅文件类接口支持，供无法自定义请求头的场景使用。",
    ),
    session: Session = Depends(get_session),
) -> User:
    """文件类接口专用认证：优先取 `Authorization` 头，退化到 `?token=`。

    为什么需要查询串：浏览器 `window.open` / `<img src>`、小程序 `previewImage`
    等场景无法附带自定义请求头，若不支持查询串传递，敏感文件就只能继续裸奔在
    公开静态目录下。查询串令牌会进入访问日志，故该依赖仅用于文件读取接口，
    其余接口一律使用 `get_current_user`（只认请求头）。
    """
    token = header_token or query_token
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user_from_token(token, session)

def require_role(*roles: UserRole):
    """角色权限检查依赖工厂"""
    def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required roles: {[r.value for r in roles]}",
            )
        return current_user
    return role_checker

# 常用角色依赖
require_admin = require_role(UserRole.admin)
require_agent = require_role(UserRole.admin, UserRole.agent)
require_employee = require_role(UserRole.admin, UserRole.agent, UserRole.employee)
require_owner = require_role(UserRole.admin, UserRole.owner)
require_tenant = require_role(UserRole.admin, UserRole.tenant)

# 内部员工角色元组（可看全量数据）；多个路由各自复制过一份，统一从这里取
STAFF_ROLES = (UserRole.admin, UserRole.agent, UserRole.employee)


def owner_id_of(session: Session, user: User) -> Optional[uuid.UUID]:
    """当前账号对应的业主档案 id（未建档返回 None）。"""
    owner = session.exec(
        select(Owner).where(Owner.user_id == user.id, Owner.deleted_at.is_(None))
    ).first()
    return owner.id if owner else None


def tenant_id_of(session: Session, user: User) -> Optional[uuid.UUID]:
    """当前账号对应的租客档案 id（未建档返回 None）。"""
    tenant = session.exec(
        select(Tenant).where(Tenant.user_id == user.id, Tenant.deleted_at.is_(None))
    ).first()
    return tenant.id if tenant else None


def lease_visibility_conditions(session: Session, user: User) -> list:
    """租约可见性 → 查询条件（数据隔离必须由 token 决定，不能由调用方传参决定）。

    - 员工（admin/agent/employee）：全量，内部作业需要跨业主查阅；
    - 业主：仅本人名下房源的租约；
    - 租客：仅本人租约；
    - 其余角色：不可见。

    返回 `[false()]` 表示「一条都看不到」。这里**必须**显式置空而不是返回空列表
    （空列表 = 不加条件 = 全量泄露），这是租约接口此前最严重的一处越权：
    任何登录用户都能读到全部租约，租客端页面甚至一直依赖这个错误行为。
    """
    if user.role in STAFF_ROLES:
        return []
    if user.role == UserRole.owner:
        owner_id = owner_id_of(session, user)
        return [Lease.owner_id == owner_id] if owner_id else [false()]
    if user.role == UserRole.tenant:
        tenant_id = tenant_id_of(session, user)
        return [Lease.tenant_id == tenant_id] if tenant_id else [false()]
    return [false()]


def can_view_lease(session: Session, user: User, lease: Lease) -> bool:
    """单条租约的可见性判定（与 `lease_visibility_conditions` 同一口径）。"""
    if user.role in STAFF_ROLES:
        return True
    if user.role == UserRole.owner:
        return lease.owner_id is not None and lease.owner_id == owner_id_of(session, user)
    if user.role == UserRole.tenant:
        return lease.tenant_id is not None and lease.tenant_id == tenant_id_of(session, user)
    return False


def serialize_user(user: User) -> dict:
    """项目内统一的用户脱敏序列化：不暴露 hashed_password / token_version 等敏感字段。

    users_admin 的账号列表/详情在其基础上追加员工档案、分组等管理字段。
    """
    return {
        "id": str(user.id),
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role.value,
        "phone": user.phone,
        "avatar_url": user.avatar_url,
        "preferred_language": user.preferred_language,
    }
