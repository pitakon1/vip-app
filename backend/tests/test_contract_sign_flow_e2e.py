"""电子签端到端链路回归测试（开放签式一次性落区并签）。

覆盖从「生成合同 → 追加签署方 → 放置签署区 → 关键字定位 → 一次性落区并签
→ 状态推进 → 验签 → PDF 页图 → 免登录公开签署 → 拒签」的完整链路。

全部使用内存 SQLite + dependency_overrides，不触真实数据库；引擎签名走
真实的 kaifangqian->Python 引擎（自签 CA 落盘在 SIGN_ENGINE_CERT_DIR）。
"""

import base64
import pathlib
import sys
import uuid
from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

BASE_DIR = pathlib.Path(__file__).resolve().parents[1]
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from app.api.v1 import contract_sign_public as public_module  # noqa: E402
from app.config import settings  # noqa: E402
from app.core import auth as auth_module  # noqa: E402
from app.db import get_session  # noqa: E402
from app.main import app  # noqa: E402
from app.models import (  # noqa: E402
    Contract,
    ContractKind,
    ContractParty,
    ContractSignField,
    ContractSource,
    ContractStatus,
    SignatureRecord,
    SignerRole,
    User,
    UserRole,
)
from app.services import kaifang_sign_service  # noqa: E402

# 一段合法的签署 SVG（sanitize 只做黑名单校验）
SIGN_SVG = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 40">'
    '<path d="M2 30 L30 6 L60 34" stroke="#111" stroke-width="3" fill="none"/></svg>'
)


@pytest.fixture(autouse=True)
def _signing_secret(monkeypatch):
    """sign_digest 未配密钥会拒绝签发，测试注入确定值。"""
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
        # 每个请求一个新会话（与生产一致），避免跨请求复用同一 Session 时
        # 身份映射缓存旧对象——否则在别的会话里改库（如实名）本次请求读不到。
        def _session_override():
            s = Session(engine)
            created_sessions.append(s)
            return s

        def _user_override():
            s = Session(engine)
            created_sessions.append(s)
            return s.get(User, user.id)

        app.dependency_overrides[get_session] = _session_override
        app.dependency_overrides[auth_module.get_current_user] = _user_override
        # 页图/PDF 端点走 Authorization 或 ?token= 的兼容鉴权，一并覆盖
        app.dependency_overrides[
            auth_module.get_current_user_allow_query_token
        ] = _user_override
        return TestClient(app)

    factory = SimpleNamespace(mk_user=_mk_user, login=_login, engine=engine)
    try:
        yield factory
    finally:
        for s in created_sessions:
            s.close()
        app.dependency_overrides.clear()


def _png_stamp() -> str:
    """用真引擎生成一枚手写签名字样 PNG，作为「已制作签章」提交给 sign-batch。"""
    png = kaifang_sign_service.get_engine().make_handwrite("张三")
    return "data:image/png;base64," + base64.b64encode(png).decode("ascii")


def _generate(client) -> str:
    r = client.post(
        "/api/v1/contracts/generate",
        json={
            "counters": {"title": "房屋租赁合同", "monthly_rent": "8000"},
            "language": "zh",
            "kind": "lease",
        },
    )
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _add_party(client, contract_id, *, name, role, user_id=None) -> str:
    r = client.post(
        f"/api/v1/contracts/{contract_id}/parties",
        json={"name": name, "role": role, "user_id": str(user_id) if user_id else None},
    )
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _add_fields(client, contract_id, fields) -> list:
    r = client.post(
        f"/api/v1/contracts/{contract_id}/sign-fields", json={"fields": fields}
    )
    assert r.status_code == 200, r.text
    return r.json()["sign_fields"]


