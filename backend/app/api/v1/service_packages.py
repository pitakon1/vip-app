"""服务套餐路由：业主订阅 / 查看 / 取消托管套餐（支持按月/按日/按次/按年）。"""
import uuid
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.db import get_session
from app.core.auth import STAFF_ROLES, get_current_user, require_owner
from app.models import (
    Owner,
    Property,
    ServicePackage,
    ServiceBillingModel,
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
    # 三种计费方式（monthly/per_use/annual），既有调用不传则保持默认 annual
    billing_model: ServiceBillingModel = ServiceBillingModel.annual
    billing_interval: int = Field(default=1, gt=0)  # monthly/annual 周期数；per_use 忽略
    unit_price: float = Field(default=0, ge=0)  # 单价
    quota_total: int = Field(default=0, ge=0)  # 按次总次数


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


def _add_months(dt: datetime, months: int) -> datetime:
    """按月份推进日期（自动处理跨年/月末进位）。"""
    month_index = dt.year * 12 + (dt.month - 1) + months
    new_year, new_month0 = divmod(month_index, 12)
    new_month = new_month0 + 1
    # 月末进位：例如 1-31 加 1 个月，取目标月份最后一天
    if dt.day == 31 and new_month == 2:
        # 2 月最多 28/29 天
        day = 29 if new_year % 4 == 0 and (new_year % 100 != 0 or new_year % 400 == 0) else 28
    elif dt.day > 28 and new_month in (4, 6, 9, 11):
        day = 30
    else:
        day = dt.day
    return dt.replace(year=new_year, month=new_month, day=day)


@router.post("")
def create_service_package(
    req: ServicePackageCreate,
    session: Session = Depends(get_session),
    user: User = Depends(require_owner),
):
    """订阅服务套餐（支持按月/按日/按次/按年四种计费）。

    - monthly：end_date = start + billing_interval 个月，amount = unit_price * billing_interval
    - daily  ：end_date = start + billing_interval 天，amount = unit_price * billing_interval
    - annual ：end_date = start + billing_interval 年（默认 1 年），amount = unit_price * billing_interval；
              未传 unit_price 时按旧逻辑（佣金 + 托管费）× 月租计算，兼容既有调用
    - per_use：end_date 置空（按次结算），amount = unit_price（单次），quota_used 从 0 起
    """
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

    # 按计费方式计算金额与到期日
    if req.billing_model == ServiceBillingModel.monthly:
        end_date = _add_months(req.start_date, req.billing_interval)
        amount = round(req.unit_price * req.billing_interval, 2)
    elif req.billing_model == ServiceBillingModel.daily:
        end_date = req.start_date + timedelta(days=req.billing_interval)
        amount = round(req.unit_price * req.billing_interval, 2)
    elif req.billing_model == ServiceBillingModel.per_use:
        end_date = None  # 按次结算，无到期日
        amount = round(req.unit_price, 2)
    else:  # annual
        end_date = _add_months(req.start_date, req.billing_interval * 12)
        if req.unit_price:
            amount = round(req.unit_price * req.billing_interval, 2)
        else:
            # 纯售房源无月租，无法按（佣金 + 托管费）× 月租计价
            if prop.monthly_rent is None:
                raise HTTPException(
                    status_code=400,
                    detail="该房源未设置月租金，无法按此计价，请传入 unit_price",
                )
            # 兼容既有调用：未给单价时沿用旧托管费基数（佣金 + 托管费）× 月租
            amount = (req.commission_rate + req.management_fee_rate) * prop.monthly_rent

    quota_used = 0  # 按次套餐从 0 起算
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
        billing_model=req.billing_model,
        billing_interval=req.billing_interval,
        unit_price=req.unit_price,
        quota_total=req.quota_total if req.billing_model == ServiceBillingModel.per_use else 0,
        quota_used=quota_used,
    )
    session.add(package)
    session.commit()
    session.refresh(package)
    return package


@router.get("/me", response_model=list[ServicePackage])
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


@router.get("/{package_id}", response_model=ServicePackage)
def get_service_package(
    package_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """套餐详情（业主仅限本人名下套餐，员工/管理员可看全部）。"""
    package = session.get(ServicePackage, package_id)
    if not package or package.deleted_at:
        raise HTTPException(status_code=404, detail="Service package not found")
    # 金额/单价/配额属敏感信息：非员工必须为本套餐业主本人，其他角色 403
    if user.role not in STAFF_ROLES:
        owner = session.exec(
            select(Owner).where(Owner.user_id == user.id, Owner.deleted_at.is_(None))
        ).first()
        if not owner or package.owner_id != owner.id:
            raise HTTPException(
                status_code=403, detail="Not allowed to view this service package"
            )
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
