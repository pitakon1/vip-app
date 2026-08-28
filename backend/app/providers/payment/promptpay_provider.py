"""PromptPay QR 码本地生成适配器 - 泰国 EMVCo 标准（纯本地计算，无需外部 API）"""
from typing import Optional

from .base import (
    PaymentChannel,
    PaymentProvider,
    PaymentRequest,
    PaymentResult,
    RefundRequest,
    RefundResult,
)
from .channel_config import (
    PROMPTPAY_MERCHANT_NAME,
    PROMPTPAY_TARGET,
    PROMPTPAY_TARGET_TYPE,
)


def _crc16(data: str) -> str:
    """计算 CRC-16/CCITT-FALSE 校验码（EMVCo/PromptPay 标准）

    初始值 0xFFFF，多项式 0x1021，不进行 XOR 输出反转。
    """
    crc = 0xFFFF
    for byte in data.encode("utf-8"):
        crc ^= byte << 8
        for _ in range(8):
            if crc & 0x8000:
                crc = (crc << 1) ^ 0x1021
            else:
                crc = crc << 1
            crc &= 0xFFFF
    return f"{crc:04X}"


def _field(field_id: str, value: str) -> str:
    """格式化 EMVCo 字段：ID + 长度(2位) + 值"""
    length = len(value)
    if length > 99:
        raise ValueError(f"Field {field_id} value too long: {length} chars")
    return f"{field_id}{length:02d}{value}"


def generate_promptpay_qr(
    target: str,
    amount: Optional[float] = None,
    merchant_name: str = "VIP APP",
    target_type: str = "phone",
) -> str:
    """生成 PromptPay EMVCo MPM QR 码字符串

    Args:
        target: 收款方标识（手机号/国民ID/税号）
        amount: 金额（泰铢）；None 表示不固定金额（静态码）
        merchant_name: 商户名（最长 25 字符）
        target_type: phone / national_id / tax_id

    Returns:
        EMVCo 标准 QR 字符串（含 CRC16 校验）
    """
    # 1. Payload format indicator
    payload = _field("00", "01")
    # 2. Point of initiation method: 11=dynamic(带金额), 12=static
    payload += _field("01", "11" if amount else "12")

    # 3. Merchant account information (tag 29) - PromptPay 专用
    aid = "A000000677010111"
    if target_type == "phone":
        # 泰国手机号归一化为 0066XXXXXXXXX 格式
        phone = target.lstrip("+")
        if phone.startswith("0"):
            phone = "0066" + phone[1:]
        elif phone.startswith("66"):
            phone = "0066" + phone[2:]
        account = _field("00", aid) + _field("01", phone)
    elif target_type == "national_id":
        # 国民ID去除连字符
        nid = target.replace("-", "")
        account = _field("00", aid) + _field("02", nid)
    else:  # tax_id / e-wallet id
        account = _field("00", aid) + _field("03", target)
    payload += _field("29", account)

    # 4. Merchant category code (0000 = 通用)
    payload += _field("52", "0000")
    # 5. Transaction currency (764 = THB)
    payload += _field("53", "764")
    # 6. Transaction amount（仅当存在金额时）
    if amount is not None and amount > 0:
        payload += _field("54", f"{amount:.2f}")
    # 7. Country code
    payload += _field("58", "TH")
    # 8. Merchant name（最长 25 字符）
    payload += _field("59", merchant_name[:25])

    # 9. CRC (tag 63, 长度固定 04)
    payload_to_crc = payload + "6304"
    crc = _crc16(payload_to_crc)
    return payload_to_crc + crc


class PromptPayProvider(PaymentProvider):
    """PromptPay 支付适配器 - 本地生成 QR 码"""

    channel = PaymentChannel.PROMPTPAY

    def __init__(self):
        # 收款方配置（集中管理于 channel_config.py，可改环境变量覆盖）
        self._target = PROMPTPAY_TARGET
        self._target_type = PROMPTPAY_TARGET_TYPE
        self._merchant_name = PROMPTPAY_MERCHANT_NAME

    def create_payment(self, request: PaymentRequest) -> PaymentResult:
        """生成 PromptPay QR 码，状态为 pending"""
        try:
            qr = generate_promptpay_qr(
                target=self._target,
                amount=request.amount,
                merchant_name=self._merchant_name,
                target_type=self._target_type,
            )
            return PaymentResult(
                success=True,
                channel_transaction_id=request.idempotency_key,
                qr_code_data=qr,
                raw_response={"qr": qr, "status": "pending"},
            )
        except Exception as e:
            return PaymentResult(success=False, error_message=str(e))

    def query_payment(self, channel_transaction_id: str) -> PaymentResult:
        """查询支付状态 - 占位实现

        生产环境可对接 SCB Open API / Kasikorn API / BBL API 等银行开放接口
        轮询收款记录。此处默认返回 pending。
        """
        return PaymentResult(
            success=False,
            channel_transaction_id=channel_transaction_id,
            raw_response={"status": "pending"},
            error_message="pending",
        )

    def refund(self, request: RefundRequest) -> RefundResult:
        """PromptPay 不支持在线退款，需手动银行转账处理"""
        return RefundResult(
            success=False,
            error_message=(
                "PromptPay does not support online refunds. "
                "Please process manually via bank transfer."
            ),
        )

    def verify_webhook(self, payload: dict, headers: dict) -> bool:
        """PromptPay 无标准 webhook，银行回调需自定义验证"""
        return True

    def parse_webhook(self, payload: dict, headers: dict) -> dict:
        """解析标准化回调负载，返回 {transaction_id, status, amount, currency}

        PromptPay 银行回调一般携带 event 类型与 transaction_id，
        此处按统一格式解析（与 GenericProvider 保持一致）。
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
