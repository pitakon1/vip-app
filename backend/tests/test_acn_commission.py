"""ACN 贡献度分佣回归测试（对标贝壳 ACN）。

覆盖三层：
1. **纯函数分佣算法** `compute_split`：权重归一化、角色缺失、显式比例覆盖、
   四舍五入漂移修正（分佣总额必须与佣金总额一分不差）。
2. **持久层** `grant_contribution` 幂等、`revoke_contribution` 留痕、
   `apply_plan_to_split_deals` 幂等且已支付单不被覆盖。
3. **HTTP 层** 写动作限员工；非利益相关方读不到分佣（租客也不许）。
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
    ACNRole,
    DEFAULT_ROLE_WEIGHTS,
    Owner,
    Property,
    PropertyContribution,
    PropertyDeal,
    PropertyDealStatus,
    PropertyStatus,
    SaleListing,
    SplitDeal,
    User,
    UserRole,
    actor_key_of,
)
from app.services import acn_service  # noqa: E402


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


def _stub(role, *, user_id=None, partner_id=None, weight=0.0, share_rate=None, status="active"):
    """构造一条未落库的贡献对象（纯函数测试用）。"""
    uid = user_id or uuid.uuid4()
    return PropertyContribution(
        property_id=uuid.uuid4(),
        role=role,
        user_id=uid,
        partner_id=partner_id,
        actor_key=actor_key_of(uid, partner_id),
        weight=weight,
        share_rate=share_rate,
        status=status,
    )


# ============================================================ 1. 纯函数层
def test_actor_key_requires_one_subject():
    uid = uuid.uuid4()
    assert actor_key_of(user_id=uid) == f"user:{uid}"
    assert actor_key_of(partner_id=uid) == f"partner:{uid}"
    with pytest.raises(ValueError):
        actor_key_of()


def test_split_default_weights_sum_to_100():
    """七个角色全部就位时，比例恰好 100%，金额恰好等于佣金总额。"""
    contributions = [_stub(ACNRole(r)) for r in DEFAULT_ROLE_WEIGHTS]
    result = acn_service.compute_split(contributions, 10_000)

    assert result["participant_count"] == 7
    assert abs(sum(e["share_rate"] for e in result["entries"]) - 100) < 1e-6
    assert abs(sum(e["amount"] for e in result["entries"]) - 10_000) < 1e-9


def test_split_normalizes_when_roles_missing():
    """只填 4 个角色时，剩余角色权重不丢，按现有角色归一化仍摊满 100%。"""
    contributions = [
        _stub(ACNRole.lister),
        _stub(ACNRole.maintainer),
        _stub(ACNRole.customer_agent),
        _stub(ACNRole.closer),
    ]
    result = acn_service.compute_split(contributions, 6_000)

    total_rate = sum(e["share_rate"] for e in result["entries"])
    assert abs(total_rate - 100) < 1e-6
    assert abs(sum(e["amount"] for e in result["entries"]) - 6_000) < 1e-9
    # 客源方默认权重最高，应拿到最大份额
    top = max(result["entries"], key=lambda e: e["amount"])
    assert top["role"] == ACNRole.customer_agent.value


def test_split_multiple_actors_share_one_role():
    """同一角色多人共同贡献：按权重分成，不互相覆盖。"""
    contributions = [
        _stub(ACNRole.customer_agent, weight=20),
        _stub(ACNRole.customer_agent, weight=10),
        _stub(ACNRole.maintainer, weight=70),
    ]
    result = acn_service.compute_split(contributions, 3_000)
    agents = [e for e in result["entries"] if e["role"] == ACNRole.customer_agent.value]
    assert len(agents) == 2
    assert agents[0]["amount"] > agents[1]["amount"]
    assert abs(sum(e["amount"] for e in result["entries"]) - 3_000) < 1e-9


def test_split_explicit_share_rate_overrides_weight():
    """显式比例优先：说好客源方 50%，就真拿 50%，其余按权重分剩下的 50%。"""
    contributions = [
        _stub(ACNRole.customer_agent, share_rate=50),
        _stub(ACNRole.lister),
        _stub(ACNRole.maintainer),
    ]
    result = acn_service.compute_split(contributions, 10_000)
    by_role = {e["role"]: e for e in result["entries"]}

    assert by_role[ACNRole.customer_agent.value]["share_rate"] == 50.0
    assert by_role[ACNRole.customer_agent.value]["amount"] == 5_000.0
    assert by_role[ACNRole.customer_agent.value]["explicit"] is True
    assert abs(sum(e["amount"] for e in result["entries"]) - 10_000) < 1e-9


def test_split_rejects_over_allocated_explicit_rates():
    contributions = [
        _stub(ACNRole.customer_agent, share_rate=60),
        _stub(ACNRole.lister, share_rate=50),
    ]
    with pytest.raises(ValueError):
        acn_service.compute_split(contributions, 1_000)


def test_split_fixes_rounding_drift():
    """1000 分给 3 人无法整除，漂移必须补回最大的一笔，总额零误差。"""
    contributions = [
        _stub(ACNRole.lister, weight=1),
        _stub(ACNRole.maintainer, weight=1),
        _stub(ACNRole.closer, weight=1),
    ]
    result = acn_service.compute_split(contributions, 1_000)
    assert abs(sum(e["amount"] for e in result["entries"]) - 1_000) < 1e-9


def test_split_requires_contributions():
    with pytest.raises(acn_service.NoContributionError):
        acn_service.compute_split([], 1_000)


def test_revoked_contribution_excluded():
    contributions = [
        _stub(ACNRole.lister),
        _stub(ACNRole.closer, status="revoked"),
    ]
    result = acn_service.compute_split(contributions, 1_000)
    roles = [e["role"] for e in result["entries"]]
    assert ACNRole.closer.value not in roles
    assert abs(sum(e["amount"] for e in result["entries"]) - 1_000) < 1e-9


# ============================================================ 2. 持久层
def _seed_property(engine, owner_user) -> uuid.UUID:
    with Session(engine) as s:
        owner = Owner(user_id=owner_user.id)
        s.add(owner)
        s.commit()
        s.refresh(owner)
        prop = Property(
            owner_id=owner.id,
            room_number="A-1201",
            address="曼谷 Sukhumvit 33",
            monthly_rent=35_000,
            currency="THB",
            status=PropertyStatus.rented,
        )
        s.add(prop)
        s.commit()
        s.refresh(prop)
        return prop.id


def test_grant_contribution_is_idempotent(engine):
    """同一 (房源, 角色, 主体) 重复登记只留一行，否则分佣金额会凭空翻倍。"""
    owner_user = api_user(engine)
    prop_id = _seed_property(engine, owner_user)
    broker = api_user(engine)

    with Session(engine) as s:
        first = acn_service.grant_contribution(
            s, prop_id, ACNRole.lister, user_id=broker.id, weight=15
        )
        second = acn_service.grant_contribution(
            s, prop_id, ACNRole.lister, user_id=broker.id, weight=25
        )
        assert first.id == second.id
        rows = s.exec(
            select(PropertyContribution).where(
                PropertyContribution.property_id == prop_id
            )
        ).all()
        assert len(rows) == 1
        assert rows[0].weight == 25


def test_grant_contribution_requires_single_subject(engine):
    owner_user = api_user(engine)
    prop_id = _seed_property(engine, owner_user)
    broker = api_user(engine)
    partner_id = uuid.uuid4()

    with Session(engine) as s:
        with pytest.raises(acn_service.ContributionConflictError):
            acn_service.grant_contribution(s, prop_id, ACNRole.lister)
        with pytest.raises(acn_service.ContributionConflictError):
            acn_service.grant_contribution(
                s, prop_id, ACNRole.lister, user_id=broker.id, partner_id=partner_id
            )


def test_revoke_keeps_row_and_drops_from_split(engine):
    owner_user = api_user(engine)
    prop_id = _seed_property(engine, owner_user)
    broker = api_user(engine)
    other = api_user(engine)

    with Session(engine) as s:
        keep = acn_service.grant_contribution(
            s, prop_id, ACNRole.lister, user_id=broker.id
        )
        drop = acn_service.grant_contribution(
            s, prop_id, ACNRole.closer, user_id=other.id
        )
        acn_service.revoke_contribution(s, drop.id)

        rows = s.exec(
            select(PropertyContribution).where(
                PropertyContribution.property_id == prop_id
            )
        ).all()
        assert len(rows) == 2, "撤销是留痕不是删行"
        active = acn_service.active_contributions(s, prop_id)
        assert [c.id for c in active] == [keep.id]

        result = acn_service.compute_split(active, 1_000)
        assert [e["role"] for e in result["entries"]] == [ACNRole.lister.value]


def test_split_plan_and_split_deals_are_idempotent(engine):
    """落库方案 → 生成 SplitDeal；重复 apply 不产生重复应付款项。"""
    owner_user = api_user(engine)
    prop_id = _seed_property(engine, owner_user)
    broker = api_user(engine)
    agent = api_user(engine)

    with Session(engine) as s:
        acn_service.grant_contribution(s, prop_id, ACNRole.lister, user_id=broker.id)
        acn_service.grant_contribution(s, prop_id, ACNRole.closer, user_id=agent.id)

        listing = SaleListing(
            agent_user_id=agent.id,
            title="Sukhumvit 33 一房",
            asking_price=6_000_000,
            currency="THB",
        )
        s.add(listing)
        s.commit()
        s.refresh(listing)
        deal = PropertyDeal(
            sale_listing_id=listing.id,
            property_id=prop_id,
            sale_price=5_800_000,
            currency="THB",
            status=PropertyDealStatus.signed,
            agent_user_id=agent.id,
        )
        s.add(deal)
        s.commit()
        s.refresh(deal)
        deal_id = deal.id

        plan = acn_service.split_plan_for_property(
            s, prop_id, 174_000, deal_id=deal_id
        )
        assert plan.status == "draft"
        assert abs(sum(e["amount"] for e in plan.entries) - 174_000) < 1e-9

        first = acn_service.apply_plan_to_split_deals(s, plan, deal_id=deal_id)
        assert len(first) == 2
        assert plan.status == "applied"

        second = acn_service.apply_plan_to_split_deals(s, plan, deal_id=deal_id)
        rows = s.exec(select(SplitDeal).where(SplitDeal.deal_id == deal_id)).all()
        assert len(rows) == 2, "重复 apply 不得重复插入"
        assert {r.id for r in second} == {r.id for r in first}
        assert abs(sum(r.split_amount for r in rows) - 174_000) < 1e-9


def test_paid_split_deal_not_overwritten(engine):
    """已支付的拆分单是财务事实，重算不得覆盖金额。"""
    owner_user = api_user(engine)
    prop_id = _seed_property(engine, owner_user)
    broker = api_user(engine)

    with Session(engine) as s:
        acn_service.grant_contribution(s, prop_id, ACNRole.lister, user_id=broker.id)
        listing = SaleListing(
            agent_user_id=broker.id, title="x", asking_price=1_000_000, currency="THB"
        )
        s.add(listing)
        s.commit()
        s.refresh(listing)
        deal = PropertyDeal(
            sale_listing_id=listing.id,
            property_id=prop_id,
            sale_price=1_000_000,
            status=PropertyDealStatus.signed,
        )
        s.add(deal)
        s.commit()
        s.refresh(deal)

        plan = acn_service.split_plan_for_property(s, prop_id, 30_000, deal_id=deal.id)
        rows = acn_service.apply_plan_to_split_deals(s, plan, deal_id=deal.id)
        row = rows[0]
        row.status = "paid"
        s.add(row)
        s.commit()

        # 重算：金额不同，但已支付行不该被改
        plan2 = acn_service.split_plan_for_property(s, prop_id, 60_000, deal_id=deal.id)
        acn_service.apply_plan_to_split_deals(s, plan2, deal_id=deal.id)
        s.refresh(row)
        assert row.status == "paid"
        assert row.split_amount == rows[0].split_amount


# ============================================================ 3. HTTP 层
def api_user(engine, role=UserRole.agent):
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


def test_roles_dictionary_available_to_any_logged_in_user(api):
    tenant = api.mk_user(UserRole.tenant)
    r = api.login(tenant).get("/api/v1/acn/roles")
    assert r.status_code == 200, r.text
    values = {item["value"] for item in r.json()}
    assert ACNRole.customer_agent.value in values
    assert all(item["default_weight"] >= 0 for item in r.json())


def test_non_staff_cannot_grant_contribution(api):
    tenant = api.mk_user(UserRole.tenant)
    owner_user = api.mk_user(UserRole.owner)
    prop_id = _seed_property(api.engine, owner_user)

    r = api.login(tenant).post(
        f"/api/v1/acn/properties/{prop_id}/contributions",
        json={"role": "lister", "user_id": str(tenant.id)},
    )
    assert r.status_code == 403, r.text

    with Session(api.engine) as s:
        assert s.exec(select(PropertyContribution)).all() == []


def test_staff_grant_then_profile_shows_missing_roles(api):
    agent = api.mk_user(UserRole.agent)
    owner_user = api.mk_user(UserRole.owner)
    prop_id = _seed_property(api.engine, owner_user)
    broker = api.mk_user(UserRole.employee)

    client = api.login(agent)
    r = client.post(
        f"/api/v1/acn/properties/{prop_id}/contributions",
        json={"role": "lister", "user_id": str(broker.id)},
    )
    assert r.status_code == 200, r.text
    assert r.json()["role_label"] == "录入人"

    profile = client.get(f"/api/v1/acn/properties/{prop_id}/profile")
    assert profile.status_code == 200, profile.text
    body = profile.json()
    assert "lister" in body["covered_roles"]
    assert ACNRole.surveyor.value in body["missing_roles"]


def test_tenant_cannot_read_acn_profile(api):
    """租客虽能浏览房源详情，但分佣比例属资金信息，绝不能读到。"""
    agent = api.mk_user(UserRole.agent)
    owner_user = api.mk_user(UserRole.owner)
    prop_id = _seed_property(api.engine, owner_user)

    with Session(api.engine) as s:
        acn_service.grant_contribution(
            s, prop_id, ACNRole.customer_agent, user_id=agent.id, share_rate=40
        )

    tenant = api.mk_user(UserRole.tenant)
    r = api.login(tenant).get(f"/api/v1/acn/properties/{prop_id}/profile")
    assert r.status_code == 404, r.text

    # 该租客若是贡献者本人，则可以读自己的
    with Session(api.engine) as s:
        acn_service.grant_contribution(
            s, prop_id, ACNRole.key_holder, user_id=tenant.id
        )
    r2 = api.login(tenant).get(f"/api/v1/acn/properties/{prop_id}/profile")
    assert r2.status_code == 200, r2.text


def test_preview_split_conflicts_without_contribution(api):
    agent = api.mk_user(UserRole.agent)
    owner_user = api.mk_user(UserRole.owner)
    prop_id = _seed_property(api.engine, owner_user)

    r = api.login(agent).post(
        "/api/v1/acn/split-plans/preview",
        json={"property_id": str(prop_id), "commission_total": 50_000},
    )
    assert r.status_code == 409, r.text
