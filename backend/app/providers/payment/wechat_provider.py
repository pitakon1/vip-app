"""微信支付 V3 适配器（跨境/国际版 Native 支付，使用 httpx 调用）"""
import base64
import hashlib
import json
import os
import time

import httpx

from .base import (
    PaymentChannel,
    PaymentProvider,
    PaymentRequest,
    PaymentResult,
    RefundRequest,
    RefundResult,
)
from .channel_config import (
    WECHAT_API_KEY,
    WECHAT_APP_ID,
    WECHAT_CERT_SERIAL_NO,
    WECHAT_MERCHANT_ID,
    WECHAT_PLATFORM_CERT,
    WECHAT_PRIVATE_KEY,
)


WECHAT_API_BASE = "https://api.mch.weixin.qq.com"


def _get_merchant_id() -> str:
    return WECHAT_MERCHANT_ID


def _get_api_key() -> str:
    """APIv3 密钥（32字节），用于回调报文解密"""
    return WECHAT_API_KEY


def _get_app_id() -> str:
    return WECHAT_APP_ID


def _get_serial_no() -> str:
    """商户证书序列号"""
    return WECHAT_CERT_SERIAL_NO


def _get_private_key() -> str:
    """商户私钥（PEM 文本）"""
    return WECHAT_PRIVATE_KEY


def _get_platform_cert() -> str:
    """微信平台证书公钥（PEM 文本），用于验签回调"""
    return WECHAT_PLATFORM_CERT


