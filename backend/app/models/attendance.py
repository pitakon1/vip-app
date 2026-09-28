"""考勤模型。

对应设计文档中的员工考勤主数据，支持 GPS 打卡定位与多种考勤状态。
P1 追加考勤组（多办公点/多套作息规则，按部门或员工分配）与假勤（请假申请）。
"""
from datetime import date as date_type, datetime
from enum import Enum
from typing import Any, Dict, Optional
import uuid

from sqlalchemy import Column, JSON
from sqlmodel import Field

from .base import TimestampMixin


class AttendanceStatus(str, Enum):
    """考勤状态枚举。

    取值长度不得超过 10：字段由 SQLModel 按枚举值最大长度推导为 VARCHAR(10)，
    新增更长的取值会与既有库表结构漂移（PG 会直接报 value too long）。
    """

    present = "present"
    late = "late"
    early_out = "early_out"  # 早退（下班早于作息时间 − 宽限）
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


class LeaveType(str, Enum):
    """假勤类型（对齐企业微信的请假类型）。"""

    annual = "annual"  # 年假
    sick = "sick"  # 病假
    personal = "personal"  # 事假
    unpaid = "unpaid"  # 无薪假
    maternity = "maternity"  # 产假/陪产假
    other = "other"  # 其他


class LeaveStatus(str, Enum):
    """假勤审批状态。

    取值长度不得超过 9：字段由 SQLModel 按枚举值最大长度推导为 VARCHAR(9)
    （最长取值 cancelled 为 9 个字符），新增更长取值会与既有库表结构漂移。
    """

    pending = "pending"
    approved = "approved"
    rejected = "rejected"
    cancelled = "cancelled"


class AttendanceGroup(TimestampMixin, table=True):
    """考勤组：一套独立的办公点坐标 + 作息规则。

    对齐企业微信：一个公司可有多个考勤组（多办公点/多班次），每组各自定义
    打卡半径、上下班时间、迟到/早退宽限与考勤时区；员工按「显式指定 →
    所属部门 → 默认组」优先级归属某一组，未命中任何组时回落全局 settings。
    """

    __tablename__ = "attendance_groups"

    name: str = Field(index=True, max_length=80)
    description: Optional[str] = Field(default=None, max_length=255)
    office_lat: float = Field(default=13.7563)
    office_lng: float = Field(default=100.5018)
    radius_km: float = Field(default=0.5)
    # 组级考勤时区：多国市场下不同办公点可能跨时区
    utc_offset_hours: float = Field(default=7.0)
    work_start: str = Field(default="09:00", max_length=5)
    work_end: str = Field(default="18:00", max_length=5)
    late_grace_minutes: int = Field(default=0)
    early_grace_minutes: int = Field(default=0)
    # 适用部门（为空表示不按部门自动归属，只能靠显式成员分配）
    department: Optional[str] = Field(default=None, index=True, max_length=80)
    # 默认组：员工未命中部门组时回落至此
    is_default: bool = Field(default=False, index=True)
    is_active: bool = Field(default=True, index=True)


class AttendanceGroupMember(TimestampMixin, table=True):
    """考勤组成员：把员工显式指定到某个考勤组（优先级高于部门归属）。"""

    __tablename__ = "attendance_group_members"

    group_id: uuid.UUID = Field(foreign_key="attendance_groups.id", index=True)
    employee_id: uuid.UUID = Field(foreign_key="employees.id", index=True)


class LeaveRequest(TimestampMixin, table=True):
    """假勤（请假）申请：审批通过后按日期区间写入 Attendance(status=leave)。"""

    __tablename__ = "leave_requests"

    employee_id: uuid.UUID = Field(foreign_key="employees.id", index=True)
    leave_type: LeaveType = Field(default=LeaveType.annual, index=True)
    start_date: date_type = Field(index=True)
    end_date: date_type = Field(index=True)
    # 请假天数：整天的自然日天数，允许 0.5 天粒度
    days: float = Field(default=1.0)
    reason: str = Field(default="", max_length=500)
    status: LeaveStatus = Field(default=LeaveStatus.pending, index=True)
    approved_by: Optional[uuid.UUID] = Field(default=None, foreign_key="users.id")
    approved_at: Optional[datetime] = None
    reply_note: Optional[str] = Field(default=None, max_length=255)
