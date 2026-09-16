"""员工路由：员工列表、个人信息、业绩与排行榜。

业绩口径统一由系统按佣金结算（CommissionSettlement）自动核算，
不再读取手动填报的 performances 表。
"""
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.db import get_session
from app.core.auth import require_admin, require_employee
from app.core.pagination import PaginationParams, paginate_query
from app.models import (
    CommissionSettlement,
    Employee,
    Lease,
    LeaseStatus,
    MaintenanceTicket,
    Payment,
    PaymentStatus,
    PaymentType,
    Property,
    TicketStatus,
    User,
)

router = APIRouter(prefix="/employees", tags=["employees"])


@router.get("")
def list_employees(
    pagination: PaginationParams = Depends(),
    department: str | None = None,
    session: Session = Depends(get_session),
    user: User = Depends(require_admin),
):
    """员工列表（admin 权限，附带用户姓名/邮箱）。"""
    conditions = [Employee.deleted_at.is_(None)]
    if department:
        conditions.append(Employee.department == department)

    stmt = select(Employee).where(*conditions).order_by(Employee.created_at.desc())
    page = paginate_query(session, stmt, pagination)
    users = {u.id: u for u in session.exec(select(User)).all()}
    enriched = [
        {
            **e.model_dump(),
            "full_name": users.get(e.user_id).full_name if users.get(e.user_id) else None,
            "email": users.get(e.user_id).email if users.get(e.user_id) else None,
            "employee_no": e.employee_code,
            "status": "active" if e.is_active else "inactive",
        }
        for e in page.items
    ]
    page.items = enriched
    return page


