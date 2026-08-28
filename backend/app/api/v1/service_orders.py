"""推荐服务路由：增值服务订单管理。"""
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlmodel import Session, select

from app.db import get_session
from app.core.auth import get_current_user
from app.core.events import publish_event
from app.core.pagination import PaginationParams, paginate
from app.models import (
    ServiceOrder,
    ServiceType,
    ServiceOrderStatus,
    User,
)

router = APIRouter(prefix="/service-orders", tags=["service-orders"])


class ServiceOrderCreate(BaseModel):
    orderer_id: uuid.UUID
    orderer_type: str  # owner/tenant
    property_id: uuid.UUID
    service_type: ServiceType
    scheduled_at: Optional[datetime] = None
    provider_id: Optional[str] = None
    amount: float = 0
    currency: str = "THB"
    notes: Optional[str] = None


class ServiceOrderStatusUpdate(BaseModel):
    status: ServiceOrderStatus
    provider_id: Optional[str] = None
    scheduled_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    notes: Optional[str] = None
    rating: Optional[int] = None


@router.get("")
def list_service_orders(
    pagination: PaginationParams = Depends(),
    status: Optional[ServiceOrderStatus] = None,
    service_type: Optional[ServiceType] = None,
    property_id: Optional[uuid.UUID] = None,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """推荐服务订单列表。"""
    conditions = [ServiceOrder.deleted_at.is_(None)]
    if status:
        conditions.append(ServiceOrder.status == status)
    if service_type:
        conditions.append(ServiceOrder.service_type == service_type)
    if property_id:
        conditions.append(ServiceOrder.property_id == property_id)

    stmt = select(ServiceOrder).where(*conditions).order_by(
        ServiceOrder.created_at.desc()
    )
    count_stmt = select(func.count(ServiceOrder.id)).where(*conditions)
    total = session.exec(count_stmt).one()
    items = session.exec(
        stmt.offset(pagination.offset).limit(pagination.limit)
    ).all()
    return paginate(items, total, pagination)


@router.post("")
def create_service_order(
    req: ServiceOrderCreate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """创建推荐服务订单，发布 service_order.created 事件。"""
    order = ServiceOrder(**req.model_dump())
    session.add(order)
    publish_event(
        session,
        "service_order.created",
        "service_order",
        order.id,
        {
            "orderer_id": str(order.orderer_id),
            "property_id": str(order.property_id),
            "service_type": order.service_type.value,
            "created_by": str(user.id),
        },
    )
    session.commit()
    session.refresh(order)
    return order


@router.get("/{order_id}")
def get_service_order(
    order_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """获取推荐服务订单详情。"""
    order = session.get(ServiceOrder, order_id)
    if not order or order.deleted_at:
        raise HTTPException(status_code=404, detail="Service order not found")
    return order


@router.patch("/{order_id}/status")
def update_service_order_status(
    order_id: uuid.UUID,
    req: ServiceOrderStatusUpdate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """更新推荐服务订单状态。"""
    order = session.get(ServiceOrder, order_id)
    if not order or order.deleted_at:
        raise HTTPException(status_code=404, detail="Service order not found")

    update_data = req.model_dump(exclude_unset=True)
    # 状态变为 completed 时自动记录完成时间
    if update_data.get("status") == ServiceOrderStatus.completed and not order.completed_at:
        update_data["completed_at"] = datetime.utcnow()

    for key, value in update_data.items():
        setattr(order, key, value)
    session.add(order)
    session.commit()
    session.refresh(order)
    return order
