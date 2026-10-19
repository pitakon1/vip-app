"""部门模型（组织架构树）。

对标参考项目（房少 ERP）的部门树 + 节点权限：员工挂在部门下，数据可见范围由
部门层级推导（本人 / 本部门 / 本部门及下级 / 全部）。

设计要点：
- `parent_id` 自引用构成树；根节点 `parent_id` 为空。
- 保留 `employees.department` 字符串列不动（存量代码依赖），新增 `department_id`
  作为结构化外键，两者并存直至前端全部切到新字段。
"""
import uuid
from typing import Optional

from sqlmodel import Field

from .base import TimestampMixin


class Department(TimestampMixin, table=True):
    """部门表。"""

    __tablename__ = "departments"

    name: str = Field(index=True)
    code: str = Field(unique=True, index=True, description="部门编码，全局唯一")
    parent_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="departments.id", index=True, description="上级部门（自引用）"
    )
    leader_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="users.id", description="部门负责人"
    )
    sort: int = Field(default=0, description="同级排序，越小越靠前")
    is_active: bool = Field(default=True)