class WechatProvider(PaymentProvider):
    """微信支付 V3 适配器"""

    channel = PaymentChannel.WECHAT

    def __init__(self):
        self._api_base = WECHAT_API_BASE
        self._timeout = 30.0

    def _sign(self, message: str) -> str:
        """使用商户私钥对消息进行 RSA-SHA256 签名"""
        private_key_pem = _get_private_key()
        if not private_key_pem:
            return ""
        try:
            from cryptography.hazmat.primitives import hashes, serialization
            from cryptography.hazmat.primitives.asymmetric import padding

            key = serialization.load_pem_private_key(
                private_key_pem.encode("utf-8"), password=None
            )
            signature = key.sign(
                message.encode("utf-8"),
                padding.PKCS1v15(),
                hashes.SHA256(),
            )
            return base64.b64encode(signature).decode("ascii")
        except Exception:
            return ""

    def _headers(self, method: str, url: str, body: str = "") -> dict:
        """构造微信支付 V3 签名请求头"""
        timestamp = str(int(time.time()))
        nonce = os.urandom(16).hex()
        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": "VIP-APP/1.0",
        }
        serial_no = _get_serial_no()
        if serial_no:
            message = f"{timestamp}\n{nonce}\n{method}\n{url}\n{body}\n"
            signature = self._sign(message)
            if signature:
                headers["Authorization"] = (
                    f'WECHATPAY2-SHA256-RSA2048 mchid="{_get_merchant_id()}",'
                    f'nonce_str="{nonce}",timestamp="{timestamp}",'
                    f'serial_no="{serial_no}",signature="{signature}"'
                )
        return headers

    def create_payment(self, request: PaymentRequest) -> PaymentResult:
        """Native 下单，返回 QR 码 code_url"""
        url = "/v3/pay/transactions/native"
        body = {
            "appid": _get_app_id(),
            "mchid": _get_merchant_id(),
            "description": request.description or "VIP APP Payment",
            "out_trade_no": request.idempotency_key,
            "notify_url": request.webhook_url or "",
            "amount": {
                "total": int(round(request.amount * 100)),  # 分
                "currency": request.currency.upper() if request.currency else "CNY",
            },
        }
        if request.metadata:
            body["attach"] = json.dumps(request.metadata, ensure_ascii=False)[:128]
        body_str = json.dumps(body, ensure_ascii=False)
        try:
            with httpx.Client(timeout=self._timeout) as client:
                resp = client.post(
                    f"{self._api_base}{url}",
                    headers=self._headers("POST", url, body_str),
                    content=body_str.encode("utf-8"),
                )
            raw = resp.json()
            if resp.is_success:
                return PaymentResult(
                    success=True,
                    channel_transaction_id=request.idempotency_key,
                    qr_code_data=raw.get("code_url"),
                    raw_response=raw,
                )
            return PaymentResult(
                success=False,
                error_message=raw.get("message", resp.text),
                raw_response=raw,
            )
        except httpx.HTTPError as e:
            return PaymentResult(success=False, error_message=str(e))

    def query_payment(self, channel_transaction_id: str) -> PaymentResult:
        """通过商户单号查询订单状态"""
        mchid = _get_merchant_id()
        url = f"/v3/pay/transactions/out-trade-no/{channel_transaction_id}?mchid={mchid}"
        try:
            with httpx.Client(timeout=self._timeout) as client:
                resp = client.get(
                    f"{self._api_base}{url}",
                    headers=self._headers("GET", url),
                )
            raw = resp.json()
            if resp.is_success:
                status = raw.get("trade_state", "UNKNOWN")
                return PaymentResult(
                    success=status == "SUCCESS",
                    channel_transaction_id=channel_transaction_id,
                    raw_response=raw,
                    error_message=None if status == "SUCCESS" else status,
                )
            return PaymentResult(
                success=False,
                error_message=raw.get("message", resp.text),
                raw_response=raw,
            )
        except httpx.HTTPError as e:
            return PaymentResult(success=False, error_message=str(e))

    def refund(self, request: RefundRequest) -> RefundResult:
        """发起退款"""
        url = "/v3/refund/domestic/refunds"
        body = {
            "out_trade_no": request.channel_transaction_id,
            "out_refund_no": f"RF{int(time.time())}",
            "reason": request.reason or "refund",
            "amount": {
                "refund": int(round(request.amount * 100)),
                "total": int(round(request.amount * 100)),
                "currency": "CNY",
            },
        }
        body_str = json.dumps(body, ensure_ascii=False)
        try:
            with httpx.Client(timeout=self._timeout) as client:
                resp = client.post(
                    f"{self._api_base}{url}",
                    headers=self._headers("POST", url, body_str),
                    content=body_str.encode("utf-8"),
                )
            raw = resp.json()
            if resp.is_success:
                return RefundResult(
                    success=True,
                    refund_id=raw.get("refund_id"),
                    raw_response=raw,
                )
            return RefundResult(
                success=False,
                error_message=raw.get("message", resp.text),
                raw_response=raw,
            )
        except httpx.HTTPError as e:
            return RefundResult(success=False, error_message=str(e))

    def verify_webhook(self, payload: dict, headers: dict) -> bool:
        """验证微信支付 V3 回调签名

        完整验签需用微信平台证书公钥（Wechatpay-Serial 对应）对
        '{timestamp}\\n{nonce}\\n{body}\\n' 做 RSA-SHA256 验签。
        开发环境（无平台证书）跳过验证。
        """
        timestamp = headers.get("Wechatpay-Timestamp", "")
        nonce = headers.get("Wechatpay-Nonce", "")
        signature = headers.get("Wechatpay-Signature", "")
        if not all([timestamp, nonce, signature]):
            return False
        platform_cert = _get_platform_cert()
        if not platform_cert:
            # fail closed：未配置微信平台证书时无法验签，直接拒绝而非放行
            return False
        body = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
        message = f"{timestamp}\n{nonce}\n{body}\n"
        try:
            from cryptography.hazmat.primitives import hashes, serialization
            from cryptography.hazmat.primitives.asymmetric import padding

            if "BEGIN" not in platform_cert:
                platform_cert = (
                    "-----BEGIN PUBLIC KEY-----\n"
                    + platform_cert
                    + "\n-----END PUBLIC KEY-----"
                )
            pub_key = serialization.load_pem_public_key(platform_cert.encode("utf-8"))
            pub_key.verify(
                base64.b64decode(signature),
                message.encode("utf-8"),
                padding.PKCS1v15(),
                hashes.SHA256(),
            )
            return True
        except Exception:
            return False

    def parse_webhook(self, payload: dict, headers: dict) -> dict:
        """解析微信回调，使用 APIv3 密钥 AES-256-GCM 解密 resource"""
        api_key = _get_api_key()
        resource = payload.get("resource", {})
        ciphertext = resource.get("ciphertext", "")
        nonce = resource.get("nonce", "")
        associated_data = resource.get("associated_data", "")
        result = {
            "transaction_id": None,
            "status": "unknown",
            "amount": None,
            "event_type": payload.get("event_type"),
        }
        if ciphertext and api_key:
            try:
                plaintext = _decrypt_aes_gcm(
                    api_key, nonce, ciphertext, associated_data
                )
                data = json.loads(plaintext)
                status_map = {
                    "SUCCESS": "succeeded",
                    "NOTPAY": "pending",
                    "USERPAYING": "pending",
                    "CLOSED": "canceled",
                    "REVOKED": "canceled",
                    "REFUND": "refunded",
                    "PAYERROR": "failed",
                }
                trade_state = data.get("trade_state", "")
                result = {
                    "transaction_id": data.get("transaction_id")
                    or data.get("out_trade_no"),
                    "status": status_map.get(trade_state, "unknown"),
                    "amount": (data.get("amount", {}).get("total", 0)) / 100.0,
                    "currency": data.get("amount", {}).get("currency"),
                    "event_type": payload.get("event_type"),
                }
            except Exception:
                pass
        return result


def _decrypt_aes_gcm(
    key: str, nonce: str, ciphertext: str, associated_data: str
) -> str:
    """使用 AES-256-GCM 解密微信回调资源（APIv3 密钥）"""
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM

    key_bytes = hashlib.sha256(key.encode("utf-8")).digest()  # 确保 32 字节
    cipher_bytes = base64.b64decode(ciphertext)
    aesgcm = AESGCM(key_bytes)
    ad = associated_data.encode("utf-8") if associated_data else None
    plaintext = aesgcm.decrypt(nonce.encode("utf-8"), cipher_bytes, ad)
    return plaintext.decode("utf-8")