# --------------------------------------------------------------------------- 主链路
def test_full_sign_flow_to_completed(api):
    """员工放区 → 两方依次一次性落区并签 → 合同 completed/signed → 验签通过。"""
    staff = api.mk_user(UserRole.employee)
    tenant = api.mk_user(UserRole.tenant)
    client = api.login(staff)

    cid = _generate(client)
    tenant_party = _add_party(client, cid, name="张三", role="tenant", user_id=tenant.id)
    landlord_party = _add_party(client, cid, name="王五（业主）", role="landlord")
    # 线下签署方须先实名（真实链路走公开端验证码实名），否则签署被合规拦截
    _verify_real_name(api.engine, landlord_party)

    _add_fields(
        client,
        cid,
        [
            {"party_id": tenant_party, "field_type": "signature", "page": 1,
             "x": 20, "y": 88, "w": 22, "h": 8, "required": True},
            {"party_id": landlord_party, "field_type": "seal", "page": 1,
             "x": 62, "y": 88, "w": 22, "h": 8, "required": True},
        ],
    )

    # --- 第一方：租客（手写签名）---
    r = client.post(
        f"/api/v1/contracts/{cid}/sign-batch",
        json={
            "party_id": tenant_party,
            "items": [
                {"page": 1, "x": 20, "y": 88, "w": 22, "h": 8,
                 "method": "personal_handwrite",
                 "signature_svg": SIGN_SVG, "image_data_url": _png_stamp()},
            ],
        },
    )
    assert r.status_code == 200, r.text
    assert r.json()["signed"] is True
    assert len(r.json()["fields"]) == 1, "本次拖放的签署区应被原子创建"
    assert r.json()["contract_status"] == "partially_signed", r.text

    # --- 第二方：业主（公章）---
    r = client.post(
        f"/api/v1/contracts/{cid}/sign-batch",
        json={
            "party_id": landlord_party,
            "items": [
                {"page": 1, "x": 62, "y": 88, "w": 22, "h": 8,
                 "method": "company_seal", "image_data_url": _png_stamp()},
            ],
        },
    )
    assert r.status_code == 200, r.text
    assert r.json()["contract_status"] == "signed", r.text

    detail = client.get(f"/api/v1/contracts/{cid}").json()
    assert detail["status"] == "signed"
    assert all(p["signed"] for p in detail["parties"]), detail["parties"]
    assert len(detail["sign_fields"]) == 4, "2 个预置必签区 + 2 个落区签署区"

    # --- 验签 ---
    rep = client.get(f"/api/v1/contracts/{cid}/verify").json()
    assert rep["tampered"] is False
    assert rep["verified"] is True
    assert rep["signatures"], "应有签名留痕"
    assert any(s["signature_success"] for s in rep["signatures"]), rep["signatures"]

    # --- 引擎 PDF：页图可渲染 + 内嵌数字签名核验通过 ---
    png = client.get(f"/api/v1/contracts/{cid}/pdf-pages/1")
    assert png.status_code == 200, png.text
    assert png.headers["content-type"].startswith("image/png")

    with Session(api.engine) as s:
        c = s.get(Contract, uuid.UUID(cid))
        assert c.signed_pdf_path, "签署后应产出带数字签名的 PDF 存档"
        assert c.status == ContractStatus.signed
    assert rep["pdf_signature"], "验签报告应含引擎内嵌签名结果"
    assert any(int(x["valid"]) == 1 for x in rep["pdf_signature"]), rep["pdf_signature"]


def test_batch_rejects_non_staff_signing_other_party(api):
    """非员工只能签自己那一方；越权不产生留痕。"""
    staff = api.mk_user(UserRole.employee)
    tenant = api.mk_user(UserRole.tenant)
    stranger = api.mk_user(UserRole.tenant)

    cid = _generate(api.login(staff))
    tenant_party = _add_party(
        api.login(staff), cid, name="张三", role="tenant", user_id=tenant.id
    )

    r = api.login(stranger).post(
        f"/api/v1/contracts/{cid}/sign-batch",
        json={"party_id": tenant_party, "items": [{"page": 1, "x": 10, "y": 10,
                                                   "w": 20, "h": 8}]},
    )
    assert r.status_code in (403, 404), r.text
    with Session(api.engine) as s:
        assert s.exec(select(SignatureRecord)).all() == [], "越权不得留痕"


def test_batch_rejects_double_sign(api):
    """同一签署方二次批量签署 → 409。"""
    staff = api.mk_user(UserRole.employee)
    client = api.login(staff)
    cid = _generate(client)
    pid = _add_party(client, cid, name="张三", role="tenant")
    _verify_real_name(api.engine, pid)
    body = {"party_id": pid, "items": [{"page": 1, "x": 10, "y": 10, "w": 20, "h": 8}]}
    assert client.post(f"/api/v1/contracts/{cid}/sign-batch", json=body).status_code == 200
    r2 = client.post(f"/api/v1/contracts/{cid}/sign-batch", json=body)
    assert r2.status_code == 409, r2.text


def test_batch_rejects_empty_items(api):
    staff = api.mk_user(UserRole.employee)
    client = api.login(staff)
    cid = _generate(client)
    pid = _add_party(client, cid, name="张三", role="tenant")
    r = client.post(
        f"/api/v1/contracts/{cid}/sign-batch", json={"party_id": pid, "items": []}
    )
    assert r.status_code == 400, r.text


