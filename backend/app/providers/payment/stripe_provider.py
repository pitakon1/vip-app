"""Stripe 支付适配器 - 使用 httpx 调用 Stripe REST API（无需 stripe SDK）"""
import hashlib
import hmac
import json
from typing import Optional

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
        """
        sig_header = headers.get("Stripe-Signature") or headers.get("stripe-signature", "")
        secret = _get_webhook_secret()
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
        # Stripe 签名针对原始 body 字符串；此处以紧凑 JSON 重建（近似）
        payload_str = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
        signed_payload = f"{t}.{payload_str}"
        expected = hmac.new(
            secret.encode("utf-8"),
            signed_payload.encode("utf-8"),
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
