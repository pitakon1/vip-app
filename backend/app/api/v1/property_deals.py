"""产权成交、定金(Iscrow)托管、按揭申请路由（买卖交易闭环）。"""
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from app.db import get_session
from app.core.auth import get_current_user
from app.core.pagination import PaginationParams, paginate
from app.models import (
    User,
    UserRole,
    PropertyDeal,
    PropertyDealStatus,
    Escrow,
    EscrowStatus,
    MortgageApplication,
    MortgageStatus,
    SaleListing,
)

router = APIRouter(prefix="/property-deals", tags=["property-deals"])


class DealIn(BaseModel):
    sale_listing_id: uuid.UUID
    buyer_user_id: Optional[uuid.UUID] = None
    sales_user_id: Optional[uuid.UUID] = None
    sale_price: float
    currency: str = "THB"
    notes: Optional[str] = None


class EscrowIn(BaseModel):
    deal_id: uuid.UUID
    amount: float
    currency: str = "THB"


class MortgageIn(BaseModel):
    buyer_user_id: Optional[uuid.UUID] = None
    deal_id: Optional[uuid.UUID] = None
    bank: str
    loan_amount: float
    currency: str = "THB"
    term_months: int = 360


def _deal_dict(d: PropertyDeal) -> dict:
    return {
        "id": str(d.id),
        "sale_listing_id": str(d.sale_listing_id),
        "sales_user_id": str(d.sales_user_id) if d.sales_user_id else None,
        "buyer_user_id": str(d.buyer_user_id) if d.buyer_user_id else None,
        "property_id": str(d.property_id) if d.property_id else None,
        "sale_price": d.sale_price,
        "currency": d.currency,
        "status": d.status.value,
        "signed_at": d.signed_at.isoformat() if d.signed_at else None,
        "transfer_date": d.transfer_date.isoformat() if d.transfer_date else None,
        "agent_user_id": str(d.agent_user_id) if d.agent_user_id else None,
        "notes": d.notes,
        "created_at": d.created_at.isoformat() if d.created_at else None,
    }


