"""Facebook Messenger Send API 通知适配器。"""
import os
from typing import Optional

import httpx

from .base import (
    NotificationChannel,
    NotificationMessage,
    NotificationProvider,
    NotificationResult,
)


class FacebookProvider(NotificationProvider):
    """Facebook Messenger Send API 适配器。"""

    channel = NotificationChannel.FACEBOOK

    BASE_URL = "https://graph.facebook.com"
    API_VERSION = "v18.0"

    def _get_token(self) -> Optional[str]:
        return os.environ.get("FB_PAGE_ACCESS_TOKEN")

    def send(self, message: NotificationMessage) -> NotificationResult:
        token = self._get_token()
        if not token:
            return NotificationResult(
                success=False,
                error_message="FB_PAGE_ACCESS_TOKEN not configured",
            )

        url = f"{self.BASE_URL}/{self.API_VERSION}/me/messages"
        params = {"access_token": token}
        headers = {"Content-Type": "application/json"}

        text = message.content or message.title
        if message.template_params:
            try:
                text = text.format(**message.template_params)
            except Exception:
                pass

        payload = {
            "recipient": {"id": message.recipient},
            "message": {"text": text or ""},
        }

        try:
            with httpx.Client(timeout=10.0) as client:
                resp = client.post(url, params=params, headers=headers, json=payload)
                resp.raise_for_status()
                data = resp.json()
        except httpx.HTTPStatusError as e:
            return NotificationResult(
                success=False,
                error_message=f"Facebook send failed: {e.response.text}",
            )
        except Exception as e:
            return NotificationResult(
                success=False,
                error_message=f"Facebook send request failed: {e}",
            )

        recipient_id = None
        message_id = None
        try:
            recipient_id = data.get("recipient_id")
            message_id = data.get("message_id")
        except AttributeError:
            pass

        if not message_id and not recipient_id:
            return NotificationResult(
                success=False,
                raw_response=data,
                error_message="Facebook send response missing message_id",
            )

        return NotificationResult(
            success=True,
            message_id=message_id,
            raw_response=data,
        )
