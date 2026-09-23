"""合同接口归属校验回归测试（P0-4）。

修复背景：`contracts.py` 的四个端点此前**只校验「已登录」**，导致
任意登录用户都能：列出全站合同、读任意合同全文（正文含双方证件号）、
用任意 party_id 冒充他人签署。

本文件锁死修复后的契约：
- `generate` / `add_party` 属平台作业动作 → 非员工 403；
- `list` / `get` 走可见性判定 → 无关用户 404（而非 200 拿到全文）；
- `sign` 身份绑定 → 非员工只能签自己那一方，签名姓名一律取服务端 `party.name`，
  客户端传入的 `name` 一律忽略。

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

from app.config import settings  # noqa: E402
from app.db import get_session  # noqa: E402
from app.core import auth as auth_module  # noqa: E402
from app.main import app  # noqa: E402
from app.models import (  # noqa: E402
    Contract,
    ContractKind,
    ContractParty,
    ContractStatus,
    SignatureRecord,
    SignerRole,
    User,
    UserRole,
)


@pytest.fixture(autouse=True)
def _signing_secret(monkeypatch):
    """esign_service.sign_digest 在未配密钥时会拒绝签名（本身是加固项），
    测试注入一个确定值，避免把「密钥未配」误判成契约缺陷。"""
    monkeypatch.setattr(settings, "CONTRACT_SIGNING_SECRET", "test-secret-请勿用于生产")


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


def _seed_contract(engine, *, tenant_user, other_user):
    """建一份租赁合同：tenant_user 是租客签署方，另有一个线下业主签署方。

    返回 (contract_id, tenant_party_id, landlord_party_id)。
    """
    with Session(engine) as s:
        contract = Contract(
            title="房屋租赁合同",
            kind=ContractKind.lease,
            status=ContractStatus.draft,
            language="zh",
            content_html="<p>身份证号 110101199001011234</p>",
            document_hash="hash-abc",
        )
        s.add(contract)
        s.commit()
        s.refresh(contract)

        party = ContractParty(
            contract_id=contract.id,
            user_id=tenant_user.id,
            name="张三",
            email="zhangsan@test.com",
            role=SignerRole.tenant,
        )
        landlord = ContractParty(
            contract_id=contract.id,
            user_id=None,  # 线下业主，未注册账号
            name="王五（业主）",
            email="landlord@test.com",
            role=SignerRole.landlord,
        )
        s.add(party)
        s.add(landlord)
        s.commit()
        s.refresh(party)
        s.refresh(landlord)
        return contract.id, party.id, landlord.id


# ------------------------------------------------------------ generate / add_party 限员工
def test_generate_contract_requires_staff(api):
    """租客不能生成合同（平台作业动作）。"""
    tenant = api.mk_user(UserRole.tenant)
    client = api.login(tenant)
    r = client.post("/api/v1/contracts/generate", json={"counters": {"days": 365}})
    assert r.status_code == 403, r.text


def test_generate_contract_allows_staff(api):
    employee = api.mk_user(UserRole.employee)
    client = api.login(employee)
    r = client.post(
        "/api/v1/contracts/generate",
        json={"counters": {"days": 365}, "language": "zh", "kind": "lease"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "draft"


def test_add_party_requires_staff(api):
    tenant = api.mk_user(UserRole.tenant)
    other = api.mk_user(UserRole.tenant)
    contract_id, _, _ = _seed_contract(api.engine, tenant_user=tenant, other_user=other)

    client = api.login(tenant)
    r = client.post(
        f"/api/v1/contracts/{contract_id}/parties",
        json={"name": "李四", "role": "landlord"},
    )
    assert r.status_code == 403, r.text


# ------------------------------------------------------------ list 可见性
def test_list_contracts_only_returns_own(api):
    """租客 A 只能看到自己是签署方的合同；无关用户 B 列表为空。"""
    tenant = api.mk_user(UserRole.tenant)
    other = api.mk_user(UserRole.tenant)
    contract_id, _, _ = _seed_contract(api.engine, tenant_user=tenant, other_user=other)

    mine = api.login(tenant).get("/api/v1/contracts")
    assert mine.status_code == 200, mine.text
    ids = [c["id"] for c in mine.json()]
    assert str(contract_id) in ids, "本人作为签署方的合同应可见"

    theirs = api.login(other).get("/api/v1/contracts")
    assert theirs.status_code == 200, theirs.text
    assert theirs.json() == [], "无关用户不得看到他人合同（此前返回全站）"


def test_staff_list_contracts_sees_all(api):
    tenant = api.mk_user(UserRole.tenant)
    other = api.mk_user(UserRole.tenant)
    contract_id, _, _ = _seed_contract(api.engine, tenant_user=tenant, other_user=other)

    admin = api.mk_user(UserRole.admin)
    r = api.login(admin).get("/api/v1/contracts")
    assert r.status_code == 200, r.text
    assert str(contract_id) in [c["id"] for c in r.json()]


# ------------------------------------------------------------ get 归属校验
def test_get_contract_not_found_for_unrelated_user(api):
    """非签署方读取合同详情 → 404（不暴露「存在但你没权限」，也不回显 PII 正文）。"""
    tenant = api.mk_user(UserRole.tenant)
    other = api.mk_user(UserRole.tenant)
    contract_id, _, _ = _seed_contract(api.engine, tenant_user=tenant, other_user=other)

    r = api.login(other).get(f"/api/v1/contracts/{contract_id}")
    assert r.status_code == 404, r.text
    assert "110101199001011234" not in r.text, "越权响应不得含证件号"


def test_get_own_contract_ok(api):
    tenant = api.mk_user(UserRole.tenant)
    other = api.mk_user(UserRole.tenant)
    contract_id, _, _ = _seed_contract(api.engine, tenant_user=tenant, other_user=other)

    r = api.login(tenant).get(f"/api/v1/contracts/{contract_id}")
    assert r.status_code == 200, r.text
    assert r.json()["title"] == "房屋租赁合同"


# ------------------------------------------------------------ sign 身份绑定
def test_non_staff_cannot_sign_other_party(api):
    """非员工不能签别人那一方，且不产生签名留痕。

    分两层：
    - 与合同毫无关系的用户：连合同都看不到 → 404；
    - 确实是本合同签署方、但想签**另一个**签署方：可见但非本人 → 403。
    """
    tenant = api.mk_user(UserRole.tenant)
    other = api.mk_user(UserRole.tenant)
    stranger = api.mk_user(UserRole.tenant)
    contract_id, party_id, landlord_id = _seed_contract(
        api.engine, tenant_user=tenant, other_user=other
    )

    # 1) 无关用户：合同不可见
    r0 = api.login(stranger).post(
        f"/api/v1/contracts/{contract_id}/sign",
        json={"party_id": str(party_id), "name": "冒名者"},
    )
    assert r0.status_code == 404, r0.text

    # 2) 本人是租客签署方，但想签业主那一方
    r1 = api.login(tenant).post(
        f"/api/v1/contracts/{contract_id}/sign",
        json={"party_id": str(landlord_id), "name": "张三"},
    )
    assert r1.status_code == 403, r1.text

    with Session(api.engine) as s:
        recs = s.exec(select(SignatureRecord)).all()
        assert recs == [], "越权签署不得留下任何签名记录"


def test_sign_binds_own_party_and_uses_server_name(api):
    """本人签自己那一方成功；payload 里的 name 一律被忽略，取服务端 party.name。"""
    tenant = api.mk_user(UserRole.tenant)
    other = api.mk_user(UserRole.tenant)
    contract_id, party_id, _landlord_id = _seed_contract(
        api.engine, tenant_user=tenant, other_user=other
    )

    r = api.login(tenant).post(
        f"/api/v1/contracts/{contract_id}/sign",
        json={"party_id": str(party_id), "name": "李四（冒名）"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["signed"] is True

    with Session(api.engine) as s:
        rec = s.exec(select(SignatureRecord)).first()
        assert rec is not None, "应留下签名留痕"
        assert rec.signer_name == "张三", "签名姓名必须取服务端 party.name"
        assert rec.signer_user_id == tenant.id, "须记录真实签署人"


def test_staff_can_sign_on_behalf_but_name_still_server_side(api):
    """员工可代签未绑定用户的签署方，但签名姓名仍取服务端 party.name。"""
    with Session(api.engine) as s:
        contract = Contract(
            title="房屋租赁合同",
            kind=ContractKind.lease,
            status=ContractStatus.draft,
            language="zh",
            content_html="<p>x</p>",
            document_hash="hash-xyz",
        )
        s.add(contract)
        s.commit()
        s.refresh(contract)
        party = ContractParty(
            contract_id=contract.id,
            user_id=None,  # 线下业主，未注册账号
            name="王五（业主）",
            email="",
            role=SignerRole.landlord,
        )
        s.add(party)
        s.commit()
        s.refresh(party)
        contract_id, party_id = contract.id, party.id

    staff = api.mk_user(UserRole.employee)
    r = api.login(staff).post(
        f"/api/v1/contracts/{contract_id}/sign",
        json={"party_id": str(party_id), "name": "随便填"},
    )
    assert r.status_code == 200, r.text

    with Session(api.engine) as s:
        rec = s.exec(select(SignatureRecord)).first()
        assert rec.signer_name == "王五（业主）"
        assert rec.ip is not None, "IP 应取自真实请求来源"
