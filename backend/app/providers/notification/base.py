"""通知适配器基类"""
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional
from enum import Enum


class NotificationChannel(str, Enum):
    IN_APP = "in_app"
    PUSH = "push"
    EMAIL = "email"
    SMS = "sms"
    WECHAT = "wechat"
    LINE = "line"
    WHATSAPP = "whatsapp"
    FACEBOOK = "facebook"


@dataclass
class NotificationMessage:
    """通知消息"""
    channel: NotificationChannel
    recipient: str          # 手机号/邮箱/openid/user_id
    title: str = ""
    content: str = ""
    template_key: Optional[str] = None
    template_params: Optional[dict] = None
    metadata: Optional[dict] = None
    related_entity_type: Optional[str] = None
    related_entity_id: Optional[str] = None


@dataclass
class NotificationResult:
    """通知发送结果"""
    success: bool
    message_id: Optional[str] = None
    raw_response: Optional[dict] = None
    error_message: Optional[str] = None


class NotificationProvider(ABC):
    """通知适配器抽象基类"""
    channel: NotificationChannel

    @abstractmethod
    def send(self, message: NotificationMessage) -> NotificationResult:
        """发送通知"""
        ...
