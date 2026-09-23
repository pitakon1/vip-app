"""真房源保鲜回归测试（对标贝壳「真房源验真」）。

覆盖：
- 保鲜状态机（unverified → verified → pending → expired，以及复验复活）；
- `record_verification` 的副作用（unavailable 下架、unreachable 只降权不下架）；
- `expire_due_listings` 只动对外可见的单，不碰已租/已售/已下架；
- 公开房源接口的保鲜硬约束：**到期房源立刻从 C 端消失**（不依赖 worker 是否存活）；
- 公开接口的徽标字段可匿名获取，且不泄露核验人/证据等内部数据。
"""

import pathlib
import sys
import uuid
from datetime import datetime, timedelta

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
    Listing,
    ListingStatus,
    ListingType,
    Owner,
    Property,
    PropertyStatus,
    PropertyVerification,
    PublisherType,
    User,
    UserRole,
    VerificationMethod,
    VerificationResult,
)
from app.services import freshness_service  # noqa: E402


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


def _seed_listing(engine, *, publisher_user, status=ListingStatus.active, **listing_kw):
    """建一套 (Owner, Property, Listing)，返回 (property_id, listing_id)。"""
    with Session(engine) as s:
        owner = Owner(user_id=publisher_user.id)
        s.add(owner)
        s.commit()
        s.refresh(owner)
        prop = Property(
            owner_id=owner.id,
            room_number=listing_kw.pop("room_number", "B-0808"),
            address="曼谷 Rama 9",
            monthly_rent=28_000,
            currency="THB",
            status=PropertyStatus.vacant,
        )
        s.add(prop)
        s.commit()
        s.refresh(prop)
        listing = Listing(
            property_id=prop.id,
            listing_type=ListingType.rent,
            publisher=PublisherType.owner,
            publisher_user_id=publisher_user.id,
            owner_id=owner.id,
            status=status,
            monthly_rent=28_000,
            currency="THB",
            **listing_kw,
        )
        s.add(listing)
        s.commit()
        s.refresh(listing)
        return prop.id, listing.id


# ============================================================ 状态机
def test_state_machine_transitions():
    """unverified → verified → pending → expired，边界按时间戳算出来。"""
    now = datetime(2026, 9, 23, 12, 0, 0)

    fresh = Listing(property_id=uuid.uuid4(), status=ListingStatus.active)
    assert (
        freshness_service.refresh_listing_verification_state(fresh, now=now)
        == "unverified"
    )

    verified = Listing(
        property_id=uuid.uuid4(),
        status=ListingStatus.active,
        last_verified_at=now,
        next_revalidate_at=now + timedelta(days=30),
    )
    assert (
        freshness_service.refresh_listing_verification_state(verified, now=now)
        == "verified"
    )

    # 进入 7 天窗口 → pending（仍展示，但降权）
    verified.next_revalidate_at = now + timedelta(days=5)
    assert (
        freshness_service.refresh_listing_verification_state(verified, now=now)
        == "pending"
    )

    # 到期 → expired
    verified.next_revalidate_at = now - timedelta(seconds=1)
    assert (
        freshness_service.refresh_listing_verification_state(verified, now=now)
        == "expired"
    )


def test_compute_next_due_respects_ttl():
    base = datetime(2026, 1, 1, 0, 0, 0)
    assert freshness_service.compute_next_due(base) == base + timedelta(days=30)
    assert freshness_service.compute_next_due(base, 7) == base + timedelta(days=7)
    # 非法 ttl 至少按 1 天，避免 0 天导致立刻过期
    assert freshness_service.compute_next_due(base, 0) == base + timedelta(days=1)


def test_listing_freshness_payload(engine):
    pub = _mk_user(engine)
    _, listing_id = _seed_listing(engine, publisher_user=pub)
    with Session(engine) as s:
        listing = s.get(Listing, listing_id)
        payload = freshness_service.listing_freshness_payload(listing)
        assert payload["verification_status"] == "unverified"
        assert payload["is_listable"] is False
        assert payload["days_left"] is None


# ============================================================ record_verification
def test_record_verification_sets_listing_fields(engine):
    pub = _mk_user(engine)
    prop_id, listing_id = _seed_listing(engine, publisher_user=pub)
    agent = _mk_user(engine, UserRole.agent)

    with Session(engine) as s:
        record = freshness_service.record_verification(
            s,
            property_id=prop_id,
            listing_id=listing_id,
            method=VerificationMethod.on_site,
            result=VerificationResult.verified,
            verified_by_user_id=agent.id,
            evidence={"photos": ["a.jpg"], "price_seen": 28_000},
        )
        assert record.next_due_at > record.verified_at

        listing = s.get(Listing, listing_id)
        assert listing.verification_status == "verified"
        assert listing.last_verified_at is not None
        assert listing.next_revalidate_at == record.next_due_at
        assert listing.status == ListingStatus.active


