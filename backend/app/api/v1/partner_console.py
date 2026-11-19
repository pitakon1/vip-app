"""合作公司经营控制台（合作伙伴赋能路线图 A-F）。

设计约束（与 `docs/合作伙伴赋能路线图.md` 一致）：
- 所有写操作的公司归属一律取 `current_user.partner_id`，不接受前端传入；
- 所有读操作强制 `partner_id` 过滤，跨公司 id 返回 404；
- 停用公司（`Partner.is_active = False`）全部拒绝；
- 关键写操作与导出落 `partner_audit_logs`。

路线图 §7 待确认问题的落地口径（默认值，写死在实现里）：
1. 佣金按结算单 **创建时点** 统计；应收=全部金额，已结=paid，待结=pending+approved；
2. 房源授权代销不强制先签 broker 协议；
3. 报备保护期默认 60 天，按手机号/邮箱归一化判定；
4. 合作公司只能创建 agent，不能建 tenant/owner；
5. 停用公司立即禁止登录（见 core/auth.py 与 api/v1/auth.py）。
"""
import csv
import io
import uuid
from datetime import date as date_type, datetime, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlmodel import Session, select

from app.core.csv_export import csv_response
from app.core.rbac import require_permission
from app.db import get_session
from app.models import (
    Announcement,
    AnnouncementCategory,
    AppealStatus,
    AttendanceAppeal,
    AttendanceShift,
    CommissionSettlement,
    CommissionSplitRule,
    Contract,
    ContractStatus,
    Department,
    Employee,
    ExternalTripApplication,
    Lead,
    LeadClaim,
    LeadStage,
    Lease,
    LeaseStatus,
    Partner,
    PartnerApproval,
    PartnerAuditLog,
    PartnerInvitation,
    PartnerMaterial,
    PartnerPropertyGrant,
    PartnerTask,
    PartnerWebhook,
    PartnerWebhookEvent,
    Payment,
    PaymentStatus,
    Property,
    SplitRuleScope,
    TripStatus,
    User,
    UserRole,
    ViewingAppointment,
    ViewingStatus,
    GrantStatus,
)

from .performance import _month_series

router = APIRouter(prefix="/partner", tags=["partner-console"])

DEFAULT_CLAIM_DAYS = 60


# ---------------------------------------------------------------------------
# 公共守卫与工具
# ---------------------------------------------------------------------------
def _partner_id_of(current: User) -> uuid.UUID:
    if not current.partner_id:
        raise HTTPException(
            status_code=403, detail="Account is not bound to any partner company"
        )
    return current.partner_id


def _require_admin(current: User) -> uuid.UUID:
    if current.role != UserRole.partner_admin:
        raise HTTPException(status_code=403, detail="Partner admin required")
    return _partner_id_of(current)


def _ensure_partner_active(session: Session, partner_id: uuid.UUID) -> Partner:
    p = session.get(Partner, partner_id)
    if not p or p.deleted_at or not p.is_active:
        raise HTTPException(status_code=403, detail="Partner company is not active")
    return p


def _company_users(session: Session, partner_id: uuid.UUID) -> List[User]:
    return session.exec(
        select(User).where(
            User.partner_id == partner_id, User.deleted_at.is_(None)
        )
    ).all()


def _company_user_ids(session: Session, partner_id: uuid.UUID) -> List[uuid.UUID]:
    return session.exec(
        select(User.id).where(
            User.partner_id == partner_id, User.deleted_at.is_(None)
        )
    ).all()


def _company_employees(session: Session, partner_id: uuid.UUID) -> List[Employee]:
    user_ids = _company_user_ids(session, partner_id)
    if not user_ids:
        return []
    return session.exec(
        select(Employee).where(
            Employee.user_id.in_(user_ids), Employee.deleted_at.is_(None)
        )
    ).all()


def _employee_ids(session: Session, partner_id: uuid.UUID) -> List[uuid.UUID]:
    return [e.id for e in _company_employees(session, partner_id)]


def _name_by_employee(session: Session, employee_ids) -> Dict[uuid.UUID, str]:
    ids = {i for i in employee_ids if i}
    if not ids:
        return {}
    emps = session.exec(select(Employee).where(Employee.id.in_(ids))).all()
    user_ids = {e.user_id for e in emps if e.user_id}
    users = (
        {u.id: u for u in session.exec(select(User).where(User.id.in_(user_ids))).all()}
        if user_ids
        else {}
    )
    return {
        e.id: (users.get(e.user_id).full_name if users.get(e.user_id) else None)
        for e in emps
    }


def _leaf_scope_user_ids(session: Session, current: User) -> Optional[set]:
    """组长数据范围：返回本组用户 id 集合；非组长返回 None（= 本司全量）。"""
    deps = session.exec(
        select(Department).where(
            Department.leader_id == current.id,
            Department.partner_id == current.partner_id,
            Department.deleted_at.is_(None),
        )
    ).all()
    if not deps:
        return None
    emp_user_ids = session.exec(
        select(Employee.user_id).where(
            Employee.department_id.in_([d.id for d in deps]),
            Employee.deleted_at.is_(None),
        )
    ).all()
    return set(emp_user_ids) | {current.id}


def _audit(
    session: Session,
    partner_id: uuid.UUID,
    actor: User,
    action: str,
    resource_type: Optional[str] = None,
    resource_id: Optional[str] = None,
    detail: Optional[Dict[str, Any]] = None,
) -> None:
    """写合作公司审计日志（与主事务一起提交）。"""
    session.add(
        PartnerAuditLog(
            partner_id=partner_id,
            actor_user_id=actor.id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            detail=detail or {},
        )
    )


def _month_range(month: Optional[str]) -> tuple[datetime, datetime, int, int]:
    """支持 `YYYY-MM`；缺省当前 UTC 月。"""
    now = datetime.utcnow()
    if month:
        try:
            y, m = [int(x) for x in month.split("-")[:2]]
            start = datetime(y, m, 1)
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="month must be YYYY-MM")
    else:
        y, m = now.year, now.month
        start = datetime(y, m, 1)
    end = datetime(y + 1, 1, 1) if m == 12 else datetime(y, m + 1, 1)
    return start, end, y, m


def _partner_settlements(
    session: Session, partner_id: uuid.UUID
) -> List[CommissionSettlement]:
    return session.exec(
        select(CommissionSettlement).where(
            CommissionSettlement.partner_id == partner_id,
            CommissionSettlement.deleted_at.is_(None),
        )
    ).all()


# ---------------------------------------------------------------------------
# A1. 经营驾驶舱
# ---------------------------------------------------------------------------
@router.get("/dashboard")
def partner_dashboard(
    month: Optional[str] = Query(None, description="YYYY-MM，缺省当前月"),
    session: Session = Depends(get_session),
    current: User = Depends(require_permission("partner:dashboard:view")),
):
    partner_id = _require_admin(current)
    _ensure_partner_active(session, partner_id)
    start, end, year, mon = _month_range(month)

    scope = _leaf_scope_user_ids(session, current)
    user_ids = _company_user_ids(session, partner_id)
    if scope is not None:
        user_ids = [uid for uid in user_ids if uid in scope]
    emp_rows = (
        session.exec(
            select(Employee).where(
                Employee.user_id.in_(user_ids), Employee.deleted_at.is_(None)
            )
        ).all()
        if user_ids
        else []
    )
    employee_ids = {e.id for e in emp_rows}

    settlements = _partner_settlements(session, partner_id)
    month_rows = [s for s in settlements if start <= s.created_at < end]
    if scope is not None:
        month_rows = [s for s in month_rows if s.employee_id in employee_ids]

    seen_leases: set = set()
    deals = 0
    revenue = 0.0
    for s in month_rows:
        if s.lease_id in seen_leases:
            continue
        seen_leases.add(s.lease_id)
        deals += 1
        revenue += s.commission_base or 0

    receivable = sum(s.commission_amount or 0 for s in month_rows)
    paid = sum(
        s.commission_amount or 0
        for s in month_rows
        if s.status.value == "paid"
    )
    pending = sum(
        s.commission_amount or 0
        for s in month_rows
        if s.status.value in ("pending", "approved")
    )

    agents = [u for u in _company_users(session, partner_id) if u.role == UserRole.agent]
    if scope is not None:
        agents = [u for u in agents if u.id in scope]
    properties_q = select(Property).where(Property.deleted_at.is_(None))
    properties_q = (
        properties_q.where(Property.created_by.in_([u.id for u in agents]))
        if agents
        else properties_q.where(Property.created_by.in_([uuid.uuid4()]))
    )
    property_count = len(session.exec(properties_q).all())

    # 经纪人排行（本月佣金 / 成交额 / 单数）
    names = _name_by_employee(session, [s.employee_id for s in month_rows])
    by_agent: Dict[str, dict] = {}
    for s in month_rows:
        if s.employee_id is None:
            continue
        key = str(s.employee_id)
        row = by_agent.setdefault(
            key,
            {
                "employee_id": key,
                "employee_name": names.get(s.employee_id),
                "commission": 0.0,
                "revenue": 0.0,
                "deals": set(),
            },
        )
        row["commission"] += s.commission_amount or 0
        row["revenue"] += s.commission_base or 0
        row["deals"].add(s.lease_id)
    agent_ranking = [
        {
            "employee_id": r["employee_id"],
            "employee_name": r["employee_name"],
            "commission": round(r["commission"], 2),
            "revenue": round(r["revenue"], 2),
            "deals": len(r["deals"]),
        }
        for r in by_agent.values()
    ]
    agent_ranking.sort(key=lambda r: r["commission"], reverse=True)

    # 房源贡献排行（按录入人统计在售/全部房源数）
    prop_rows = (
        session.exec(
            select(Property).where(
                Property.deleted_at.is_(None),
                Property.created_by.in_([u.id for u in agents]),
            )
        ).all()
        if agents
        else []
    )
    user_name = {u.id: u.full_name for u in agents}
    prop_count: Dict[str, int] = {}
    for p in prop_rows:
        if p.created_by:
            prop_count[str(p.created_by)] = prop_count.get(str(p.created_by), 0) + 1
    property_ranking = [
        {"user_id": uid, "name": user_name.get(uuid.UUID(uid)), "count": cnt}
        for uid, cnt in sorted(prop_count.items(), key=lambda kv: -kv[1])[:10]
    ]

    return {
        "partner_id": str(partner_id),
        "period": {"year": year, "month": mon},
        "stats": {
            "deals": deals,
            "revenue": round(revenue, 2),
            "receivable": round(receivable, 2),
            "paid": round(paid, 2),
            "pending": round(pending, 2),
            "active_agents": len([u for u in agents if u.is_active]),
            "properties": property_count,
        },
        "monthly": _month_series(settlements, 12),
        "agent_ranking": agent_ranking[:10],
        "property_ranking": property_ranking,
    }


