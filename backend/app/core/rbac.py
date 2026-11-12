"""角色权限体系核心：权限点注册、种子初始化与细粒度鉴权依赖。

设计约定：
- 管理员可通过"角色权限配置"调整任意角色（含 admin）的权限点集合；
  新增权限点由本模块统一注册，`seed_permissions` 幂等补种。
- `require_permission(*codes)` 为"任一命中即放行"（OR 语义），
  适合管理端点按单权限点鉴权；如需 AND 语义可叠加多个依赖。
"""
from typing import Iterable, Optional, Set

from fastapi import Depends, HTTPException, status
from sqlmodel import Session, select

from .auth import get_current_user
from .cache import delete_cache_pattern, get_cache, set_cache
from ..db import get_session
from ..models.rbac import Permission, RolePermission
from ..models.user import User, UserRole

# 角色权限集合的缓存 TTL（秒）。
# 权限查询在每次受保护请求上都会执行（require_permission），而权限配置极少变动，
# 因此按角色缓存；管理员改权限时立即失效（见 invalidate_role_permissions）。
PERMISSION_CACHE_TTL = 30
_PERMISSION_CACHE_PREFIX = "rbac:role_perms:"

# ---------------------------------------------------------------------------
# 权限点注册表（category -> list[(code, name, description)]）
# ---------------------------------------------------------------------------
PERMISSION_DEFS: dict[str, list[tuple[str, str, str]]] = {
    "system": [
        ("system:settings", "系统设置", "管理系统基础配置"),
        ("system:audit", "审计日志查看", "查看操作审计日志"),
    ],
    "account": [
        ("account:list", "账号查看", "查看全部账号"),
        ("account:create", "账号创建", "后台开通新账号"),
        ("account:update", "账号编辑", "修改账号角色/资料"),
        ("account:deactivate", "账号启停", "启用/停用账号"),
        ("account:reset_password", "重置密码", "重置指定账号密码"),
    ],
    "group": [
        ("group:manage", "分组管理", "用户分组的增删改与成员维护"),
    ],
    "department": [
        ("department:manage", "部门管理", "维护组织架构部门树与员工归属"),
    ],
    "role": [
        ("role:manage", "角色权限配置", "配置角色对应的权限点"),
    ],
    "review": [
        ("review:trip", "外勤申请审批", "审批通过/驳回外勤申请"),
        ("review:leave", "请假审批", "审批通过/驳回员工请假申请"),
        ("review:maintenance", "报修工单审核", "受理/分派/完结报修工单"),
        ("review:service", "服务订单审核", "受理/流转增值服务订单"),
        ("review:contract", "合同审批", "合同签约/审阅流转"),
    ],
    # 合同审批分层权限：L1 主管、L2 财务/总监。
    # 两级默认不授予同一角色，避免同一账号连续批完两级导致分级失效；
    # 如业务确需同账号连批两级，必须由管理员在「角色权限配置」里显式同时勾选
    # 两项（不推荐，等于取消分级）。
    "contract": [
        ("contract.approve.l1", "合同审批 L1（主管）", "审批合同第 1 级（主管）"),
        ("contract.approve.l2", "合同审批 L2（财务/总监）", "审批合同第 2 级（财务/总监）"),
    ],
    "data": [
        ("data:view", "经营数据查看", "查看经营概览与报表"),
        ("data:scope:manage", "数据范围配置", "配置角色/用户的行级数据可见范围"),
    ],
    "option": [
        ("option:manage", "数据字典管理", "维护通用数据字典"),
    ],
    "commission": [
        ("commission:manage", "佣金规则配置", "配置佣金比例规则"),
    ],
    "partner": [
        ("partner:manage", "合作公司管理", "平台创建/编辑/启停合作公司并指定管理员"),
        ("partner:member:manage", "本司成员管理", "合作公司管理员维护本公司员工/拉入经纪人"),
        ("attendance:partner:view", "本公司考勤查看", "合作公司管理员查看本公司员工考勤"),
    ],
}

