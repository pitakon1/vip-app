"""合作公司管理员 API（本公司成员 / 绩效 / 房源聚合）。

权限点：partner:member:manage。
合作公司管理员(role=partner_admin)维护本公司成员：创建账号、把已注册经纪人
拉入本公司、移除成员；并查看本公司经纪人的绩效与房源。

作用域隔离：所有写入目标一律强制覆盖 `partner_id = current_user.partner_id`，
严禁跨公司操作。
"""
import uuid
from datetime import date as date_type, datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, EmailStr
from sqlmodel import Session, select

from app.db import get_session
from app.core.auth import serialize_user
from app.core.rbac import require_permission
from app.core.security import get_password_hash
from app.models import (
    CommissionSettlement,
    Employee,
    Property,
    User,
    UserRole,
    UserType,
    Partner,
    PartnerAuditLog,
)

from .performance import _build_summary, _month_series

router = APIRouter(prefix="/partner", tags=["partner-members"])


class MemberCreate(BaseModel):
    email: EmailStr
    full_name: str
    password: str = "123456"
    phone: Optional[str] = None
    position: Optional[str] = None


class MemberOut(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str
    email: Optional[str] = None
    full_name: Optional[str] = None
    role: Optional[str] = None
    user_type: Optional[str] = None
    partner_id: Optional[str] = None
    phone: Optional[str] = None
    is_active: Optional[bool] = None
    position: Optional[str] = None


def _partner_guard(current: User) -> None:
    """强制校验当前用户为合作公司管理员且已绑定某公司。"""
    if current.role != UserRole.partner_admin:
        raise HTTPException(
            status_code=403,
            detail="Only partner admin can manage company members",
        )
    if not current.partner_id:
        raise HTTPException(
            status_code=403, detail="Account is not bound to any partner company"
        )


def _ensure_partner_active(session: Session, partner_id: uuid.UUID) -> Partner:
    p = session.get(Partner, partner_id)
    if not p or p.deleted_at or not p.is_active:
        raise HTTPException(status_code=400, detail="Partner company is not active")
    return p


def _company_user_ids(session: Session, partner_id: uuid.UUID) -> list[uuid.UUID]:
    return session.exec(
        select(User.id).where(User.partner_id == partner_id, User.deleted_at.is_(None))
    ).all()


def _serialize_member(u: User, emp: Optional[Employee]) -> dict:
    data = serialize_user(u)
    data.update(
        id=str(u.id),
        # 排班/线索/带看分配接口按 Employee.id 校验，单独返回员工档案 id，
        # 避免前端把 User.id 当 employee_id 传导致 400/404。
        employee_id=str(emp.id) if emp else None,
        role=u.role.value,
        user_type=u.user_type.value if u.user_type else None,
        partner_id=str(u.partner_id) if u.partner_id else None,
        is_active=u.is_active,
        position=emp.position if emp else None,
    )
    return data


@router.get("/members", response_model=List[MemberOut])
def list_members(
    session: Session = Depends(get_session),
    current: User = Depends(require_permission("partner:member:manage")),
):
    """本公司成员列表。"""
    _partner_guard(current)
    users = session.exec(
        select(User)
        .where(
            User.partner_id == current.partner_id,
            User.deleted_at.is_(None),
        )
        .order_by(User.created_at.desc())
    ).all()
    user_ids = [u.id for u in users]
    emp_map = {
        e.user_id: e
        for e in session.exec(
            select(Employee).where(
                Employee.user_id.in_(user_ids), Employee.deleted_at.is_(None)
            )
        ).all()
    } if user_ids else {}
    p = session.get(Partner, current.partner_id)
    partner_name = p.name if p else None
    rows = [_serialize_member(u, emp_map.get(u.id)) for u in users]
    for r in rows:
        r["partner_name"] = partner_name
    return rows


@router.post("/members", status_code=201, response_model=MemberOut)
def create_member(
    req: MemberCreate,
    session: Session = Depends(get_session),
    current: User = Depends(require_permission("partner:member:manage")),
):
    """创建本公司账号（role=agent, user_type=partner, 归属本公司）。"""
    _partner_guard(current)
    partner = _ensure_partner_active(session, current.partner_id)
    existing = session.exec(select(User).where(User.email == req.email)).first()
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")
    if not req.password or len(req.password) < 6:
        raise HTTPException(status_code=400, detail="Password too short (min 6)")

    new_user = User(
        email=req.email,
        phone=req.phone,
        full_name=req.full_name,
        hashed_password=get_password_hash(req.password),
        role=UserRole.agent,
        user_type=UserType.partner,
        partner_id=current.partner_id,
        is_active=True,
        is_verified=True,
    )
    if partner.seat_limit:
        current_count = len(_company_user_ids(session, current.partner_id))
        if current_count >= partner.seat_limit:
            raise HTTPException(
                status_code=400,
                detail=f"Seat limit reached ({partner.seat_limit}), contact platform",
            )

    session.add(new_user)
    session.flush()
    emp = Employee(
        user_id=new_user.id,
        employee_code=f"E{uuid.uuid4().hex[:8].upper()}",
        # 部门写公司名，而不是管理员姓名（修复历史缺陷）
        department=partner.name,
        position=req.position,
        hire_date=date_type.today(),
        is_active=True,
    )
    session.add(emp)
    session.commit()
    session.refresh(new_user)
    session.refresh(emp)
    return _serialize_member(new_user, emp)


@router.post("/members/{user_id}/pull-in", response_model=MemberOut)
def pull_in_member(
    user_id: uuid.UUID,
    session: Session = Depends(get_session),
    current: User = Depends(require_permission("partner:member:manage")),
):
    """把已注册经纪人账号拉入本公司。

    前置：目标为 agent 且未归属任何公司；禁止拉入 admin / partner_admin / owner / tenant。
    """
    _partner_guard(current)
    _ensure_partner_active(session, current.partner_id)
    target = session.get(User, user_id)
    if not target or target.deleted_at:
        raise HTTPException(status_code=404, detail="User not found")
    if target.role != UserRole.agent:
        raise HTTPException(
            status_code=400,
            detail="Only agent accounts can be pulled into a partner company",
        )
    if target.partner_id is not None:
        raise HTTPException(
            status_code=409, detail="User already belongs to a partner company"
        )

    partner = _ensure_partner_active(session, current.partner_id)
    if partner.seat_limit:
        current_count = len(_company_user_ids(session, current.partner_id))
        if current_count >= partner.seat_limit:
            raise HTTPException(
                status_code=400,
                detail=f"Seat limit reached ({partner.seat_limit}), contact platform",
            )

    target.user_type = UserType.partner
    target.partner_id = current.partner_id
    session.add(target)
    session.commit()
    session.refresh(target)
    emp = session.exec(
        select(Employee).where(
            Employee.user_id == target.id, Employee.deleted_at.is_(None)
        )
    ).first()
    return _serialize_member(target, emp)


@router.delete("/members/{user_id}")
def remove_member(
    user_id: uuid.UUID,
    session: Session = Depends(get_session),
    current: User = Depends(require_permission("partner:member:manage")),
):
    """从本公司移除成员（清空归属；若为管理员需先降级）。"""
    _partner_guard(current)
    target = session.get(User, user_id)
    if not target or target.deleted_at:
        raise HTTPException(status_code=404, detail="User not found")
    if target.partner_id != current.partner_id:
        raise HTTPException(
            status_code=403, detail="User does not belong to this partner company"
        )
    if target.id == current.id:
        raise HTTPException(status_code=400, detail="Cannot remove yourself")
    # 若目标是公司管理员，先降回 agent，再置空其 admin 位
    if target.role == UserRole.partner_admin:
        p = session.get(Partner, current.partner_id)
        if p and str(p.admin_user_id) == str(target.id):
            p.admin_user_id = None
            session.add(p)
        target.role = UserRole.agent
    target.user_type = UserType.platform
    target.partner_id = None
    session.add(target)
    session.commit()
    return {"id": str(target.id), "ok": True}


class MemberUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    position: Optional[str] = None


class PasswordReset(BaseModel):
    password: Optional[str] = None


def _target_member(session: Session, current: User, user_id: uuid.UUID) -> User:
    target = session.get(User, user_id)
    if not target or target.deleted_at or target.partner_id != current.partner_id:
        raise HTTPException(status_code=404, detail="Member not found")
    return target


def _audit_member(
    session: Session, current: User, action: str, target: User, **detail
) -> None:
    session.add(
        PartnerAuditLog(
            partner_id=current.partner_id,
            actor_user_id=current.id,
            action=action,
            resource_type="user",
            resource_id=str(target.id),
            detail=detail,
        )
    )


@router.patch("/members/{user_id}", response_model=MemberOut)
def update_member(
    user_id: uuid.UUID,
    req: MemberUpdate,
    session: Session = Depends(get_session),
    current: User = Depends(require_permission("partner:member:update")),
):
    """编辑本公司成员资料（姓名 / 手机 / 职位），跨公司 404。"""
    _partner_guard(current)
    _ensure_partner_active(session, current.partner_id)
    target = _target_member(session, current, user_id)
    if req.full_name is not None:
        if not req.full_name.strip():
            raise HTTPException(status_code=400, detail="full_name cannot be empty")
        target.full_name = req.full_name.strip()
    if req.phone is not None:
        target.phone = req.phone or None
    emp = session.exec(
        select(Employee).where(
            Employee.user_id == target.id, Employee.deleted_at.is_(None)
        )
    ).first()
    if req.position is not None:
        if not emp:
            emp = Employee(
                user_id=target.id,
                employee_code=f"E{uuid.uuid4().hex[:8].upper()}",
                department=None,
                hire_date=date_type.today(),
                is_active=True,
            )
        emp.position = req.position or None
        session.add(emp)
    session.add(target)
    _audit_member(session, current, "member.update", target)
    session.commit()
    session.refresh(target)
    return _serialize_member(target, emp)


@router.post("/members/{user_id}/deactivate")
def deactivate_member(
    user_id: uuid.UUID,
    session: Session = Depends(get_session),
    current: User = Depends(require_permission("partner:member:update")),
):
    """停用成员：立即禁止登录（token 校验会拒绝），且不能再接新线索。"""
    _partner_guard(current)
    target = _target_member(session, current, user_id)
    if target.id == current.id:
        raise HTTPException(status_code=400, detail="Cannot deactivate yourself")
    target.is_active = False
    session.add(target)
    _audit_member(session, current, "member.deactivate", target)
    session.commit()
    return {"id": str(target.id), "is_active": False}


@router.post("/members/{user_id}/activate")
def activate_member(
    user_id: uuid.UUID,
    session: Session = Depends(get_session),
    current: User = Depends(require_permission("partner:member:update")),
):
    _partner_guard(current)
    _ensure_partner_active(session, current.partner_id)
    target = _target_member(session, current, user_id)
    target.is_active = True
    session.add(target)
    _audit_member(session, current, "member.activate", target)
    session.commit()
    return {"id": str(target.id), "is_active": True}


@router.post("/members/{user_id}/reset-password")
def reset_member_password(
    user_id: uuid.UUID,
    req: PasswordReset,
    session: Session = Depends(get_session),
    current: User = Depends(require_permission("partner:member:reset_password")),
):
    """重置成员密码；未指定时生成临时密码并返回一次。"""
    import secrets
    import string

    _partner_guard(current)
    target = _target_member(session, current, user_id)
    if req.password:
        if len(req.password) < 6:
            raise HTTPException(status_code=400, detail="Password too short (min 6)")
        pwd = req.password
    else:
        alphabet = string.ascii_letters + string.digits
        pwd = "".join(secrets.choice(alphabet) for _ in range(10))
    target.hashed_password = get_password_hash(pwd)
    session.add(target)
    _audit_member(session, current, "member.reset_password", target)
    session.commit()
    return {"id": str(target.id), "password": pwd}


@router.get("/performance")
def company_performance(
    session: Session = Depends(get_session),
    current: User = Depends(require_permission("partner:member:manage")),
):
    """本公司业绩聚合：汇总 + 月度序列 + 各经纪人明细。

    Grouped by `CommissionSettlement.partner_id`（分佣结算中 partner_company 角色
    归属本公司），而非通过员工反查，保证合作公司的整体业绩口径一致。
    """
    _partner_guard(current)
    user_ids = _company_user_ids(session, current.partner_id)
    emp_rows = (
        session.exec(
            select(Employee).where(
                Employee.user_id.in_(user_ids), Employee.deleted_at.is_(None)
            )
        ).all()
        if user_ids
        else []
    )
    # 直接以 partner_id 判定（修复：公司有结算单但暂无成员时返回空列表的缺陷）
    settlements = session.exec(
        select(CommissionSettlement).where(
            CommissionSettlement.partner_id == current.partner_id,
            CommissionSettlement.deleted_at.is_(None),
        )
    ).all()
    now = datetime.utcnow()

    # 各经纪人明细（按结算的员工归属拆，便于查看各经纪人贡献）
    user_id_by_emp = {e.id: e.user_id for e in emp_rows}
    emp_names = {
        u.id: u.full_name
        for u in session.exec(
            select(User).where(User.id.in_(user_ids))
        ).all()
    } if user_ids else {}
    by_agent: dict = {}
    for s in settlements:
        if s.employee_id is None:
            continue
        uid = user_id_by_emp.get(s.employee_id)
        key = str(uid or s.employee_id)
        if key not in by_agent:
            by_agent[key] = {
                "user_id": str(uid) if uid else None,
                "employee_name": emp_names.get(uid) if uid else None,
                "total_commission": 0.0,
                "total_revenue": 0.0,
                "deals": 0,
            }
        by_agent[key]["total_commission"] += s.commission_amount or 0
        by_agent[key]["total_revenue"] += s.commission_base or 0
        by_agent[key]["deals"] += 1

    return {
        "partner_id": str(current.partner_id),
        "summary": _build_summary(settlements, now),
        "monthly": _month_series(settlements, 12),
        "agents": sorted(
            by_agent.values(),
            key=lambda x: x["total_commission"],
            reverse=True,
        ),
    }


@router.get("/properties")
def company_properties(
    session: Session = Depends(get_session),
    current: User = Depends(require_permission("partner:member:manage")),
):
    """本公司经纪人的房源列表（含房源基础信息）。"""
    _partner_guard(current)
    user_ids = _company_user_ids(session, current.partner_id)
    rows = (
        session.exec(
            select(Property).where(
                Property.created_by.in_(user_ids),
                Property.deleted_at.is_(None),
            ).order_by(Property.created_at.desc())
        ).all()
        if user_ids
        else []
    )
    return [
        {
            "id": str(p.id),
            "address": p.address,
            "property_type": p.property_type,
            "bedrooms": p.bedrooms,
            "monthly_rent": p.monthly_rent,
            "status": p.status.value if p.status else None,
            "created_by": str(p.created_by) if p.created_by else None,
            "created_at": p.created_at.isoformat() if p.created_at else None,
        }
        for p in rows
    ]