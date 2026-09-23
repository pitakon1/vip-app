"""ACN 贡献度分佣服务。

分两层：

1. **纯函数层** `compute_split()`：输入「贡献列表 + 佣金总额」，输出分佣明细。
   不碰数据库，可单测；分佣规则改动只在这里改一次。
2. **持久层** `grant_contribution()` / `split_plan_for_property()` /
   `apply_plan_to_split_deals()`：把结果落库。

## 分佣算法（与贝壳口径一致的精神，落到泰国实况）

- 每个「角色 + 主体」是一条贡献，带权重（缺失角色的权重**不丢**，按剩余角色
  归一化摊派，避免因为没请实勘人就少发一份钱）；
- `share_rate` 显式指定时**优先**，脱离权重归一化（用于「这单说好给客源方 50%」
  这类一手谈定的分成）；
- 四舍五入漂移修正到最大的一笔上，保证**分佣总额 = 佣金总额**，一分不差
  （分佣算不平是资金系统最忌讳的事，对账永远对不上）。
"""
import uuid
from datetime import datetime
from typing import Iterable, Optional

from sqlmodel import Session, select

from app.models import (
    DEFAULT_ROLE_WEIGHTS,
    CommissionSplitPlan,
    PropertyContribution,
    SplitDeal,
    actor_key_of,
)


class ACNError(Exception):
    """ACN 领域错误基类。"""


class NoContributionError(ACNError):
    """房源下没有任何有效贡献，无法分佣。"""


class ContributionConflictError(ACNError):
    """贡献主体缺失或冲突。"""


# --------------------------------------------------------------- 纯函数层
def _is_active(c) -> bool:
    """贡献是否有效：未撤销且权重能取到正值（含角色默认权重）。"""
    if getattr(c, "status", "active") != "active":
        return False
    if getattr(c, "revoked_at", None):
        return False
    return _effective_weight(c) > 0


def _effective_weight(c) -> float:
    """有效权重：显式权重优先，否则取角色默认权重。"""
    weight = float(getattr(c, "weight", 0) or 0)
    if weight > 0:
        return weight
    role = getattr(c, "role", None)
    role_value = role.value if hasattr(role, "value") else str(role)
    return float(DEFAULT_ROLE_WEIGHTS.get(role_value, 0.0))


def _entry_of(c, share_rate: float) -> dict:
    role = getattr(c, "role", None)
    return {
        "role": role.value if hasattr(role, "value") else str(role),
        "user_id": str(c.user_id) if getattr(c, "user_id", None) else None,
        "partner_id": str(c.partner_id) if getattr(c, "partner_id", None) else None,
        "actor_key": getattr(c, "actor_key", None),
        "weight": round(_effective_weight(c), 2),
        "share_rate": round(float(share_rate), 4),
        "explicit": bool(getattr(c, "share_rate", None)),
        "amount": 0.0,
    }


def compute_split(
    contributions: Iterable,
    commission_total: float,
    *,
    currency: str = "THB",
) -> dict:
    """计算分佣明细。纯函数，不碰数据库。

    :param contributions: 贡献对象序列（需有 role / weight / share_rate / status /
        user_id / partner_id / actor_key 属性；`PropertyContribution` 直接可传）
    :param commission_total: 佣金总额（> 0）
    :return: {"commission_total", "currency", "entries": [...], "participant_count"}
    :raises NoContributionError: 无有效贡献
    :raises ValueError: 显式分成比例之和 >= 100 且仍有按权重的角色
    """
    total = float(commission_total)
    if total <= 0:
        raise ValueError("佣金总额必须大于 0")

    active = [c for c in contributions if _is_active(c)]
    if not active:
        raise NoContributionError("该房源没有任何有效贡献，无法计算分佣")

    explicit = [c for c in active if getattr(c, "share_rate", None)]
    weighted = [c for c in active if not getattr(c, "share_rate", None)]

    explicit_total = sum(float(c.share_rate) for c in explicit)
    if explicit_total > 100.0001:
        raise ValueError(
            f"显式分成比例之和为 {explicit_total:.2f}%，超过 100%"
        )
    if explicit_total >= 100.0 and weighted:
        raise ValueError(
            f"显式分成比例之和已达 {explicit_total:.2f}%，"
            f"仍有 {len(weighted)} 条贡献只能分到 0%，请调整权重或改成显式比例"
        )

    remaining = 100.0 - explicit_total
    entries = [_entry_of(c, float(c.share_rate)) for c in explicit]

    if weighted:
        total_weight = sum(_effective_weight(c) for c in weighted)
        if total_weight <= 0:
            # 所有有效贡献权重都是 0（异常数据）：平均分，避免除零
            equal = remaining / len(weighted)
            entries.extend(_entry_of(c, equal) for c in weighted)
        else:
            entries.extend(
                _entry_of(c, remaining * _effective_weight(c) / total_weight)
                for c in weighted
            )

    # 金额落地 + 四舍五入漂移修正（保证分佣总额 == 佣金总额）
    amounts = [round(total * e["share_rate"] / 100.0, 2) for e in entries]
    drift = round(total - round(sum(amounts), 2), 2)
    if amounts and drift:
        idx = max(range(len(amounts)), key=lambda i: amounts[i])
        amounts[idx] = round(amounts[idx] + drift, 2)
    for entry, amount in zip(entries, amounts):
        entry["amount"] = amount

    return {
        "commission_total": round(total, 2),
        "currency": currency,
        "entries": entries,
        "participant_count": len(entries),
    }


