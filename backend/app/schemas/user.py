"""账号管理相关响应模型。

用于给管理端账号接口声明稳定的响应契约：既能进 OpenAPI 文档，也能避免
序列化时意外带出 `hashed_password` 等敏感字段。
"""
from typing import List, Optional

from pydantic import BaseModel, Field


class EmployeeBrief(BaseModel):
    """账号关联的员工档案摘要。"""

    employee_code: Optional[str] = None
    department: Optional[str] = None
    position: Optional[str] = None


class UserAdminOut(BaseModel):
    """后台账号列表/详情的对外字段。"""

    id: str
    email: str
    phone: Optional[str] = None
    full_name: str
    role: str
    is_active: bool
    is_verified: bool
    last_login_at: Optional[str] = None
    created_at: Optional[str] = None
    groups: List[str] = Field(default_factory=list)
    employee: Optional[EmployeeBrief] = None


class AccountMeOut(BaseModel):
    """当前账号信息 + 权限点（前端菜单/按钮级控制）。"""

    id: str
    email: str
    full_name: str
    role: str
    is_active: bool
    permissions: List[str] = Field(default_factory=list)