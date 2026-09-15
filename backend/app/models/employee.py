"""员工模型。

对应设计文档中的员工主数据，关联用户账号，支持自引用的上下级关系。
"""
from datetime import date
from typing import Optional
import uuid

from sqlmodel import Field

from .base import TimestampMixin


class Employee(TimestampMixin, table=True):
    """员工表。"""

    __tablename__ = "employees"

    user_id: uuid.UUID = Field(foreign_key="users.id", index=True)
    employee_code: str = Field(unique=True, index=True)
    department: Optional[str] = Field(default=None, index=True)
    position: Optional[str] = None
    hire_date: Optional[date] = None
    phone: Optional[str] = None
    line_id: Optional[str] = None
    wechat_id: Optional[str] = None
    is_active: bool = Field(default=True)
    manager_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="employees.id", description="直属上级（自引用）"
    )
    broker_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="broker_partners.id",
        description="归属分销商（渠道商），用于差异化佣金定价",
    )
