"""租约路由：签约、续约、退房及租约管理。"""

import uuid
from datetime import date as date_type, datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import false, or_
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
from app.core.pagination import Page, PaginationParams, paginate, paginate_query
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
from app.core.security import get_password_hash
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
    # rate 语义统一为百分比：commission_rules.rate / broker.base_rate 均为 0-100
    # （如 5 = 5%），fallback 1.0 也按 1% 处理。此前 `rate>1 视为百分比否则视为
    # 月租倍数` 的歧义会让 rate=1.0（1%）被当成 1 个月租金，佣金放大 100 倍。
    factor = rate / 100.0
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
    # 租客：传已有 tenant_id；或只传姓名/电话，由后端查档/自动建档
    tenant_id: Optional[uuid.UUID] = None
    tenant_name: Optional[str] = None
    tenant_phone: Optional[str] = None
    # 业主：缺省时按房源归属自动带出
    owner_id: Optional[uuid.UUID] = None
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


class LeaseRead(BaseModel):
    """租约返回结构：在租约全量字段基础上补房源 / 租客显示名。

    列表页此前只能拿到 `property_id` / `tenant_id` 两个 UUID，三端都只能把
    裸 UUID 渲染到「房源」「租客」列上。这里在返回结构里补齐可读名称。

    不能直接继承 `Lease`：SQLModel 会把继承来的字段当表字段解析（JSON 字段会
    直接报错），所以按字段显式声明，序列化键与原 `Lease` 保持一一对应。
    """

    id: uuid.UUID
    created_at: datetime
    updated_at: datetime
    deleted_at: Optional[datetime] = None
    metadata_: Optional[dict] = None
    version: int = 1
    property_id: uuid.UUID
    tenant_id: uuid.UUID
    owner_id: uuid.UUID
    agent_id: Optional[uuid.UUID] = None
    start_date: datetime
    end_date: datetime
    monthly_rent: float
    currency: str
    deposit_amount: float
    deposit_status: str
    status: LeaseStatus
    contract_url: Optional[str] = None
    contract_hash: Optional[str] = None
    special_terms: Optional[str] = None
    renewed_from_lease_id: Optional[uuid.UUID] = None
    # 展示用：前端列表 / 详情直接渲染，无需再回表
    property_name: Optional[str] = None
    tenant_name: Optional[str] = None


def _with_display_names(session: Session, leases: List[Lease]) -> List[LeaseRead]:
    """批量补齐房源名与租客名（批量查询，避免逐行 N+1）。"""
    if not leases:
        return []
    prop_ids = {lease.property_id for lease in leases}
    tenant_ids = {lease.tenant_id for lease in leases}
    properties = {
        p.id: p
        for p in session.exec(select(Property).where(Property.id.in_(prop_ids))).all()
    }
    tenants = {
        t.id: t
        for t in session.exec(select(Tenant).where(Tenant.id.in_(tenant_ids))).all()
    }
    users = (
        {
            u.id: u
            for u in session.exec(
                select(User).where(User.id.in_([t.user_id for t in tenants.values()]))
            ).all()
        }
        if tenants
        else {}
    )
    items: List[LeaseRead] = []
    for lease in leases:
        prop = properties.get(lease.property_id)
        tenant = tenants.get(lease.tenant_id)
        tenant_user = users.get(tenant.user_id) if tenant else None
        items.append(
            LeaseRead(
                **lease.model_dump(),
                property_name=(
                    (prop.room_number or prop.address) if prop else None
                ),
                tenant_name=(
                    (tenant_user.full_name or tenant_user.phone)
                    if tenant_user
                    else None
                ),
            )
        )
    return items