# --------------------------------------------------------------- 持久层
def grant_contribution(
    session: Session,
    property_id: uuid.UUID,
    role,
    *,
    user_id: Optional[uuid.UUID] = None,
    partner_id: Optional[uuid.UUID] = None,
    listing_id: Optional[uuid.UUID] = None,
    weight: Optional[float] = None,
    share_rate: Optional[float] = None,
    note: Optional[str] = None,
    granted_by: Optional[uuid.UUID] = None,
) -> PropertyContribution:
    """登记/更新一条房源贡献（幂等）。

    同一 (房源, 角色, 主体) 重复登记**不新建行**，而是覆盖权重与备注并复活
    （撤销后再登记视为恢复）——分佣系统里同一主体在同一角色上出现两行，
    会让金额凭空翻倍。
    """
    if not user_id and not partner_id:
        raise ContributionConflictError("必须提供 user_id 或 partner_id 之一")
    if user_id and partner_id:
        raise ContributionConflictError("user_id 与 partner_id 互斥，只能给一个")

    role_value = role.value if hasattr(role, "value") else str(role)
    key = actor_key_of(user_id, partner_id)

    existing = session.exec(
        select(PropertyContribution).where(
            PropertyContribution.property_id == property_id,
            PropertyContribution.role == role,
            PropertyContribution.actor_key == key,
        )
    ).first()

    now = datetime.utcnow()
    if existing:
        existing.weight = float(weight) if weight is not None else existing.weight
        existing.share_rate = share_rate
        existing.note = note if note is not None else existing.note
        if listing_id:
            existing.listing_id = listing_id
        existing.status = "active"
        existing.revoked_at = None
        session.add(existing)
        session.commit()
        session.refresh(existing)
        return existing

    contribution = PropertyContribution(
        property_id=property_id,
        listing_id=listing_id,
        role=role,
        user_id=user_id,
        partner_id=partner_id,
        actor_key=key,
        weight=float(weight) if weight is not None else 0.0,
        share_rate=share_rate,
        status="active",
        granted_at=now,
        note=note,
    )
    session.add(contribution)
    session.commit()
    session.refresh(contribution)
    return contribution


def revoke_contribution(
    session: Session,
    contribution_id: uuid.UUID,
    *,
    at: Optional[datetime] = None,
) -> PropertyContribution:
    """撤销一条贡献（留痕，不删行）。"""
    contribution = session.get(PropertyContribution, contribution_id)
    if not contribution:
        raise ContributionConflictError("贡献记录不存在")
    contribution.status = "revoked"
    contribution.revoked_at = at or datetime.utcnow()
    session.add(contribution)
    session.commit()
    session.refresh(contribution)
    return contribution


def active_contributions(
    session: Session,
    property_id: Optional[uuid.UUID] = None,
    *,
    user_id: Optional[uuid.UUID] = None,
    partner_id: Optional[uuid.UUID] = None,
    role=None,
) -> list[PropertyContribution]:
    """按条件取有效贡献。"""
    query = select(PropertyContribution).where(
        PropertyContribution.status == "active",
        PropertyContribution.deleted_at.is_(None),
    )
    if property_id:
        query = query.where(PropertyContribution.property_id == property_id)
    if user_id:
        query = query.where(PropertyContribution.user_id == user_id)
    if partner_id:
        query = query.where(PropertyContribution.partner_id == partner_id)
    if role is not None:
        query = query.where(PropertyContribution.role == role)
    return list(session.exec(query.order_by(PropertyContribution.granted_at)).all())


