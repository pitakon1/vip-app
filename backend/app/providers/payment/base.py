"""支付适配器基类 - 所有支付渠道实现此接口"""
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional
from enum import Enum


class PaymentChannel(str, Enum):
    STRIPE = "stripe"
    PROMPTPAY = "promptpay"
    WECHAT = "wechat"
    ALIPAY = "alipay"
    WISE = "wise"
    PAYPAL = "paypal"
    GRABPAY = "grabpay"
    TRUEMONEY = "truemoney"
    PAYNOW = "paynow"
    GCASH = "gcash"
    DANA = "dana"
    OVO = "ovo"
    SHOPEEPAY = "shopeepay"
    BANK_TRANSFER = "bank_transfer"
    CREDIT_CARD = "credit_card"
    APPLE_PAY = "apple_pay"
    GOOGLE_PAY = "google_pay"
    UNIONPAY = "unionpay"
    BOOST = "boost"
    TOUCH_N_GO = "touch_n_go"
    MAYBANK_QR = "maybank_qr"
    CIMB_QR = "cimb_qr"
    BBL_QR = "bbl_qr"
    KTB_QR = "ktb_qr"
    SCB_QR = "scb_qr"
    KRUNGSRI_QR = "krungsri_qr"
    BIZZBY = "bizzby"
    LINE_PAY = "line_pay"
    RABBIT_LINE_PAY = "rabbit_line_pay"
    ALIPAY_HK = "alipay_hk"


@dataclass
class PaymentRequest:
    """创建支付请求"""
    amount: float
    currency: str
    channel: PaymentChannel
    idempotency_key: str
    description: str = ""
    return_url: Optional[str] = None
    webhook_url: Optional[str] = None
    customer_email: Optional[str] = None
    metadata: Optional[dict] = None


@dataclass
class PaymentResult:
    """支付结果"""
    success: bool
    channel_transaction_id: Optional[str] = None
    checkout_url: Optional[str] = None  # 跳转支付页面的 URL
    qr_code_data: Optional[str] = None   # QR 码内容
    raw_response: Optional[dict] = None
    error_message: Optional[str] = None


@dataclass
class RefundRequest:
    """退款请求"""
    channel_transaction_id: str
    amount: float
    reason: str = ""


@dataclass
class RefundResult:
    """退款结果"""
    success: bool
    refund_id: Optional[str] = None
    raw_response: Optional[dict] = None
    error_message: Optional[str] = None


class PaymentProvider(ABC):
    """支付适配器抽象基类"""

    channel: PaymentChannel

    @abstractmethod
    def create_payment(self, request: PaymentRequest) -> PaymentResult:
        """创建支付"""
        ...

    @abstractmethod
    def query_payment(self, channel_transaction_id: str) -> PaymentResult:
        """查询支付状态"""
        ...

    @abstractmethod
    def refund(self, request: RefundRequest) -> RefundResult:
        """退款"""
        ...

    def verify_webhook(self, payload: dict, headers: dict) -> bool:
        """验证 webhook 签名"""
        return True

    def parse_webhook(self, payload: dict, headers: dict) -> dict:
        """解析 webhook，返回标准化结果 {transaction_id, status, amount}"""
        return {}
