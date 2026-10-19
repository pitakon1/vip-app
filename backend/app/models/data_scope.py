"""行级数据范围（data-scope）模型。

每个角色、每个用户可配置一条可见范围，用户级覆盖优先于角色级配置，均无配置时
由 `app.services.data_scope.resolve_scope` 给出默认值（admin=all，其余=self）。

- RoleDataScope 角色默认范围
- UserDataScope 用户级覆盖（针对个别员工做例外）
"""
import uuid
from enum import Enum
from typing import Optional

from sqlmodel import Field

from .base import TimestampMixin
from .user import UserRole


class DataScope(str, Enum):
    """可见范围枚举（从窄到宽）。"""

    self_ = "self"  # 仅本人
    department = "department"  # 本部门
    department_and_below = "department_and_below"  # 本部门及下级
    all = "all"  # 全部


class RoleDataScope(TimestampMixin, table=True):
    """角色级默认数据范围。"""

    __tablename__ = "role_data_scopes"

    role: UserRole = Field(unique=True, index=True)
    scope: DataScope = Field(default=DataScope.self_)


class UserDataScope(TimestampMixin, table=True):
    """用户级数据范围覆盖（优先于角色级）。"""

    __tablename__ = "user_data_scopes"

    user_id: uuid.UUID = Field(unique=True, index=True, foreign_key="users.id")
    scope: DataScope = Field(default=DataScope.self_)


__all__ = ["DataScope", "RoleDataScope", "UserDataScope"]
