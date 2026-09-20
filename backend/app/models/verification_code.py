"""验证码模型（手机号/邮箱）。

用于手机号注册、手机号/邮箱登录、手机号绑定等场景的一次性验证码。
每次发码会作废该接收方尚未使用的旧码；校验有次数上限与有效期。
"""
from datetime import datetime
from typing import Optional

from sqlmodel import Field

from .base import TimestampMixin


class VerificationCode(TimestampMixin, table=True):
    """验证码表。code 只存 SHA-256 哈希，不存明文。"""

    __tablename__ = "verification_codes"

    recipient: str = Field(index=True)  # 手机号或邮箱
    channel: str = Field(default="sms", index=True)  # sms | email
    code_hash: str
    expires_at: datetime
    attempts: int = Field(default=0)
    used_at: Optional[datetime] = None  # 非空表示已消费/作废