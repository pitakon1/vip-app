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
    last_login_at: Optional[datetime] = None
    avatar_url: Optional[str] = None
