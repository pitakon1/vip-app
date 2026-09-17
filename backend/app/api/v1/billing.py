"""定价与业务规则 API。

把《待确认问题清单》备注中的计价/多币种/押金规则暴露给前端：
- GET /billing/pricing  业务规则总览（增值服务价目、押金规则、币种换算、税费拆分）
- GET /billing/pricing/quotes?code=...&qty=...  单个服务计价（价税分离）
- GET /billing/pricing/convert?amount=..&from=..&to=..  多币种换算
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from app.core.auth import get_current_user
from app.models.user import User
from app.services.pricing import (
    CURRENCY_TO_THB,
    DEPOSIT_MONTHS_BY_OWNER,
    DEPOSIT_HELD_BY,
    RETURN_ORIGINAL_CHANNEL,
    SERVICE_PRICE_CATALOG,
    VAT_RATE,
    convert_from_thb,
    convert_to_thb,
    service_quote,
)

router = APIRouter(prefix="/billing", tags=["billing", "pricing"])


class PricingRulesOut(BaseModel):
    """业务规则总览（价目 / 押金 / 币种 / 税费）。"""

    model_config = ConfigDict(extra="allow")

    service_catalog: Optional[dict] = None
    vat: Optional[dict] = None
    deposit: Optional[dict] = None
    currency: Optional[dict] = None


class ServiceQuoteOut(BaseModel):
    """单个服务报价（价税分离）。"""

    model_config = ConfigDict(extra="allow")

    code: Optional[str] = None
    label_zh: Optional[str] = None
    label_en: Optional[str] = None
    label_th: Optional[str] = None
    unit: Optional[str] = None
    base_price: Optional[float] = None
    quantity: Optional[int] = None
    base_amount: Optional[float] = None
    tax_amount: Optional[float] = None
    total_amount: Optional[float] = None
    tax_inclusive: Optional[bool] = None


class CurrencyConvertOut(BaseModel):
    """多币种换算结果。"""

    model_config = ConfigDict(extra="allow")

    amount: Optional[float] = None
    from_currency: Optional[str] = Field(default=None, alias="from")
    to_currency: Optional[str] = Field(default=None, alias="to")
    amount_in_thb: Optional[float] = None
    result: Optional[float] = None


class IntegrationStatusOut(BaseModel):
    """第三方对接状态。"""

    model_config = ConfigDict(extra="allow")

    payment: Optional[dict] = None
    reserved: Optional[dict] = None


@router.get("/pricing", response_model=PricingRulesOut)
def get_pricing_rules(user: User = Depends(get_current_user)):
    """业务规则总览：价目（不含税）、押金规则、多币种、税费。"""
    return {
        "service_catalog": SERVICE_PRICE_CATALOG,
        "vat": {"rate": VAT_RATE, "mode": "exclusive", "note": "税费另算，业主自理"},
        "deposit": {
            "months_by_owner_type": DEPOSIT_MONTHS_BY_OWNER,
            "held_by": DEPOSIT_HELD_BY,
            "return_original_channel": RETURN_ORIGINAL_CHANNEL,
        },
        "currency": {
            "base": "THB",
            "rates_to_thb": CURRENCY_TO_THB,
            "supported": list(CURRENCY_TO_THB.keys()),
        },
    }


@router.get("/pricing/quotes", response_model=ServiceQuoteOut)
def get_service_quote(code: str, qty: int = 1, user: User = Depends(get_current_user)):
    """按服务编码返回价税分离的报价。"""
    try:
        return service_quote(code, qty)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Unknown service code: {code}")


@router.get("/pricing/convert", response_model=CurrencyConvertOut)
def convert_currency(
    amount: float,
    from_currency: str,
    to_currency: str,
    user: User = Depends(get_current_user),
):
    """多币种换算（基于基准率）。"""
    if from_currency.upper() not in CURRENCY_TO_THB or to_currency.upper() not in CURRENCY_TO_THB:
        raise HTTPException(status_code=400, detail="Unsupported currency")
    amount_thb = convert_to_thb(amount, from_currency)
    return {
        "amount": amount,
        "from": from_currency.upper(),
        "to": to_currency.upper(),
        "amount_in_thb": amount_thb,
        "result": convert_from_thb(amount_thb, to_currency),
    }


@router.get("/integrations", response_model=IntegrationStatusOut)
def list_integration_status(user: User = Depends(get_current_user)):
    """第三方对接状态（H 组：支付已实现，OCR/短信/通知/地图/税务为预留 stub）。"""
    from app.providers.registry import RESERVED_REGISTRY

    reserved = {
        channel: {
            "status": "reserved",
            "configured": provider.is_configured(),
            "required_credentials": list(provider.required_credentials.keys()),
        }
        for channel, provider in RESERVED_REGISTRY.items()
    }
    return {
        "payment": {
            "status": "implemented",
            "channels": ["stripe", "promptpay", "wechat", "alipay", "wise"],
        },
        "reserved": reserved,
    }