@router.get("")
def list_deals(
    status: Optional[PropertyDealStatus] = None,
    pagination: PaginationParams = Depends(),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """成交列表（管理/经纪人可见全部，普通用户仅相关）。"""
    query = select(PropertyDeal).where(PropertyDeal.deleted_at.is_(None))
    if status:
        query = query.where(PropertyDeal.status == status)
    if user.role not in (UserRole.admin, UserRole.agent, UserRole.employee):
        query = query.where(
            (PropertyDeal.buyer_user_id == user.id)
            | (PropertyDeal.sales_user_id == user.id)
        )
    query = query.order_by(PropertyDeal.created_at.desc())
    items = session.exec(query).all()
    total = len(items)
    offset, limit = pagination.offset, pagination.limit
    return paginate([_deal_dict(i) for i in items][offset : offset + limit], total, pagination)


@router.post("")
def create_deal(
    req: DealIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """创建成交（经纪人/管理员）。"""
    listing = session.get(SaleListing, req.sale_listing_id)
    if not listing or listing.deleted_at:
        raise HTTPException(status_code=404, detail="Sale listing not found")
    deal = PropertyDeal(
        sale_listing_id=req.sale_listing_id,
        buyer_user_id=req.buyer_user_id,
        sales_user_id=req.sales_user_id,
        property_id=listing.property_id,
        sale_price=req.sale_price,
        currency=req.currency,
        status=PropertyDealStatus.drafted,
        agent_user_id=user.id,
        notes=req.notes,
    )
    session.add(deal)
    session.commit()
    session.refresh(deal)
    # 挂牌状态联动
    listing.status = "contracted"
    session.add(listing)
    session.commit()
    return _deal_dict(deal)


@router.get("/{deal_id}")
def get_deal(
    deal_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    deal = session.get(PropertyDeal, deal_id)
    if not deal or deal.deleted_at:
        raise HTTPException(status_code=404, detail="Deal not found")
    return _deal_dict(deal)


@router.patch("/{deal_id}/status")
def update_deal_status(
    deal_id: uuid.UUID,
    status: PropertyDealStatus,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """推进状态（托管中/已签/过户/完成）。"""
    deal = session.get(PropertyDeal, deal_id)
    if not deal or deal.deleted_at:
        raise HTTPException(status_code=404, detail="Deal not found")
    deal.status = status
    if status == PropertyDealStatus.signed:
        deal.signed_at = datetime.utcnow()
    session.add(deal)
    session.commit()
    session.refresh(deal)
    return _deal_dict(deal)


@router.post("/escrows")
def create_escrow(
    req: EscrowIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """登记定金托管。"""
    deal = session.get(PropertyDeal, req.deal_id)
    if not deal or deal.deleted_at:
        raise HTTPException(status_code=404, detail="Deal not found")
    escrow = Escrow(
        deal_id=req.deal_id,
        amount=req.amount,
        currency=req.currency,
        status=EscrowStatus.deposited,
        deposited_at=datetime.utcnow(),
        handler_user_id=user.id,
    )
    session.add(escrow)
    session.commit()
    session.refresh(escrow)
    return {
        "id": str(escrow.id),
        "deal_id": str(escrow.deal_id),
        "amount": escrow.amount,
        "currency": escrow.currency,
        "status": escrow.status.value,
        "deposited_at": escrow.deposited_at.isoformat() if escrow.deposited_at else None,
    }


@router.get("/escrows/{deal_id}")
def list_escrows(
    deal_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    escrows = session.exec(
        select(Escrow)
        .where(Escrow.deal_id == deal_id, Escrow.deleted_at.is_(None))
        .order_by(Escrow.created_at.desc())
    ).all()
    return [
        {
            "id": str(e.id),
            "deal_id": str(e.deal_id),
            "amount": e.amount,
            "currency": e.currency,
            "status": e.status.value,
            "deposited_at": e.deposited_at.isoformat() if e.deposited_at else None,
            "released_at": e.released_at.isoformat() if e.released_at else None,
        }
        for e in escrows
    ]


@router.post("/escrows/{escrow_id}/release")
def release_escrow(
    escrow_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """解除托管（放款给卖方，需管理/经纪人）。"""
    if user.role not in (UserRole.admin, UserRole.agent, UserRole.employee):
        raise HTTPException(status_code=403, detail="No permission")
    escrow = session.get(Escrow, escrow_id)
    if not escrow or escrow.deleted_at:
        raise HTTPException(status_code=404, detail="Escrow not found")
    escrow.status = EscrowStatus.released_seller
    escrow.released_at = datetime.utcnow()
    session.add(escrow)
    session.commit()
    session.refresh(escrow)
    return {"id": str(escrow.id), "status": escrow.status.value}


@router.post("/escrows/{escrow_id}/refund")
def refund_escrow(
    escrow_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """退还定金给买方。"""
    if user.role not in (UserRole.admin, UserRole.agent, UserRole.employee):
        raise HTTPException(status_code=403, detail="No permission")
    escrow = session.get(Escrow, escrow_id)
    if not escrow or escrow.deleted_at:
        raise HTTPException(status_code=404, detail="Escrow not found")
    escrow.status = EscrowStatus.refunded_buyer
    escrow.refunded_at = datetime.utcnow()
    session.add(escrow)
    session.commit()
    session.refresh(escrow)
    return {"id": str(escrow.id), "status": escrow.status.value}


@router.post("/mortgages")
def create_mortgage(
    req: MortgageIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """提交按揭申请。"""
    mortgage = MortgageApplication(
        deal_id=req.deal_id,
        buyer_user_id=req.buyer_user_id or user.id,
        bank=req.bank,
        loan_amount=req.loan_amount,
        currency=req.currency,
        term_months=req.term_months,
        status=MortgageStatus.applied,
        status_at=datetime.utcnow(),
    )
    session.add(mortgage)
    session.commit()
    session.refresh(mortgage)
    return {
        "id": str(mortgage.id),
        "bank": mortgage.bank,
        "loan_amount": mortgage.loan_amount,
        "currency": mortgage.currency,
        "status": mortgage.status.value,
        "status_at": mortgage.status_at.isoformat() if mortgage.status_at else None,
    }


@router.get("/mortgages/mine")
def my_mortgages(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    morts = session.exec(
        select(MortgageApplication)
        .where(MortgageApplication.buyer_user_id == user.id, MortgageApplication.deleted_at.is_(None))
        .order_by(MortgageApplication.created_at.desc())
    ).all()
    return [
        {
            "id": str(m.id),
            "bank": m.bank,
            "loan_amount": m.loan_amount,
            "currency": m.currency,
            "term_months": m.term_months,
            "status": m.status.value,
            "status_at": m.status_at.isoformat() if m.status_at else None,
            "created_at": m.created_at.isoformat() if m.created_at else None,
        }
        for m in morts
    ]


@router.patch("/mortgages/{mortgage_id}/status")
def update_mortgage_status(
    mortgage_id: uuid.UUID,
    status: MortgageStatus,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """按揭状态审批（管理/经纪人）。"""
    if user.role not in (UserRole.admin, UserRole.agent, UserRole.employee):
        raise HTTPException(status_code=403, detail="No permission")
    m = session.get(MortgageApplication, mortgage_id)
    if not m:
        raise HTTPException(status_code=404, detail="Mortgage not found")
    m.status = status
    m.status_at = datetime.utcnow()
    session.add(m)
    session.commit()
    session.refresh(m)
    return {"id": str(m.id), "status": m.status.value}