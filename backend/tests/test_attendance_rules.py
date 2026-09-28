"""考勤时间规则与管理员校准接口测试（P0 改造回归）。

覆盖：
- 迟到 / 早退分界与宽限折算（含跨天班次）
- 打卡真正写入 late / early_out / field_work，并在 metadata_ 留痕分钟数
- 考勤日与判定按考勤时区计算，不随服务器本地时区漂移
- 管理员校准写接口的权限、参数校验与 PDPA 审计留痕

全部使用内存 SQLite + dependency_overrides，不依赖真实数据库与 Redis。
"""
import pathlib
import sys
import uuid
from datetime import date, datetime, time, timedelta
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

BASE_DIR = pathlib.Path(__file__).resolve().parents[1]
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from app.api.v1 import attendance as attendance_module  # noqa: E402
from app.config import settings  # noqa: E402
from app.core import auth as auth_module  # noqa: E402
from app.db import get_session  # noqa: E402
from app.main import app  # noqa: E402
from app.models import (  # noqa: E402
    Attendance,
    AttendanceStatus,
    AuditLog,
    Employee,
    ExternalTripApplication,
    TripStatus,
    User,
    UserRole,
)
from app.providers.geo import is_within_radius  # noqa: E402


# ------------------------------------------------------------ 夹具
@pytest.fixture()
def engine():
    """内存库：StaticPool 保证 TestClient 多线程请求共享同一连接。"""
    eng = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        echo=False,
    )
    SQLModel.metadata.create_all(eng)
    return eng


@pytest.fixture()
def api(engine):
    """绑定内存库的 TestClient 工厂。"""

    def _mk_user(role=UserRole.employee, *, with_employee=True, department=None):
        with Session(engine) as s:
            u = User(
                email=f"{uuid.uuid4().hex[:12]}@test.com",
                hashed_password="x",
                full_name="测试员工",
                role=role,
            )
            s.add(u)
            s.commit()
            s.refresh(u)
            if with_employee:
                s.add(
                    Employee(
                        user_id=u.id,
                        employee_code=f"E{uuid.uuid4().hex[:8]}",
                        department=department,
                    )
                )
                s.commit()
            # 建 Employee 的那次 commit 会让 u 过期；会话关闭后取属性会 DetachedInstanceError
            s.refresh(u)
            return u

    created_sessions = []

    def _login(user):
        s = Session(engine)
        created_sessions.append(s)
        bound = s.get(User, user.id)
        app.dependency_overrides[get_session] = lambda: s
        app.dependency_overrides[auth_module.get_current_user] = lambda: bound
        return TestClient(app)

    factory = SimpleNamespace(mk_user=_mk_user, login=_login, engine=engine)
    try:
        yield factory
    finally:
        for s in created_sessions:
            s.close()
        app.dependency_overrides.clear()


# ------------------------------------------------------------ 工具
WORK_DAY = date(2026, 3, 2)


def _freeze_clock(monkeypatch, hh: int, mm: int = 0, day: date = WORK_DAY):
    """把考勤时钟冻结到考勤时区的某天 hh:mm。

    同时冻结「考勤日」「考勤时区当日分钟数」「UTC 时刻」三者，使判定结果确定。
    """
    minutes = hh * 60 + mm
    utc = datetime.combine(day, time(hh, mm)) - timedelta(
        hours=settings.ATTENDANCE_UTC_OFFSET_HOURS
    )
    # P1 起 `_attendance_now` 接收可选的考勤组时区偏移，打桩需吞掉该入参
    monkeypatch.setattr(
        attendance_module, "_attendance_now", lambda *a, **kw: (day, minutes, utc)
    )


def _rule():
    """无考勤组时的全局兜底规则（读取当前 settings，随 monkeypatch 变化）。"""
    return attendance_module._default_rule()


def _office_coords() -> tuple[float, float]:
    return settings.ATTENDANCE_OFFICE_LAT, settings.ATTENDANCE_OFFICE_LNG


def _far_coords() -> tuple[float, float]:
    """距办公点约百公里，必然超出半径。"""
    return 14.5, 101.5


def _employee_of(engine, user_id) -> Employee:
    with Session(engine) as s:
        return s.exec(select(Employee).where(Employee.user_id == user_id)).one()