def test_unavailable_closes_the_listing(engine):
    """房东说已租出 → 立即下架，而不是继续挂着钓线索。"""
    pub = _mk_user(engine)
    prop_id, listing_id = _seed_listing(engine, publisher_user=pub)
    agent = _mk_user(engine, UserRole.agent)

    with Session(engine) as s:
        freshness_service.record_verification(
            s,
            property_id=prop_id,
            listing_id=listing_id,
            method=VerificationMethod.owner_confirm,
            result=VerificationResult.unavailable,
            verified_by_user_id=agent.id,
        )
        listing = s.get(Listing, listing_id)
        assert listing.status == ListingStatus.closed


def test_unreachable_downgrades_but_does_not_close(engine):
    """联系不上房东不等于房源没了，不许直接下架，转为短保鲜期待复验。"""
    pub = _mk_user(engine)
    prop_id, listing_id = _seed_listing(engine, publisher_user=pub)
    agent = _mk_user(engine, UserRole.agent)

    with Session(engine) as s:
        record = freshness_service.record_verification(
            s,
            property_id=prop_id,
            listing_id=listing_id,
            method=VerificationMethod.owner_confirm,
            result=VerificationResult.unreachable,
            verified_by_user_id=agent.id,
        )
        listing = s.get(Listing, listing_id)
        assert listing.status == ListingStatus.active
        assert listing.verification_status == "pending"
        ttl = (record.next_due_at - record.verified_at).days
        assert ttl == freshness_service.UNREACHABLE_TTL_DAYS


def test_reverify_resurrects_expired_listing(engine):
    """过期被自动下架后，复验通过要能重新上架，否则房源会永远沉底。"""
    pub = _mk_user(engine)
    prop_id, listing_id = _seed_listing(engine, publisher_user=pub)
    agent = _mk_user(engine, UserRole.agent)

    with Session(engine) as s:
        listing = s.get(Listing, listing_id)
        listing.status = ListingStatus.expired
        listing.verification_status = "expired"
        listing.expired_at = datetime.utcnow()
        listing.next_revalidate_at = datetime.utcnow() - timedelta(days=1)
        s.add(listing)
        s.commit()

        freshness_service.record_verification(
            s,
            property_id=prop_id,
            listing_id=listing_id,
            method=VerificationMethod.on_site,
            result=VerificationResult.verified,
            verified_by_user_id=agent.id,
        )
        s.refresh(listing)
        assert listing.status == ListingStatus.active
        assert listing.expired_at is None
        assert listing.verification_status == "verified"


# ============================================================ expire_due_listings
def test_expire_due_only_touches_visible_listings(engine):
    pub = _mk_user(engine)
    now = datetime.utcnow()
    past = now - timedelta(days=1)

    _, expiring = _seed_listing(engine, publisher_user=pub, room_number="C-01")
    _, already_rented = _seed_listing(
        engine,
        publisher_user=pub,
        room_number="C-02",
        status=ListingStatus.rented,
    )
    _, no_deadline = _seed_listing(engine, publisher_user=pub, room_number="C-03")

    with Session(engine) as s:
        for lid in (expiring, already_rented):
            row = s.get(Listing, lid)
            row.next_revalidate_at = past
            row.last_verified_at = past - timedelta(days=30)
            s.add(row)
        s.commit()

        expired = freshness_service.expire_due_listings(s, now=now)
        expired_ids = {item.id for item in expired}
        assert expiring in expired_ids
        assert already_rented not in expired_ids, "已租的单不该被保鲜任务改写"
        assert no_deadline not in expired_ids, "未纳入保鲜的单不受影响"

        assert s.get(Listing, expiring).status == ListingStatus.expired
        assert s.get(Listing, expiring).verification_status == "expired"
        assert s.get(Listing, already_rented).status == ListingStatus.rented


def test_expire_due_is_idempotent(engine):
    pub = _mk_user(engine)
    _, listing_id = _seed_listing(engine, publisher_user=pub)
    now = datetime.utcnow()
    with Session(engine) as s:
        row = s.get(Listing, listing_id)
        row.next_revalidate_at = now - timedelta(days=1)
        s.add(row)
        s.commit()

        first = freshness_service.expire_due_listings(s, now=now)
        second = freshness_service.expire_due_listings(s, now=now)
        assert len(first) == 1
        assert second == [], "第二次运行不该重复处理"


def test_freshness_summary_counts(engine):
    pub = _mk_user(engine)
    now = datetime.utcnow()
    _, verified_id = _seed_listing(engine, publisher_user=pub, room_number="D-01")
    _, expired_id = _seed_listing(engine, publisher_user=pub, room_number="D-02")

    with Session(engine) as s:
        ok = s.get(Listing, verified_id)
        ok.last_verified_at = now
        ok.next_revalidate_at = now + timedelta(days=30)
        ok.verification_status = "verified"
        s.add(ok)
        bad = s.get(Listing, expired_id)
        bad.last_verified_at = now - timedelta(days=40)
        bad.next_revalidate_at = now - timedelta(days=10)
        bad.verification_status = "expired"
        s.add(bad)
        s.commit()

        summary = freshness_service.freshness_summary(s, now=now)
        assert summary["total"] == 2
        assert summary["by_status"]["verified"] == 1
        assert summary["by_status"]["expired"] == 1
        assert summary["action_required"] == 1


