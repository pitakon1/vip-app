"""租客模型。

对应设计文档中的租客主数据，敏感字段（护照/身份证/紧急联系人）以加密形式存储。
"""
import uuid
from typing import Any, Dict, Optional

from sqlalchemy import Column, JSON
from sqlmodel import Field

from .base import TimestampMixin


class Tenant(TimestampMixin, table=True):
    """租客表。"""

    __tablename__ = "tenants"

    user_id: uuid.UUID = Field(foreign_key="users.id", index=True)
    nationality: Optional[str] = None
    passport_no_enc: Optional[str] = Field(default=None, description="加密的护照号")
    id_card_no_enc: Optional[str] = Field(default=None, description="加密的身份证号")
    emergency_contact_enc: Optional[Dict[str, Any]] = Field(
        default=None,
        sa_column=Column(JSON, nullable=True, comment="加密的紧急联系人信息"),
    )
    employer_info: Optional[Dict[str, Any]] = Field(
        default=None, sa_column=Column(JSON, nullable=True, comment="雇主信息")
    )
    monthly_income: Optional[float] = None
    tenant_credit_score: Optional[int] = None
