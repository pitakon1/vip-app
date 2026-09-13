"""多国扩张底座：市场配置、本地支付渠道、多国税务/法务合规。"""
from datetime import date
from enum import Enum
from typing import Optional

from sqlmodel import Field

from .base import TimestampMixin


class MarketStatus(str, Enum):
    """市场状态。"""

    active = "active"
    launching = "launching"
    paused = "paused"


class PaymentChannelStatus(str, Enum):
    """本地支付渠道状态。"""

    active = "active"
    disabled = "disabled"


class MarketConfig(TimestampMixin, table=True):
    """市场/国家配置（多市场多租户、分国运营参数）。"""

    __tablename__ = "market_configs"

    market_code: str = Field(unique=True, index=True, max_length=12)  # TH/VN/ID/MY/SG/PH...
    country_name: str = Field(max_length=120)
    currency: str = Field(default="THB", max_length=3)
    default_language: str = Field(default="th")   # th/vi/id/ms/zh/en
    timezone: str = Field(default="Asia/Bangkok")
    status: MarketStatus = Field(default=MarketStatus.launching)
    published: bool = Field(default=False)   # 是否对 C 端可见
    # 中介牌照/备案要求
    license_required: bool = Field(default=False)
    license_fieldref: Optional[str] = None
    # 税务
    vat_rate: float = Field(default=0.0)
    transfer_fee_rate: float = Field(default=0.0)   # 过户费率
    tax_notes: Optional[str] = None
    # 合规
    pdpa_enabled: bool = Field(default=True)
    consent_language: Optional[str] = None
    # 排序/引流权重
    sort_order: int = Field(default=100)


class LocalPaymentChannel(TimestampMixin, table=True):
    """本地支付渠道（PromptPay/PayNow/GrabPay/PayMaya 等）。"""

    __tablename__ = "local_payment_channels"

    market_code: str = Field(index=True, max_length=12)
    channel_code: str = Field(max_length=40)  # promptpay/paynow/grabpay/shopee_pay...
    channel_name: str = Field(max_length=120)
    channel_type: str = Field(default="wallet")  # wallet/bank_transfer/qr/installment
    status: PaymentChannelStatus = Field(default=PaymentChannelStatus.active)
    merchant_id: Optional[str] = None
    config_json: Optional[str] = None
    supported_currency: str = Field(default="THB", max_length=3)
    # 排序
    sort_order: int = Field(default=100)


class ComplianceDoc(TimestampMixin, table=True):
    """多国合规文档（法务模板/牌照/PDPA 版本按市场归档）。"""

    __tablename__ = "compliance_docs"

    market_code: str = Field(index=True, max_length=12)
    doc_type: str = Field(default="contract_template")  # template/contract_terms/license/pdpa
    title: str = Field(max_length=255)
    language: str = Field(default="en", max_length=8)
    content: Optional[str] = None
    s3_url: Optional[str] = None
    version: str = Field(default="1.0")
    is_active: bool = Field(default=True)
    effective_date: Optional[date] = None