# ============================================================ HTTP + 公开接口
def _mk_user(engine, role=UserRole.tenant):
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


def test_non_staff_cannot_record_verification(api):
    pub = api.mk_user(UserRole.tenant)
    agent = api.mk_user(UserRole.agent)
    prop_id, listing_id = _seed_listing(api.engine, publisher_user=pub)

    r = api.login(pub).post(
        "/api/v1/verifications",
        json={
            "property_id": str(prop_id),
            "listing_id": str(listing_id),
            "method": "on_site",
            "result": "verified",
        },
    )
    assert r.status_code == 403, r.text
    with Session(api.engine) as s:
        assert s.exec(select(PropertyVerification)).all() == []


def test_staff_records_verification_and_history(api):
    pub = api.mk_user(UserRole.tenant)
    agent = api.mk_user(UserRole.agent)
    prop_id, listing_id = _seed_listing(api.engine, publisher_user=pub)

    client = api.login(agent)
    r = client.post(
        "/api/v1/verifications",
        json={
            "property_id": str(prop_id),
            "listing_id": str(listing_id),
            "method": "on_site",
            "result": "verified",
            "evidence": {"photos": ["p1.jpg"]},
        },
    )
    assert r.status_code == 200, r.text
    assert r.json()["result"] == "verified"

    hist = client.get(f"/api/v1/verifications/listings/{listing_id}/history")
    assert hist.status_code == 200, hist.text
    assert len(hist.json()) == 1

    # 房源与上架单不匹配 → 400，避免核验记录挂到别人房上
    _, other_listing = _seed_listing(api.engine, publisher_user=pub, room_number="E-99")
    bad = client.post(
        "/api/v1/verifications",
        json={
            "property_id": str(prop_id),
            "listing_id": str(other_listing),
            "method": "on_site",
            "result": "verified",
        },
    )
    assert bad.status_code == 400, bad.text


def test_queue_and_admin_expire(api):
    pub = api.mk_user(UserRole.tenant)
    agent = api.mk_user(UserRole.agent)
    admin = api.mk_user(UserRole.admin)
    _, listing_id = _seed_listing(api.engine, publisher_user=pub)
    now = datetime.utcnow()
    with Session(api.engine) as s:
        row = s.get(Listing, listing_id)
        row.last_verified_at = now - timedelta(days=40)
        row.next_revalidate_at = now - timedelta(days=10)
        s.add(row)
        s.commit()

    # 非员工看不了队列
    assert api.login(pub).get("/api/v1/verifications/queue").status_code == 403

    queue = api.login(agent).get("/api/v1/verifications/queue")
    assert queue.status_code == 200, queue.text
    assert queue.json()[0]["listing_id"] == str(listing_id)
    assert queue.json()[0]["verification_status"] == "expired"

    # 非管理员不能手动跑批量
    assert api.login(agent).post("/api/v1/verifications/expire-due").status_code == 403
    run = api.login(admin).post("/api/v1/verifications/expire-due")
    assert run.status_code == 200, run.text
    assert run.json()["expired"] == 1


def test_public_listing_hides_expired_and_exposes_badge(api):
    """C 端硬约束：保鲜到期的房源立刻消失；未到期房源带「已核验」徽标。"""
    pub = api.mk_user(UserRole.tenant)
    agent = api.mk_user(UserRole.agent)
    prop_ok, listing_ok = _seed_listing(api.engine, publisher_user=pub, room_number="F-01")
    _, listing_expired = _seed_listing(
        api.engine, publisher_user=pub, room_number="F-02"
    )

    now = datetime.utcnow()
    with Session(api.engine) as s:
        ok = s.get(Listing, listing_ok)
        ok.last_verified_at = now
        ok.next_revalidate_at = now + timedelta(days=30)
        ok.verification_status = "verified"
        s.add(ok)
        # 状态仍是 active，但保鲜已过期——不依赖 Celery 就该被隐藏
        late = s.get(Listing, listing_expired)
        late.last_verified_at = now - timedelta(days=40)
        late.next_revalidate_at = now - timedelta(days=10)
        s.add(late)
        s.commit()

    listing_page = api.login(agent).get("/api/v1/public/listings")
    assert listing_page.status_code == 200, listing_page.text
    ids = [item["id"] for item in listing_page.json()["items"]]
    assert str(listing_ok) in ids
    assert str(listing_expired) not in ids, "保鲜过期房源不得出现在公开列表"

    card = next(i for i in listing_page.json()["items"] if i["id"] == str(listing_ok))
    assert card["verification_status"] == "verified"
    assert card["verified_days_ago"] == 0

    # 被隐藏的房源详情也拿不到
    detail = api.login(agent).get(f"/api/v1/public/listings/{listing_expired}")
    assert detail.status_code == 404, detail.text

    # 徽标里不含核验人/证据等内部字段
    ok_detail = api.login(agent).get(f"/api/v1/public/listings/{listing_ok}")
    assert ok_detail.status_code == 200, ok_detail.text
    body = ok_detail.json()
    assert body["verification_status"] == "verified"
    assert "verified_by_user_id" not in body
    assert "evidence" not in body