def split_plan_for_property(
    session: Session,
    property_id: uuid.UUID,
    commission_total: float,
    *,
    currency: str = "THB",
    deal_id: Optional[uuid.UUID] = None,
    lease_id: Optional[uuid.UUID] = None,
    persist: bool = True,
    note: Optional[str] = None,
) -> CommissionSplitPlan:
    """按房源贡献计算分佣方案并落库。"""
    contributions = active_contributions(session, property_id)
    plan_data = compute_split(contributions, commission_total, currency=currency)

    plan = CommissionSplitPlan(
        property_id=property_id,
        deal_id=deal_id,
        lease_id=lease_id,
        commission_total=plan_data["commission_total"],
        currency=currency,
        entries=plan_data["entries"],
        participant_count=plan_data["participant_count"],
        status="draft",
        computed_at=datetime.utcnow(),
        note=note,
    )
    if persist:
        session.add(plan)
        session.commit()
        session.refresh(plan)
    return plan


def apply_plan_to_split_deals(
    session: Session,
    plan: CommissionSplitPlan,
    *,
    deal_id: uuid.UUID,
) -> list[SplitDeal]:
    """把分佣方案的明细写成 `SplitDeal` 应付款项（幂等）。

    幂等口径：同一 `deal_id` + 同一主体（user/partner）+ 同一角色已存在
    且状态非 paid 的拆分单时，就地更新比例与金额，不重复插入。
    已支付(paid)的拆分单不动——那是财务事实，不允许被重算覆盖。
    """
    from app.models import BrokerPartner  # 局部导入避免循环

    created: list[SplitDeal] = []
    for entry in plan.entries or []:
        user_id = uuid.UUID(entry["user_id"]) if entry.get("user_id") else None
        partner_id = (
            uuid.UUID(entry["partner_id"]) if entry.get("partner_id") else None
        )
        existing = session.exec(
            select(SplitDeal).where(
                SplitDeal.deal_id == deal_id,
                SplitDeal.participant_role == entry["role"],
                SplitDeal.deleted_at.is_(None),
                (
                    SplitDeal.participant_user_id == user_id
                    if user_id
                    else SplitDeal.participant_partner_id == partner_id
                ),
            )
        ).first()
        if existing and existing.status == "paid":
            created.append(existing)
            continue
        if existing:
            existing.split_rate = entry["share_rate"]
            existing.split_amount = entry["amount"]
            existing.commission_total = plan.commission_total
            session.add(existing)
            created.append(existing)
            continue

        # employee_id 仅在有员工档案时填；外部渠道商没有员工档案
        employee_id = None
        if user_id:
            from app.models import Employee

            emp = session.exec(
                select(Employee).where(
                    Employee.user_id == user_id, Employee.deleted_at.is_(None)
                )
            ).first()
            employee_id = emp.id if emp else None

        row = SplitDeal(
            deal_id=deal_id,
            commission_total=plan.commission_total,
            currency=plan.currency,
            participant_role=entry["role"],
            participant_user_id=user_id,
            participant_employee_id=employee_id,
            participant_partner_id=partner_id,
            split_rate=entry["share_rate"],
            split_amount=entry["amount"],
            status="pending",
        )
        session.add(row)
        created.append(row)

    session.commit()
    plan.status = "applied"
    session.add(plan)
    session.commit()
    for row in created:
        session.refresh(row)
    return created


def profile_of(session: Session, property_id: uuid.UUID) -> dict:
    """房源当前的 ACN 角色构成（谁在哪个角色上），供前端展示与运营盘点。"""
    contributions = active_contributions(session, property_id)
    roles: dict[str, list[dict]] = {}
    for c in contributions:
        role_value = c.role.value if hasattr(c.role, "value") else str(c.role)
        roles.setdefault(role_value, []).append(
            {
                "contribution_id": str(c.id),
                "user_id": str(c.user_id) if c.user_id else None,
                "partner_id": str(c.partner_id) if c.partner_id else None,
                "weight": round(_effective_weight(c), 2),
                "share_rate": c.share_rate,
                "granted_at": c.granted_at.isoformat() if c.granted_at else None,
            }
        )
    covered = set(roles.keys())
    return {
        "property_id": str(property_id),
        "roles": roles,
        "covered_roles": sorted(covered),
        "missing_roles": sorted(set(DEFAULT_ROLE_WEIGHTS) - covered),
        "contributor_count": len(contributions),
    }
