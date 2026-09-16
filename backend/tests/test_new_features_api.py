"""v1.10 新功能 API 单元测试。

覆盖：收藏（增/删/查/幂等/越权）、佣金规则（admin 增改删 + 非 admin 403）、
税务发票（价税拆分）、退租押金结算（核算 + 副作用）、审计日志（admin 鉴权）。

全部使用内存 SQLite + dependency_overrides，不触真实数据库。
"""

import sys
import pathlib
import uuid
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlmodel import SQLModel, Session, create_engine, select
from sqlalchemy.pool import StaticPool
from types import SimpleNamespace

BASE_DIR = pathlib.Path(__file__).resolve().parents[1]
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from app.db import get_session  # noqa: E402
from app.core import auth as auth_module  # noqa: E402
from app.models import (  # noqa: E402
    Employee,
    Lease,
    LeaseStatus,
    Owner,
    Payment,
    PaymentStatus,
    PaymentType,
    Property,
    PropertyStatus,
    Tenant,
    User,
    UserRole,
)
from app.main import app  # noqa: E402


@pytest.fixture()
def engine():
    # StaticPool：TestClient 请求可能运行在不同线程，需所有线程共享同一内存库连接
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
    """返回一个可通过 overrides 绑定到内存库的 TestClient 工厂。"""

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


@pytest.fixture()
def owner_property(engine):
    with Session(engine) as s:
        o = Owner(user_id=uuid.uuid4())
        s.add(o)
        s.commit()
        s.refresh(o)
    with Session(engine) as s:
        p = Property(
            owner_id=o.id,
            room_number="A101",
            address="曼谷 Sukhumvit 101",
            monthly_rent=12000,
            currency="THB",
            deposit_amount=24000,
            status=PropertyStatus.rented,
        )
        s.add(p)
        s.commit()
        s.refresh(p)
    return o, p


# ------------------------------------------------------------ 收藏
def test_favorites_add_list_status_remove(api, owner_property):
    _, prop = owner_property
    tenant = api.mk_user(UserRole.tenant)
    client = api.login(tenant)
    pid = str(prop.id)

    # 幂等收藏
    r1 = client.post("/api/v1/favorites", json={"property_id": pid})
    assert r1.status_code == 200 and r1.json()["favorited"] is True
    r2 = client.post("/api/v1/favorites", json={"property_id": pid})
    assert r2.status_code == 200

    # 状态查询
    st = client.get(f"/api/v1/favorites/status/{pid}")
    assert st.json()["favorited"] is True

    # 列表包含房源信息
    lst = client.get("/api/v1/favorites")
    items = lst.json()["items"]
    assert len(items) == 1
    assert items[0]["address"] == "曼谷 Sukhumvit 101"
    assert items[0]["monthly_rent"] == 12000

    # 取消收藏
    rm = client.delete(f"/api/v1/favorites/{pid}")
    assert rm.json()["favorited"] is False
    assert client.get("/api/v1/favorites").json()["items"] == []


def test_favorite_missing_property_404(api):
    tenant = api.mk_user(UserRole.tenant)
    client = api.login(tenant)
    r = client.post(
        "/api/v1/favorites",
        json={"property_id": str(uuid.uuid4())},
    )
    assert r.status_code == 404


# ------------------------------------------------------------ 佣金规则
def test_commission_rules_admin_crud(api):
    admin = api.mk_user(UserRole.admin)
    client = api.login(admin)

    created = client.post(
        "/api/v1/commission-rules",
        json={
            "name": "新签佣金",
            "deal_type": "new_rental",
            "rate": 5.0,
            "minimum_amount": 1000,
        },
    )
    assert created.status_code == 200, created.text
    body = created.json()
    rule_id = body["id"]
    assert body["rate"] == 5.0

    lst = client.get("/api/v1/commission-rules")
    assert lst.status_code == 200
    assert len(lst.json()["items"]) == 1

    patch = client.patch(f"/api/v1/commission-rules/{rule_id}", json={"rate": 6.5})
    assert patch.json()["rate"] == 6.5

    detail = client.get(f"/api/v1/commission-rules/{rule_id}")
    assert detail.status_code == 200

    deleted = client.delete(f"/api/v1/commission-rules/{rule_id}")
    assert deleted.json()["ok"]
    assert client.get("/api/v1/commission-rules").json()["items"] == []


