"""工单审核中心 API（管理员统一汇聚待办：外勤/请假/报修/服务订单/合同）。

审核动作复用各业务既有端点（外勤 approve、请假 approve、报修 PATCH、服务订单 PATCH、
合同流转），本模块只做聚合查询，便于管理端"待办审核中心"一屏查看。
"""
from typing import List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import false, or_
from sqlmodel import Session, select, desc

from app.core.auth import property_visibility_conditions
from app.db import get_session
from app.core.rbac import require_permission
from app.models import (
    Contract,
    ContractStatus,
    Employee,
    ExternalTripApplication,
    LeaveRequest,
    LeaveStatus,
    Lease,
    MaintenanceTicket,
    Property,
    ServiceOrder,
    ServiceOrderStatus,
    TicketStatus,
    TripStatus,
    User,
    UserRole,
)
from app.services.data_scope import (
    staff_employee_ids_in_scope,
    staff_user_ids_in_scope,
)

router = APIRouter(prefix="/review-center", tags=["review-center"])


class ReviewTodoItemOut(BaseModel):
    """聚合待办审核条目。"""

    model_config = ConfigDict(extra="allow")

    type: Optional[str] = None
    id: Optional[str] = None
    title: Optional[str] = None
    applicant: Optional[str] = None
    reason: Optional[str] = None
    status: Optional[str] = None
    created_at: Optional[str] = None


class ReviewTodoListOut(BaseModel):
    """聚合待办审核列表。"""

    model_config = ConfigDict(extra="allow")

    summary: Optional[dict] = None
    total: Optional[int] = None
    items: List[ReviewTodoItemOut] = Field(default_factory=list)
    review_endpoints: Optional[dict] = None

# 各业务"待审核"状态
_TRIP_PENDING = [TripStatus.pending]
_TICKET_PENDING = [
    TicketStatus.open,
    TicketStatus.assigned,
    TicketStatus.in_progress,
]
_ORDER_PENDING = [
    ServiceOrderStatus.pending,
    ServiceOrderStatus.assigned,
]
_CONTRACT_PENDING = [
    ContractStatus.draft,
    ContractStatus.sent,
    ContractStatus.partially_signed,
]
_LEAVE_PENDING = [LeaveStatus.pending]


def _scoped_user_ids(session: Session, user: User) -> Optional[set]:
    """当前审核人可见的 `users.id` 集合；None 表示全平台（admin / scope=all）。

    合作方管理员按 `partner_id` 收窄到本司成员，其余角色走 data-scope。
    此前审核中心五类查询完全不带归属条件，agent 可看到全平台合同/工单/外勤/请假。
    """
    if user.role == UserRole.partner_admin and user.partner_id:
        return set(
            session.exec(
                select(User.id).where(
                    User.partner_id == user.partner_id, User.deleted_at.is_(None)
                )
            ).all()
        )
    return staff_user_ids_in_scope(session, user)