# ---------------------------------------------------------------------------
# A2. 佣金对账单（含导出）
# ---------------------------------------------------------------------------
def _settlement_filters(
    session: Session,
    partner_id: uuid.UUID,
    start: Optional[date_type],
    end: Optional[date_type],
    status: Optional[str],
    employee_id: Optional[uuid.UUID],
) -> List[CommissionSettlement]:
    rows = _partner_settlements(session, partner_id)
    if start:
        rows = [s for s in rows if s.created_at.date() >= start]
    if end:
        rows = [s for s in rows if s.created_at.date() <= end]
    if status:
        rows = [s for s in rows if s.status.value == status]
    if employee_id:
        rows = [s for s in rows if s.employee_id == employee_id]
    rows.sort(key=lambda s: s.created_at, reverse=True)
    return rows


def _settlement_rows(rows: List[CommissionSettlement], names: Dict) -> List[dict]:
    return [
        {
            "id": str(s.id),
            "lease_id": str(s.lease_id),
            "contract_id": str(s.contract_id) if s.contract_id else None,
            "deal_type": s.deal_type.value,
            "role": s.role.value,
            "employee_id": str(s.employee_id) if s.employee_id else None,
            "employee_name": names.get(s.employee_id),
            "commission_base": s.commission_base,
            "commission_rate": s.commission_rate,
            "commission_amount": s.commission_amount,
            "split_percent": s.split_percent,
            "currency": s.currency,
            "status": s.status.value,
            "settled_at": s.settled_at.isoformat() if s.settled_at else None,
            "paid_at": s.paid_at.isoformat() if s.paid_at else None,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        }
        for s in rows
    ]


@router.get("/settlements")
def list_settlements(
    start: Optional[date_type] = None,
    end: Optional[date_type] = None,
    status: Optional[str] = None,
    employee_id: Optional[uuid.UUID] = None,
    page: int = 1,
    page_size: int = 20,
    session: Session = Depends(get_session),
    current: User = Depends(require_permission("partner:settlement:view")),
):
    partner_id = _require_admin(current)
    _ensure_partner_active(session, partner_id)
    rows = _settlement_filters(session, partner_id, start, end, status, employee_id)
    names = _name_by_employee(session, [s.employee_id for s in rows])
    page = max(1, page)
    page_size = max(1, min(page_size, 100))
    items = _settlement_rows(rows[(page - 1) * page_size : page * page_size], names)
    return {
        "items": items,
        "total": len(rows),
        "sum": {
            "base": round(sum(s.commission_base or 0 for s in rows), 2),
            "amount": round(sum(s.commission_amount or 0 for s in rows), 2),
        },
    }


@router.get("/settlements/export")
def export_settlements(
    start: Optional[date_type] = None,
    end: Optional[date_type] = None,
    status: Optional[str] = None,
    employee_id: Optional[uuid.UUID] = None,
    session: Session = Depends(get_session),
    current: User = Depends(require_permission("partner:settlement:view")),
):
    partner_id = _require_admin(current)
    _ensure_partner_active(session, partner_id)
    rows = _settlement_filters(session, partner_id, start, end, status, employee_id)
    names = _name_by_employee(session, [s.employee_id for s in rows])
    _audit(
        session,
        partner_id,
        current,
        "settlement.export",
        "commission_settlement",
        detail={"rows": len(rows), "start": str(start), "end": str(end)},
    )
    session.commit()
    header = [
        "结算ID", "租约ID", "合同ID", "成交类型", "角色", "经纪人",
        "佣金基数", "费率(%)", "佣金金额", "分成比例(%)", "币种", "状态",
        "结算时间", "到账时间", "创建时间",
    ]
    data = []
    for s in rows:
        data.append([
            str(s.id), str(s.lease_id), str(s.contract_id) if s.contract_id else "",
            s.deal_type.value, s.role.value, names.get(s.employee_id) or "",
            s.commission_base, s.commission_rate, s.commission_amount,
            s.split_percent, s.currency, s.status.value,
            s.settled_at.strftime("%Y-%m-%d %H:%M") if s.settled_at else "",
            s.paid_at.strftime("%Y-%m-%d %H:%M") if s.paid_at else "",
            s.created_at.strftime("%Y-%m-%d %H:%M") if s.created_at else "",
        ])
    return csv_response(
        header, data, f"partner-settlements-{datetime.utcnow():%Y%m%d}.csv"
    )


# ---------------------------------------------------------------------------
# A3. 佣金规则只读视图
# ---------------------------------------------------------------------------
@router.get("/commission-rules")
def list_commission_rules(
    session: Session = Depends(get_session),
    current: User = Depends(require_permission("partner:settlement:view")),
):
    partner_id = _require_admin(current)
    _ensure_partner_active(session, partner_id)
    now = datetime.utcnow()
    rows = session.exec(
        select(CommissionSplitRule).where(
            CommissionSplitRule.is_active == True,  # noqa: E712
            CommissionSplitRule.deleted_at.is_(None),
            (CommissionSplitRule.effective_from.is_(None))
            | (CommissionSplitRule.effective_from <= now),
            (CommissionSplitRule.effective_to.is_(None))
            | (CommissionSplitRule.effective_to >= now),
        )
    ).all()
    visible = [
        r
        for r in rows
        if r.scope == SplitRuleScope.all
        or (r.scope == SplitRuleScope.by_partner and r.partner_id == partner_id)
    ]
    return [
        {
            "id": str(r.id),
            "deal_type": r.deal_type,
            "role": r.role.value,
            "percent": r.percent,
            "scope": r.scope.value,
            "partner_id": str(r.partner_id) if r.partner_id else None,
            "readonly": True,
            "effective_from": r.effective_from.isoformat() if r.effective_from else None,
            "effective_to": r.effective_to.isoformat() if r.effective_to else None,
        }
        for r in visible
    ]


# ---------------------------------------------------------------------------
# B3. 团队 / 组长与数据权限
# ---------------------------------------------------------------------------
class TeamCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    leader_user_id: Optional[uuid.UUID] = None


@router.get("/teams")
def list_teams(
    session: Session = Depends(get_session),
    current: User = Depends(require_permission("partner:team:manage")),
):
    partner_id = _require_admin(current)
    _ensure_partner_active(session, partner_id)
    teams = session.exec(
        select(Department).where(
            Department.partner_id == partner_id, Department.deleted_at.is_(None)
        )
    ).all()
    users = {u.id: u for u in _company_users(session, partner_id)}
    emps = _company_employees(session, partner_id)
    count: Dict[uuid.UUID, int] = {}
    for e in emps:
        if e.department_id:
            count[e.department_id] = count.get(e.department_id, 0) + 1
    return [
        {
            "id": str(t.id),
            "name": t.name,
            "leader_user_id": str(t.leader_id) if t.leader_id else None,
            "leader_name": users.get(t.leader_id).full_name
            if t.leader_id and users.get(t.leader_id)
            else None,
            "member_count": count.get(t.id, 0),
        }
        for t in teams
    ]


