"""支付路由器 - 根据渠道选择 provider，实现智能路由"""
from typing import Dict
from .base import PaymentChannel, PaymentProvider
from .stripe_provider import StripeProvider
from .promptpay_provider import PromptPayProvider
from .wechat_provider import WechatProvider
from .alipay_provider import AlipayProvider
from .wise_provider import WiseProvider
from .generic_provider import GenericProvider


class PaymentRouter:
    """支付渠道路由器"""

    def __init__(self):
        self._providers: Dict[PaymentChannel, PaymentProvider] = {}
        self._register_defaults()

    def _register_defaults(self):
        self.register(PaymentChannel.STRIPE, StripeProvider())
        self.register(PaymentChannel.PROMPTPAY, PromptPayProvider())
        self.register(PaymentChannel.WECHAT, WechatProvider())
        self.register(PaymentChannel.ALIPAY, AlipayProvider())
        self.register(PaymentChannel.WISE, WiseProvider())
        # 其他渠道用通用占位
        for channel in PaymentChannel:
            if channel not in self._providers:
                self.register(channel, GenericProvider(channel))

    def register(self, channel: PaymentChannel, provider: PaymentProvider):
        self._providers[channel] = provider

    def get_provider(self, channel: PaymentChannel) -> PaymentProvider:
        provider = self._providers.get(channel)
        if not provider:
            raise ValueError(f"Unsupported payment channel: {channel}")
        return provider

    def recommend_channel(self, user_country: str, currency: str) -> PaymentChannel:
        """根据用户国家和币种推荐最优支付渠道"""
        if user_country == "CN":
            if currency == "CNY":
                return PaymentChannel.WECHAT
            return PaymentChannel.ALIPAY
        if user_country == "TH":
            return PaymentChannel.PROMPTPAY
        if currency in ("USD", "EUR", "GBP"):
            return PaymentChannel.STRIPE
        return PaymentChannel.STRIPE


# 全局单例
payment_router = PaymentRouter()
