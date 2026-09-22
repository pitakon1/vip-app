"""佣金路由：佣金查询与审核。"""
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.db import get_session
from app.core.auth import require_admin, require_employee
from app.core.pagination import Page, PaginationParams, paginate_query
from app.models import CommissionSettlement, Employee, SettlementStatus, User

router = APIRouter(prefix="/commissions", tags=["commissions"])


def _get_employee(session: Session, user: User) -> Employee:
    """根据当前用户获取员工记录。"""
    employee = session.exec(
        select(Employee).where(
            Employee.user_id == user.id,
            Employee.deleted_at.is_(None),
        )
    ).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee profile not found")
    return employee


@router.get("/me", response_model=Page[CommissionSettlement])
def my_commissions(
    pagination: PaginationParams = Depends(),
    status: SettlementStatus | None = None,
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """我的佣金列表。"""
    employee = _get_employee(session, user)
    conditions = [
        CommissionSettlement.employee_id == employee.id,
        CommissionSettlement.deleted_at.is_(None),
    ]
    if status:
        conditions.append(CommissionSettlement.status == status)

    stmt = (
        select(CommissionSettlement)
        .where(*conditions)
        .order_by(CommissionSettlement.created_at.desc())
    )
    return paginate_query(session, stmt, pagination)


@router.get("", response_model=Page[CommissionSettlement])
def list_commissions(
    pagination: PaginationParams = Depends(),
    status: SettlementStatus | None = None,
    employee_id: uuid.UUID | None = None,
    session: Session = Depends(get_session),
    user: User = Depends(require_admin),
):
    """全部佣金列表（admin 权限）。

    三端暂无调用方（见 tests/tools_contract_check.py --orphans）：管理端佣金结算页
    未做；员工侧看自己的走 /commissions/me。
    """
    conditions = [CommissionSettlement.deleted_at.is_(None)]
    if status:
        conditions.append(CommissionSettlement.status == status)
    if employee_id:
        conditions.append(CommissionSettlement.employee_id == employee_id)

    stmt = (
        select(CommissionSettlement)
        .where(*conditions)
        .order_by(CommissionSettlement.created_at.desc())
    )
    return paginate_query(session, stmt, pagination)


@router.post("/{commission_id}/approve")
def approve_commission(
    commission_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(require_admin),
):
    """审核佣金（admin 权限）。

    三端暂无调用方（见 tests/tools_contract_check.py --orphans）：与列表接口同因，
    管理端审批入口未做。注意这是**分佣资金闭环的关键节点**，接管理端时要优先接。
    """
    commission = session.get(CommissionSettlement, commission_id)
    if not commission or commission.deleted_at:
        raise HTTPException(status_code=404, detail="Commission not found")
    if commission.status != SettlementStatus.pending:
        raise HTTPException(
            status_code=400,
            detail="Only pending commissions can be approved",
        )

    commission.status = SettlementStatus.approved
    commission.settled_at = datetime.utcnow()
    session.add(commission)
    session.commit()
    session.refresh(commission)
    return commission
