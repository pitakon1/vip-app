"""客户线索模型。

对应设计文档中的客户线索/CRM 主数据，跟踪潜在租客的转化漏斗。
"""
from datetime import datetime
from enum import Enum
from typing import Any, List, Optional
import uuid

from sqlalchemy import Column, JSON
from sqlmodel import Field

from .base import TimestampMixin


class LeadStage(str, Enum):
    """线索阶段枚举。"""

    inquiring = "inquiring"
    viewing_scheduled = "viewing_scheduled"
    negotiating = "negotiating"
    pending_contract = "pending_contract"
    closed = "closed"


class Lead(TimestampMixin, table=True):
    """客户线索表。"""

    __tablename__ = "leads"

    name: str = Field(index=True)
    nationality: Optional[str] = None
    line_id: Optional[str] = None
    wechat_id: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    budget_min: Optional[float] = None
    budget_max: Optional[float] = None
    budget_currency: str = Field(default="THB", max_length=3)
    interested_projects: Optional[List[Any]] = Field(
        default=None, sa_column=Column(JSON, nullable=True)
    )
    recommended_properties: Optional[List[Any]] = Field(
        default=None, sa_column=Column(JSON, nullable=True)
    )
    stage: LeadStage = Field(default=LeadStage.inquiring, index=True)
    assigned_to: Optional[uuid.UUID] = Field(
        default=None, foreign_key="employees.id"
    )
    notes: Optional[str] = None
    source: Optional[str] = None  # 来源渠道
    # 客户需求描述：Web CRM 表单有该字段并在编辑时回填，此前后端无此列，
    # 提交的内容被 Pydantic 静默丢弃（写不进、读不回），故补列。
    requirement: Optional[str] = None
    closed_at: Optional[datetime] = None
