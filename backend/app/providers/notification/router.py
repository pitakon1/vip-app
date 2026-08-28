"""通知路由器 - 根据渠道选择 provider"""
from typing import Dict, List
from .base import NotificationChannel, NotificationProvider, NotificationMessage, NotificationResult
from .wechat_provider import WechatProvider
from .line_provider import LineProvider
from .whatsapp_provider import WhatsAppProvider
from .facebook_provider import FacebookProvider
from .sms_provider import SMSProvider
from .email_provider import EmailProvider
from .push_provider import PushProvider
from .in_app_provider import InAppProvider

class NotificationRouter:
    def __init__(self):
        self._providers: Dict[NotificationChannel, NotificationProvider] = {}
        self._register_defaults()
    
    def _register_defaults(self):
        self.register(NotificationChannel.WECHAT, WechatProvider())
        self.register(NotificationChannel.LINE, LineProvider())
        self.register(NotificationChannel.WHATSAPP, WhatsAppProvider())
        self.register(NotificationChannel.FACEBOOK, FacebookProvider())
        self.register(NotificationChannel.SMS, SMSProvider())
        self.register(NotificationChannel.EMAIL, EmailProvider())
        self.register(NotificationChannel.PUSH, PushProvider())
        self.register(NotificationChannel.IN_APP, InAppProvider())
    
    def register(self, channel: NotificationChannel, provider: NotificationProvider):
        self._providers[channel] = provider
    
    def get_provider(self, channel: NotificationChannel) -> NotificationProvider:
        return self._providers.get(channel)
    
    def send(self, message: NotificationMessage) -> NotificationResult:
        provider = self.get_provider(message.channel)
        if not provider:
            return NotificationResult(success=False, error_message=f"Unsupported channel: {message.channel}")
        return provider.send(message)
    
    def broadcast(self, messages: List[NotificationMessage]) -> List[NotificationResult]:
        """批量发送多渠道通知"""
        return [self.send(msg) for msg in messages]

notification_router = NotificationRouter()