# --------------------------------------------------------------------------- 无引擎 PDF 的合同
def test_uploaded_contract_without_pdf_still_signs(api):
    """上传型合同（无引擎 PDF）签署、关键字检索、页图不得 500。

    回归背景：`_apply_pdf_signature` 用 `Path(signed_pdf_path or pdf_path)`，
    两者皆空时 `Path(None)` 抛 TypeError → 签署接口 500；关键字检索用
    `Path(pdf_path or "")`，空串等价于 "." 且 `.exists()` 为真 → 走目录读字节 500。
    """
    staff = api.mk_user(UserRole.employee)
    client = api.login(staff)
    with Session(api.engine) as s:
        contract = Contract(
            title="上传合同",
            kind=ContractKind.lease,
            status=ContractStatus.draft,
            language="zh",
            content_html="<p>甲方 乙方</p>",
            document_hash="h-upload",
            source=ContractSource.uploaded,
            file_path="/uploads/documents/contract_x.pdf",
        )
        s.add(contract)
        s.commit()
        s.refresh(contract)
        party = ContractParty(
            contract_id=contract.id,
            user_id=None,  # 线下签署方，已实名
            name="王五（业主）",
            role=SignerRole.landlord,
            real_name_verified_at=datetime.utcnow(),
        )
        s.add(party)
        s.commit()
        s.refresh(party)
        cid, pid = str(contract.id), str(party.id)

    r = client.post(
        f"/api/v1/contracts/{cid}/sign-batch",
        json={"party_id": pid,
              "items": [{"page": 1, "x": 20, "y": 88, "w": 22, "h": 8,
                         "method": "personal_handwrite", "signature_svg": SIGN_SVG}]},
    )
    assert r.status_code == 200, f"无 PDF 合同签署不得 500：{r.text}"

    # 无 PDF → 关键字检索/页图应为 404（而非 500）
    kw = client.post(f"/api/v1/contracts/{cid}/keyword-search", json={"keyword": "甲方"})
    assert kw.status_code == 404, f"无 PDF 应 404，实际 {kw.status_code}：{kw.text}"
    pg = client.get(f"/api/v1/contracts/{cid}/pdf-pages/1")
    assert pg.status_code == 404, f"无 PDF 应 404，实际 {pg.status_code}：{pg.text}"

    # 留痕仍要落库
    with Session(api.engine) as s:
        assert s.exec(select(SignatureRecord)).all(), "无 PDF 也必须留下签名记录"


# --------------------------------------------------------------------------- 关键字签署
def test_keyword_search_then_batch_field(api):
    """员工按关键字定位签署区 → 一键落区并签。"""
    staff = api.mk_user(UserRole.employee)
    client = api.login(staff)
    cid = _generate(client)
    pid = _add_party(client, cid, name="张三", role="tenant")
    _verify_real_name(api.engine, pid)

    r = client.post(
        f"/api/v1/contracts/{cid}/keyword-search", json={"keyword": "甲方"}
    )
    assert r.status_code == 200, r.text
    hits = r.json().get("hits") or r.json().get("matches") or []
    assert hits, f"关键字「甲方」应命中合同 PDF 正文：{r.text}"
    hit = hits[0]
    assert 0 <= hit["x"] <= 100 and 0 <= hit["y"] <= 100, hit

    r2 = client.post(
        f"/api/v1/contracts/{cid}/keyword-fields",
        json={"keyword": "甲方", "party_id": pid, "field_type": "signature",
              "index": 0},
    )
    assert r2.status_code in (200, 201), r2.text
    assert r2.json()["field"]["page"] == hit["page"]

    r3 = client.post(
        f"/api/v1/contracts/{cid}/sign-batch",
        json={"party_id": pid,
              "items": [{"page": hit["page"], "x": hit["x"], "y": hit["y"],
                         "w": 20, "h": 8, "method": "personal_handwrite",
                         "signature_svg": SIGN_SVG}]},
    )
    assert r3.status_code == 200, r3.text


# --------------------------------------------------------------------------- 公开签署
def _verify_real_name(engine, party_id) -> None:
    """把线下签署方置为「已完成实名」（真实链路走公开端验证码实名）。"""
    with Session(engine) as s:
        p = s.get(ContractParty, uuid.UUID(str(party_id)))
        p.real_name_verified_at = datetime.utcnow()
        s.add(p)
        s.commit()


def _issue_token(engine, party_id) -> str:
    token = "tok-" + uuid.uuid4().hex
    with Session(engine) as s:
        p = s.get(ContractParty, uuid.UUID(str(party_id)))
        p.sign_token = token
        p.sign_token_expires_at = datetime.utcnow() + timedelta(days=1)
        s.add(p)
        s.commit()
    return token


def _mark_real_name(engine, party_id, name="李四"):
    with Session(engine) as s:
        p = s.get(ContractParty, uuid.UUID(str(party_id)))
        p.name = name
        p.real_name_verified_at = datetime.utcnow()
        s.add(p)
        s.commit()