FLAT_PERMISSIONS: list[tuple[str, str, str]] = [
    (code, name, desc)
    for _items in PERMISSION_DEFS.values()
    for (code, name, desc) in _items
]


def permission_codes() -> list[str]:
    """全部权限点 code。"""
    return [c for (c, _, _) in FLAT_PERMISSIONS]


CONTRACT_APPROVE_L1 = "contract.approve.l1"
CONTRACT_APPROVE_L2 = "contract.approve.l2"

# 角色默认权限分配（首次初始化；管理员可在配置页调整后覆盖）
# 合同审批 L1 默认给员工（一线主管），L2 默认给管理员（财务/总监）；
# admin 默认**不含** L1，保证默认情况下没有任何单一账号能连批两级。
DEFAULT_ROLE_PERMISSIONS: dict[UserRole, list[str]] = {
    UserRole.admin: [c for c in permission_codes() if c != CONTRACT_APPROVE_L1],
    UserRole.agent: [
        "data:view",
        "review:maintenance",
        "review:service",
        "review:contract",
        "commission:manage",
    ],
    UserRole.employee: ["data:view", CONTRACT_APPROVE_L1],
    UserRole.owner: [],
    UserRole.tenant: [],
    UserRole.partner_admin: [
        "partner:member:manage",
        "data:view",
        "attendance:partner:view",
    ],
}


def seed_permissions(session: Session) -> None:
    """幂等补种权限点与角色默认分配（不覆盖已有配置）。"""
    for code, name, desc in FLAT_PERMISSIONS:
        existing = session.exec(
            select(Permission).where(Permission.code == code)
        ).first()
        if not existing:
            session.add(Permission(code=code, name=name, category=_category_of(code), description=desc))
    session.flush()

    for role, codes in DEFAULT_ROLE_PERMISSIONS.items():
        for code in codes:
            existing = session.exec(
                select(RolePermission).where(
                    RolePermission.role == role,
                    RolePermission.permission_code == code,
                )
            ).first()
            if not existing:
                session.add(RolePermission(role=role, permission_code=code))
    session.commit()


def _category_of(code: str) -> str:
    for cat, items in PERMISSION_DEFS.items():
        if any(c == code for (c, _, _) in items):
            return cat
    return "system"


def get_user_permissions(session: Session, user: User) -> Set[str]:
    """查询用户当前角色拥有的全部权限点 code（按角色缓存，TTL 30s）。"""
    key = f"{_PERMISSION_CACHE_PREFIX}{user.role.value}"
    cached = get_cache(key)
    if isinstance(cached, list):
        return set(cached)

    rows = session.exec(
        select(RolePermission).where(RolePermission.role == user.role)
    ).all()
    permissions = {rp.permission_code for rp in rows}
    set_cache(key, sorted(permissions), PERMISSION_CACHE_TTL)
    return permissions


def invalidate_role_permissions(role: Optional[UserRole] = None) -> None:
    """角色权限变更后失效缓存（不传 role 则清空全部角色）。"""
    if role is None:
        delete_cache_pattern(f"{_PERMISSION_CACHE_PREFIX}*")
    else:
        delete_cache_pattern(f"{_PERMISSION_CACHE_PREFIX}{role.value}")


def require_permission(*codes: str):
    """细粒度权限依赖工厂（OR 语义：拥有任一权限点即放行）。"""

    def checker(
        current_user: User = Depends(get_current_user),
        session: Session = Depends(get_session),
    ) -> User:
        permissions = get_user_permissions(session, current_user)
        if not codes or not (permissions & set(codes)):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required permissions: {list(codes)}",
            )
        return current_user

    return checker


def ensure_permissions(permissions: Set[str], required: Iterable[str]) -> None:
    """校验用户权限集合是否命中任一 required（供 API 内部复用）。"""
    if not (permissions & set(required)):
        raise HTTPException(status_code=403, detail="Permission denied")