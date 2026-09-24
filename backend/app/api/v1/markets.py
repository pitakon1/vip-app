"""多国扩张底座路由：市场配置、本地支付渠道、合规文档。"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlmodel import Session, select

from app.db import get_session
from app.core.auth import STAFF_ROLES, get_current_user
from app.core.pagination import Page, PaginationParams, paginate_query
from app.models import (
    User,
    MarketConfig,
    MarketStatus,
    LocalPaymentChannel,
    ComplianceDoc,
)

router = APIRouter(prefix="/markets", tags=["markets"])

# 员工角色（可看全量）：统一走 core.auth.STAFF_ROLES


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


class MarketConfigOut(BaseModel):
    """市场配置响应（与 _market_dict 输出一致）。"""

    model_config = ConfigDict(extra="allow")

    id: Optional[str] = None
    market_code: Optional[str] = None
    country_name: Optional[str] = None
    currency: Optional[str] = None
    default_language: Optional[str] = None
    timezone: Optional[str] = None
    status: Optional[str] = None
    published: Optional[bool] = None
    license_required: Optional[bool] = None
    vat_rate: Optional[float] = None
    transfer_fee_rate: Optional[float] = None
    pdpa_enabled: Optional[bool] = None
    sort_order: Optional[int] = None


class PaymentChannelOut(BaseModel):
    """本地支付渠道响应。"""

    model_config = ConfigDict(extra="allow")

    id: Optional[str] = None
    market_code: Optional[str] = None
    channel_code: Optional[str] = None
    channel_name: Optional[str] = None
    channel_type: Optional[str] = None
    status: Optional[str] = None
    supported_currency: Optional[str] = None


class ComplianceDocOut(BaseModel):
    """合规文档响应。"""

    model_config = ConfigDict(extra="allow")

    id: Optional[str] = None
    market_code: Optional[str] = None
    doc_type: Optional[str] = None
    title: Optional[str] = None
    language: Optional[str] = None
    version: Optional[str] = None
    effective_date: Optional[str] = None


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


@router.get("", response_model=Page[MarketConfigOut])
def list_markets(
    published_only: bool = False,
    pagination: PaginationParams = Depends(),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """市场列表。published_only=True 时仅返回对外已发布市场（前台用）。

    非员工角色强制只看已发布市场：未发布市场及 vat_rate/transfer_fee_rate 等
    商业配置不对 C 端暴露（此前默认 published_only=False 且仅需登录即可读全量）。
    员工默认可见全部，保持既有内部行为不变。
    """
    effective_published_only = published_only or user.role not in STAFF_ROLES
    query = select(MarketConfig).where(MarketConfig.deleted_at.is_(None))
    if effective_published_only:
        query = query.where(MarketConfig.published.is_(True))
    query = query.order_by(MarketConfig.sort_order)
    page = paginate_query(session, query, pagination)
    page.items = [_market_dict(i) for i in page.items]
    return page


@router.post("")
def create_market(
    req: MarketIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    if user.role not in STAFF_ROLES:
        raise HTTPException(status_code=403, detail="No permission")
    market = MarketConfig(
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
    session.add(market)
    session.commit()
    session.refresh(market)
    return _market_dict(market)


@router.get("/channels", response_model=List[PaymentChannelOut])
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
    if user.role not in STAFF_ROLES:
        raise HTTPException(status_code=403, detail="No permission")
    channel = LocalPaymentChannel(
        market_code=req.market_code.upper(),
        channel_code=req.channel_code,
        channel_name=req.channel_name,
        channel_type=req.channel_type,
        merchant_id=req.merchant_id,
        supported_currency=req.supported_currency,
        sort_order=req.sort_order,
    )
    session.add(channel)
    session.commit()
    session.refresh(channel)
    return {
        "id": str(channel.id),
        "market_code": channel.market_code,
        "channel_code": channel.channel_code,
        "channel_name": channel.channel_name,
        "status": channel.status.value,
    }


@router.get("/compliance", response_model=List[ComplianceDocOut])
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
    if user.role not in STAFF_ROLES:
        raise HTTPException(status_code=403, detail="No permission")
    doc = ComplianceDoc(
        market_code=req.market_code.upper(),
        doc_type=req.doc_type,
        title=req.title,
        language=req.language,
        content=req.content,
        version=req.version,
    )
    session.add(doc)
    session.commit()
    session.refresh(doc)
    return {"id": str(doc.id), "market_code": doc.market_code, "title": doc.title}