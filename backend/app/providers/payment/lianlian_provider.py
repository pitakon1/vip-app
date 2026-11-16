"""LianLian Global（泰国）支付适配器。

对接文档：https://doc.lianlianpay.co.th/

实现范围：
- 收银台下单：POST /gateway  service=llpth.checkout.apply
- 支付查询：  GET  /gateway  service=llpth.payment.query
- 退款：      POST /gateway  service=llpth.refund.apply
- 回调验签：  通知报文放在 body，签名放在请求头 `sign`（`sign-type: RSA`）

签名算法（文档 /docs/signature）：把请求 body 递归按 key 升序展开为
`k1=v1&k2=v2...`，再对该字符串做 SHA1withRSA，结果 base64 放入 `sign` 头。
注意：GET 请求的签名范围是 query，POST 是 body。
"""
import base64
import uuid
from datetime import datetime, timezone
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
from .channel_config import (
    LIANLIAN_BASE_URL,
    LIANLIAN_MERCHANT_ID,
    LIANLIAN_NOTIFY_URL,
    LIANLIAN_PAYMENT_METHOD,
    LIANLIAN_PRIVATE_KEY,
    LIANLIAN_PUBLIC_KEY,
    LIANLIAN_REDIRECT_URL,
    LIANLIAN_STORE_ID,
)

SUCCESS_CODE = 200000

# 文档 /docs/reference/payment-status：PI/WP/PS/PF/PE
PAYMENT_STATUS_MAP = {
    "PI": "pending",
    "WP": "processing",
    "PS": "succeeded",
    "PF": "failed",
    "PE": "expired",
}

# 退款状态：RP=处理中、RS=成功、RF=失败（见 /docs/reference/refund-status）。
# 退款结果不直接改写原支付单状态：service.refund 已按实际退款金额落退款单，
# 这里只留档，避免部分退款被回调误标成整单 refunded。
REFUND_STATUS_MAP = {
    "RP": "refund_processing",
    "RS": "refund_completed",
    "RF": "refund_failed",
}


def _load_private_key():
    """加载商户私钥，支持 PEM 文本与文档示例中的裸 base64。"""
    text = (LIANLIAN_PRIVATE_KEY or "").strip().replace("\\n", "\n")
    if not text:
        return None
    from cryptography.hazmat.primitives import serialization

    candidates = [text]
    if "BEGIN" not in text:
        candidates = [
            f"-----BEGIN PRIVATE KEY-----\n{text}\n-----END PRIVATE KEY-----",
            f"-----BEGIN RSA PRIVATE KEY-----\n{text}\n-----END RSA PRIVATE KEY-----",
        ]
    for candidate in candidates:
        try:
            return serialization.load_pem_private_key(
                candidate.encode("utf-8"), password=None
            )
        except (ValueError, TypeError):
            continue
    return None


def _load_public_key():
    """加载 LianLian 公钥，用于回调验签。"""
    text = (LIANLIAN_PUBLIC_KEY or "").strip().replace("\\n", "\n")
    if not text:
        return None
    from cryptography.hazmat.primitives import serialization

    candidate = text
    if "BEGIN" not in text:
        candidate = f"-----BEGIN PUBLIC KEY-----\n{text}\n-----END PUBLIC KEY-----"
    try:
        return serialization.load_pem_public_key(candidate.encode("utf-8"))
    except (ValueError, TypeError):
        return None


def _stringify(value) -> str:
    """签名串里的值统一转文本；布尔按 JSON 小写形式输出。"""
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


def _canonical_string(payload: dict) -> str:
    """按 LianLian 文档生成待签名串。

    规则：外层 key 升序；JSON 对象递归升序；JSON 数组逐个元素展开，
    元素内 key 也升序。空值（None）不参与签名。
    """
    parts: list[str] = []

    def walk(key: str, value) -> None:
        if value is None:
            return
        if isinstance(value, dict):
            for child_key in sorted(value.keys(), key=str):
                walk(str(child_key), value[child_key])
        elif isinstance(value, list):
            for item in value:
                walk(key, item)
        else:
            parts.append(f"{key}={_stringify(value)}")

    for key in sorted((payload or {}).keys(), key=str):
        walk(str(key), payload[key])
    return "&".join(parts)


