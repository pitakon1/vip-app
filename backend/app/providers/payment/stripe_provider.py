"""Stripe 支付适配器 - 使用 httpx 调用 Stripe REST API（无需 stripe SDK）"""
import hashlib
import hmac
import json

import httpx

from .base import (
    PaymentChannel,
    PaymentProvider,
    PaymentRequest,
    PaymentResult,
    RefundRequest,
    RefundResult,
)
from .channel_config import STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET


STRIPE_API_BASE = "https://api.stripe.com/v1"


def _get_secret_key() -> str:
    """读取 Stripe 密钥（集中配置于 channel_config.py）"""
    return STRIPE_SECRET_KEY


def _get_webhook_secret() -> str:
    """读取 Stripe Webhook 密钥（集中配置于 channel_config.py）"""
    return STRIPE_WEBHOOK_SECRET


class StripeProvider(PaymentProvider):
    """Stripe 支付适配器"""

    channel = PaymentChannel.STRIPE

    def __init__(self):
        self._api_base = STRIPE_API_BASE
        self._timeout = 30.0

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {_get_secret_key()}",
            "Content-Type": "application/x-www-form-urlencoded",
        }

    def create_payment(self, request: PaymentRequest) -> PaymentResult:
        """创建 PaymentIntent"""
        data = {
            "amount": int(round(request.amount * 100)),  # 分
            "currency": request.currency.lower(),
            "description": request.description,
            "automatic_payment_methods[enabled]": "true",
        }
        if request.customer_email:
            data["receipt_email"] = request.customer_email
        if request.metadata:
            for k, v in request.metadata.items():
                data[f"metadata[{k}]"] = str(v)
        try:
            with httpx.Client(timeout=self._timeout) as client:
                resp = client.post(
                    f"{self._api_base}/payment_intents",
                    headers=self._headers(),
                    data=data,
                )
            raw = resp.json()
            if resp.is_success:
                next_action = raw.get("next_action") or {}
                hosted_url = next_action.get("hosted_voucher_url") or next_action.get("redirect_to_url", {}).get("url")
                return PaymentResult(
                    success=True,
                    channel_transaction_id=raw.get("id"),
                    checkout_url=hosted_url,
                    raw_response=raw,
                )
            return PaymentResult(
                success=False,
                error_message=raw.get("error", {}).get("message", resp.text),
                raw_response=raw,
            )
        except httpx.HTTPError as e:
            return PaymentResult(success=False, error_message=str(e))

    def query_payment(self, channel_transaction_id: str) -> PaymentResult:
        """查询 PaymentIntent 状态"""
        try:
            with httpx.Client(timeout=self._timeout) as client:
                resp = client.get(
                    f"{self._api_base}/payment_intents/{channel_transaction_id}",
                    headers=self._headers(),
                )
            raw = resp.json()
            if resp.is_success:
                status = raw.get("status")
                return PaymentResult(
                    success=status == "succeeded",
                    channel_transaction_id=raw.get("id"),
                    raw_response=raw,
                    error_message=None if status == "succeeded" else status,
                )
            return PaymentResult(
                success=False,
                error_message=raw.get("error", {}).get("message", resp.text),
                raw_response=raw,
            )
        except httpx.HTTPError as e:
            return PaymentResult(success=False, error_message=str(e))

    def refund(self, request: RefundRequest) -> RefundResult:
        """发起退款"""
        data = {
            "payment_intent": request.channel_transaction_id,
            "amount": int(round(request.amount * 100)),
        }
        if request.reason:
            data["reason"] = request.reason
        try:
            with httpx.Client(timeout=self._timeout) as client:
                resp = client.post(
                    f"{self._api_base}/refunds",
                    headers=self._headers(),
                    data=data,
                )
            raw = resp.json()
            if resp.is_success:
                return RefundResult(
                    success=True,
                    refund_id=raw.get("id"),
                    raw_response=raw,
                )
            return RefundResult(
                success=False,
                error_message=raw.get("error", {}).get("message", resp.text),
                raw_response=raw,
            )
        except httpx.HTTPError as e:
            return RefundResult(success=False, error_message=str(e))

    def verify_webhook(self, payload: dict, headers: dict) -> bool:
        """验证 Stripe Webhook 签名（Stripe-Signature 头）

        签名格式: t=timestamp,v1=signature
        签名算法: HMAC-SHA256(secret, "{timestamp}.{payload}")

        Stripe 的签名针对**原始请求 body 字节**，不能拿解析后的 JSON 重建——
        键序/转义一旦与原始报文不一致，真实回调也会验签失败、到账不入账。
        生产路径由 payments.py webhook 端点把原始 body 字节放进 headers 的
        `_stripe_raw_body` 键透传至此（经 payment_service.handle_webhook）；
        直接以 dict 调用时（测试/工具）退回紧凑 JSON 重建作为近似。
        """
        secret = _get_webhook_secret()
        if not secret:
            # fail closed：密钥为空时，攻击者用空密钥就能算出"合法"HMAC，
            # 等于完全没有验签。未配置即拒绝。
            return False
        sig_header = headers.get("Stripe-Signature") or headers.get("stripe-signature", "")
        if not sig_header:
            return False
        elements = {}
        for item in sig_header.split(","):
            if "=" in item:
                k, v = item.split("=", 1)
                elements[k] = v
        t = elements.get("t")
        v1 = elements.get("v1")
        if not t or not v1:
            return False
        raw = headers.get("_stripe_raw_body")
        if raw is not None:
            # 生产路径：直接用原始报文字节计算 HMAC
            payload_bytes = raw.encode("utf-8") if isinstance(raw, str) else raw
        else:
            # 兼容直接传 dict 的调用方（测试/工具）：以紧凑 JSON 重建（近似）
            payload_str = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
            payload_bytes = payload_str.encode("utf-8")
        signed_payload = str(t).encode("utf-8") + b"." + payload_bytes
        expected = hmac.new(
            secret.encode("utf-8"),
            signed_payload,
            hashlib.sha256,
        ).hexdigest()
        return hmac.compare_digest(expected, v1)

    def parse_webhook(self, payload: dict, headers: dict) -> dict:
        """解析 Stripe Webhook 事件，标准化为 {transaction_id, status, amount, ...}"""
        event_type = payload.get("type", "")
        obj = payload.get("data", {}).get("object", {})
        status_map = {
            "payment_intent.succeeded": "succeeded",
            "payment_intent.payment_failed": "failed",
            "payment_intent.canceled": "canceled",
            "payment_intent.processing": "processing",
            "charge.refunded": "refunded",
        }
        status = status_map.get(event_type, obj.get("status", "unknown"))
        amount = obj.get("amount_received") or obj.get("amount", 0)
        return {
            "transaction_id": obj.get("id"),
            "status": status,
            "amount": amount / 100.0,
            "currency": obj.get("currency"),
            "event_type": event_type,
        }
