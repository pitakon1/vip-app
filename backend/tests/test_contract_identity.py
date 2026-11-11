"""合同签署方身份解析与历史合同回填测试。

覆盖标准流程与脏数据归一化：
- `party.user_id` 直接命中；
- 手输手机号 `+86` / 全角数字归一化命中；
- 邮箱首尾空格 + 大写归一化命中；
- 脱敏手机号不命中；
- 仅姓名只标记 `name_only`，不自动认定；
- 手机号与邮箱指向不同用户 → `identity_conflict`；
- 同名 / 同手机号多用户 → `identity_ambiguous`；
- 停用账号、无档案分别落到 `identity_inactive` / `no_profile`；
- 合作方手输签署方可由回填脚本挂到唯一租约。

全部使用 conftest 的内存 SQLite 会话，不触碰真实库。
"""
import pathlib
import sys
import uuid
from datetime import datetime, timedelta

BACKEND_DIR = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.models import (  # noqa: E402
    Contract,
    ContractKind,
    ContractParty,
    Lease,
    LeaseStatus,
    Owner,
    Property,
    PropertyStatus,
    SignerRole,
    Tenant,
    User,
)
from app.services.contract_identity import (  # noqa: E402
    ContractIdentityResolver,
    normalize_email,
    normalize_name,
    normalize_phone,
    resolve_contract_identity,
)
from scripts.backfill_contract_lease import backfill  # noqa: E402