def _signature_headers(payload: dict) -> dict:
    """对待签名数据做 SHA1withRSA，返回 LianLian 要求的请求头。"""
    private_key = _load_private_key()
    if private_key is None:
        return {}
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.asymmetric import padding

    signature = private_key.sign(
        _canonical_string(payload).encode("utf-8"),
        padding.PKCS1v15(),
        hashes.SHA1(),
    )
    return {
        "Content-Type": "application/json",
        "sign-type": "RSA",
        "sign": base64.b64encode(signature).decode("ascii"),
    }


class LianLianProvider(PaymentProvider):
    """LianLian Global 泰国收银台适配器。"""

    channel = PaymentChannel.LIANLIAN

    def __init__(self):
        self._gateway = f"{(LIANLIAN_BASE_URL or '').rstrip('/')}/gateway"
        self._timeout = 30.0

    def _configured(self) -> Optional[str]:
        """返回缺失配置的错误文案；配置齐全时返回 None（fail closed）。"""
        missing = []
        if not LIANLIAN_MERCHANT_ID:
            missing.append("LIANLIAN_MERCHANT_ID")
        if not LIANLIAN_PRIVATE_KEY or _load_private_key() is None:
            missing.append("LIANLIAN_PRIVATE_KEY")
        if not LIANLIAN_BASE_URL:
            missing.append("LIANLIAN_BASE_URL")
        if missing:
            return "LianLian is not configured: missing " + ", ".join(missing)
        return None

    def create_payment(self, request: PaymentRequest) -> PaymentResult:
        """创建收银台支付单，返回可跳转的 link_url。

        `channel_transaction_id` 落的是 **merchant_order_id**：LianLian 的查询与
        退款接口都只接受商户订单号，落 order_id 会导致后续无法查询/退款。
        渠道真实 order_id 保留在 raw_response 里备查。
        """
        config_error = self._configured()
        if config_error:
            return PaymentResult(success=False, error_message=config_error)

        metadata = request.metadata or {}
        customer_user_id = str(
            metadata.get("payer_id")
            or metadata.get("payment_id")
            or request.idempotency_key
        )[:64]
        customer_name = str(
            metadata.get("payer_name")
            or request.customer_email
            or "VIP APP User"
        )[:128]

        body = {
            "version": "v1",
            "service": "llpth.checkout.apply",
            "merchant_id": LIANLIAN_MERCHANT_ID,
            "merchant_order_id": request.idempotency_key,
            "order_amount": f"{float(request.amount):.2f}",
            "order_currency": (request.currency or "THB").upper(),
            "order_desc": (request.description or "VIP APP Payment")[:256],
            "customer": {
                "merchant_user_id": customer_user_id,
                "full_name": customer_name,
            },
        }
        if LIANLIAN_STORE_ID:
            body["store_id"] = LIANLIAN_STORE_ID
        if LIANLIAN_PAYMENT_METHOD:
            body["payment_method"] = LIANLIAN_PAYMENT_METHOD
        if LIANLIAN_NOTIFY_URL:
            body["notify_url"] = LIANLIAN_NOTIFY_URL
        if LIANLIAN_REDIRECT_URL:
            body["redirect_url"] = LIANLIAN_REDIRECT_URL

        try:
            with httpx.Client(timeout=self._timeout) as client:
                resp = client.post(
                    self._gateway,
                    headers=_signature_headers(body),
                    json=body,
                )
            raw = resp.json()
        except (httpx.HTTPError, ValueError) as e:
            return PaymentResult(success=False, error_message=str(e))

        if resp.is_success and raw.get("code") == SUCCESS_CODE:
            data = raw.get("data") or {}
            return PaymentResult(
                success=True,
                channel_transaction_id=request.idempotency_key,
                checkout_url=data.get("link_url"),
                qr_code_data=data.get("qr_code"),
                raw_response=raw,
            )
        return PaymentResult(
            success=False,
            error_message=str(raw.get("message") or resp.text or "create order failed"),
            raw_response=raw,
        )

    def query_payment(self, channel_transaction_id: str) -> PaymentResult:
        """按商户订单号查询支付状态。"""
        config_error = self._configured()
        if config_error:
            return PaymentResult(success=False, error_message=config_error)

        params = {
            "version": "v1",
            "service": "llpth.payment.query",
            "merchant_id": LIANLIAN_MERCHANT_ID,
            "merchant_order_id": channel_transaction_id,
        }
        try:
            with httpx.Client(timeout=self._timeout) as client:
                resp = client.get(
                    self._gateway,
                    params=params,
                    headers=_signature_headers(params),
                )
            raw = resp.json()
        except (httpx.HTTPError, ValueError) as e:
            return PaymentResult(success=False, error_message=str(e))

        if not (resp.is_success and raw.get("code") == SUCCESS_CODE):
            return PaymentResult(
                success=False,
                error_message=str(raw.get("message") or resp.text or "query failed"),
                raw_response=raw,
            )

        data = raw.get("data") or {}
        order_status = str(data.get("order_status") or "").upper()
        succeeded = order_status == "PS"
        return PaymentResult(
            success=succeeded,
            channel_transaction_id=channel_transaction_id,
            raw_response=raw,
            error_message=None
            if succeeded
            else PAYMENT_STATUS_MAP.get(order_status, order_status or "unknown"),
        )

    def refund(self, request: RefundRequest) -> RefundResult:
        """发起退款；merchant_refund_id 每次退款唯一。"""
        config_error = self._configured()
        if config_error:
            return RefundResult(success=False, error_message=config_error)

        merchant_refund_id = (
            f"RF{datetime.now(timezone.utc):%Y%m%d%H%M%S}"
            f"{uuid.uuid4().hex[:8]}"
        )
        body = {
            "version": "v1",
            "service": "llpth.refund.apply",
            "merchant_id": LIANLIAN_MERCHANT_ID,
            "merchant_order_id": request.channel_transaction_id,
            "merchant_refund_id": merchant_refund_id,
            "refund_amount": f"{float(request.amount):.2f}",
            "refund_currency": (request.currency or "THB").upper(),
        }
        if request.reason:
            body["refund_reason"] = request.reason[:256]
        if LIANLIAN_NOTIFY_URL:
            body["notify_url"] = LIANLIAN_NOTIFY_URL

        try:
            with httpx.Client(timeout=self._timeout) as client:
                resp = client.post(
                    self._gateway,
                    headers=_signature_headers(body),
                    json=body,
                )
            raw = resp.json()
        except (httpx.HTTPError, ValueError) as e:
            return RefundResult(success=False, error_message=str(e))

        if not (resp.is_success and raw.get("code") == SUCCESS_CODE):
            return RefundResult(
                success=False,
                error_message=str(raw.get("message") or resp.text or "refund failed"),
                raw_response=raw,
            )

        data = raw.get("data") or {}
        refund_status = str(data.get("refund_status") or "").upper()
        # RP 表示渠道已受理、异步处理，按成功返回；RF 为明确失败。
        succeeded = refund_status in ("RP", "RS", "")
        return RefundResult(
            success=succeeded,
            refund_id=data.get("refund_order_id") or merchant_refund_id,
            raw_response=raw,
            error_message=None if succeeded else f"refund status {refund_status}",
        )

    def verify_webhook(self, payload: dict, headers: dict) -> bool:
        """校验回调签名：body 待签名串 + SHA1withRSA，签名在 `sign` 请求头。"""
        public_key = _load_public_key()
        if public_key is None:
            # fail closed：未配置公钥时任何报文都不可信。
            return False
        sign = headers.get("sign") or headers.get("Sign") or ""
        if not sign:
            return False
        try:
            from cryptography.hazmat.primitives import hashes
            from cryptography.hazmat.primitives.asymmetric import padding

            public_key.verify(
                base64.b64decode(sign),
                _canonical_string(payload).encode("utf-8"),
                padding.PKCS1v15(),
                hashes.SHA1(),
            )
            return True
        except Exception:
            return False

    def parse_webhook(self, payload: dict, headers: dict) -> dict:
        """解析支付/退款通知，输出统一结构。

        支付通知：order_status=PS 成功，PF 失败，PE 过期，WP/PI 处理中。
        退款通知：只留档（refund_*），不改写原支付单状态，避免部分退款误标整单。
        """
        refund_status = str(payload.get("refund_status") or "").upper()
        if refund_status:
            amount = payload.get("refund_amount")
            return {
                "transaction_id": payload.get("merchant_order_id"),
                "status": REFUND_STATUS_MAP.get(
                    refund_status, f"refund_{refund_status.lower()}"
                ),
                "amount": float(amount) if amount not in (None, "") else None,
                "currency": payload.get("refund_currency"),
                "event_type": refund_status,
            }

        order_status = str(payload.get("order_status") or "").upper()
        amount = payload.get("order_amount")
        return {
            "transaction_id": payload.get("merchant_order_id")
            or payload.get("order_id"),
            "status": PAYMENT_STATUS_MAP.get(order_status, "unknown"),
            "amount": float(amount) if amount not in (None, "") else None,
            "currency": payload.get("order_currency"),
            "event_type": order_status,
        }
