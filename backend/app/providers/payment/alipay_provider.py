"""支付宝适配器 - 国际版 API（扫码预下单/查询/退款，使用 httpx 调用）"""
import base64
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
    ALIPAY_APP_ID,
    ALIPAY_PRIVATE_KEY,
    ALIPAY_PUBLIC_KEY,
    ALIPAY_SIGN_TYPE,
)


ALIPAY_GATEWAY = "https://open-sea.alipay.com/gateway.do"


def _get_app_id() -> str:
    return ALIPAY_APP_ID


def _get_private_key() -> str:
    """商户私钥（PEM 文本或裸 base64）"""
    return ALIPAY_PRIVATE_KEY


def _get_alipay_public_key() -> str:
    """支付宝公钥（PEM 文本或裸 base64），用于验签回调"""
    return ALIPAY_PUBLIC_KEY


def _get_sign_type() -> str:
    return ALIPAY_SIGN_TYPE


def _sign_params(params: dict) -> str:
    """支付宝签名：按字典序拼接待签名串，使用 RSA2(RSA-SHA256) 签名"""
    # 过滤空值与 sign 字段
    filtered = {
        k: v for k, v in params.items()
        if v not in (None, "") and k != "sign"
    }
    sorted_items = sorted(filtered.items())
    sign_str = "&".join(f"{k}={v}" for k, v in sorted_items)
    private_key_pem = _get_private_key()
    if not private_key_pem:
        return ""
    try:
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import padding

        if "BEGIN" not in private_key_pem:
            private_key_pem = (
                "-----BEGIN RSA PRIVATE KEY-----\n"
                + private_key_pem
                + "\n-----END RSA PRIVATE KEY-----"
            )
        key = serialization.load_pem_private_key(
            private_key_pem.encode("utf-8"), password=None
        )
        signature = key.sign(
            sign_str.encode("utf-8"),
            padding.PKCS1v15(),
            hashes.SHA256(),
        )
        return base64.b64encode(signature).decode("ascii")
    except Exception:
        return ""


def _build_public_params(method: str, biz_content: dict) -> dict:
    """构造支付宝公共请求参数并签名"""
    params = {
        "app_id": _get_app_id(),
        "method": method,
        "format": "JSON",
        "charset": "utf-8",
        "sign_type": _get_sign_type(),
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "version": "1.0",
        "biz_content": json.dumps(biz_content, ensure_ascii=False),
    }
    params["sign"] = _sign_params(params)
    return params