@router.post("/teams", status_code=201)
def create_team(
    req: TeamCreate,
    session: Session = Depends(get_session),
    current: User = Depends(require_permission("partner:team:manage")),
):
    partner_id = _require_admin(current)
    _ensure_partner_active(session, partner_id)
    if req.leader_user_id:
        leader = session.get(User, req.leader_user_id)
        if not leader or leader.partner_id != partner_id:
            raise HTTPException(status_code=404, detail="Leader not found in company")
    team = Department(
        name=req.name.strip(),
        code=f"PT{uuid.uuid4().hex[:10].upper()}",
        partner_id=partner_id,
        leader_id=req.leader_user_id,
    )
    session.add(team)
    _audit(session, partner_id, current, "team.create", "department", detail={"name": team.name})
    session.commit()
    session.refresh(team)
    return {"id": str(team.id), "name": team.name}


@router.patch("/teams/{team_id}")
def update_team(
    team_id: uuid.UUID,
    req: TeamCreate,
    session: Session = Depends(get_session),
    current: User = Depends(require_permission("partner:team:manage")),
):
    partner_id = _require_admin(current)
    team = session.get(Department, team_id)
    if not team or team.deleted_at or team.partner_id != partner_id:
        raise HTTPException(status_code=404, detail="Team not found")
    team.name = req.name.strip()
    team.leader_id = req.leader_user_id
    session.add(team)
    session.commit()
    return {"id": str(team.id), "name": team.name}


@router.delete("/teams/{team_id}")
def delete_team(
    team_id: uuid.UUID,
    session: Session = Depends(get_session),
    current: User = Depends(require_permission("partner:team:manage")),
):
    partner_id = _require_admin(current)
    team = session.get(Department, team_id)
    if not team or team.deleted_at or team.partner_id != partner_id:
        raise HTTPException(status_code=404, detail="Team not found")
    team.deleted_at = datetime.utcnow()
    session.add(team)
    session.commit()
    return {"id": str(team.id), "deleted": True}


class MemberTeamUpdate(BaseModel):
    team_id: Optional[uuid.UUID] = None


@router.patch("/members/{user_id}/team")
def assign_member_team(
    user_id: uuid.UUID,
    req: MemberTeamUpdate,
    session: Session = Depends(get_session),
    current: User = Depends(require_permission("partner:team:manage")),
):
    partner_id = _require_admin(current)
    target = session.get(User, user_id)
    if not target or target.deleted_at or target.partner_id != partner_id:
        raise HTTPException(status_code=404, detail="Member not found")
    emp = session.exec(
        select(Employee).where(
            Employee.user_id == target.id, Employee.deleted_at.is_(None)
        )
    ).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee profile not found")
    team = None
    if req.team_id:
        team = session.get(Department, req.team_id)
        if not team or team.deleted_at or team.partner_id != partner_id:
            raise HTTPException(status_code=404, detail="Team not found")
    emp.department_id = team.id if team else None
    emp.department = team.name if team else None
    session.add(emp)
    session.commit()
    return {"user_id": str(target.id), "team_id": str(team.id) if team else None}


@router.get("/teams/{team_id}/members")
def list_team_members(
    team_id: uuid.UUID,
    session: Session = Depends(get_session),
    current: User = Depends(require_permission("partner:team:manage")),
):
    partner_id = _require_admin(current)
    team = session.get(Department, team_id)
    if not team or team.deleted_at or team.partner_id != partner_id:
        raise HTTPException(status_code=404, detail="Team not found")
    emps = session.exec(
        select(Employee).where(
            Employee.department_id == team_id, Employee.deleted_at.is_(None)
        )
    ).all()
    user_ids = {e.user_id for e in emps}
    users = {
        u.id: u
        for u in session.exec(select(User).where(User.id.in_(user_ids))).all()
    } if user_ids else {}
    return [
        {
            "user_id": str(e.user_id),
            "name": users.get(e.user_id).full_name if users.get(e.user_id) else None,
            "email": users.get(e.user_id).email if users.get(e.user_id) else None,
            "position": e.position,
        }
        for e in emps
    ]


# ---------------------------------------------------------------------------
# B4. CSV 批量导入 + 邀请
# ---------------------------------------------------------------------------
class ImportRequest(BaseModel):
    csv: str


@router.post("/members/import")
def import_members(
    req: ImportRequest,
    session: Session = Depends(get_session),
    current: User = Depends(require_permission("partner:member:manage")),
):
    """逐行导入成员：重复邮箱/格式错误只影响该行，不整批失败。"""
    from app.core.security import get_password_hash

    partner_id = _require_admin(current)
    partner = _ensure_partner_active(session, partner_id)
    existing_users = len(_company_users(session, partner_id))
    created: List[dict] = []
    errors: List[dict] = []
    reader = csv.reader(io.StringIO(req.csv.strip()))
    for line_no, row in enumerate(reader, start=1):
        if not row or not any(cell.strip() for cell in row):
            continue
        if line_no == 1 and row[0].strip().lower() in ("name", "full_name", "姓名"):
            continue
        values = [c.strip() for c in row] + [""] * 6
        full_name, email, phone, position, password = values[:5]
        if not email or "@" not in email:
            errors.append({"line": line_no, "email": email, "error": "invalid email"})
            continue
        if session.exec(select(User).where(User.email == email)).first():
            errors.append({"line": line_no, "email": email, "error": "email already registered"})
            continue
        if partner.seat_limit and existing_users + len(created) >= partner.seat_limit:
            errors.append(
                {
                    "line": line_no,
                    "email": email,
                    "error": f"seat limit reached ({partner.seat_limit})",
                }
            )
            continue
        user = User(
            email=email,
            phone=phone or None,
            full_name=full_name or email.split("@")[0],
            hashed_password=get_password_hash(password or "123456"),
            role=UserRole.agent,
            user_type="partner",
            partner_id=partner_id,
            is_active=True,
            is_verified=True,
        )
        session.add(user)
        session.flush()
        session.add(
            Employee(
                user_id=user.id,
                employee_code=f"E{uuid.uuid4().hex[:8].upper()}",
                department=partner.name,
                position=position or None,
                hire_date=date_type.today(),
                is_active=True,
            )
        )
        created.append({"line": line_no, "email": email, "user_id": str(user.id)})
    _audit(
        session, partner_id, current, "member.import", "user",
        detail={"created": len(created), "failed": len(errors)},
    )
    session.commit()
    return {"created": created, "errors": errors}


class InvitationCreate(BaseModel):
    email: Optional[str] = None
    position: Optional[str] = None
    expires_in_days: int = 7


@router.post("/invitations", status_code=201)
def create_invitation(
    req: InvitationCreate,
    session: Session = Depends(get_session),
    current: User = Depends(require_permission("partner:member:manage")),
):
    partner_id = _require_admin(current)
    _ensure_partner_active(session, partner_id)
    inv = PartnerInvitation(
        partner_id=partner_id,
        token=uuid.uuid4().hex,
        email=(req.email or "").strip() or None,
        position=req.position,
        expires_at=datetime.utcnow() + timedelta(days=max(1, req.expires_in_days)),
    )
    session.add(inv)
    _audit(session, partner_id, current, "invitation.create", "partner_invitation")
    session.commit()
    session.refresh(inv)
    return {
        "id": str(inv.id),
        "token": inv.token,
        "expires_at": inv.expires_at.isoformat(),
        "accept_path": f"/partner/invitations/accept?token={inv.token}",
    }


@router.get("/invitations")
def list_invitations(
    session: Session = Depends(get_session),
    current: User = Depends(require_permission("partner:member:manage")),
):
    partner_id = _require_admin(current)
    rows = session.exec(
        select(PartnerInvitation).where(
            PartnerInvitation.partner_id == partner_id,
            PartnerInvitation.deleted_at.is_(None),
        )
    ).all()
    return [
        {
            "id": str(i.id),
            "token": i.token,
            "email": i.email,
            "position": i.position,
            "status": i.status,
            "expires_at": i.expires_at.isoformat(),
        }
        for i in rows
    ]


@router.delete("/invitations/{invitation_id}")
def revoke_invitation(
    invitation_id: uuid.UUID,
    session: Session = Depends(get_session),
    current: User = Depends(require_permission("partner:member:manage")),
):
    partner_id = _require_admin(current)
    inv = session.get(PartnerInvitation, invitation_id)
    if not inv or inv.deleted_at or inv.partner_id != partner_id:
        raise HTTPException(status_code=404, detail="Invitation not found")
    inv.status = "revoked"
    session.add(inv)
    session.commit()
    return {"id": str(inv.id), "status": inv.status}


class InvitationAccept(BaseModel):
    token: str


