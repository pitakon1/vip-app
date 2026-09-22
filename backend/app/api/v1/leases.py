"""租约路由：签约、续约、退房及租约管理。"""

import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from app.db import get_session
from app.core.auth import (
    can_view_lease,
    get_current_user,
    lease_visibility_conditions,
    require_agent,
)
from app.core.concurrency import ensure_version
from app.core.events import publish_event
from app.core.pagination import Page, PaginationParams, paginate_query
from app.models import (
    CommissionSettlement,
    DealType,
    Employee,
    Lease,
    LeaseStatus,
    Owner,
    Payment,
    PaymentStatus,
    PaymentType,
    Property,
    PropertyStatus,
    SettlementStatus,
    Tenant,
    User,
    UserRole,
)
from app.services.pricing import compute_deposit_amount

router = APIRouter(prefix="/leases", tags=["leases"])


def _resolve_agent(
    session: Session, user: User, agent_id: Optional[uuid.UUID]
) -> Optional[uuid.UUID]:
    """确定成交归属员工：优先使用显式 agent_id，否则取当前登录用户的员工档案。"""
    if agent_id:
        return agent_id
    employee = session.exec(
        select(Employee).where(
            Employee.user_id == user.id, Employee.deleted_at.is_(None)
        )
    ).first()
    return employee.id if employee else None


def _create_commission_settlement(
    session: Session, lease: Lease, deal_type: DealType, agent_id: uuid.UUID
) -> None:
    """系统自动核算业绩：按差异化佣金规则解析费率并生成结算记录。

    优先级：员工专属 > 部门 > 分销商 > 全局 > 分销商基础分成 > 默认 1 个月租金。
    """
    from app.services.commission_rates import (
        get_broker_base_rate,
        resolve_commission_rate,
    )

    emp = session.get(Employee, agent_id)
    broker_id = emp.broker_id if emp else None
    broker_base = get_broker_base_rate(session, broker_id)
    rate = resolve_commission_rate(
        session,
        deal_type=deal_type.value,
        employee_id=agent_id,
        department=emp.department if emp else None,
        broker_id=broker_id,
        broker_base_rate=broker_base,
    )
    # rate>1 视为百分比（如 5 = 5%），否则视为月租倍数（兼容旧默认 1.0）
    factor = rate / 100 if rate > 1 else rate
    session.add(
        CommissionSettlement(
            employee_id=agent_id,
            lease_id=lease.id,
            deal_type=deal_type,
            commission_base=lease.monthly_rent,
            commission_rate=rate,
            commission_amount=round(lease.monthly_rent * factor, 2),
            currency=lease.currency,
            status=SettlementStatus.pending,
        )
    )


class LeaseCreate(BaseModel):
    property_id: uuid.UUID
    tenant_id: uuid.UUID
    owner_id: uuid.UUID
    agent_id: Optional[uuid.UUID] = None
    start_date: datetime
    end_date: datetime
    monthly_rent: float
    currency: str = "THB"
    deposit_amount: Optional[float] = (
        None  # 缺省时按押金规则自动核算（对私押2付1/对公押3付1）
    )
    deposit_status: str = "held"
    status: LeaseStatus = LeaseStatus.active
    contract_url: Optional[str] = None
    contract_hash: Optional[str] = None
    special_terms: Optional[str] = None


class LeaseUpdate(BaseModel):
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    monthly_rent: Optional[float] = None
    currency: Optional[str] = None
    deposit_amount: Optional[float] = None
    deposit_status: Optional[str] = None
    status: Optional[LeaseStatus] = None
    contract_url: Optional[str] = None
    contract_hash: Optional[str] = None
    special_terms: Optional[str] = None
    # 可选乐观锁：客户端传回读到的 version，服务端不一致则 409 拒绝覆盖
    version: Optional[int] = None


class LeaseRenew(BaseModel):
    start_date: datetime
    end_date: datetime
    monthly_rent: Optional[float] = None
    special_terms: Optional[str] = None


class DepositSettlement(BaseModel):
    """退租押金结算请求：退房日期 + 损耗/其他扣款明细。"""

    termination_date: datetime
    damage_charges: float = 0.0  # 物业损耗扣款
    other_deductions: list = []  # 其他扣款（[{label, amount}]）
    notes: Optional[str] = None