def _approve_trip(engine, employee_id, trip_date):
    with Session(engine) as s:
        s.add(
            ExternalTripApplication(
                employee_id=employee_id,
                trip_date=trip_date,
                to_location="客户现场",
                reason="外勤",
                status=TripStatus.approved,
            )
        )
        s.commit()


def _meta_of(engine, employee_id, day) -> dict:
    with Session(engine) as s:
        rec = s.exec(
            select(Attendance).where(
                Attendance.employee_id == employee_id, Attendance.date == day
            )
        ).one()
        return dict(rec.metadata_ or {})


# ------------------------------------------------------------ 纯函数：分界与宽限
def test_work_window_applies_grace(monkeypatch):
    """日班：迟到分界 = 上班 + 迟到宽限，早退分界 = 下班 − 早退宽限。"""
    monkeypatch.setattr(settings, "ATTENDANCE_WORK_START", "09:00")
    monkeypatch.setattr(settings, "ATTENDANCE_WORK_END", "18:00")
    monkeypatch.setattr(settings, "ATTENDANCE_LATE_GRACE_MINUTES", 10)
    monkeypatch.setattr(settings, "ATTENDANCE_EARLY_GRACE_MINUTES", 5)

    rule = _rule()
    assert attendance_module._work_window(rule) == (9 * 60 + 10, 18 * 60 - 5)

    # 09:09 仍在宽限内；09:11 迟到 1 分钟
    assert attendance_module._late_minutes(9 * 60 + 9, rule) == 0
    assert attendance_module._late_minutes(9 * 60 + 11, rule) == 1
    # 17:54 早退 1 分钟；17:55 不算早退
    assert attendance_module._early_out_minutes(17 * 60 + 54, rule) == 1
    assert attendance_module._early_out_minutes(17 * 60 + 55, rule) == 0


def test_work_window_cross_midnight_shift(monkeypatch):
    """夜班（22:00–06:00）：下班早于上班时按跨天处理，次日凌晨仍能判早退。"""
    monkeypatch.setattr(settings, "ATTENDANCE_WORK_START", "22:00")
    monkeypatch.setattr(settings, "ATTENDANCE_WORK_END", "06:00")
    monkeypatch.setattr(settings, "ATTENDANCE_LATE_GRACE_MINUTES", 0)
    monkeypatch.setattr(settings, "ATTENDANCE_EARLY_GRACE_MINUTES", 0)

    rule = _rule()
    late_line, early_line = attendance_module._work_window(rule)
    assert late_line == 22 * 60
    assert early_line == 6 * 60 + 24 * 60  # 次日 06:00

    # 当日 23:00 下班属早退（距次日 06:00 还有 7 小时）
    assert attendance_module._early_out_minutes(23 * 60, rule) == 7 * 60
    # 次日 05:00 早退 1 小时；次日 06:30 正常
    assert attendance_module._early_out_minutes(5 * 60, rule) == 60
    assert attendance_module._early_out_minutes(6 * 60 + 30, rule) == 0
    # 提前到岗不算迟到；22:30 到岗迟到 30 分钟
    assert attendance_module._late_minutes(21 * 60 + 30, rule) == 0
    assert attendance_module._late_minutes(22 * 60 + 30, rule) == 30


def test_invalid_work_time_setting_fails_closed(monkeypatch):
    """作息配置格式非法必须显式报错，而不是静默当成 00:00。"""
    monkeypatch.setattr(settings, "ATTENDANCE_WORK_START", "25:00")
    with pytest.raises(Exception) as exc:
        attendance_module._work_window(_rule())
    assert "ATTENDANCE_WORK_START" in str(exc.value)


def test_attendance_day_follows_attendance_timezone(monkeypatch):
    """考勤日 = UTC 时刻 + 考勤时区偏移后的自然日（曼谷 UTC+7）。"""
    monkeypatch.setattr(settings, "ATTENDANCE_UTC_OFFSET_HOURS", 7.0)
    day, minutes, utc_now = attendance_module._attendance_now()
    expected_local = utc_now + timedelta(hours=7)
    assert day == expected_local.date()
    assert minutes == expected_local.hour * 60 + expected_local.minute
    # 入库时刻仍是 UTC
    assert utc_now.tzinfo is None


