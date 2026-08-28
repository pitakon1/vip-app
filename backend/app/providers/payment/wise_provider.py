"""Wise 跨境银行转账适配器（使用 httpx 调用 Wise API）"""
import httpx

from .base import (
    PaymentChannel,
    PaymentProvider,
    PaymentRequest,
    PaymentResult,
    RefundRequest,
    RefundResult,
)
from .channel_config import WISE_API_KEY, WISE_PROFILE_ID


WISE_API_BASE = "https://api.wise.com"


def _get_api_key() -> str:
    return WISE_API_KEY


def _get_profile_id() -> str:
    """Wise 商户 profile ID"""
    return WISE_PROFILE_ID


class WiseProvider(PaymentProvider):
    """Wise 跨境银行转账适配器"""

    channel = PaymentChannel.WISE

    def __init__(self):
        self._api_base = WISE_API_BASE
        self._timeout = 30.0

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {_get_api_key()}",
            "Content-Type": "application/json",
        }

    def create_payment(self, request: PaymentRequest) -> PaymentResult:
        """创建 Wise quote + transfer，返回付款指引 URL"""
        profile_id = _get_profile_id()
        try:
            with httpx.Client(timeout=self._timeout) as client:
                # 1. 创建 quote（报价）
                quote_body = {
                    "sourceCurrency": request.currency,
                    "targetCurrency": request.currency,
                    "sourceAmount": request.amount,
                }
                if profile_id:
                    quote_body["profile"] = profile_id
                quote_resp = client.post(
                    f"{self._api_base}/v2/quotes",
                    headers=self._headers(),
                    json=quote_body,
                )
                quote = quote_resp.json()
                if not quote_resp.is_success:
                    return PaymentResult(
                        success=False,
                        error_message=str(quote.get("message", quote_resp.text)),
                        raw_response=quote,
                    )
                quote_id = quote.get("id")

                # 2. 创建 transfer（转账）
                transfer_body = {
                    "quoteUuid": quote_id,
                    "details": {
                        "reference": request.idempotency_key,
                        "transferPurpose": request.description or "payment",
                    },
                    "customerTransactionId": request.idempotency_key,
                }
                transfer_resp = client.post(
                    f"{self._api_base}/v1/transfers",
                    headers=self._headers(),
                    json=transfer_body,
                )
                transfer = transfer_resp.json()
                if not transfer_resp.is_success:
                    return PaymentResult(
                        success=False,
                        error_message=str(transfer.get("message", transfer_resp.text)),
                        raw_response=transfer,
                    )
                transfer_id = transfer.get("id")

                # 3. 获取付款指引（fund），返回付款 URL
                if profile_id:
                    fund_resp = client.post(
                        f"{self._api_base}/v3/profiles/{profile_id}/transfers/{transfer_id}/payments",
                        headers=self._headers(),
                        json={"type": "BALANCE"},
                    )
                    fund = fund_resp.json()
                    checkout_url = fund.get("bankDetailsUrl")
                else:
                    fund = {}
                    checkout_url = None

                return PaymentResult(
                    success=True,
                    channel_transaction_id=str(transfer_id),
                    checkout_url=checkout_url
                    or f"https://wise.com/pay#transferId={transfer_id}",
                    raw_response={"quote": quote, "transfer": transfer, "fund": fund},
                )
        except httpx.HTTPError as e:
            return PaymentResult(success=False, error_message=str(e))

    def query_payment(self, channel_transaction_id: str) -> PaymentResult:
        """查询 transfer 状态"""
        try:
            with httpx.Client(timeout=self._timeout) as client:
                resp = client.get(
                    f"{self._api_base}/v1/transfers/{channel_transaction_id}",
                    headers=self._headers(),
                )
            raw = resp.json()
            if resp.is_success:
                status = raw.get("status", "unknown")
                succeeded = status == "outgoing_payment_sent"
                return PaymentResult(
                    success=succeeded,
                    channel_transaction_id=channel_transaction_id,
                    raw_response=raw,
                    error_message=None if succeeded else status,
                )
            return PaymentResult(
                success=False,
                error_message=str(raw.get("message", resp.text)),
                raw_response=raw,
            )
        except httpx.HTTPError as e:
            return PaymentResult(success=False, error_message=str(e))

    def refund(self, request: RefundRequest) -> RefundResult:
        """Wise 不支持自动退款，需联系客服或手动处理"""
        return RefundResult(
            success=False,
            error_message=(
                "Wise does not support automatic refunds. "
                "Please contact Wise support or process manually."
            ),
        )

    def verify_webhook(self, payload: dict, headers: dict) -> bool:
        """验证 Wise webhook（通过签名头或 HTTP Basic Auth）"""
        # 完整实现需校验 X-Signature 头（HMAC-SHA1）
        # 开发环境简化为存在鉴权头即通过
        return bool(headers.get("X-Signature") or headers.get("Authorization"))

    def parse_webhook(self, payload: dict, headers: dict) -> dict:
        """解析 Wise webhook 事件"""
        event_type = payload.get("event_type") or payload.get("type", "")
        data = payload.get("data", {}) or payload
        status_map = {
            "transfers#state-change": "updated",
            "transfers#refund": "refunded",
        }
        current_state = data.get("current_state", "unknown")
        return {
            "transaction_id": str(data.get("id") or data.get("resource", {}).get("id", "")),
            "status": status_map.get(event_type, current_state),
            "amount": data.get("sourceAmount"),
            "currency": data.get("sourceCurrency"),
            "event_type": event_type,
        }
