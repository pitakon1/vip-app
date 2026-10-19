"""数据范围（data-scope）配置 API。权限点：data:scope:manage

管理员按角色配置默认可见范围，并对个别用户做例外覆盖。生效优先级：
用户级覆盖 → 角色级配置 → 内置默认（admin=all，其余=self）。
"""
import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlmodel import Session, select

from app.core.rbac import require_permission
from app.db import get_session
from app.models import DataScope, RoleDataScope, User, UserDataScope, UserRole

router = APIRouter(prefix="/admin/data-scopes", tags=["admin-data-scopes"])


class RoleScopeOut(BaseModel):
    model_config = ConfigDict(extra="allow")

    role: Optional[str] = None
    scope: Optional[str] = None  # 有效值（含内置默认）
    configured: Optional[bool] = None  # 是否已显式配置（false=走内置默认）


class UserScopeOut(BaseModel):
    model_config = ConfigDict(extra="allow")

    user_id: Optional[str] = None
    full_name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
    scope: Optional[str] = None
    configured: Optional[bool] = None


class DataScopeViewOut(BaseModel):
    model_config = ConfigDict(extra="allow")

    roles: List[RoleScopeOut] = []
    users: List[UserScopeOut] = []
    values: List[str] = []


class ScopeSetIn(BaseModel):
    scope: DataScope


def _default_scope(role: UserRole) -> DataScope:
    return DataScope.all if role == UserRole.admin else DataScope.self_


@router.get("", response_model=DataScopeViewOut)
def get_data_scopes(
    session: Session = Depends(get_session),
    user: User = Depends(require_permission("data:scope:manage")),
):
    """角色数据范围 + 已配置的用户级覆盖。"""
    role_rows = {
        r.role: r
        for r in session.exec(
            select(RoleDataScope).where(RoleDataScope.deleted_at.is_(None))
        ).all()
    }
    roles = []
    for r in UserRole:
        row = role_rows.get(r)
        roles.append(
            {
                "role": r.value,
                "scope": (row.scope.value if row else _default_scope(r).value),
                "configured": row is not None,
            }
        )

    user_rows = session.exec(
        select(UserDataScope).where(UserDataScope.deleted_at.is_(None))
    ).all()
    users: list[dict] = []
    if user_rows:
        uids = [u_row.user_id for u_row in user_rows]
        users_map = {
            u.id: u
            for u in session.exec(select(User).where(User.id.in_(uids))).all()
        }
        for u_row in user_rows:
            u = users_map.get(u_row.user_id)
            users.append(
                {
                    "user_id": str(u_row.user_id),
                    "full_name": u.full_name if u else None,
                    "email": u.email if u else None,
                    "role": u.role.value if u else None,
                    "scope": u_row.scope.value,
                    "configured": True,
                }
            )
    return {
        "roles": roles,
        "users": users,
        "values": [s.value for s in DataScope],
    }


@router.put("/roles/{role}", response_model=RoleScopeOut)
def set_role_scope(
    role: UserRole,
    req: ScopeSetIn,
    session: Session = Depends(get_session),
    user: User = Depends(require_permission("data:scope:manage")),
):
    """设置角色级默认数据范围（幂等 upsert）。"""
    row = session.exec(
        select(RoleDataScope).where(RoleDataScope.role == role)
    ).first()
    if row is None:
        row = RoleDataScope(role=role, scope=req.scope)
    else:
        row.deleted_at = None
        row.scope = req.scope
    session.add(row)
    session.commit()
    return {"role": role.value, "scope": req.scope.value, "configured": True}


@router.put("/users/{user_id}", response_model=UserScopeOut)
def set_user_scope(
    user_id: uuid.UUID,
    req: ScopeSetIn,
    session: Session = Depends(get_session),
    user: User = Depends(require_permission("data:scope:manage")),
):
    """设置用户级数据范围覆盖（幂等 upsert）。"""
    target = session.get(User, user_id)
    if not target or target.deleted_at:
        raise HTTPException(status_code=404, detail="用户不存在")
    row = session.exec(
        select(UserDataScope).where(UserDataScope.user_id == user_id)
    ).first()
    if row is None:
        row = UserDataScope(user_id=user_id, scope=req.scope)
    else:
        row.deleted_at = None
        row.scope = req.scope
    session.add(row)
    session.commit()
    return {
        "user_id": str(user_id),
        "full_name": target.full_name,
        "email": target.email,
        "role": target.role.value,
        "scope": req.scope.value,
        "configured": True,
    }


@router.delete("/users/{user_id}")
def clear_user_scope(
    user_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(require_permission("data:scope:manage")),
):
    """清除用户级覆盖，回落角色级配置。"""
    row = session.exec(
        select(UserDataScope).where(UserDataScope.user_id == user_id)
    ).first()
    if row is None:
        raise HTTPException(status_code=404, detail="该用户无用户级数据范围配置")
    row.deleted_at = datetime.utcnow()
    session.add(row)
    session.commit()
    return {"user_id": str(user_id), "ok": True}
