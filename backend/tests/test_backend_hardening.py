"""后端加固项回归测试。

覆盖本轮审计后的修复点：
- 乐观锁 `version` 自动自增 + `ensure_version` 冲突返回 409（P2-18）
- 统一错误响应结构（detail 仍为字符串）与 request_id 透传（P2-14）
- Prometheus 指标真正有数据（P2-15）
- 限流中间件与客户端标识（P0-4）
- 会话参与者索引、越权拦截、消息分页（P0-3 / P1-8）
- 账号列表批量取数（N+1 消除）与敏感字段不外泄（P1-7 / P2-13）

全部使用内存 SQLite + dependency_overrides，不触真实数据库与 Redis。
"""
import json
import pathlib
import sys
import time
import uuid

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import event
from sqlalchemy.pool import StaticPool
from slowapi.wrappers import LimitGroup
from sqlmodel import Session, SQLModel, create_engine, select
from starlette.requests import Request
from types import SimpleNamespace

BASE_DIR = pathlib.Path(__file__).resolve().parents[1]
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from app.db import get_session  # noqa: E402
from app.core import auth as auth_module  # noqa: E402
from app.api.v1 import chat as chat_module  # noqa: E402
from app.core.concurrency import ensure_version  # noqa: E402
from app.core.error_handlers import rate_limited_response  # noqa: E402
from app.core.rate_limit import client_key, limiter  # noqa: E402
from app.api.v1.users_admin import _batch_extras, _serialize_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models import (  # noqa: E402
    ChatParticipant,
    Conversation,
    Message,
    Owner,
    Property,
    PropertyStatus,
    User,
    UserRole,
)
from app.services.chat_participants import backfill_all, is_participant  # noqa: E402


@pytest.fixture()
def engine():
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
    """返回绑定内存库的 TestClient 工厂（可切换当前登录用户）。"""

    def _mk_user(role=UserRole.tenant):
        with Session(engine) as s:
            u = User(
                email=f"{uuid.uuid4().hex[:12]}@test.com",
                hashed_password="x",
                full_name="测试用户",
                role=role,
            )
            s.add(u)
            s.commit()
            s.refresh(u)
            return u

    created_sessions = []

    def _login(user):
        s = Session(engine)
        created_sessions.append(s)
        bound_user = s.get(User, user.id)
        app.dependency_overrides[get_session] = lambda: s
        app.dependency_overrides[auth_module.get_current_user] = lambda: bound_user
        return TestClient(app)

    factory = SimpleNamespace(mk_user=_mk_user, login=_login, engine=engine)
    try:
        yield factory
    finally:
        for s in created_sessions:
            s.close()
        app.dependency_overrides.clear()


# ------------------------------------------------------------ 乐观锁
def test_version_auto_increments_on_update(engine):
    """每次 UPDATE 后 version 自增（此前永远是 1，乐观锁形同虚设）。"""
    with Session(engine) as s:
        u = User(email="a@b.com", hashed_password="x", full_name="A")
        s.add(u)
        s.commit()
        assert u.version == 1

        u.full_name = "B"
        s.add(u)
        s.commit()
        s.refresh(u)
        assert u.version == 2


def test_ensure_version_rejects_stale_write(engine):
    """客户端回传过期 version 时返回 409，而不是静默覆盖。"""
    with Session(engine) as s:
        u = User(email="c@d.com", hashed_password="x", full_name="A")
        s.add(u)
        s.commit()

        ensure_version(u, u.version, "用户")  # 版本一致：放行
        ensure_version(u, None, "用户")  # 未传：不校验

        with pytest.raises(HTTPException) as exc:
            ensure_version(u, u.version + 1, "用户")
        assert exc.value.status_code == 409
        assert isinstance(exc.value.detail, str)