@router.post("/invitations/accept")
def accept_invitation(
    req: InvitationAccept,
    session: Session = Depends(get_session),
    current: User = Depends(require_permission("data:view")),
):
    """已注册的 agent 通过邀请 token 加入公司（注册自动归属留待注册流程接入）。"""
    inv = session.exec(
        select(PartnerInvitation).where(
            PartnerInvitation.token == req.token,
            PartnerInvitation.deleted_at.is_(None),
        )
    ).first()
    if not inv or inv.status != "pending" or inv.expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Invitation invalid or expired")
    if current.role != UserRole.agent:
        raise HTTPException(status_code=400, detail="Only agent accounts can accept")
    if current.partner_id is not None:
        raise HTTPException(status_code=409, detail="User already belongs to a company")
    current.partner_id = inv.partner_id
    current.user_type = "partner"
    session.add(current)
    inv.status = "used"
    inv.used_by = current.id
    session.add(inv)
    session.commit()
    return {"ok": True, "partner_id": str(inv.partner_id)}


# ---------------------------------------------------------------------------
# C1. 外勤 / 申诉审批
# ---------------------------------------------------------------------------
class ReviewRequest(BaseModel):
    approved: bool
    note: Optional[str] = None


@router.get("/trips")
def list_trips(
    status: Optional[str] = None,
    session: Session = Depends(get_session),
    current: User = Depends(require_permission("partner:review:trip")),
):
    partner_id = _require_admin(current)
    emp_ids = _employee_ids(session, partner_id)
    if not emp_ids:
        return []
    q = select(ExternalTripApplication).where(
        ExternalTripApplication.employee_id.in_(emp_ids),
        ExternalTripApplication.deleted_at.is_(None),
    )
    if status:
        q = q.where(ExternalTripApplication.status == TripStatus(status))
    rows = session.exec(q.order_by(ExternalTripApplication.trip_date.desc())).all()
    names = _name_by_employee(session, [r.employee_id for r in rows])
    return [
        {
            "id": str(r.id),
            "employee_id": str(r.employee_id),
            "employee_name": names.get(r.employee_id),
            "trip_date": r.trip_date.isoformat(),
            "from_location": r.from_location,
            "to_location": r.to_location,
            "reason": r.reason,
            "status": r.status.value,
            "reply_note": r.reply_note,
            "created_at": r.created_at.isoformat(),
        }
        for r in rows
    ]


@router.post("/trips/{trip_id}/review")
def review_trip(
    trip_id: uuid.UUID,
    req: ReviewRequest,
    session: Session = Depends(get_session),
    current: User = Depends(require_permission("partner:review:trip")),
):
    partner_id = _require_admin(current)
    emp_ids = _employee_ids(session, partner_id)
    row = session.get(ExternalTripApplication, trip_id)
    if not row or row.deleted_at or row.employee_id not in emp_ids:
        raise HTTPException(status_code=404, detail="Trip not found")
    if row.status != TripStatus.pending:
        raise HTTPException(status_code=400, detail="Only pending trips can be reviewed")
    row.status = TripStatus.approved if req.approved else TripStatus.rejected
    row.approved_by = current.id
    row.approved_at = datetime.utcnow()
    row.reply_note = req.note
    session.add(row)
    _audit(session, partner_id, current, "trip.review", "external_trip", str(row.id))
    session.commit()
    return {"id": str(row.id), "status": row.status.value}


@router.get("/appeals")
def list_appeals(
    status: Optional[str] = None,
    session: Session = Depends(get_session),
    current: User = Depends(require_permission("partner:review:appeal")),
):
    partner_id = _require_admin(current)
    emp_ids = _employee_ids(session, partner_id)
    if not emp_ids:
        return []
    q = select(AttendanceAppeal).where(
        AttendanceAppeal.employee_id.in_(emp_ids),
        AttendanceAppeal.deleted_at.is_(None),
    )
    if status:
        q = q.where(AttendanceAppeal.status == AppealStatus(status))
    rows = session.exec(q.order_by(AttendanceAppeal.date.desc())).all()
    names = _name_by_employee(session, [r.employee_id for r in rows])
    return [
        {
            "id": str(r.id),
            "employee_id": str(r.employee_id),
            "employee_name": names.get(r.employee_id),
            "date": r.date.isoformat(),
            "reason": r.reason,
            "status": r.status.value,
            "reply_note": r.reply_note,
        }
        for r in rows
    ]


@router.post("/appeals/{appeal_id}/review")
def review_appeal(
    appeal_id: uuid.UUID,
    req: ReviewRequest,
    session: Session = Depends(get_session),
    current: User = Depends(require_permission("partner:review:appeal")),
):
    partner_id = _require_admin(current)
    emp_ids = _employee_ids(session, partner_id)
    row = session.get(AttendanceAppeal, appeal_id)
    if not row or row.deleted_at or row.employee_id not in emp_ids:
        raise HTTPException(status_code=404, detail="Appeal not found")
    if row.status != AppealStatus.pending:
        raise HTTPException(status_code=400, detail="Only pending appeals can be reviewed")
    row.status = AppealStatus.approved if req.approved else AppealStatus.rejected
    row.approved_by = current.id
    row.approved_at = datetime.utcnow()
    row.reply_note = req.note
    session.add(row)
    _audit(session, partner_id, current, "appeal.review", "attendance_appeal", str(row.id))
    session.commit()
    return {"id": str(row.id), "status": row.status.value}


# ---------------------------------------------------------------------------
# C2. 排班 / 班次
# ---------------------------------------------------------------------------
class ShiftItem(BaseModel):
    employee_id: uuid.UUID
    date: date_type
    start_time: str = "09:00"
    end_time: str = "18:00"
    note: Optional[str] = None


class ShiftBulkCreate(BaseModel):
    items: List[ShiftItem]


@router.get("/shifts")
def list_shifts(
    start: Optional[date_type] = None,
    end: Optional[date_type] = None,
    employee_id: Optional[uuid.UUID] = None,
    session: Session = Depends(get_session),
    current: User = Depends(require_permission("attendance:partner:view")),
):
    partner_id = _require_admin(current)
    q = select(AttendanceShift).where(
        AttendanceShift.partner_id == partner_id,
        AttendanceShift.deleted_at.is_(None),
    )
    if start:
        q = q.where(AttendanceShift.date >= start)
    if end:
        q = q.where(AttendanceShift.date <= end)
    if employee_id:
        q = q.where(AttendanceShift.employee_id == employee_id)
    rows = session.exec(q.order_by(AttendanceShift.date)).all()
    names = _name_by_employee(session, [r.employee_id for r in rows])
    return [
        {
            "id": str(r.id),
            "employee_id": str(r.employee_id),
            "employee_name": names.get(r.employee_id),
            "date": r.date.isoformat(),
            "start_time": r.start_time,
            "end_time": r.end_time,
            "note": r.note,
        }
        for r in rows
    ]


@router.post("/shifts", status_code=201)
def create_shifts(
    req: ShiftBulkCreate,
    session: Session = Depends(get_session),
    current: User = Depends(require_permission("attendance:partner:view")),
):
    partner_id = _require_admin(current)
    emp_ids = set(_employee_ids(session, partner_id))
    created = 0
    for item in req.items:
        if item.employee_id not in emp_ids:
            raise HTTPException(status_code=404, detail="Employee not found in company")
        existing = session.exec(
            select(AttendanceShift).where(
                AttendanceShift.employee_id == item.employee_id,
                AttendanceShift.date == item.date,
                AttendanceShift.deleted_at.is_(None),
            )
        ).first()
        if existing:
            existing.start_time = item.start_time
            existing.end_time = item.end_time
            existing.note = item.note
            session.add(existing)
        else:
            session.add(
                AttendanceShift(
                    partner_id=partner_id,
                    employee_id=item.employee_id,
                    date=item.date,
                    start_time=item.start_time,
                    end_time=item.end_time,
                    note=item.note,
                    created_by=current.id,
                )
            )
        created += 1
    _audit(session, partner_id, current, "shift.save", detail={"count": created})
    session.commit()
    return {"saved": created}


@router.delete("/shifts/{shift_id}")
def delete_shift(
    shift_id: uuid.UUID,
    session: Session = Depends(get_session),
    current: User = Depends(require_permission("attendance:partner:view")),
):
    partner_id = _require_admin(current)
    row = session.get(AttendanceShift, shift_id)
    if not row or row.deleted_at or row.partner_id != partner_id:
        raise HTTPException(status_code=404, detail="Shift not found")
    row.deleted_at = datetime.utcnow()
    session.add(row)
    session.commit()
    return {"id": str(row.id), "deleted": True}


# ---------------------------------------------------------------------------
# D1. 平台房源授权代销
# ---------------------------------------------------------------------------
def _expire_grants(session: Session, partner_id: uuid.UUID) -> None:
    now = datetime.utcnow()
    rows = session.exec(
        select(PartnerPropertyGrant).where(
            PartnerPropertyGrant.partner_id == partner_id,
            PartnerPropertyGrant.status == GrantStatus.active,
            PartnerPropertyGrant.expires_at.is_not(None),
            PartnerPropertyGrant.expires_at < now,
            PartnerPropertyGrant.deleted_at.is_(None),
        )
    ).all()
    if rows:
        for r in rows:
            r.status = GrantStatus.expired
            session.add(r)
        session.commit()


