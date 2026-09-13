"""第三方对接预留注册表（H 组）。

支付渠道（Stripe / PromptPay / 微信 / 支付宝 / Wise）已在 providers/payment 实现。

本模块统一声明其余「预留开发接口」的接入点与凭证槽位，便于上线时按《待确认问题清单》
H 组凭证表向真实服务对齐（现均为 stub，返回未配置提示，不影响主流程）。

预留项：
- ocr        证件 OCR（护照/身份证）实名
- sms        泰国短信（AIS / TrueMove）
- notify      通知：App 站内消息、邮件(SMTP)、Line/WhatsApp、微信
- geo         地图：Google Maps / Longdo Map
- tax_rd      税务：泰国税局 RD API（e-Tax / WHT）- 备注 D4 明确“税费自理，暂不接接口”
"""
from __future__ import annotations

from enum import Enum
from typing import Dict, Optional


class ReservedChannel(str, Enum):
    ocr = "ocr"
    sms = "sms"
    notify = "notify"
    geo = "geo"
    tax_rd = "tax_rd"


class ReservedProvider:
    """预留 provider 的最小 stub：记录凭证槽位，调用返回未配置提示。"""

    def __init__(self, channel: str, required_credentials: Optional[Dict[str, str]] = None):
        self.channel = channel
        self.required_credentials: Dict[str, str] = required_credentials or {}

    def is_configured(self) -> bool:
        # 凭证最终从环境变量读取；此处标记尚未接入真实服务
        return False

    def execute(self, action: str, **payload):
        return {
            "ok": False,
            "channel": self.channel,
            "action": action,
            "status": "reserved",
            "message": f"{self.channel}.{action} not configured yet (reserved integration).",
            "required_credentials": self.required_credentials,
        }


def build_registry() -> Dict[str, ReservedProvider]:
    """构建预留 provider 注册表。"""
    return {
        ReservedChannel.ocr.value: ReservedProvider(
            ReservedChannel.ocr.value,
            {"service_account": "OCR 服务账号", "credential": "凭证"},
        ),
        ReservedChannel.sms.value: ReservedProvider(
            ReservedChannel.sms.value,
            {"api_account": "AIS / TrueMove SMS 账号", "api_key": "API Key"},
        ),
        ReservedChannel.notify.value: ReservedProvider(
            ReservedChannel.notify.value,
            {
                "twilio_sid": "Twilio SID",
                "twilio_token": "Twilio Token",
                "smtp": "SMTP 配置",
                "line_whatsapp": "Line/WhatsApp 凭证",
                "wechat": "微信通知凭据",
            },
        ),
        ReservedChannel.geo.value: ReservedProvider(
            ReservedChannel.geo.value,
            {"google_maps_key": "Google Maps Key", "longdo_key": "Longdo Map Key"},
        ),
        ReservedChannel.tax_rd.value: ReservedProvider(
            ReservedChannel.tax_rd.value,
            {"rd_api_key": "泰国税局 RD API Key（备注 D4：税费自理，暂缓）"},
        ),
    }


# 全局注册表
RESERVED_REGISTRY = build_registry()


def get_reserved(channel: str) -> ReservedProvider:
    return RESERVED_REGISTRY[channel]