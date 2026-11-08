"""收付款的合作公司（Partner）归属推导与行级可见性。

业务前提：多个合作公司（partner）共用同一套数据库与后台。因此支付单必须带
`Payment.partner_id`，才能把「A 公司的收款单」挡在 B 公司账号之外。

本模块是**唯一口径**：新建支付单时的归属推导、历史数据回填、列表过滤与详情/收据/
发票/凭证鉴权全部调用这里，避免出现「列表看得见、点开收据 403」。

留空策略（重要）：无法推导归属的历史数据保持 `partner_id = NULL`，**不做直接拒绝**，
而是按「管理员 / 平台员工可见 + 该单 payer/payee 本人可见」兜底，避免收窄权限后
存量账单整体不可读。

可见性矩阵：
- admin         → 全量；
- agent/employee 有 partner_id → 仅本 partner 的单 + 本人 payer/payee 命中；
- agent/employee 无 partner_id（平台自建员工）→ 沿用历史全量（平台内部运营需要）；
- partner_admin → 仅本 partner 的单 + 本人 payer/payee 命中；
- owner/tenant  → 仅 payer/payee 命中（本人账单不受收窄影响）；
- 其余角色      → 不可见。
"""
from __future__ import annotations

import uuid
from typing import Optional

from sqlalchemy import false
from sqlmodel import Session

from app.models import Employee, Lease, Owner, Payment, Property, User, UserRole


def _partner_of_user(
    session: Session, user_id: Optional[uuid.UUID]
) -> Optional[uuid.UUID]:
    """用户账号归属的合作公司 id（不存在/未挂公司返回 None）。"""
    if not user_id:
        return None
    user = session.get(User, user_id)
    if user is None or user.deleted_at:
        return None
    return user.partner_id


def _partner_of_owner(
    session: Session, owner_id: Optional[uuid.UUID]
) -> Optional[uuid.UUID]:
    """业主档案 id → 业主登录账号 → 合作公司 id。"""
    if not owner_id:
        return None
    owner = session.get(Owner, owner_id)
    if owner is None or owner.deleted_at:
        return None
    return _partner_of_user(session, owner.user_id)


def _partner_of_lease_agent(
    session: Session, lease_id: Optional[uuid.UUID]
) -> Optional[uuid.UUID]:
    """租约经办人 employee id → 员工账号 → 合作公司 id。"""
    if not lease_id:
        return None
    lease = session.get(Lease, lease_id)
    if lease is None or lease.deleted_at or not lease.agent_id:
        return None
    employee = session.get(Employee, lease.agent_id)
    if employee is None or employee.deleted_at:
        return None
    return _partner_of_user(session, employee.user_id)


def resolve_payment_partner(
    session: Session,
    *,
    payer_id: Optional[uuid.UUID] = None,
    payee_id: Optional[uuid.UUID] = None,
    lease_id: Optional[uuid.UUID] = None,
    property_id: Optional[uuid.UUID] = None,
) -> Optional[uuid.UUID]:
    """按固定优先级推导支付单归属的合作公司，先命中者为准。

    优先级（从强到弱，推导规则写死在这里，改口径只需改这一处）：
      1. 租约经办 agent：租约类收付款由经办公司负责，是最强的业务归属信号；
      2. 租约业主：经办人为平台员工（无 partner_id）时退到业主所属公司；
      3. 收款方 payee：非租约单（如合作公司员工代收）按资金收款方归属；
      4. 付款方 payer：同上，按付款方归属；
      5. 房源业主：仅有 property_id 的杂项单按房源业主归属；
      6. 房源录入人 created_by：最后退到录入该房源的员工所属公司。

    全部无法判定时返回 `None`（平台自营 / 历史脏数据）。调用方**不得**因此拒绝
    读写，须走「NULL 兜底」可见性规则。
    """
    if lease_id:
        partner = _partner_of_lease_agent(session, lease_id)
        if partner:
            return partner
        lease = session.get(Lease, lease_id)
        if lease is not None and not lease.deleted_at:
            partner = _partner_of_owner(session, lease.owner_id)
            if partner:
                return partner

    partner = _partner_of_user(session, payee_id)
    if partner:
        return partner
    partner = _partner_of_user(session, payer_id)
    if partner:
        return partner

    if property_id:
        prop = session.get(Property, property_id)
        if prop is not None and not prop.deleted_at:
            partner = _partner_of_owner(session, prop.owner_id)
            if partner:
                return partner
            partner = _partner_of_user(session, prop.created_by)
            if partner:
                return partner

    return None


def payment_visibility_conditions(session: Session, user: User) -> list:
    """当前用户可见的支付单 → SQLModel 查询条件（列表与汇总共用）。

    返回 `[]` 表示不加条件（全量可见）；返回 `[false()]` 表示一条都看不到。
    **注意不能返回空列表表示「无权限」**，空列表等于全量泄露。
    """
    if user.role == UserRole.admin:
        return []

    # payer / payee 命中始终可见：租客、业主的本人账单不受 partner 收窄影响，
    # 也让 partner_id 为空的历史单对「当事人」保持可读。
    related = (Payment.payer_id == user.id) | (Payment.payee_id == user.id)

    if user.role in (UserRole.agent, UserRole.employee):
        if user.partner_id is None:
            # 平台自建员工（未挂合作公司）：沿用历史全量，平台内部运营需要
            return []
        return [(Payment.partner_id == user.partner_id) | related]

    if user.role == UserRole.partner_admin:
        if user.partner_id is None:
            # 合作公司管理员未挂公司属于配置错误：安全回落为仅本人相关
            return [related]
        return [(Payment.partner_id == user.partner_id) | related]

    if user.role in (UserRole.owner, UserRole.tenant):
        return [related]

    return [false()]


def can_view_payment(user: User, payment: Payment) -> bool:
    """单条支付单的可见性判定（与 `payment_visibility_conditions` 同一口径）。"""
    if user.role == UserRole.admin:
        return True
    if payment.payer_id == user.id or payment.payee_id == user.id:
        return True
    if user.role in (UserRole.agent, UserRole.employee):
        # 平台自建员工保持历史全量
        if user.partner_id is None:
            return True
        return _same_id(payment.partner_id, user.partner_id)
    if user.role == UserRole.partner_admin:
        return bool(user.partner_id) and _same_id(payment.partner_id, user.partner_id)
    return False


def _same_id(a, b) -> bool:
    """宽松比较 id（兼容 UUID 与字符串两种来源）。"""
    if a is None or b is None:
        return False
    return str(a) == str(b)


__all__ = [
    "resolve_payment_partner",
    "payment_visibility_conditions",
    "can_view_payment",
]
