"""外勤 / 出差申请模型（配合考勤 500KM 半径打卡）。"""
import uuid
from datetime import date as date_type, datetime
from enum import Enum
from typing import Optional

from sqlmodel import Field

from .base import TimestampMixin


class TripStatus(str, Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class ExternalTripApplication(TimestampMixin, table=True):
    """外勤申请：打卡地点与公司基准点距离超出半径时，需先提交本申请。"""

    __tablename__ = "external_trip_applications"

    employee_id: uuid.UUID = Field(foreign_key="employees.id", index=True)
    trip_date: date_type = Field(index=True)
    from_location: Optional[str] = None
    to_location: Optional[str] = None
    to_lat: Optional[float] = None
    to_lng: Optional[float] = None
    reason: str = ""
    status: TripStatus = Field(default=TripStatus.pending, index=True)
    approved_by: Optional[uuid.UUID] = Field(default=None, foreign_key="users.id")
    approved_at: Optional[datetime] = None
    reply_note: Optional[str] = None