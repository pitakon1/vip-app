"""业主路由：业主个人信息、房源与租金收入。"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from app.db import get_session
from app.core.auth import require_owner
from app.models import (
    Document,
    Owner,
    Property,
    PropertyStatus,
    Payment,
    PaymentType,
    PaymentStatus,
    User,
)

router = APIRouter(prefix="/owners", tags=["owners"])


class OwnerUpdate(BaseModel):
    nationality: Optional[str] = None
    tax_id: Optional[str] = None
    address: Optional[str] = None
    contact_preference: Optional[str] = None


def _get_owner(session: Session, user: User) -> Owner:
    """根据当前用户获取业主记录。"""
    owner = session.exec(
        select(Owner).where(
            Owner.user_id == user.id,
            Owner.deleted_at.is_(None),
        )
    ).first()
    if not owner:
        raise HTTPException(status_code=404, detail="Owner profile not found")
    return owner


@router.get("/me")
def get_my_owner_info(
    session: Session = Depends(get_session),
    user: User = Depends(require_owner),
):
    """业主个人信息。"""
    return _get_owner(session, user)


@router.patch("/me")
def update_my_owner_info(
    req: OwnerUpdate,
    session: Session = Depends(get_session),
    user: User = Depends(require_owner),
):
    """更新业主个人信息。"""
    owner = _get_owner(session, user)
    update_data = req.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(owner, key, value)
    session.add(owner)
    session.commit()
    session.refresh(owner)
    return owner


@router.get("/me/properties")
def get_my_properties(
    session: Session = Depends(get_session),
    user: User = Depends(require_owner),
):
    """业主的房源列表。"""
    owner = _get_owner(session, user)
    properties = session.exec(
        select(Property)
        .where(
            Property.owner_id == owner.id,
            Property.deleted_at.is_(None),
        )
        .order_by(Property.created_at.desc())
    ).all()
    return properties


@router.get("/me/documents")
def get_my_documents(
    session: Session = Depends(get_session),
    user: User = Depends(require_owner),
):
    """业主的文档列表（合同、收据、税务发票等）。"""
    owner = _get_owner(session, user)
    documents = session.exec(
        select(Document)
        .where(Document.owner_id == owner.id, Document.deleted_at.is_(None))
        .order_by(Document.created_at.desc())
    ).all()
    return documents


@router.get("/me/income")
def get_my_income(
    session: Session = Depends(get_session),
    user: User = Depends(require_owner),
):
    """租金收入汇总。"""
    owner = _get_owner(session, user)

    properties = session.exec(
        select(Property).where(
            Property.owner_id == owner.id,
            Property.deleted_at.is_(None),
        )
    ).all()

    property_ids = [p.id for p in properties]
    if not property_ids:
        return {
            "total_income": 0.0,
            "currency": "THB",
            "property_count": 0,
            "rented_count": 0,
            "vacant_count": 0,
            "by_property": [],
        }

    payments = session.exec(
        select(Payment).where(
            Payment.property_id.in_(property_ids),
            Payment.payment_type == PaymentType.rent,
            Payment.status == PaymentStatus.succeeded,
            Payment.deleted_at.is_(None),
        )
    ).all()

    income_by_property: dict = {}
    for p in payments:
        key = str(p.property_id)
        income_by_property[key] = income_by_property.get(key, 0.0) + p.amount

    total_income = sum(income_by_property.values())
    rented_count = sum(1 for p in properties if p.status == PropertyStatus.rented)
    vacant_count = sum(1 for p in properties if p.status == PropertyStatus.vacant)

    by_property = [
        {
            "property_id": pid,
            "income": amount,
            "monthly_rent": next(
                (p.monthly_rent for p in properties if str(p.id) == pid), 0
            ),
        }
        for pid, amount in income_by_property.items()
    ]

    return {
        "total_income": total_income,
        "currency": "THB",
        "property_count": len(properties),
        "rented_count": rented_count,
        "vacant_count": vacant_count,
        "by_property": by_property,
    }
