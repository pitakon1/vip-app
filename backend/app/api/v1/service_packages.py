"""年度托管套餐路由：业主订阅 / 查看 / 取消托管套餐。"""
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.db import get_session
from app.core.auth import get_current_user, require_owner
from app.models import (
    Owner,
    Property,
    ServicePackage,
    ServicePackageStatus,
    ServicePackageType,
    User,
)

router = APIRouter(prefix="/service-packages", tags=["service-packages"])


class ServicePackageCreate(BaseModel):
    property_id: uuid.UUID
    type: ServicePackageType = ServicePackageType.annual_management
    start_date: datetime
    commission_rate: float = Field(default=1.0, gt=0)
    management_fee_rate: float = Field(default=0.5, ge=0)
    auto_renew: bool = True


class ServicePackageUpdate(BaseModel):
    status: Optional[ServicePackageStatus] = None
    auto_renew: Optional[bool] = None


def _get_owner(session: Session, user: User) -> Owner:
    owner = session.exec(
        select(Owner).where(Owner.user_id == user.id, Owner.deleted_at.is_(None))
    ).first()
    if not owner:
        raise HTTPException(status_code=404, detail="Owner profile not found")
    return owner


@router.post("")
def create_service_package(
    req: ServicePackageCreate,
    session: Session = Depends(get_session),
    user: User = Depends(require_owner),
):
    """订阅年度托管套餐（佣金 + 托管费，金额 = (佣金 + 托管费) × 月租金）。"""
    owner = _get_owner(session, user)

    prop = session.get(Property, req.property_id)
    if not prop or prop.deleted_at:
        raise HTTPException(status_code=404, detail="Property not found")
    if prop.owner_id != owner.id:
        raise HTTPException(status_code=403, detail="Property does not belong to owner")

    # 该房源存在有效套餐时禁止重复订阅
    existing = session.exec(
        select(ServicePackage).where(
            ServicePackage.property_id == req.property_id,
            ServicePackage.owner_id == owner.id,
            ServicePackage.status == ServicePackageStatus.active,
            ServicePackage.deleted_at.is_(None),
        )
    ).first()
    if existing:
        raise HTTPException(
            status_code=409, detail="An active package already exists for this property"
        )

    # 套餐默认一年
    end_date = req.start_date.replace(
        year=req.start_date.year + 1, month=req.start_date.month, day=req.start_date.day
    )
    amount = (req.commission_rate + req.management_fee_rate) * prop.monthly_rent

    package = ServicePackage(
        owner_id=owner.id,
        property_id=req.property_id,
        type=req.type,
        commission_rate=req.commission_rate,
        management_fee_rate=req.management_fee_rate,
        amount=amount,
        currency=prop.currency,
        start_date=req.start_date,
        end_date=end_date,
        status=ServicePackageStatus.active,
        auto_renew=req.auto_renew,
    )
    session.add(package)
    session.commit()
    session.refresh(package)
    return package


@router.get("/me")
def get_my_packages(
    session: Session = Depends(get_session),
    user: User = Depends(require_owner),
):
    """我的托管套餐列表。"""
    owner = _get_owner(session, user)
    packages = session.exec(
        select(ServicePackage)
        .where(ServicePackage.owner_id == owner.id, ServicePackage.deleted_at.is_(None))
        .order_by(ServicePackage.created_at.desc())
    ).all()
    return packages


@router.get("/{package_id}")
def get_service_package(
    package_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """套餐详情。"""
    package = session.get(ServicePackage, package_id)
    if not package or package.deleted_at:
        raise HTTPException(status_code=404, detail="Service package not found")
    return package


@router.patch("/{package_id}")
def update_service_package(
    package_id: uuid.UUID,
    req: ServicePackageUpdate,
    session: Session = Depends(get_session),
    user: User = Depends(require_owner),
):
    """更新套餐（取消订阅 / 关闭自动续费）。"""
    owner = _get_owner(session, user)
    package = session.get(ServicePackage, package_id)
    if not package or package.deleted_at:
        raise HTTPException(status_code=404, detail="Service package not found")
    if package.owner_id != owner.id:
        raise HTTPException(status_code=403, detail="Not your service package")

    update_data = req.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(package, key, value)
    session.add(package)
    session.commit()
    session.refresh(package)
    return package
