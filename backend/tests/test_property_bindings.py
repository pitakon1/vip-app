"""房产自助绑定申请 / 审核 API 测试。

覆盖：附件上传校验、提交申请、待审唯一、后台队列、驳回+通知+重新提交、
审核通过后自动建立 Owner 档案与房源、越权访问拒绝。
使用内存 SQLite + dependency_overrides，不触真实数据库。
"""

import pathlib
import sys
import uuid
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

BASE_DIR = pathlib.Path(__file__).resolve().parents[1]
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from app.core import auth as auth_module  # noqa: E402
from app.db import get_session  # noqa: E402
from app.main import app  # noqa: E402
from app.models import (  # noqa: E402
    Notification,
    Owner,
    Property,
    PropertyBinding,
    PropertyBindingStatus,
    User,
    UserRole,
)

PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"0" * 128


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
    created_sessions = []

    def _mk_user(role=UserRole.tenant):
        with Session(engine) as s:
            u = User(
                email=f"{uuid.uuid4().hex[:12]}@test.com",
                hashed_password="x",
                full_name=f"用户-{role.value}",
                phone="0800000000",
                role=role,
            )
            s.add(u)
            s.commit()
            s.refresh(u)
            return u

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


def _upload(client: TestClient) -> dict:
    res = client.post(
        "/api/v1/property-bindings/attachments",
        files={"file": ("proof.png", PNG_BYTES, "image/png")},
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["url"].startswith("/uploads/property_bindings/")
    return data


def _payload(attachment: dict, address: str = "Sukhumvit 24", room: str = "A-1201") -> dict:
    return {
        "address": address,
        "room_number": room,
        "size_sqm": 68.5,
        "property_type": "apartment",
        "note": "本人房产",
        "attachments": [attachment],
    }


def _cleanup(urls):
    from app.api.v1.property_bindings import UPLOAD_DIR

    for url in urls:
        (UPLOAD_DIR / pathlib.Path(url).name).unlink(missing_ok=True)


def test_upload_attachment_rejects_bad_type(api):
    tenant = api.mk_user()
    client = api.login(tenant)
    res = client.post(
        "/api/v1/property-bindings/attachments",
        files={"file": ("evil.exe", b"MZ....", "application/octet-stream")},
    )
    assert res.status_code == 400


def test_binding_flow_approve_creates_owner_property_and_notification(api):
    tenant = api.mk_user()
    admin = api.mk_user(UserRole.admin)
    urls = []

    client = api.login(tenant)
    attachment = _upload(client)
    urls.append(attachment["url"])

    created = client.post("/api/v1/property-bindings", json=_payload(attachment))
    assert created.status_code == 200, created.text
    binding = created.json()
    assert binding["status"] == "pending"
    assert binding["applicant_email"] == tenant.email

    # 待审期间重复提交 → 409
    dup = client.post("/api/v1/property-bindings", json=_payload(attachment))
    assert dup.status_code == 409

    mine = client.get("/api/v1/property-bindings/me")
    assert mine.status_code == 200
    assert len(mine.json()) == 1

    # 另一个 C 端用户不能查看该申请
    other = api.login(api.mk_user())
    assert other.get(f"/api/v1/property-bindings/{binding['id']}").status_code == 403

    # 后台队列
    admin_client = api.login(admin)
    queue = admin_client.get("/api/v1/property-bindings", params={"status": "pending"})
    assert queue.status_code == 200
    assert queue.json()["total"] == 1

    # 附件鉴权下载：申请人可读，内容为上传字节
    download = client.get(f"/api/v1/property-bindings/{binding['id']}/attachments/0")
    assert download.status_code == 200
    assert download.content == PNG_BYTES

    approved = admin_client.post(
        f"/api/v1/property-bindings/{binding['id']}/approve", json={"note": "材料齐全"}
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "approved"
    assert approved.json()["property_id"]

    with Session(api.engine) as s:
        owner = s.exec(select(Owner).where(Owner.user_id == tenant.id)).first()
        assert owner is not None
        prop = s.get(Property, uuid.UUID(approved.json()["property_id"]))
        assert prop is not None and prop.owner_id == owner.id
        notes = s.exec(
            select(Notification).where(Notification.user_id == tenant.id)
        ).all()
        assert any(n.template_key == "property_binding_approved" for n in notes)

    # 审核通过后，租客身份也能在「我的房产」看到该房源（能力判权，而非角色）
    props = client.get("/api/v1/owners/me/properties")
    assert props.status_code == 200
    assert any(p["room_number"] == "A-1201" for p in props.json())

    _cleanup(urls)


def test_claim_existing_property_keeps_lease_listing_payment(api):
    """认领审核通过后只改归属，不新建房源；租约/挂牌/收款记录不断链。"""
    from datetime import datetime, timedelta

    from app.models import (
        Lease,
        LeaseStatus,
        Listing,
        ListingStatus,
        Payment,
        PaymentType,
        PropertyStatus,
        Tenant,
    )

    claimant = api.mk_user()
    previous_owner_user = api.mk_user()
    admin = api.mk_user(UserRole.admin)
    tenant_user = api.mk_user()

    with Session(api.engine) as s:
        owner = Owner(user_id=previous_owner_user.id)
        s.add(owner)
        s.flush()
        prop = Property(
            owner_id=owner.id,
            address="Sukhumvit 88",
            room_number="B-0901",
            size_sqm=70,
            property_type="apartment",
            status=PropertyStatus.vacant,
            created_by=previous_owner_user.id,
        )
        s.add(prop)
        s.flush()
        tenant_profile = Tenant(user_id=tenant_user.id)
        s.add(tenant_profile)
        s.flush()
        now = datetime.utcnow()
        lease = Lease(
            property_id=prop.id,
            tenant_id=tenant_profile.id,
            owner_id=owner.id,
            start_date=now - timedelta(days=30),
            end_date=now + timedelta(days=335),
            monthly_rent=20000,
            deposit_amount=40000,
            status=LeaseStatus.active,
        )
        s.add(lease)
        listing = Listing(
            property_id=prop.id,
            publisher_user_id=previous_owner_user.id,
            owner_id=owner.id,
            status=ListingStatus.active,
            monthly_rent=20000,
        )
        s.add(listing)
        s.flush()
        payment = Payment(
            property_id=prop.id,
            lease_id=lease.id,
            payer_id=tenant_user.id,
            amount=20000,
            payment_type=PaymentType.rent,
            idempotency_key=uuid.uuid4().hex,
        )
        s.add(payment)
        s.commit()
        prop_id, lease_id, listing_id, payment_id = (
            prop.id,
            lease.id,
            listing.id,
            payment.id,
        )

    client = api.login(claimant)
    # 匹配接口能命中该房源（房号一致 + 地址相似）
    matched = client.get(
        "/api/v1/property-bindings/match",
        params={"address": "Sukhumvit 88", "room_number": "B-0901"},
    )
    assert matched.status_code == 200, matched.text
    ids = [item["property_id"] for item in matched.json()["items"]]
    assert str(prop_id) in ids

    attachment = _upload(client)
    created = client.post(
        "/api/v1/property-bindings",
        json={
            "kind": "claim",
            "property_id": str(prop_id),
            "address": "Sukhumvit 88",
            "room_number": "B-0901",
            "size_sqm": 70,
            "property_type": "apartment",
            "note": "本人持有产权",
            "attachments": [attachment],
        },
    )
    assert created.status_code == 200, created.text
    binding = created.json()
    assert binding["kind"] == "claim"
    assert binding["matched_property_id"] == str(prop_id)

    admin_client = api.login(admin)
    approved = admin_client.post(
        f"/api/v1/property-bindings/{binding['id']}/approve",
        json={"note": "产权材料核验通过"},
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["property_id"] == str(prop_id)

    with Session(api.engine) as s:
        # 没有新建重复房源
        rows = s.exec(
            select(Property).where(Property.room_number == "B-0901")
        ).all()
        assert len(rows) == 1
        claimant_owner = s.exec(
            select(Owner).where(Owner.user_id == claimant.id)
        ).first()
        assert rows[0].owner_id == claimant_owner.id
        # 租约 / 挂牌 / 收款仍然挂在同一条房源记录上
        assert s.get(Lease, lease_id).property_id == prop_id
        assert s.get(Listing, listing_id).property_id == prop_id
        assert s.get(Payment, payment_id).property_id == prop_id

    props = client.get("/api/v1/owners/me/properties")
    assert props.status_code == 200
    assert any(p["room_number"] == "B-0901" for p in props.json())

    _cleanup([attachment["url"]])


def test_new_property_pending_invisible_and_not_listable(api):
    """业主自助录入：待审期间不对外展示/搜索/挂牌，通过后可见。"""
    owner_user = api.mk_user()
    other = api.mk_user()
    admin = api.mk_user(UserRole.admin)

    client = api.login(owner_user)
    created = client.post(
        "/api/v1/properties",
        json={
            "room_number": "C-0301",
            "address": "Rama 9 Road 99",
            "size_sqm": 55,
            "property_type": "apartment",
        },
    )
    assert created.status_code == 200, created.text
    prop = created.json()
    assert prop["review_status"] == "pending"
    prop_id = prop["id"]

    # 自己和其他 C 端用户都看不到待审房源
    assert client.get(f"/api/v1/properties/{prop_id}").status_code == 404
    other_client = api.login(other)
    listed = other_client.get("/api/v1/properties", params={"page_size": 100})
    assert listed.status_code == 200
    assert all(item["id"] != prop_id for item in listed.json()["items"])

    # 待审房源不能挂牌
    with Session(api.engine) as s:
        owner_row = s.exec(
            select(Owner).where(Owner.user_id == owner_user.id)
        ).first()
        owner_id = str(owner_row.id)
    listing = client.post(
        "/api/v1/listings",
        json={
            "property_id": prop_id,
            "owner_id": owner_id,
            "room_number": "C-0301",
            "address": "Rama 9 Road 99",
            "monthly_rent": 18000,
        },
    )
    assert listing.status_code == 409, listing.text

    # C 端录入自动生成一条待审申请，进入后台审核队列
    admin_client = api.login(admin)
    queue = admin_client.get(
        "/api/v1/property-bindings", params={"status": "pending"}
    )
    assert queue.status_code == 200, queue.text
    binding = next(
        item for item in queue.json()["items"] if item["property_id"] == prop_id
    )
    assert binding["kind"] == "new"

    approved = admin_client.post(
        f"/api/v1/property-bindings/{binding['id']}/approve",
        json={"note": "已核对业主资料"},
    )
    assert approved.status_code == 200, approved.text

    detail = client.get(f"/api/v1/properties/{prop_id}")
    assert detail.status_code == 200, detail.text
    assert detail.json()["review_status"] == "approved"


def test_claim_reassign_target_keeps_single_property(api):
    """审核改判：重新匹配后改选其他房源通过，只改该房源归属，不新建记录。"""
    from datetime import datetime, timedelta

    from app.models import (
        Lease,
        LeaseStatus,
        Listing,
        ListingStatus,
        PropertyStatus,
        Tenant,
    )

    claimant = api.mk_user()
    owner_a_user = api.mk_user()
    owner_b_user = api.mk_user()
    admin = api.mk_user(UserRole.admin)
    tenant_user = api.mk_user()

    with Session(api.engine) as s:
        owner_a = Owner(user_id=owner_a_user.id)
        owner_b = Owner(user_id=owner_b_user.id)
        s.add(owner_a)
        s.add(owner_b)
        s.flush()
        prop_a = Property(
            owner_id=owner_a.id,
            address="Sukhumvit 99",
            room_number="D-0801",
            size_sqm=60,
            property_type="apartment",
            status=PropertyStatus.vacant,
            created_by=owner_a_user.id,
        )
        prop_b = Property(
            owner_id=owner_b.id,
            address="Rama 9 Road 88",
            room_number="E-0701",
            size_sqm=80,
            property_type="apartment",
            status=PropertyStatus.vacant,
            created_by=owner_b_user.id,
        )
        s.add(prop_a)
        s.add(prop_b)
        s.flush()
        tenant_profile = Tenant(user_id=tenant_user.id)
        s.add(tenant_profile)
        s.flush()
        now = datetime.utcnow()
        lease = Lease(
            property_id=prop_b.id,
            tenant_id=tenant_profile.id,
            owner_id=owner_b.id,
            start_date=now - timedelta(days=10),
            end_date=now + timedelta(days=355),
            monthly_rent=25000,
            deposit_amount=50000,
            status=LeaseStatus.active,
        )
        s.add(lease)
        listing = Listing(
            property_id=prop_b.id,
            publisher_user_id=owner_b_user.id,
            owner_id=owner_b.id,
            status=ListingStatus.active,
            monthly_rent=25000,
        )
        s.add(listing)
        s.commit()
        prop_a_id, prop_b_id = prop_a.id, prop_b.id
        owner_a_id = owner_a.id
        lease_id, listing_id = lease.id, listing.id

    client = api.login(claimant)
    attachment = _upload(client)
    created = client.post(
        "/api/v1/property-bindings",
        json={
            "kind": "claim",
            "property_id": str(prop_a_id),
            "address": "Sukhumvit 99",
            "room_number": "D-0801",
            "size_sqm": 60,
            "property_type": "apartment",
            "attachments": [attachment],
        },
    )
    assert created.status_code == 200, created.text
    binding = created.json()
    assert binding["matched_property_id"] == str(prop_a_id)

    # 审核人员重新匹配：能看到候选房源及其当前归属（仅内部可见的字段）
    admin_client = api.login(admin)
    matched = admin_client.get(
        "/api/v1/property-bindings/match",
        params={"address": "Rama 9 Road 88", "room_number": "E-0701"},
    )
    assert matched.status_code == 200, matched.text
    candidate = next(
        item for item in matched.json()["items"] if item["property_id"] == str(prop_b_id)
    )
    assert candidate["owner_name"] == owner_b_user.full_name
    assert candidate["active_lease_count"] == 1
    assert candidate["active_listing_count"] == 1

    # 改判到 E-0701 后通过
    approved = admin_client.post(
        f"/api/v1/property-bindings/{binding['id']}/approve",
        json={"note": "核验后改判到 E-0701", "property_id": str(prop_b_id)},
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["matched_property_id"] == str(prop_b_id)
    assert approved.json()["property_id"] == str(prop_b_id)

    with Session(api.engine) as s:
        # 没有新建房源，原目标房源归属未被动
        assert len(s.exec(select(Property)).all()) == 2
        claimant_owner = s.exec(
            select(Owner).where(Owner.user_id == claimant.id)
        ).first()
        assert s.get(Property, prop_b_id).owner_id == claimant_owner.id
        assert s.get(Property, prop_a_id).owner_id == owner_a_id
        # 租约 / 挂牌仍挂在被改判的目标房源记录上
        assert s.get(Lease, lease_id).property_id == prop_b_id
        assert s.get(Listing, listing_id).property_id == prop_b_id

    # 重新以申请人身份登录（dependency_overrides 是全局的，上面已切到 admin）
    client = api.login(claimant)
    props = client.get("/api/v1/owners/me/properties")
    assert props.status_code == 200
    assert [p["room_number"] for p in props.json()] == ["E-0701"]

    _cleanup([attachment["url"]])


def test_claim_approve_rejects_pending_target(api):
    """改判不能指向待审房源（审核通过前不可作为认领目标）。"""
    from app.models import PropertyReviewStatus

    claimant = api.mk_user()
    admin = api.mk_user(UserRole.admin)
    other = api.mk_user()

    with Session(api.engine) as s:
        owner = Owner(user_id=other.id)
        s.add(owner)
        s.flush()
        approved_prop = Property(
            owner_id=owner.id,
            address="Phetchaburi 12",
            room_number="F-0101",
            property_type="apartment",
            created_by=other.id,
        )
        pending_prop = Property(
            owner_id=owner.id,
            address="Phetchaburi 14",
            room_number="F-0102",
            property_type="apartment",
            created_by=other.id,
            review_status=PropertyReviewStatus.pending,
        )
        s.add(approved_prop)
        s.add(pending_prop)
        s.commit()
        approved_id, pending_id = approved_prop.id, pending_prop.id

    client = api.login(claimant)
    attachment = _upload(client)
    created = client.post(
        "/api/v1/property-bindings",
        json={
            "kind": "claim",
            "property_id": str(approved_id),
            "address": "Phetchaburi 12",
            "room_number": "F-0101",
            "property_type": "apartment",
            "attachments": [attachment],
        },
    )
    assert created.status_code == 200, created.text

    admin_client = api.login(admin)
    res = admin_client.post(
        f"/api/v1/property-bindings/{created.json()['id']}/approve",
        json={"property_id": str(pending_id)},
    )
    assert res.status_code == 409, res.text

    _cleanup([attachment["url"]])


def test_binding_reject_then_resubmit(api):
    tenant = api.mk_user()
    admin = api.mk_user(UserRole.admin)
    urls = []

    client = api.login(tenant)
    first_att = _upload(client)
    urls.append(first_att["url"])
    created = client.post("/api/v1/property-bindings", json=_payload(first_att))
    assert created.status_code == 200
    binding_id = created.json()["id"]

    admin_client = api.login(admin)
    rejected = admin_client.post(
        f"/api/v1/property-bindings/{binding_id}/reject",
        json={"reason": "产权证明不清晰", "note": "请重新上传"},
    )
    assert rejected.status_code == 200, rejected.text
    assert rejected.json()["status"] == "rejected"
    assert rejected.json()["reject_reason"] == "产权证明不清晰"

    with Session(api.engine) as s:
        notes = s.exec(
            select(Notification).where(Notification.user_id == tenant.id)
        ).all()
        assert any(n.template_key == "property_binding_rejected" for n in notes)
        row = s.get(PropertyBinding, uuid.UUID(binding_id))
        assert row.status == PropertyBindingStatus.rejected
        assert row.reviewed_by == admin.id
        assert row.reviewed_at is not None

    # 驳回后允许重新提交（新记录，历史保留）
    client = api.login(tenant)
    second_att = _upload(client)
    urls.append(second_att["url"])
    resent = client.post(
        "/api/v1/property-bindings",
        json=_payload(second_att, address="Sukhumvit 24", room="A-1201"),
    )
    assert resent.status_code == 200, resent.text
    assert resent.json()["status"] == "pending"
    assert len(client.get("/api/v1/property-bindings/me").json()) == 2

    _cleanup(urls)
