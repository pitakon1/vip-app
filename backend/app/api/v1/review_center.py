"""工单审核中心 API（管理员统一汇聚待办：外勤/报修/服务订单/合同）。

审核动作复用各业务既有端点（外勤 approve、报修 PATCH、服务订单 PATCH、合同流转），
本模块只做聚合查询，便于管理端"待办审核中心"一屏查看。
"""
from fastapi import APIRouter, Depends
from sqlmodel import Session, select, desc

from app.db import get_session
from app.core.rbac import require_permission
from app.models import (
    Contract,
    ContractStatus,
    Employee,
    ExternalTripApplication,
    MaintenanceTicket,
    Property,
    ServiceOrder,
    ServiceOrderStatus,
    TicketStatus,
    TripStatus,
    User,
)

router = APIRouter(prefix="/review-center", tags=["review-center"])

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


@router.get("/todos")
def review_todos(
    session: Session = Depends(get_session),
    user: User = Depends(
        require_permission(
            "review:trip",
            "review:maintenance",
            "review:service",
            "review:contract",
        )
    ),
):
    """聚合待办审核列表。"""
    trips = session.exec(
        select(ExternalTripApplication)
        .where(ExternalTripApplication.status.in_(_TRIP_PENDING))
        .order_by(desc(ExternalTripApplication.created_at))
        .limit(30)
    ).all()
    tickets = session.exec(
        select(MaintenanceTicket)
        .where(MaintenanceTicket.status.in_(_TICKET_PENDING))
        .order_by(desc(MaintenanceTicket.created_at))
        .limit(30)
    ).all()
    orders = session.exec(
        select(ServiceOrder)
        .where(ServiceOrder.status.in_(_ORDER_PENDING))
        .order_by(desc(ServiceOrder.created_at))
        .limit(30)
    ).all()
    contracts = session.exec(
        select(Contract)
        .where(Contract.status.in_(_CONTRACT_PENDING))
        .order_by(desc(Contract.created_at))
        .limit(30)
    ).all()

    # 申请人/房源显示名缓存
    employees = {
        e.id: e
        for e in session.exec(
            select(Employee).where(
                Employee.id.in_([t.employee_id for t in trips]) if trips else Employee.id.is_not(None)
            )
        ).all()
    }
    users = {u.id: u for u in session.exec(select(User)).all()}
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
                "title": f"报修工单 · {prop.title if prop else '房源'}",
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
                "title": f"服务订单 · {prop.title if prop else '物业'}",
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
                "title": f"合同 · {c.title or c.contract_id}",
                "applicant": "-",
                "reason": f"状态需流转：{c.status.value}",
                "status": c.status.value,
                "created_at": c.created_at.isoformat() if c.created_at else None,
            }
        )

    items.sort(key=lambda x: x["created_at"] or "", reverse=True)
    summary = {
        "trip": len(trips),
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
            "maintenance": "PATCH /api/v1/maintenance/{id}",
            "service": "PATCH /api/v1/service-orders/{id}",
            "contract": "PATCH /api/v1/contracts/{id}",
        },
    }