"""业务规则与定价模块。

集中承载《待确认问题清单》备注中已确认、可直接落码的规则，供各 API/前端消费：

- A5  增值服务价目：硬编码基准价，不含税（税费另行计算，泰国 VAT=7%）
- A7  多币种：以泰铢为主，另提供人民币/美元/欧元展示换算
- E5  税费承担：业主自理，平台不代扣
- E6/E7 押金规则：默认押金归业主，退租原路退回；对私押 2 付 1、对公押 3 付 1
- F  角色边界：admin/agent/owner/tenant/employee 已在 user 模型定义
"""
from __future__ import annotations

from enum import Enum
from typing import Dict


# ---- 多币种（A7：泰铢为主，人民币/美元/欧元展示）----
class Currency(str, Enum):
    thb = "THB"
    cny = "CNY"
    usd = "USD"
    eur = "EUR"


# 基准换算率：THB = 1，其余为 "1 单位外币 = THB 倍数"
CURRENCY_TO_THB: Dict[str, float] = {
    Currency.thb.value: 1.0,
    Currency.cny.value: 5.2,
    Currency.usd.value: 36.0,
    Currency.eur.value: 39.0,
}


def convert_to_thb(amount: float, currency: str) -> float:
    """按基准率将某币种金额换算为泰铢。"""
    mult = CURRENCY_TO_THB.get(currency.upper(), 1.0)
    return round(amount * mult, 2)


def convert_from_thb(amount_thb: float, currency: str) -> float:
    """将泰铢金额换算为目标展示币种。"""
    mult = CURRENCY_TO_THB.get(currency.upper(), 1.0)
    return round(amount_thb / mult, 2) if mult else 0.0


# ---- 价税分离（A5：定位不含税，税费另算；泰国 VAT 7%）----
VAT_RATE = 0.07  # 泰国 VAT 7%，仅作为展示拆分，不由平台代扣


class ServiceCode(str, Enum):
    cleaning = "cleaning"  # 清洁
    ac_cleaning = "ac_cleaning"  # 空调清洗
    utility_payment = "utility_payment"  # 水电代缴（公共事业接口）
    insurance = "insurance"  # 保险
    wifi_install = "wifi_install"  # 网络安装


# 硬编码基准价（不含税），对应备注 A5
SERVICE_PRICE_CATALOG: Dict[str, dict] = {
    ServiceCode.cleaning.value: {
        "label_zh": "深度清洁",
        "label_en": "Deep Cleaning",
        "label_th": "ทำความสะอาด",
        "unit": "次",
        "base_price": 1500.0,
        "tax_inclusive": False,  # 不含税，税费另算
    },
    ServiceCode.ac_cleaning.value: {
        "label_zh": "空调清洗",
        "label_en": "AC Cleaning",
        "label_th": "ล้างแอร์",
        "unit": "台",
        "base_price": 800.0,
        "tax_inclusive": False,
    },
    ServiceCode.utility_payment.value: {
        "label_zh": "水电代缴",
        "label_en": "Utility Payment",
        "label_th": "ชำระค่าน้ำไฟ",
        "unit": "月",
        "base_price": 200.0,
        "tax_inclusive": False,
    },
    ServiceCode.insurance.value: {
        "label_zh": "保险",
        "label_en": "Insurance",
        "label_th": "ประกัน",
        "unit": "次",
        "base_price": 300.0,
        "tax_inclusive": False,
    },
    ServiceCode.wifi_install.value: {
        "label_zh": "网络安装",
        "label_en": "WiFi Install",
        "label_th": "ติดตั้งอินเทอร์เน็ต",
        "unit": "次",
        "base_price": 500.0,
        "tax_inclusive": False,
    },
}


def service_quote(code: str, qty: int = 1) -> dict:
    """按其备注 A5 生成含 不含税价 / 税费 / 合计 的结构，税费由业主自理。"""
    item = SERVICE_PRICE_CATALOG.get(code)
    if item is None:
        raise KeyError(f"Unknown service code: {code}")
    base = round(item["base_price"] * qty, 2)
    tax = round(base * VAT_RATE, 2)
    return {
        "code": code,
        **item,
        "quantity": qty,
        "base_amount": base,
        "tax_amount": tax,  # 税费另算
        "total_amount": round(base + tax, 2),
        "tax_inclusive": False,
    }


# ---- 押金规则（E6/E7：对私押 2 付 1、对公押 3 付 1；默认归业主）----
class OwnerType(str, Enum):
    individual = "individual"  # 对私 / 个人业主
    corporate = "corporate"  # 对公 / 公司业主


# 押金 = 押金月数 × 月租；默认规则：对私 2 个月、对公 3 个月
DEPOSIT_MONTHS_BY_OWNER: Dict[str, int] = {
    OwnerType.individual.value: 2,
    OwnerType.corporate.value: 3,
}


def compute_deposit_amount(monthly_rent: float, owner_type: str) -> float:
    """按押金规则计算默认押金（月数 × 月租）。"""
    months = DEPOSIT_MONTHS_BY_OWNER.get(owner_type, 2)
    return round(monthly_rent * months, 2)


# 押金去向与退款通道（E6）：默认押金归业主持有，退租原路退回
DEPOSIT_HELD_BY = "owner"  # owner/tenant/prorated
RETURN_ORIGINAL_CHANNEL = True