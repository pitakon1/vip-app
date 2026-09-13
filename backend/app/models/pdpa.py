"""PDPA（个人数据保护法）相关模型。

对应设计文档中的 PDPA 合规主数据，包含同意记录、审计日志、数据主体请求与隐私政策版本。
"""
from datetime import datetime
from enum import Enum
from typing import Any, List, Optional
import uuid

from sqlalchemy import Column, JSON
from sqlmodel import Field

from .base import TimestampMixin


class Consent(TimestampMixin, table=True):
    """用户同意记录表。

    记录用户对各类数据处理目的的授权与撤销。
    """

    __tablename__ = "pdpa_consents"

    user_id: uuid.UUID = Field(foreign_key="users.id", index=True)
    purpose: str = Field(index=True, description="数据处理目的")
    granted: bool = Field(default=False, index=True)
    granted_at: Optional[datetime] = None
    revoked_at: Optional[datetime] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    policy_version: Optional[str] = None


class AuditLog(TimestampMixin, table=True):
    """审计日志表。

    记录对个人数据（PII）的访问与操作行为。
    """

    __tablename__ = "pdpa_audit_logs"

    actor_user_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="users.id", index=True
    )
    action: str = Field(index=True)
    resource_type: Optional[str] = Field(default=None, index=True)
    resource_id: Optional[str] = None
    pii_fields_accessed: Optional[List[Any]] = Field(
        default=None,
        sa_column=Column(JSON, nullable=True, comment="访问的 PII 字段列表"),
    )
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    occurred_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    request_id: Optional[str] = Field(default=None, index=True)


class DataSubjectRequestType(str, Enum):
    """数据主体请求类型枚举。"""

    access = "access"
    rectification = "rectification"
    erasure = "erasure"
    portability = "portability"
    restriction = "restriction"


class DataSubjectRequestStatus(str, Enum):
    """数据主体请求状态枚举。"""

    pending = "pending"
    processing = "processing"
    completed = "completed"
    rejected = "rejected"


class DataSubjectRequest(TimestampMixin, table=True):
    """数据主体请求表。

    记录用户根据 PDPA 提出的访问/更正/删除/可携带/限制处理请求。
    """

    __tablename__ = "pdpa_data_subject_requests"

    user_id: uuid.UUID = Field(foreign_key="users.id", index=True)
    request_type: DataSubjectRequestType = Field(index=True)
    status: DataSubjectRequestStatus = Field(
        default=DataSubjectRequestStatus.pending, index=True
    )
    submitted_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = None
    response_data_url: Optional[str] = None
    notes: Optional[str] = None


class PrivacyPolicyVersion(TimestampMixin, table=True):
    """隐私政策版本表。

    维护不同版本与多语言的隐私政策文本。
    """

    __tablename__ = "pdpa_privacy_policy_versions"

    version: str = Field(unique=True, index=True)
    content: str
    effective_at: datetime = Field(index=True)
    language: str = Field(default="zh", max_length=5, index=True)
