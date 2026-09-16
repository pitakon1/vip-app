"""推荐服务路由：增值服务订单管理。"""
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.db import get_session
from app.core.auth import get_current_user
from app.core.events import publish_event
from app.core.pagination import PaginationParams, paginate_query
from app.models import (
    ServiceOrder,
    ServiceType,
    ServiceOrderStatus,
    User,
    UserRole,
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


class ServiceOrderReview(BaseModel):
    """服务订单评价请求：1-5 星 + 可选文字反馈。"""

    rating: int = Field(ge=1, le=5)
    comment: Optional[str] = Field(default=None, max_length=1000)


@router.get("")
def list_service_orders(
    pagination: PaginationParams = Depends(),
    status: Optional[ServiceOrderStatus] = None,
    service_type: Optional[ServiceType] = None,
    property_id: Optional[uuid.UUID] = None,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """推荐服务订单列表。

    业主/租客只能看到自己下的订单；员工及以上角色（派单/受理方）可看全部。
    """
    conditions = [ServiceOrder.deleted_at.is_(None)]
    if user.role not in (UserRole.admin, UserRole.agent, UserRole.employee):
        conditions.append(ServiceOrder.orderer_id == user.id)
    if status:
        conditions.append(ServiceOrder.status == status)
    if service_type:
        conditions.append(ServiceOrder.service_type == service_type)
    if property_id:
        conditions.append(ServiceOrder.property_id == property_id)

    stmt = select(ServiceOrder).where(*conditions).order_by(
        ServiceOrder.created_at.desc()
    )
    return paginate_query(session, stmt, pagination)


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
    """获取推荐服务订单详情（业主/租客仅限自己的订单）。"""
    order = session.get(ServiceOrder, order_id)
    if not order or order.deleted_at:
        raise HTTPException(status_code=404, detail="Service order not found")
    if (
        user.role not in (UserRole.admin, UserRole.agent, UserRole.employee)
        and order.orderer_id != user.id
    ):
        raise HTTPException(status_code=403, detail="Not allowed to view this order")
    return order


@router.patch("/{order_id}/status")
def update_service_order_status(
    order_id: uuid.UUID,
    req: ServiceOrderStatusUpdate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """更新推荐服务订单状态（派单/完成由员工及以上角色操作）。"""
    if user.role not in (UserRole.admin, UserRole.agent, UserRole.employee):
        raise HTTPException(
            status_code=403, detail="Not allowed to update service order status"
        )
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


@router.post("/{order_id}/review")
def review_service_order(
    order_id: uuid.UUID,
    req: ServiceOrderReview,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """业主/租客对已完成的服务订单评分（1-5）并留反馈，形成服务闭环。

    - 仅「已完成」订单可评价；
    - 同一订单只能评价一次（重复评价返回 409）；
    - 仅下单人本人或管理员可评价。
    """
    order = session.get(ServiceOrder, order_id)
    if not order or order.deleted_at:
        raise HTTPException(status_code=404, detail="Service order not found")
    if order.orderer_id != user.id and user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Not allowed to review this order")
    if order.status != ServiceOrderStatus.completed:
        raise HTTPException(
            status_code=409, detail="Only completed service orders can be reviewed"
        )
    if order.reviewed_at:
        raise HTTPException(status_code=409, detail="Service order already reviewed")

    order.rating = req.rating
    order.review_comment = req.comment
    order.reviewed_at = datetime.utcnow()
    session.add(order)
    publish_event(
        session,
        "service_order.reviewed",
        "service_order",
        order.id,
        {
            "rating": order.rating,
            "provider_id": order.provider_id,
            "reviewed_by": str(user.id),
        },
    )
    session.commit()
    session.refresh(order)
    return order