def test_commission_rules_forbidden_for_tenant(api):
    tenant = api.mk_user(UserRole.tenant)
    client = api.login(tenant)
    r = client.post(
        "/api/v1/commission-rules",
        json={"name": "x", "deal_type": "new_rental", "rate": 5},
    )
    assert r.status_code == 403


# ------------------------------------------------------------ 税务发票
def test_payment_invoice_split(api, owner_property):
    _, prop = owner_property
    tenant = api.mk_user(UserRole.tenant)
    with Session(api.engine) as s:
        pay = Payment(
            payer_id=tenant.id,
            property_id=prop.id,
            amount=12000,
            currency="THB",
            payment_type=PaymentType.rent,
            status=PaymentStatus.succeeded,
            channel="promptpay",
            idempotency_key=str(uuid.uuid4()),
            paid_at=datetime.utcnow(),
        )
        s.add(pay)
        s.commit()
        s.refresh(pay)
        pid = pay.id

    client = api.login(tenant)
    r = client.get(f"/api/v1/payments/{pid}/invoice")
    assert r.status_code == 200, r.text
    inv = r.json()
    # 价税拆分：total = net + vat，vat 率 7%
    assert inv["total_amount"] == 12000
    assert inv["net_amount"] + inv["tax_amount"] == 12000
    assert abs(inv["tax_amount"] - (12000 / 1.07 * 0.07)) < 0.5
    assert inv["currency"] == "THB"
    assert inv["bill_to"]["name"] == "测试用户"