def test_market_doc_string_version_not_touched(engine):
    """ComplianceDoc 的 version 是字符串文档版本号，不应被乐观锁改写。"""
    from app.models import ComplianceDoc

    with Session(engine) as s:
        d = ComplianceDoc(
            market_code="TH", title="模板", version="2.0", content="x"
        )
        s.add(d)
        s.commit()
        d.title = "模板v2"
        s.add(d)
        s.commit()
        s.refresh(d)
        assert d.version == "2.0"


# ------------------------------------------------------------ 错误响应 / 指标
def test_not_found_response_shape(api):
    """404 响应体结构统一，且 detail 必须仍是字符串（三端前端直接展示）。"""
    client = api.login(api.mk_user())
    resp = client.get("/api/v1/chat/conversations/00000000-0000-0000-0000-000000000000/messages")
    assert resp.status_code == 404
    body = resp.json()
    assert isinstance(body["detail"], str)
    assert body["code"] == "HTTP_ERROR"
    assert body["message"] == body["detail"]
    # 中间件写入的 request_id 同时出现在头与响应体
    assert body["request_id"] == resp.headers["X-Request-ID"]


def test_validation_error_response_shape(api):
    """422 保留可读 detail，并附带逐字段 errors 列表。"""
    client = api.login(api.mk_user())
    resp = client.post("/api/v1/auth/login", data={})
    assert resp.status_code == 422
    body = resp.json()
    assert body["code"] == "VALIDATION_ERROR"
    assert isinstance(body["detail"], str)
    assert isinstance(body["errors"], list) and body["errors"]


def test_metrics_are_exported(api):
    """指标不再为空：/health 的请求数与耗时会被采集。

    /metrics 在非 DEBUG 下要求管理员令牌（匿名可读等于泄露运营规模），
    故这里以管理员身份访问。
    """
    client = api.login(api.mk_user(UserRole.admin))
    assert client.get("/health").status_code == 200
    text = client.get("/metrics").text
    assert 'http_requests_total{method="GET",path="/health",status="200"}' in text
    assert "http_request_duration_seconds_count" in text


def test_metrics_require_admin_token_outside_debug(api):
    """非 DEBUG 下匿名与非管理员都拿不到指标。"""
    anon = api.login(api.mk_user())
    assert anon.get("/metrics").status_code == 403

    tenant = api.login(api.mk_user(UserRole.tenant))
    assert tenant.get("/metrics").status_code == 403


# ------------------------------------------------------------ 限流
def test_client_key_prefers_forwarded_for():
    """反代场景按 X-Forwarded-For 首个地址限流，而不是所有请求同一个反代 IP。"""
    scope = {
        "type": "http",
        "headers": [(b"x-forwarded-for", b"1.2.3.4, 5.6.7.8")],
        "client": ("9.9.9.9", 12345),
    }
    assert client_key(Request(scope)) == "1.2.3.4"

    scope_no_header = {"type": "http", "headers": [], "client": ("9.9.9.9", 12345)}
    assert client_key(Request(scope_no_header)) == "9.9.9.9"


def test_rate_limited_response_payload():
    """429 响应体与其他错误保持一致的结构（中间件与异常处理器共用）。"""
    scope = {"type": "http", "headers": [], "client": ("1.1.1.1", 1)}
    resp = rate_limited_response(Request(scope))
    body = json.loads(resp.body)
    assert resp.status_code == 429
    assert body["code"] == "RATE_LIMITED"
    assert isinstance(body["detail"], str)


def test_default_limit_middleware_returns_429(api):
    """全局默认限额在中间件生效：超限请求返回 429（此前限流完全没启用）。"""
    original_enabled = limiter.enabled
    original_limits = limiter._default_limits
    limiter.enabled = True
    # 与 Limiter 构造时的结构保持一致：默认限额是 LimitGroup 列表
    limiter._default_limits = [
        LimitGroup("1/minute", client_key, None, False, None, None, None, 1, False)
    ]
    try:
        client = api.login(api.mk_user())
        assert client.get("/health").status_code == 200
        resp = client.get("/health")
        assert resp.status_code == 429
        assert resp.json()["code"] == "RATE_LIMITED"
    finally:
        limiter.enabled = original_enabled
        limiter._default_limits = original_limits