@router.get("/available-properties")
def available_properties(
    page: int = 1,
    page_size: int = 20,
    session: Session = Depends(get_session),
    current: User = Depends(require_permission("partner:grant:view")),
):
    partner_id = _partner_id_of(current)
    _ensure_partner_active(session, partner_id)
    _expire_grants(session, partner_id)
    grants = session.exec(
        select(PartnerPropertyGrant).where(
            PartnerPropertyGrant.partner_id == partner_id,
            PartnerPropertyGrant.status == GrantStatus.active,
            PartnerPropertyGrant.deleted_at.is_(None),
        )
    ).all()
    prop_ids = [g.property_id for g in grants]
    if not prop_ids:
        return {"items": [], "total": 0}
    props = {
        p.id: p
        for p in session.exec(
            select(Property).where(
                Property.id.in_(prop_ids), Property.deleted_at.is_(None)
            )
        ).all()
    }
    grant_by_prop = {g.property_id: g for g in grants}
    rows = []
    for pid, p in props.items():
        g = grant_by_prop.get(pid)
        rows.append(
            {
                "id": str(p.id),
                "address": p.address,
                "property_type": p.property_type,
                "bedrooms": p.bedrooms,
                "bathrooms": p.bathrooms,
                "size_sqm": p.size_sqm,
                "monthly_rent": p.monthly_rent,
                "currency": p.currency,
                "status": p.status.value if p.status else None,
                "photos": p.photos or [],
                "grant_id": str(g.id) if g else None,
                "expires_at": g.expires_at.isoformat() if g and g.expires_at else None,
            }
        )
    rows.sort(key=lambda r: r["address"] or "")
    page = max(1, page)
    page_size = max(1, min(page_size, 100))
    return {
        "items": rows[(page - 1) * page_size : page * page_size],
        "total": len(rows),
    }


class GrantCreate(BaseModel):
    partner_id: uuid.UUID
    property_ids: List[uuid.UUID]
    expires_at: Optional[datetime] = None
    note: Optional[str] = None


@router.post("/property-grants", status_code=201)
def create_property_grants(
    req: GrantCreate,
    session: Session = Depends(get_session),
    current: User = Depends(require_permission("partner:manage")),
):
    """平台侧授权入口：把房源授权给合作公司（仅平台管理员）。"""
    partner = _ensure_partner_active(session, req.partner_id)
    created = 0
    for pid in req.property_ids:
        prop = session.get(Property, pid)
        if not prop or prop.deleted_at:
            raise HTTPException(status_code=404, detail=f"Property {pid} not found")
        existing = session.exec(
            select(PartnerPropertyGrant).where(
                PartnerPropertyGrant.partner_id == req.partner_id,
                PartnerPropertyGrant.property_id == pid,
                PartnerPropertyGrant.status == GrantStatus.active,
                PartnerPropertyGrant.deleted_at.is_(None),
            )
        ).first()
        if existing:
            existing.expires_at = req.expires_at
            existing.note = req.note
            session.add(existing)
            continue
        session.add(
            PartnerPropertyGrant(
                partner_id=req.partner_id,
                property_id=pid,
                granted_by=current.id,
                expires_at=req.expires_at,
                note=req.note,
            )
        )
        created += 1
    _audit(
        session, req.partner_id, current, "property.grant", "property",
        detail={"count": created, "operator": str(current.id)},
    )
    session.commit()
    return {"created": created, "partner": partner.name}


@router.get("/property-grants")
def list_property_grants(
    session: Session = Depends(get_session),
    current: User = Depends(require_permission("partner:manage")),
):
    rows = session.exec(
        select(PartnerPropertyGrant).where(
            PartnerPropertyGrant.deleted_at.is_(None)
        )
    ).all()
    prop_names = {
        p.id: p.address
        for p in session.exec(
            select(Property).where(Property.id.in_([r.property_id for r in rows]))
        ).all()
    } if rows else {}
    return [
        {
            "id": str(r.id),
            "partner_id": str(r.partner_id),
            "property_id": str(r.property_id),
            "property_address": prop_names.get(r.property_id),
            "status": r.status.value,
            "expires_at": r.expires_at.isoformat() if r.expires_at else None,
        }
        for r in rows
    ]


@router.delete("/property-grants/{grant_id}")
def revoke_property_grant(
    grant_id: uuid.UUID,
    session: Session = Depends(get_session),
    current: User = Depends(require_permission("partner:manage")),
):
    row = session.get(PartnerPropertyGrant, grant_id)
    if not row or row.deleted_at:
        raise HTTPException(status_code=404, detail="Grant not found")
    row.status = GrantStatus.revoked
    session.add(row)
    _audit(session, row.partner_id, current, "property.grant.revoke", "property_grant", str(row.id))
    session.commit()
    return {"id": str(row.id), "status": row.status.value}


# ---------------------------------------------------------------------------
# D2. 线索池分配与报备防撞单
# ---------------------------------------------------------------------------
def _fingerprint(phone: Optional[str], email: Optional[str]) -> Optional[tuple]:
    """归一化客户指纹：优先手机号，其次小写邮箱。"""
    if phone:
        digits = "".join(ch for ch in phone if ch.isdigit() or ch == "+")
        if digits:
            return digits, "phone"
    if email:
        normalized = email.strip().lower()
        if normalized:
            return normalized, "email"
    return None


@router.get("/leads")
def list_partner_leads(
    stage: Optional[str] = None,
    assigned_to: Optional[uuid.UUID] = None,
    page: int = 1,
    page_size: int = 20,
    session: Session = Depends(get_session),
    current: User = Depends(require_permission("partner:lead:assign")),
):
    partner_id = _require_admin(current)
    emp_ids = _employee_ids(session, partner_id)
    q = select(Lead).where(
        Lead.deleted_at.is_(None),
        (Lead.partner_id == partner_id)
        | (Lead.assigned_to.in_(emp_ids) if emp_ids else False),
    )
    if stage:
        q = q.where(Lead.stage == LeadStage(stage))
    if assigned_to:
        q = q.where(Lead.assigned_to == assigned_to)
    rows = session.exec(q.order_by(Lead.created_at.desc())).all()
    names = _name_by_employee(session, [r.assigned_to for r in rows])
    page = max(1, page)
    page_size = max(1, min(page_size, 100))
    return {
        "total": len(rows),
        "items": [
            {
                "id": str(r.id),
                "name": r.name,
                "phone": r.phone,
                "email": r.email,
                "stage": r.stage.value,
                "assigned_to": str(r.assigned_to) if r.assigned_to else None,
                "assignee_name": names.get(r.assigned_to),
                "budget_min": r.budget_min,
                "budget_max": r.budget_max,
                "source": r.source,
                "created_at": r.created_at.isoformat(),
            }
            for r in rows[(page - 1) * page_size : page * page_size]
        ],
    }


class LeadAssign(BaseModel):
    employee_id: uuid.UUID


@router.post("/leads/{lead_id}/assign")
def assign_lead(
    lead_id: uuid.UUID,
    req: LeadAssign,
    session: Session = Depends(get_session),
    current: User = Depends(require_permission("partner:lead:assign")),
):
    partner_id = _require_admin(current)
    emp_ids = _employee_ids(session, partner_id)
    lead = session.get(Lead, lead_id)
    if not lead or lead.deleted_at or (
        lead.partner_id != partner_id and lead.assigned_to not in emp_ids
    ):
        raise HTTPException(status_code=404, detail="Lead not found")
    if req.employee_id not in emp_ids:
        raise HTTPException(status_code=404, detail="Employee not found in company")
    lead.assigned_to = req.employee_id
    lead.partner_id = partner_id
    session.add(lead)
    _audit(session, partner_id, current, "lead.assign", "lead", str(lead.id))
    session.commit()
    return {"id": str(lead.id), "assigned_to": str(req.employee_id)}


class LeadClaimCreate(BaseModel):
    name: str = Field(min_length=1)
    phone: Optional[str] = None
    email: Optional[str] = None
    note: Optional[str] = None
    days: int = DEFAULT_CLAIM_DAYS


@router.post("/leads/claim")
def claim_lead(
    req: LeadClaimCreate,
    session: Session = Depends(get_session),
    current: User = Depends(require_permission("partner:lead:assign")),
):
    """客户报备：保护期内归属首个报备公司；跨公司重复报备返回 409 + 到期时间。"""
    partner_id = _require_admin(current)
    fp = _fingerprint(req.phone, req.email)
    if not fp:
        raise HTTPException(status_code=400, detail="phone or email required")
    fingerprint, fp_type = fp
    now = datetime.utcnow()
    active = session.exec(
        select(LeadClaim).where(
            LeadClaim.fingerprint == fingerprint,
            LeadClaim.status == "active",
            LeadClaim.expires_at > now,
            LeadClaim.deleted_at.is_(None),
        )
    ).first()
    if active and active.partner_id != partner_id:
        raise HTTPException(
            status_code=409,
            detail=f"Customer claimed by another company until {active.expires_at:%Y-%m-%d}",
        )
    if active:
        return {
            "id": str(active.id),
            "expires_at": active.expires_at.isoformat(),
            "duplicated": True,
        }
    lead = Lead(
        name=req.name.strip(),
        phone=req.phone,
        email=req.email,
        notes=req.note,
        partner_id=partner_id,
        source="partner_claim",
    )
    session.add(lead)
    session.flush()
    claim = LeadClaim(
        partner_id=partner_id,
        fingerprint=fingerprint,
        fingerprint_type=fp_type,
        lead_id=lead.id,
        claimed_by=current.id,
        expires_at=now + timedelta(days=max(1, min(req.days, 365))),
    )
    session.add(claim)
    _audit(session, partner_id, current, "lead.claim", "lead", str(lead.id))
    session.commit()
    session.refresh(claim)
    return {
        "id": str(claim.id),
        "lead_id": str(lead.id),
        "expires_at": claim.expires_at.isoformat(),
        "duplicated": False,
    }


