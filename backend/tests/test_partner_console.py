"""合作伙伴赋能路线图（A-F）核心验收测试。

覆盖：跨公司隔离、佣金口径一致性、成员启停/重置密码、坐席上限、
房源授权可见性、线索报备冲突、组长数据范围、Webhook 签名。
"""
import pathlib
import sys
import uuid
from datetime import date, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

BASE_DIR = pathlib.Path(__file__).resolve().parents[1]
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from app.core import auth as auth_module  # noqa: E402
from app.core.security import get_password_hash  # noqa: E402
from app.db import get_session  # noqa: E402
from app.main import app  # noqa: E402
from app.models import (  # noqa: E402
    CommissionRole,
    CommissionSettlement,
    DealType,
    Department,
    Employee,
    Owner,
    Partner,
    Property,
    PropertyStatus,
    SettlementStatus,
    User,
    UserRole,
    UserType,
)


@pytest.fixture()
def engine():
    eng = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        echo=False,
    )
    SQLModel.metadata.create_all(eng)
    from app.core.rbac import seed_permissions

    with Session(eng) as s:
        seed_permissions(s)
    return eng


@pytest.fixture()
def ctx(engine):
    """构造两家合作公司，各 1 管理员 + 1 经纪人。"""
    sessions = []
    with Session(engine) as s:
        def mk_user(email, role, partner_id):
            u = User(
                email=email,
                hashed_password=get_password_hash("pass123"),
                full_name=email.split("@")[0],
                role=role,
                user_type=UserType.partner if partner_id else UserType.platform,
                partner_id=partner_id,
                is_active=True,
                is_verified=True,
            )
            s.add(u)
            s.flush()
            return u

        pa = Partner(name="Alpha Realty", status="active", is_active=True)
        pb = Partner(name="Beta Realty", status="active", is_active=True)
        s.add(pa)
        s.add(pb)
        s.flush()
        admin_a = mk_user("admin_a@test.com", UserRole.partner_admin, pa.id)
        agent_a = mk_user("agent_a@test.com", UserRole.agent, pa.id)
        admin_b = mk_user("admin_b@test.com", UserRole.partner_admin, pb.id)
        agent_b = mk_user("agent_b@test.com", UserRole.agent, pb.id)
        emp_a = Employee(user_id=agent_a.id, employee_code="EA", department="Alpha Realty")
        emp_b = Employee(user_id=agent_b.id, employee_code="EB", department="Beta Realty")
        s.add(emp_a)
        s.add(emp_b)
        s.flush()

        # Alpha 一笔成交，两条分佣（经纪人 + 公司）
        lease_id = uuid.uuid4()
        s.add(
            CommissionSettlement(
                employee_id=emp_a.id,
                role=CommissionRole.client_agent,
                partner_id=pa.id,
                lease_id=lease_id,
                deal_type=DealType.new_rental,
                commission_base=30000,
                commission_rate=5,
                commission_amount=1500,
                status=SettlementStatus.approved,
            )
        )
        s.add(
            CommissionSettlement(
                role=CommissionRole.partner_company,
                partner_id=pa.id,
                lease_id=lease_id,
                deal_type=DealType.new_rental,
                commission_base=30000,
                commission_rate=2,
                commission_amount=600,
                status=SettlementStatus.paid,
                paid_at=datetime.utcnow(),
            )
        )
        owner_user = mk_user("owner_a@test.com", UserRole.owner, None)
        owner = Owner(user_id=owner_user.id)
        s.add(owner)
        s.flush()
        prop = Property(
            owner_id=owner.id,
            room_number="1001",
            address="Alpha Tower 1001",
            property_type="condo",
            monthly_rent=30000,
            status=PropertyStatus.vacant,
            created_by=agent_a.id,
        )
        s.add(prop)
        s.commit()
        ids = {
            "pa": pa.id, "pb": pb.id,
            "admin_a": admin_a.id, "agent_a": agent_a.id,
            "admin_b": admin_b.id, "agent_b": agent_b.id,
            "emp_a": emp_a.id, "emp_b": emp_b.id,
            "prop": prop.id,
        }

    def login(uid):
        s = Session(engine)
        sessions.append(s)
        bound = s.get(User, uid)
        app.dependency_overrides[get_session] = lambda: s
        app.dependency_overrides[auth_module.get_current_user] = lambda: bound
        return TestClient(app)

    yield type("Ctx", (), {"ids": ids, "login": staticmethod(login), "engine": engine})()
    for s in sessions:
        s.close()
    app.dependency_overrides.clear()


def test_dashboard_and_settlements_are_isolated(ctx):
    ids = ctx.ids
    a = ctx.login(ids["admin_a"])
    dash = a.get("/api/v1/partner/dashboard").json()
    assert dash["stats"]["receivable"] == 2100
    assert dash["stats"]["paid"] == 600
    assert dash["stats"]["pending"] == 1500
    assert dash["stats"]["deals"] == 1

    rows = a.get("/api/v1/partner/settlements").json()
    assert rows["total"] == 2
    assert round(rows["sum"]["amount"], 2) == dash["stats"]["receivable"]

    b = ctx.login(ids["admin_b"])
    assert b.get("/api/v1/partner/dashboard").json()["stats"]["receivable"] == 0
    assert b.get("/api/v1/partner/settlements").json()["total"] == 0