# ------------------------------------------------------------ 会话参与者
def test_backfill_participants_is_idempotent(engine):
    """历史会话回填参与者索引：可重复执行且不产生重复行。"""
    with Session(engine) as s:
        uid = uuid.uuid4()
        conv = Conversation(title="t", participant_ids=[str(uid)], created_by=uid)
        s.add(conv)
        s.commit()
        s.refresh(conv)

        assert backfill_all(s) == 1
        assert backfill_all(s) == 0  # 幂等

        rows = s.exec(
            select(ChatParticipant).where(ChatParticipant.conversation_id == conv.id)
        ).all()
        assert len(rows) == 1
        assert is_participant(conv, uid)


def test_conversation_access_and_message_pagination(api, monkeypatch):
    """非参与者 403；参与者可翻页拉取历史；会话列表只返回自己的会话。"""
    # 消息落库路径直接用模块级 engine（不经过 Depends），需指向测试库
    monkeypatch.setattr(chat_module, "engine", api.engine)
    alice, bob, carol = api.mk_user(), api.mk_user(), api.mk_user()

    client = api.login(alice)
    created = client.post(
        "/api/v1/chat/conversations",
        json={"title": "咨询", "participant_user_ids": [str(bob.id)]},
    )
    assert created.status_code == 200
    conv_id = created.json()["id"]

    for i in range(3):
        sent = client.post(
            f"/api/v1/chat/conversations/{conv_id}/messages", json={"body": f"m{i}"}
        )
        assert sent.status_code == 200
        assert sent.json()["body"] == f"m{i}"
        time.sleep(0.002)  # 保证 created_at 严格递增，分页游标可判定

    # 局外人一律 403
    outsider = api.login(carol)
    assert outsider.get(f"/api/v1/chat/conversations/{conv_id}/messages").status_code == 403
    assert outsider.get("/api/v1/chat/conversations").json() == []

    # 参与者可读全量
    peer = api.login(bob)
    all_msgs = peer.get(f"/api/v1/chat/conversations/{conv_id}/messages").json()
    assert [m["body"] for m in all_msgs] == ["m0", "m1", "m2"]
    assert peer.get("/api/v1/chat/conversations").json()[0]["id"] == conv_id

    # 分页：limit 取最近 2 条（按时间正序输出），before 再往前翻
    page = peer.get(
        f"/api/v1/chat/conversations/{conv_id}/messages", params={"limit": 2}
    ).json()
    assert set(m["body"] for m in page) == {"m1", "m2"}
    older = peer.get(
        f"/api/v1/chat/conversations/{conv_id}/messages",
        params={"limit": 2, "before": page[0]["created_at"]},
    ).json()
    assert [m["body"] for m in older] == ["m0"]


# ------------------------------------------------------------ 账号列表
def test_serialize_user_hides_secret_and_keeps_extras(engine):
    """账号序列化不泄漏 hashed_password，并带上员工档案与分组。"""
    from app.models import Employee, UserGroup, UserGroupMember

    with Session(engine) as s:
        u = User(
            email="emp@test.com",
            hashed_password="secret-hash",
            full_name="员工",
            role=UserRole.employee,
        )
        s.add(u)
        s.commit()

        emp = Employee(user_id=u.id, employee_code="E001", department="销售部")
        group = UserGroup(name="华东组")
        s.add(emp)
        s.add(group)
        s.commit()
        s.add(UserGroupMember(user_id=u.id, group_id=group.id))
        s.commit()

        emp_map, groups_map = _batch_extras(s, [u.id])
        data = _serialize_user(u, emp_map, groups_map)

    assert "hashed_password" not in data
    assert data["role"] == "employee"
    assert data["employee"]["employee_code"] == "E001"
    assert data["groups"] == ["华东组"]