@router.get("/claims")
def list_claims(
    session: Session = Depends(get_session),
    current: User = Depends(require_permission("partner:lead:assign")),
):
    partner_id = _require_admin(current)
    rows = session.exec(
        select(LeadClaim).where(
            LeadClaim.partner_id == partner_id,
            LeadClaim.deleted_at.is_(None),
        ).order_by(LeadClaim.created_at.desc())
    ).all()
    return [
        {
            "id": str(r.id),
            "fingerprint": r.fingerprint,
            "fingerprint_type": r.fingerprint_type,
            "lead_id": str(r.lead_id) if r.lead_id else None,
            "expires_at": r.expires_at.isoformat(),
            "status": "expired" if r.expires_at < datetime.utcnow() else r.status,
        }
        for r in rows
    ]


# ---------------------------------------------------------------------------
# D3. 带看任务派发
# ---------------------------------------------------------------------------
def _company_viewings(session: Session, partner_id: uuid.UUID) -> List[ViewingAppointment]:
    emp_ids = _employee_ids(session, partner_id)
    user_ids = _company_user_ids(session, partner_id)
    props = session.exec(
        select(Property.id).where(
            Property.created_by.in_(user_ids), Property.deleted_at.is_(None)
        )
    ).all() if user_ids else []
    grants = session.exec(
        select(PartnerPropertyGrant.property_id).where(
            PartnerPropertyGrant.partner_id == partner_id,
            PartnerPropertyGrant.status == GrantStatus.active,
            PartnerPropertyGrant.deleted_at.is_(None),
        )
    ).all()
    prop_ids = set(props) | set(grants)
    rows = session.exec(
        select(ViewingAppointment).where(
            ViewingAppointment.deleted_at.is_(None)
        ).order_by(ViewingAppointment.scheduled_at.desc())
    ).all()
    return [
        r
        for r in rows
        if (r.assigned_to and r.assigned_to in emp_ids)
        or (r.property_id in prop_ids)
    ]


@router.get("/viewings")
def list_partner_viewings(
    status: Optional[str] = None,
    session: Session = Depends(get_session),
    current: User = Depends(require_permission("partner:lead:assign")),
):
    partner_id = _require_admin(current)
    rows = _company_viewings(session, partner_id)
    if status:
        rows = [r for r in rows if r.status.value == status]
    names = _name_by_employee(session, [r.assigned_to for r in rows])
    prop_names = {
        p.id: p.address
        for p in session.exec(
            select(Property).where(Property.id.in_([r.property_id for r in rows]))
        ).all()
    } if rows else {}
    return [
        {
            "id": str(r.id),
            "property_id": str(r.property_id),
            "property_address": prop_names.get(r.property_id),
            "visitor_name": r.visitor_name,
            "visitor_phone": r.visitor_phone,
            "scheduled_at": r.scheduled_at.isoformat(),
            "status": r.status.value,
            "assigned_to": str(r.assigned_to) if r.assigned_to else None,
            "assignee_name": names.get(r.assigned_to),
        }
        for r in rows
    ]


@router.post("/viewings/{viewing_id}/assign")
def assign_viewing(
    viewing_id: uuid.UUID,
    req: LeadAssign,
    session: Session = Depends(get_session),
    current: User = Depends(require_permission("partner:lead:assign")),
):
    partner_id = _require_admin(current)
    emp_ids = _employee_ids(session, partner_id)
    rows = {r.id: r for r in _company_viewings(session, partner_id)}
    row = rows.get(viewing_id)
    if not row:
        raise HTTPException(status_code=404, detail="Viewing not found")
    if req.employee_id not in emp_ids:
        raise HTTPException(status_code=404, detail="Employee not found in company")
    row.assigned_to = req.employee_id
    if row.status == ViewingStatus.pending:
        row.status = ViewingStatus.confirmed
    session.add(row)
    _audit(session, partner_id, current, "viewing.assign", "viewing", str(row.id))
    session.commit()
    return {"id": str(row.id), "assigned_to": str(req.employee_id)}


class ViewingResult(BaseModel):
    status: str = Field(pattern="^(completed|no_show|cancelled)$")
    note: Optional[str] = None


@router.post("/viewings/{viewing_id}/result")
def viewing_result(
    viewing_id: uuid.UUID,
    req: ViewingResult,
    session: Session = Depends(get_session),
    current: User = Depends(require_permission("partner:lead:assign")),
):
    partner_id = _require_admin(current)
    rows = {r.id: r for r in _company_viewings(session, partner_id)}
    row = rows.get(viewing_id)
    if not row:
        raise HTTPException(status_code=404, detail="Viewing not found")
    row.status = ViewingStatus(req.status)
    if req.status == "completed":
        row.completed_at = datetime.utcnow()
    if req.note:
        row.notes = req.note
    session.add(row)
    session.commit()
    return {"id": str(row.id), "status": row.status.value}


# ---------------------------------------------------------------------------
# E1. 租约 / 合同可见性与续约提醒
# ---------------------------------------------------------------------------
@router.get("/leases")
def list_partner_leases(
    status: Optional[str] = None,
    q: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    session: Session = Depends(get_session),
    current: User = Depends(require_permission("partner:dashboard:view")),
):
    partner_id = _require_admin(current)
    query = select(Lease).where(
        Lease.partner_id == partner_id, Lease.deleted_at.is_(None)
    )
    if status:
        query = query.where(Lease.status == LeaseStatus(status))
    rows = session.exec(query.order_by(Lease.created_at.desc())).all()
    if q:
        kw = q.strip().lower()
        rows = [
            r
            for r in rows
            if kw in (r.lease_no or "").lower()
            or kw in (r.contract_no or "").lower()
        ]
    props = {
        p.id: p.address
        for p in session.exec(
            select(Property).where(Property.id.in_([r.property_id for r in rows]))
        ).all()
    } if rows else {}
    page = max(1, page)
    page_size = max(1, min(page_size, 100))
    return {
        "total": len(rows),
        "items": [
            {
                "id": str(r.id),
                "lease_no": r.lease_no,
                "contract_no": r.contract_no,
                "property_id": str(r.property_id),
                "property_address": props.get(r.property_id),
                "start_date": r.start_date.isoformat(),
                "end_date": r.end_date.isoformat(),
                "monthly_rent": r.monthly_rent,
                "currency": r.currency,
                "status": r.status.value,
            }
            for r in rows[(page - 1) * page_size : page * page_size]
        ],
    }


@router.get("/contracts")
def list_partner_contracts(
    status: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    session: Session = Depends(get_session),
    current: User = Depends(require_permission("partner:dashboard:view")),
):
    partner_id = _require_admin(current)
    query = select(Contract).where(
        Contract.partner_id == partner_id, Contract.deleted_at.is_(None)
    )
    if status:
        query = query.where(Contract.status == ContractStatus(status))
    rows = session.exec(query.order_by(Contract.created_at.desc())).all()
    page = max(1, page)
    page_size = max(1, min(page_size, 100))
    return {
        "total": len(rows),
        "items": [
            {
                "id": str(r.id),
                "contract_no": r.contract_no,
                "title": r.title,
                "kind": r.kind.value,
                "status": r.status.value,
                "lease_id": str(r.lease_id) if r.lease_id else None,
                "signed_at": r.signed_at.isoformat() if r.signed_at else None,
                "created_at": r.created_at.isoformat(),
            }
            for r in rows[(page - 1) * page_size : page * page_size]
        ],
    }


@router.get("/renewals")
def list_renewals(
    days: int = 60,
    session: Session = Depends(get_session),
    current: User = Depends(require_permission("partner:dashboard:view")),
):
    """到期前 60/30/7 天续约提醒（同一笔只归入最近的一个档）。"""
    partner_id = _require_admin(current)
    now = datetime.utcnow()
    horizon = now + timedelta(days=max(1, min(days, 365)))
    rows = session.exec(
        select(Lease).where(
            Lease.partner_id == partner_id,
            Lease.deleted_at.is_(None),
            Lease.status == LeaseStatus.active,
            Lease.end_date >= now,
            Lease.end_date <= horizon,
        ).order_by(Lease.end_date)
    ).all()
    buckets = {"7": [], "30": [], "60": []}
    for r in rows:
        left = (r.end_date - now).days
        bucket = "7" if left <= 7 else "30" if left <= 30 else "60"
        buckets[bucket].append(
            {
                "lease_id": str(r.id),
                "lease_no": r.lease_no,
                "end_date": r.end_date.isoformat(),
                "days_left": left,
                "monthly_rent": r.monthly_rent,
            }
        )
    return {
        "buckets": [
            {"key": k, "items": buckets[k]} for k in ("7", "30", "60")
        ],
        "total": len(rows),
    }


