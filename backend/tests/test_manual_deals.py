"""手工补录业绩（manual_deals）回归测试。

覆盖：创建补录、非 admin 越权、金额校验、列表数据隔离、软删除权限，
以及 /performance/me 汇总是否包含补录金额。

全部使用内存 SQLite + dependency_overrides，不触碰真实数据库与 Redis。
"""
import pathlib
import sys
import uuid
from datetime import datetime
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

BASE_DIR = pathlib.Path(__file__).resolve().parents[1]
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from app.db import get_session  # noqa: E402
from app.core.rbac import seed_permissions  # noqa: E402
from app.core.security import create_access_token  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Employee, User, UserRole  # noqa: E402


def _today() -> str:
    return datetime.utcnow().date().isoformat()


@pytest.fixture()
def engine():
    eng = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        echo=False,
    )
    SQLModel.metadata.create_all(eng)
    # 与 conftest 一致：补种角色默认权限，避免 require_permission 误判
    with Session(eng) as s:
        seed_permissions(s)
    return eng


@pytest.fixture()
def seed(engine):
    def _mk_user(session, role: UserRole, name: str) -> User:
        user = User(
            email=f"{uuid.uuid4().hex[:12]}@test.com",
            hashed_password="x",
            full_name=name,
            role=role,
        )
        session.add(user)
        session.commit()
        session.refresh(user)
        return user

    with Session(engine) as s:
        admin = _mk_user(s, UserRole.admin, "管理员")
        emp_user = _mk_user(s, UserRole.employee, "员工甲")
        other_user = _mk_user(s, UserRole.employee, "员工乙")
        emp = Employee(user_id=emp_user.id, employee_code="E001")
        other = Employee(user_id=other_user.id, employee_code="E002")
        s.add(emp)
        s.add(other)
        s.commit()
        s.refresh(emp)
        s.refresh(other)
        return SimpleNamespace(
            admin_id=admin.id,
            emp_user_id=emp_user.id,
            other_user_id=other_user.id,
            emp_id=emp.id,
            other_emp_id=other.id,
        )


@pytest.fixture()
def api(engine):
    """返回按登录用户签发真实 JWT 的 TestClient 工厂。

    不能用 dependency_overrides 覆盖 get_current_user：overrides 是全局的，
    切换账号时会让此前创建的 client 也「变成」新用户，无法验证数据隔离。
    """

    def _session_override():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = _session_override

    def login(user_id):
        token = create_access_token({"sub": str(user_id)})
        return TestClient(app, headers={"Authorization": f"Bearer {token}"})

    try:
        yield SimpleNamespace(login=login)
    finally:
        app.dependency_overrides.clear()


def _payload(**overrides):
    body = {
        "source": "platform_customer",
        "deal_type": "new_rental",
        "deal_date": _today(),
        "deal_amount": 100000,
        "commission_amount": 3000,
        "currency": "THB",
        "customer_name": "测试客户",
        "note": "手工补录",
    }
    body.update(overrides)
    return body


def test_create_manual_deal(api, seed):
    client = api.login(seed.emp_user_id)
    resp = client.post("/api/v1/performance/deals", json=_payload())
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["employee_id"] == str(seed.emp_id)
    assert body["employee_name"] == "员工甲"
    assert body["source"] == "platform_customer"
    assert body["deal_type"] == "new_rental"
    assert body["deal_amount"] == 100000
    assert body["commission_amount"] == 3000
    assert body["currency"] == "THB"
    assert body["customer_name"] == "测试客户"
    assert body["id"]


def test_create_for_other_employee_forbidden(api, seed):
    client = api.login(seed.emp_user_id)
    resp = client.post(
        "/api/v1/performance/deals",
        json=_payload(employee_id=str(seed.other_emp_id)),
    )
    assert resp.status_code == 403


def test_create_non_positive_amount_rejected(api, seed):
    client = api.login(seed.emp_user_id)
    for amount in (0, -100):
        resp = client.post(
            "/api/v1/performance/deals",
            json=_payload(deal_amount=amount),
        )
        assert resp.status_code == 422


def test_list_only_self(api, seed):
    emp_client = api.login(seed.emp_user_id)
    emp_client.post("/api/v1/performance/deals", json=_payload())

    admin_client = api.login(seed.admin_id)
    admin_client.post(
        "/api/v1/performance/deals",
        json=_payload(employee_id=str(seed.other_emp_id), deal_amount=5000),
    )

    own = emp_client.get("/api/v1/performance/deals")
    assert own.status_code == 200
    rows = own.json()
    assert len(rows) == 1
    assert rows[0]["employee_id"] == str(seed.emp_id)

    forbidden = emp_client.get(
        "/api/v1/performance/deals",
        params={"employee_id": str(seed.other_emp_id)},
    )
    assert forbidden.status_code == 403

    all_rows = admin_client.get("/api/v1/performance/deals")
    assert all_rows.status_code == 200
    assert len(all_rows.json()) == 2


def test_delete_permissions_and_soft_delete(api, seed):
    emp_client = api.login(seed.emp_user_id)
    own_id = emp_client.post("/api/v1/performance/deals", json=_payload()).json()["id"]

    admin_client = api.login(seed.admin_id)
    other_id = admin_client.post(
        "/api/v1/performance/deals",
        json=_payload(employee_id=str(seed.other_emp_id)),
    ).json()["id"]

    forbidden = emp_client.delete(f"/api/v1/performance/deals/{other_id}")
    assert forbidden.status_code == 403

    missing = emp_client.delete(f"/api/v1/performance/deals/{uuid.uuid4()}")
    assert missing.status_code == 404

    deleted = emp_client.delete(f"/api/v1/performance/deals/{own_id}")
    assert deleted.status_code == 200
    assert emp_client.get("/api/v1/performance/deals").json() == []

    again = emp_client.delete(f"/api/v1/performance/deals/{own_id}")
    assert again.status_code == 404


def test_my_performance_includes_manual_deals(api, seed):
    today = datetime.utcnow().date()
    last_year = today.replace(year=today.year - 1)
    client = api.login(seed.emp_user_id)
    client.post(
        "/api/v1/performance/deals",
        json=_payload(deal_type="new_rental", deal_amount=100000, commission_amount=3000),
    )
    client.post(
        "/api/v1/performance/deals",
        json=_payload(
            source="self_sourced",
            deal_type="sale_transaction",
            deal_date=last_year.isoformat(),
            deal_amount=50000,
            commission_amount=1000,
        ),
    )

    resp = client.get("/api/v1/performance/me")
    assert resp.status_code == 200
    data = resp.json()
    summary = data["summary"]

    assert summary["month_deals"] == 1
    assert summary["month_total"] == 100000
    assert summary["month_commission"] == 3000
    assert summary["commission_total"] == 4000
    assert summary["year_total"] == 100000

    breakdown = {b["deal_type"]: b for b in summary["breakdown"]}
    assert breakdown["new_rental"]["amount"] == 3000
    assert breakdown["new_rental"]["count"] == 1
    assert breakdown["new_rental"]["label"] == "租赁成交"

    current = data["monthly"][-1]
    assert current["year"] == today.year
    assert current["month"] == today.month
    assert current["revenue"] == 100000
    assert current["commission"] == 3000
    assert current["deals"] == 1