# ------------------------------------------------------------ 退租押金结算
def test_deposit_settlement_refund_and_retire(api, engine):
    with Session(engine) as s:
        o = Owner(user_id=uuid.uuid4())
        s.add(o)
        s.commit()
        s.refresh(o)
        owner_id = o.id
    with Session(engine) as s:
        p = Property(
            owner_id=owner_id,
            room_number="B202",
            address="清迈古城",
            monthly_rent=8000,
            currency="THB",
            deposit_amount=16000,
            status=PropertyStatus.rented,
        )
        s.add(p)
        s.commit()
        s.refresh(p)
        prop_id = p.id

    tenant = api.mk_user(UserRole.tenant)
    emp = Employee(user_id=uuid.uuid4(), employee_code="E03")
    lease = Lease(
        property_id=prop_id,
        tenant_id=tenant.id,
        owner_id=owner_id,
        agent_id=emp.id,
        start_date=datetime.utcnow() - timedelta(days=300),
        end_date=datetime.utcnow() + timedelta(days=65),
        monthly_rent=8000,
        deposit_amount=16000,
        currency="THB",
        status=LeaseStatus.active,
    )
    with Session(engine) as s:
        s.add(emp)
        s.add(lease)
        s.commit()
        s.refresh(lease)
        lease_id = lease.id
        # 一笔已到期未付租金
        s.add(
            Payment(
                payer_id=tenant.id,
                lease_id=lease.id,
                property_id=prop_id,
                amount=8000,
                currency="THB",
                payment_type=PaymentType.rent,
                status=PaymentStatus.pending,
                idempotency_key=str(uuid.uuid4()),
                due_date=datetime.utcnow() - timedelta(days=3),
            )
        )
        s.commit()

    admin = api.mk_user(UserRole.admin)
    client = api.login(admin)
    r = client.post(
        f"/api/v1/leases/{lease_id}/deposit-settlement",
        json={
            # 退房日期取「此刻」而非写死：未付租金的 due_date 是 now-3d，
            # 结算只统计 due_date <= termination_date 的欠款，写死日期会让
            # 测试在几天后自动失效（欠款被排除 → outstanding_rent 变 0）。
            "termination_date": datetime.utcnow().isoformat(),
            "damage_charges": 1000,
            "other_deductions": [{"label": "换锁", "amount": 500}],
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    # 押金16k - 未付租金8k - 损耗(1000+500)=6500 应退
    assert body["deposit_held"] == 16000
    assert body["outstanding_rent"] == 8000
    assert body["total_deductions"] == 1500
    assert body["net_refund"] == 6500
    assert body["disposition"] == "refund"

    # 副作用：租约终止、房源空置、退款支付单已生成
    with Session(engine) as s:
        l2 = s.get(Lease, lease_id)
        p2 = s.get(Property, prop_id)
        refund = s.exec(
            select(Payment).where(Payment.description.contains("押金退还"))
        ).first()
    assert l2.status == LeaseStatus.terminated
    assert p2.status == PropertyStatus.vacant
    assert refund is not None and refund.amount == 6500


# ------------------------------------------------------------ 租客续约
def _seed_renewable_lease(engine, tenant_user_id, rent=8000):
    """造一个归某租客的生效租约，返回 (owner_id, property_id, lease_id, emp)。"""
    with Session(engine) as s:
        o = Owner(user_id=uuid.uuid4())
        s.add(o)
        s.commit()
        s.refresh(o)
        owner_id = o.id
    with Session(engine) as s:
        p = Property(
            owner_id=owner_id,
            room_number="C303",
            address="曼谷市中心",
            monthly_rent=rent,
            currency="THB",
            deposit_amount=16000,
            status=PropertyStatus.rented,
        )
        s.add(p)
        s.commit()
        s.refresh(p)
        prop_id = p.id
    emp = Employee(user_id=uuid.uuid4(), employee_code="E04")
    lease = Lease(
        property_id=prop_id,
        tenant_id=tenant_user_id,
        owner_id=owner_id,
        agent_id=emp.id,
        start_date=datetime.utcnow() - timedelta(days=300),
        end_date=datetime.utcnow() + timedelta(days=40),
        monthly_rent=rent,
        deposit_amount=16000,
        currency="THB",
        status=LeaseStatus.active,
    )
    with Session(engine) as s:
        s.add(emp)
        s.add(lease)
        s.commit()
        s.refresh(lease)
        lease_id = lease.id
    return owner_id, prop_id, lease_id, emp


def test_tenant_renew_own_lease_inherits_rent(api, engine):
    """租约本人续约：沿用原租金，旧租约过期，新租约续接。"""
    tuser = api.mk_user(UserRole.tenant)
    with Session(engine) as s:
        t = Tenant(user_id=tuser.id)
        s.add(t)
        s.commit()
        s.refresh(t)
        tuser_id = t.id  # 租约 tenant_id 指向 Tenant 记录
    _, _, lease_id, _ = _seed_renewable_lease(engine, tuser_id, rent=8000)

    client = api.login(tuser)
    r = client.post(
        f"/api/v1/leases/{lease_id}/renew",
        json={
            "start_date": "2026-10-01T00:00:00Z",
            "end_date": "2027-10-01T00:00:00Z",
            # 租客试图自定租金，应被忽略沿用原租金
            "monthly_rent": 99999,
        },
    )
    assert r.status_code == 200, r.text
    new_lease = r.json()
    assert new_lease["monthly_rent"] == 8000, "租客不得自定租金，应沿用原租金"


def test_tenant_cannot_renew_others_lease(api, engine):
    """非本租约租客续约 → 403。"""
    owner_user = api.mk_user(UserRole.tenant)
    with Session(engine) as s:
        t = Tenant(user_id=owner_user.id)
        s.add(t)
        s.commit()
        s.refresh(t)
        t_id = t.id
    _, _, lease_id, _ = _seed_renewable_lease(engine, t_id)
    # other 是另一个无关联租约的普通租户
    other = api.mk_user(UserRole.tenant)
    with Session(engine) as s:
        t2 = Tenant(user_id=other.id)
        s.add(t2)
        s.commit()
    client = api.login(other)
    r = client.post(
        f"/api/v1/leases/{lease_id}/renew",
        json={"start_date": "2026-10-01T00:00:00Z", "end_date": "2027-10-01T00:00:00Z"},
    )
    assert r.status_code == 403


# ------------------------------------------------------------ 审计日志
def test_audit_logs_require_admin(api):
    tenant = api.mk_user(UserRole.tenant)
    client = api.login(tenant)
    assert client.get("/api/v1/audit-logs").status_code == 403

    admin = api.mk_user(UserRole.admin)
    cadmin = api.login(admin)
    ok = cadmin.get("/api/v1/audit-logs")
    assert ok.status_code == 200
    assert "items" in ok.json()
