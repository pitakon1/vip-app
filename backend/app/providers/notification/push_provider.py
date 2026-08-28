"""Expo Push Notifications 适配器。

用于 React Native App 推送，recipient 为 Expo push token。
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


class PushProvider(NotificationProvider):
    """Expo Push API 适配器。"""

    channel = NotificationChannel.PUSH

    BASE_URL = "https://exp.host/--/api/v2/push/send"

    def _is_valid_token(self, token: str) -> bool:
        """Expo push token 必须以 ExponentPushToken[...] 或 ExponentPushToken[..,..] 形式。"""
        if not token:
            return False
        return token.startswith("ExponentPushToken[") or token.startswith("ExpoPushToken[")

    def send(self, message: NotificationMessage) -> NotificationResult:
        token = message.recipient
        if not self._is_valid_token(token):
            return NotificationResult(
                success=False,
                error_message=f"Invalid Expo push token: {token!r}",
            )

        title = message.title or ""
        body = message.content or ""
        if message.template_params:
            try:
                title = title.format(**message.template_params)
            except Exception:
                pass
            try:
                body = body.format(**message.template_params)
            except Exception:
                pass

        payload = {
            "to": token,
            "title": title,
            "body": body,
        }
        if message.metadata:
            # data 字段必须是 JSON-serializable
            data = message.metadata.get("data")
            if data is not None:
                payload["data"] = data
            sound = message.metadata.get("sound")
            if sound:
                payload["sound"] = sound
            badge = message.metadata.get("badge")
            if badge is not None:
                payload["badge"] = badge
            priority = message.metadata.get("priority")
            if priority:
                payload["priority"] = priority

        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
        }

        try:
            with httpx.Client(timeout=15.0) as client:
                resp = client.post(self.BASE_URL, headers=headers, json=payload)
                resp.raise_for_status()
                data = resp.json()
        except httpx.HTTPStatusError as e:
            return NotificationResult(
                success=False,
                error_message=f"Expo push failed: {e.response.text}",
            )
        except Exception as e:
            return NotificationResult(
                success=False,
                error_message=f"Expo push request failed: {e}",
            )

        # Expo 返回 { "data": { "status": "ok", "id": "..." } } 或 {"data": {"status":"error", "message": "..."}}
        result_data = data.get("data", {})
        if isinstance(result_data, list):
            result_data = result_data[0] if result_data else {}

        status = (result_data.get("status") or "").lower() if isinstance(result_data, dict) else ""
        if status == "ok":
            return NotificationResult(
                success=True,
                message_id=result_data.get("id") if isinstance(result_data, dict) else None,
                raw_response=data,
            )

        err_msg = (
            result_data.get("message") if isinstance(result_data, dict) else None
        ) or data.get("errors") or "Expo push failed"
        return NotificationResult(
            success=False,
            error_message=str(err_msg),
            raw_response=data,
        )