def test_batch_extras_query_count_is_constant(engine):
    """多人列表也只固定 2 次查询（此前每人 2~3 次，列表 20 条即 40~60 次）。"""
    from app.models import Employee, UserGroup, UserGroupMember

    with Session(engine) as s:
        users = [
            User(
                email=f"u{i}@test.com",
                hashed_password="x",
                full_name=f"用户{i}",
                role=UserRole.employee,
            )
            for i in range(5)
        ]
        for u in users:
            s.add(u)
        s.flush()
        # 先取到 id（commit 后对象过期，再读属性会额外触发 SELECT，干扰计数）
        user_ids = [u.id for u in users]
        s.commit()
        for uid in user_ids:
            s.add(Employee(user_id=uid, employee_code=f"E{uid.hex[:4]}"))
        group = UserGroup(name="全体")
        s.add(group)
        s.commit()
        for uid in user_ids:
            s.add(UserGroupMember(user_id=uid, group_id=group.id))
        s.commit()

        statements = []

        def _count(conn, cursor, statement, parameters, context, executemany):
            statements.append(statement)

        event.listen(engine, "before_cursor_execute", _count)
        try:
            emp_map, groups_map = _batch_extras(s, user_ids)
        finally:
            event.remove(engine, "before_cursor_execute", _count)

    assert len(statements) == 2
    assert len(emp_map) == 5
    assert all(groups_map[uid] == ["全体"] for uid in user_ids)


# ------------------------------------------------------------ 乐观锁落到接口
def test_property_update_accepts_version_guard(api):
    """PATCH /properties/{id} 支持可选 version 校验，不带 version 时行为不变。"""
    # 归属人写成本用例的 agent：销售/经纪只能改自己录入的房源，
    # 留空会被当成「历史房源」而只允许管理员操作（403）。
    agent = api.mk_user(UserRole.agent)
    owner = None
    with Session(api.engine) as s:
        owner = Owner(user_id=uuid.uuid4())
        s.add(owner)
        s.commit()
        s.refresh(owner)
        prop = Property(
            owner_id=owner.id,
            room_number="A101",
            address="曼谷 Sukhumvit",
            monthly_rent=12000,
            currency="THB",
            status=PropertyStatus.vacant,
            created_by=agent.id,
        )
        s.add(prop)
        s.commit()
        s.refresh(prop)
        prop_id = str(prop.id)
        version = prop.version

    client = api.login(agent)
    ok = client.patch(f"/api/v1/properties/{prop_id}", json={"room_number": "A102"})
    assert ok.status_code == 200 and ok.json()["room_number"] == "A102"

    stale = client.patch(
        f"/api/v1/properties/{prop_id}",
        json={"room_number": "A103", "version": version},
    )
    assert stale.status_code == 409
    assert isinstance(stale.json()["detail"], str)


def test_message_and_conversation_models_roundtrip(engine):
    """消息落库包含 recipients_read 快照，重复读取不丢字段。"""
    with Session(engine) as s:
        sender = uuid.uuid4()
        conv = Conversation(title="t", participant_ids=[str(sender)], created_by=sender)
        s.add(conv)
        s.commit()
        s.refresh(conv)

        msg = Message(
            conversation_id=conv.id,
            sender_id=sender,
            body="hi",
            recipients_read=[{"user_id": str(sender), "read": True}],
        )
        s.add(msg)
        s.commit()
        s.refresh(msg)
        assert msg.body == "hi"
        assert msg.recipients_read[0]["read"] is True


# ------------------------------------------------------------ dashboard response_model
# 每个端点返回 dict 的全部键；response_model 会过滤未声明的字段，
# 此表即「前端依赖字段」的契约。
_DASHBOARD_CONTRACT = {
    "/api/v1/dashboard/summary": {
        "total_properties", "vacant", "rented", "maintenance", "expiring_leases",
        "upcoming_payments", "monthly_revenue", "active_lease_revenue",
        "occupancy_rate", "active_leads", "closed_leads", "conversion_rate",
    },
    "/api/v1/dashboard/recent-payments": {"items"},
    "/api/v1/dashboard/expiring-leases": {"items"},
    "/api/v1/dashboard/property-status-distribution": {"items"},
    "/api/v1/dashboard/financial-reconciliation": {
        "totals", "by_property", "records", "records_total",
    },
    "/api/v1/dashboard/trend": {"months", "series"},
}

