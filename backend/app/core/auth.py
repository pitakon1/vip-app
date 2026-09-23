"""FastAPI 认证依赖：从请求头提取 JWT，返回当前用户"""
import uuid
from typing import Optional

from fastapi import Depends, HTTPException, Query, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import false, or_
from sqlmodel import Session, select
from .security import decode_access_token
from ..db import get_session
from ..models.lease import Lease
from ..models.owner import Owner
from ..models.property import Property
from ..models.contract import Contract, ContractParty
from ..models.property_deal import PropertyDeal
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


def _same_id(a, b) -> bool:
    """宽松比较两个 id：缓存里的 dict 经过 JSON 往返后 id 会变成字符串，
    直接与 UUID 比会恒不相等。统一转字符串比较。"""
    if a is None or b is None:
        return False
    return str(a) == str(b)


def property_visibility_conditions(session: Session, user: User) -> list:
    """房源可见性 → 查询条件（数据隔离必须由 token 决定，不能由调用方传参决定）。

    - 管理员：全量（含 `created_by` 为空的历史房源，由管理员指派归属人）；
    - 销售 / 经纪（agent / employee）：仅自己录入的房源（`created_by` 为空的历史
      房源自动被排除）；
    - 业主：仅本人名下房源；
    - 租客：全量。**这是刻意的**：C 端房源详情页与「同小区推荐」走的就是
      `/properties` 系列接口（见 `mobile-app/src/screens/tenant/PropertyDetailScreen.tsx`），
      租客本就是「登录后浏览公开房源」，此处收紧会让 C 端详情页立刻白屏。
      要收紧须先把 C 端切到 `/public` 接口，不在本次范围。
    - 其余角色：不可见。

    返回 `[false()]` 表示「一条都看不到」。与 `lease_visibility_conditions` 同理，
    必须显式置空而不是返回空列表（空列表 = 不加条件 = 全量泄露）。
    """
    if user.role == UserRole.admin:
        return []
    if user.role in (UserRole.agent, UserRole.employee):
        return [Property.created_by == user.id]
    if user.role == UserRole.owner:
        owner_id = owner_id_of(session, user)
        return [Property.owner_id == owner_id] if owner_id else [false()]
    if user.role == UserRole.tenant:
        return []
    return [false()]


def can_view_property(session: Session, user: User, prop) -> bool:
    """单条房源的可见性判定（与 `property_visibility_conditions` 同一口径）。

    `prop` 允许传 ORM 对象或详情缓存里的 dict：`GET /properties/{id}` 会把
    `prop.model_dump()` 的结果缓存起来，用 getattr/dict.get 双取以兼容两者。
    """
    def _field(name):
        if isinstance(prop, dict):
            return prop.get(name)
        return getattr(prop, name, None)

    if user.role == UserRole.admin:
        return True
    if user.role in (UserRole.agent, UserRole.employee):
        return _same_id(_field("created_by"), user.id)
    if user.role == UserRole.owner:
        return _same_id(_field("owner_id"), owner_id_of(session, user))
    if user.role == UserRole.tenant:
        return True
    return False


def contract_visibility_conditions(session: Session, user: User) -> list:
    """合同可见性 → 查询条件（与租约/房源同一口径）。

    - 员工（admin/agent/employee）：全量，内部作业需要跨业主查阅；
    - 业主 / 租客：仅「本人作为签署方」或「挂在本人租约下」的合同；
    - 其余角色：不可见。

    修复背景：合同接口此前只校验「已登录」，任意登录用户都能列全站合同、
    读任意合同全文（正文含双方证件号）。返回 `[false()]` 表示一条都看不到，
    必须显式置空而不是返回空列表（空列表 = 不加条件 = 全量泄露）。
    """
    if user.role in STAFF_ROLES:
        return []
    if user.role not in (UserRole.owner, UserRole.tenant):
        return [false()]

    as_party = select(ContractParty.contract_id).where(ContractParty.user_id == user.id)
    lease_conds = lease_visibility_conditions(session, user)
    conditions = [Contract.id.in_(as_party)]
    if lease_conds:
        conditions.append(Contract.lease_id.in_(select(Lease.id).where(*lease_conds)))
    return [or_(*conditions)]


def can_view_contract(session: Session, user: User, contract: Contract) -> bool:
    """单份合同的可见性判定（与 `contract_visibility_conditions` 同一口径）。"""
    if user.role in STAFF_ROLES:
        return True
    if user.role not in (UserRole.owner, UserRole.tenant):
        return False

    # 1) 本人是签署方
    party = session.exec(
        select(ContractParty).where(
            ContractParty.contract_id == contract.id,
            ContractParty.user_id == user.id,
        )
    ).first()
    if party:
        return True

    # 2) 合同挂在本人租约下
    if contract.lease_id:
        lease = session.get(Lease, contract.lease_id)
        if lease is not None and can_view_lease(session, user, lease):
            return True
    return False


def deal_visibility_conditions(session: Session, user: User) -> list:
    """买卖成交可见性 → 查询条件（与租约/房源/合同同一口径）。

    - 员工（admin/agent/employee）：全量，内部作业需要跨业主查阅；
    - 租客：仅本人作为买方或经办人的成交；
    - 业主：除买方/经办人身份外，再加「本人名下房源的成交」——买卖交易里
      业主就是卖方，是成交的当然当事方；
    - 其余角色：不可见。

    修复背景：`property_deals.py` 的 `get_deal` / `update_deal_status` /
    `create_escrow` / `list_escrows` 此前只校验「已登录」，任意登录用户都能
    推进他人成交状态、读取他人定金金额。返回 `[false()]` 表示一条都看不到，
    必须显式置空而不是返回空列表（空列表 = 不加条件 = 全量泄露）。
    """
    if user.role in STAFF_ROLES:
        return []
    if user.role not in (UserRole.owner, UserRole.tenant):
        return [false()]

    conditions = [
        PropertyDeal.buyer_user_id == user.id,
        PropertyDeal.sales_user_id == user.id,
    ]
    if user.role == UserRole.owner:
        owner_id = owner_id_of(session, user)
        if owner_id:
            conditions.append(
                PropertyDeal.property_id.in_(
                    select(Property.id).where(Property.owner_id == owner_id)
                )
            )
    return [or_(*conditions)]


def can_view_deal(session: Session, user: User, deal) -> bool:
    """单条成交的可见性判定（与 `deal_visibility_conditions` 同一口径）。"""
    if user.role in STAFF_ROLES:
        return True
    if user.role not in (UserRole.owner, UserRole.tenant):
        return False
    if _same_id(getattr(deal, "buyer_user_id", None), user.id):
        return True
    if _same_id(getattr(deal, "sales_user_id", None), user.id):
        return True
    if user.role == UserRole.owner:
        property_id = getattr(deal, "property_id", None)
        if property_id:
            prop = session.get(Property, property_id)
            if prop is not None and _same_id(prop.owner_id, owner_id_of(session, user)):
                return True
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
