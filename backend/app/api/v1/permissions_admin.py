"""角色权限配置 API（管理员配置角色 - 权限点）。权限点：role:manage"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from app.db import get_session
from app.core.rbac import (
    PERMISSION_DEFS,
    invalidate_role_permissions,
    require_permission,
)
from app.models import Permission, RolePermission, User, UserRole

router = APIRouter(prefix="/admin/permissions", tags=["admin-permissions"])

# 权限点由应用启动时的 seed_permissions 幂等补种（见 app.main lifespan）。
# 此前这三个只读端点也在请求内调用 seed_permissions：每次请求约 45 次 SELECT + COMMIT，
# 且把写操作混进了 GET，因此改为依赖启动种子 + 权限变更后失效缓存。


@router.get("")
def list_permissions(
    session: Session = Depends(get_session),
    user: User = Depends(require_permission("role:manage")),
):
    """权限点分组列表 + 每个角色的当前分配。"""
    perms = session.exec(select(Permission).order_by(Permission.code)).all()
    grouped: dict[str, list[dict]] = {}
    for p in perms:
        grouped.setdefault(p.category, []).append(
            {"code": p.code, "name": p.name, "description": p.description}
        )
    role_assign: dict[str, list[str]] = {}
    rows = session.exec(select(RolePermission)).all()
    for rp in rows:
        role_assign.setdefault(rp.role.value, []).append(rp.permission_code)
    return {
        "categories": grouped,
        "roles": {r.value: sorted(set(role_assign.get(r.value, []))) for r in UserRole},
        "meta": {
            cat: [(c, n) for (c, n, _) in items]
            for cat, items in PERMISSION_DEFS.items()
        },
    }


@router.get("/roles/{role}")
def get_role_permissions(
    role: UserRole,
    session: Session = Depends(get_session),
    user: User = Depends(require_permission("role:manage")),
):
    """获取指定角色当前权限点。"""
    rows = session.exec(
        select(RolePermission).where(RolePermission.role == role)
    ).all()
    return {
        "role": role.value,
        "permissions": sorted({rp.permission_code for rp in rows}),
    }


class RolePermsUpdate(BaseModel):
    codes: list[str]


@router.put("/roles/{role}")
def set_role_permissions(
    role: UserRole,
    req: RolePermsUpdate,
    session: Session = Depends(get_session),
    user: User = Depends(require_permission("role:manage")),
):
    """覆盖设置角色权限点（先清后设）。"""
    valid = {
        p.code
        for p in session.exec(select(Permission)).all()
    }
    unknown = [c for c in req.codes if c not in valid]
    if unknown:
        raise HTTPException(status_code=400, detail=f"Unknown codes: {unknown}")

    for rp in session.exec(select(RolePermission).where(RolePermission.role == role)).all():
        session.delete(rp)
    session.flush()
    for code in dict.fromkeys(req.codes):  # 去重保序
        session.add(RolePermission(role=role, permission_code=code))
    session.commit()
    # 立即失效该角色的权限缓存，避免最长 30s 的旧权限继续放行
    invalidate_role_permissions(role)
    return {"role": role.value, "permissions": sorted(set(req.codes))}