"""通用占位 Provider - 用于所有尚未具体实现的支付渠道"""
from urllib.parse import quote

from .base import (
    PaymentChannel,
    PaymentProvider,
    PaymentRequest,
    PaymentResult,
    RefundRequest,
    RefundResult,
)


class GenericProvider(PaymentProvider):
    """通用占位支付适配器

    为 GrabPay/TrueMoney/PayPal/PayNow/GCash/DANA/OVO/ShopeePay/
    BankTransfer/CreditCard/ApplePay/GooglePay/UnionPay/Boost/TouchNGo/
    MaybankQR/CIMBQR/BBLQR/KTBQR/SCBQR/KrungsriQR/Bizzby/LinePay/
    RabbitLinePay/AlipayHK 等 20+ 渠道提供占位实现。

    create_payment 返回指向 /payment/pending?channel=xxx 的模拟 checkout_url，
    便于前端在不接通真实渠道时进行流程联调。
    """

    def __init__(self, channel: PaymentChannel):
        self.channel = channel

    def create_payment(self, request: PaymentRequest) -> PaymentResult:
        """返回模拟 checkout_url，状态 pending"""
        channel_name = quote(self.channel.value)
        key = quote(request.idempotency_key)
        return PaymentResult(
            success=True,
            channel_transaction_id=request.idempotency_key,
            checkout_url=f"/payment/pending?channel={channel_name}&key={key}",
            raw_response={
                "mock": True,
                "channel": self.channel.value,
                "status": "pending",
            },
        )

    def query_payment(self, channel_transaction_id: str) -> PaymentResult:
        """返回 pending 状态"""
        return PaymentResult(
            success=False,
            channel_transaction_id=channel_transaction_id,
            raw_response={
                "mock": True,
                "channel": self.channel.value,
                "status": "pending",
            },
            error_message="pending",
        )

    def refund(self, request: RefundRequest) -> RefundResult:
        """模拟退款成功"""
        return RefundResult(
            success=True,
            refund_id=f"mock-refund-{request.channel_transaction_id}",
            raw_response={
                "mock": True,
                "channel": self.channel.value,
                "status": "refunded",
            },
        )

    def verify_webhook(self, payload: dict, headers: dict) -> bool:
        return True

    def parse_webhook(self, payload: dict, headers: dict) -> dict:
        """解析标准化回调负载，返回 {transaction_id, status, amount, currency}

        通用占位渠道使用平台自定义的标准化负载：
        {
          "event": "payment.succeeded",   // succeeded / failed / refunded / canceled
          "transaction_id": "xxx",        // 必须与支付单的 channel_transaction_id 一致
          "amount": 12500.0,
          "currency": "THB"
        }
        """
        event = payload.get("event", "")
        if not event and payload.get("type"):
            event = payload.get("type")
        status = "succeeded" if "succeed" in str(event).lower() else "unknown"
        if "fail" in str(event).lower():
            status = "failed"
        elif "refund" in str(event).lower():
            status = "refunded"
        elif "cancel" in str(event).lower():
            status = "canceled"
        return {
            "transaction_id": payload.get("transaction_id") or payload.get("id"),
            "status": status,
            "amount": payload.get("amount"),
            "currency": payload.get("currency"),
            "event_type": event,
        }
