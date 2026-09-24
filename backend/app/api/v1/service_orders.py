"""推荐服务路由：增值服务订单管理。"""
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.db import get_session
from app.core.auth import STAFF_ROLES, get_current_user
from app.core.events import publish_event
from app.core.pagination import Page, PaginationParams, paginate_query
from app.models import (
    Lease,
    Owner,
    Property,
    ServiceOrder,
    ServiceType,
    ServiceOrderStatus,
    ServicePackage,
    ServiceBillingModel,
    ServicePackageStatus,
    Tenant,
    User,
    UserRole,
)

router = APIRouter(prefix="/service-orders", tags=["service-orders"])

# 服务订单状态流转白名单：仅允许前进（pending→assigned→in_progress→completed/cancelled），
# 回退一律 409——状态回退后再置 completed 会让按次扣次（quota_used+1）重复执行。
_SERVICE_ORDER_STATUS_RANK = {
    ServiceOrderStatus.pending: 0,
    ServiceOrderStatus.assigned: 1,
    ServiceOrderStatus.in_progress: 2,
    ServiceOrderStatus.completed: 3,
    ServiceOrderStatus.cancelled: 4,
}


class ServiceOrderCreate(BaseModel):
    orderer_id: uuid.UUID
    orderer_type: str  # owner/tenant
    property_id: uuid.UUID
    service_type: ServiceType
    scheduled_at: Optional[datetime] = None
    provider_id: Optional[str] = None
    amount: float = Field(default=0, ge=0)
    currency: str = "THB"
    notes: Optional[str] = None
    # 购买计费方式与本次结算金额（配合服务套餐做「按次扣次」）
    billing_model: Optional[str] = None  # monthly/per_use/annual
    billing_amount: Optional[float] = Field(default=None, ge=0)
    service_package_id: Optional[uuid.UUID] = None  # 关联的按次套餐


class ServiceOrderStatusUpdate(BaseModel):
    """服务订单状态更新（员工侧）。评分只能走 /{order_id}/review，不在此接受。"""

    status: ServiceOrderStatus
    provider_id: Optional[str] = None
    scheduled_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    notes: Optional[str] = None


class ServiceOrderReview(BaseModel):
    """服务订单评价请求：1-5 星 + 可选文字反馈。"""

    rating: int = Field(ge=1, le=5)
    comment: Optional[str] = Field(default=None, max_length=1000)


@router.get("", response_model=Page[ServiceOrder])
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
    """创建推荐服务订单，发布 service_order.created 事件。

    记录购买时的计费方式与本次结算金额（billing_model / billing_amount），
    并可在创建时关联一个按次套餐（service_package_id），完成时用于扣次。
    """
    # 房源必须存在
    prop = session.get(Property, req.property_id)
    if not prop or prop.deleted_at:
        raise HTTPException(status_code=404, detail="Property not found")
    # 非员工只能为自己下单，禁止替他人下单
    if user.role not in STAFF_ROLES and req.orderer_id != user.id:
        raise HTTPException(
            status_code=403, detail="Not allowed to create order for another user"
        )
    # 订单必须与下单人存在真实关系：业主名下房源 / 租客已承租房源（复用套餐校验口径）
    if req.orderer_type == "owner":
        owner = session.exec(
            select(Owner).where(
                Owner.user_id == req.orderer_id, Owner.deleted_at.is_(None)
            )
        ).first()
        if not owner:
            raise HTTPException(status_code=404, detail="Owner profile not found")
        if prop.owner_id != owner.id:
            raise HTTPException(
                status_code=403, detail="Property does not belong to orderer"
            )
    elif req.orderer_type == "tenant":
        tenant = session.exec(
            select(Tenant).where(
                Tenant.user_id == req.orderer_id, Tenant.deleted_at.is_(None)
            )
        ).first()
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant profile not found")
        lease = session.exec(
            select(Lease).where(
                Lease.tenant_id == tenant.id, Lease.property_id == req.property_id
            )
        ).first()
        if not lease:
            raise HTTPException(
                status_code=403, detail="Property is not leased to orderer"
            )
    # 计费金额默认取请求的单次金额（= unit_price）；未给 billing_amount 时沿用 amount
    billing_amount = (
        req.billing_amount if req.billing_amount is not None else req.amount
    )
    order = ServiceOrder(**req.model_dump(exclude_none=True))
    order.billing_amount = billing_amount
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


@router.get("/{order_id}", response_model=ServiceOrder)
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
    """更新推荐服务订单状态（派单/完成由员工及以上角色操作）。

    服务订单完成（status -> completed）且关联了按次套餐（service_package_id）时，
    对套餐 quota_used +1 完成「扣次」；当 quota_used >= quota_total 时套餐标记为
    cancelled（次数用尽）。仅当订单确实关联按次套餐才扣次，绝不对无关订单伪造数据。
    """
    if user.role not in (UserRole.admin, UserRole.agent, UserRole.employee):
        raise HTTPException(
            status_code=403, detail="Not allowed to update service order status"
        )
    order = session.get(ServiceOrder, order_id)
    if not order or order.deleted_at:
        raise HTTPException(status_code=404, detail="Service order not found")

    update_data = req.model_dump(exclude_unset=True)
    # 评分只能走 /{order_id}/review 接口，员工在状态更新里直写评分一律剥离
    update_data.pop("rating", None)
    # 状态机校验：仅允许前进，回退（尤其 completed 之后改回旧状态再置 completed）会
    # 绕过幂等扣次，导致 quota_used 重复 +1
    new_status = update_data.get("status")
    if new_status is not None and _SERVICE_ORDER_STATUS_RANK[
        new_status
    ] < _SERVICE_ORDER_STATUS_RANK[order.status]:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Invalid status transition: {order.status.value} -> {new_status.value}"
            ),
        )
    # 幂等扣次判据：以 completed_at 是否已落为唯一条件（而非当前 status 比较），
    # 重复提交 completed 不会再触发 quota_used +1
    is_completion = (
        update_data.get("status") == ServiceOrderStatus.completed
        and not order.completed_at
    )
    # 状态变为 completed 时自动记录完成时间
    if is_completion:
        update_data["completed_at"] = datetime.utcnow()

    for key, value in update_data.items():
        setattr(order, key, value)
    session.add(order)

    # 完成一次「按次」服务 → 对关联套餐扣次；次数用尽则套餐标记 cancelled
    if is_completion and order.service_package_id:
        package = session.get(ServicePackage, order.service_package_id)
        if package and not package.deleted_at:
            if package.billing_model == ServiceBillingModel.per_use:
                package.quota_used = (package.quota_used or 0) + 1
                if package.quota_total > 0 and package.quota_used >= package.quota_total:
                    package.status = ServicePackageStatus.cancelled
                session.add(package)

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
