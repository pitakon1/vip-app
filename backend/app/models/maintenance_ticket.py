"""报修工单模型。

对应设计文档中的报修/维修工单主数据。
"""
from datetime import datetime
from enum import Enum
from typing import Any, List, Optional
import uuid

from sqlalchemy import Column, JSON
from sqlmodel import Field

from .base import TimestampMixin


class TicketPriority(str, Enum):
    """工单优先级枚举。"""

    low = "low"
    medium = "medium"
    high = "high"
    urgent = "urgent"


class TicketStatus(str, Enum):
    """工单状态枚举。"""

    open = "open"
    assigned = "assigned"
    in_progress = "in_progress"
    resolved = "resolved"
    closed = "closed"


class MaintenanceTicket(TimestampMixin, table=True):
    """报修工单表。"""

    __tablename__ = "maintenance_tickets"

    property_id: uuid.UUID = Field(foreign_key="properties.id", index=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id")
    lease_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="leases.id"
    )
    title: str
    description: str
    photos: Optional[List[Any]] = Field(
        default=None, sa_column=Column(JSON, nullable=True)
    )
    priority: TicketPriority = Field(default=TicketPriority.medium, index=True)
    status: TicketStatus = Field(default=TicketStatus.open, index=True)
    assigned_to: Optional[uuid.UUID] = Field(
        default=None, foreign_key="employees.id"
    )
    resolved_at: Optional[datetime] = None
    resolution_notes: Optional[str] = None
    resolution_photos: Optional[List[Any]] = Field(
        default=None, sa_column=Column(JSON, nullable=True)
    )
    cost: float = Field(default=0)
    payment_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="payments.id"
    )