def test_public_sign_flow_requires_real_name_then_signs(api):
    """免登录签署：未实名 403 → 实名后 items 批量签署 → 公开验签。"""
    staff = api.mk_user(UserRole.employee)
    client = api.login(staff)
    cid = _generate(client)
    pid = _add_party(client, cid, name="张三", role="tenant")
    _add_fields(
        client, cid,
        [{"party_id": pid, "field_type": "signature", "page": 1,
          "x": 20, "y": 88, "w": 22, "h": 8, "required": True}],
    )
    token = _issue_token(api.engine, pid)

    page = TestClient(app).get(f"/api/v1/public/contract-sign/{token}")
    assert page.status_code == 200, page.text
    body = page.json()
    assert body["title"] == "房屋租赁合同"
    assert body["party_name_masked"] not in ("", None)
    assert body["pdf_available"] is True, "生成的合同应带可签署 PDF"

    # 未实名 → 403
    pre = TestClient(app).post(
        f"/api/v1/public/contract-sign/{token}",
        json={"items": [{"page": 1, "x": 20, "y": 88, "w": 22, "h": 8}]},
    )
    assert pre.status_code == 403 and "REAL_NAME" in pre.text, pre.text

    _mark_real_name(api.engine, pid, "李四")
    signed = TestClient(app).post(
        f"/api/v1/public/contract-sign/{token}",
        json={"items": [{"page": 1, "x": 20, "y": 88, "w": 22, "h": 8,
                         "method": "personal_handwrite", "signature_svg": SIGN_SVG}]},
    )
    assert signed.status_code == 200, signed.text
    assert signed.json()["signed"] is True

    # 令牌一次性：签署后 sign_token 被清空 → 再取链接 404（不区分「已用」与
    # 「不存在」，避免探测；设计上已签署方不会留下可用令牌）
    again = TestClient(app).get(f"/api/v1/public/contract-sign/{token}")
    assert again.status_code == 404, again.text

    # 公开验签（需有效令牌，签名后令牌已清空 → 用站内验签核对）
    rep = client.get(f"/api/v1/contracts/{cid}/verify").json()
    assert rep["tampered"] is False and rep["verified"] is True


def test_public_decline_terminates_contract(api):
    """唯一签署方拒签 → 合同 rejected，且不可再签。"""
    staff = api.mk_user(UserRole.employee)
    client = api.login(staff)
    cid = _generate(client)
    pid = _add_party(client, cid, name="张三", role="tenant")
    token = _issue_token(api.engine, pid)

    r = TestClient(app).post(
        f"/api/v1/public/contract-sign/{token}/decline", json={"reason": "条款不认可"}
    )
    assert r.status_code == 200, r.text
    assert r.json()["contract_status"] == "rejected", r.text

    with Session(api.engine) as s:
        c = s.get(Contract, uuid.UUID(cid))
        assert c.status == ContractStatus.rejected


def test_public_pdf_pages_requires_valid_token(api):
    """页图接口：无效令牌 404；有效令牌返回 PNG。"""
    staff = api.mk_user(UserRole.employee)
    client = api.login(staff)
    cid = _generate(client)
    pid = _add_party(client, cid, name="张三", role="tenant")

    assert TestClient(app).get(
        "/api/v1/public/contract-sign/not-a-token/pdf-pages/1"
    ).status_code == 404

    token = _issue_token(api.engine, pid)
    r = TestClient(app).get(f"/api/v1/public/contract-sign/{token}/pdf-pages/1")
    assert r.status_code == 200, r.text
    assert r.headers["content-type"].startswith("image/png")


# --------------------------------------------------------------------------- 签署方资产库
def test_sign_assets_create_and_use(api):
    """手写签名入库 → 列表可读 → 删除。"""
    user = api.mk_user(UserRole.employee)
    client = api.login(user)
    data_url = (
        "data:image/svg+xml;charset=utf-8,"
        + "%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3C%2Fsvg%3E"
    )
    r = client.post(
        "/api/v1/sign-assets",
        json={"name": "我的签名", "asset_type": "handwrite", "source": "drew",
              "data_url": data_url},
    )
    assert r.status_code == 200, r.text
    asset_id = r.json()["id"]
    assert r.json()["asset_type"] == "handwrite"

    listed = client.get("/api/v1/sign-assets?asset_type=handwrite")
    assert listed.status_code == 200, listed.text
    assert asset_id in [a["id"] for a in listed.json()]

    assert client.delete(f"/api/v1/sign-assets/{asset_id}").status_code == 200


def test_sign_assets_rejects_non_image_data_url(api):
    user = api.mk_user(UserRole.employee)
    r = api.login(user).post(
        "/api/v1/sign-assets",
        json={"name": "x", "data_url": "javascript:alert(1)"},
    )
    assert r.status_code == 400, r.text


def test_generate_seal_preview_returns_png(api):
    user = api.mk_user(UserRole.employee)
    r = api.login(user).post(
        "/api/v1/sign-assets/generate-seal",
        json={"name": "测试公章", "company_name": "测试公司", "middle_text": "合同专用",
              "size": 260},
    )
    assert r.status_code == 200, r.text
    assert r.json()["data_url"].startswith("data:image/png;base64,")
