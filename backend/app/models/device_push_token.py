"""设备推送令牌（Expo Push）。

一台设备一个 token；同一账号可有多台设备。
token 由 Expo 分配（`ExponentPushToken[...]` / `ExpoPushToken[...]`），
换账号登录时把 token 的归属改到新用户（设备已被新用户接管），
退出登录时软撤销（`revoked_at`），保留历史便于排查"为什么没收到"。
"""
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Column, String
from sqlmodel import Field

from .base import TimestampMixin


class DevicePushToken(TimestampMixin, table=True):
    """设备推送令牌表。"""

    __tablename__ = "device_push_tokens"

    user_id: uuid.UUID = Field(foreign_key="users.id", index=True)
    token: str = Field(
        sa_column=Column(String(255), nullable=False, unique=True, index=True)
    )
    platform: str = Field(
        default="unknown",
        sa_column=Column(String(16), nullable=False, default="unknown"),
        description="ios | android | web | unknown",
    )
    device_id: Optional[str] = Field(
        default=None,
        sa_column=Column(String(128), nullable=True, index=True),
        description="客户端自报的稳定设备标识（可选）",
    )
    app_version: Optional[str] = Field(
        default=None,
        sa_column=Column(String(32), nullable=True),
    )
    last_seen_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    revoked_at: Optional[datetime] = Field(default=None, index=True)
