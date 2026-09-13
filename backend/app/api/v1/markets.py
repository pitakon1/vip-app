"""多国扩张底座路由：市场配置、本地支付渠道、合规文档。"""
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
    MarketConfig,
    MarketStatus,
    LocalPaymentChannel,
    ComplianceDoc,
)

router = APIRouter(prefix="/markets", tags=["markets"])

_ADMIN_ROLES = (UserRole.admin, UserRole.agent, UserRole.employee)


class MarketIn(BaseModel):
    market_code: str
    country_name: str
    currency: str = "THB"
    default_language: str = "th"
    timezone: str = "Asia/Bangkok"
    status: MarketStatus = MarketStatus.launching
    published: bool = False
    license_required: bool = False
    vat_rate: float = 0.0
    transfer_fee_rate: float = 0.0
    pdpa_enabled: bool = True
    sort_order: int = 100


class ChannelIn(BaseModel):
    market_code: str
    channel_code: str
    channel_name: str
    channel_type: str = "wallet"
    merchant_id: Optional[str] = None
    supported_currency: str = "THB"
    sort_order: int = 100


class ComplianceIn(BaseModel):
    market_code: str
    doc_type: str = "contract_template"
    title: str
    language: str = "en"
    content: Optional[str] = None
    version: str = "1.0"


def _market_dict(m: MarketConfig) -> dict:
    return {
        "id": str(m.id),
        "market_code": m.market_code,
        "country_name": m.country_name,
        "currency": m.currency,
        "default_language": m.default_language,
        "timezone": m.timezone,
        "status": m.status.value,
        "published": m.published,
        "license_required": m.license_required,
        "vat_rate": m.vat_rate,
        "transfer_fee_rate": m.transfer_fee_rate,
        "pdpa_enabled": m.pdpa_enabled,
        "sort_order": m.sort_order,
    }


@router.get("")
def list_markets(
    published_only: bool = False,
    pagination: PaginationParams = Depends(),
    session: Session = Depends(get_session),
):
    """市场列表。published_only=True 时仅返回对外已发布市场（前台用）。"""
    query = select(MarketConfig).where(MarketConfig.deleted_at.is_(None))
    if published_only:
        query = query.where(MarketConfig.published.is_(True))
    query = query.order_by(MarketConfig.sort_order)
    items = session.exec(query).all()
    total = len(items)
    offset, limit = pagination.offset, pagination.limit
    return paginate([_market_dict(i) for i in items][offset : offset + limit], total, pagination)


@router.post("")
def create_market(
    req: MarketIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    if user.role not in _ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="No permission")
    m = MarketConfig(
        market_code=req.market_code.upper(),
        country_name=req.country_name,
        currency=req.currency,
        default_language=req.default_language,
        timezone=req.timezone,
        status=req.status,
        published=req.published,
        license_required=req.license_required,
        vat_rate=req.vat_rate,
        transfer_fee_rate=req.transfer_fee_rate,
        pdpa_enabled=req.pdpa_enabled,
        sort_order=req.sort_order,
    )
    session.add(m)
    session.commit()
    session.refresh(m)
    return _market_dict(m)


@router.get("/channels")
def list_channels(
    market_code: Optional[str] = None,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    query = select(LocalPaymentChannel).where(LocalPaymentChannel.deleted_at.is_(None))
    if market_code:
        query = query.where(LocalPaymentChannel.market_code == market_code.upper())
    query = query.order_by(LocalPaymentChannel.sort_order)
    rows = session.exec(query).all()
    return [
        {
            "id": str(c.id),
            "market_code": c.market_code,
            "channel_code": c.channel_code,
            "channel_name": c.channel_name,
            "channel_type": c.channel_type,
            "status": c.status.value,
            "supported_currency": c.supported_currency,
        }
        for c in rows
    ]


@router.post("/channels")
def create_channel(
    req: ChannelIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    if user.role not in _ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="No permission")
    c = LocalPaymentChannel(
        market_code=req.market_code.upper(),
        channel_code=req.channel_code,
        channel_name=req.channel_name,
        channel_type=req.channel_type,
        merchant_id=req.merchant_id,
        supported_currency=req.supported_currency,
        sort_order=req.sort_order,
    )
    session.add(c)
    session.commit()
    session.refresh(c)
    return {
        "id": str(c.id),
        "market_code": c.market_code,
        "channel_code": c.channel_code,
        "channel_name": c.channel_name,
        "status": c.status.value,
    }


@router.get("/compliance")
def list_compliance(
    market_code: Optional[str] = None,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    query = select(ComplianceDoc).where(ComplianceDoc.deleted_at.is_(None), ComplianceDoc.is_active.is_(True))
    if market_code:
        query = query.where(ComplianceDoc.market_code == market_code.upper())
    rows = session.exec(query).all()
    return [
        {
            "id": str(d.id),
            "market_code": d.market_code,
            "doc_type": d.doc_type,
            "title": d.title,
            "language": d.language,
            "version": d.version,
            "effective_date": d.effective_date.isoformat() if d.effective_date else None,
        }
        for d in rows
    ]


@router.post("/compliance")
def create_compliance(
    req: ComplianceIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    if user.role not in _ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="No permission")
    d = ComplianceDoc(
        market_code=req.market_code.upper(),
        doc_type=req.doc_type,
        title=req.title,
        language=req.language,
        content=req.content,
        version=req.version,
    )
    session.add(d)
    session.commit()
    session.refresh(d)
    return {"id": str(d.id), "market_code": d.market_code, "title": d.title}