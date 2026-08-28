"""考勤模型。

对应设计文档中的员工考勤主数据，支持 GPS 打卡定位与多种考勤状态。
"""
from datetime import date as date_type, datetime
from enum import Enum
from typing import Any, Dict, Optional
import uuid

from sqlalchemy import Column, JSON
from sqlmodel import Field

from .base import TimestampMixin


class AttendanceStatus(str, Enum):
    """考勤状态枚举。"""

    present = "present"
    late = "late"
    absent = "absent"
    leave = "leave"
    field_work = "field_work"


class Attendance(TimestampMixin, table=True):
    """考勤表。"""

    __tablename__ = "attendances"

    employee_id: uuid.UUID = Field(foreign_key="employees.id", index=True)
    # 字段名 date 与类型 datetime.date 同名，故将导入别名化为 date_type 避免注解冲突
    date: date_type = Field(index=True)
    check_in_time: Optional[datetime] = None
    check_out_time: Optional[datetime] = None
    check_in_location: Optional[Dict[str, Any]] = Field(
        default=None,
        sa_column=Column(JSON, nullable=True, comment="打卡 GPS 定位"),
    )
    check_out_location: Optional[Dict[str, Any]] = Field(
        default=None,
        sa_column=Column(JSON, nullable=True, comment="签退 GPS 定位"),
    )
    status: AttendanceStatus = Field(
        default=AttendanceStatus.present, index=True
    )
    notes: Optional[str] = None
