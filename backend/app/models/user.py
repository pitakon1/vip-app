"""用户模型。

对应设计文档中的用户/账号体系，统一管理后台、中介、业主、租客等角色的登录账号。
"""
from datetime import datetime
from enum import Enum
from typing import Optional

from sqlmodel import Field

from .base import TimestampMixin


class UserRole(str, Enum):
    """用户角色枚举。"""

    admin = "admin"
    agent = "agent"
    owner = "owner"
    tenant = "tenant"
    employee = "employee"


class User(TimestampMixin, table=True):
    """用户表。

    所有角色的账号均存储于此表，通过 role 字段区分。
    """

    __tablename__ = "users"

    email: str = Field(unique=True, index=True)
    phone: Optional[str] = Field(default=None, index=True)
    hashed_password: str
    full_name: str
    role: UserRole = Field(default=UserRole.tenant, index=True)
    is_active: bool = Field(default=True)
    is_verified: bool = Field(default=False)
    preferred_language: str = Field(default="zh", max_length=5)  # zh/en/th
    # 用户偏好：时区与通知开关（「我的-设置」可读写）
    timezone: Optional[str] = Field(default=None, max_length=64)
    notify_email: bool = Field(default=True)
    notify_push: bool = Field(default=True)
    # 运营看板 DAU/WAU/MAU 与活跃趋势都按该字段做范围过滤与分组，需要索引
    last_login_at: Optional[datetime] = Field(default=None, index=True)
    avatar_url: Optional[str] = None
    # 令牌版本号：签发令牌时写入 tv 声明。登出 / 重置密码时 +1，
    # 使该账号此前签发的所有 access/refresh 令牌立即失效。
    token_version: int = Field(
        default=0,
        sa_column_kwargs={
            "nullable": False,
            "server_default": "0",
            "comment": "令牌版本号，用于登出/改密后吊销旧令牌",
        },
    )
