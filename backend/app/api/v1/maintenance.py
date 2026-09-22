"""报修工单路由：维修工单管理。"""
import uuid
from datetime import datetime
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlmodel import Session, select

from app.db import get_session
from app.core.auth import get_current_user, require_agent
from app.core.events import publish_event
from app.core.pagination import Page, PaginationParams, paginate, paginate_query
from app.models import (
    Conversation,
    Employee,
    MaintenanceTicket,
    Owner,
    Property,
    Tenant,
    TicketPriority,
    TicketStatus,
    User,
    UserRole,
)
from app.schemas.chat import ConversationOut
from app.services.chat_participants import participant_ids, sync_participants

router = APIRouter(prefix="/maintenance-tickets", tags=["maintenance"])

# 允许租客/业主自助撤销的工单状态：已开工及之后的状态只能由员工侧走 PATCH 收口
CANCELLABLE_STATUSES = (TicketStatus.open, TicketStatus.assigned)


class MaintenanceTicketRate(BaseModel):
    rating: int = Field(ge=1, le=5)
    feedback: Optional[str] = None


class MaintenanceTicketOut(BaseModel):
    """工单对外结构 = 工单本体 + 房源/维修方展示名。

    此前列表只返回工单本体，客户端拿不到房源与受理人信息，只能用「当前租约房源」
    「待分配」这类兜底填充，出现「已派单却显示待分配」「维修地址不是本单房源」
    的错误展示。这里把展示所需字段一并算好返回，客户端不再需要猜。
    """

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    created_at: datetime
    updated_at: datetime
    property_id: uuid.UUID
    tenant_id: Optional[uuid.UUID] = None
    owner_id: Optional[uuid.UUID] = None
    lease_id: Optional[uuid.UUID] = None
    title: str
    description: str
    photos: Optional[List[Any]] = None
    priority: TicketPriority
    status: TicketStatus
    assigned_to: Optional[uuid.UUID] = None
    resolved_at: Optional[datetime] = None
    resolution_notes: Optional[str] = None
    resolution_photos: Optional[List[Any]] = None
    cost: float = 0
    rating: Optional[int] = None
    feedback: Optional[str] = None
    rated_at: Optional[datetime] = None
    # 展示补充：房源地址 / 「楼栋 房号」标签 / 受理维修师傅姓名
    property_address: Optional[str] = None
    property_label: Optional[str] = None
    assignee_name: Optional[str] = None


def _profile_of(session: Session, user: User) -> Optional[uuid.UUID]:
    """当前用户对应的租客/业主档案 id（非该角色或无档案返回 None）。"""
    if user.role == UserRole.tenant:
        row = session.exec(
            select(Tenant).where(
                Tenant.user_id == user.id, Tenant.deleted_at.is_(None)
            )
        ).first()
        return row.id if row else None
    if user.role == UserRole.owner:
        row = session.exec(
            select(Owner).where(Owner.user_id == user.id, Owner.deleted_at.is_(None))
        ).first()
        return row.id if row else None
    return None


def _is_ticket_owner(session: Session, user: User, ticket: MaintenanceTicket) -> bool:
    """是否为该工单的提交人（租客看 tenant_id，业主看 owner_id，管理员全放行）。"""
    if user.role == UserRole.admin:
        return True
    profile_id = _profile_of(session, user)
    if profile_id is None:
        return False
    if user.role == UserRole.tenant:
        return ticket.tenant_id == profile_id
    if user.role == UserRole.owner:
        return ticket.owner_id == profile_id
    return False


def _with_display_fields(
    session: Session, tickets: List[MaintenanceTicket]
) -> List[MaintenanceTicketOut]:
    """批量补齐房源与受理人展示字段（固定 2-3 次查询，不做逐行 N+1）。"""
    property_ids = {t.property_id for t in tickets if t.property_id}
    props = {}
    if property_ids:
        props = {
            p.id: p
            for p in session.exec(
                select(Property).where(Property.id.in_(property_ids))
            ).all()
        }

    assignee_ids = {t.assigned_to for t in tickets if t.assigned_to}
    employee_user_ids: dict = {}
    users: dict = {}
    if assignee_ids:
        employees = session.exec(
            select(Employee).where(Employee.id.in_(assignee_ids))
        ).all()
        employee_user_ids = {e.id: e.user_id for e in employees if e.user_id}
        if employee_user_ids:
            users = {
                u.id: u
                for u in session.exec(
                    select(User).where(
                        User.id.in_(set(employee_user_ids.values()))
                    )
                ).all()
            }

    result: List[MaintenanceTicketOut] = []
    for ticket in tickets:
        item = MaintenanceTicketOut.model_validate(ticket)
        prop = props.get(ticket.property_id)
        if prop:
            item.property_address = prop.address
            parts = [v for v in (prop.building, prop.room_number) if v]
            item.property_label = " ".join(parts) or prop.address
        worker_user = users.get(employee_user_ids.get(ticket.assigned_to))
        if worker_user and worker_user.full_name:
            item.assignee_name = worker_user.full_name
        result.append(item)
    return result


