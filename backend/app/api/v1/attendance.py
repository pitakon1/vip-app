"""考勤路由：GPS 定位打卡上下班、考勤记录、外勤申请。

定位规则：打卡点与公司基准点距离在校验半径（默认 500KM）内放行；
超出半径则必须当日已提交并获批外勤申请，否则拒绝并提示填写外勤申请。
"""
import uuid
from datetime import date, datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlmodel import Session, select

from app.db import get_session
from app.core.auth import require_admin, require_employee, require_role
from app.models import (
    Attendance, AttendanceStatus, Employee, ExternalTripApplication, TripStatus, User,
    UserRole,
)
from app.config import settings
from app.providers.geo import geo_provider, is_within_radius

router = APIRouter(prefix="/attendance", tags=["attendance"])


# ---------------- 响应模型（OpenAPI 契约） ----------------
class OfficeLocation(BaseModel):
    """公司基准点坐标。"""

    model_config = ConfigDict(extra="allow")

    lat: Optional[float] = None
    lng: Optional[float] = None


class TodayAttendanceOut(BaseModel):
    """今日考勤状态 + 定位半径信息。"""

    model_config = ConfigDict(extra="allow")

    checked_in: Optional[bool] = None
    checked_out: Optional[bool] = None
    status: Optional[str] = None
    check_in_time: Optional[str] = None
    check_out_time: Optional[str] = None
    check_in_location: Optional[Dict[str, Any]] = None
    check_out_location: Optional[Dict[str, Any]] = None
    radius_km: Optional[float] = None
    office: Optional[OfficeLocation] = None


class ExternalTripOut(BaseModel):
    """外勤/出差申请条目。"""

    model_config = ConfigDict(extra="allow")

    id: Optional[str] = None
    trip_date: Optional[str] = None
    to_location: Optional[str] = None
    reason: Optional[str] = None
    status: Optional[str] = None
    reply_note: Optional[str] = None


class AttendanceDateRange(BaseModel):
    """考勤核对-日期区间。"""

    model_config = ConfigDict(extra="allow")

    start: Optional[str] = None
    end: Optional[str] = None
    days: Optional[int] = None


class AttendanceDayRow(BaseModel):
    """考勤核对-单日记录。"""

    model_config = ConfigDict(extra="allow")

    date: Optional[str] = None
    status: Optional[str] = None
    check_in: Optional[str] = None
    check_out: Optional[str] = None
    notes: Optional[str] = None


class AttendanceAdminRecord(BaseModel):
    """考勤核对-单员工记录。"""

    model_config = ConfigDict(extra="allow")

    employee_id: Optional[str] = None
    name: Optional[str] = None
    email: Optional[str] = None
    department: Optional[str] = None
    employee_code: Optional[str] = None
    days: Optional[List[AttendanceDayRow]] = None


class AttendanceAdminRecordsOut(BaseModel):
    """考勤核对-全员明细与汇总。"""

    model_config = ConfigDict(extra="allow")

    range: Optional[AttendanceDateRange] = None
    total_employees: Optional[int] = None
    summary: Optional[Dict[str, int]] = None
    department: Optional[str] = None
    records: Optional[List[AttendanceAdminRecord]] = None


def _get_employee(session: Session, user: User) -> Employee:
    employee = session.exec(
        select(Employee).where(
            Employee.user_id == user.id, Employee.deleted_at.is_(None)
        )
    ).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee profile not found")
    return employee


def _approved_trip_today(session: Session, employee_id, today) -> bool:
    trip = session.exec(
        select(ExternalTripApplication).where(
            ExternalTripApplication.employee_id == employee_id,
            ExternalTripApplication.trip_date == today,
            ExternalTripApplication.status == TripStatus.approved,
            ExternalTripApplication.deleted_at.is_(None),
        )
    ).first()
    return trip is not None


def _validate_location(session: Session, employee_id, today, lat, lng) -> dict:
    """校验打卡定位：在半径内返回 location dict；否则要求外勤申请。"""
    within, dist = is_within_radius(lat, lng, settings.ATTENDANCE_RADIUS_KM)
    if within:
        addr = geo_provider.reverse_geocode(lat, lng).get("address", "")
        return {"lat": lat, "lng": lng, "within_radius": True, "distance_km": round(dist, 3), "address": addr}
    if not _approved_trip_today(session, employee_id, today):
        raise HTTPException(
            status_code=403,
            detail=(
                f"Out of check-in radius ({dist:.0f}km > {settings.ATTENDANCE_RADIUS_KM}km). "
                "A commute/field external-trip application must be approved first."
            ),
        )
    return {"lat": lat, "lng": lng, "within_radius": False, "distance_km": round(dist, 3)}