def _make_user(
    session,
    *,
    email=None,
    phone=None,
    full_name="测试用户",
    is_active=True,
):
    user = User(
        email=email or f"{uuid.uuid4().hex[:10]}@test.com",
        phone=phone,
        hashed_password="x",
        full_name=full_name,
        is_active=is_active,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def _make_owner(session, user):
    owner = Owner(user_id=user.id)
    session.add(owner)
    session.commit()
    session.refresh(owner)
    return owner


def _make_tenant(session, user):
    tenant = Tenant(user_id=user.id)
    session.add(tenant)
    session.commit()
    session.refresh(tenant)
    return tenant


def _make_property(session, owner, room_number="A101"):
    prop = Property(
        owner_id=owner.id,
        room_number=room_number,
        address="曼谷 Sukhumvit",
        monthly_rent=12000,
        currency="THB",
        status=PropertyStatus.vacant,
    )
    session.add(prop)
    session.commit()
    session.refresh(prop)
    return prop


def _make_lease(session, prop, owner, tenant):
    now = datetime.utcnow()
    lease = Lease(
        property_id=prop.id,
        tenant_id=tenant.id,
        owner_id=owner.id,
        start_date=now - timedelta(days=30),
        end_date=now + timedelta(days=300),
        monthly_rent=12000,
        deposit_amount=24000,
        status=LeaseStatus.active,
    )
    session.add(lease)
    session.commit()
    session.refresh(lease)
    return lease


def _make_contract(session, *, property_id=None, title="历史租赁合同"):
    contract = Contract(
        title=title,
        kind=ContractKind.lease,
        property_id=property_id,
    )
    session.add(contract)
    session.commit()
    session.refresh(contract)
    return contract


def _add_party(
    session,
    contract,
    *,
    role=SignerRole.landlord,
    name="测试签署方",
    phone=None,
    email="",
    user_id=None,
):
    party = ContractParty(
        contract_id=contract.id,
        role=role,
        name=name,
        phone=phone,
        email=email,
        user_id=user_id,
    )
    session.add(party)
    session.commit()
    session.refresh(party)
    return party


# ------------------------------------------------------------ 归一化
def test_normalizers_handle_hand_typed_dirty_input():
    """合作方手输的全角 / 空格 / +86 / 大小写都能归一。"""
    assert normalize_phone("+86 138-0000-0000") == "13800000000"
    assert normalize_phone("＋８６　１３８－００００－００００") == "13800000000"
    assert normalize_phone("0086 138 0000 0000") == "13800000000"
    assert normalize_phone("010-12345678") == "1012345678"
    assert normalize_phone("138****0000") is None
    assert normalize_phone("123") is None

    assert normalize_email("  ALICE@EXAMPLE.COM  ") == "alice@example.com"
    assert normalize_email("a*b@example.com") is None
    assert normalize_email("not-an-email") is None

    assert normalize_name(" 李  小 明 先生 ") == "李小明"
    assert normalize_name("Alice  Smith") == "alicesmith"


# ------------------------------------------------------------ 身份解析
def test_party_user_id_direct_match(session):
    """已绑定 user_id 的签署方直接命中档案。"""
    owner_user = _make_user(session, email="owner@test.com", full_name="业主")
    tenant_user = _make_user(session, email="tenant@test.com", full_name="租客")
    owner = _make_owner(session, owner_user)
    tenant = _make_tenant(session, tenant_user)

    contract = _make_contract(session)
    _add_party(
        session,
        contract,
        role=SignerRole.landlord,
        name="签名与账号姓名不同",
        user_id=owner_user.id,
    )
    _add_party(
        session,
        contract,
        role=SignerRole.tenant,
        name="租客",
        user_id=tenant_user.id,
    )

    identity = resolve_contract_identity(session, contract)
    assert identity.owner_ids == {owner.id}
    assert identity.tenant_ids == {tenant.id}
    assert [item["reason"] for item in identity.reasons] == ["matched", "matched"]
    assert identity.unresolved_reason is None


def test_hand_typed_phone_matches_after_normalization(session):
    """无 user_id 时，手输手机号（+86 / 全角）能唯一命中用户并解析到 Owner。"""
    owner_user = _make_user(
        session, email="owner@test.com", phone="13800000000", full_name="业主"
    )
    owner = _make_owner(session, owner_user)

    for raw_phone in ("+86 138-0000-0000", "＋８６　１３８－００００－００００"):
        contract = _make_contract(session)
        _add_party(
            session,
            contract,
            role=SignerRole.landlord,
            name="手输的业主姓名",
            phone=raw_phone,
        )

        identity = resolve_contract_identity(session, contract)
        assert identity.owner_ids == {owner.id}
        assert identity.reasons[0]["reason"] == "matched"
        assert identity.reasons[0]["user_id"] == str(owner_user.id)


def test_hand_typed_email_matches_after_normalization(session):
    """邮箱首尾空格 + 大写归一后命中的是同一个用户。"""
    owner_user = _make_user(
        session, email="owner@example.com", full_name="业主"
    )
    owner = _make_owner(session, owner_user)

    contract = _make_contract(session)
    _add_party(
        session,
        contract,
        role=SignerRole.landlord,
        name="手输的业主姓名",
        email="  OWNER@EXAMPLE.COM  ",
    )

    identity = resolve_contract_identity(session, contract)
    assert identity.owner_ids == {owner.id}
    assert identity.reasons[0]["reason"] == "matched"


def test_masked_phone_falls_back_to_no_identity(session):
    """脱敏手机号不可用，且没有其他信号时落 no_identity。"""
    _make_user(session, email="owner@test.com", phone="13800000000")

    contract = _make_contract(session)
    _add_party(
        session,
        contract,
        role=SignerRole.landlord,
        name="库中不存在的姓名",
        phone="138****0000",
        email="",
    )

    identity = resolve_contract_identity(session, contract)
    assert identity.owner_ids == set()
    assert identity.reasons[0]["reason"] == "no_identity"
    assert identity.unresolved_reason == "no_identity"


def test_name_only_is_marked_but_not_auto_resolved(session):
    """姓名唯一命中也不自动认定，只给候选，不写 user_id。"""
    user = _make_user(session, email="owner@test.com", full_name="王小明")
    owner = _make_owner(session, user)

    contract = _make_contract(session)
    _add_party(
        session,
        contract,
        role=SignerRole.landlord,
        name=" 王 小 明 先生 ",
    )

    identity = resolve_contract_identity(session, contract)
    assert identity.owner_ids == set()  # 不自动认定，尽管档案存在
    assert identity.reasons[0]["reason"] == "name_only"
    assert identity.reasons[0]["user_id"] is None  # 姓名不作为绑定结果
    assert identity.reasons[0]["candidate_user_ids"] == [str(user.id)]
    assert identity.unresolved_reason == "name_only"
    assert owner.id not in identity.owner_ids


def test_phone_and_email_pointing_to_different_users_is_conflict(session):
    """两个可用信号指向不同用户 → identity_conflict。"""
    user_a = _make_user(
        session,
        email="a@test.com",
        phone="13800000001",
        full_name="用户A",
    )
    user_b = _make_user(
        session,
        email="b@test.com",
        phone="13900000002",
        full_name="用户B",
    )

    contract = _make_contract(session)
    _add_party(
        session,
        contract,
        role=SignerRole.landlord,
        name="合作方录入",
        phone="13800000001",
        email="b@test.com",
    )

    identity = resolve_contract_identity(session, contract)
    assert identity.owner_ids == set()
    assert identity.reasons[0]["reason"] == "identity_conflict"
    assert identity.reasons[0]["user_id"] is None
    assert user_a.id != user_b.id


def test_same_phone_or_same_name_is_ambiguous(session):
    """同一信号命中多个用户 → identity_ambiguous（手机号与姓名都要覆盖）。"""
    _make_user(
        session, email="a@test.com", phone="13700000000", full_name="同名客户"
    )
    _make_user(
        session, email="b@test.com", phone="13700000000", full_name="同名客户"
    )

    by_phone = _make_contract(session)
    _add_party(
        session,
        by_phone,
        role=SignerRole.landlord,
        name="不参与判断",
        phone="+86 137-0000-0000",
    )
    identity = resolve_contract_identity(session, by_phone)
    assert identity.owner_ids == set()
    assert identity.reasons[0]["reason"] == "identity_ambiguous"

    by_name = _make_contract(session)
    _add_party(
        session,
        by_name,
        role=SignerRole.landlord,
        name="同名 客户",
    )
    identity = resolve_contract_identity(session, by_name)
    assert identity.reasons[0]["reason"] == "identity_ambiguous"


def test_inactive_user_and_missing_profile_are_reported(session):
    """停用账号优先报 identity_inactive；用户存在但无档案报 no_profile。"""
    inactive_user = _make_user(
        session,
        email="inactive@test.com",
        phone="13600000000",
        full_name="停用业主",
        is_active=False,
    )
    _make_owner(session, inactive_user)  # 有档案也先判停用

    contract = _make_contract(session)
    _add_party(
        session,
        contract,
        role=SignerRole.landlord,
        name="停用业主",
        phone="13600000000",
    )
    identity = resolve_contract_identity(session, contract)
    assert identity.reasons[0]["reason"] == "identity_inactive"
    assert identity.owner_ids == set()

    active_user = _make_user(
        session, email="no-profile@test.com", phone="13500000000", full_name="无档案"
    )
    contract2 = _make_contract(session)
    _add_party(
        session,
        contract2,
        role=SignerRole.landlord,
        name="无档案",
        phone="13500000000",
    )
    identity2 = resolve_contract_identity(session, contract2)
    assert identity2.reasons[0]["reason"] == "no_profile"
    assert identity2.reasons[0]["user_id"] == str(active_user.id)


# ------------------------------------------------------------ 脚本回填
def test_backfill_links_contract_with_hand_typed_party(session):
    """合作方手输（无 user_id、姓名带空格、手机带 +86）也能回填到唯一租约。"""
    owner_user = _make_user(
        session, email="owner@test.com", phone="13800000000", full_name="李明"
    )
    owner = _make_owner(session, owner_user)
    tenant_user = _make_user(
        session, email="tenant@test.com", full_name="租客甲"
    )
    tenant = _make_tenant(session, tenant_user)

    prop = _make_property(session, owner)
    lease = _make_lease(session, prop, owner, tenant)

    # 历史合同：没有 lease_id，也没有 property_id
    contract = _make_contract(session)
    _add_party(
        session,
        contract,
        role=SignerRole.landlord,
        name="李 明",
        phone="+86 138-0000-0000",
    )
    _add_party(
        session,
        contract,
        role=SignerRole.tenant,
        name="租客甲",
        user_id=tenant_user.id,
    )

    stats = backfill(session)
    assert stats["updated"] == 1
    session.refresh(contract)
    assert contract.lease_id == lease.id
    assert contract.property_id == prop.id

    # 幂等：重复执行不再扫描到该合同，也不改动已有 lease_id
    stats_again = backfill(session)
    assert stats_again["scanned_null"] == 0
    assert stats_again["updated"] == 0
    assert stats_again["already_linked"] == 1
    session.refresh(contract)
    assert contract.lease_id == lease.id


# --------------------------------------------------- 新增签署方（合作方手输）
def test_add_party_resolution_binds_user_without_profile(session):
    """新增签署方只要求命中平台用户：没有业主档案也应绑定 user_id。

    否则该签署方在「我的合同」不可见、也无法签署；姓名仍只标记不认定。
    """
    user = _make_user(
        session,
        email="Partner@Example.com",
        phone="+86 138-0000-0000",
        full_name="合作方手输",
    )
    resolver = ContractIdentityResolver(session)
    result = resolver.resolve_party_user(
        role=SignerRole.landlord,
        name="合作方手输",
        phone="13800000000",
        email="  partner@example.com ",
    )
    assert result.reason == "matched"
    assert result.user_id == user.id
    assert result.profile_ids == set()

    only_name = resolver.resolve_party_user(
        role=SignerRole.landlord, name=" 合作方 手输 "
    )
    assert only_name.reason == "name_only"
    assert only_name.user_id is None
    assert only_name.candidate_user_ids == {user.id}
