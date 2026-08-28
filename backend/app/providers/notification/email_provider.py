"""SendGrid 邮件通知适配器。"""
import os
from typing import Optional

import httpx

from .base import (
    NotificationChannel,
    NotificationMessage,
    NotificationProvider,
    NotificationResult,
)


class EmailProvider(NotificationProvider):
    """SendGrid Mail Send API 邮件适配器。"""

    channel = NotificationChannel.EMAIL

    BASE_URL = "https://api.sendgrid.com"

    def _get_credentials(self) -> tuple[Optional[str], Optional[str]]:
        return (
            os.environ.get("SENDGRID_API_KEY"),
            os.environ.get("SENDGRID_FROM_EMAIL"),
        )

    def send(self, message: NotificationMessage) -> NotificationResult:
        api_key, from_email = self._get_credentials()
        if not api_key or not from_email:
            return NotificationResult(
                success=False,
                error_message="SendGrid credentials not configured "
                "(SENDGRID_API_KEY/SENDGRID_FROM_EMAIL)",
            )

        url = f"{self.BASE_URL}/v3/mail/send"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }

        content = message.content or ""
        if message.template_params and content:
            try:
                content = content.format(**message.template_params)
            except Exception:
                pass

        subject = message.title or message.template_key or "(No Subject)"
        if message.template_params and subject:
            try:
                subject = subject.format(**message.template_params)
            except Exception:
                pass

        payload = {
            "from": {"email": from_email},
            "personalizations": [
                {"to": [{"email": message.recipient}]}
            ],
            "subject": subject,
            "content": [
                {"type": "text/plain", "value": content or ""}
            ],
        }

        if message.template_key:
            # SendGrid 动态模板
            payload["template_id"] = message.template_key
            if message.template_params:
                payload["personalizations"][0]["dynamic_template_data"] = (
                    message.template_params
                )
            # 使用模板时移除 subject/content（由模板控制）
            payload.pop("subject", None)
            payload.pop("content", None)

        try:
            with httpx.Client(timeout=15.0) as client:
                resp = client.post(url, headers=headers, json=payload)
                # SendGrid 202 表示已接收
                if resp.status_code not in (200, 202):
                    resp.raise_for_status()
        except httpx.HTTPStatusError as e:
            return NotificationResult(
                success=False,
                error_message=f"SendGrid send failed: {e.response.text}",
            )
        except Exception as e:
            return NotificationResult(
                success=False,
                error_message=f"SendGrid send request failed: {e}",
            )

        # SendGrid 返回 202 时不返回 body，message_id 在 X-Message-Id 头
        message_id = resp.headers.get("X-Message-Id")
        return NotificationResult(
            success=True,
            message_id=message_id,
        )