# ---------------------------------------------------------------------------
# E2. 收款与逾期提醒
# ---------------------------------------------------------------------------
@router.get("/payments")
def list_partner_payments(
    status: Optional[str] = None,
    overdue: bool = False,
    page: int = 1,
    page_size: int = 20,
    session: Session = Depends(get_session),
    current: User = Depends(require_permission("partner:dashboard:view")),
):
    partner_id = _require_admin(current)
    query = select(Payment).where(
        Payment.partner_id == partner_id, Payment.deleted_at.is_(None)
    )
    if status:
        query = query.where(Payment.status == PaymentStatus(status))
    if overdue:
        query = query.where(
            Payment.due_date.is_not(None),
            Payment.due_date < datetime.utcnow(),
            Payment.status.notin_([PaymentStatus.succeeded, PaymentStatus.refunded]),
        )
    rows = session.exec(query.order_by(Payment.due_date.desc())).all()
    total_due = sum(
        r.total_due
        for r in rows
        if r.status not in (PaymentStatus.succeeded, PaymentStatus.refunded)
    )
    page = max(1, page)
    page_size = max(1, min(page_size, 100))
    return {
        "total": len(rows),
        "outstanding": round(total_due, 2),
        "items": [
            {
                "id": str(r.id),
                "receipt_no": r.receipt_no,
                "payment_type": r.payment_type.value,
                "amount": r.amount,
                "late_fee_due": r.late_fee_due,
                "total_due": r.total_due,
                "currency": r.currency,
                "status": r.status.value,
                "due_date": r.due_date.isoformat() if r.due_date else None,
                "paid_at": r.paid_at.isoformat() if r.paid_at else None,
                "description": r.description,
            }
            for r in rows[(page - 1) * page_size : page * page_size]
        ],
    }


# ---------------------------------------------------------------------------
# F1. 公告 / 任务 / 固定审批
# ---------------------------------------------------------------------------
class AnnouncementCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    content: str = ""
    is_pinned: bool = False


@router.get("/announcements")
def list_partner_announcements(
    session: Session = Depends(get_session),
    current: User = Depends(require_permission("partner:ops:manage")),
):
    partner_id = _require_admin(current)
    rows = session.exec(
        select(Announcement).where(
            Announcement.deleted_at.is_(None),
            (Announcement.partner_id.is_(None)) | (Announcement.partner_id == partner_id),
        ).order_by(Announcement.is_pinned.desc(), Announcement.published_at.desc())
    ).all()
    return [
        {
            "id": str(r.id),
            "title": r.title,
            "content": r.content,
            "category": r.category.value,
            "is_pinned": r.is_pinned,
            "scope": "platform" if r.partner_id is None else "company",
            "publisher_name": r.publisher_name,
            "published_at": r.published_at.isoformat(),
        }
        for r in rows
    ]


@router.post("/announcements", status_code=201)
def create_partner_announcement(
    req: AnnouncementCreate,
    session: Session = Depends(get_session),
    current: User = Depends(require_permission("partner:ops:manage")),
):
    partner_id = _require_admin(current)
    row = Announcement(
        partner_id=partner_id,
        title=req.title.strip(),
        content=req.content,
        category=AnnouncementCategory.notice,
        is_pinned=req.is_pinned,
        publisher_user_id=current.id,
        publisher_name=current.full_name,
    )
    session.add(row)
    _audit(session, partner_id, current, "announcement.create", "announcement")
    session.commit()
    session.refresh(row)
    return {"id": str(row.id)}


@router.delete("/announcements/{announcement_id}")
def delete_partner_announcement(
    announcement_id: uuid.UUID,
    session: Session = Depends(get_session),
    current: User = Depends(require_permission("partner:ops:manage")),
):
    partner_id = _require_admin(current)
    row = session.get(Announcement, announcement_id)
    if not row or row.deleted_at or row.partner_id != partner_id:
        raise HTTPException(status_code=404, detail="Announcement not found")
    row.deleted_at = datetime.utcnow()
    session.add(row)
    session.commit()
    return {"id": str(row.id), "deleted": True}


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    content: Optional[str] = None
    assignee_user_id: Optional[uuid.UUID] = None
    due_at: Optional[datetime] = None


@router.get("/tasks")
def list_partner_tasks(
    session: Session = Depends(get_session),
    current: User = Depends(require_permission("partner:ops:manage")),
):
    partner_id = _partner_id_of(current)
    rows = session.exec(
        select(PartnerTask).where(
            PartnerTask.partner_id == partner_id, PartnerTask.deleted_at.is_(None)
        ).order_by(PartnerTask.created_at.desc())
    ).all()
    users = {u.id: u for u in _company_users(session, partner_id)}
    return [
        {
            "id": str(r.id),
            "title": r.title,
            "content": r.content,
            "assignee_user_id": str(r.assignee_user_id) if r.assignee_user_id else None,
            "assignee_name": users.get(r.assignee_user_id).full_name
            if r.assignee_user_id and users.get(r.assignee_user_id)
            else None,
            "due_at": r.due_at.isoformat() if r.due_at else None,
            "status": r.status,
            "completed_at": r.completed_at.isoformat() if r.completed_at else None,
        }
        for r in rows
    ]


@router.post("/tasks", status_code=201)
def create_partner_task(
    req: TaskCreate,
    session: Session = Depends(get_session),
    current: User = Depends(require_permission("partner:ops:manage")),
):
    partner_id = _require_admin(current)
    if req.assignee_user_id:
        target = session.get(User, req.assignee_user_id)
        if not target or target.partner_id != partner_id:
            raise HTTPException(status_code=404, detail="Assignee not found in company")
    row = PartnerTask(
        partner_id=partner_id,
        title=req.title.strip(),
        content=req.content,
        assignee_user_id=req.assignee_user_id,
        due_at=req.due_at,
        created_by=current.id,
    )
    session.add(row)
    _audit(session, partner_id, current, "task.create", "partner_task")
    session.commit()
    session.refresh(row)
    return {"id": str(row.id)}


@router.post("/tasks/{task_id}/complete")
def complete_partner_task(
    task_id: uuid.UUID,
    session: Session = Depends(get_session),
    current: User = Depends(require_permission("partner:ops:manage")),
):
    partner_id = _partner_id_of(current)
    row = session.get(PartnerTask, task_id)
    if not row or row.deleted_at or row.partner_id != partner_id:
        raise HTTPException(status_code=404, detail="Task not found")
    if row.assignee_user_id and row.assignee_user_id != current.id and current.role != UserRole.partner_admin:
        raise HTTPException(status_code=403, detail="Only assignee can complete")
    row.status = "completed"
    row.completed_at = datetime.utcnow()
    session.add(row)
    session.commit()
    return {"id": str(row.id), "status": row.status}


class ApprovalCreate(BaseModel):
    kind: str = Field(pattern="^(discount|seal|expense)$")
    title: str = Field(min_length=1, max_length=200)
    amount: Optional[float] = None
    content: Optional[str] = None


@router.get("/approvals")
def list_partner_approvals(
    session: Session = Depends(get_session),
    current: User = Depends(require_permission("partner:ops:manage")),
):
    partner_id = _partner_id_of(current)
    rows = session.exec(
        select(PartnerApproval).where(
            PartnerApproval.partner_id == partner_id,
            PartnerApproval.deleted_at.is_(None),
        ).order_by(PartnerApproval.created_at.desc())
    ).all()
    users = {u.id: u for u in _company_users(session, partner_id)}
    return [
        {
            "id": str(r.id),
            "kind": r.kind,
            "title": r.title,
            "amount": r.amount,
            "content": r.content,
            "status": r.status,
            "applicant_name": users.get(r.applicant_user_id).full_name
            if r.applicant_user_id and users.get(r.applicant_user_id)
            else None,
            "reply_note": r.reply_note,
            "created_at": r.created_at.isoformat(),
        }
        for r in rows
    ]


