"""微信通知适配器。

通过微信公众号/企业号 API 发送模板消息。
access_token 通过类级缓存共享，避免重复请求。
"""
import time
import os
from typing import Optional

import httpx

from .base import (
    NotificationChannel,
    NotificationMessage,
    NotificationProvider,
    NotificationResult,
)


class WechatProvider(NotificationProvider):
    """微信公众号模板消息适配器。"""

    channel = NotificationChannel.WECHAT

    # 类级 access_token 缓存（expires_at, token）
    _token_cache: dict = {"token": None, "expires_at": 0.0}

    BASE_URL = "https://api.weixin.qq.com"

    def _get_credentials(self) -> tuple[Optional[str], Optional[str]]:
        return os.environ.get("WECHAT_APP_ID"), os.environ.get("WECHAT_APP_SECRET")

    def _get_access_token(self) -> Optional[str]:
        """获取（并缓存）微信 access_token。"""
        app_id, app_secret = self._get_credentials()
        if not app_id or not app_secret:
            return None

        # 缓存未过期直接返回
        if (
            self._token_cache["token"]
            and self._token_cache["expires_at"] > time.time() + 60
        ):
            return self._token_cache["token"]

        url = f"{self.BASE_URL}/cgi-bin/token"
        params = {
            "grant_type": "client_credential",
            "appid": app_id,
            "secret": app_secret,
        }
        try:
            with httpx.Client(timeout=10.0) as client:
                resp = client.get(url, params=params)
                resp.raise_for_status()
                data = resp.json()
        except Exception as e:
            self._token_cache["token"] = None
            self._token_cache["expires_at"] = 0.0
            raise RuntimeError(f"Failed to fetch wechat access_token: {e}") from e

        token = data.get("access_token")
        if not token:
            raise RuntimeError(
                f"Wechat access_token request failed: {data.get('errmsg', 'unknown error')}"
            )

        expires_in = int(data.get("expires_in", 7200))
        self._token_cache["token"] = token
        self._token_cache["expires_at"] = time.time() + expires_in
        return token

    def send(self, message: NotificationMessage) -> NotificationResult:
        app_id, app_secret = self._get_credentials()
        if not app_id or not app_secret:
            return NotificationResult(
                success=False,
                error_message="Wechat credentials not configured (WECHAT_APP_ID/WECHAT_APP_SECRET)",
            )

        try:
            access_token = self._get_access_token()
        except Exception as e:
            return NotificationResult(success=False, error_message=str(e))

        if not access_token:
            return NotificationResult(
                success=False, error_message="Failed to obtain wechat access_token"
            )

        url = f"{self.BASE_URL}/cgi-bin/message/template/send"
        params = {"access_token": access_token}

        template_id = ""
        if message.metadata:
            template_id = message.metadata.get("template_id", "")
        if not template_id:
            return NotificationResult(
                success=False,
                error_message="Wechat template message requires 'template_id' in metadata",
            )

        payload = {
            "touser": message.recipient,
            "template_id": template_id,
            "data": message.template_params or {},
        }
        if message.metadata and message.metadata.get("url"):
            payload["url"] = message.metadata["url"]
        if message.metadata and message.metadata.get("miniprogram"):
            payload["miniprogram"] = message.metadata["miniprogram"]

        try:
            with httpx.Client(timeout=10.0) as client:
                resp = client.post(url, params=params, json=payload)
                resp.raise_for_status()
                data = resp.json()
        except Exception as e:
            return NotificationResult(
                success=False,
                error_message=f"Wechat send request failed: {e}",
            )

        if data.get("errcode", 0) != 0:
            return NotificationResult(
                success=False,
                raw_response=data,
                error_message=f"Wechat send failed: {data.get('errmsg', 'unknown error')}",
            )

        return NotificationResult(
            success=True,
            message_id=str(data.get("msgid", "")),
            raw_response=data,
        )
