"""LINE Messaging API 通知适配器。"""
import os
from typing import Optional

import httpx

from .base import (
    NotificationChannel,
    NotificationMessage,
    NotificationProvider,
    NotificationResult,
)


class LineProvider(NotificationProvider):
    """LINE Messaging API push message 适配器。"""

    channel = NotificationChannel.LINE

    BASE_URL = "https://api.line.me"

    def _get_token(self) -> Optional[str]:
        return os.environ.get("LINE_CHANNEL_ACCESS_TOKEN")

    def send(self, message: NotificationMessage) -> NotificationResult:
        token = self._get_token()
        if not token:
            return NotificationResult(
                success=False,
                error_message="LINE_CHANNEL_ACCESS_TOKEN not configured",
            )

        url = f"{self.BASE_URL}/v2/bot/message/push"
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }

        text = message.content or message.title
        if message.template_params:
            try:
                text = text.format(**message.template_params)
            except Exception:
                pass

        payload = {
            "to": message.recipient,
            "messages": [
                {
                    "type": "text",
                    "text": text or "",
                }
            ],
        }

        try:
            with httpx.Client(timeout=10.0) as client:
                resp = client.post(url, headers=headers, json=payload)
                resp.raise_for_status()
                data = resp.json() if resp.content else {}
        except Exception as e:
            return NotificationResult(
                success=False,
                error_message=f"LINE send request failed: {e}",
            )

        return NotificationResult(
            success=True,
            raw_response=data,
        )