_RECENT_PAYMENT_KEYS = {
    "id", "amount", "currency", "payment_type", "status", "channel",
    "due_date", "paid_at", "created_at", "description", "payer_name",
}
_EXPIRING_LEASE_KEYS = {
    "id", "property_id", "property_name", "tenant_id", "tenant_name",
    "monthly_rent", "currency", "end_date", "days_left",
}
_RECON_RECORD_KEYS = {
    "id", "property_id", "property", "amount", "currency", "payment_type",
    "status", "bucket", "channel", "due_date", "paid_at", "created_at",
}


def test_dashboard_response_models_do_not_truncate_fields(api):
    """dashboard 系列加 response_model 后，前端依赖的字段一个都不能少。"""
    from datetime import datetime, timedelta

    from app.models import Lease, LeaseStatus, Payment, PaymentStatus, PaymentType, Tenant

    with Session(api.engine) as s:
        payer = User(email="payer@test.com", hashed_password="x", full_name="付款人")
        s.add(payer)
        s.commit()

        owner = Owner(user_id=payer.id)
        s.add(owner)
        s.commit()

        prop = Property(
            owner_id=owner.id,
            room_number="A101",
            address="曼谷 Sukhumvit",
            monthly_rent=12000,
            currency="THB",
            status=PropertyStatus.vacant,
        )
        s.add(prop)
        s.commit()

        tenant = Tenant(user_id=payer.id)
        s.add(tenant)
        s.commit()

        now = datetime.utcnow()
        s.add(
            Lease(
                property_id=prop.id,
                tenant_id=tenant.id,
                owner_id=owner.id,
                start_date=now - timedelta(days=300),
                end_date=now + timedelta(days=10),  # 落在 30 天窗口内
                monthly_rent=12000,
                deposit_amount=24000,
                status=LeaseStatus.active,
            )
        )
        s.add(
            Payment(
                property_id=prop.id,
                payer_id=payer.id,
                amount=12000,
                currency="THB",
                payment_type=PaymentType.rent,
                status=PaymentStatus.succeeded,
                idempotency_key=uuid.uuid4().hex,
            )
        )
        s.commit()

    client = api.login(api.mk_user(UserRole.admin))
    for path, keys in _DASHBOARD_CONTRACT.items():
        resp = client.get(path)
        assert resp.status_code == 200, f"{path} -> {resp.status_code}: {resp.text}"
        assert set(resp.json()) == keys, path

    # 列表类端点的单条结构同样不能被截断
    payment = client.get("/api/v1/dashboard/recent-payments").json()["items"][0]
    assert set(payment) == _RECENT_PAYMENT_KEYS
    assert payment["payer_name"] == "付款人"

    lease = client.get("/api/v1/dashboard/expiring-leases").json()["items"][0]
    assert set(lease) == _EXPIRING_LEASE_KEYS
    assert lease["property_name"] == "A101"

    recon = client.get("/api/v1/dashboard/financial-reconciliation").json()
    assert set(recon["totals"]) == {"received", "receivable", "overdue", "count"}
    assert recon["totals"]["received"] == 12000
    assert set(recon["by_property"][0]) == {
        "property_id", "property", "received", "receivable", "overdue", "count",
    }
    assert set(recon["records"][0]) == _RECON_RECORD_KEYS