@router.post("/check-in")
def check_in(
    payload: dict = Body(default={}),
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """打卡上班。body 可含 {lat, lng} 用于定位校验。"""
    employee = _get_employee(session, user)
    today = date.today()
    existing = session.exec(
        select(Attendance).where(
            Attendance.employee_id == employee.id,
            Attendance.date == today,
            Attendance.deleted_at.is_(None),
        )
    ).first()

    location = None
    if payload.get("lat") is not None and payload.get("lng") is not None:
        location = _validate_location(
            session, employee.id, today, payload["lat"], payload["lng"]
        )

    now = datetime.utcnow()
    if existing:
        if existing.check_in_time:
            raise HTTPException(status_code=400, detail="Already checked in today")
        existing.check_in_time = now
        existing.status = AttendanceStatus.present
        existing.check_in_location = location or existing.check_in_location
        attendance = existing
    else:
        attendance = Attendance(
            employee_id=employee.id,
            date=today,
            check_in_time=now,
            check_in_location=location,
            status=AttendanceStatus.present,
        )
    session.add(attendance)
    session.commit()
    session.refresh(attendance)
    return attendance


@router.post("/check-out")
def check_out(
    payload: dict = Body(default={}),
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """打卡下班。body 可含 {lat, lng}。"""
    employee = _get_employee(session, user)
    today = date.today()
    attendance = session.exec(
        select(Attendance).where(
            Attendance.employee_id == employee.id,
            Attendance.date == today,
            Attendance.deleted_at.is_(None),
        )
    ).first()
    if not attendance or not attendance.check_in_time:
        raise HTTPException(status_code=400, detail="No check-in record for today")
    if attendance.check_out_time:
        raise HTTPException(status_code=400, detail="Already checked out today")

    if payload.get("lat") is not None and payload.get("lng") is not None:
        attendance.check_out_location = _validate_location(
            session, employee.id, today, payload["lat"], payload["lng"]
        )
    attendance.check_out_time = datetime.utcnow()
    session.add(attendance)
    session.commit()
    session.refresh(attendance)
    return attendance


@router.get("/today", response_model=TodayAttendanceOut)
def today_attendance(
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """今日考勤状态 + 定位半径信息。"""
    employee = _get_employee(session, user)
    today = date.today()
    attendance = session.exec(
        select(Attendance).where(
            Attendance.employee_id == employee.id,
            Attendance.date == today,
            Attendance.deleted_at.is_(None),
        )
    ).first()
    base = {
        "checked_in": False,
        "checked_out": False,
        "status": None,
        "check_in_location": None,
        "check_out_location": None,
        "radius_km": settings.ATTENDANCE_RADIUS_KM,
        "office": {
            "lat": settings.ATTENDANCE_OFFICE_LAT,
            "lng": settings.ATTENDANCE_OFFICE_LNG,
        },
    }
    if not attendance:
        return base
    base.update(
        {
            "checked_in": attendance.check_in_time is not None,
            "checked_out": attendance.check_out_time is not None,
            "check_in_time": attendance.check_in_time.isoformat() if attendance.check_in_time else None,
            "check_out_time": attendance.check_out_time.isoformat() if attendance.check_out_time else None,
            "status": attendance.status.value if attendance.status else None,
            "check_in_location": attendance.check_in_location,
            "check_out_location": attendance.check_out_location,
        }
    )
    return base


@router.get("/me", response_model=List[Attendance])
def my_attendance(
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    employee = _get_employee(session, user)
    records = session.exec(
        select(Attendance)
        .where(
            Attendance.employee_id == employee.id,
            Attendance.deleted_at.is_(None),
        )
        .order_by(Attendance.date.desc())
    ).all()
    return records


# ---------------- 外勤 / 出差 申请 ----------------
@router.post("/external-trips")
def apply_external_trip(
    payload: dict,
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """填写外出/外勤申请（超出定位半径打卡前需获批）。"""
    employee = _get_employee(session, user)
    app = ExternalTripApplication(
        employee_id=employee.id,
        trip_date=date.fromisoformat(payload.get("trip_date")),
        from_location=payload.get("from_location"),
        to_location=payload.get("to_location"),
        to_lat=payload.get("to_lat"),
        to_lng=payload.get("to_lng"),
        reason=payload.get("reason", ""),
        status=TripStatus.pending,
    )
    session.add(app)
    session.commit()
    session.refresh(app)
    return {
        "id": str(app.id),
        "trip_date": app.trip_date.isoformat(),
        "to_location": app.to_location,
        "reason": app.reason,
        "status": app.status.value,
    }


@router.get("/external-trips", response_model=List[ExternalTripOut])
def list_external_trips(
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    employee = _get_employee(session, user)
    apps = session.exec(
        select(ExternalTripApplication)
        .where(ExternalTripApplication.employee_id == employee.id)
        .order_by(ExternalTripApplication.created_at.desc())
    ).all()
    return [
        {
            "id": str(a.id),
            "trip_date": a.trip_date.isoformat(),
            "to_location": a.to_location,
            "reason": a.reason,
            "status": a.status.value,
            "reply_note": a.reply_note,
        }
        for a in apps
    ]


@router.post("/external-trips/{trip_id}/approve")
def approve_external_trip(
    trip_id: uuid.UUID,
    payload: dict = Body(default={}),
    session: Session = Depends(get_session),
    user: User = Depends(require_role(UserRole.admin, UserRole.agent)),
):
    """审批外勤申请（admin/agent）。payload: {action: approved|rejected, reply_note?}"""
    app = session.get(ExternalTripApplication, trip_id)
    if not app:
        raise HTTPException(status_code=404, detail="Trip application not found")
    action = payload.get("action", "approved")
    app.status = TripStatus.approved if action == "approved" else TripStatus.rejected
    app.approved_by = user.id
    app.approved_at = datetime.utcnow()
    app.reply_note = payload.get("reply_note")
    session.add(app)
    session.commit()
    session.refresh(app)
    return {"id": str(app.id), "status": app.status.value}


# ---------------------------------------------------------------------------
# 管理员考勤核对：查看全部员工的考勤记录与汇总
# ---------------------------------------------------------------------------
@router.get("/admin/records", response_model=AttendanceAdminRecordsOut)
def admin_attendance_records(
    start_date: date | None = None,
    end_date: date | None = None,
    department: str | None = None,
    session: Session = Depends(get_session),
    user: User = Depends(require_admin),
):
    """考勤核对：按日期区间（默认最近 7 天）返回全员考勤明细与汇总。

    三端暂无调用方（见 tests/tools_contract_check.py --orphans）：管理端「考勤核对」
    报表页尚未做；员工自助考勤走 /attendance/me。
    """
    today = date.today()
    start = start_date or today
    end = end_date or today
    if start > end:
        start, end = end, start
    if (end - start).days > 92:
        raise HTTPException(status_code=400, detail="Date range too large (max 92 days)")

    emp_conditions = [Employee.deleted_at.is_(None), Employee.is_active.is_(True)]
    if department:
        emp_conditions.append(Employee.department == department)
    employees = session.exec(
        select(Employee).where(*emp_conditions).order_by(Employee.department, Employee.employee_code)
    ).all()

    att_conditions = [
        Attendance.deleted_at.is_(None),
        Attendance.date >= start,
        Attendance.date <= end,
    ]
    atts = session.exec(select(Attendance).where(*att_conditions)).all()
    users = {
        u.id: u
        for u in session.exec(select(User).where(User.id.in_([e.user_id for e in employees]) if employees else User.id.is_not(None))).all()
    }

    by_employee: dict[uuid.UUID, list] = {}
    for a in atts:
        by_employee.setdefault(a.employee_id, []).append(a)

    status_totals: dict[str, int] = {s.value: 0 for s in AttendanceStatus}
    records = []
    for e in employees:
        u = users.get(e.user_id)
        rows = sorted(by_employee.get(e.id, []), key=lambda x: x.date)
        record_days = []
        for a in rows:
            status_totals[a.status.value] = status_totals.get(a.status.value, 0) + 1
            record_days.append(
                {
                    "date": a.date.isoformat(),
                    "status": a.status.value,
                    "check_in": a.check_in_time.isoformat() if a.check_in_time else None,
                    "check_out": a.check_out_time.isoformat() if a.check_out_time else None,
                    "notes": a.notes,
                }
            )
        records.append(
            {
                "employee_id": str(e.id),
                "name": u.full_name if u else None,
                "email": u.email if u else None,
                "department": e.department,
                "employee_code": e.employee_code,
                "days": record_days,
            }
        )

    expected_days = (end - start).days + 1
    return {
        "range": {"start": start.isoformat(), "end": end.isoformat(), "days": expected_days},
        "total_employees": len(records),
        "summary": status_totals,
        "department": department,
        "records": records,
    }