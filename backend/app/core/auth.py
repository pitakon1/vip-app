"""FastAPI 认证依赖：从请求头提取 JWT，返回当前用户"""
import uuid
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlmodel import Session
from .security import decode_access_token
from ..db import get_session
from ..models.user import User, UserRole

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")

def is_token_revoked(payload: dict, user: User) -> bool:
    """令牌是否已被吊销。

    JWT 自包含且不可撤销，故签发时把账号当前的 `token_version` 写入 `tv` 声明；
    登出 / 重置密码会把 `user.token_version` +1，此处比对不一致即视为已吊销。

    兼容旧令牌：没有 `tv` 声明时按 0 处理，账号未被吊销过（token_version 仍为 0）
    即可继续使用，避免上线时把存量会话全部踢下线。
    """
    return int(payload.get("tv") or 0) != int(user.token_version or 0)

def get_current_user(
    token: str = Depends(oauth2_scheme),
    session: Session = Depends(get_session),
) -> User:
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