# ------------------------------------------------------------ 打卡判定
def test_late_check_in_writes_late_status_and_minutes(api, engine, monkeypatch):
    """09:30 打卡（无宽限）→ status=late，metadata_ 留迟到达 30 分钟。"""
    monkeypatch.setattr(settings, "ATTENDANCE_WORK_START", "09:00")
    monkeypatch.setattr(settings, "ATTENDANCE_LATE_GRACE_MINUTES", 0)
    user = api.mk_user()
    _freeze_clock(monkeypatch, 9, 30)
    client = api.login(user)

    lat, lng = _office_coords()
    r = client.post("/api/v1/attendance/check-in", json={"lat": lat, "lng": lng})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == AttendanceStatus.late.value
    assert r.json()["metadata_"]["late_minutes"] == 30

    # /today 回显作息与判定明细，前端据此展示「迟到判断依据」
    today = client.get("/api/v1/attendance/today")
    assert today.status_code == 200, today.text
    body = today.json()
    assert body["work_start"] == "09:00"
    assert body["work_end"] == "18:00"
    assert body["late_minutes"] == 30
    assert body["checked_in"] is True


def test_on_time_check_in_stays_present(api, engine, monkeypatch):
    """09:00 整点打卡 → present，且不写入无意义的 0 分钟留痕。"""
    user = api.mk_user()
    _freeze_clock(monkeypatch, 9, 0)
    client = api.login(user)

    lat, lng = _office_coords()
    r = client.post("/api/v1/attendance/check-in", json={"lat": lat, "lng": lng})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == AttendanceStatus.present.value
    assert (r.json()["metadata_"] or {}).get("late_minutes") is None


def test_early_check_out_marks_early_out(api, engine, monkeypatch):
    """准点上班 + 17:00 下班（无早退宽限）→ status=early_out，留痕 60 分钟。"""
    user = api.mk_user()
    lat, lng = _office_coords()

    _freeze_clock(monkeypatch, 9, 0)
    client = api.login(user)
    assert (
        client.post("/api/v1/attendance/check-in", json={"lat": lat, "lng": lng}).status_code
        == 200
    )

    _freeze_clock(monkeypatch, 17, 0)
    out = client.post("/api/v1/attendance/check-out", json={"lat": lat, "lng": lng})
    assert out.status_code == 200, out.text
    assert out.json()["status"] == AttendanceStatus.early_out.value
    assert out.json()["metadata_"]["early_out_minutes"] == 60


def test_late_then_early_out_keeps_primary_status(api, engine, monkeypatch):
    """又迟到又早退：status 单值只能存 late，早退分钟数仍写入 metadata_。"""
    monkeypatch.setattr(settings, "ATTENDANCE_LATE_GRACE_MINUTES", 0)
    user = api.mk_user()
    lat, lng = _office_coords()

    _freeze_clock(monkeypatch, 10, 0)
    client = api.login(user)
    assert (
        client.post("/api/v1/attendance/check-in", json={"lat": lat, "lng": lng}).status_code
        == 200
    )

    _freeze_clock(monkeypatch, 16, 0)
    out = client.post("/api/v1/attendance/check-out", json={"lat": lat, "lng": lng})
    assert out.status_code == 200, out.text
    assert out.json()["status"] == AttendanceStatus.late.value
    meta = out.json()["metadata_"]
    assert meta["late_minutes"] == 60
    assert meta["early_out_minutes"] == 120


def test_out_of_radius_without_approved_trip_is_rejected(api, engine, monkeypatch):
    """半径外且当日无获批外勤 → 403（原有拦截不能被时间判定改造绕过）。"""
    user = api.mk_user()
    _freeze_clock(monkeypatch, 9, 0)
    client = api.login(user)

    lat, lng = _far_coords()
    r = client.post("/api/v1/attendance/check-in", json={"lat": lat, "lng": lng})
    assert r.status_code == 403, r.text
    assert "external-trip" in r.json()["detail"]