@router.get("/directory")
def employee_directory(
    keyword: str | None = None,
    department: str | None = None,
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """同事通讯录（全体员工可见）。

    只返回协作所需的联系方式，不含佣金/薪资/上下级等敏感字段；
    前端「同事通讯录」页据此渲染，无需再准备静态示例数据。
    """
    conditions = [Employee.deleted_at.is_(None), Employee.is_active.is_(True)]
    if department:
        conditions.append(Employee.department == department)

    employees = session.exec(
        select(Employee).where(*conditions).order_by(Employee.employee_code)
    ).all()
    users = (
        {
            u.id: u
            for u in session.exec(
                select(User).where(User.id.in_([e.user_id for e in employees]))
            ).all()
        }
        if employees
        else {}
    )

    items = []
    for e in employees:
        owner = users.get(e.user_id)
        if not owner:
            continue
        items.append(
            {
                "id": str(e.id),
                "employee_no": e.employee_code,
                "full_name": owner.full_name,
                "email": owner.email,
                "position": e.position,
                "department": e.department,
                "phone": e.phone,
                "wechat": e.wechat_id,
                "line": e.line_id,
            }
        )

    if keyword:
        kw = keyword.strip().lower()
        items = [
            i
            for i in items
            if kw
            in " ".join(
                str(i.get(k) or "")
                for k in ("full_name", "position", "department", "phone", "employee_no")
            ).lower()
        ]

    return {
        "items": items,
        "total": len(items),
        # 部门下拉直接用真实数据，避免前端硬编码部门清单
        "departments": sorted({i["department"] for i in items if i["department"]}),
    }


@router.get("/me")
def get_my_employee_info(
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """当前员工信息。"""
    employee = session.exec(
        select(Employee).where(
            Employee.user_id == user.id,
            Employee.deleted_at.is_(None),
        )
    ).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee profile not found")
    return employee


@router.get("/leaderboard")
def get_leaderboard(
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """员工业绩排行榜（系统按佣金结算自动核算，按累计佣金降序）。"""
    settlements = session.exec(
        select(CommissionSettlement).where(
            CommissionSettlement.deleted_at.is_(None)
        )
    ).all()

    employees = {e.id: e for e in session.exec(select(Employee)).all()}
    users = {u.id: u for u in session.exec(select(User)).all()}
    me = session.exec(
        select(Employee).where(Employee.user_id == user.id)
    ).first()

    leaderboard: dict = {}
    for s in settlements:
        key = str(s.employee_id)
        if key not in leaderboard:
            emp = employees.get(s.employee_id)
            usr = users.get(emp.user_id) if emp else None
            leaderboard[key] = {
                "id": key,
                "full_name": usr.full_name if usr else None,
                "department": emp.department if emp else None,
                "position": emp.position if emp else None,
                "performance": 0.0,
                "deals": 0,
                "is_self": bool(me and s.employee_id == me.id),
            }
        leaderboard[key]["performance"] += s.commission_amount or 0
        leaderboard[key]["deals"] += 1

    result = sorted(
        leaderboard.values(),
        key=lambda x: x["performance"],
        reverse=True,
    )
    return result[:20]


@router.get("/{employee_id}/performance")
def get_employee_performance(
    employee_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """员工业绩明细（系统按佣金结算自动核算，按时间倒序）。"""
    rows = session.exec(
        select(CommissionSettlement)
        .where(
            CommissionSettlement.employee_id == employee_id,
            CommissionSettlement.deleted_at.is_(None),
        )
        .order_by(CommissionSettlement.created_at.desc())
    ).all()
    return [
        {
            "id": str(r.id),
            "lease_id": str(r.lease_id) if r.lease_id else None,
            "deal_type": r.deal_type.value if r.deal_type else None,
            "commission_base": r.commission_base,
            "commission_rate": r.commission_rate,
            "commission_amount": r.commission_amount,
            "currency": r.currency,
            "status": r.status.value if r.status else None,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "settled_at": r.settled_at.isoformat() if r.settled_at else None,
        }
        for r in rows
    ]


@router.get("/workbench")
def get_employee_workbench(
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """员工工作台聚合：负责租约、待收/逾期租金单，支撑待办与催收。

    端点放在 /employees/workbench 之前，需先于 /{employee_id}/performance
    这类带路径参数的路由注册，避免被误匹配为 employee_id。
    """
    employee = session.exec(
        select(Employee).where(
            Employee.user_id == user.id,
            Employee.deleted_at.is_(None),
        )
    ).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee profile not found")

    leases = session.exec(
        select(Lease).where(
            Lease.agent_id == employee.id,
            Lease.status == LeaseStatus.active,
            Lease.deleted_at.is_(None),
        )
    ).all()
    lease_ids = [lease.id for lease in leases]

    # 房源标题一次性取齐
    prop_ids = {lease.property_id for lease in leases if lease.property_id}
    properties = {
        p.id: p for p in session.exec(select(Property).where(Property.id.in_(prop_ids))).all()
    } if prop_ids else {}

    now = datetime.utcnow()
    follow_up_leases = [
        {
            "lease_id": str(lease.id),
            "property_title": properties.get(lease.property_id).display_name
            if properties.get(lease.property_id)
            else None,
            "monthly_rent": lease.monthly_rent,
            "currency": lease.currency or "THB",
            "end_date": lease.end_date.isoformat() if lease.end_date else None,
            "days_to_expire": (lease.end_date.date() - now.date()).days
            if lease.end_date
            else None,
        }
        for lease in leases
    ]

    receivables = []
    if lease_ids:
        receivables = session.exec(
            select(Payment).where(
                Payment.lease_id.in_(lease_ids),
                Payment.payment_type == PaymentType.rent,
                Payment.status == PaymentStatus.pending,
            )
        ).all()

    receivable_items = [
        {
            "payment_id": str(p.id),
            "amount": p.amount,
            "currency": p.currency or "THB",
            "due_date": p.due_date.isoformat() if p.due_date else None,
            "is_overdue": bool(p.due_date and p.due_date < now),
            "status": p.status.value if p.status else None,
        }
        for p in receivables
    ]

    pending = [r for r in receivable_items if not r["is_overdue"]]
    overdue = [r for r in receivable_items if r["is_overdue"]]

    # 维修工单响应时效：本员工名下待办工单数与平均解决时长（小时）
    assigned_tickets = []
    total_resolve_seconds = 0
    resolved_count = 0
    if employee.id:
        assigned_tickets = session.exec(
            select(MaintenanceTicket).where(
                MaintenanceTicket.assigned_to == employee.id,
                MaintenanceTicket.deleted_at.is_(None),
            )
        ).all()
    open_tickets = [
        t for t in assigned_tickets if t.status not in (TicketStatus.resolved, TicketStatus.closed)
    ]
    for t in assigned_tickets:
        if t.resolved_at and t.created_at:
            elapsed = (t.resolved_at - t.created_at).total_seconds()
            total_resolve_seconds += max(0, elapsed)
            resolved_count += 1
    avg_resolve_hours = (
        round(total_resolve_seconds / 3600 / resolved_count, 1) if resolved_count else 0
    )

    return {
        "summary": {
            "lease_count": len(leases),
            "pending_receivable": len(pending),
            "overdue_receivable": len(overdue),
            "open_maintenance": len(open_tickets),
            "avg_resolve_hours": avg_resolve_hours,
        },
        "follow_up_leases": follow_up_leases,
        "receivables": {
            "pending": pending,
            "overdue": overdue,
        },
    }
