"""报修工单路由：维修工单管理。"""
import uuid
from datetime import datetime
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlmodel import Session, select

from app.db import get_session
from app.core.auth import get_current_user, require_agent
from app.core.events import publish_event
from app.core.pagination import PaginationParams, paginate
from app.models import (
    MaintenanceTicket,
    TicketPriority,
    TicketStatus,
    User,
)

router = APIRouter(prefix="/maintenance-tickets", tags=["maintenance"])


class MaintenanceTicketCreate(BaseModel):
    property_id: uuid.UUID
    tenant_id: uuid.UUID
    lease_id: Optional[uuid.UUID] = None
    title: str
    description: str
    photos: Optional[List[Any]] = None
    priority: TicketPriority = TicketPriority.medium


class MaintenanceTicketUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    photos: Optional[List[Any]] = None
    priority: Optional[TicketPriority] = None
    status: Optional[TicketStatus] = None
    assigned_to: Optional[uuid.UUID] = None
    resolved_at: Optional[datetime] = None
    resolution_notes: Optional[str] = None
    resolution_photos: Optional[List[Any]] = None
    cost: Optional[float] = None


@router.get("")
def list_maintenance_tickets(
    pagination: PaginationParams = Depends(),
    status: Optional[TicketStatus] = None,
    priority: Optional[TicketPriority] = None,
    property_id: Optional[uuid.UUID] = None,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """报修工单列表。"""
    conditions = [MaintenanceTicket.deleted_at.is_(None)]
    if status:
        conditions.append(MaintenanceTicket.status == status)
    if priority:
        conditions.append(MaintenanceTicket.priority == priority)
    if property_id:
        conditions.append(MaintenanceTicket.property_id == property_id)

    stmt = select(MaintenanceTicket).where(*conditions).order_by(
        MaintenanceTicket.created_at.desc()
    )
    count_stmt = select(func.count(MaintenanceTicket.id)).where(*conditions)
    total = session.exec(count_stmt).one()
    items = session.exec(
        stmt.offset(pagination.offset).limit(pagination.limit)
    ).all()
    return paginate(items, total, pagination)


@router.post("")
def create_maintenance_ticket(
    req: MaintenanceTicketCreate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """创建报修工单，发布 maintenance_ticket.created 事件。"""
    ticket = MaintenanceTicket(**req.model_dump())
    session.add(ticket)
    publish_event(
        session,
        "maintenance_ticket.created",
        "maintenance_ticket",
        ticket.id,
        {
            "property_id": str(ticket.property_id),
            "tenant_id": str(ticket.tenant_id),
            "title": ticket.title,
            "priority": ticket.priority.value,
            "created_by": str(user.id),
        },
    )
    session.commit()
    session.refresh(ticket)
    return ticket


@router.get("/{ticket_id}")
def get_maintenance_ticket(
    ticket_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """获取报修工单详情。"""
    ticket = session.get(MaintenanceTicket, ticket_id)
    if not ticket or ticket.deleted_at:
        raise HTTPException(status_code=404, detail="Maintenance ticket not found")
    return ticket


@router.patch("/{ticket_id}")
def update_maintenance_ticket(
    ticket_id: uuid.UUID,
    req: MaintenanceTicketUpdate,
    session: Session = Depends(get_session),
    user: User = Depends(require_agent),
):
    """更新报修工单（含状态变更）。"""
    ticket = session.get(MaintenanceTicket, ticket_id)
    if not ticket or ticket.deleted_at:
        raise HTTPException(status_code=404, detail="Maintenance ticket not found")

    update_data = req.model_dump(exclude_unset=True)
    # 状态变为 resolved 时自动记录解决时间
    if update_data.get("status") in (TicketStatus.resolved, TicketStatus.closed):
        if not update_data.get("resolved_at") and not ticket.resolved_at:
            update_data["resolved_at"] = datetime.utcnow()

    for key, value in update_data.items():
        setattr(ticket, key, value)
    session.add(ticket)
    session.commit()
    session.refresh(ticket)
    return ticket