def test_out_of_radius_with_approved_trip_records_field_work(api, engine, monkeypatch):
    """半径外但外勤已获批 → field_work，且不按上下班时间判迟到。"""
    monkeypatch.setattr(settings, "ATTENDANCE_LATE_GRACE_MINUTES", 0)
    user = api.mk_user()
    employee = _employee_of(engine, user.id)
    _approve_trip(engine, employee.id, WORK_DAY)

    _freeze_clock(monkeypatch, 9, 30)  # 按时间会判迟到 30 分钟
    client = api.login(user)
    lat, lng = _far_coords()
    r = client.post("/api/v1/attendance/check-in", json={"lat": lat, "lng": lng})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == AttendanceStatus.field_work.value
    assert (r.json()["metadata_"] or {}).get("late_minutes") is None

    # 外勤状态在签退时也不被早退覆盖，只留痕分钟数
    _freeze_clock(monkeypatch, 17, 0)
    out = client.post("/api/v1/attendance/check-out", json={"lat": lat, "lng": lng})
    assert out.status_code == 200, out.text
    assert out.json()["status"] == AttendanceStatus.field_work.value
    assert out.json()["metadata_"]["early_out_minutes"] == 60


def test_check_out_requires_check_in(api, engine, monkeypatch):
    """未上班打卡直接签退 → 400。"""
    user = api.mk_user()
    _freeze_clock(monkeypatch, 18, 0)
    client = api.login(user)
    lat, lng = _office_coords()
    r = client.post("/api/v1/attendance/check-out", json={"lat": lat, "lng": lng})
    assert r.status_code == 400, r.text


def test_past_trip_date_uses_attendance_timezone(api, engine, monkeypatch):
    """外勤申请不可填过去日期，且「今天」按考勤时区判断。"""
    user = api.mk_user()
    _freeze_clock(monkeypatch, 23, 0, day=date(2026, 3, 2))
    client = api.login(user)

    past = client.post(
        "/api/v1/attendance/external-trips", json={"trip_date": "2026-03-01"}
    )
    assert past.status_code == 422, past.text

    today_ok = client.post(
        "/api/v1/attendance/external-trips", json={"trip_date": "2026-03-02"}
    )
    assert today_ok.status_code == 200, today_ok.text


# ------------------------------------------------------------ 管理员校准
def test_calibrate_requires_admin(api, engine):
    """非管理员不得校准他人考勤。"""
    user = api.mk_user(UserRole.employee)
    client = api.login(user)
    r = client.patch(
        f"/api/v1/attendance/admin/records/{uuid.uuid4()}",
        json={"date": WORK_DAY.isoformat(), "status": "present"},
    )
    assert r.status_code == 403, r.text


def test_calibrate_rejects_empty_payload(api, engine):
    """四个字段全空 → 400，避免无意义的审计留痕。"""
    admin = api.mk_user(UserRole.admin, with_employee=False)
    client = api.login(admin)
    r = client.patch(
        f"/api/v1/attendance/admin/records/{uuid.uuid4()}",
        json={"date": WORK_DAY.isoformat()},
    )
    assert r.status_code == 400, r.text
    assert r.json()["detail"] == "Nothing to calibrate"


def test_calibrate_employee_not_found(api, engine):
    """员工不存在 → 404。"""
    admin = api.mk_user(UserRole.admin, with_employee=False)
    client = api.login(admin)
    r = client.patch(
        f"/api/v1/attendance/admin/records/{uuid.uuid4()}",
        json={"date": WORK_DAY.isoformat(), "status": "present"},
    )
    assert r.status_code == 404, r.text


def test_calibrate_missing_record_requires_status(api, engine):
    """当天无记录时按补录新建，必须显式给 status，避免造出无时间的记录。"""
    admin = api.mk_user(UserRole.admin, with_employee=False)
    emp_user = api.mk_user()
    employee = _employee_of(engine, emp_user.id)
    client = api.login(admin)

    r = client.patch(
        f"/api/v1/attendance/admin/records/{employee.id}",
        json={"date": WORK_DAY.isoformat(), "notes": "忘打卡"},
    )
    assert r.status_code == 400, r.text
    assert r.json()["detail"] == "status is required when creating a missing attendance record"


