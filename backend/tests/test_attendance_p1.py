"""考勤 P1 改造测试：考勤组（多办公点/多班次）、假勤审批联动、异常分类统计。

覆盖：
- 考勤组 CRUD、同名冲突、默认组唯一、一组唯一、删除后回落
- 组规则真正驱动打卡判定（迟到宽限、半径）与 /groups/me/rules 回显
- 请假申请 → 审批通过写考勤（已打卡当天不覆盖）、区间重叠拦截、终态不可翻转
- 异常统计口径：迟到/早退按明细计数（同一天可同时命中）、逐日补齐、部门维度

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
    AttendanceGroup,
    AttendanceGroupMember,
    AttendanceStatus,
    AuditLog,
    Employee,
    LeaveRequest,
    LeaveStatus,
    User,
    UserRole,
)


# ------------------------------------------------------------ 夹具
WORK_DAY = date(2026, 3, 2)  # 周一
NEXT_DAY = date(2026, 3, 3)


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

    def _mk_user(
        role=UserRole.employee,
        *,
        with_employee=True,
        department=None,
        full_name="测试员工",
    ):
        with Session(engine) as s:
            u = User(
                email=f"{uuid.uuid4().hex[:12]}@test.com",
                hashed_password="x",
                full_name=full_name,
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
def _freeze_clock(monkeypatch, hh: int, mm: int = 0, day: date = WORK_DAY):
    """把考勤时钟冻结到考勤时区的某天 hh:mm。"""
    minutes = hh * 60 + mm
    utc = datetime.combine(day, time(hh, mm)) - timedelta(
        hours=settings.ATTENDANCE_UTC_OFFSET_HOURS
    )
    monkeypatch.setattr(
        attendance_module, "_attendance_now", lambda *a, **kw: (day, minutes, utc)
    )


def _employee_of(engine, user_id) -> Employee:
    with Session(engine) as s:
        return s.exec(select(Employee).where(Employee.user_id == user_id)).one()


def _office_coords() -> tuple[float, float]:
    return settings.ATTENDANCE_OFFICE_LAT, settings.ATTENDANCE_OFFICE_LNG


def _group_payload(**overrides) -> dict:
    payload = {
        "name": "曼谷总部",
        "office_lat": 13.7563,
        "office_lng": 100.5018,
        "radius_km": 0.5,
        "utc_offset_hours": 7.0,
        "work_start": "09:00",
        "work_end": "18:00",
        "late_grace_minutes": 0,
        "early_grace_minutes": 0,
    }
    payload.update(overrides)
    return payload


def _seed_review_permissions(engine, role: UserRole) -> None:
    """审核中心走 require_permission（查 RolePermission 表），测试库需显式授点。"""
    from app.models import Permission, RolePermission

    codes = [
        "review:trip",
        "review:leave",
        "review:maintenance",
        "review:service",
        "review:contract",
    ]
    with Session(engine) as s:
        for code in codes:
            if s.exec(select(Permission).where(Permission.code == code)).first() is None:
                s.add(Permission(code=code, name=code, category="review"))
        s.commit()
        for code in codes:
            s.add(RolePermission(role=role, permission_code=code))
        s.commit()


def _leave_days(engine, employee_id, start, end) -> list[Attendance]:
    with Session(engine) as s:
        return list(
            s.exec(
                select(Attendance).where(
                    Attendance.employee_id == employee_id,
                    Attendance.date >= start,
                    Attendance.date <= end,
                    Attendance.deleted_at.is_(None),
                )
            ).all()
        )


# ------------------------------------------------------------ P1-a 考勤组
def test_group_crud_requires_admin(api):
    """考勤组配置属于管理端能力：普通员工一律 403。"""
    user = api.mk_user(UserRole.employee)
    client = api.login(user)
    assert client.get("/api/v1/attendance/groups").status_code == 403
    assert client.post("/api/v1/attendance/groups", json=_group_payload()).status_code == 403


def test_group_create_list_patch_and_reject_duplicate_name(api):
    """建组 → 列表回显 → 局部更新 → 同名再建 409。"""
    admin = api.mk_user(UserRole.admin, with_employee=False)
    client = api.login(admin)

    r = client.post(
        "/api/v1/attendance/groups",
        json=_group_payload(name="曼谷总部", department="销售部", is_default=True),
    )
    assert r.status_code == 200, r.text
    group = r.json()
    assert group["name"] == "曼谷总部"
    assert group["is_default"] is True
    assert group["member_count"] == 0

    dup = client.post("/api/v1/attendance/groups", json=_group_payload(name="曼谷总部"))
    assert dup.status_code == 409, dup.text

    listed = client.get("/api/v1/attendance/groups")
    assert listed.status_code == 200
    assert [g["name"] for g in listed.json()] == ["曼谷总部"]

    patched = client.patch(
        f"/api/v1/attendance/groups/{group['id']}",
        json={"work_start": "08:30", "late_grace_minutes": 15},
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["work_start"] == "08:30"
    assert patched.json()["late_grace_minutes"] == 15


def test_group_rejects_invalid_work_time(api):
    """作息格式非法必须 422，不能静默降级成默认值（否则组「看似生效其实没有」）。"""
    admin = api.mk_user(UserRole.admin, with_employee=False)
    client = api.login(admin)
    r = client.post(
        "/api/v1/attendance/groups", json=_group_payload(work_start="25:00")
    )
    assert r.status_code == 422, r.text


def test_group_default_is_unique(api):
    """默认组只能有一个：后建的默认组会把先前的落回 False。"""
    admin = api.mk_user(UserRole.admin, with_employee=False)
    client = api.login(admin)

    first = client.post(
        "/api/v1/attendance/groups", json=_group_payload(name="A组", is_default=True)
    ).json()
    second = client.post(
        "/api/v1/attendance/groups", json=_group_payload(name="B组", is_default=True)
    ).json()

    groups = {g["name"]: g for g in client.get("/api/v1/attendance/groups").json()}
    assert groups["A组"]["is_default"] is False
    assert groups["B组"]["is_default"] is True
    assert first["id"] != second["id"]


def test_group_membership_is_exclusive_and_drives_rules(api, engine, monkeypatch):
    """成员分配「一组唯一」，且组规则真正驱动 /groups/me/rules 与打卡判定。"""
    admin = api.mk_user(UserRole.admin, with_employee=False)
    emp_user = api.mk_user(department="销售部")
    employee = _employee_of(engine, emp_user.id)

    admin_client = api.login(admin)
    strict = admin_client.post(
        "/api/v1/attendance/groups",
        json=_group_payload(
            name="夜班组",
            work_start="22:00",
            work_end="06:00",
            radius_km=2.0,
            late_grace_minutes=30,
        ),
    ).json()
    broad = admin_client.post(
        "/api/v1/attendance/groups", json=_group_payload(name="宽radius组", radius_km=5.0)
    ).json()

    assigned = admin_client.post(
        f"/api/v1/attendance/groups/{strict['id']}/members",
        json={"employee_ids": [str(employee.id)]},
    )
    assert assigned.status_code == 200, assigned.text
    assert [m["employee_id"] for m in assigned.json()] == [str(employee.id)]

    # 并入另一个组：原组自动解除，保证一组唯一
    moved = admin_client.post(
        f"/api/v1/attendance/groups/{broad['id']}/members",
        json={"employee_ids": [str(employee.id)]},
    )
    assert moved.status_code == 200, moved.text
    assert admin_client.get(f"/api/v1/attendance/groups/{strict['id']}/members").json() == []

    with Session(engine) as s:
        alive = s.exec(
            select(AttendanceGroupMember).where(
                AttendanceGroupMember.employee_id == employee.id,
                AttendanceGroupMember.deleted_at.is_(None),
            )
        ).all()
    assert len(alive) == 1

    # 员工自助查询生效规则：来自「宽radius组」
    # 注意：dependency_overrides 是 app 级全局的，每次切换身份都要重新 login
    emp_client = api.login(emp_user)
    rule = emp_client.get("/api/v1/attendance/groups/me/rules")
    assert rule.status_code == 200, rule.text
    assert rule.json()["group_id"] == broad["id"]
    assert rule.json()["group_name"] == "宽radius组"
    assert rule.json()["radius_km"] == 5.0

    # 命中 5km 半径：约百公里外的点仍然超界
    _freeze_clock(monkeypatch, 9, 30)
    far = emp_client.post(
        "/api/v1/attendance/check-in", json={"lat": 14.5, "lng": 101.5}
    )
    assert far.status_code == 403, far.text

    # 移出组后回落到全局 settings（默认半径 0.5km，办公点内可打卡）
    admin_client = api.login(admin)
    released = admin_client.delete(
        f"/api/v1/attendance/groups/{broad['id']}/members/{employee.id}"
    )
    assert released.status_code == 200, released.text

    emp_client = api.login(emp_user)
    rule2 = emp_client.get("/api/v1/attendance/groups/me/rules").json()
    assert rule2["group_id"] is None
    lat, lng = _office_coords()
    assert (
        emp_client.post(
            "/api/v1/attendance/check-in", json={"lat": lat, "lng": lng}
        ).status_code
        == 200
    )


def test_group_late_grace_from_group_applies(api, engine, monkeypatch):
    """组里的迟到宽限参与判定：09:20 在 30 分钟宽限内不算迟到。"""
    admin = api.mk_user(UserRole.admin, with_employee=False)
    emp_user = api.mk_user()
    employee = _employee_of(engine, emp_user.id)
    admin_client = api.login(admin)
    group = admin_client.post(
        "/api/v1/attendance/groups",
        json=_group_payload(name="弹性组", late_grace_minutes=30),
    ).json()
    admin_client.post(
        f"/api/v1/attendance/groups/{group['id']}/members",
        json={"employee_ids": [str(employee.id)]},
    )

    # 全局无宽限，但组内 30 分钟宽限应生效
    monkeypatch.setattr(settings, "ATTENDANCE_LATE_GRACE_MINUTES", 0)
    _freeze_clock(monkeypatch, 9, 20)
    client = api.login(emp_user)
    lat, lng = _office_coords()
    r = client.post("/api/v1/attendance/check-in", json={"lat": lat, "lng": lng})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == AttendanceStatus.present.value
    assert r.json()["metadata_"]["group_id"] == group["id"]


def test_delete_group_releases_members(api, engine):
    """删除考勤组：软删 + 解除成员分配，员工回落默认规则。"""
    admin = api.mk_user(UserRole.admin, with_employee=False)
    emp_user = api.mk_user()
    employee = _employee_of(engine, emp_user.id)
    admin_client = api.login(admin)
    group = admin_client.post(
        "/api/v1/attendance/groups", json=_group_payload(name="临时组")
    ).json()
    admin_client.post(
        f"/api/v1/attendance/groups/{group['id']}/members",
        json={"employee_ids": [str(employee.id)]},
    )

    r = admin_client.delete(f"/api/v1/attendance/groups/{group['id']}")
    assert r.status_code == 200, r.text
    assert r.json()["released_members"] == 1
    assert admin_client.get("/api/v1/attendance/groups").json() == []
    assert admin_client.get(f"/api/v1/attendance/groups/{group['id']}/members").status_code == 404


# ------------------------------------------------------------ P1-b 假勤
def test_leave_apply_approve_writes_attendance(api, engine, monkeypatch):
    """请假审批通过：区间内每天写 status=leave，并写 PDPA 审计日志。"""
    _freeze_clock(monkeypatch, 10, 0)
    admin = api.mk_user(UserRole.admin, with_employee=False)
    emp_user = api.mk_user(department="销售部")
    employee = _employee_of(engine, emp_user.id)

    client = api.login(emp_user)
    applied = client.post(
        "/api/v1/attendance/leave-requests",
        json={
            "leave_type": "annual",
            "start_date": WORK_DAY.isoformat(),
            "end_date": NEXT_DAY.isoformat(),
            "reason": "年假出行",
        },
    )
    assert applied.status_code == 200, applied.text
    body = applied.json()
    assert body["status"] == LeaveStatus.pending.value
    assert body["days"] == 2.0
    assert body["name"] == "测试员工"

    admin_client = api.login(admin)
    ok = admin_client.post(
        f"/api/v1/attendance/leave-requests/{body['id']}/approve",
        json={"action": "approved", "reply_note": "批准"},
    )
    assert ok.status_code == 200, ok.text
    assert ok.json()["status"] == LeaveStatus.approved.value
    assert ok.json()["applied_days"] == 2

    days = _leave_days(engine, employee.id, WORK_DAY, NEXT_DAY)
    assert len(days) == 2
    assert all(d.status == AttendanceStatus.leave for d in days)
    # 备注存机器可读类型码，交由前端 i18n 渲染
    assert all(d.notes == "annual" for d in days)
    assert all((d.metadata_ or {})["leave_request_id"] == body["id"] for d in days)

    with Session(engine) as s:
        logs = s.exec(
            select(AuditLog).where(AuditLog.action == "attendance.leave_review")
        ).all()
    assert len(logs) == 1
    assert logs[0].resource_type == "leave_request"


def test_leave_approve_does_not_overwrite_checked_in_day(api, engine, monkeypatch):
    """已打卡的当天保留出勤事实，不改成请假，只追加关联。"""
    _freeze_clock(monkeypatch, 10, 0)
    admin = api.mk_user(UserRole.admin, with_employee=False)
    emp_user = api.mk_user()
    employee = _employee_of(engine, emp_user.id)

    client = api.login(emp_user)
    lat, lng = _office_coords()
    assert (
        client.post("/api/v1/attendance/check-in", json={"lat": lat, "lng": lng}).status_code
        == 200
    )

    leave = client.post(
        "/api/v1/attendance/leave-requests",
        json={
            "leave_type": "sick",
            "start_date": WORK_DAY.isoformat(),
            "end_date": WORK_DAY.isoformat(),
            "reason": "看病",
        },
    ).json()

    admin_client = api.login(admin)
    ok = admin_client.post(
        f"/api/v1/attendance/leave-requests/{leave['id']}/approve",
        json={"action": "approved"},
    )
    assert ok.status_code == 200, ok.text
    assert ok.json()["applied_days"] == 0

    with Session(engine) as s:
        rec = s.exec(
            select(Attendance).where(
                Attendance.employee_id == employee.id, Attendance.date == WORK_DAY
            )
        ).one()
    assert rec.status != AttendanceStatus.leave
    assert (rec.metadata_ or {})["leave_request_id"] == leave["id"]


def test_leave_overlap_rejected_and_validation(api, engine, monkeypatch):
    """区间重叠 409；开始日期早于考勤时区今天 422；理由必填。"""
    _freeze_clock(monkeypatch, 10, 0)
    user = api.mk_user()
    client = api.login(user)

    first = client.post(
        "/api/v1/attendance/leave-requests",
        json={
            "leave_type": "annual",
            "start_date": WORK_DAY.isoformat(),
            "end_date": NEXT_DAY.isoformat(),
            "reason": "年假",
        },
    )
    assert first.status_code == 200, first.text

    overlap = client.post(
        "/api/v1/attendance/leave-requests",
        json={
            "leave_type": "sick",
            "start_date": NEXT_DAY.isoformat(),
            "end_date": NEXT_DAY.isoformat(),
            "reason": "病假",
        },
    )
    assert overlap.status_code == 409, overlap.text

    past = client.post(
        "/api/v1/attendance/leave-requests",
        json={
            "leave_type": "annual",
            "start_date": "2026-03-01",
            "end_date": "2026-03-01",
            "reason": "补请",
        },
    )
    assert past.status_code == 422, past.text

    no_reason = client.post(
        "/api/v1/attendance/leave-requests",
        json={
            "leave_type": "annual",
            "start_date": NEXT_DAY.isoformat(),
            "end_date": NEXT_DAY.isoformat(),
            "reason": "   ",
        },
    )
    assert no_reason.status_code == 422, no_reason.text


def test_leave_approve_is_final_and_requires_staff(api, engine, monkeypatch):
    """终态不可翻转（重复审批 409）；普通员工不得审批。"""
    _freeze_clock(monkeypatch, 10, 0)
    admin = api.mk_user(UserRole.admin, with_employee=False)
    emp_user = api.mk_user()
    other = api.mk_user()

    client = api.login(emp_user)
    leave = client.post(
        "/api/v1/attendance/leave-requests",
        json={
            "leave_type": "personal",
            "start_date": WORK_DAY.isoformat(),
            "end_date": WORK_DAY.isoformat(),
            "reason": "事假",
        },
    ).json()

    # 员工视角：看不到别人的申请，也不能审批
    other_client = api.login(other)
    assert other_client.get("/api/v1/attendance/leave-requests").json() == []
    assert (
        other_client.post(
            f"/api/v1/attendance/leave-requests/{leave['id']}/approve",
            json={"action": "approved"},
        ).status_code
        == 403
    )

    admin_client = api.login(admin)
    assert (
        admin_client.post(
            f"/api/v1/attendance/leave-requests/{leave['id']}/approve",
            json={"action": "rejected", "reply_note": "人手不足"},
        ).status_code
        == 200
    )
    again = admin_client.post(
        f"/api/v1/attendance/leave-requests/{leave['id']}/approve",
        json={"action": "approved"},
    )
    assert again.status_code == 409, again.text

    listed = admin_client.get("/api/v1/attendance/leave-requests").json()
    assert len(listed) == 1
    assert listed[0]["status"] == LeaveStatus.rejected.value
    assert listed[0]["reply_note"] == "人手不足"


def test_leave_cancel_only_owner_and_pending(api, engine, monkeypatch):
    """撤销：仅本人、仅待审。"""
    _freeze_clock(monkeypatch, 10, 0)
    emp_user = api.mk_user()
    other = api.mk_user()

    client = api.login(emp_user)
    leave = client.post(
        "/api/v1/attendance/leave-requests",
        json={
            "leave_type": "unpaid",
            "start_date": WORK_DAY.isoformat(),
            "end_date": WORK_DAY.isoformat(),
            "reason": "事假",
        },
    ).json()

    other_client = api.login(other)
    assert (
        other_client.post(f"/api/v1/attendance/leave-requests/{leave['id']}/cancel").status_code
        == 403
    )

    # dependency_overrides 是 app 级全局的，切回本人必须先重新 login
    client = api.login(emp_user)
    assert (
        client.post(f"/api/v1/attendance/leave-requests/{leave['id']}/cancel").status_code == 200
    )
    # 已撤销（终态）再撤 → 409
    assert (
        client.post(f"/api/v1/attendance/leave-requests/{leave['id']}/cancel").status_code == 409
    )


def test_leave_requests_appear_in_review_center(api, engine, monkeypatch):
    """待审请假进入审核中心待办（summary 与 items 均含 leave 类型）。"""
    _freeze_clock(monkeypatch, 10, 0)
    admin = api.mk_user(UserRole.admin, with_employee=False)
    emp_user = api.mk_user()
    _seed_review_permissions(engine, UserRole.admin)
    client = api.login(emp_user)
    client.post(
        "/api/v1/attendance/leave-requests",
        json={
            "leave_type": "annual",
            "start_date": WORK_DAY.isoformat(),
            "end_date": WORK_DAY.isoformat(),
            "reason": "年假",
        },
    )

    admin_client = api.login(admin)
    r = admin_client.get("/api/v1/review-center/todos")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["summary"]["leave"] == 1
    assert any(i["type"] == "leave" for i in body["items"])


# ------------------------------------------------------------ P1-c 异常统计
def test_summary_counts_late_and_early_out_independently(api, engine, monkeypatch):
    """同一天既迟到又早退：两项都要计入（按 metadata_ 明细而非主状态）。"""
    _freeze_clock(monkeypatch, 10, 0)
    admin = api.mk_user(UserRole.admin, with_employee=False)
    emp_user = api.mk_user(department="销售部")
    employee = _employee_of(engine, emp_user.id)

    monkeypatch.setattr(settings, "ATTENDANCE_LATE_GRACE_MINUTES", 0)
    lat, lng = _office_coords()
    client = api.login(emp_user)
    _freeze_clock(monkeypatch, 10, 0)
    assert (
        client.post("/api/v1/attendance/check-in", json={"lat": lat, "lng": lng}).status_code
        == 200
    )
    _freeze_clock(monkeypatch, 16, 0)
    assert (
        client.post("/api/v1/attendance/check-out", json={"lat": lat, "lng": lng}).status_code
        == 200
    )

    admin_client = api.login(admin)
    r = admin_client.get(
        "/api/v1/attendance/admin/summary",
        params={"start_date": WORK_DAY.isoformat(), "end_date": WORK_DAY.isoformat()},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    totals = body["totals"]
    assert totals["late"] == 1
    assert totals["early_out"] == 1
    assert totals["late_minutes"] == 60
    assert totals["early_out_minutes"] == 120
    assert totals["abnormal"] == 2  # 迟到 + 早退（同一天两项）

    # 逐日趋势补齐区间每一天，前端不必自己补洞
    assert [d["date"] for d in body["daily"]] == [WORK_DAY.isoformat()]
    assert body["daily"][0]["late"] == 1

    emp_row = body["employees"][0]
    assert emp_row["employee_id"] == str(employee.id)
    assert emp_row["late"] == 1 and emp_row["early_out"] == 1
    assert [d["department"] for d in body["departments"]] == ["销售部"]


def test_summary_includes_approved_leave_and_attendance_rate(api, engine, monkeypatch):
    """已批请假计入 leave 桶；出勤率按「有出勤事实天数 /（工作日 × 员工数）」计算。"""
    _freeze_clock(monkeypatch, 10, 0)
    admin = api.mk_user(UserRole.admin, with_employee=False)
    emp_user = api.mk_user()
    employee = _employee_of(engine, emp_user.id)

    client = api.login(emp_user)
    leave = client.post(
        "/api/v1/attendance/leave-requests",
        json={
            "leave_type": "annual",
            "start_date": WORK_DAY.isoformat(),
            "end_date": NEXT_DAY.isoformat(),
            "reason": "年假",
        },
    ).json()
    admin_client = api.login(admin)
    admin_client.post(
        f"/api/v1/attendance/leave-requests/{leave['id']}/approve",
        json={"action": "approved"},
    )

    r = admin_client.get(
        "/api/v1/attendance/admin/summary",
        params={"start_date": WORK_DAY.isoformat(), "end_date": NEXT_DAY.isoformat()},
    )
    assert r.status_code == 200, r.text
    totals = r.json()["totals"]
    assert totals["leave"] == 2
    assert totals["attended"] == 0
    assert totals["expected"] == 2  # 两个工作日 × 1 名员工
    assert totals["attendance_rate"] == 0.0
    assert employee.department is None


def test_summary_requires_admin_and_limits_range(api, monkeypatch):
    """统计仅管理员可用；区间超过 92 天 400。"""
    _freeze_clock(monkeypatch, 10, 0)
    user = api.mk_user(UserRole.employee)
    assert api.login(user).get("/api/v1/attendance/admin/summary").status_code == 403

    admin = api.mk_user(UserRole.admin, with_employee=False)
    client = api.login(admin)
    too_long = client.get(
        "/api/v1/attendance/admin/summary",
        params={"start_date": "2026-01-01", "end_date": "2026-12-31"},
    )
    assert too_long.status_code == 400, too_long.text

    # 不传区间时默认本月 1 号到今天（不报错即可）
    assert client.get("/api/v1/attendance/admin/summary").status_code == 200


def test_summary_department_filter_scopes_records(api, engine, monkeypatch):
    """部门筛选下只统计命中部门的员工与记录。"""
    _freeze_clock(monkeypatch, 10, 0)
    admin = api.mk_user(UserRole.admin, with_employee=False)
    sales_user = api.mk_user(department="销售部")
    hr_user = api.mk_user(department="人事部")

    monkeypatch.setattr(settings, "ATTENDANCE_LATE_GRACE_MINUTES", 0)
    lat, lng = _office_coords()
    for u, hh in ((sales_user, 9), (hr_user, 10)):
        client = api.login(u)
        _freeze_clock(monkeypatch, hh, 0)
        assert (
            client.post(
                "/api/v1/attendance/check-in", json={"lat": lat, "lng": lng}
            ).status_code
            == 200
        )

    admin_client = api.login(admin)
    r = admin_client.get(
        "/api/v1/attendance/admin/summary",
        params={
            "start_date": WORK_DAY.isoformat(),
            "end_date": WORK_DAY.isoformat(),
            "department": "人事部",
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total_employees"] == 1
    assert body["totals"]["late"] == 1  # 人事部 10:00 打卡迟到；销售部记录不计入
    assert [d["department"] for d in body["departments"]] == ["人事部"]


def test_group_and_leave_models_registered(engine):
    """建表回归：P1 新增三张表可用（避免迁移/模型不同步）。"""
    with Session(engine) as s:
        group = AttendanceGroup(name="冒烟组")
        s.add(group)
        s.commit()
        s.refresh(group)
        s.add(AttendanceGroupMember(group_id=group.id, employee_id=uuid.uuid4()))
        s.add(
            LeaveRequest(
                employee_id=uuid.uuid4(),
                leave_type="annual",
                start_date=WORK_DAY,
                end_date=WORK_DAY,
                days=1.0,
                reason="冒烟",
            )
        )
        s.commit()
        assert s.exec(select(LeaveRequest)).one().status == LeaveStatus.pending