class MaintenanceTicketCreate(BaseModel):
    property_id: uuid.UUID
    # 提交方二选一：租客或业主（都不传时按房源归属自动补业主）
    tenant_id: Optional[uuid.UUID] = None
    owner_id: Optional[uuid.UUID] = None
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


@router.get("", response_model=Page[MaintenanceTicketOut])
def list_maintenance_tickets(
    pagination: PaginationParams = Depends(),
    status: Optional[TicketStatus] = None,
    priority: Optional[TicketPriority] = None,
    property_id: Optional[uuid.UUID] = None,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """报修工单列表。租客仅见自己的工单；业主仅见自己房源的工单。"""
    conditions = [MaintenanceTicket.deleted_at.is_(None)]
    if user.role == UserRole.tenant:
        tenant = session.exec(
            select(Tenant).where(
                Tenant.user_id == user.id,
                Tenant.deleted_at.is_(None),
            )
        ).first()
        if not tenant:
            return paginate([], 0, pagination)
        conditions.append(MaintenanceTicket.tenant_id == tenant.id)
    elif user.role == UserRole.owner:
        owner = session.exec(
            select(Owner).where(
                Owner.user_id == user.id,
                Owner.deleted_at.is_(None),
            )
        ).first()
        if not owner:
            return paginate([], 0, pagination)
        conditions.append(MaintenanceTicket.owner_id == owner.id)
    if status:
        conditions.append(MaintenanceTicket.status == status)
    if priority:
        conditions.append(MaintenanceTicket.priority == priority)
    if property_id:
        conditions.append(MaintenanceTicket.property_id == property_id)

    stmt = select(MaintenanceTicket).where(*conditions).order_by(
        MaintenanceTicket.created_at.desc()
    )
    page = paginate_query(session, stmt, pagination)
    return Page[MaintenanceTicketOut](
        items=_with_display_fields(session, page.items),
        total=page.total,
        page=page.page,
        page_size=page.page_size,
        total_pages=page.total_pages,
    )


@router.post("")
def create_maintenance_ticket(
    req: MaintenanceTicketCreate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """创建报修工单，发布 maintenance_ticket.created 事件。

    - 租客或业主均可提交：tenant_id / owner_id 至少提供其一；
    - owner_id 缺省时按房源归属自动补充，业主端可见自己房源的工单；
    - 租客/业主提交时强制绑定本人档案，防止越权替他人挂单。
    """
    data = req.model_dump(exclude_unset=True)
    prop = session.get(Property, req.property_id)
    if not prop or prop.deleted_at:
        raise HTTPException(status_code=404, detail="Property not found")
    if user.role == UserRole.tenant:
        tenant = session.exec(
            select(Tenant).where(
                Tenant.user_id == user.id,
                Tenant.deleted_at.is_(None),
            )
        ).first()
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant profile not found")
        data["tenant_id"] = tenant.id
    elif user.role == UserRole.owner:
        owner = session.exec(
            select(Owner).where(
                Owner.user_id == user.id,
                Owner.deleted_at.is_(None),
            )
        ).first()
        if not owner:
            raise HTTPException(status_code=404, detail="Owner profile not found")
        data["owner_id"] = owner.id
        data.pop("tenant_id", None)
    if not data.get("owner_id"):
        if prop.owner_id:
            data["owner_id"] = prop.owner_id
    if not data.get("tenant_id") and not data.get("owner_id"):
        raise HTTPException(
            status_code=400,
            detail="工单需指定提交方：租客或业主至少其一",
        )
    ticket = MaintenanceTicket(**data)
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


@router.get("/{ticket_id}", response_model=MaintenanceTicketOut)
def get_maintenance_ticket(
    ticket_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """获取报修工单详情（含房源与受理维修师傅展示名）。"""
    ticket = session.get(MaintenanceTicket, ticket_id)
    if not ticket or ticket.deleted_at:
        raise HTTPException(status_code=404, detail="Maintenance ticket not found")
    return _with_display_fields(session, [ticket])[0]


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


@router.post("/{ticket_id}/rate")
def rate_maintenance_ticket(
    ticket_id: uuid.UUID,
    req: MaintenanceTicketRate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """租客对已解决的工单评分（1-5）并留反馈，形成服务闭环。"""
    ticket = session.get(MaintenanceTicket, ticket_id)
    if not ticket or ticket.deleted_at:
        raise HTTPException(status_code=404, detail="Maintenance ticket not found")
    if ticket.status not in (TicketStatus.resolved, TicketStatus.closed):
        raise HTTPException(
            status_code=409, detail="Only resolved or closed tickets can be rated"
        )
    if ticket.rated_at:
        raise HTTPException(status_code=409, detail="Ticket already rated")

    ticket.rating = req.rating
    ticket.feedback = req.feedback
    ticket.rated_at = datetime.utcnow()
    session.add(ticket)
    session.commit()
    session.refresh(ticket)
    return ticket


@router.post("/{ticket_id}/cancel", response_model=MaintenanceTicketOut)
def cancel_maintenance_ticket(
    ticket_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """租客/业主撤销自己的报修申请。

    员工侧的 `PATCH /{id}` 需要 agent 权限，提交人自己撤单不能走那条路；这里补一个
    自助撤销入口：仅提交人（或管理员）可撤，且只有尚未开工（open/assigned）的工单
    可撤，已开工/已解决的工单必须由员工侧收口，避免把正在上门的维修单直接抹掉。
    撤销采用软删除：工单不再出现在任何列表中，但底层记录保留可追溯。
    """
    ticket = session.get(MaintenanceTicket, ticket_id)
    if not ticket or ticket.deleted_at:
        raise HTTPException(status_code=404, detail="Maintenance ticket not found")
    if not _is_ticket_owner(session, user, ticket):
        raise HTTPException(status_code=403, detail="Not allowed to cancel this ticket")
    if ticket.status not in CANCELLABLE_STATUSES:
        raise HTTPException(
            status_code=409, detail="工单已开工或已结束，无法撤销，请联系客服处理"
        )

    ticket.deleted_at = datetime.utcnow()
    session.add(ticket)
    session.commit()
    session.refresh(ticket)
    return _with_display_fields(session, [ticket])[0]


@router.post("/{ticket_id}/contact", response_model=ConversationOut)
def contact_maintenance_worker(
    ticket_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """联系维修师傅：与受理该工单的维修人员建立（或复用）IM 会话。

    工单只存 employees.id，客户端拿不到师傅账号也开不了会话，此前该按钮无后端可接。
    这里由服务端解析「员工 → 用户账号」，按 entity_type='maintenance_ticket' 幂等
    地返回会话 id，客户端拿到会话 id 直接进聊天页。
    """
    ticket = session.get(MaintenanceTicket, ticket_id)
    if not ticket or ticket.deleted_at:
        raise HTTPException(status_code=404, detail="Maintenance ticket not found")
    if not _is_ticket_owner(session, user, ticket):
        raise HTTPException(status_code=403, detail="Not allowed to contact this ticket")
    if not ticket.assigned_to:
        raise HTTPException(
            status_code=409, detail="工单尚未派单，暂无维修师傅可联系，请稍后再试"
        )

    employee = session.get(Employee, ticket.assigned_to)
    worker = session.get(User, employee.user_id) if employee else None
    if not worker or worker.deleted_at:
        raise HTTPException(
            status_code=409, detail="维修师傅账号不可用，请通过在线客服转达"
        )

    mine, theirs = str(user.id), str(worker.id)
    existing = session.exec(
        select(Conversation).where(
            Conversation.entity_type == "maintenance_ticket",
            Conversation.entity_id == ticket.id,
            Conversation.deleted_at.is_(None),
        )
    ).all()
    for conv in existing:
        ids = participant_ids(conv)
        if mine in ids and theirs in ids:
            return ConversationOut(
                id=str(conv.id),
                title=conv.title,
                entity_type=conv.entity_type,
                entity_id=str(conv.entity_id) if conv.entity_id else None,
                participant_ids=ids,
                created_at=conv.created_at.isoformat(),
            )

    conv = Conversation(
        title=f"维修工单：{ticket.title}",
        entity_type="maintenance_ticket",
        entity_id=ticket.id,
        participant_ids=[mine, theirs],
        created_by=user.id,
    )
    session.add(conv)
    session.flush()
    sync_participants(session, conv)
    session.commit()
    session.refresh(conv)
    return ConversationOut(
        id=str(conv.id),
        title=conv.title,
        entity_type=conv.entity_type,
        entity_id=str(conv.entity_id) if conv.entity_id else None,
        participant_ids=participant_ids(conv),
        created_at=conv.created_at.isoformat(),
    )