def test_dashboard_trend_month_math_and_bounds(api):
    """`/dashboard/trend` 的月份窗口不能越界，且 points 数必须等于请求的月份数。

    旧实现用 `datetime.replace(month=start.month - months % 12)`，当回推月份
    数超过当前月份时会抛 ValueError（500）。
    """
    from datetime import datetime

    client = api.login(api.mk_user(UserRole.admin))

    # 种数据验证「SQL GROUP BY 按月聚合」真的落到当前月这个桶
    from app.models import Lead, Payment, PaymentStatus, PaymentType

    with Session(api.engine) as s:
        payer = User(email="trend@test.com", hashed_password="x", full_name="趋势用户")
        s.add(payer)
        s.commit()
        s.add(
            Payment(
                payer_id=payer.id,
                amount=5000,
                currency="THB",
                payment_type=PaymentType.rent,
                status=PaymentStatus.succeeded,
                idempotency_key=uuid.uuid4().hex,
            )
        )
        s.add(Lead(name="趋势线索"))
        s.commit()

    current_label = datetime.utcnow().strftime("%Y-%m")
    point = client.get(
        "/api/v1/dashboard/trend", params={"months": 6}
    ).json()["series"][-1]
    assert point["month"] == current_label
    assert point["revenue"] == 5000
    assert point["leads_new"] == 1
    assert point["leases_new"] == 0

    for months in (1, 6, 11, 12, 13, 24, 120):
        resp = client.get("/api/v1/dashboard/trend", params={"months": months})
        assert resp.status_code == 200, f"months={months} -> {resp.status_code}: {resp.text}"
        payload = resp.json()
        assert payload["months"] == months, f"months={months}"
        assert len(payload["series"]) == months, f"months={months}"
        # 月份标签升序且形如 YYYY-MM
        labels = [point["month"] for point in payload["series"]]
        assert labels == sorted(labels)
        assert all(len(label) == 7 and label[4] == "-" for label in labels)

    # 最新一个桶必须是当前自然月，最早的桶 = 当前月回推 months-1 个月
    from app.api.v1.dashboard import _month_keys

    assert [p["month"] for p in client.get(
        "/api/v1/dashboard/trend", params={"months": 11}
    ).json()["series"]] == _month_keys(11)

    # 越界参数应被拒绝（原实现直接 500）
    for months in (0, -1, 121, 1000):
        resp = client.get("/api/v1/dashboard/trend", params={"months": months})
        assert resp.status_code == 422, f"months={months} -> {resp.status_code}"