@router.post("/approvals", status_code=201)
def create_partner_approval(
    req: ApprovalCreate,
    session: Session = Depends(get_session),
    current: User = Depends(require_permission("partner:ops:manage")),
):
    partner_id = _partner_id_of(current)
    row = PartnerApproval(
        partner_id=partner_id,
        kind=req.kind,
        title=req.title.strip(),
        amount=req.amount,
        content=req.content,
        applicant_user_id=current.id,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return {"id": str(row.id)}


@router.post("/approvals/{approval_id}/review")
def review_partner_approval(
    approval_id: uuid.UUID,
    req: ReviewRequest,
    session: Session = Depends(get_session),
    current: User = Depends(require_permission("partner:ops:manage")),
):
    partner_id = _require_admin(current)
    row = session.get(PartnerApproval, approval_id)
    if not row or row.deleted_at or row.partner_id != partner_id:
        raise HTTPException(status_code=404, detail="Approval not found")
    if row.status != "pending":
        raise HTTPException(status_code=400, detail="Only pending approvals can be reviewed")
    row.status = "approved" if req.approved else "rejected"
    row.reviewed_by = current.id
    row.reviewed_at = datetime.utcnow()
    row.reply_note = req.note
    session.add(row)
    _audit(session, partner_id, current, "approval.review", "partner_approval", str(row.id))
    session.commit()
    return {"id": str(row.id), "status": row.status}


# ---------------------------------------------------------------------------
# F2. 素材库
# ---------------------------------------------------------------------------
class MaterialCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    category: str = "other"
    url: str = Field(min_length=1, max_length=1000)
    description: Optional[str] = None


@router.get("/materials")
def list_materials(
    session: Session = Depends(get_session),
    current: User = Depends(require_permission("partner:ops:manage")),
):
    partner_id = _partner_id_of(current)
    rows = session.exec(
        select(PartnerMaterial).where(
            PartnerMaterial.deleted_at.is_(None),
            (PartnerMaterial.partner_id.is_(None))
            | (PartnerMaterial.partner_id == partner_id),
        ).order_by(PartnerMaterial.created_at.desc())
    ).all()
    return [
        {
            "id": str(r.id),
            "title": r.title,
            "category": r.category,
            "url": r.url,
            "description": r.description,
            "scope": "platform" if r.partner_id is None else "company",
        }
        for r in rows
    ]


@router.post("/materials", status_code=201)
def create_material(
    req: MaterialCreate,
    session: Session = Depends(get_session),
    current: User = Depends(require_permission("partner:ops:manage")),
):
    partner_id = _require_admin(current)
    row = PartnerMaterial(
        partner_id=partner_id,
        title=req.title.strip(),
        category=req.category,
        url=req.url.strip(),
        description=req.description,
        uploaded_by=current.id,
    )
    session.add(row)
    _audit(session, partner_id, current, "material.create", "partner_material")
    session.commit()
    session.refresh(row)
    return {"id": str(row.id)}


@router.delete("/materials/{material_id}")
def delete_material(
    material_id: uuid.UUID,
    session: Session = Depends(get_session),
    current: User = Depends(require_permission("partner:ops:manage")),
):
    partner_id = _require_admin(current)
    row = session.get(PartnerMaterial, material_id)
    if not row or row.deleted_at or row.partner_id != partner_id:
        raise HTTPException(status_code=404, detail="Material not found")
    row.deleted_at = datetime.utcnow()
    session.add(row)
    session.commit()
    return {"id": str(row.id), "deleted": True}


# ---------------------------------------------------------------------------
# F3. 审计与开放能力（Webhook）
# ---------------------------------------------------------------------------
@router.get("/audit-logs")
def list_partner_audit_logs(
    page: int = 1,
    page_size: int = 20,
    session: Session = Depends(get_session),
    current: User = Depends(require_permission("partner:ops:manage")),
):
    partner_id = _require_admin(current)
    rows = session.exec(
        select(PartnerAuditLog).where(
            PartnerAuditLog.partner_id == partner_id,
            PartnerAuditLog.deleted_at.is_(None),
        ).order_by(PartnerAuditLog.occurred_at.desc())
    ).all()
    users = {u.id: u for u in _company_users(session, partner_id)}
    page = max(1, page)
    page_size = max(1, min(page_size, 100))
    return {
        "total": len(rows),
        "items": [
            {
                "id": str(r.id),
                "actor_user_id": str(r.actor_user_id) if r.actor_user_id else None,
                "actor_name": users.get(r.actor_user_id).full_name
                if r.actor_user_id and users.get(r.actor_user_id)
                else None,
                "action": r.action,
                "resource_type": r.resource_type,
                "resource_id": r.resource_id,
                "detail": r.detail,
                "occurred_at": r.occurred_at.isoformat(),
            }
            for r in rows[(page - 1) * page_size : page * page_size]
        ],
    }


class WebhookCreate(BaseModel):
    url: str = Field(min_length=1, max_length=1000)
    events: Optional[List[str]] = None


@router.get("/webhooks")
def list_webhooks(
    session: Session = Depends(get_session),
    current: User = Depends(require_permission("partner:ops:manage")),
):
    partner_id = _require_admin(current)
    rows = session.exec(
        select(PartnerWebhook).where(
            PartnerWebhook.partner_id == partner_id,
            PartnerWebhook.deleted_at.is_(None),
        )
    ).all()
    return [
        {
            "id": str(r.id),
            "url": r.url,
            "events": r.events or [],
            "is_active": r.is_active,
            "last_status_code": r.last_status_code,
            "last_delivery_at": r.last_delivery_at.isoformat()
            if r.last_delivery_at
            else None,
        }
        for r in rows
    ]


@router.post("/webhooks", status_code=201)
def create_webhook(
    req: WebhookCreate,
    session: Session = Depends(get_session),
    current: User = Depends(require_permission("partner:ops:manage")),
):
    partner_id = _require_admin(current)
    row = PartnerWebhook(
        partner_id=partner_id,
        url=req.url.strip(),
        secret=uuid.uuid4().hex,
        events=req.events or ["settlement.approved"],
    )
    session.add(row)
    _audit(session, partner_id, current, "webhook.create", "partner_webhook")
    session.commit()
    session.refresh(row)
    # secret 只在创建时返回一次
    return {"id": str(row.id), "secret": row.secret, "events": row.events}


@router.delete("/webhooks/{webhook_id}")
def delete_webhook(
    webhook_id: uuid.UUID,
    session: Session = Depends(get_session),
    current: User = Depends(require_permission("partner:ops:manage")),
):
    partner_id = _require_admin(current)
    row = session.get(PartnerWebhook, webhook_id)
    if not row or row.deleted_at or row.partner_id != partner_id:
        raise HTTPException(status_code=404, detail="Webhook not found")
    row.deleted_at = datetime.utcnow()
    row.is_active = False
    session.add(row)
    session.commit()
    return {"id": str(row.id), "deleted": True}


@router.post("/webhooks/{webhook_id}/test")
def test_webhook(
    webhook_id: uuid.UUID,
    session: Session = Depends(get_session),
    current: User = Depends(require_permission("partner:ops:manage")),
):
    """立即投递一条测试事件（验证签名与连通性）。"""
    from app.services.partner_webhook import deliver_event

    partner_id = _require_admin(current)
    hook = session.get(PartnerWebhook, webhook_id)
    if not hook or hook.deleted_at or hook.partner_id != partner_id:
        raise HTTPException(status_code=404, detail="Webhook not found")
    ev = PartnerWebhookEvent(
        partner_id=partner_id,
        webhook_id=hook.id,
        event="webhook.test",
        payload={"hello": "partner", "at": datetime.utcnow().isoformat()},
    )
    session.add(ev)
    session.commit()
    session.refresh(ev)
    ok = deliver_event(session, ev)
    return {
        "ok": ok,
        "status": ev.status,
        "attempts": ev.attempts,
        "response_code": ev.response_code,
    }


@router.get("/webhooks/events")
def list_webhook_events(
    session: Session = Depends(get_session),
    current: User = Depends(require_permission("partner:ops:manage")),
):
    partner_id = _require_admin(current)
    # 顺带处理到期重试（无需独立调度器；管理员打开事件页即可补投）
    try:
        from app.services.partner_webhook import deliver_pending

        deliver_pending(session, limit=20)
    except Exception:  # pragma: no cover
        session.rollback()
    rows = session.exec(
        select(PartnerWebhookEvent).where(
            PartnerWebhookEvent.partner_id == partner_id,
            PartnerWebhookEvent.deleted_at.is_(None),
        ).order_by(PartnerWebhookEvent.created_at.desc()).limit(200)
    ).all()
    return [
        {
            "id": str(r.id),
            "event": r.event,
            "status": r.status,
            "attempts": r.attempts,
            "response_code": r.response_code,
            "next_retry_at": r.next_retry_at.isoformat() if r.next_retry_at else None,
            "created_at": r.created_at.isoformat(),
        }
        for r in rows
    ]


@router.post("/webhooks/events/{event_id}/retry")
def retry_webhook_event(
    event_id: uuid.UUID,
    session: Session = Depends(get_session),
    current: User = Depends(require_permission("partner:ops:manage")),
):
    from app.services.partner_webhook import deliver_event

    partner_id = _require_admin(current)
    ev = session.get(PartnerWebhookEvent, event_id)
    if not ev or ev.deleted_at or ev.partner_id != partner_id:
        raise HTTPException(status_code=404, detail="Event not found")
    ok = deliver_event(session, ev)
    return {"ok": ok, "status": ev.status, "attempts": ev.attempts}
