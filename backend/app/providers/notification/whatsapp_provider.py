"""WhatsApp Business API 通知适配器。

通过 Facebook Graph API 调用 WhatsApp 模板消息接口。
"""
import os
from typing import Optional

import httpx

from .base import (
    NotificationChannel,
    NotificationMessage,
    NotificationProvider,
    NotificationResult,
)


class WhatsAppProvider(NotificationProvider):
    """WhatsApp Business Cloud API 适配器。"""

    channel = NotificationChannel.WHATSAPP

    BASE_URL = "https://graph.facebook.com"
    API_VERSION = "v18.0"

    def _get_credentials(self) -> tuple[Optional[str], Optional[str]]:
        return (
            os.environ.get("WHATSAPP_PHONE_NUMBER_ID"),
            os.environ.get("WHATSAPP_ACCESS_TOKEN"),
        )

    def send(self, message: NotificationMessage) -> NotificationResult:
        phone_number_id, access_token = self._get_credentials()
        if not phone_number_id or not access_token:
            return NotificationResult(
                success=False,
                error_message="WhatsApp credentials not configured "
                "(WHATSAPP_PHONE_NUMBER_ID/WHATSAPP_ACCESS_TOKEN)",
            )

        url = (
            f"{self.BASE_URL}/{self.API_VERSION}/{phone_number_id}/messages"
        )
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }

        if message.template_key:
            # 模板消息
            components = []
            if message.template_params:
                # 简单将 dict 转换为 body components
                body_params = [
                    {"type": "text", "text": str(value)}
                    for value in message.template_params.values()
                ]
                if body_params:
                    components.append(
                        {"type": "body", "parameters": body_params}
                    )

            payload = {
                "messaging_product": "whatsapp",
                "to": message.recipient,
                "type": "template",
                "template": {
                    "name": message.template_key,
                    "language": {"code": "en_US"},
                    "components": components,
                },
            }
        else:
            # 普通文本消息
            payload = {
                "messaging_product": "whatsapp",
                "to": message.recipient,
                "type": "text",
                "text": {
                    "body": message.content or message.title or "",
                    "preview_url": False,
                },
            }

        try:
            with httpx.Client(timeout=10.0) as client:
                resp = client.post(url, headers=headers, json=payload)
                resp.raise_for_status()
                data = resp.json()
        except httpx.HTTPStatusError as e:
            return NotificationResult(
                success=False,
                error_message=f"WhatsApp send failed: {e.response.text}",
            )
        except Exception as e:
            return NotificationResult(
                success=False,
                error_message=f"WhatsApp send request failed: {e}",
            )

        message_id = None
        try:
            message_id = data.get("messages", [{}])[0].get("id")
        except (IndexError, AttributeError, KeyError):
            pass

        return NotificationResult(
            success=True,
            message_id=message_id,
            raw_response=data,
        )
