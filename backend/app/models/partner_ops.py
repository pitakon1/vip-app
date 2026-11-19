"""合作公司运营扩展模型（P1/P2 路线图）。

覆盖：房源授权代销、线索报备、排班、任务/固定审批、素材库、Webhook、邀请与审计。
所有表均带 `partner_id`（可为空表示平台级），合作端接口强制按当前用户
`partner_id` 过滤，参见 `api/v1/partner_console.py`。
"""
import uuid
from datetime import date as date_type, datetime
from enum import Enum
from typing import Any, Dict, Optional

from sqlalchemy import Column, JSON
from sqlmodel import Field

from .base import TimestampMixin


class GrantStatus(str, Enum):
    """房源授权状态。"""

    active = "active"
    revoked = "revoked"
    expired = "expired"


class PartnerPropertyGrant(TimestampMixin, table=True):
    """平台向合作公司授权代销的房源（可按有效期自动失效）。"""

    __tablename__ = "partner_property_grants"

    partner_id: uuid.UUID = Field(foreign_key="partners.id", index=True)
    property_id: uuid.UUID = Field(foreign_key="properties.id", index=True)
    granted_by: Optional[uuid.UUID] = Field(default=None, foreign_key="users.id")
    expires_at: Optional[datetime] = Field(default=None, index=True)
    status: GrantStatus = Field(default=GrantStatus.active, index=True)
    note: Optional[str] = Field(default=None, max_length=255)


class AttendanceShift(TimestampMixin, table=True):
    """按日排班（轮班）：优先级高于考勤组的固定作息。"""

    __tablename__ = "attendance_shifts"

    partner_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="partners.id", index=True
    )
    employee_id: uuid.UUID = Field(foreign_key="employees.id", index=True)
    date: date_type = Field(index=True)
    start_time: str = Field(default="09:00", max_length=5)
    end_time: str = Field(default="18:00", max_length=5)
    note: Optional[str] = Field(default=None, max_length=255)
    created_by: Optional[uuid.UUID] = Field(default=None, foreign_key="users.id")


class LeadClaim(TimestampMixin, table=True):
    """客户报备：同一客户在保护期内归属首个报备公司。"""

    __tablename__ = "lead_claims"

    partner_id: uuid.UUID = Field(foreign_key="partners.id", index=True)
    # 归一化后的客户指纹（手机号 E.164 / 小写邮箱）
    fingerprint: str = Field(max_length=128, index=True)
    fingerprint_type: str = Field(default="phone", max_length=16)
    lead_id: Optional[uuid.UUID] = Field(default=None, foreign_key="leads.id")
    claimed_by: Optional[uuid.UUID] = Field(default=None, foreign_key="users.id")
    expires_at: datetime = Field(index=True)
    status: str = Field(default="active", max_length=16, index=True)


class PartnerTask(TimestampMixin, table=True):
    """公司任务派发与完成回执。"""

    __tablename__ = "partner_tasks"

    partner_id: uuid.UUID = Field(foreign_key="partners.id", index=True)
    title: str = Field(max_length=200)
    content: Optional[str] = None
    assignee_user_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="users.id", index=True
    )
    due_at: Optional[datetime] = None
    status: str = Field(default="pending", max_length=16, index=True)
    completed_at: Optional[datetime] = None
    created_by: Optional[uuid.UUID] = Field(default=None, foreign_key="users.id")


class PartnerApproval(TimestampMixin, table=True):
    """固定审批流（折扣 / 用印 / 费用），不做通用 BPM。"""

    __tablename__ = "partner_approvals"

    partner_id: uuid.UUID = Field(foreign_key="partners.id", index=True)
    kind: str = Field(default="expense", max_length=16, index=True)
    title: str = Field(max_length=200)
    amount: Optional[float] = None
    content: Optional[str] = None
    status: str = Field(default="pending", max_length=16, index=True)
    applicant_user_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="users.id", index=True
    )
    reviewed_by: Optional[uuid.UUID] = Field(default=None, foreign_key="users.id")
    reviewed_at: Optional[datetime] = None
    reply_note: Optional[str] = Field(default=None, max_length=255)


class PartnerMaterial(TimestampMixin, table=True):
    """素材库：平台公开素材（partner_id 为空）+ 公司自有素材。"""

    __tablename__ = "partner_materials"

    partner_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="partners.id", index=True
    )
    title: str = Field(max_length=200)
    category: str = Field(default="other", max_length=24, index=True)
    url: str = Field(max_length=1000)
    description: Optional[str] = Field(default=None, max_length=500)
    uploaded_by: Optional[uuid.UUID] = Field(default=None, foreign_key="users.id")


class PartnerWebhook(TimestampMixin, table=True):
    """合作公司 Webhook 订阅配置。"""

    __tablename__ = "partner_webhooks"

    partner_id: uuid.UUID = Field(foreign_key="partners.id", index=True)
    url: str = Field(max_length=1000)
    secret: str = Field(max_length=128)
    events: Optional[list] = Field(default=None, sa_column=Column(JSON, nullable=True))
    is_active: bool = Field(default=True, index=True)
    last_status_code: Optional[int] = None
    last_delivery_at: Optional[datetime] = None


class PartnerWebhookEvent(TimestampMixin, table=True):
    """Webhook 投递记录（至少一次投递 + 失败重试依据）。"""

    __tablename__ = "partner_webhook_events"

    partner_id: uuid.UUID = Field(foreign_key="partners.id", index=True)
    webhook_id: uuid.UUID = Field(foreign_key="partner_webhooks.id", index=True)
    event: str = Field(max_length=64, index=True)
    payload: Optional[Dict[str, Any]] = Field(
        default=None, sa_column=Column(JSON, nullable=True)
    )
    status: str = Field(default="pending", max_length=16, index=True)
    attempts: int = Field(default=0)
    next_retry_at: Optional[datetime] = Field(default=None, index=True)
    response_code: Optional[int] = None
    response_body: Optional[str] = Field(default=None, max_length=500)


class PartnerInvitation(TimestampMixin, table=True):
    """邀请链接：注册后自动归属本公司。"""

    __tablename__ = "partner_invitations"

    partner_id: uuid.UUID = Field(foreign_key="partners.id", index=True)
    token: str = Field(unique=True, index=True, max_length=64)
    email: Optional[str] = Field(default=None, max_length=255)
    position: Optional[str] = Field(default=None, max_length=80)
    expires_at: datetime = Field(index=True)
    status: str = Field(default="pending", max_length=16, index=True)
    used_by: Optional[uuid.UUID] = Field(default=None, foreign_key="users.id")


class PartnerAuditLog(TimestampMixin, table=True):
    """合作公司维度操作日志（停用成员 / 改规则 / 导出数据等）。"""

    __tablename__ = "partner_audit_logs"

    partner_id: uuid.UUID = Field(foreign_key="partners.id", index=True)
    actor_user_id: Optional[uuid.UUID] = Field(default=None, foreign_key="users.id")
    action: str = Field(max_length=64, index=True)
    resource_type: Optional[str] = Field(default=None, max_length=64, index=True)
    resource_id: Optional[str] = Field(default=None, max_length=64)
    detail: Optional[Dict[str, Any]] = Field(
        default=None, sa_column=Column(JSON, nullable=True)
    )
    occurred_at: datetime = Field(default_factory=datetime.utcnow, index=True)
