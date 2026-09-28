"""考勤路由：GPS 定位打卡上下班、考勤记录、外勤申请、管理员校准。

定位规则：打卡点与公司基准点距离在校验半径（默认 0.5km）内放行；
超出半径则必须当日已提交并获批外勤申请，否则拒绝并提示填写外勤申请。

时间规则（P0）：打卡入库时间一律为 UTC；「考勤日」与迟到/早退判定按考勤时区
（settings.ATTENDANCE_UTC_OFFSET_HOURS，默认曼谷 UTC+7）计算，不随服务器本地
时区漂移。迟到分界 = 上班时间 + 宽限，早退分界 = 下班时间 − 宽限。
"""
import uuid
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, field_validator
from sqlmodel import Session, select

from app.db import get_session
from app.core.audit import log_audit
from app.core.auth import require_admin, require_employee, require_role
from app.models import (
    Attendance, AttendanceGroup, AttendanceGroupMember, AttendanceStatus, Employee,
    ExternalTripApplication, LeaveRequest, LeaveStatus, LeaveType, TripStatus, User,
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
    # 当前作息（考勤时区），便于前端展示「迟到判断依据」
    work_start: Optional[str] = None
    work_end: Optional[str] = None
    # 生效考勤组（无组时为 None，表示用全局默认规则）
    group_id: Optional[str] = None
    group_name: Optional[str] = None
    utc_offset_hours: Optional[float] = None
    late_grace_minutes: Optional[int] = None
    early_grace_minutes: Optional[int] = None
    # 判定明细：迟到 / 早退分钟数（status 是单值，两项可同时存在）
    late_minutes: Optional[int] = None
    early_out_minutes: Optional[int] = None


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
    late_minutes: Optional[int] = None
    early_out_minutes: Optional[int] = None


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


def _validate_location(
    session: Session, employee_id, today, lat, lng, rule: "AttendanceRule"
) -> dict:
    """校验打卡定位：在半径内返回 location dict；否则要求外勤申请。

    半径与办公点基准取员工生效规则（考勤组优先，无组回落全局 settings）。
    """
    within, dist = is_within_radius(
        lat, lng, rule.radius_km, rule.office_lat, rule.office_lng
    )
    if within:
        addr = geo_provider.reverse_geocode(lat, lng).get("address", "")
        return {
            "lat": lat,
            "lng": lng,
            "within_radius": True,
            "distance_km": round(dist, 3),
            "address": addr,
            "group_id": rule.group_id,
        }
    if not _approved_trip_today(session, employee_id, today):
        raise HTTPException(
            status_code=403,
            detail=(
                f"Out of check-in radius ({dist:.0f}km > {rule.radius_km}km). "
                "A commute/field external-trip application must be approved first."
            ),
        )
    return {
        "lat": lat,
        "lng": lng,
        "within_radius": False,
        "distance_km": round(dist, 3),
        "group_id": rule.group_id,
    }


def _require_location(payload: dict) -> tuple[float, float]:
    """打卡必须携带有效定位：lat/lng 同时存在、为数值且在合理范围内，否则 400。"""
    lat = payload.get("lat")
    lng = payload.get("lng")
    if lat is None or lng is None:
        raise HTTPException(status_code=400, detail="lat and lng are required for check-in/check-out")
    if (
        isinstance(lat, bool)
        or not isinstance(lat, (int, float))
        or isinstance(lng, bool)
        or not isinstance(lng, (int, float))
    ):
        raise HTTPException(status_code=400, detail="lat and lng must be numeric")
    if not (-90 <= lat <= 90) or not (-180 <= lng <= 180):
        raise HTTPException(status_code=400, detail="lat/lng out of valid range")
    return float(lat), float(lng)


# ---------------- 考勤规则：考勤组 → 员工当日生效规则 ----------------
class AttendanceRule(BaseModel):
    """员工当日生效的考勤规则。

    命中考勤组则用组规则（多办公点/多班次），未命中则回落全局 settings，
    保证没有配置考勤组时与 P0 的单一办公点行为完全一致。
    """

    model_config = ConfigDict(extra="allow")

    group_id: Optional[str] = None
    group_name: Optional[str] = None
    office_lat: float = 13.7563
    office_lng: float = 100.5018
    radius_km: float = 0.5
    utc_offset_hours: float = 7.0
    work_start: str = "09:00"
    work_end: str = "18:00"
    late_grace_minutes: int = 0
    early_grace_minutes: int = 0


def _default_rule() -> AttendanceRule:
    """全局 settings 兜底规则（无考勤组命中时使用）。"""
    return AttendanceRule(
        group_id=None,
        group_name=None,
        office_lat=settings.ATTENDANCE_OFFICE_LAT,
        office_lng=settings.ATTENDANCE_OFFICE_LNG,
        radius_km=settings.ATTENDANCE_RADIUS_KM,
        utc_offset_hours=settings.ATTENDANCE_UTC_OFFSET_HOURS,
        work_start=settings.ATTENDANCE_WORK_START,
        work_end=settings.ATTENDANCE_WORK_END,
        late_grace_minutes=settings.ATTENDANCE_LATE_GRACE_MINUTES,
        early_grace_minutes=settings.ATTENDANCE_EARLY_GRACE_MINUTES,
    )


def _active_groups(session: Session) -> List[AttendanceGroup]:
    """全部启用中的考勤组（按创建时间排序，保证归属解析结果稳定）。"""
    return list(
        session.exec(
            select(AttendanceGroup)
            .where(
                AttendanceGroup.deleted_at.is_(None),
                AttendanceGroup.is_active.is_(True),
            )
            .order_by(AttendanceGroup.created_at)
        ).all()
    )


def _resolve_rules(session: Session, employee: Employee) -> AttendanceRule:
    """解析员工生效规则：显式成员 → 所属部门 → 默认组 → 全局 settings。"""
    groups = {g.id: g for g in _active_groups(session)}
    group: Optional[AttendanceGroup] = None
    if groups:
        member = session.exec(
            select(AttendanceGroupMember).where(
                AttendanceGroupMember.employee_id == employee.id,
                AttendanceGroupMember.deleted_at.is_(None),
            )
        ).first()
        if member:
            group = groups.get(member.group_id)
        if group is None and employee.department:
            group = next(
                (g for g in groups.values() if g.department == employee.department),
                None,
            )
        if group is None:
            group = next((g for g in groups.values() if g.is_default), None)
    if group is None:
        return _default_rule()
    return AttendanceRule(
        group_id=str(group.id),
        group_name=group.name,
        office_lat=group.office_lat,
        office_lng=group.office_lng,
        radius_km=group.radius_km,
        utc_offset_hours=group.utc_offset_hours,
        work_start=group.work_start,
        work_end=group.work_end,
        late_grace_minutes=group.late_grace_minutes,
        early_grace_minutes=group.early_grace_minutes,
    )


# ---------------- 考勤时间基准（迟到 / 早退 / 考勤日） ----------------
def _setting_minutes(value: str, field: str) -> int:
    """把 "HH:MM" 配置解析为当日分钟数（0–1439）；格式非法直接 500，不静默降级。"""
    try:
        hh, mm = value.strip().split(":")
        hours, minutes = int(hh), int(mm)
    except (AttributeError, ValueError):
        hours = minutes = -1
    if not (0 <= hours <= 23 and 0 <= minutes <= 59):
        raise HTTPException(
            status_code=500, detail=f"{field} must be 'HH:MM' between 00:00 and 23:59"
        )
    return hours * 60 + minutes


def _work_window(rule: AttendanceRule) -> tuple[int, int]:
    """返回 (迟到分界, 早退分界) 的当日分钟数。

    宽限已折算进分界：迟到分界 = 上班 + 迟到宽限，早退分界 = 下班 − 早退宽限。
    下班不晚于上班时按跨天班次处理（如 22:00–06:00），下班分界加一天。
    """
    start = _setting_minutes(rule.work_start, "ATTENDANCE_WORK_START")
    end = _setting_minutes(rule.work_end, "ATTENDANCE_WORK_END")
    if end <= start:
        end += 24 * 60
    late_line = start + max(0, rule.late_grace_minutes)
    early_line = end - max(0, rule.early_grace_minutes)
    return late_line, early_line


def _attendance_now(
    utc_offset_hours: Optional[float] = None,
) -> tuple[date, int, datetime]:
    """返回 (考勤日, 考勤时区当日分钟数, UTC 时刻)。

    入库时刻一律 UTC；「今天是哪天」「现在几点」按考勤时区计算，
    避免服务器处于其他时区时把凌晨打卡记到前一天。
    不传偏移时用全局 ATTENDANCE_UTC_OFFSET_HOURS（无员工的场景，如入参校验）。
    """
    offset = (
        settings.ATTENDANCE_UTC_OFFSET_HOURS
        if utc_offset_hours is None
        else utc_offset_hours
    )
    now = datetime.utcnow()
    local = now + timedelta(hours=offset)
    return local.date(), local.hour * 60 + local.minute, now


def _late_minutes(local_minutes: int, rule: AttendanceRule) -> int:
    """迟到分钟数；未超过迟到分界返回 0。"""
    late_line, _ = _work_window(rule)
    return max(0, local_minutes - late_line)


def _early_out_minutes(local_minutes: int, rule: AttendanceRule) -> int:
    """早退分钟数；未早于早退分界返回 0。跨天班次按 +24h 折算后比较。"""
    start_line, early_line = _work_window(rule)
    minutes = local_minutes if local_minutes >= start_line else local_minutes + 24 * 60
    return max(0, early_line - minutes)


def _merge_meta(record: Attendance, **values: Any) -> None:
    """把判定明细（迟到/早退分钟数、校准痕迹）并入 metadata_。

    status 是单值字段，无法同时表达「又迟到又早退」，明细统一放 metadata_。
    """
    meta = dict(record.metadata_ or {})
    meta.update({k: v for k, v in values.items() if v is not None})
    record.metadata_ = meta


@router.post("/check-in")
def check_in(
    payload: dict = Body(default={}),
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """打卡上班。body 必含 {lat, lng}（同时存在、数值且在合理范围内）用于定位校验。

    状态判定：半径内按考勤时区的上班时间判迟到（超过宽限记 `late` 并写入
    late_minutes）；半径外且当日外勤已获批记 `field_work`。
    办公点半径与作息时间取员工所属考勤组的规则，无考勤组时回落全局 settings。
    """
    employee = _get_employee(session, user)
    rule = _resolve_rules(session, employee)
    today, local_minutes, now = _attendance_now(rule.utc_offset_hours)
    existing = session.exec(
        select(Attendance).where(
            Attendance.employee_id == employee.id,
            Attendance.date == today,
            Attendance.deleted_at.is_(None),
        )
    ).first()

    lat, lng = _require_location(payload)
    location = _validate_location(session, employee.id, today, lat, lng, rule)

    if location and location.get("within_radius") is False:
        # 外勤打卡不在办公点，不按上下班时间判迟到
        status = AttendanceStatus.field_work
        late_minutes = 0
    else:
        late_minutes = _late_minutes(local_minutes, rule)
        status = AttendanceStatus.late if late_minutes else AttendanceStatus.present

    if existing:
        if existing.check_in_time:
            raise HTTPException(status_code=400, detail="Already checked in today")
        existing.check_in_time = now
        existing.status = status
        existing.check_in_location = location or existing.check_in_location
        attendance = existing
    else:
        attendance = Attendance(
            employee_id=employee.id,
            date=today,
            check_in_time=now,
            check_in_location=location,
            status=status,
        )
    if late_minutes:
        _merge_meta(attendance, late_minutes=late_minutes)
    _merge_meta(attendance, group_id=rule.group_id, group_name=rule.group_name)
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
    """打卡下班。body 必含 {lat, lng}（同时存在、数值且在合理范围内）用于定位校验。

    状态判定：早于下班时间 − 早退宽限记早退。status 为单值字段，因此
    `late` / `field_work` 已占用时只把早退分钟数写入 metadata_，不覆盖主状态。
    """
    employee = _get_employee(session, user)
    rule = _resolve_rules(session, employee)
    today, local_minutes, now = _attendance_now(rule.utc_offset_hours)
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

    lat, lng = _require_location(payload)
    attendance.check_out_location = _validate_location(
        session, employee.id, today, lat, lng, rule
    )
    attendance.check_out_time = now

    early_minutes = _early_out_minutes(local_minutes, rule)
    if early_minutes:
        if attendance.status not in (AttendanceStatus.late, AttendanceStatus.field_work):
            attendance.status = AttendanceStatus.early_out
        _merge_meta(attendance, early_out_minutes=early_minutes)
    session.add(attendance)
    session.commit()
    session.refresh(attendance)
    return attendance


@router.get("/today", response_model=TodayAttendanceOut)
def today_attendance(
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """今日考勤状态 + 定位半径信息（含生效考勤组的办公点与作息）。"""
    employee = _get_employee(session, user)
    rule = _resolve_rules(session, employee)
    today, _, _ = _attendance_now(rule.utc_offset_hours)
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
        "radius_km": rule.radius_km,
        "office": {
            "lat": rule.office_lat,
            "lng": rule.office_lng,
        },
        "work_start": rule.work_start,
        "work_end": rule.work_end,
        "group_id": rule.group_id,
        "group_name": rule.group_name,
        "utc_offset_hours": rule.utc_offset_hours,
        "late_grace_minutes": rule.late_grace_minutes,
        "early_grace_minutes": rule.early_grace_minutes,
    }
    if not attendance:
        return base
    meta = attendance.metadata_ or {}
    base.update(
        {
            "checked_in": attendance.check_in_time is not None,
            "checked_out": attendance.check_out_time is not None,
            "check_in_time": attendance.check_in_time.isoformat() if attendance.check_in_time else None,
            "check_out_time": attendance.check_out_time.isoformat() if attendance.check_out_time else None,
            "status": attendance.status.value if attendance.status else None,
            "check_in_location": attendance.check_in_location,
            "check_out_location": attendance.check_out_location,
            "late_minutes": meta.get("late_minutes"),
            "early_out_minutes": meta.get("early_out_minutes"),
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
class ExternalTripIn(BaseModel):
    """外勤/出差申请请求体：trip_date 必填、date 类型且不能是过去日期。"""

    trip_date: date
    from_location: Optional[str] = None
    to_location: Optional[str] = None
    to_lat: Optional[float] = None
    to_lng: Optional[float] = None
    reason: str = ""

    @field_validator("trip_date")
    @classmethod
    def _not_past(cls, v: date) -> date:
        # 与打卡同口径：按考勤时区判断「今天」，避免服务器异地时区误判过去日期
        if v < _attendance_now()[0]:
            raise ValueError("trip_date must not be in the past")
        return v


class ExternalTripActionIn(BaseModel):
    """外勤审批动作：action 必填（approved / rejected）。"""

    action: Literal["approved", "rejected"]
    reply_note: Optional[str] = None


@router.post("/external-trips")
def apply_external_trip(
    payload: ExternalTripIn,
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """填写外出/外勤申请（超出定位半径打卡前需获批）。"""
    employee = _get_employee(session, user)
    app = ExternalTripApplication(
        employee_id=employee.id,
        trip_date=payload.trip_date,
        from_location=payload.from_location,
        to_location=payload.to_location,
        to_lat=payload.to_lat,
        to_lng=payload.to_lng,
        reason=payload.reason,
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
    payload: ExternalTripActionIn,
    session: Session = Depends(get_session),
    user: User = Depends(require_role(UserRole.admin, UserRole.agent)),
):
    """审批外勤申请（admin/agent）。payload: {action: approved|rejected, reply_note?}"""
    app = session.get(ExternalTripApplication, trip_id)
    if not app or app.deleted_at:
        raise HTTPException(status_code=404, detail="Trip application not found")
    # 终态不可再审批：已 approved/rejected 的申请拒绝翻转覆盖
    if app.status != TripStatus.pending:
        raise HTTPException(
            status_code=409,
            detail=f"Trip application already {app.status.value} (final)",
        )
    app.status = TripStatus.approved if payload.action == "approved" else TripStatus.rejected
    app.approved_by = user.id
    app.approved_at = datetime.utcnow()
    app.reply_note = payload.reply_note
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
    """考勤核对：按日期区间（默认当天）返回全员考勤明细与汇总。

    三端暂无调用方（见 tests/tools_contract_check.py --orphans）：管理端「考勤核对」
    报表页尚未做；员工自助考勤走 /attendance/me。管理员改状态/补时间走
    PATCH /attendance/admin/records/{employee_id}。
    """
    today, _, _ = _attendance_now()
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
            meta = a.metadata_ or {}
            record_days.append(
                {
                    "date": a.date.isoformat(),
                    "status": a.status.value,
                    "check_in": a.check_in_time.isoformat() if a.check_in_time else None,
                    "check_out": a.check_out_time.isoformat() if a.check_out_time else None,
                    "notes": a.notes,
                    "late_minutes": meta.get("late_minutes"),
                    "early_out_minutes": meta.get("early_out_minutes"),
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


# ---------------------------------------------------------------------------
# 管理员校准：改状态 / 补上下班时间 / 改备注（异常闭环的最小形态）
# ---------------------------------------------------------------------------
class AttendanceCalibrateIn(BaseModel):
    """考勤校准入参：date 必填，其余至少给一项。"""

    date: date
    status: Optional[AttendanceStatus] = None
    check_in_time: Optional[datetime] = None
    check_out_time: Optional[datetime] = None
    notes: Optional[str] = None


@router.patch("/admin/records/{employee_id}")
def calibrate_attendance(
    employee_id: uuid.UUID,
    payload: AttendanceCalibrateIn,
    session: Session = Depends(get_session),
    user: User = Depends(require_admin),
):
    """管理员校准某员工某天的考勤（改状态 / 补上下班时间 / 改备注）。

    - 当天无记录时按「补录」新建，此时必须显式给 status，避免造出无时间的 present。
    - 时间入参按 UTC 理解，与打卡入库口径一致（不受考勤时区影响）。
    - 每次校准都写 PDPA 审计日志（action=attendance.calibrate）并在 metadata_ 留痕。
    - 三端暂无调用方：管理端考勤核对页（含校准入口）尚未做，接口先就绪。
    """
    if (
        payload.status is None
        and payload.check_in_time is None
        and payload.check_out_time is None
        and payload.notes is None
    ):
        raise HTTPException(status_code=400, detail="Nothing to calibrate")
    if (
        payload.check_in_time
        and payload.check_out_time
        and payload.check_out_time < payload.check_in_time
    ):
        raise HTTPException(
            status_code=400, detail="check_out_time must not be earlier than check_in_time"
        )
    employee = session.get(Employee, employee_id)
    if not employee or employee.deleted_at:
        raise HTTPException(status_code=404, detail="Employee not found")

    record = session.exec(
        select(Attendance).where(
            Attendance.employee_id == employee.id,
            Attendance.date == payload.date,
            Attendance.deleted_at.is_(None),
        )
    ).first()
    if record is None:
        if payload.status is None:
            raise HTTPException(
                status_code=400,
                detail="status is required when creating a missing attendance record",
            )
        record = Attendance(employee_id=employee.id, date=payload.date)

    if payload.status is not None:
        record.status = payload.status
    if payload.check_in_time is not None:
        record.check_in_time = payload.check_in_time
    if payload.check_out_time is not None:
        record.check_out_time = payload.check_out_time
    if payload.notes is not None:
        record.notes = payload.notes
    _merge_meta(
        record, calibrated_by=str(user.id), calibrated_at=datetime.utcnow().isoformat()
    )
    session.add(record)
    session.commit()
    session.refresh(record)

    log_audit(
        session,
        actor_user_id=user.id,
        action="attendance.calibrate",
        resource_type="attendance",
        resource_id=str(record.id),
    )
    # log_audit 内部会 commit，使 record 过期；序列化前再刷一次，避免响应缺字段
    session.refresh(record)
    return record


# ---------------------------------------------------------------------------
# P1-a 考勤组：多办公点 / 多班次规则 + 成员分配
# ---------------------------------------------------------------------------
class AttendanceGroupIn(BaseModel):
    """考勤组创建/更新入参。

    work_start / work_end 必须是 "HH:MM"（与全局配置同一口径），格式非法直接 422，
    不静默降级成默认作息——否则配错的组会「看起来生效但其实没有」。
    """

    name: str
    description: Optional[str] = None
    office_lat: float = 13.7563
    office_lng: float = 100.5018
    radius_km: float = 0.5
    utc_offset_hours: float = 7.0
    work_start: str = "09:00"
    work_end: str = "18:00"
    late_grace_minutes: int = 0
    early_grace_minutes: int = 0
    department: Optional[str] = None
    is_default: bool = False
    is_active: bool = True

    @field_validator("name")
    @classmethod
    def _name_required(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("name is required")
        return v.strip()

    @field_validator("work_start", "work_end")
    @classmethod
    def _hhmm(cls, v: str) -> str:
        # 入参非法属于请求问题，转成 ValueError 让 FastAPI 返回 422；
        # _setting_minutes 抛的 HTTPException(500) 是给「全局配置写错」用的
        try:
            _setting_minutes(v, "work_start/work_end")
        except HTTPException as exc:
            raise ValueError(str(exc.detail)) from exc
        return v

    @field_validator("radius_km")
    @classmethod
    def _radius_positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("radius_km must be greater than 0")
        return v

    @field_validator("office_lat")
    @classmethod
    def _lat_range(cls, v: float) -> float:
        if not -90 <= v <= 90:
            raise ValueError("office_lat out of valid range")
        return v

    @field_validator("office_lng")
    @classmethod
    def _lng_range(cls, v: float) -> float:
        if not -180 <= v <= 180:
            raise ValueError("office_lng out of valid range")
        return v


class AttendanceGroupPatchIn(BaseModel):
    """考勤组局部更新入参（只传要改的字段）。"""

    name: Optional[str] = None
    description: Optional[str] = None
    office_lat: Optional[float] = None
    office_lng: Optional[float] = None
    radius_km: Optional[float] = None
    utc_offset_hours: Optional[float] = None
    work_start: Optional[str] = None
    work_end: Optional[str] = None
    late_grace_minutes: Optional[int] = None
    early_grace_minutes: Optional[int] = None
    department: Optional[str] = None
    is_default: Optional[bool] = None
    is_active: Optional[bool] = None

    @field_validator("work_start", "work_end")
    @classmethod
    def _hhmm(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            try:
                _setting_minutes(v, "work_start/work_end")
            except HTTPException as exc:
                raise ValueError(str(exc.detail)) from exc
        return v

    @field_validator("radius_km")
    @classmethod
    def _radius_positive(cls, v: Optional[float]) -> Optional[float]:
        if v is not None and v <= 0:
            raise ValueError("radius_km must be greater than 0")
        return v


class AttendanceGroupOut(BaseModel):
    """考勤组条目。"""

    model_config = ConfigDict(extra="allow")

    id: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    office_lat: Optional[float] = None
    office_lng: Optional[float] = None
    radius_km: Optional[float] = None
    utc_offset_hours: Optional[float] = None
    work_start: Optional[str] = None
    work_end: Optional[str] = None
    late_grace_minutes: Optional[int] = None
    early_grace_minutes: Optional[int] = None
    department: Optional[str] = None
    is_default: Optional[bool] = None
    is_active: Optional[bool] = None
    member_count: Optional[int] = None


class AttendanceGroupMemberOut(BaseModel):
    """考勤组成员条目。"""

    model_config = ConfigDict(extra="allow")

    employee_id: Optional[str] = None
    member_id: Optional[str] = None
    name: Optional[str] = None
    email: Optional[str] = None
    department: Optional[str] = None
    employee_code: Optional[str] = None


class AttendanceGroupMembersIn(BaseModel):
    """成员分配入参：employee_ids 为要并入该组的员工。"""

    employee_ids: List[uuid.UUID]


def _group_out(group: AttendanceGroup, member_count: Optional[int] = None) -> dict:
    return {
        "id": str(group.id),
        "name": group.name,
        "description": group.description,
        "office_lat": group.office_lat,
        "office_lng": group.office_lng,
        "radius_km": group.radius_km,
        "utc_offset_hours": group.utc_offset_hours,
        "work_start": group.work_start,
        "work_end": group.work_end,
        "late_grace_minutes": group.late_grace_minutes,
        "early_grace_minutes": group.early_grace_minutes,
        "department": group.department,
        "is_default": group.is_default,
        "is_active": group.is_active,
        "member_count": member_count,
    }


def _get_group_or_404(session: Session, group_id: uuid.UUID) -> AttendanceGroup:
    group = session.get(AttendanceGroup, group_id)
    if not group or group.deleted_at:
        raise HTTPException(status_code=404, detail="Attendance group not found")
    return group


def _clear_other_defaults(session: Session, keep_id) -> None:
    """默认组只能有一个：把其它组的 is_default 落回 False。"""
    others = session.exec(
        select(AttendanceGroup).where(
            AttendanceGroup.deleted_at.is_(None),
            AttendanceGroup.is_default.is_(True),
            AttendanceGroup.id != keep_id,
        )
    ).all()
    for g in others:
        g.is_default = False
        session.add(g)


@router.get("/groups", response_model=List[AttendanceGroupOut])
def list_attendance_groups(
    session: Session = Depends(get_session),
    user: User = Depends(require_admin),
):
    """考勤组列表（含成员数）。管理员用于规则配置与分配。"""
    groups = session.exec(
        select(AttendanceGroup)
        .where(AttendanceGroup.deleted_at.is_(None))
        .order_by(AttendanceGroup.is_default.desc(), AttendanceGroup.created_at)
    ).all()
    members = session.exec(
        select(AttendanceGroupMember).where(
            AttendanceGroupMember.deleted_at.is_(None)
        )
    ).all()
    counts: dict[uuid.UUID, int] = {}
    for m in members:
        counts[m.group_id] = counts.get(m.group_id, 0) + 1
    return [_group_out(g, counts.get(g.id, 0)) for g in groups]


@router.post("/groups", response_model=AttendanceGroupOut)
def create_attendance_group(
    payload: AttendanceGroupIn,
    session: Session = Depends(get_session),
    user: User = Depends(require_admin),
):
    """新建考勤组（多办公点/多班次）。同名的启用组直接 409，避免规则二义。"""
    dup = session.exec(
        select(AttendanceGroup).where(
            AttendanceGroup.name == payload.name,
            AttendanceGroup.deleted_at.is_(None),
        )
    ).first()
    if dup:
        raise HTTPException(status_code=409, detail="Attendance group name already exists")
    group = AttendanceGroup(**payload.model_dump())
    session.add(group)
    session.flush()
    if group.is_default:
        _clear_other_defaults(session, group.id)
    session.commit()
    session.refresh(group)
    return _group_out(group, 0)


@router.patch("/groups/{group_id}", response_model=AttendanceGroupOut)
def update_attendance_group(
    group_id: uuid.UUID,
    payload: AttendanceGroupPatchIn,
    session: Session = Depends(get_session),
    user: User = Depends(require_admin),
):
    """更新考勤组规则（局部字段）。"""
    group = _get_group_or_404(session, group_id)
    changes = payload.model_dump(exclude_unset=True)
    if "name" in changes:
        name = (changes["name"] or "").strip()
        if not name:
            raise HTTPException(status_code=422, detail="name is required")
        dup = session.exec(
            select(AttendanceGroup).where(
                AttendanceGroup.name == name,
                AttendanceGroup.id != group.id,
                AttendanceGroup.deleted_at.is_(None),
            )
        ).first()
        if dup:
            raise HTTPException(status_code=409, detail="Attendance group name already exists")
        changes["name"] = name
    if "office_lat" in changes and changes["office_lat"] is not None:
        if not -90 <= changes["office_lat"] <= 90:
            raise HTTPException(status_code=422, detail="office_lat out of valid range")
    if "office_lng" in changes and changes["office_lng"] is not None:
        if not -180 <= changes["office_lng"] <= 180:
            raise HTTPException(status_code=422, detail="office_lng out of valid range")
    for key, value in changes.items():
        setattr(group, key, value)
    session.add(group)
    if group.is_default:
        _clear_other_defaults(session, group.id)
    session.commit()
    session.refresh(group)
    return _group_out(group)


@router.delete("/groups/{group_id}")
def delete_attendance_group(
    group_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(require_admin),
):
    """删除考勤组（软删，同时解除成员分配）。命中该组的员工回落部门/默认组/settings。"""
    group = _get_group_or_404(session, group_id)
    group.deleted_at = datetime.utcnow()
    session.add(group)
    members = session.exec(
        select(AttendanceGroupMember).where(
            AttendanceGroupMember.group_id == group.id,
            AttendanceGroupMember.deleted_at.is_(None),
        )
    ).all()
    for m in members:
        m.deleted_at = datetime.utcnow()
        session.add(m)
    session.commit()
    return {"id": str(group.id), "deleted": True, "released_members": len(members)}


@router.get("/groups/{group_id}/members", response_model=List[AttendanceGroupMemberOut])
def list_group_members(
    group_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(require_admin),
):
    """考勤组成员列表（显式指定的员工）。"""
    _get_group_or_404(session, group_id)
    rows = session.exec(
        select(AttendanceGroupMember).where(
            AttendanceGroupMember.group_id == group_id,
            AttendanceGroupMember.deleted_at.is_(None),
        )
    ).all()
    if not rows:
        return []
    employees = {
        e.id: e
        for e in session.exec(
            select(Employee).where(Employee.id.in_([r.employee_id for r in rows]))
        ).all()
    }
    users = {
        u.id: u
        for u in session.exec(
            select(User).where(User.id.in_([e.user_id for e in employees.values()]))
        ).all()
    } if employees else {}
    out = []
    for r in rows:
        emp = employees.get(r.employee_id)
        u = users.get(emp.user_id) if emp else None
        out.append(
            {
                "employee_id": str(r.employee_id),
                "member_id": str(r.id),
                "name": u.full_name if u else None,
                "email": u.email if u else None,
                "department": emp.department if emp else None,
                "employee_code": emp.employee_code if emp else None,
            }
        )
    return out


@router.post("/groups/{group_id}/members", response_model=List[AttendanceGroupMemberOut])
def assign_group_members(
    group_id: uuid.UUID,
    payload: AttendanceGroupMembersIn,
    session: Session = Depends(get_session),
    user: User = Depends(require_admin),
):
    """把员工并入考勤组（一个员工只能属于一个组：先解绑其它组再并入）。"""
    _get_group_or_404(session, group_id)
    wanted = list(dict.fromkeys(payload.employee_ids))
    if not wanted:
        raise HTTPException(status_code=400, detail="employee_ids must not be empty")
    valid = {
        e.id
        for e in session.exec(
            select(Employee).where(
                Employee.id.in_(wanted),
                Employee.deleted_at.is_(None),
            )
        ).all()
    }
    missing = [str(i) for i in wanted if i not in valid]
    if missing:
        raise HTTPException(status_code=404, detail=f"Employee not found: {', '.join(missing)}")

    # 先解除这些员工在其它组的分配，保证「一组唯一」
    existing = session.exec(
        select(AttendanceGroupMember).where(
            AttendanceGroupMember.employee_id.in_(wanted),
            AttendanceGroupMember.deleted_at.is_(None),
        )
    ).all()
    for m in existing:
        m.deleted_at = datetime.utcnow()
        session.add(m)
    for emp_id in wanted:
        session.add(AttendanceGroupMember(group_id=group_id, employee_id=emp_id))
    session.commit()
    return list_group_members(group_id, session, user)


@router.delete("/groups/{group_id}/members/{employee_id}")
def remove_group_member(
    group_id: uuid.UUID,
    employee_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(require_admin),
):
    """把员工移出考勤组（回落部门组 / 默认组 / 全局 settings）。"""
    _get_group_or_404(session, group_id)
    rows = session.exec(
        select(AttendanceGroupMember).where(
            AttendanceGroupMember.group_id == group_id,
            AttendanceGroupMember.employee_id == employee_id,
            AttendanceGroupMember.deleted_at.is_(None),
        )
    ).all()
    if not rows:
        raise HTTPException(status_code=404, detail="Group member not found")
    for m in rows:
        m.deleted_at = datetime.utcnow()
        session.add(m)
    session.commit()
    return {"group_id": str(group_id), "employee_id": str(employee_id), "removed": len(rows)}


@router.get("/groups/me/rules", response_model=AttendanceRule)
def my_attendance_rule(
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """员工自助查询自己生效的考勤规则（考勤组 or 全局兜底）。"""
    employee = _get_employee(session, user)
    return _resolve_rules(session, employee)


# ---------------------------------------------------------------------------
# P1-b 假勤（请假）申请与审批联动
# ---------------------------------------------------------------------------
class LeaveRequestIn(BaseModel):
    """请假申请入参：start_date/end_date 必填，days 缺省按自然日天数自动计算。"""

    leave_type: LeaveType = LeaveType.annual
    start_date: date
    end_date: date
    days: Optional[float] = None
    reason: str

    @field_validator("reason")
    @classmethod
    def _reason_required(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("reason is required")
        return v.strip()

    @field_validator("end_date")
    @classmethod
    def _range_ok(cls, v: date, info) -> date:
        start = info.data.get("start_date")
        if start and v < start:
            raise ValueError("end_date must not be earlier than start_date")
        return v

    @field_validator("start_date")
    @classmethod
    def _not_past(cls, v: date) -> date:
        # 与外勤申请同口径：按考勤时区判「今天」，避免服务器异地时区误判
        if v < _attendance_now()[0]:
            raise ValueError("start_date must not be in the past")
        return v

    @field_validator("days")
    @classmethod
    def _days_positive(cls, v: Optional[float]) -> Optional[float]:
        if v is not None and v <= 0:
            raise ValueError("days must be greater than 0")
        return v


class LeaveRequestActionIn(BaseModel):
    """请假审批动作：action 必填（approved / rejected）。"""

    action: Literal["approved", "rejected"]
    reply_note: Optional[str] = None


class LeaveRequestOut(BaseModel):
    """请假申请条目。"""

    model_config = ConfigDict(extra="allow")

    id: Optional[str] = None
    employee_id: Optional[str] = None
    name: Optional[str] = None
    department: Optional[str] = None
    leave_type: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    days: Optional[float] = None
    reason: Optional[str] = None
    status: Optional[str] = None
    reply_note: Optional[str] = None
    approved_at: Optional[str] = None
    created_at: Optional[str] = None


def _leave_out(
    leave: LeaveRequest, employee: Optional[Employee], user: Optional[User]
) -> dict:
    return {
        "id": str(leave.id),
        "employee_id": str(leave.employee_id),
        "name": user.full_name if user else None,
        "department": employee.department if employee else None,
        "leave_type": leave.leave_type.value,
        "start_date": leave.start_date.isoformat(),
        "end_date": leave.end_date.isoformat(),
        "days": leave.days,
        "reason": leave.reason,
        "status": leave.status.value,
        "reply_note": leave.reply_note,
        "approved_at": leave.approved_at.isoformat() if leave.approved_at else None,
        "created_at": leave.created_at.isoformat() if leave.created_at else None,
    }


def _apply_leave_to_attendance(session: Session, leave: LeaveRequest) -> int:
    """审批通过后把请假区间写入考勤（status=leave）。

    已打卡的当天不覆盖：打卡是既成事实，抹掉会让考勤核对失去依据，
    只追加 metadata 关联。返回实际标记为请假的天数。
    """
    applied = 0
    day = leave.start_date
    while day <= leave.end_date:
        record = session.exec(
            select(Attendance).where(
                Attendance.employee_id == leave.employee_id,
                Attendance.date == day,
                Attendance.deleted_at.is_(None),
            )
        ).first()
        if record and record.check_in_time:
            _merge_meta(record, leave_request_id=str(leave.id))
        else:
            if record is None:
                record = Attendance(employee_id=leave.employee_id, date=day)
            record.status = AttendanceStatus.leave
            # 备注存机器可读的类型码，前端按 i18n 渲染（三语平台不落中文）
            record.notes = leave.leave_type.value
            _merge_meta(record, leave_request_id=str(leave.id))
            applied += 1
        session.add(record)
        day += timedelta(days=1)
    return applied


@router.post("/leave-requests", response_model=LeaveRequestOut)
def apply_leave(
    payload: LeaveRequestIn,
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """提交请假申请。同区间已有待审/已批记录时 409，避免重复申请导致考勤重复覆盖。"""
    employee = _get_employee(session, user)
    overlap = session.exec(
        select(LeaveRequest).where(
            LeaveRequest.employee_id == employee.id,
            LeaveRequest.deleted_at.is_(None),
            LeaveRequest.status.in_([LeaveStatus.pending, LeaveStatus.approved]),
            LeaveRequest.start_date <= payload.end_date,
            LeaveRequest.end_date >= payload.start_date,
        )
    ).first()
    if overlap:
        raise HTTPException(
            status_code=409,
            detail="An overlapping leave request is already pending or approved",
        )
    days = payload.days
    if days is None:
        days = float((payload.end_date - payload.start_date).days + 1)
    leave = LeaveRequest(
        employee_id=employee.id,
        leave_type=payload.leave_type,
        start_date=payload.start_date,
        end_date=payload.end_date,
        days=days,
        reason=payload.reason,
        status=LeaveStatus.pending,
    )
    session.add(leave)
    session.commit()
    session.refresh(leave)
    return _leave_out(leave, employee, user)


@router.get("/leave-requests", response_model=List[LeaveRequestOut])
def list_leave_requests(
    status: Optional[LeaveStatus] = None,
    employee_id: Optional[uuid.UUID] = None,
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """请假申请列表。管理员/代理看全员（可按状态、员工筛选），员工只看自己。"""
    conditions = [LeaveRequest.deleted_at.is_(None)]
    if user.role in (UserRole.admin, UserRole.agent):
        if status is not None:
            conditions.append(LeaveRequest.status == status)
        if employee_id is not None:
            conditions.append(LeaveRequest.employee_id == employee_id)
    else:
        conditions.append(LeaveRequest.employee_id == _get_employee(session, user).id)
        if status is not None:
            conditions.append(LeaveRequest.status == status)

    leaves = session.exec(
        select(LeaveRequest).where(*conditions).order_by(LeaveRequest.created_at.desc())
    ).all()
    if not leaves:
        return []
    employees = {
        e.id: e
        for e in session.exec(
            select(Employee).where(Employee.id.in_([l.employee_id for l in leaves]))
        ).all()
    }
    users = {
        u.id: u
        for u in session.exec(
            select(User).where(User.id.in_([e.user_id for e in employees.values()]))
        ).all()
    } if employees else {}
    return [
        _leave_out(
            l,
            employees.get(l.employee_id),
            users.get(employees[l.employee_id].user_id)
            if l.employee_id in employees
            else None,
        )
        for l in leaves
    ]


@router.post("/leave-requests/{leave_id}/approve", response_model=LeaveRequestOut)
def approve_leave(
    leave_id: uuid.UUID,
    payload: LeaveRequestActionIn,
    session: Session = Depends(get_session),
    user: User = Depends(require_role(UserRole.admin, UserRole.agent)),
):
    """审批请假（admin/agent）。通过后按日期区间写入考勤 status=leave。"""
    leave = session.get(LeaveRequest, leave_id)
    if not leave or leave.deleted_at:
        raise HTTPException(status_code=404, detail="Leave request not found")
    if leave.status != LeaveStatus.pending:
        raise HTTPException(
            status_code=409, detail=f"Leave request already {leave.status.value} (final)"
        )
    leave.status = (
        LeaveStatus.approved if payload.action == "approved" else LeaveStatus.rejected
    )
    leave.approved_by = user.id
    leave.approved_at = datetime.utcnow()
    leave.reply_note = payload.reply_note
    session.add(leave)
    applied = _apply_leave_to_attendance(session, leave) if payload.action == "approved" else 0
    session.commit()
    session.refresh(leave)
    log_audit(
        session,
        actor_user_id=user.id,
        action="attendance.leave_review",
        resource_type="leave_request",
        resource_id=str(leave.id),
    )
    employee = session.get(Employee, leave.employee_id)
    approver = session.exec(select(User).where(User.id == employee.user_id)).first() if employee else None
    out = _leave_out(leave, employee, approver)
    out["applied_days"] = applied
    return out


@router.post("/leave-requests/{leave_id}/cancel", response_model=LeaveRequestOut)
def cancel_leave(
    leave_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """撤销售假申请（仅本人、仅待审状态可撤），避免误提交长期占住审批队列。"""
    leave = session.get(LeaveRequest, leave_id)
    if not leave or leave.deleted_at:
        raise HTTPException(status_code=404, detail="Leave request not found")
    employee = _get_employee(session, user)
    if leave.employee_id != employee.id:
        raise HTTPException(status_code=403, detail="Cannot cancel another employee's request")
    if leave.status != LeaveStatus.pending:
        raise HTTPException(
            status_code=409, detail=f"Leave request already {leave.status.value} (final)"
        )
    leave.status = LeaveStatus.cancelled
    session.add(leave)
    session.commit()
    session.refresh(leave)
    return _leave_out(leave, employee, user)


# ---------------------------------------------------------------------------
# P1-c 异常分类统计与报表（迟到/早退/缺勤/外勤分类 + 趋势）
# ---------------------------------------------------------------------------
class AttendanceSummaryTotals(BaseModel):
    """异常统计汇总。"""

    model_config = ConfigDict(extra="allow")

    present: Optional[int] = None
    late: Optional[int] = None
    early_out: Optional[int] = None
    absent: Optional[int] = None
    leave: Optional[int] = None
    field_work: Optional[int] = None
    late_minutes: Optional[int] = None
    early_out_minutes: Optional[int] = None
    abnormal: Optional[int] = None
    attended: Optional[int] = None
    expected: Optional[int] = None
    attendance_rate: Optional[float] = None


class AttendanceSummaryOut(BaseModel):
    """考勤异常报表。"""

    model_config = ConfigDict(extra="allow")

    range: Optional[AttendanceDateRange] = None
    department: Optional[str] = None
    total_employees: Optional[int] = None
    totals: Optional[AttendanceSummaryTotals] = None
    employees: Optional[List[Dict[str, Any]]] = None
    departments: Optional[List[Dict[str, Any]]] = None
    daily: Optional[List[Dict[str, Any]]] = None


def _count_bucket(row: dict, bucket: dict) -> None:
    """把一天记录并入统计桶。

    迟到/早退按「明细」而非主状态计数：status 是单值，同一天既迟到又早退时
    只会停在其中一个主状态上，只看 status 会漏计另一项（明细在 metadata_）。
    """
    meta = row.get("metadata_") or {}
    if row["status"] == AttendanceStatus.late or meta.get("late_minutes"):
        bucket["late"] += 1
    if row["status"] == AttendanceStatus.early_out or meta.get("early_out_minutes"):
        bucket["early_out"] += 1
    if row["status"] == AttendanceStatus.absent:
        bucket["absent"] += 1
    if row["status"] == AttendanceStatus.leave:
        bucket["leave"] += 1
    if row["status"] == AttendanceStatus.field_work:
        bucket["field_work"] += 1
    if row["status"] == AttendanceStatus.present:
        bucket["present"] += 1
    bucket["late_minutes"] += int(meta.get("late_minutes") or 0)
    bucket["early_out_minutes"] += int(meta.get("early_out_minutes") or 0)
    if row.get("check_in_time") or row["status"] in (
        AttendanceStatus.present,
        AttendanceStatus.late,
        AttendanceStatus.early_out,
        AttendanceStatus.field_work,
    ):
        bucket["attended"] += 1


def _empty_bucket() -> dict:
    return {
        "present": 0,
        "late": 0,
        "early_out": 0,
        "absent": 0,
        "leave": 0,
        "field_work": 0,
        "late_minutes": 0,
        "early_out_minutes": 0,
        "attended": 0,
    }


def _finish_bucket(bucket: dict) -> dict:
    out = dict(bucket)
    # 异常 = 迟到 + 早退 + 缺勤（外勤/请假不算异常）
    out["abnormal"] = bucket["late"] + bucket["early_out"] + bucket["absent"]
    return out


def _workdays_between(start: date, end: date) -> int:
    """区间内工作日数（周一至周五）。

    未接入法定节假日日历，因此「应出勤」是近似口径：用于横向对比趋势，
    不作为薪酬扣减依据。
    """
    days = 0
    day = start
    while day <= end:
        if day.weekday() < 5:
            days += 1
        day += timedelta(days=1)
    return days


@router.get("/admin/summary", response_model=AttendanceSummaryOut)
def admin_attendance_summary(
    start_date: date | None = None,
    end_date: date | None = None,
    department: str | None = None,
    session: Session = Depends(get_session),
    user: User = Depends(require_admin),
):
    """考勤异常分类统计（按员工 / 部门 / 逐日三类视图）。

    口径：迟到与早退按明细（metadata_ 的分钟数）计数，同一天两项可同时命中；
    异常合计 = 迟到 + 早退 + 缺勤；出勤率 = 有出勤事实的天数 /（工作日 × 员工数）。
    """
    today, _, _ = _attendance_now()
    start = start_date or today.replace(day=1)
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
    emp_by_id = {e.id: e for e in employees}
    users = {
        u.id: u
        for u in session.exec(
            select(User).where(
                User.id.in_([e.user_id for e in employees]) if employees else User.id.is_not(None)
            )
        ).all()
    }

    records = session.exec(
        select(Attendance).where(
            Attendance.deleted_at.is_(None),
            Attendance.date >= start,
            Attendance.date <= end,
        )
    ).all()

    totals = _empty_bucket()
    per_employee: dict[uuid.UUID, dict] = {e.id: _empty_bucket() for e in employees}
    per_department: dict[str, dict] = {}
    per_day: dict[str, dict] = {}
    for r in records:
        emp = emp_by_id.get(r.employee_id)
        # 部门筛选下只统计命中员工，避免历史记录把其它部门算进来
        if emp is None:
            continue
        row = {
            "status": r.status,
            "metadata_": r.metadata_,
            "check_in_time": r.check_in_time,
        }
        buckets = [
            totals,
            per_employee[emp.id],
            per_department.setdefault(emp.department or "-", _empty_bucket()),
            per_day.setdefault(r.date.isoformat(), _empty_bucket()),
        ]
        for b in buckets:
            _count_bucket(row, b)

    workdays = _workdays_between(start, end)
    expected = workdays * len(employees)
    totals_out = _finish_bucket(totals)
    totals_out["expected"] = expected
    totals_out["attendance_rate"] = (
        round(totals["attended"] / expected * 100, 1) if expected else 0.0
    )

    employee_rows = []
    for e in employees:
        u = users.get(e.user_id)
        bucket = _finish_bucket(per_employee[e.id])
        employee_rows.append(
            {
                "employee_id": str(e.id),
                "name": u.full_name if u else None,
                "email": u.email if u else None,
                "department": e.department,
                "employee_code": e.employee_code,
                **bucket,
            }
        )

    department_rows = [
        {"department": dept, **_finish_bucket(bucket)}
        for dept, bucket in sorted(per_department.items())
    ]

    # 逐日趋势补齐区间内每一天（无记录的日期补 0，前端画折线不用自己补洞）
    daily_rows = []
    day = start
    while day <= end:
        key = day.isoformat()
        daily_rows.append({"date": key, **_finish_bucket(per_day.get(key, _empty_bucket()))})
        day += timedelta(days=1)

    return {
        "range": {"start": start.isoformat(), "end": end.isoformat(), "days": (end - start).days + 1},
        "department": department,
        "total_employees": len(employees),
        "totals": totals_out,
        "employees": employee_rows,
        "departments": department_rows,
        "daily": daily_rows,
    }