def lease_filter_conditions(
    session: Session,
    user: User,
    status: Optional[LeaseStatus] = None,
    property_id: Optional[uuid.UUID] = None,
    tenant_id: Optional[uuid.UUID] = None,
    property_type: Optional[str] = None,
    keyword: Optional[str] = None,
    date_from: Optional[date_type] = None,
    date_to: Optional[date_type] = None,
) -> list:
    """租约筛选条件（列表与导出共用，两处口径必须完全一致）。

    导出报表如果漏掉某个筛选条件，就会出现「页面上筛了，导出的还是全量」
    这类很难发现的静默错误，所以把条件构造收敛到这一处。
    """
    conditions = [Lease.deleted_at.is_(None)]
    # 可见范围只能由 token 决定，不能由调用方传参决定
    conditions.extend(lease_visibility_conditions(session, user))
    if status:
        conditions.append(Lease.status == status)
    if property_id:
        conditions.append(Lease.property_id == property_id)
    if tenant_id:
        conditions.append(Lease.tenant_id == tenant_id)
    if property_type:
        conditions.append(
            Lease.property_id.in_(
                select(Property.id).where(Property.property_type == property_type)
            )
        )
    if keyword and keyword.strip():
        pattern = f"%{keyword.strip()}%"
        prop_hits = session.exec(
            select(Property.id).where(
                or_(
                    Property.room_number.ilike(pattern),
                    Property.address.ilike(pattern),
                    Property.building.ilike(pattern),
                )
            )
        ).all()
        tenant_hits = session.exec(
            select(Tenant.id)
            .join(User, Tenant.user_id == User.id)
            .where(or_(User.full_name.ilike(pattern), User.phone.ilike(pattern)))
        ).all()
        # 两边都没命中时必须显式置空，否则条件被忽略 = 搜索框形同虚设
        hits = []
        if prop_hits:
            hits.append(Lease.property_id.in_(prop_hits))
        if tenant_hits:
            hits.append(Lease.tenant_id.in_(tenant_hits))
        conditions.append(or_(*hits) if hits else false())
    if date_from:
        conditions.append(
            Lease.start_date >= datetime.combine(date_from, datetime.min.time())
        )
    if date_to:
        conditions.append(
            Lease.start_date <= datetime.combine(date_to, datetime.max.time())
        )
    return conditions