def test_member_lifecycle_and_self_protection(ctx):
    ids = ctx.ids
    admin = ctx.login(ids["admin_a"])
    # 编辑资料
    res = admin.patch(
        f"/api/v1/partner/members/{ids['agent_a']}",
        json={"full_name": "Agent A+", "position": "Senior"},
    )
    assert res.status_code == 200
    assert res.json()["position"] == "Senior"

    # 不能停用自己
    assert admin.post(f"/api/v1/partner/members/{ids['admin_a']}/deactivate").status_code == 400

    # 停用成员后无法登录
    assert admin.post(f"/api/v1/partner/members/{ids['agent_a']}/deactivate").status_code == 200
    login = TestClient(app).post(
        "/api/v1/auth/login",
        data={"username": "agent_a@test.com", "password": "pass123"},
    )
    assert login.status_code in (400, 401, 403)

    # 重置密码后可用新密码登录（先恢复启用）
    admin.post(f"/api/v1/partner/members/{ids['agent_a']}/activate")
    reset = admin.post(f"/api/v1/partner/members/{ids['agent_a']}/reset-password", json={})
    pwd = reset.json()["password"]
    ok = TestClient(app).post(
        "/api/v1/auth/login",
        data={"username": "agent_a@test.com", "password": pwd},
    )
    assert ok.status_code == 200

    # 跨公司操作 404
    assert admin.post(f"/api/v1/partner/members/{ids['agent_b']}/deactivate").status_code == 404


def test_seat_limit_and_csv_import(ctx):
    ids = ctx.ids
    with Session(ctx.engine) as s:
        partner = s.get(Partner, ids["pa"])
        partner.seat_limit = 2  # 已有 admin_a + agent_a
        s.add(partner)
        s.commit()
    admin = ctx.login(ids["admin_a"])
    res = admin.post(
        "/api/v1/partner/members",
        json={"email": "new@test.com", "full_name": "New", "password": "123456"},
    )
    assert res.status_code == 400

    with Session(ctx.engine) as s:
        partner = s.get(Partner, ids["pa"])
        partner.seat_limit = None
        s.add(partner)
        s.commit()
    # 重新登录以获得新 Session（login 会全局覆盖依赖，旧 Session 会缓存旧 seat_limit）
    admin = ctx.login(ids["admin_a"])
    csv_text = (
        "姓名,邮箱,手机,职位\n"
        "张三,zhangsan@test.com,13800000000,经纪人\n"
        "重复,agent_a@test.com,,经纪人\n"
        "坏行,not-an-email,,经纪人\n"
    )
    res = admin.post("/api/v1/partner/members/import", json={"csv": csv_text})
    data = res.json()
    assert len(data["created"]) == 1
    assert len(data["errors"]) == 2
    assert {e["line"] for e in data["errors"]} == {3, 4}


def test_property_grants_visibility(ctx):
    ids = ctx.ids
    with Session(ctx.engine) as s:
        # 平台管理员授权前，合作端看不到
        agent = ctx.login(ids["agent_a"])
        assert agent.get("/api/v1/partner/available-properties").json()["total"] == 0
        # 直接写授权（平台侧接口需要 partner:manage，这里用数据验证可见性逻辑）
        from app.models import PartnerPropertyGrant

        s.add(
            PartnerPropertyGrant(
                partner_id=ids["pa"],
                property_id=ids["prop"],
                expires_at=datetime.utcnow() + timedelta(days=30),
            )
        )
        s.commit()
    res = agent.get("/api/v1/partner/available-properties").json()
    assert res["total"] == 1
    assert res["items"][0]["id"] == str(ids["prop"])

    # 另一家公司仍然不可见
    other = ctx.login(ids["agent_b"])
    assert other.get("/api/v1/partner/available-properties").json()["total"] == 0


def test_lead_claim_conflict(ctx):
    ids = ctx.ids
    a = ctx.login(ids["admin_a"])
    first = a.post("/api/v1/partner/leads/claim", json={"name": "客户甲", "phone": "081-234-5678"})
    assert first.status_code == 200
    dup_same = a.post("/api/v1/partner/leads/claim", json={"name": "客户甲", "phone": "0812345678"})
    assert dup_same.status_code == 200
    assert dup_same.json()["duplicated"] is True
    # login 会覆盖全局依赖，切换身份必须在上一次请求之后
    b = ctx.login(ids["admin_b"])
    conflict = b.post("/api/v1/partner/leads/claim", json={"name": "客户甲", "phone": "0812345678"})
    assert conflict.status_code == 409
    assert "until" in conflict.json()["detail"]


def test_team_leader_scope(ctx):
    ids = ctx.ids
    with Session(ctx.engine) as s:
        # agent_a 作为组长，本组只有自己
        dep = Department(name="Alpha Team 1", code="AT1", partner_id=ids["pa"], leader_id=ids["agent_a"])
        s.add(dep)
        s.flush()
        emp = s.get(Employee, ids["emp_a"])
        emp.department_id = dep.id
        emp.department = dep.name
        s.add(emp)
        s.commit()
    leader = ctx.login(ids["agent_a"])
    # 组长只有 data:view（无 dashboard 权限），看板接口应 403
    assert leader.get("/api/v1/partner/dashboard").status_code == 403


def test_webhook_signature_helper():
    from app.services.partner_webhook import sign

    sig1 = sign("secret", 1700000000, '{"a":1}')
    sig2 = sign("secret", 1700000000, '{"a":1}')
    assert sig1 == sig2
    assert sig1 != sign("secret", 1700000001, '{"a":1}')


def test_members_expose_employee_id_for_assignment(ctx):
    """成员列表需返回 Employee.id：排班/线索/带看分配接口按它校验。"""
    ids = ctx.ids
    admin = ctx.login(ids["admin_a"])
    rows = admin.get("/api/v1/partner/members").json()
    by_id = {r["id"]: r for r in rows}
    assert by_id[str(ids["agent_a"])]["employee_id"] == str(ids["emp_a"])
    assert by_id[str(ids["admin_a"])]["employee_id"] is None
