"""定价与业务规则 API。

把《待确认问题清单》备注中的计价/多币种/押金规则暴露给前端：
- GET /billing/pricing  业务规则总览（增值服务价目、押金规则、币种换算、税费拆分）
- GET /billing/pricing/quotes?code=...&qty=...  单个服务计价（价税分离）
- GET /billing/pricing/convert?amount=..&from=..&to=..  多币种换算
"""
from fastapi import APIRouter, HTTPException

from app.core.auth import get_current_user  # noqa: F401  (占位，未来可做权限)
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


@router.get("/pricing")
def get_pricing_rules():
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


@router.get("/pricing/quotes")
def get_service_quote(code: str, qty: int = 1):
    """按服务编码返回价税分离的报价。"""
    try:
        return service_quote(code, qty)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Unknown service code: {code}")


@router.get("/pricing/convert")
def convert_currency(amount: float, from_currency: str, to_currency: str):
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


@router.get("/integrations")
def list_integration_status():
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