# ------------------------------------------------------------ 令牌吊销（登出 / 改密）
def test_logout_and_password_reset_revoke_existing_tokens(api):
    """登出与重置密码后，此前签发的 access / refresh 令牌必须立即失效。

    此处走真实登录流程（先移除 `api.login` 注入的认证覆盖），因此校验的是真实的
    `get_current_user` 与 `/auth/refresh` 逻辑，而不是夹具桩。
    """
    from app.core.rbac import seed_permissions
    from app.core.security import get_password_hash

    app.dependency_overrides.pop(auth_module.get_current_user, None)

    with Session(api.engine) as s:
        seed_permissions(s)
        target = User(
            email="revoke@test.com",
            hashed_password=get_password_hash("secret123"),
            full_name="吊销用户",
            role=UserRole.tenant,
        )
        admin = User(
            email="revoke-admin@test.com",
            hashed_password=get_password_hash("admin123"),
            full_name="管理员",
            role=UserRole.admin,
        )
        s.add(target)
        s.add(admin)
        s.commit()
        s.refresh(target)

        app.dependency_overrides[get_session] = lambda: s
        client = TestClient(app)

        def _login(email: str, password: str):
            return client.post(
                "/api/v1/auth/login", data={"username": email, "password": password}
            )

        tokens = _login("revoke@test.com", "secret123").json()
        headers = {"Authorization": f"Bearer {tokens['access_token']}"}
        assert client.get("/api/v1/auth/me", headers=headers).status_code == 200

        # 登出 → 旧 access / refresh 令牌全部立即失效（未过期也无效）
        logout = client.post("/api/v1/auth/logout", headers=headers)
        assert logout.status_code == 200, logout.text
        assert logout.json()["token_version"] == 1
        assert client.get("/api/v1/auth/me", headers=headers).status_code == 401
        replayed = client.post(
            "/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
        )
        assert replayed.status_code == 401

        # 重新登录拿到的新令牌版本一致，可正常使用
        tokens = _login("revoke@test.com", "secret123").json()
        headers = {"Authorization": f"Bearer {tokens['access_token']}"}
        assert client.get("/api/v1/auth/me", headers=headers).status_code == 200

        # 管理员重置密码 → 旧令牌立即失效，旧密码也无法再登录
        admin_token = _login("revoke-admin@test.com", "admin123").json()["access_token"]
        reset = client.post(
            f"/api/v1/admin/users/{target.id}/reset-password",
            json={"new_password": "newsecret456"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert reset.status_code == 200, reset.text
        assert client.get("/api/v1/auth/me", headers=headers).status_code == 401
        assert _login("revoke@test.com", "secret123").status_code == 401
        assert _login("revoke@test.com", "newsecret456").status_code == 200


# ------------------------------------------------------------ 上传内容校验
def test_property_photo_upload_rejects_non_image_content(api, tmp_path, monkeypatch):
    """扩展名白名单可被伪造，落盘前必须按文件内容（魔数）校验。"""
    from app.api.v1 import properties as properties_module

    upload_dir = tmp_path / "properties"
    monkeypatch.setattr(properties_module, "UPLOAD_DIR", upload_dir)

    with Session(api.engine) as s:
        staff = User(
            email="uploader@test.com",
            hashed_password="x",
            full_name="中介",
            role=UserRole.admin,
        )
        s.add(staff)
        s.commit()
        owner = Owner(user_id=staff.id)
        s.add(owner)
        s.commit()
        prop = Property(
            owner_id=owner.id,
            room_number="B201",
            address="曼谷 Silom",
            monthly_rent=9000,
            status=PropertyStatus.vacant,
        )
        s.add(prop)
        s.commit()

        client = api.login(staff)
        url = f"/api/v1/properties/{prop.id}/photos"

        # 文本内容改名 .jpg → 拒绝，且不落盘
        forged = client.post(
            url, files={"files": ("evil.jpg", b"<html>alert(1)</html>", "image/jpeg")}
        )
        assert forged.status_code == 400, forged.text
        assert not upload_dir.exists() or not list(upload_dir.iterdir())

        # 真实 PNG 头 → 放行
        ok = client.post(
            url,
            files={"files": ("ok.png", b"\x89PNG\r\n\x1a\n" + b"\x00" * 32, "image/png")},
        )
        assert ok.status_code == 200, ok.text
        assert ok.json()["added"][0].endswith(".png")
        assert len(list(upload_dir.glob("*.png"))) == 1


# ==================== 支付回调验签 fail closed ====================
# 修复前的缺陷（任一即可伪造到账）：
#   - base / generic / promptpay 的 verify_webhook 恒返回 True；
#   - alipay / wechat 在未配置公钥/平台证书时返回 True；
#   - wise 只判断 "存在 X-Signature 头"，随便填一个值即通过；
#   - stripe 在密钥为空时用空密钥算 HMAC，攻击者可自行算出"合法"签名。
# 配合公开无鉴权的 POST /payments/webhook/{channel}，任何人 POST 一段 JSON
# 就能把支付单标记为已到账。以下用例锁住"缺验签材料一律拒绝"的契约。

# 覆盖三类实现：通用占位渠道 / 有验签但未配置材料 / 有验签且材料为空会退化
_FailClosedChannels = ["paypal", "grabpay", "truemoney", "promptpay", "alipay", "wechat", "wise", "stripe"]


def _forged_signature_headers() -> dict:
    """把各渠道认得的签名头全部塞满伪造值。"""
    return {
        "X-Signature": "forged",
        "Authorization": "Bearer forged",
        "Stripe-Signature": "t=1,v1=forged",
        "Wechatpay-Timestamp": "1",
        "Wechatpay-Nonce": "forged",
        "Wechatpay-Signature": "Zm9yZ2Vk",
        "sign": "forged",
        "sign_type": "RSA2",
    }


@pytest.mark.parametrize("channel", _FailClosedChannels)
def test_webhook_verify_fails_closed_when_unconfigured(channel, monkeypatch):
    """未配置验签材料时，任何渠道的回调都必须被拒绝。"""
    from app.providers.payment import (
        alipay_provider,
        stripe_provider,
        wechat_provider,
        wise_provider,
    )
    from app.providers.payment.base import PaymentChannel
    from app.providers.payment.router import payment_router

    # 模拟"生产忘了配置"：清空所有验签材料（这些名字在 provider 模块内被直接引用）
    monkeypatch.setattr(stripe_provider, "STRIPE_WEBHOOK_SECRET", "", raising=False)
    monkeypatch.setattr(alipay_provider, "ALIPAY_PUBLIC_KEY", "", raising=False)
    monkeypatch.setattr(wechat_provider, "WECHAT_PLATFORM_CERT", "", raising=False)
    monkeypatch.setattr(wise_provider, "WISE_API_KEY", "", raising=False)

    provider = payment_router.get_provider(PaymentChannel(channel))
    assert (
        provider.verify_webhook(
            {"event": "payment.succeeded", "transaction_id": "forged"},
            _forged_signature_headers(),
        )
        is False
    ), f"{channel} 未配置验签材料时仍放行了回调 —— 可被伪造到账"


def test_stripe_webhook_rejects_empty_secret(monkeypatch):
    """Stripe 空密钥必须拒绝：否则攻击者用空密钥即可算出合法 HMAC。"""
    import hashlib
    import hmac
    import json

    from app.providers.payment import stripe_provider
    from app.providers.payment.base import PaymentChannel
    from app.providers.payment.router import payment_router

    monkeypatch.setattr(stripe_provider, "STRIPE_WEBHOOK_SECRET", "", raising=False)
    provider = payment_router.get_provider(PaymentChannel.STRIPE)

    payload = {"event": "payment.succeeded", "transaction_id": "forged"}
    t = "1"
    payload_str = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
    # 攻击者按"空密钥"自行计算签名
    forged = hmac.new(b"", f"{t}.{payload_str}".encode(), hashlib.sha256).hexdigest()

    assert provider.verify_webhook(payload, {"Stripe-Signature": f"t={t},v1={forged}"}) is False


def test_webhook_endpoint_rejects_forged_callback(engine):
    """端到端：伪造回调不能把支付单标记为已到账。"""
    import uuid as _uuid

    from app.models.payment import Payment, PaymentStatus, PaymentType
    from app.models.payment_webhook_event import PaymentWebhookEvent

    session = Session(engine)
    app.dependency_overrides[get_session] = lambda: session
    try:
        pay = Payment(
            payer_id=_uuid.uuid4(),
            amount=6000,
            currency="THB",
            payment_type=PaymentType.rent,
            status=PaymentStatus.pending,
            channel="paypal",
            idempotency_key=str(_uuid.uuid4()),
        )
        session.add(pay)
        session.commit()
        session.refresh(pay)
        pay_id = str(pay.id)

        resp = TestClient(app).post(
            "/api/v1/payments/webhook/paypal",
            json={"event": "payment.succeeded", "id": "forged", "payment_id": pay_id},
            headers=_forged_signature_headers(),
        )
        assert resp.status_code >= 400, f"伪造回调被接受了：{resp.status_code} {resp.text}"

        session.expire_all()
        assert session.get(Payment, _uuid.UUID(pay_id)).status == PaymentStatus.pending
        assert session.exec(select(PaymentWebhookEvent)).all() == []
    finally:
        app.dependency_overrides.pop(get_session, None)
        session.close()