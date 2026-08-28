"""Twilio 短信通知适配器。"""
import os
from typing import Optional

import httpx

from .base import (
    NotificationChannel,
    NotificationMessage,
    NotificationProvider,
    NotificationResult,
)


class SMSProvider(NotificationProvider):
    """Twilio REST API 短信适配器。"""

    channel = NotificationChannel.SMS

    BASE_URL = "https://api.twilio.com"

    def _get_credentials(self) -> tuple[Optional[str], Optional[str], Optional[str]]:
        return (
            os.environ.get("TWILIO_ACCOUNT_SID"),
            os.environ.get("TWILIO_AUTH_TOKEN"),
            os.environ.get("TWILIO_FROM_NUMBER"),
        )

    def send(self, message: NotificationMessage) -> NotificationResult:
        account_sid, auth_token, from_number = self._get_credentials()
        if not account_sid or not auth_token or not from_number:
            return NotificationResult(
                success=False,
                error_message="Twilio credentials not configured "
                "(TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_FROM_NUMBER)",
            )

        url = f"{self.BASE_URL}/2010-04-01/Accounts/{account_sid}/Messages.json"

        body = message.content
        if not body and message.template_params:
            try:
                body = (message.template_params.get("body") or "").format(
                    **message.template_params
                )
            except Exception:
                body = message.template_params.get("body", "")
        body = body or message.title

        data = {
            "To": message.recipient,
            "From": from_number,
            "Body": body or "",
        }

        try:
            with httpx.Client(timeout=15.0) as client:
                resp = client.post(
                    url, data=data, auth=(account_sid, auth_token)
                )
                resp.raise_for_status()
                data = resp.json()
        except httpx.HTTPStatusError as e:
            return NotificationResult(
                success=False,
                error_message=f"Twilio send failed: {e.response.text}",
                raw_response=_safe_json(e.response),
            )
        except Exception as e:
            return NotificationResult(
                success=False,
                error_message=f"Twilio send request failed: {e}",
            )

        # Twilio 错误时 status 字段为 'failed' 或 'undelivered'
        status = (data.get("status") or "").lower()
        if status in ("failed", "undelivered", "canceled", "error"):
            return NotificationResult(
                success=False,
                message_id=data.get("sid"),
                raw_response=data,
                error_message=f"Twilio send returned status: {status}",
            )

        return NotificationResult(
            success=True,
            message_id=data.get("sid"),
            raw_response=data,
        )


def _safe_json(response: httpx.Response) -> Optional[dict]:
    """安全解析响应 JSON，失败时返回 None。"""
    try:
        return response.json()
    except Exception:
        return None