class AlipayProvider(PaymentProvider):
    """支付宝国际版适配器"""

    channel = PaymentChannel.ALIPAY

    def __init__(self):
        self._gateway = os.getenv("ALIPAY_GATEWAY", ALIPAY_GATEWAY)
        self._timeout = 30.0

    def create_payment(self, request: PaymentRequest) -> PaymentResult:
        """alipay.trade.precreate 扫码预下单，返回 qr_code"""
        biz_content = {
            "out_trade_no": request.idempotency_key,
            "total_amount": f"{request.amount:.2f}",
            "subject": request.description or "VIP APP Payment",
            "product_code": "FACE_TO_FACE_PAYMENT",
        }
        if request.metadata:
            biz_content["passback_params"] = json.dumps(
                request.metadata, ensure_ascii=False
            )
        params = _build_public_params("alipay.trade.precreate", biz_content)
        try:
            with httpx.Client(timeout=self._timeout) as client:
                resp = client.post(self._gateway, data=params)
            raw = resp.json()
            resp_data = raw.get("alipay_trade_precreate_response", {})
            if resp_data.get("code") == "10000":
                return PaymentResult(
                    success=True,
                    channel_transaction_id=request.idempotency_key,
                    qr_code_data=resp_data.get("qr_code"),
                    raw_response=raw,
                )
            return PaymentResult(
                success=False,
                error_message=resp_data.get(
                    "sub_msg", resp_data.get("msg", "Unknown error")
                ),
                raw_response=raw,
            )
        except httpx.HTTPError as e:
            return PaymentResult(success=False, error_message=str(e))

    def query_payment(self, channel_transaction_id: str) -> PaymentResult:
        """alipay.trade.query 查询订单状态"""
        biz_content = {"out_trade_no": channel_transaction_id}
        params = _build_public_params("alipay.trade.query", biz_content)
        try:
            with httpx.Client(timeout=self._timeout) as client:
                resp = client.post(self._gateway, data=params)
            raw = resp.json()
            resp_data = raw.get("alipay_trade_query_response", {})
            if resp_data.get("code") == "10000":
                trade_status = resp_data.get("trade_status", "")
                succeeded = trade_status in ("TRADE_SUCCESS", "TRADE_FINISHED")
                return PaymentResult(
                    success=succeeded,
                    channel_transaction_id=channel_transaction_id,
                    raw_response=raw,
                    error_message=None if succeeded else trade_status,
                )
            return PaymentResult(
                success=False,
                error_message=resp_data.get(
                    "sub_msg", resp_data.get("msg", "Unknown error")
                ),
                raw_response=raw,
            )
        except httpx.HTTPError as e:
            return PaymentResult(success=False, error_message=str(e))

    def refund(self, request: RefundRequest) -> RefundResult:
        """alipay.trade.refund 发起退款"""
        biz_content = {
            "out_trade_no": request.channel_transaction_id,
            "refund_amount": f"{request.amount:.2f}",
            "refund_reason": request.reason or "refund",
        }
        params = _build_public_params("alipay.trade.refund", biz_content)
        try:
            with httpx.Client(timeout=self._timeout) as client:
                resp = client.post(self._gateway, data=params)
            raw = resp.json()
            resp_data = raw.get("alipay_trade_refund_response", {})
            if resp_data.get("code") == "10000":
                return RefundResult(
                    success=True,
                    refund_id=resp_data.get("trade_no"),
                    raw_response=raw,
                )
            return RefundResult(
                success=False,
                error_message=resp_data.get(
                    "sub_msg", resp_data.get("msg", "Unknown error")
                ),
                raw_response=raw,
            )
        except httpx.HTTPError as e:
            return RefundResult(success=False, error_message=str(e))

    def verify_webhook(self, payload: dict, headers: dict) -> bool:
        """验证支付宝异步通知签名（RSA2）"""
        public_key = _get_alipay_public_key()
        if not public_key:
            return True  # 开发环境跳过
        sign = payload.get("sign", "")
        if not sign:
            return False
        # 按字典序拼接除 sign/sign_type 外的非空参数
        filtered = {
            k: v for k, v in payload.items()
            if k not in ("sign", "sign_type") and v not in (None, "")
        }
        sorted_items = sorted(filtered.items())
        sign_str = "&".join(f"{k}={v}" for k, v in sorted_items)
        try:
            from cryptography.hazmat.primitives import hashes, serialization
            from cryptography.hazmat.primitives.asymmetric import padding

            if "BEGIN" not in public_key:
                public_key = (
                    "-----BEGIN PUBLIC KEY-----\n"
                    + public_key
                    + "\n-----END PUBLIC KEY-----"
                )
            pub_key = serialization.load_pem_public_key(public_key.encode("utf-8"))
            pub_key.verify(
                base64.b64decode(sign),
                sign_str.encode("utf-8"),
                padding.PKCS1v15(),
                hashes.SHA256(),
            )
            return True
        except Exception:
            return False

    def parse_webhook(self, payload: dict, headers: dict) -> dict:
        """解析支付宝异步通知"""
        trade_status = payload.get("trade_status", "")
        status_map = {
            "TRADE_SUCCESS": "succeeded",
            "TRADE_FINISHED": "succeeded",
            "WAIT_BUYER_PAY": "pending",
            "TRADE_CLOSED": "canceled",
        }
        total_amount = payload.get("total_amount")
        return {
            "transaction_id": payload.get("trade_no")
            or payload.get("out_trade_no"),
            "status": status_map.get(trade_status, "unknown"),
            "amount": float(total_amount) if total_amount else None,
            "currency": payload.get("currency", "CNY"),
            "event_type": trade_status,
        }