@router.get("/todos", response_model=ReviewTodoListOut)
def review_todos(
    session: Session = Depends(get_session),
    user: User = Depends(
        require_permission(
            "review:trip",
            "review:leave",
            "review:maintenance",
            "review:service",
            "review:contract",
        )
    ),
):
    """聚合待办审核列表（按当前审核人的数据范围收窄）。"""
    user_ids = _scoped_user_ids(session, user)
    emp_ids = staff_employee_ids_in_scope(session, user)
    prop_conds = property_visibility_conditions(session, user)

    trip_query = select(ExternalTripApplication).where(
        ExternalTripApplication.deleted_at.is_(None),
        ExternalTripApplication.status.in_(_TRIP_PENDING),
    )
    ticket_query = select(MaintenanceTicket).where(
        MaintenanceTicket.deleted_at.is_(None),
        MaintenanceTicket.status.in_(_TICKET_PENDING),
    )
    order_query = select(ServiceOrder).where(
        ServiceOrder.deleted_at.is_(None),
        ServiceOrder.status.in_(_ORDER_PENDING),
    )
    contract_query = select(Contract).where(
        Contract.deleted_at.is_(None),
        Contract.status.in_(_CONTRACT_PENDING),
    )
    leave_query = select(LeaveRequest).where(
        LeaveRequest.deleted_at.is_(None),
        LeaveRequest.status.in_(_LEAVE_PENDING),
    )

    # 外勤 / 请假：按员工档案归属（本人 / 同部门 / 全量）
    if emp_ids is not None:
        emp_cond = (
            ExternalTripApplication.employee_id.in_(emp_ids)
            if emp_ids
            else false()
        )
        trip_query = trip_query.where(emp_cond)
        leave_cond = LeaveRequest.employee_id.in_(emp_ids) if emp_ids else false()
        leave_query = leave_query.where(leave_cond)

    # 报修 / 服务订单：按房源可见性（录入人 / 本人业主 / 合作方成员）
    if prop_conds:
        visible_props = select(Property.id).where(*prop_conds)
        ticket_query = ticket_query.where(
            MaintenanceTicket.property_id.in_(visible_props)
        )
        order_query = order_query.where(ServiceOrder.property_id.in_(visible_props))

    # 合同：按创建人，或所属租约的经纪人（admin / scope=all 不加条件）
    if user_ids is not None:
        conds = [
            Contract.created_by.in_(user_ids) if user_ids else false(),
        ]
        if emp_ids is not None:
            conds.append(
                Contract.lease_id.in_(
                    select(Lease.id).where(Lease.agent_id.in_(emp_ids))
                )
                if emp_ids
                else false()
            )
        contract_query = contract_query.where(or_(*conds))

    trips = session.exec(
        trip_query.order_by(desc(ExternalTripApplication.created_at)).limit(30)
    ).all()
    tickets = session.exec(
        ticket_query.order_by(desc(MaintenanceTicket.created_at)).limit(30)
    ).all()
    orders = session.exec(
        order_query.order_by(desc(ServiceOrder.created_at)).limit(30)
    ).all()
    contracts = session.exec(
        contract_query.order_by(desc(Contract.created_at)).limit(30)
    ).all()
    leaves = session.exec(
        leave_query.order_by(desc(LeaveRequest.created_at)).limit(30)
    ).all()

    # 申请人/房源显示名缓存
    trip_emp_ids = [t.employee_id for t in trips] + [l.employee_id for l in leaves]
    employees = {
        e.id: e
        for e in session.exec(
            select(Employee).where(
                Employee.id.in_(trip_emp_ids) if trip_emp_ids else Employee.id.is_(None)
            )
        ).all()
    }
    # 只查列表实际会用到 user 的 id：外勤/请假的申请人 + 服务订单的下单人
    used_user_ids = {
        emp.user_id
        for t in trips
        if (emp := employees.get(t.employee_id)) and emp.user_id
    }
    used_user_ids.update(
        emp.user_id
        for l in leaves
        if (emp := employees.get(l.employee_id)) and emp.user_id
    )
    used_user_ids.update(o.orderer_id for o in orders if o.orderer_id)
    users = {
        u.id: u
        for u in session.exec(
            select(User).where(
                User.id.in_(used_user_ids) if used_user_ids else User.id.is_(None)
            )
        ).all()
    }
    properties = {
        p.id: p
        for p in session.exec(
            select(Property).where(
                Property.id.in_(
                    [t.property_id for t in tickets if t.property_id]
                    + [o.property_id for o in orders if o.property_id]
                )
            )
        ).all()
    }

    items: list[dict] = []

    for t in trips:
        emp = employees.get(t.employee_id)
        applicant = users.get(emp.user_id).full_name if emp and emp.user_id in users else "员工"
        items.append(
            {
                "type": "trip",
                "id": str(t.id),
                "title": f"外勤申请 · {t.trip_date} · {t.to_location or '外出'}",
                "applicant": applicant,
                "reason": t.reason,
                "status": t.status.value,
                "created_at": t.created_at.isoformat() if t.created_at else None,
            }
        )

    for tk in tickets:
        prop = properties.get(tk.property_id) if tk.property_id else None
        items.append(
            {
                "type": "maintenance",
                "id": str(tk.id),
                "title": f"报修工单 · {prop.display_name if prop else '房源'}",
                "applicant": "租客",
                "reason": tk.description or tk.title or "维修",
                "status": tk.status.value,
                "created_at": tk.created_at.isoformat() if tk.created_at else None,
            }
        )

    for o in orders:
        prop = properties.get(o.property_id) if o.property_id else None
        orderer = users.get(o.orderer_id) if o.orderer_id else None
        items.append(
            {
                "type": "service",
                "id": str(o.id),
                "title": f"服务订单 · {prop.display_name if prop else '物业'}",
                "applicant": orderer.full_name if orderer else o.orderer_type or "租客",
                "reason": o.service_type.value if hasattr(o.service_type, "value") else str(o.service_type),
                "status": o.status.value,
                "created_at": o.created_at.isoformat() if o.created_at else None,
            }
        )

    for c in contracts:
        items.append(
            {
                "type": "contract",
                "id": str(c.id),
                "title": f"合同 · {c.title or c.kind.value}",
                "applicant": "-",
                "reason": f"状态需流转：{c.status.value}",
                "status": c.status.value,
                "created_at": c.created_at.isoformat() if c.created_at else None,
            }
        )

    for leave in leaves:
        emp = employees.get(leave.employee_id)
        applicant = users.get(emp.user_id).full_name if emp and emp.user_id in users else "员工"
        items.append(
            {
                "type": "leave",
                "id": str(leave.id),
                "title": (
                    f"请假申请 · {leave.leave_type.value} · "
                    f"{leave.start_date.isoformat()} ~ {leave.end_date.isoformat()} · "
                    f"{leave.days} 天"
                ),
                "applicant": applicant,
                "reason": leave.reason,
                "status": leave.status.value,
                "created_at": leave.created_at.isoformat() if leave.created_at else None,
            }
        )

    items.sort(key=lambda x: x["created_at"] or "", reverse=True)
    summary = {
        "trip": len(trips),
        "leave": len(leaves),
        "maintenance": len(tickets),
        "service": len(orders),
        "contract": len(contracts),
    }
    return {
        "summary": summary,
        "total": len(items),
        "items": items,
        "review_endpoints": {
            "trip": "POST /api/v1/attendance/external-trips/{id}/approve",
            "leave": "POST /api/v1/attendance/leave-requests/{id}/approve",
            "maintenance": "PATCH /api/v1/maintenance-tickets/{id}",
            "service": "PATCH /api/v1/service-orders/{id}/status",
            "contract": "PATCH /api/v1/contracts/{id}",
        },
    }