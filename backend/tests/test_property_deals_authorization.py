"""买卖成交 / 定金托管接口归属校验回归测试（P0-5）。

修复背景：`property_deals.py` 的 `get_deal` / `update_deal_status` /
`create_escrow` / `list_escrows` 此前**只校验「已登录」**，导致任意登录用户都能：

- 推进他人成交状态（`PATCH /property-deals/{id}/status`）；
- 读取他人成交的定金金额（`GET /property-deals/escrows/{deal_id}`）；
- 读任意成交详情（含成交价、买卖双方 id）。

本文件锁死修复后的契约：写动作限员工；读动作走 `can_view_deal()`，
不可见一律 404（不暴露「存在但你没权限」）。

全部使用内存 SQLite + dependency_overrides，不触真实数据库。
"""

import pathlib
import sys
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select
from types import SimpleNamespace

BASE_DIR = pathlib.Path(__file__).resolve().parents[1]
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from app.db import get_session  # noqa: E402
from app.core import auth as auth_module  # noqa: E402
from app.main import app  # noqa: E402
from app.models import (  # noqa: E402
    Escrow,
    EscrowStatus,
    Owner,
    Property,
    PropertyDeal,
    PropertyDealStatus,
    PropertyStatus,
    SaleListing,
    User,
    UserRole,
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
    return eng


@pytest.fixture()
def api(engine):
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


def _seed(engine, *, buyer, seller_owner_user, agent):
    """建「买方=buyer、业主=seller_owner_user、经办=agent」的成交 + 一笔定金。

    返回 (deal_id, escrow_id)。
    """
    from datetime import datetime

    with Session(engine) as s:
        owner = Owner(user_id=seller_owner_user.id)
        s.add(owner)
        s.commit()
        s.refresh(owner)

        prop = Property(
            owner_id=owner.id,
            room_number="S-01",
            address="曼谷 Sukhumvit 55",
            monthly_rent=0,
            currency="THB",
            status=PropertyStatus.vacant,
        )
        s.add(prop)
        s.commit()
        s.refresh(prop)

        listing = SaleListing(
            owner_user_id=seller_owner_user.id,
            agent_user_id=agent.id,
            property_id=prop.id,
            title="Sukhumvit 55 两房待售",
            asking_price=5_500_000,
            currency="THB",
        )
        s.add(listing)
        s.commit()
        s.refresh(listing)

        deal = PropertyDeal(
            sales_user_id=agent.id,
            buyer_user_id=buyer.id,
            sale_listing_id=listing.id,
            property_id=prop.id,
            sale_price=5_200_000,
            currency="THB",
            status=PropertyDealStatus.drafted,
            agent_user_id=agent.id,
        )
        s.add(deal)
        s.commit()
        s.refresh(deal)

        escrow = Escrow(
            deal_id=deal.id,
            amount=520_000,
            currency="THB",
            status=EscrowStatus.deposited,
            deposited_at=datetime.utcnow(),
            handler_user_id=agent.id,
        )
        s.add(escrow)
        s.commit()
        s.refresh(escrow)
        return deal.id, escrow.id


# ------------------------------------------------------------ 成交读：list / get
def test_buyer_can_see_own_deal(api):
    buyer = api.mk_user(UserRole.tenant)
    seller = api.mk_user(UserRole.owner)
    agent = api.mk_user(UserRole.agent)
    stranger = api.mk_user(UserRole.tenant)
    deal_id, _ = _seed(
        api.engine, buyer=buyer, seller_owner_user=seller, agent=agent
    )

    r = api.login(buyer).get(f"/api/v1/property-deals/{deal_id}")
    assert r.status_code == 200, r.text
    assert r.json()["sale_price"] == 5_200_000


def test_stranger_cannot_read_deal(api):
    """无关用户读成交详情 → 404（此前 200 并回显成交价）。"""
    buyer = api.mk_user(UserRole.tenant)
    seller = api.mk_user(UserRole.owner)
    agent = api.mk_user(UserRole.agent)
    stranger = api.mk_user(UserRole.tenant)
    deal_id, _ = _seed(
        api.engine, buyer=buyer, seller_owner_user=seller, agent=agent
    )

    r = api.login(stranger).get(f"/api/v1/property-deals/{deal_id}")
    assert r.status_code == 404, r.text


def test_list_deals_isolated_per_user(api):
    """列表：买方能看到自己那笔；无关用户列表为空；员工全量。"""
    buyer = api.mk_user(UserRole.tenant)
    seller = api.mk_user(UserRole.owner)
    agent = api.mk_user(UserRole.agent)
    stranger = api.mk_user(UserRole.tenant)
    deal_id, _ = _seed(
        api.engine, buyer=buyer, seller_owner_user=seller, agent=agent
    )

    mine = api.login(buyer).get("/api/v1/property-deals")
    assert mine.status_code == 200, mine.text
    assert str(deal_id) in [d["id"] for d in mine.json()["items"]]

    theirs = api.login(stranger).get("/api/v1/property-deals")
    assert theirs.status_code == 200, theirs.text
    assert theirs.json()["items"] == []

    # 业主是卖方，也应能看到本人名下房源的成交
    as_seller = api.login(seller).get("/api/v1/property-deals")
    assert str(deal_id) in [d["id"] for d in as_seller.json()["items"]]

    admin = api.mk_user(UserRole.admin)
    all_deals = api.login(admin).get("/api/v1/property-deals")
    assert str(deal_id) in [d["id"] for d in all_deals.json()["items"]]


# ------------------------------------------------------------ 成交写：状态推进
def test_non_staff_cannot_update_deal_status(api):
    """非员工推进他人成交状态 → 403，且状态未变。"""
    buyer = api.mk_user(UserRole.tenant)
    seller = api.mk_user(UserRole.owner)
    agent = api.mk_user(UserRole.agent)
    stranger = api.mk_user(UserRole.tenant)
    deal_id, _ = _seed(
        api.engine, buyer=buyer, seller_owner_user=seller, agent=agent
    )

    r = api.login(stranger).patch(
        f"/api/v1/property-deals/{deal_id}/status",
        params={"status": "completed"},
    )
    assert r.status_code == 403, r.text

    # 买方也不能（状态推进是平台作业）
    r2 = api.login(buyer).patch(
        f"/api/v1/property-deals/{deal_id}/status",
        params={"status": "completed"},
    )
    assert r2.status_code == 403, r2.text

    with Session(api.engine) as s:
        deal = s.get(PropertyDeal, deal_id)
        assert deal.status == PropertyDealStatus.drafted, "越权请求不得改动状态"


def test_staff_can_update_deal_status(api):
    buyer = api.mk_user(UserRole.tenant)
    seller = api.mk_user(UserRole.owner)
    agent = api.mk_user(UserRole.agent)
    stranger = api.mk_user(UserRole.tenant)
    deal_id, _ = _seed(
        api.engine, buyer=buyer, seller_owner_user=seller, agent=agent
    )

    r = api.login(agent).patch(
        f"/api/v1/property-deals/{deal_id}/status",
        params={"status": "signed"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "signed"
    assert r.json()["signed_at"] is not None


def test_non_staff_cannot_create_deal(api):
    """非员工创建成交 → 403（此前无任何角色校验）。"""
    buyer = api.mk_user(UserRole.tenant)
    seller = api.mk_user(UserRole.owner)
    agent = api.mk_user(UserRole.agent)
    stranger = api.mk_user(UserRole.tenant)
    deal_id, _ = _seed(
        api.engine, buyer=buyer, seller_owner_user=seller, agent=agent
    )

    with Session(api.engine) as s:
        listing_id = s.get(PropertyDeal, deal_id).sale_listing_id

    r = api.login(stranger).post(
        "/api/v1/property-deals",
        json={
            "sale_listing_id": str(listing_id),
            "sale_price": 1_000_000,
            "currency": "THB",
        },
    )
    assert r.status_code == 403, r.text


# ------------------------------------------------------------ 定金托管
def test_escrow_visible_to_deal_parties_only(api):
    """定金金额：当事方可见，无关用户 404（此前任意登录用户都能读）。"""
    buyer = api.mk_user(UserRole.tenant)
    seller = api.mk_user(UserRole.owner)
    agent = api.mk_user(UserRole.agent)
    stranger = api.mk_user(UserRole.tenant)
    deal_id, escrow_id = _seed(
        api.engine, buyer=buyer, seller_owner_user=seller, agent=agent
    )

    ok = api.login(buyer).get(f"/api/v1/property-deals/escrows/{deal_id}")
    assert ok.status_code == 200, ok.text
    assert ok.json()[0]["amount"] == 520_000

    bad = api.login(stranger).get(f"/api/v1/property-deals/escrows/{deal_id}")
    assert bad.status_code == 404, bad.text


def test_non_staff_cannot_create_escrow(api):
    """非员工登记定金托管 → 403。"""
    buyer = api.mk_user(UserRole.tenant)
    seller = api.mk_user(UserRole.owner)
    agent = api.mk_user(UserRole.agent)
    stranger = api.mk_user(UserRole.tenant)
    deal_id, _ = _seed(
        api.engine, buyer=buyer, seller_owner_user=seller, agent=agent
    )

    r = api.login(stranger).post(
        "/api/v1/property-deals/escrows",
        json={"deal_id": str(deal_id), "amount": 1, "currency": "THB"},
    )
    assert r.status_code == 403, r.text

    with Session(api.engine) as s:
        assert len(s.exec(select(Escrow)).all()) == 1, "越权请求不得新增定金记录"


def test_release_refund_require_staff(api):
    """放款 / 退款定金限员工。"""
    buyer = api.mk_user(UserRole.tenant)
    seller = api.mk_user(UserRole.owner)
    agent = api.mk_user(UserRole.agent)
    stranger = api.mk_user(UserRole.tenant)
    _, escrow_id = _seed(
        api.engine, buyer=buyer, seller_owner_user=seller, agent=agent
    )

    assert (
        api.login(buyer)
        .post(f"/api/v1/property-deals/escrows/{escrow_id}/release")
        .status_code
        == 403
    )
    assert (
        api.login(stranger)
        .post(f"/api/v1/property-deals/escrows/{escrow_id}/refund")
        .status_code
        == 403
    )
    assert (
        api.login(agent)
        .post(f"/api/v1/property-deals/escrows/{escrow_id}/release")
        .status_code
        == 200
    )


# ------------------------------------------------------------ 按揭：不得替他人申请
def test_non_staff_mortgage_buyer_is_forced_to_self(api):
    """非员工提交按揭时，payload 里的 buyer_user_id 被忽略，一律记为本人。"""
    buyer = api.mk_user(UserRole.tenant)
    seller = api.mk_user(UserRole.owner)
    agent = api.mk_user(UserRole.agent)
    victim = api.mk_user(UserRole.tenant)
    deal_id, _ = _seed(
        api.engine, buyer=buyer, seller_owner_user=seller, agent=agent
    )

    r = api.login(buyer).post(
        "/api/v1/property-deals/mortgages",
        json={
            "deal_id": str(deal_id),
            "buyer_user_id": str(victim.id),  # 试图替他人申请
            "bank": "KBANK",
            "loan_amount": 3_000_000,
            "currency": "THB",
        },
    )
    assert r.status_code == 200, r.text

    mine = api.login(buyer).get("/api/v1/property-deals/mortgages/mine")
    assert len(mine.json()) == 1, "应记在本人名下"

    victim_view = api.login(victim).get("/api/v1/property-deals/mortgages/mine")
    assert victim_view.json() == [], "不得替他人发起按揭"
