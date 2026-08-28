"""员工路由：员工列表、个人信息、业绩与排行榜。

业绩口径统一由系统按佣金结算（CommissionSettlement）自动核算，
不再读取手动填报的 performances 表。
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlmodel import Session, select

from app.db import get_session
from app.core.auth import get_current_user, require_admin, require_employee
from app.core.pagination import PaginationParams, paginate
from app.models import CommissionSettlement, Employee, User

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
    count_stmt = select(func.count(Employee.id)).where(*conditions)
    total = session.exec(count_stmt).one()
    items = session.exec(
        stmt.offset(pagination.offset).limit(pagination.limit)
    ).all()
    users = {u.id: u for u in session.exec(select(User)).all()}
    enriched = [
        {
            **e.model_dump(),
            "full_name": users.get(e.user_id).full_name if users.get(e.user_id) else None,
            "email": users.get(e.user_id).email if users.get(e.user_id) else None,
            "employee_no": e.employee_code,
            "status": "active" if e.is_active else "inactive",
        }
        for e in items
    ]
    return paginate(enriched, total, pagination)


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