@router.get("", response_model=Page[LeaseRead])
def list_leases(
    pagination: PaginationParams = Depends(),
    status: Optional[LeaseStatus] = None,
    property_id: Optional[uuid.UUID] = None,
    tenant_id: Optional[uuid.UUID] = None,
    property_type: Optional[str] = Query(
        None, max_length=50, description="按房源类型筛选：apartment/house/condo/commercial"
    ),
    keyword: Optional[str] = Query(
        None, max_length=100, description="房源房号/地址/楼栋，或租客姓名/手机号"
    ),
    date_from: Optional[date_type] = Query(None, description="合同起始日 ≥ date_from"),
    date_to: Optional[date_type] = Query(None, description="合同起始日 ≤ date_to"),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """租约列表（分页，可按 status/property_id/tenant_id/类型/起始日区间/关键词筛选）。

    **可见范围由 token 决定**：员工全量、业主仅本人房源、租客仅本人。
    调用方传的 `tenant_id` / `property_id` 只是「可见范围内的进一步筛选」，
    不参与权限判定——此前没有这层收敛，任何登录用户传别人的 tenant_id
    就能读到他人租约（含月租、押金、合同链接）。
    """
    conditions = lease_filter_conditions(
        session,
        user,
        status=status,
        property_id=property_id,
        tenant_id=tenant_id,
        property_type=property_type,
        keyword=keyword,
        date_from=date_from,
        date_to=date_to,
    )
    stmt = (
        select(Lease).where(*conditions).order_by(Lease.created_at.desc())
    )
    page = paginate_query(session, stmt, pagination)
    return paginate(_with_display_names(session, page.items), page.total, pagination)


def _resolve_tenant(session: Session, req: LeaseCreate) -> uuid.UUID:
    """解析租客档案 id。

    优先使用显式 `tenant_id`；否则按 `tenant_phone` 查档，查不到就建档
    （含租客登录账号）——经纪人签约的现场租客通常还没注册系统账号，
    此前前端只收集姓名/电话却必传 tenant_id，导致「新建租约」必 422。
    """
    if req.tenant_id:
        tenant = session.get(Tenant, req.tenant_id)
        if tenant is None or tenant.deleted_at is not None:
            raise HTTPException(status_code=404, detail="Tenant not found")
        return tenant.id

    phone = (req.tenant_phone or "").strip()
    if not phone:
        raise HTTPException(
            status_code=400, detail="tenant_id or tenant_phone required"
        )

    existing = session.exec(
        select(Tenant)
        .join(User, User.id == Tenant.user_id)
        .where(User.phone == phone, Tenant.deleted_at.is_(None))
    ).first()
    if existing:
        return existing.id

    account = session.exec(select(User).where(User.phone == phone)).first()
    if account is None:
        account = User(
            email=f"{phone}@tenant.local",
            phone=phone,
            full_name=(req.tenant_name or "").strip() or phone,
            hashed_password=get_password_hash(uuid.uuid4().hex),
            role=UserRole.tenant,
        )
        session.add(account)
        session.flush()
    tenant = Tenant(user_id=account.id)
    session.add(tenant)
    session.flush()
    return tenant.id


@router.post("")
def create_lease(
    req: LeaseCreate,
    session: Session = Depends(get_session),
    user: User = Depends(require_agent),
):
    """创建租约（签约），发布 lease.signed 事件。"""
    prop = session.get(Property, req.property_id)
    if prop is None or prop.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Property not found")

    # 入参防御：租金必须为正、押金不可为负、合同期必须合法
    if req.monthly_rent <= 0:
        raise HTTPException(status_code=400, detail="monthly_rent must be > 0")
    if req.deposit_amount is not None and req.deposit_amount < 0:
        raise HTTPException(status_code=400, detail="deposit_amount must be >= 0")
    if req.end_date <= req.start_date:
        raise HTTPException(
            status_code=400, detail="end_date must be after start_date"
        )

    # 同一房源不能同时存在两本生效租约（active/pending）
    active_lease = session.exec(
        select(Lease).where(
            Lease.property_id == req.property_id,
            Lease.status.in_([LeaseStatus.active, LeaseStatus.pending]),
            Lease.deleted_at.is_(None),
        )
    ).first()
    if active_lease is not None:
        raise HTTPException(
            status_code=409, detail="Property already has an active lease"
        )

    # 业主缺省时按房源归属带出，避免客户端必须自己查 owner_id
    owner_id = req.owner_id or prop.owner_id
    if owner_id is None:
        raise HTTPException(status_code=400, detail="owner_id required")

    # 系统自动核算：确定成交归属员工并生成佣金结算
    agent_id = _resolve_agent(session, user, req.agent_id)
    data = req.model_dump(exclude={"tenant_name", "tenant_phone"})
    data["agent_id"] = agent_id
    data["owner_id"] = owner_id
    data["tenant_id"] = _resolve_tenant(session, req)

    # 押金规则（E6/E7）：未显式给定时按业主类型自动核算并默认归业主持有
    owner = session.get(Owner, owner_id)
    owner_type = owner.owner_type.value if owner else "individual"
    if data.get("deposit_amount") is None:
        data["deposit_amount"] = compute_deposit_amount(req.monthly_rent, owner_type)
    data["deposit_status"] = data.get("deposit_status") or "held"

    lease = Lease(**data)
    session.add(lease)

    # 同步更新房源状态为已出租
    if not prop.deleted_at:
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

    # 入参防御：合同期必须合法；显式传的租金必须为正
    if req.end_date <= req.start_date:
        raise HTTPException(
            status_code=400, detail="end_date must be after start_date"
        )
    if req.monthly_rent is not None and req.monthly_rent <= 0:
        raise HTTPException(status_code=400, detail="monthly_rent must be > 0")

    # 同一房源不能同时存在两本生效租约（排除被续约的旧租约自身，
    # 否则续约必然把自己当成冲突而 409）
    active_lease = session.exec(
        select(Lease).where(
            Lease.property_id == old_lease.property_id,
            Lease.status.in_([LeaseStatus.active, LeaseStatus.pending]),
            Lease.deleted_at.is_(None),
            Lease.id != old_lease.id,
        )
    ).first()
    if active_lease is not None:
        raise HTTPException(
            status_code=409, detail="Property already has an active lease"
        )

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

    # 幂等守卫：押金已结算过的租约不允许重复结算，
    # 否则 idempotency_key=deposit-return-{lease.id} 撞唯一约束 500
    if lease.deposit_status in ("returned", "forfeited"):
        raise HTTPException(
            status_code=409, detail="Deposit already settled for this lease"
        )

    # 扣款不允许为负：负数会把净退款放大（等同反向补贴）
    if req.damage_charges < 0:
        raise HTTPException(status_code=400, detail="damage_charges must be >= 0")
    for d in req.other_deductions:
        if not isinstance(d, dict) or float(d.get("amount", 0)) < 0:
            raise HTTPException(
                status_code=400, detail="other_deductions amounts must be >= 0"
            )

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
        # payer_id 外键指向 users.id，而 lease.owner_id 指向 owners.id：
        # 必须经 Owner.user_id 换算成业主登录账号，否则退租押金在
        # 导出 / /payments/me 里归属错误（此前直接把 owners.id 当用户 id）
        owner = session.get(Owner, lease.owner_id)
        if owner is None:
            raise HTTPException(
                status_code=400, detail="Owner record missing for deposit refund"
            )
        session.add(
            Payment(
                lease_id=lease.id,
                property_id=lease.property_id,
                payer_id=owner.user_id,
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