@router.get("", response_model=Page[Lease])
def list_leases(
    pagination: PaginationParams = Depends(),
    status: Optional[LeaseStatus] = None,
    property_id: Optional[uuid.UUID] = None,
    tenant_id: Optional[uuid.UUID] = None,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """租约列表（分页，可按 status/property_id/tenant_id 筛选）。

    **可见范围由 token 决定**：员工全量、业主仅本人房源、租客仅本人。
    调用方传的 `tenant_id` / `property_id` 只是「可见范围内的进一步筛选」，
    不参与权限判定——此前没有这层收敛，任何登录用户传别人的 tenant_id
    就能读到他人租约（含月租、押金、合同链接）。
    """
    conditions = [Lease.deleted_at.is_(None)]
    conditions.extend(lease_visibility_conditions(session, user))
    if status:
        conditions.append(Lease.status == status)
    if property_id:
        conditions.append(Lease.property_id == property_id)
    if tenant_id:
        conditions.append(Lease.tenant_id == tenant_id)

    stmt = select(Lease).where(*conditions).order_by(Lease.created_at.desc())
    return paginate_query(session, stmt, pagination)


@router.post("")
def create_lease(
    req: LeaseCreate,
    session: Session = Depends(get_session),
    user: User = Depends(require_agent),
):
    """创建租约（签约），发布 lease.signed 事件。"""
    # 系统自动核算：确定成交归属员工并生成佣金结算
    agent_id = _resolve_agent(session, user, req.agent_id)
    data = req.model_dump()
    data["agent_id"] = agent_id

    # 押金规则（E6/E7）：未显式给定时按业主类型自动核算并默认归业主持有
    owner = session.get(Owner, req.owner_id)
    owner_type = owner.owner_type.value if owner else "individual"
    if data.get("deposit_amount") is None:
        data["deposit_amount"] = compute_deposit_amount(req.monthly_rent, owner_type)
    data["deposit_status"] = data.get("deposit_status") or "held"

    lease = Lease(**data)
    session.add(lease)

    # 同步更新房源状态为已出租
    prop = session.get(Property, req.property_id)
    if prop and not prop.deleted_at:
        prop.status = PropertyStatus.rented
        session.add(prop)

    if agent_id:
        _create_commission_settlement(session, lease, DealType.new_rental, agent_id)

    publish_event(
        session,
        "lease.signed",
        "lease",
        lease.id,
        {
            "property_id": str(lease.property_id),
            "tenant_id": str(lease.tenant_id),
            "owner_id": str(lease.owner_id),
            "agent_id": str(agent_id) if agent_id else None,
            "signed_by": str(user.id),
        },
    )
    session.commit()
    session.refresh(lease)
    return lease


@router.get("/me", response_model=List[Lease])
def get_my_leases(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """当前租客的租约列表（通过 user_id 关联 tenant 记录）。"""
    tenant = session.exec(
        select(Tenant).where(Tenant.user_id == user.id, Tenant.deleted_at.is_(None))
    ).first()
    if not tenant:
        return []
    leases = session.exec(
        select(Lease)
        .where(Lease.tenant_id == tenant.id, Lease.deleted_at.is_(None))
        .order_by(Lease.created_at.desc())
    ).all()
    return leases


@router.get("/{lease_id}", response_model=Lease)
def get_lease(
    lease_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """获取租约详情（仅本人/本人房源可见；员工不受限）。

    不可见时返回 404 而非 403：403 会暴露「这条租约确实存在」，
    等于给出可枚举的 id 探测面。
    """
    lease = session.get(Lease, lease_id)
    if not lease or lease.deleted_at or not can_view_lease(session, user, lease):
        raise HTTPException(status_code=404, detail="Lease not found")
    return lease


@router.patch("/{lease_id}")
def update_lease(
    lease_id: uuid.UUID,
    req: LeaseUpdate,
    session: Session = Depends(get_session),
    user: User = Depends(require_agent),
):
    """更新租约信息。"""
    lease = session.get(Lease, lease_id)
    if not lease or lease.deleted_at:
        raise HTTPException(status_code=404, detail="Lease not found")
    update_data = req.model_dump(exclude_unset=True)
    ensure_version(lease, update_data.pop("version", None), "租约")
    for key, value in update_data.items():
        setattr(lease, key, value)
    session.add(lease)
    session.commit()
    session.refresh(lease)
    return lease


def _can_renew(session: Session, user: User, lease: Lease) -> bool:
    """续约权限：admin / agent 可直接续约；owner 物主与租约本人（租客）也可续约。"""
    if user.role in (UserRole.admin, UserRole.agent):
        return True
    if user.role == UserRole.owner:
        owner = session.exec(select(Owner).where(Owner.user_id == user.id)).first()
        return bool(owner and owner.id == lease.owner_id)
    # tenant / employee：仅租约本人可续约
    tenant = session.exec(select(Tenant).where(Tenant.user_id == user.id)).first()
    return bool(tenant and tenant.id == lease.tenant_id)


@router.post("/{lease_id}/renew")
def renew_lease(
    lease_id: uuid.UUID,
    req: LeaseRenew,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """续约，发布 lease.renewed 事件。

    管理员/中介可自定义续约租金并指定条款；租约本人（租客）可在权利范围内续约，
    但沿用原租金（不允许自定月租）。
    """
    old_lease = session.get(Lease, lease_id)
    if not old_lease or old_lease.deleted_at:
        raise HTTPException(status_code=404, detail="Lease not found")
    if not _can_renew(session, user, old_lease):
        raise HTTPException(status_code=403, detail="No permission to renew this lease")

    can_override_rent = user.role in (UserRole.admin, UserRole.agent)
    new_lease = Lease(
        property_id=old_lease.property_id,
        tenant_id=old_lease.tenant_id,
        owner_id=old_lease.owner_id,
        agent_id=old_lease.agent_id,
        start_date=req.start_date,
        end_date=req.end_date,
        monthly_rent=(req.monthly_rent if req.monthly_rent else old_lease.monthly_rent)
        if can_override_rent
        else old_lease.monthly_rent,
        currency=old_lease.currency,
        deposit_amount=old_lease.deposit_amount,
        deposit_status=old_lease.deposit_status,
        status=LeaseStatus.active,
        special_terms=req.special_terms,
        renewed_from_lease_id=old_lease.id,
    )
    old_lease.status = LeaseStatus.expired
    session.add(new_lease)
    session.add(old_lease)

    # 系统自动核算：续约生成 renewal 佣金结算（归属沿用原租约员工）
    if new_lease.agent_id:
        _create_commission_settlement(
            session, new_lease, DealType.renewal, new_lease.agent_id
        )

    publish_event(
        session,
        "lease.renewed",
        "lease",
        new_lease.id,
        {
            "old_lease_id": str(old_lease.id),
            "new_lease_id": str(new_lease.id),
            "property_id": str(new_lease.property_id),
        },
    )
    session.commit()
    session.refresh(new_lease)
    return new_lease


@router.post("/{lease_id}/terminate")
def terminate_lease(
    lease_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(require_agent),
):
    """退房，发布 lease.terminated 事件。"""
    lease = session.get(Lease, lease_id)
    if not lease or lease.deleted_at:
        raise HTTPException(status_code=404, detail="Lease not found")

    lease.status = LeaseStatus.terminated
    session.add(lease)

    # 同步更新房源状态为空置
    prop = session.get(Property, lease.property_id)
    if prop and not prop.deleted_at:
        prop.status = PropertyStatus.vacant
        session.add(prop)

    publish_event(
        session,
        "lease.terminated",
        "lease",
        lease.id,
        {
            "property_id": str(lease.property_id),
            "tenant_id": str(lease.tenant_id),
            "terminated_by": str(user.id),
        },
    )
    session.commit()
    session.refresh(lease)
    return lease


@router.post("/{lease_id}/deposit-settlement")
def deposit_settlement(
    lease_id: uuid.UUID,
    req: DepositSettlement,
    session: Session = Depends(get_session),
    user: User = Depends(require_agent),
):
    """退租押金结算（专职流程）：核算应退押金 / 应补差额，并落库。

    公式：net = 押金 - 到期未付租金 - 损耗扣款 - 其他扣款
    若 net >= 0 为应退给租客的金额；net < 0 表示租客还需补缴。
    """
    lease = session.get(Lease, lease_id)
    if not lease or lease.deleted_at:
        raise HTTPException(status_code=404, detail="Lease not found")

    deposit_held = lease.deposit_amount or 0

    # 到期前应缴而未缴的租金
    outstanding_rent = 0.0
    unpaid_payments = session.exec(
        select(Payment).where(
            Payment.lease_id == lease.id,
            Payment.deleted_at.is_(None),
            Payment.status != PaymentStatus.succeeded,
            Payment.due_date.is_not(None),
            Payment.due_date <= req.termination_date,
        )
    ).all()
    for p in unpaid_payments:
        outstanding_rent += p.amount or 0

    other_total = sum(float(d.get("amount", 0)) for d in req.other_deductions)
    deductions = round(req.damage_charges + other_total, 2)
    net = round(deposit_held + 0 - outstanding_rent - deductions, 2)

    settlement = {
        "lease_id": str(lease.id),
        "property_id": str(lease.property_id),
        "termination_date": req.termination_date.isoformat(),
        "deposit_held": deposit_held,
        "outstanding_rent": round(outstanding_rent, 2),
        "damage_charges": round(req.damage_charges, 2),
        "other_deductions": req.other_deductions,
        "total_deductions": deductions,
        "net_refund": max(net, 0),
        "net_owed_by_tenant": max(-net, 0),
        "disposition": "refund" if net >= 0 else "pay",
        "currency": lease.currency,
        "notes": req.notes,
        "settled_at": datetime.utcnow().isoformat(),
        "settled_by": str(user.id),
    }

    # 落库：押金支出纪录（Refund 属性），并更新租约为已终止、房源空置
    lease.deposit_status = "returned" if net >= 0 else "forfeited"
    lease.status = LeaseStatus.terminated
    session.add(lease)
    if net > 0:
        session.add(
            Payment(
                lease_id=lease.id,
                property_id=lease.property_id,
                payer_id=lease.owner_id,
                amount=net,
                currency=lease.currency,
                payment_type=PaymentType.refund,
                status=PaymentStatus.succeeded,
                channel="bank_transfer",
                idempotency_key=f"deposit-return-{lease.id}",
                description=f"退租押金退还 {lease.property_id}",
                paid_at=datetime.utcnow(),
            )
        )
    prop = session.get(Property, lease.property_id)
    if prop and not prop.deleted_at:
        prop.status = PropertyStatus.vacant
        session.add(prop)

    publish_event(
        session,
        "lease.deposit.settled",
        "lease",
        lease.id,
        {"net": net, "settled_by": str(user.id)},
    )
    session.commit()
    return settlement
