"""角色权限体系模型：权限点 / 角色-权限 / 用户分组 / 分组成员。

管理员后台"账号权限体系"：
- Permission      权限点（功能级，如 account:create）
- RolePermission  角色 - 权限多对多映射
- UserGroup       用户分组（如运营一组 / 招商组）
- UserGroupMember 分组 - 用户关联
"""
import uuid
from typing import Optional

from sqlmodel import Field

from .base import TimestampMixin
from .user import UserRole


class Permission(TimestampMixin, table=True):
    """权限点（功能级）。"""

    __tablename__ = "permissions"

    code: str = Field(unique=True, index=True)  # 如 account:create
    name: str  # 展示名
    category: str = Field(default="system", index=True)  # system/account/group/review/data/...
    description: Optional[str] = None


class RolePermission(TimestampMixin, table=True):
    """角色 - 权限映射。"""

    __tablename__ = "role_permissions"

    role: UserRole = Field(index=True)
    permission_code: str = Field(foreign_key="permissions.code", index=True)


class UserGroup(TimestampMixin, table=True):
    """用户分组。"""

    __tablename__ = "user_groups"

    name: str = Field(unique=True, index=True)
    description: Optional[str] = None
    is_active: bool = Field(default=True)


class UserGroupMember(TimestampMixin, table=True):
    """分组 - 用户关联。"""

    __tablename__ = "user_group_members"

    group_id: uuid.UUID = Field(foreign_key="user_groups.id", index=True)
    user_id: uuid.UUID = Field(foreign_key="users.id", index=True)