def test_calibrate_creates_record_and_writes_audit_log(api, engine):
    """补录成功：状态落库、metadata_ 留痕、PDPA 审计日志落库。"""
    admin = api.mk_user(UserRole.admin, with_employee=False)
    emp_user = api.mk_user()
    employee = _employee_of(engine, emp_user.id)
    client = api.login(admin)

    r = client.patch(
        f"/api/v1/attendance/admin/records/{employee.id}",
        json={"date": WORK_DAY.isoformat(), "status": "leave", "notes": "已批年假"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == AttendanceStatus.leave.value
    assert r.json()["notes"] == "已批年假"

    meta = _meta_of(engine, employee.id, WORK_DAY)
    assert meta["calibrated_by"] == str(admin.id)
    assert meta["calibrated_at"]

    with Session(engine) as s:
        logs = s.exec(select(AuditLog).where(AuditLog.action == "attendance.calibrate")).all()
    assert len(logs) == 1
    assert str(logs[0].actor_user_id) == str(admin.id)
    assert logs[0].resource_type == "attendance"
    assert logs[0].resource_id == str(r.json()["id"])


def test_calibrate_updates_times_and_rejects_inverted_range(api, engine, monkeypatch):
    """可补上下班时间；签退早于签到 → 400。"""
    admin = api.mk_user(UserRole.admin, with_employee=False)
    emp_user = api.mk_user()
    employee = _employee_of(engine, emp_user.id)

    # 先造一条缺签到时间的记录
    _freeze_clock(monkeypatch, 9, 0)
    client = api.login(emp_user)
    lat, lng = _office_coords()
    assert (
        client.post("/api/v1/attendance/check-in", json={"lat": lat, "lng": lng}).status_code
        == 200
    )

    client = api.login(admin)
    bad = client.patch(
        f"/api/v1/attendance/admin/records/{employee.id}",
        json={
            "date": WORK_DAY.isoformat(),
            "check_in_time": "2026-03-02T10:00:00",
            "check_out_time": "2026-03-02T09:00:00",
        },
    )
    assert bad.status_code == 400, bad.text

    ok = client.patch(
        f"/api/v1/attendance/admin/records/{employee.id}",
        json={
            "date": WORK_DAY.isoformat(),
            "status": "present",
            "check_in_time": "2026-03-02T09:00:00",
            "check_out_time": "2026-03-02T18:00:00",
            "notes": "补录签退",
        },
    )
    assert ok.status_code == 200, ok.text
    assert ok.json()["check_out_time"].startswith("2026-03-02T18:00:00")
    assert ok.json()["status"] == AttendanceStatus.present.value


def test_admin_records_exposes_judgement_details(api, engine, monkeypatch):
    """考勤核对报表带出迟到/早退分钟数，供管理端核对异常。"""
    monkeypatch.setattr(settings, "ATTENDANCE_LATE_GRACE_MINUTES", 0)
    admin = api.mk_user(UserRole.admin, with_employee=False)
    emp_user = api.mk_user(department="销售部")
    employee = _employee_of(engine, emp_user.id)

    _freeze_clock(monkeypatch, 9, 45)
    client = api.login(emp_user)
    lat, lng = _office_coords()
    assert (
        client.post("/api/v1/attendance/check-in", json={"lat": lat, "lng": lng}).status_code
        == 200
    )

    client = api.login(admin)
    r = client.get(
        "/api/v1/attendance/admin/records",
        params={"start_date": WORK_DAY.isoformat(), "end_date": WORK_DAY.isoformat()},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total_employees"] == 1
    assert body["summary"]["late"] == 1
    days = body["records"][0]["days"]
    assert len(days) == 1
    assert days[0]["status"] == AttendanceStatus.late.value
    assert days[0]["late_minutes"] == 45
    # 出勤枚举里必须包含早退，否则报表口径漏项
    assert "early_out" in body["summary"]


# ------------------------------------------------------------ 定位与半径
def test_is_within_radius_boundary():
    """半径判定：办公点本身必在内，远处必在外。"""
    lat, lng = _office_coords()
    within, dist = is_within_radius(lat, lng, settings.ATTENDANCE_RADIUS_KM)
    assert within is True
    assert dist == pytest.approx(0.0, abs=1e-6)

    far_lat, far_lng = _far_coords()
    within_far, dist_far = is_within_radius(far_lat, far_lng, settings.ATTENDANCE_RADIUS_KM)
    assert within_far is False
    assert dist_far > settings.ATTENDANCE_RADIUS_KM