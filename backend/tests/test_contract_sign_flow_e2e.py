"""电子签端到端链路回归测试（开放签式一次性落区并签）。

覆盖从「生成合同 → 追加签署方 → 放置签署区 → 关键字定位 → 一次性落区并签
→ 状态推进 → 验签 → PDF 页图 → 免登录公开签署 → 拒签」的完整链路。

全部使用内存 SQLite + dependency_overrides，不触真实数据库；引擎签名走
真实的 kaifangqian->Python 引擎（自签 CA 落盘在 SIGN_ENGINE_CERT_DIR）。
"""

import base64
import hashlib
import pathlib
import sys
import time
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
    ContractAuditLog,
    ContractCallbackEvent,
    ContractCallbackStatus,
    ContractKind,
    ContractParty,
    ContractSignField,
    ContractSource,
    ContractStatus,
    Notification,
    SignatureRecord,
    SignerRole,
    User,
    UserRole,
)
from app.services import kaifang_sign_service  # noqa: E402
from app.services import contract_audit  # noqa: E402

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
    landlord = api.mk_user(UserRole.owner)
    client = api.login(staff)

    cid = _generate(client)
    tenant_party = _add_party(client, cid, name="张三", role="tenant", user_id=tenant.id)
    landlord_party = _add_party(
        client, cid, name="王五（业主）", role="landlord", user_id=landlord.id
    )

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

    # --- 第一方：租客本人（手写签名）---
    r = api.login(tenant).post(
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
    assert r.json()["pdf_signed"] is True, r.text

    # --- 第二方：业主本人（公章）---
    r = api.login(landlord).post(
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

    client = api.login(staff)  # 回到员工视角查看详情/验签
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
    # 双签后不得破坏前一位签署人的签名：每一条内嵌签名都必须完好
    assert [int(x["valid"]) for x in rep["pdf_signature"]] == [1, 1], rep["pdf_signature"]
    assert rep["pdf_signature_valid_all"] is True
    assert rep["pdf_signed"] is True

    # 列表计算态也应为 ok（正常合同不受历史异常提示影响）
    items = client.get("/api/v1/contracts").json()
    assert next(x for x in items if x["id"] == cid)["signature_health"] == "ok"


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
    tenant = api.mk_user(UserRole.tenant)
    client = api.login(staff)
    cid = _generate(client)
    pid = _add_party(client, cid, name="张三", role="tenant", user_id=tenant.id)
    tclient = api.login(tenant)
    body = {"party_id": pid, "items": [{"page": 1, "x": 10, "y": 10, "w": 20, "h": 8}]}
    assert tclient.post(f"/api/v1/contracts/{cid}/sign-batch", json=body).status_code == 200
    r2 = tclient.post(f"/api/v1/contracts/{cid}/sign-batch", json=body)
    assert r2.status_code == 409, r2.text


def test_batch_rejects_empty_items(api):
    staff = api.mk_user(UserRole.employee)
    tenant = api.mk_user(UserRole.tenant)
    client = api.login(staff)
    cid = _generate(client)
    pid = _add_party(client, cid, name="张三", role="tenant", user_id=tenant.id)
    r = api.login(tenant).post(
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
            user_id=staff.id,  # 由该员工本人签署（不再允许代签他人）
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
    """员工按关键字定位签署区 → 签署人本人一键落区并签。"""
    staff = api.mk_user(UserRole.employee)
    tenant = api.mk_user(UserRole.tenant)
    client = api.login(staff)
    cid = _generate(client)
    pid = _add_party(client, cid, name="张三", role="tenant", user_id=tenant.id)

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

    r3 = api.login(tenant).post(
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


# --------------------------------------------------------------------------- 缺陷回归（本轮修复）
def test_staff_cannot_sign_party_bound_to_another_user(api):
    """员工不能代签已绑定某个用户的签署方 → 403，且不产生任何留痕。"""
    staff = api.mk_user(UserRole.employee)
    tenant = api.mk_user(UserRole.tenant)
    client = api.login(staff)
    cid = _generate(client)
    pid = _add_party(client, cid, name="张三", role="tenant", user_id=tenant.id)

    r = client.post(
        f"/api/v1/contracts/{cid}/sign-batch",
        json={"party_id": pid,
              "items": [{"page": 1, "x": 10, "y": 10, "w": 20, "h": 8,
                         "signature_svg": SIGN_SVG}]},
    )
    assert r.status_code == 403, r.text
    with Session(api.engine) as s:
        p = s.get(ContractParty, uuid.UUID(pid))
        assert p.signed is False
        assert s.exec(select(SignatureRecord)).all() == []


def test_pdf_sign_failure_is_visible_and_blocks_state(api, monkeypatch):
    """签章引擎异常 → 502 + 失败原因留痕；签署区/留痕/状态都不推进。"""

    def _boom(self, *args, **kwargs):
        raise RuntimeError("engine unavailable")

    staff = api.mk_user(UserRole.employee)
    tenant = api.mk_user(UserRole.tenant)
    client = api.login(staff)
    cid = _generate(client)
    pid = _add_party(client, cid, name="张三", role="tenant", user_id=tenant.id)

    monkeypatch.setattr(
        kaifang_sign_service.KaifangSignEngine, "sign_pdf", _boom
    )
    r = api.login(tenant).post(
        f"/api/v1/contracts/{cid}/sign-batch",
        json={"party_id": pid,
              "items": [{"page": 1, "x": 10, "y": 10, "w": 20, "h": 8,
                         "signature_svg": SIGN_SVG}]},
    )
    assert r.status_code == 502, r.text
    assert r.json()["detail"] == "PDF_SIGN_FAILED"

    with Session(api.engine) as s:
        c = s.get(Contract, uuid.UUID(cid))
        assert c.status == ContractStatus.draft, "签章失败不得流转"
        assert c.last_sign_error and "engine unavailable" in c.last_sign_error
        assert c.last_sign_error_at is not None
        p = s.get(ContractParty, uuid.UUID(pid))
        assert p.signed is False
        assert s.exec(select(ContractSignField)).all() == [], "失败不得留下签署区"
        assert s.exec(select(SignatureRecord)).all() == [], "失败不得留下留痕"


def test_historical_invalid_signature_flagged_in_list_detail_verify(
    api, monkeypatch, tmp_path
):
    """历史双签前序失效：列表/详情/验签如实提示，且不落库、不改合同状态。"""
    from app.services import esign_service

    staff = api.mk_user(UserRole.employee)
    marker = tmp_path / "historical.signed.pdf"
    marker.write_bytes(b"%PDF-1.4\n%historical placeholder\n")

    with Session(api.engine) as s:
        contract = Contract(
            contract_no="HT-HIST-001",
            title="历史双签合同",
            kind=ContractKind.lease,
            status=ContractStatus.signed,
            language="zh",
            content_html="",
            document_hash=esign_service.content_hash(""),
            signed_pdf_path=str(marker),
        )
        s.add(contract)
        s.commit()
        s.refresh(contract)
        party = ContractParty(
            contract_id=contract.id,
            name="张三",
            role=SignerRole.tenant,
            signed=True,
        )
        s.add(party)
        s.commit()
        s.refresh(party)
        s.add(
            SignatureRecord(
                contract_id=contract.id,
                party_id=party.id,
                signer_name="张三",
                signature_svg=SIGN_SVG,
                signature_hash="legacy-hash",
            )
        )
        s.commit()
        cid = str(contract.id)

    # 模拟该历史文件：前一位 valid=0，后一位 valid=1
    monkeypatch.setattr(
        kaifang_sign_service.KaifangSignEngine,
        "verify_pdf",
        lambda self, data: [{"valid": 0}, {"valid": 1}],
    )
    client = api.login(staff)

    row = next(x for x in client.get("/api/v1/contracts").json() if x["id"] == cid)
    assert row["signature_health"] == "invalid"

    detail = client.get(f"/api/v1/contracts/{cid}").json()
    assert detail["signature_health"] == "invalid"
    assert detail["status"] == "signed", "展示态不得改写合同状态"

    rep = client.get(f"/api/v1/contracts/{cid}/verify").json()
    assert [int(x["valid"]) for x in rep["pdf_signature"]] == [0, 1]
    assert rep["pdf_signature_valid_all"] is False
    assert rep["verified"] is False, "存在无效签名域时不得笼统显示验签通过"

    # 只读：状态与存档路径均未被改写
    with Session(api.engine) as s:
        c = s.get(Contract, uuid.UUID(cid))
        assert c.status == ContractStatus.signed
        assert c.signed_pdf_path == str(marker)

    # 历史合同同样可下载已签件与存证报告（原样提供，不重签）
    signed_file = client.get(f"/api/v1/contracts/{cid}/signed-file")
    assert signed_file.status_code == 200, signed_file.text
    assert signed_file.content.startswith(b"%PDF-")
    evidence = client.get(f"/api/v1/contracts/{cid}/evidence-report")
    assert evidence.status_code == 200, evidence.text
    assert evidence.content.startswith(b"%PDF-")
    assert evidence.headers["content-type"].startswith("application/pdf")


def test_signed_file_and_evidence_report_download(api):
    """已签件/存证报告下载：签署方可下自己的合同，外人 404，未产出已签件 404。"""
    import fitz

    staff = api.mk_user(UserRole.employee)
    tenant = api.mk_user(UserRole.tenant)
    stranger = api.mk_user(UserRole.tenant)
    client = api.login(staff)

    cid = _generate(client)
    pid = _add_party(client, cid, name="张三", role="tenant", user_id=tenant.id)
    _add_fields(
        client, cid,
        [{"party_id": pid, "field_type": "signature", "page": 1,
          "x": 20, "y": 88, "w": 22, "h": 8, "required": True}],
    )

    # 未签署前：没有已签件
    assert client.get(f"/api/v1/contracts/{cid}/signed-file").status_code == 404

    r = api.login(tenant).post(
        f"/api/v1/contracts/{cid}/sign-batch",
        json={
            "party_id": pid,
            "items": [{"page": 1, "x": 20, "y": 88, "w": 22, "h": 8,
                       "method": "personal_handwrite", "signature_svg": SIGN_SVG,
                       "image_data_url": _png_stamp()}],
        },
    )
    assert r.status_code == 200, r.text
    assert r.json()["pdf_signed"] is True

    # 员工：下载已签 PDF
    client = api.login(staff)
    detail = client.get(f"/api/v1/contracts/{cid}").json()
    assert detail["signed_pdf_available"] is True

    signed = client.get(f"/api/v1/contracts/{cid}/signed-file")
    assert signed.status_code == 200, signed.text
    assert signed.content.startswith(b"%PDF-")
    assert signed.headers["content-type"].startswith("application/pdf")
    assert "_signed.pdf" in signed.headers["content-disposition"]

    # 员工：下载存证报告（能打开、至少 1 页）
    ev = client.get(f"/api/v1/contracts/{cid}/evidence-report")
    assert ev.status_code == 200, ev.text
    assert ev.content.startswith(b"%PDF-")
    assert "_evidence.pdf" in ev.headers["content-disposition"]
    doc = fitz.open(stream=ev.content, filetype="pdf")
    assert doc.page_count >= 1
    doc.close()

    # 签署方本人：可下载自己签署的合同
    party_client = api.login(tenant)
    assert party_client.get(f"/api/v1/contracts/{cid}/signed-file").status_code == 200
    assert party_client.get(f"/api/v1/contracts/{cid}/evidence-report").status_code == 200

    # 无关用户：不可见即 404，不泄露合同存在性
    stranger_client = api.login(stranger)
    assert stranger_client.get(f"/api/v1/contracts/{cid}/signed-file").status_code == 404
    assert stranger_client.get(f"/api/v1/contracts/{cid}/evidence-report").status_code == 404


def test_upload_contract_hashes_real_file_bytes(api):
    """上传件 document_hash 必须是真实文件字节的 sha256（不是空正文哈希）。"""
    import fitz

    from app.api.v1.contracts import STORED_URL_PREFIX, UPLOAD_DIR
    from app.core.uploads import resolve_stored_path

    staff = api.mk_user(UserRole.employee)
    client = api.login(staff)
    cid = _generate(client)

    doc = fitz.open()
    doc.new_page()
    pdf_bytes = doc.tobytes()
    doc.close()

    r = client.post(
        f"/api/v1/contracts/{cid}/upload",
        files={"file": ("upload.pdf", pdf_bytes, "application/pdf")},
    )
    assert r.status_code == 200, r.text
    expect = hashlib.sha256(pdf_bytes).hexdigest()
    assert r.json()["document_hash"] == expect
    assert r.json()["document_hash"] != hashlib.sha256(b"").hexdigest()

    rep = client.get(f"/api/v1/contracts/{cid}/verify").json()
    assert rep["document_hash_source"] == "file_bytes"
    assert rep["document_hash_legacy"] is False
    assert rep["tampered"] is False

    # 清理本用例落到真实上传目录的文件
    path = resolve_stored_path(r.json()["file_path"], UPLOAD_DIR, STORED_URL_PREFIX)
    path.unlink(missing_ok=True)


def test_public_sign_issues_authenticated_download_grant(api):
    """签署后下发 HMAC 下载凭证：有效 200 / 篡改 403 / 过期 410，且令牌已失效。"""
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
    _mark_real_name(api.engine, pid, "李四")

    signed = TestClient(app).post(
        f"/api/v1/public/contract-sign/{token}",
        json={"items": [{"page": 1, "x": 20, "y": 88, "w": 22, "h": 8,
                         "method": "personal_handwrite", "signature_svg": SIGN_SVG}]},
    )
    assert signed.status_code == 200, signed.text
    grant = signed.json()["download"]
    assert grant and grant["url"].startswith("/public/contract-sign/")

    # 一次性令牌已被清空
    assert TestClient(app).get(
        f"/api/v1/public/contract-sign/{token}"
    ).status_code == 404

    ok = TestClient(app).get("/api/v1" + grant["url"])
    assert ok.status_code == 200, ok.text
    assert ok.content.startswith(b"%PDF-")
    assert ok.headers["content-type"].startswith("application/pdf")

    bad = grant["url"].replace("sig=", "sig=0")
    assert TestClient(app).get("/api/v1" + bad).status_code == 403

    exp = int(time.time()) - 10
    sig = public_module._download_sig(uuid.UUID(cid), exp)
    expired = TestClient(app).get(
        f"/api/v1/public/contract-sign/{cid}/signed-file?exp={exp}&sig={sig}"
    )
    assert expired.status_code == 410, expired.text

    # 无凭证裸访问（缺 exp/sig）应 422，不得匿名下载
    assert TestClient(app).get(
        f"/api/v1/public/contract-sign/{cid}/signed-file"
    ).status_code == 422


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


# --------------------------------------------------------------------------- 签署方归属（邮箱绑定）
def test_email_bound_party_can_view_and_sign(api):
    """员工建单只填邮箱（App 端「追加签署方」即 name/email/role，不传 user_id）时，
    该客户登录后必须能在「我的合同」看到本合同并本人签署。

    回归背景：可见性/签署权只认 `party.user_id`，导致这类签署方查详情 404、
    签署 403——App「我的合同」的邮箱匹配形同虚设，签署流程整体死路。
    """
    staff = api.mk_user(UserRole.employee)
    tenant = api.mk_user(UserRole.tenant)
    client = api.login(staff)

    cid = _generate(client)
    r = client.post(
        f"/api/v1/contracts/{cid}/parties",
        json={"name": "张三", "email": tenant.email, "role": "tenant"},
    )
    assert r.status_code == 200, r.text
    party_id = r.json()["id"]

    tclient = api.login(tenant)
    detail = tclient.get(f"/api/v1/contracts/{cid}")
    assert detail.status_code == 200, f"本人应能看到自己的合同: {detail.text}"
    assert party_id in [p["id"] for p in detail.json()["parties"]]
    # 未实名的签署方：本人签署时由后端按登录态内部认证，不应被 REAL_NAME 拦下
    assert detail.json()["parties"][0]["real_name_verified_at"] is None

    rb = tclient.post(
        f"/api/v1/contracts/{cid}/sign-batch",
        json={
            "party_id": party_id,
            "items": [{"page": 1, "x": 20, "y": 60, "w": 22, "h": 8,
                       "method": "personal_handwrite",
                       "image_data_url": _png_stamp()}],
        },
    )
    assert rb.status_code == 200, rb.text


def test_unbound_party_cannot_be_signed_by_others(api):
    """邮箱不对应任何平台账号的外部签署方：他人越权签署仍须被拒。"""
    staff = api.mk_user(UserRole.employee)
    stranger = api.mk_user(UserRole.tenant)
    client = api.login(staff)

    cid = _generate(client)
    r = client.post(
        f"/api/v1/contracts/{cid}/parties",
        json={"name": "外部客户B", "email": "outsider@nowhere.local", "role": "tenant"},
    )
    assert r.status_code == 200, r.text
    outsider_pid = r.json()["id"]

    sclient = api.login(stranger)
    assert sclient.get(f"/api/v1/contracts/{cid}").status_code == 404
    rb = sclient.post(
        f"/api/v1/contracts/{cid}/sign-batch",
        json={
            "party_id": outsider_pid,
            "items": [{"page": 1, "x": 20, "y": 60, "w": 22, "h": 8,
                       "method": "personal_handwrite",
                       "image_data_url": _png_stamp()}],
        },
    )
    assert rb.status_code in (403, 404), f"越权签署应被拒: {rb.status_code} {rb.text}"


# --------------------------------------------------------------------------- P1/P2 优化项
def _batch_sign(client, contract_id, party_id, page=1, x=20, y=60):
    return client.post(
        f"/api/v1/contracts/{contract_id}/sign-batch",
        json={
            "party_id": party_id,
            "items": [{"page": page, "x": x, "y": y, "w": 22, "h": 8,
                       "method": "personal_handwrite", "image_data_url": _png_stamp()}],
        },
    )


def test_upload_converts_to_pdf_with_gotenberg_and_degrades(api, monkeypatch, tmp_path):
    """上传件转 PDF：图片本地包页；Word 未配 Gotenberg 时降级；配置后重试成功。"""
    import httpx as httpx_module
    from app.api.v1.contracts import STORED_URL_PREFIX, UPLOAD_DIR
    from app.core.uploads import resolve_stored_path
    from app.services import pdf_convert

    monkeypatch.setattr(settings, "CONTRACT_OUTPUT_DIR", str(tmp_path / "contracts"))
    monkeypatch.setattr(settings, "GOTENBERG_URL", "")

    staff = api.mk_user(UserRole.employee)
    client = api.login(staff)
    cid = _generate(client)

    # 图片：不依赖 Gotenberg，直接包成 A4 单页 PDF
    png = kaifang_sign_service.get_engine().make_handwrite("张三")
    r = client.post(
        f"/api/v1/contracts/{cid}/upload",
        files={"file": ("scan.png", png, "image/png")},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["pdf_converted"] is True and body["pdf_convert_error"] is None
    assert body["document_hash"] == hashlib.sha256(png).hexdigest()
    uploaded_path = resolve_stored_path(body["file_path"], UPLOAD_DIR, STORED_URL_PREFIX)
    with Session(api.engine) as s:
        c = s.get(Contract, uuid.UUID(cid))
        assert c.pdf_path and pathlib.Path(c.pdf_path).exists()

    # Word：未配置 Gotenberg → 上传成功但降级，且失败原因可见
    docx = b"PK\x03\x04" + b"0" * 64
    r = client.post(
        f"/api/v1/contracts/{cid}/upload",
        files={"file": ("contract.docx", docx,
                        "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
    )
    assert r.status_code == 200, r.text
    assert r.json()["pdf_converted"] is False
    assert r.json()["pdf_convert_error"] == "PDF_CONVERT_DISABLED"
    docx_path = resolve_stored_path(r.json()["file_path"], UPLOAD_DIR, STORED_URL_PREFIX)
    retry = client.post(f"/api/v1/contracts/{cid}/convert-pdf")
    assert retry.status_code == 502, retry.text

    # 配置 Gotenberg（HTTP 打桩）后重试：成功写回 pdf_path
    monkeypatch.setattr(settings, "GOTENBERG_URL", "http://gotenberg:3000")
    real_pdf = pdf_convert.image_to_pdf(png)

    class _Resp:
        status_code = 200
        content = real_pdf

        def raise_for_status(self):
            return None

    real_client_post = httpx_module.Client.post

    def fake_post(self, url, files=None, **kwargs):
        # TestClient 也继承 httpx.Client：只截获发往 Gotenberg 的请求
        if not str(url).startswith("http://gotenberg:3000"):
            return real_client_post(self, url, files=files, **kwargs)
        assert url.endswith("/forms/libreoffice/convert"), url
        return _Resp()

    monkeypatch.setattr(httpx_module.Client, "post", fake_post)
    retry = client.post(f"/api/v1/contracts/{cid}/convert-pdf")
    assert retry.status_code == 200, retry.text
    assert retry.json()["pdf_converted"] is True
    with Session(api.engine) as s:
        c = s.get(Contract, uuid.UUID(cid))
        assert c.pdf_path and pathlib.Path(c.pdf_path).exists()

    # 清理本用例落到真实上传目录的文件
    uploaded_path.unlink(missing_ok=True)
    docx_path.unlink(missing_ok=True)


def test_share_link_token_tightening(api):
    """免登录链接：默认 3 天、上限 7 天；重发作废旧链接；已签方拒绝重发。"""
    staff = api.mk_user(UserRole.employee)
    tenant = api.mk_user(UserRole.tenant)
    client = api.login(staff)
    cid = _generate(client)
    pid = _add_party(client, cid, name="张三", role="tenant", user_id=tenant.id)

    r = client.post(f"/api/v1/contracts/{cid}/share-link", json={"party_id": pid})
    assert r.status_code == 200, r.text
    token1 = r.json()["token"]
    assert r.json()["qr_data_url"].startswith("data:image/png;base64,")
    ttl = datetime.fromisoformat(r.json()["expires_at"]) - datetime.utcnow()
    assert timedelta(days=2, hours=23) < ttl <= timedelta(days=3, minutes=1), ttl
    assert TestClient(app).get(f"/api/v1/public/contract-sign/{token1}").status_code == 200

    # reuse=true 只为展示二维码，不轮换令牌（避免把已复制的链接弄失效）
    r = client.post(
        f"/api/v1/contracts/{cid}/share-link",
        json={"party_id": pid, "reuse": True},
    )
    assert r.status_code == 200, r.text
    assert r.json()["token"] == token1
    assert r.json()["qr_data_url"].startswith("data:image/png;base64,")

    # 超上限按 7 天封顶
    r = client.post(
        f"/api/v1/contracts/{cid}/share-link",
        json={"party_id": pid, "expires_in_days": 30},
    )
    assert r.status_code == 200, r.text
    token2 = r.json()["token"]
    ttl = datetime.fromisoformat(r.json()["expires_at"]) - datetime.utcnow()
    assert timedelta(days=6, hours=23) < ttl <= timedelta(days=7, minutes=1), ttl

    # 重发即作废旧链接（旧 token 不再能打开签署页）
    assert token2 != token1
    assert TestClient(app).get(f"/api/v1/public/contract-sign/{token1}").status_code == 404

    # 已签署方不能再发链接
    assert _batch_sign(api.login(tenant), cid, pid).status_code == 200
    r = api.login(staff).post(f"/api/v1/contracts/{cid}/share-link", json={"party_id": pid})
    assert r.status_code == 409, r.text


def test_sequential_sign_order_enforced(api):
    """串行签署：前序未签时后序 409 NOT_YOUR_TURN 且零留痕；前序完成后放行。"""
    staff = api.mk_user(UserRole.employee)
    tenant = api.mk_user(UserRole.tenant)
    owner = api.mk_user(UserRole.owner)
    client = api.login(staff)
    cid = _generate(client)
    p_tenant = _add_party(client, cid, name="张三", role="tenant", user_id=tenant.id)
    p_owner = _add_party(client, cid, name="王五", role="landlord", user_id=owner.id)

    r = client.post(
        f"/api/v1/contracts/{cid}/sign-order",
        json={"type": "sequential",
              "orders": [{"party_id": p_owner, "order": 2}, {"party_id": p_tenant, "order": 1}]},
    )
    assert r.status_code == 200, r.text
    assert r.json()["sign_order_type"] == "sequential"
    assert [p["sign_order"] for p in r.json()["parties"]] == [1, 2]

    detail = client.get(f"/api/v1/contracts/{cid}").json()
    assert detail["sign_order_type"] == "sequential"
    by_id = {p["id"]: p for p in detail["parties"]}
    assert by_id[p_tenant]["can_sign_now"] is True
    assert by_id[p_owner]["can_sign_now"] is False

    # 后序先签 → 409，且不产生签署记录/签署区
    r = _batch_sign(api.login(owner), cid, p_owner)
    assert r.status_code == 409, r.text
    assert r.json()["detail"] == "NOT_YOUR_TURN"
    with Session(api.engine) as s:
        assert s.exec(
            select(SignatureRecord).where(SignatureRecord.contract_id == uuid.UUID(cid))
        ).first() is None

    # 前序签完 → 后序可签 → 合同完成
    assert _batch_sign(api.login(tenant), cid, p_tenant).status_code == 200
    detail = client.get(f"/api/v1/contracts/{cid}").json()
    assert {p["id"]: p for p in detail["parties"]}[p_owner]["can_sign_now"] is True
    assert _batch_sign(api.login(owner), cid, p_owner).status_code == 200
    detail = client.get(f"/api/v1/contracts/{cid}").json()
    assert detail["status"] in ("signed", "completed")


def test_contract_expiry_blocks_signing_and_send_renews(api):
    """过期：签署 409、状态置 expired、零留痕；重新发送续期后可继续签。"""
    staff = api.mk_user(UserRole.employee)
    tenant = api.mk_user(UserRole.tenant)
    client = api.login(staff)
    cid = _generate(client)
    pid = _add_party(client, cid, name="张三", role="tenant", user_id=tenant.id)

    # 已发链接后把合同置为过期（模拟有效期到点）
    share = client.post(f"/api/v1/contracts/{cid}/share-link", json={"party_id": pid})
    token = share.json()["token"]
    with Session(api.engine) as s:
        c = s.get(Contract, uuid.UUID(cid))
        c.expires_at = datetime.utcnow() - timedelta(minutes=1)
        c.status = ContractStatus.sent
        s.add(c)
        s.commit()

    # 免登录页明确告知过期（410），签署接口 409
    expired_page = TestClient(app).get(f"/api/v1/public/contract-sign/{token}")
    assert expired_page.status_code == 410, expired_page.text
    r = _batch_sign(api.login(tenant), cid, pid)
    assert r.status_code == 409, r.text
    with Session(api.engine) as s:
        c = s.get(Contract, uuid.UUID(cid))
        assert c.status == ContractStatus.expired
        assert s.exec(
            select(SignatureRecord).where(SignatureRecord.contract_id == uuid.UUID(cid))
        ).first() is None

    # 重新发送：续期并把状态拉回签署中
    client = api.login(staff)  # 上一段切换过登录身份，恢复员工视角
    r = client.post(
        f"/api/v1/contracts/{cid}/send",
        json={"channels": ["in_app"], "sign_expires_in_days": 1},
    )
    assert r.status_code == 200, r.text
    with Session(api.engine) as s:
        c = s.get(Contract, uuid.UUID(cid))
        assert c.status == ContractStatus.sent
        assert c.expires_at and c.expires_at > datetime.utcnow()

    assert _batch_sign(api.login(tenant), cid, pid).status_code == 200


def test_callback_delivery_retry_and_idempotency(api, monkeypatch):
    """签署完成回调：失败可见可重试；HMAC 可验；重投幂等（已投递不再发）。"""
    import hmac
    import httpx as httpx_module

    staff = api.mk_user(UserRole.employee)
    tenant = api.mk_user(UserRole.tenant)
    client = api.login(staff)
    cid = _generate(client)
    pid = _add_party(client, cid, name="张三", role="tenant", user_id=tenant.id)

    r = client.post(
        f"/api/v1/contracts/{cid}/callback", json={"url": "https://example.com/hook"}
    )
    assert r.status_code == 200, r.text
    secret = r.json()["callback_secret"]
    assert secret

    def boom(*args, **kwargs):
        raise httpx_module.ConnectError("connection refused")

    monkeypatch.setattr(httpx_module, "post", boom)
    # 回调失败不得影响签署结果
    assert _batch_sign(api.login(tenant), cid, pid).status_code == 200
    client = api.login(staff)  # 恢复员工视角再查回调记录
    events = client.get(f"/api/v1/contracts/{cid}/callbacks").json()
    assert len(events) == 1
    # 首投失败后进入计划重投（30s/2m/10m），不再是同步 3 连击
    assert events[0]["status"] == "pending" and events[0]["attempts"] == 1
    assert events[0]["next_attempt_at"]
    assert events[0]["idempotency_key"] == f"{cid}:contract.signed"

    captured = {}

    class _Ok:
        status_code = 200

    def ok(url, content=None, headers=None, timeout=None):
        captured.update(url=url, content=content, headers=headers)
        return _Ok()

    monkeypatch.setattr(httpx_module, "post", ok)
    r = client.post(f"/api/v1/contracts/{cid}/callback/retry")
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "delivered"
    assert r.json()["attempts"] == 2
    body = captured["content"]
    assert captured["headers"]["X-Idempotency-Key"] == f"{cid}:contract.signed"
    expect_sig = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    assert captured["headers"]["X-Contract-Signature"] == expect_sig
    assert hashlib.sha256(body).hexdigest()  # 请求体为 JSON bytes

    # 已投递成功：再点重试不会重复投递
    calls = []
    monkeypatch.setattr(httpx_module, "post", lambda *a, **k: calls.append(1))
    r = client.post(f"/api/v1/contracts/{cid}/callback/retry")
    assert r.json()["status"] == "delivered"
    assert calls == []


def test_company_seal_library_permissions(api):
    """企业印章库：员工可建；非员工 403；个人列表不混入企业印章；删除限创建人/管理员。"""
    staff = api.mk_user(UserRole.employee)
    other_staff = api.mk_user(UserRole.agent)
    admin = api.mk_user(UserRole.admin)
    tenant = api.mk_user(UserRole.tenant)
    png = kaifang_sign_service.get_engine().make_seal("测试公司", "合同专用")
    data_url = "data:image/png;base64," + base64.b64encode(png).decode("ascii")

    client = api.login(staff)
    r = client.post(
        "/api/v1/sign-assets",
        json={"name": "公司公章", "asset_type": "seal", "source": "upload",
              "scope": "company", "seal_type": "legal_rep", "data_url": data_url},
    )
    assert r.status_code == 200, r.text
    seal_id = r.json()["id"]
    assert r.json()["scope"] == "company"
    assert r.json()["seal_type"] == "legal_rep"

    # 企业印章类别只允许 company/contract/legal_rep
    r = client.post(
        "/api/v1/sign-assets",
        json={"name": "非法类别", "asset_type": "seal", "scope": "company",
              "seal_type": "bogus", "data_url": data_url},
    )
    assert r.status_code == 400, r.text

    # 非员工不能建、不能看企业印章
    tclient = api.login(tenant)
    r = tclient.post(
        "/api/v1/sign-assets",
        json={"name": "冒充", "asset_type": "seal", "scope": "company", "data_url": data_url},
    )
    assert r.status_code == 403, r.text
    assert tclient.get("/api/v1/sign-assets?scope=company").status_code == 403

    # 其他员工可见；个人列表不混入
    oclient = api.login(other_staff)
    names = [a["name"] for a in oclient.get("/api/v1/sign-assets?scope=company").json()]
    assert "公司公章" in names
    mine = client.get("/api/v1/sign-assets").json()
    assert all(a["scope"] == "personal" for a in mine)

    # 非创建人员工不能删；管理员可删
    assert oclient.delete(f"/api/v1/sign-assets/{seal_id}").status_code == 404
    assert api.login(admin).delete(f"/api/v1/sign-assets/{seal_id}").status_code == 200


def test_tsa_timestamper_is_optional(monkeypatch):
    """可信时间戳默认关闭；配置 TSA_URL 后才构造客户端（不内置付费服务）。"""
    monkeypatch.setattr(settings, "TSA_URL", "")
    assert kaifang_sign_service._make_timestamper() is None
    monkeypatch.setattr(settings, "TSA_URL", "https://tsa.example.com/")
    assert kaifang_sign_service._make_timestamper() is not None


def test_callback_emits_declined_and_voided(api, monkeypatch):
    """拒签导致流程终止 → contract.declined；作废 → contract.voided。"""
    import httpx as httpx_module

    staff = api.mk_user(UserRole.employee)
    tenant = api.mk_user(UserRole.tenant)
    client = api.login(staff)
    calls = []

    class _Ok:
        status_code = 204

    def ok(url=None, content=None, headers=None, timeout=None):
        calls.append(headers.get("X-Idempotency-Key"))
        return _Ok()

    monkeypatch.setattr(httpx_module, "post", ok)

    cid = _generate(client)
    pid = _add_party(client, cid, name="张三", role="tenant", user_id=tenant.id)
    r = client.post(
        f"/api/v1/contracts/{cid}/callback", json={"url": "https://example.com/hook"}
    )
    assert r.status_code == 200, r.text
    r = client.post(
        f"/api/v1/contracts/{cid}/decline",
        json={"party_id": pid, "reason": "条款不认可"},
    )
    assert r.status_code == 200, r.text
    assert f"{cid}:contract.declined" in calls
    events = client.get(f"/api/v1/contracts/{cid}/callbacks").json()
    assert [(e["event"], e["status"]) for e in events] == [("contract.declined", "delivered")]

    cid2 = _generate(client)
    r = client.post(
        f"/api/v1/contracts/{cid2}/callback", json={"url": "https://example.com/hook"}
    )
    assert r.status_code == 200, r.text
    r = client.post(f"/api/v1/contracts/{cid2}/void", json={"reason": "信息有误"})
    assert r.status_code == 200, r.text
    assert f"{cid2}:contract.voided" in calls


def test_housekeeping_sweeps_expired_and_retries_callbacks(api, monkeypatch):
    """后台任务：过期扫描落库 expired；到期的 pending 回调按计划补投。"""
    import httpx as httpx_module

    from app.models import ContractCallbackEvent, ContractCallbackStatus
    from app.services import contract_jobs

    staff = api.mk_user(UserRole.employee)
    client = api.login(staff)
    cid = _generate(client)
    tenant = api.mk_user(UserRole.tenant)

    with Session(api.engine) as s:
        contract = s.get(Contract, uuid.UUID(cid))
        contract.expires_at = datetime.utcnow() - timedelta(minutes=1)
        # 配置回调地址：过期时补发 contract.expired
        contract.callback_url = "https://example.com/hook"
        s.add(contract)
        s.add(
            ContractParty(
                contract_id=uuid.UUID(cid),
                user_id=tenant.id,
                name="张三",
                email="tenant@example.com",
                role=SignerRole.tenant,
            )
        )
        s.commit()

    delivered = []

    class _Ok:
        status_code = 200

    def ok(url=None, content=None, headers=None, timeout=None):
        delivered.append(headers["X-Idempotency-Key"])
        return _Ok()

    monkeypatch.setattr(httpx_module, "post", ok)
    with Session(api.engine) as s:
        assert contract_jobs.expire_due_contracts(s) == 1
        assert s.get(Contract, uuid.UUID(cid)).status == ContractStatus.expired
    assert contract_jobs.housekeeping_snapshot()["expired_count"] == 1

    # 过期补发回调 + 站内通知（邮件失败只记日志，不影响状态）
    assert f"{cid}:contract.expired" in delivered
    with Session(api.engine) as s:
        expired_event = s.exec(
            select(ContractCallbackEvent).where(
                ContractCallbackEvent.idempotency_key == f"{cid}:contract.expired"
            )
        ).one()
        assert expired_event.status == ContractCallbackStatus.delivered
        assert expired_event.payload["status"] == "expired"
        notes = s.exec(
            select(Notification).where(
                Notification.related_entity_id == uuid.UUID(cid),
                Notification.template_key == "contract_expired",
            )
        ).all()
        assert [n.user_id for n in notes] == [tenant.id]

    # 再跑一轮：状态已终态，不重复通知、不重复发事件
    with Session(api.engine) as s:
        assert contract_jobs.expire_due_contracts(s) == 0
    assert delivered.count(f"{cid}:contract.expired") == 1

    with Session(api.engine) as s:
        s.add(
            ContractCallbackEvent(
                contract_id=uuid.UUID(cid),
                event="contract.signed",
                url="https://example.com/hook",
                payload={"event": "contract.signed"},
                idempotency_key=f"{cid}:contract.signed",
                status=ContractCallbackStatus.pending,
                attempts=1,
                next_attempt_at=datetime.utcnow() - timedelta(seconds=1),
            )
        )
        s.commit()

    with Session(api.engine) as s:
        assert contract_jobs.retry_due_callbacks(s) == 1
    assert delivered[-1] == f"{cid}:contract.signed"
    with Session(api.engine) as s:
        event = s.exec(
            select(ContractCallbackEvent).where(
                ContractCallbackEvent.idempotency_key == f"{cid}:contract.signed"
            )
        ).one()
        assert event.status == ContractCallbackStatus.delivered

    # 可观测快照：本轮重投 1 条、投递 0 失败
    snapshot = contract_jobs.housekeeping_snapshot()
    assert snapshot["retried_count"] == 1
    assert snapshot["failed_count"] == 0
    assert snapshot["last_run_at"] is None or isinstance(snapshot["last_run_at"], str)
    health = TestClient(app).get("/health/housekeeping")
    assert health.status_code == 200
    assert {"last_run_at", "expired_count", "retried_count", "failed_count"} <= set(health.json())


def test_list_exposes_sign_error_for_staff_only(api):
    """签章失败在员工合同列表直接可见；非员工视角不下发该字段。"""
    staff = api.mk_user(UserRole.employee)
    client = api.login(staff)
    cid = _generate(client)
    ok_id = _generate(client)

    with Session(api.engine) as s:
        broken = s.get(Contract, uuid.UUID(cid))
        broken.last_sign_error = "SealError: engine timeout"
        broken.last_sign_error_at = datetime.utcnow()
        s.add(broken)
        s.commit()

    items = client.get("/api/v1/contracts").json()
    by_id = {i["id"]: i for i in items}
    assert by_id[cid]["sign_error"] is True
    assert "SealError" in by_id[cid]["sign_error_message"]
    assert by_id[ok_id]["sign_error"] is False

    tenant = api.mk_user(UserRole.tenant)
    tclient = api.login(tenant)
    assert tclient.get("/api/v1/contracts").json() == []


def test_share_link_rotation_invalidates_old_token(api):
    """显式「重新生成链接」：旧 token 立即失效、新 token 可用、操作留痕；无在途链接时 409。"""
    staff = api.mk_user(UserRole.employee)
    client = api.login(staff)
    cid = _generate(client)
    pid = _add_party(client, cid, name="张三", role="tenant")

    r1 = client.post(
        f"/api/v1/contracts/{cid}/share-link", json={"party_id": pid, "reuse": True}
    )
    assert r1.status_code == 200, r1.text
    old_token = r1.json()["token"]

    r2 = client.post(
        f"/api/v1/contracts/{cid}/share-link", json={"party_id": pid, "rotate": True}
    )
    assert r2.status_code == 200, r2.text
    body = r2.json()
    assert body["rotated"] is True
    assert body["previous_invalidated"] is True
    assert body["token"] != old_token

    visitor = TestClient(app)  # 未登录访客：旧链接 404、新链接 200
    assert visitor.get(f"/api/v1/public/contract-sign/{old_token}").status_code == 404
    assert visitor.get(f"/api/v1/public/contract-sign/{body['token']}").status_code == 200

    with Session(api.engine) as s:
        c = s.get(Contract, uuid.UUID(cid))
        trail = (c.counters or {}).get("link_rotations") or []
        assert len(trail) == 1
        assert trail[0]["party_id"] == pid
        assert trail[0]["by"] == str(staff.id)

        # 令牌过期后不再提供「重新生成」（前端隐藏入口，后端同样拒绝）
        p = s.get(ContractParty, uuid.UUID(pid))
        p.sign_token_expires_at = datetime.utcnow() - timedelta(seconds=1)
        s.add(p)
        s.commit()
    r3 = client.post(
        f"/api/v1/contracts/{cid}/share-link", json={"party_id": pid, "rotate": True}
    )
    assert r3.status_code == 409, r3.text


# --------------------------------------------------------------------------- 匿名态制章
def test_retry_due_callbacks_claim_is_exclusive(api, monkeypatch):
    """R10/#3：抢占比投递先落库——另一 worker 在投递期间跑一轮不会重复投递。"""
    import httpx as httpx_module

    from app.models import ContractCallbackEvent, ContractCallbackStatus
    from app.services import contract_jobs

    staff = api.mk_user(UserRole.employee)
    client = api.login(staff)
    cid = _generate(client)

    with Session(api.engine) as s:
        s.add(
            ContractCallbackEvent(
                contract_id=uuid.UUID(cid),
                event="contract.signed",
                url="https://example.com/hook",
                payload={"event": "contract.signed"},
                idempotency_key=f"{cid}:contract.signed",
                status=ContractCallbackStatus.pending,
                attempts=1,
                next_attempt_at=datetime.utcnow() - timedelta(seconds=1),
            )
        )
        s.commit()

    calls = []
    second_worker_processed = None

    class _Ok:
        status_code = 200

    def post(url=None, content=None, headers=None, timeout=None):
        nonlocal second_worker_processed
        calls.append(headers["X-Idempotency-Key"])
        if second_worker_processed is None:
            # 第一个 worker 正在投递：此时 next_attempt_at 已被推到 now+120s，
            # 另一个 worker 同时扫一轮应当扫不到这条事件。
            with Session(api.engine) as s2:
                second_worker_processed = contract_jobs.retry_due_callbacks(s2)
        return _Ok()

    monkeypatch.setattr(httpx_module, "post", post)
    with Session(api.engine) as s:
        assert contract_jobs.retry_due_callbacks(s) == 1
    assert second_worker_processed == 0, "并发 worker 不应重复投递同一条回调"
    assert calls == [f"{cid}:contract.signed"]


def test_lock_contract_row_refreshes_identity_map(api):
    """R10：拿到行锁后强制重读，后到者必须看到前者已提交的最新状态。"""
    from app.api.v1.contracts import _lock_contract_row

    staff = api.mk_user(UserRole.employee)
    client = api.login(staff)
    cid = _generate(client)

    with Session(api.engine) as s:
        contract = s.get(Contract, uuid.UUID(cid))
        assert contract.status == ContractStatus.draft
        # 模拟另一事务已提交作废：当前 session 身份映射里仍是旧状态
        with Session(api.engine) as other:
            row = other.get(Contract, uuid.UUID(cid))
            row.status = ContractStatus.voided
            other.add(row)
            other.commit()
        assert contract.status == ContractStatus.draft
        assert _lock_contract_row(s, contract).status == ContractStatus.voided


def test_public_seal_preview_allows_anonymous():
    """R11：公开签署页匿名生成模板公章不再 401（纯计算、不落库）。"""
    client = TestClient(app)  # 不带任何登录依赖覆盖，模拟未登录访客
    r = client.post(
        "/api/v1/public/contract-sign/seal/preview",
        json={"company_name": "北京示例科技有限公司", "middle_text": "合同专用章"},
    )
    assert r.status_code == 200, r.text
    data_url = r.json()["data_url"]
    assert data_url.startswith("data:image/png;base64,")
    assert len(data_url) > 1000, "应返回真实渲染的 PNG"

    # 缺公司名 → 400，避免空章
    r2 = client.post(
        "/api/v1/public/contract-sign/seal/preview",
        json={"company_name": "   "},
    )
    assert r2.status_code == 400, r2.text


# --------------------------------------------------------------------------- R6 严格判定
def test_strict_completion_requires_fields_actually_signed(api):
    """R6：只有被落章实际覆盖的必签区才置已签，缺字段的合同不会被判完成。"""
    staff = api.mk_user(UserRole.employee)
    tenant = api.mk_user(UserRole.tenant)
    client = api.login(staff)
    cid = _generate(client)
    pid = _add_party(client, cid, name="张三", role="tenant", user_id=tenant.id)
    _add_fields(
        client,
        cid,
        [
            {"party_id": pid, "field_type": "signature", "page": 1,
             "x": 20, "y": 60, "w": 22, "h": 8, "required": True},
            {"party_id": pid, "field_type": "date", "page": 1,
             "x": 62, "y": 60, "w": 22, "h": 8, "required": True},
        ],
    )

    # 只在第一个必签区落章；第二个必签区没有被覆盖
    r = _batch_sign(api.login(tenant), cid, pid, page=1, x=20, y=60)
    assert r.status_code == 200, r.text
    assert r.json()["signed"] is True
    assert r.json()["contract_status"] == "partially_signed", r.text

    with Session(api.engine) as s:
        c = s.get(Contract, uuid.UUID(cid))
        assert c.status == ContractStatus.partially_signed, "缺必签区不得判完成"
        fields = s.exec(
            select(ContractSignField).where(
                ContractSignField.contract_id == uuid.UUID(cid),
                ContractSignField.required.is_(True),
            )
        ).all()
        assert sorted(f.signed for f in fields) == [False, True], (
            "只应标记被落章覆盖的必签区，未覆盖的保持未签"
        )


# --------------------------------------------------------------------------- 合同撤回
def test_revoke_contract_invalidates_links_notifies_and_callback(api, monkeypatch):
    """撤回：终态 revoked、旧链接失效、通知未签方、发 contract.revoked 回调、留痕。"""
    import httpx as httpx_module

    staff = api.mk_user(UserRole.employee)
    tenant = api.mk_user(UserRole.tenant)
    landlord = api.mk_user(UserRole.owner)
    client = api.login(staff)
    cid = _generate(client)
    tp = _add_party(client, cid, name="张三", role="tenant", user_id=tenant.id)
    op = _add_party(client, cid, name="王五（业主）", role="landlord", user_id=landlord.id)

    # 一方已签，另一方拿链接
    assert _batch_sign(api.login(tenant), cid, tp).status_code == 200
    client = api.login(staff)
    token = client.post(
        f"/api/v1/contracts/{cid}/share-link", json={"party_id": op}
    ).json()["token"]
    client.post(f"/api/v1/contracts/{cid}/callback", json={"url": "https://example.com/hook"})

    delivered: list = []

    class _Ok:
        status_code = 200

    def ok(url, content=None, headers=None, timeout=None):
        delivered.append({"url": url, "headers": headers, "content": content})
        return _Ok()

    monkeypatch.setattr(httpx_module, "post", ok)

    r = client.post(f"/api/v1/contracts/{cid}/revoke", json={"reason": "价格条款有误"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "revoked"

    # 旧签署链接立即失效
    assert TestClient(app).get(f"/api/v1/public/contract-sign/{token}").status_code == 404

    # 对外回调 contract.revoked
    events = client.get(f"/api/v1/contracts/{cid}/callbacks").json()
    assert [e["event"] for e in events] == ["contract.revoked"], events
    assert events[0]["idempotency_key"] == f"{cid}:contract.revoked"
    assert events[0]["status"] == "delivered"

    with Session(api.engine) as s:
        # 未签方收到站内通知
        notes = s.exec(
            select(Notification).where(Notification.template_key == "contract_revoked")
        ).all()
        assert [n.user_id for n in notes] == [landlord.id], notes
        # 操作留痕
        c = s.get(Contract, uuid.UUID(cid))
        assert c.counters["revocations"][0]["reason"] == "价格条款有误"
        assert c.counters["revocations"][0]["by"] == str(staff.id)
        # 已签方签名与留痕保留
        signed_party = s.get(ContractParty, uuid.UUID(tp))
        assert signed_party.signed and signed_party.signature
        # 未签方令牌被清空
        pending = s.get(ContractParty, uuid.UUID(op))
        assert pending.sign_token is None and pending.sign_token_expires_at is None

    # 二次撤回 → 409
    assert client.post(f"/api/v1/contracts/{cid}/revoke", json={}).status_code == 409

    # 已签署完成的合同不允许撤回（走作废）
    cid2 = _generate(client)
    _add_party(client, cid2, name="李四", role="tenant", user_id=tenant.id)
    with Session(api.engine) as s:
        c2 = s.get(Contract, uuid.UUID(cid2))
        c2.status = ContractStatus.signed
        s.add(c2)
        s.commit()
    r = client.post(f"/api/v1/contracts/{cid2}/revoke", json={})
    assert r.status_code == 409, r.text


# --------------------------------------------------------------------------- 过期续期
def test_renew_after_expiry_rotates_links_and_keeps_signatures(api):
    """续期：expired 拉回签署中、重签链接、记录次数、已签签名与存档不被破坏。"""
    staff = api.mk_user(UserRole.employee)
    tenant = api.mk_user(UserRole.tenant)
    landlord = api.mk_user(UserRole.owner)
    client = api.login(staff)
    cid = _generate(client)
    tp = _add_party(client, cid, name="张三", role="tenant", user_id=tenant.id)
    op = _add_party(client, cid, name="王五（业主）", role="landlord", user_id=landlord.id)

    # 第一方签署：留下签名与已签 PDF 存档
    assert _batch_sign(api.login(tenant), cid, tp).status_code == 200
    client = api.login(staff)
    old_token = client.post(
        f"/api/v1/contracts/{cid}/share-link", json={"party_id": op}
    ).json()["token"]
    with Session(api.engine) as s:
        c = s.get(Contract, uuid.UUID(cid))
        signed_pdf_before = c.signed_pdf_path
        party_before = s.get(ContractParty, uuid.UUID(tp))
        sig_before = party_before.signature
        signed_at_before = party_before.signed_at
        c.expires_at = datetime.utcnow() - timedelta(minutes=1)
        s.add(c)
        s.commit()

    # 惰性过期：状态置 expired
    assert TestClient(app).get(f"/api/v1/public/contract-sign/{old_token}").status_code == 410
    with Session(api.engine) as s:
        assert s.get(Contract, uuid.UUID(cid)).status == ContractStatus.expired

    # 重新发送 = 续期：拉回签署中、重签链接、记录续期次数与时间
    r = client.post(
        f"/api/v1/contracts/{cid}/send",
        json={"channels": ["in_app"], "sign_expires_in_days": 1},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["renewed"] is True and body["renewal_count"] == 1, body

    with Session(api.engine) as s:
        c = s.get(Contract, uuid.UUID(cid))
        assert c.status == ContractStatus.partially_signed, "有已签方时续期应回到部分签署"
        assert c.expires_at and c.expires_at > datetime.utcnow()
        renewals = c.counters["renewals"]
        assert len(renewals) == 1 and renewals[0]["by"] == str(staff.id)
        assert renewals[0]["expires_at"] == c.expires_at.isoformat()

        # 已签签名、签署时间与已签存档均保持不变
        party_after = s.get(ContractParty, uuid.UUID(tp))
        assert party_after.signed and party_after.signature == sig_before
        assert party_after.signed_at == signed_at_before
        assert c.signed_pdf_path == signed_pdf_before

        # 未签方链接已换新，旧链接失效
        pending = s.get(ContractParty, uuid.UUID(op))
        assert pending.sign_token and pending.sign_token != old_token
        new_token = pending.sign_token

        # 续期通知走 contract_renewed 模板，只发给未签方
        notes = s.exec(
            select(Notification).where(Notification.template_key == "contract_renewed")
        ).all()
        assert [n.user_id for n in notes] == [landlord.id], notes

    assert TestClient(app).get(f"/api/v1/public/contract-sign/{old_token}").status_code == 404
    assert TestClient(app).get(f"/api/v1/public/contract-sign/{new_token}").status_code == 200

    # 已签方的内嵌数字签名仍然有效（续期未破坏签名）
    rep = client.get(f"/api/v1/contracts/{cid}/verify").json()
    assert rep["pdf_signed"] is True
    assert rep["pdf_signature_valid_all"] is True, rep["pdf_signature"]

    # 未过期再次发送不算续期，次数不增长
    r = client.post(f"/api/v1/contracts/{cid}/send", json={"channels": ["in_app"]})
    assert r.status_code == 200
    assert r.json()["renewed"] is False and r.json()["renewal_count"] == 1


# ----------------------------------------------------------------- 报表终止类聚合
def test_contract_stats_terminated_aggregate(api):
    """三种终止态各一条：终止类 = 3，且作废/拒签各自计数保持不变。"""
    staff = api.mk_user(UserRole.employee)
    client = api.login(staff)
    ids = [_generate(client) for _ in range(4)]

    with Session(api.engine) as s:
        for cid, status in zip(
            ids[:3],
            [ContractStatus.voided, ContractStatus.rejected, ContractStatus.revoked],
        ):
            c = s.get(Contract, uuid.UUID(cid))
            c.status = status
            s.add(c)
        s.commit()

    r = client.get("/api/v1/contracts/stats")
    assert r.status_code == 200, r.text
    d = r.json()

    # 归期口径固定为 created_at，端上不必再各自解释
    assert d["period"]["basis"] == "created_at"
    assert d["total"] == 4

    # 原有各项计数照旧独立呈现
    assert d["by_status"]["voided"] == 1
    assert d["by_status"]["rejected"] == 1
    assert d["by_status"]["revoked"] == 1
    assert d["by_status"]["draft"] == 1

    # 新增聚合列 = 三者之和
    assert d["terminated"]["count"] == 3
    assert d["terminated"]["components"] == {
        "voided": 1,
        "rejected": 1,
        "revoked": 1,
    }
    assert d["terminated"]["rate"] == 0.75


# --------------------------------------------------------------------- 审计日志
def _audit_rows(engine):
    with Session(engine) as s:
        return s.exec(
            select(ContractAuditLog).order_by(ContractAuditLog.created_at.asc())
        ).all()


def test_contract_audit_log_covers_key_actions(api):
    """每种关键动作各触发一条审计，且字段完整。"""
    staff = api.mk_user(UserRole.employee)
    tenant = api.mk_user(UserRole.tenant)
    outsider = api.mk_user(UserRole.tenant)
    staff_client = api.login(staff)

    # 1) 创建
    cid = _generate(staff_client)
    party_id = _add_party(
        staff_client, cid, name="张三", role="tenant", user_id=tenant.id
    )
    _add_fields(
        staff_client,
        cid,
        [
            {"party_id": party_id, "field_type": "signature", "page": 1,
             "x": 20, "y": 60, "w": 20, "h": 8, "required": True},
        ],
    )

    # 2) 撤销/重新生成链接（先建一条在途链接再 rotate）
    r = staff_client.post(
        f"/api/v1/contracts/{cid}/share-link", json={"party_id": party_id}
    )
    assert r.status_code == 200, r.text
    r = staff_client.post(
        f"/api/v1/contracts/{cid}/share-link",
        json={"party_id": party_id, "rotate": True},
    )
    assert r.status_code == 200, r.text

    # 3) 发送
    r = staff_client.post(f"/api/v1/contracts/{cid}/send", json={"channels": ["in_app"]})
    assert r.status_code == 200, r.text

    # 4) 签署（切换身份后，后续员工操作需重新登录，依赖覆盖是全局的）
    r = _batch_sign(api.login(tenant), cid, party_id)
    assert r.status_code == 200, r.text
    assert r.json()["pdf_signed"] is True

    staff_client = api.login(staff)

    # 5) 下载已签件 / 存证报告
    assert staff_client.get(f"/api/v1/contracts/{cid}/signed-file").status_code == 200
    assert staff_client.get(f"/api/v1/contracts/{cid}/evidence-report").status_code == 200

    # 6) 作废
    r = staff_client.post(
        f"/api/v1/contracts/{cid}/void", json={"reason": "审计用例作废"}
    )
    assert r.status_code == 200, r.text

    # 7) 撤回（另建一条，避免状态互斥）
    cid_revoke = _generate(staff_client)
    _add_party(staff_client, cid_revoke, name="李四", role="tenant")
    r = staff_client.post(
        f"/api/v1/contracts/{cid_revoke}/revoke", json={"reason": "审计用例撤回"}
    )
    assert r.status_code == 200, r.text

    # 8) 续期（过期后 send）
    cid_renew = _generate(staff_client)
    _add_party(staff_client, cid_renew, name="王五", role="tenant")
    with Session(api.engine) as s:
        c = s.get(Contract, uuid.UUID(cid_renew))
        c.expires_at = datetime.utcnow() - timedelta(days=1)
        s.add(c)
        s.commit()
    r = staff_client.post(
        f"/api/v1/contracts/{cid_renew}/send", json={"channels": ["in_app"]}
    )
    assert r.status_code == 200, r.text
    assert r.json()["renewed"] is True

    # 9) 拒签
    cid_decline = _generate(staff_client)
    party_decline = _add_party(
        staff_client, cid_decline, name="赵六", role="tenant", user_id=tenant.id
    )
    r = api.login(tenant).post(
        f"/api/v1/contracts/{cid_decline}/decline",
        json={"party_id": party_decline, "reason": "审计用例拒签"},
    )
    assert r.status_code == 200, r.text

    # 10) 权限拒绝：无关租客读员工合同 → 404，但落审计
    assert api.login(outsider).get(f"/api/v1/contracts/{cid}").status_code == 404

    rows = _audit_rows(api.engine)
    actions = {row.action for row in rows}
    expected = {
        contract_audit.ACTION_CREATE,
        contract_audit.ACTION_SEND,
        contract_audit.ACTION_RENEW,
        contract_audit.ACTION_SIGN,
        contract_audit.ACTION_DECLINE,
        contract_audit.ACTION_VOID,
        contract_audit.ACTION_REVOKE,
        contract_audit.ACTION_LINK_ROTATE,
        contract_audit.ACTION_DOWNLOAD_SIGNED,
        contract_audit.ACTION_DOWNLOAD_EVIDENCE,
        contract_audit.ACTION_PERMISSION_DENIED,
    }
    assert expected <= actions, f"缺少审计动作: {expected - actions}"

    # 字段完整性：操作人/角色/目标/时间/IP/结果
    for row in rows:
        assert row.contract_id is not None
        assert row.action
        assert row.actor_role in ("admin", "agent", "employee", "owner", "tenant", "signer")
        assert row.target_type == "contract"
        assert row.target_id == str(row.contract_id)
        assert row.created_at is not None
        assert row.ip, f"审计缺少 IP: {row.action}"
        assert row.result in ("success", "failure")

    denied = [r for r in rows if r.action == contract_audit.ACTION_PERMISSION_DENIED]
    assert len(denied) == 1
    assert denied[0].result == "failure"
    assert denied[0].error == "contract_not_visible"


def test_contract_audit_failure_does_not_block(api, monkeypatch, caplog):
    """审计写入失败：主流程仍成功，且有告警日志。"""
    staff = api.mk_user(UserRole.employee)
    client = api.login(staff)
    cid = _generate(client)
    _add_party(client, cid, name="张三", role="tenant")

    def _boom(session, entry):
        raise RuntimeError("audit-db-down")

    monkeypatch.setattr(contract_audit, "_persist", _boom)

    with caplog.at_level("ERROR"):
        r = client.post(f"/api/v1/contracts/{cid}/void", json={"reason": "x"})

    assert r.status_code == 200, r.text
    assert r.json()["status"] == "voided"
    assert any("contract.audit_write_failed" in rec.message for rec in caplog.records)
    # 只有 void 这条审计被拦截（create 在注入失败前已正常落库）
    assert [
        row for row in _audit_rows(api.engine)
        if row.action == contract_audit.ACTION_VOID
    ] == []


# ------------------------------------------------------- 催办 / 多回调订阅（本轮新增）
def test_contract_remind_sends_once_and_throttles(api):
    """催办一次只发一条站内信；同一方 24 小时内重复催办被抑制；超 24h 可再催。"""
    staff = api.mk_user(UserRole.employee)
    tenant = api.mk_user(UserRole.tenant)
    client = api.login(staff)

    cid = _generate(client)
    party_id = _add_party(
        client, cid, name="张三", role="tenant", user_id=tenant.id
    )
    r = client.post(f"/api/v1/contracts/{cid}/send", json={"channels": ["in_app"]})
    assert r.status_code == 200, r.text

    r = client.post(f"/api/v1/contracts/{cid}/remind", json={})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["reminded"] == 1 and body["throttled"] == 0, body
    assert body["results"][0]["channels"] == ["in_app"], body

    with Session(api.engine) as s:
        notes = s.exec(
            select(Notification).where(Notification.template_key == "contract_reminder")
        ).all()
        # 一次催办 = 一条站内信（该方无邮箱，邮件通道自动跳过）
        assert len(notes) == 1 and notes[0].user_id == tenant.id, notes
        party = s.get(ContractParty, uuid.UUID(party_id))
        assert party.reminded_count == 1 and party.last_reminded_at is not None

    # 24 小时内重复催办：不新增任何通知
    r = client.post(f"/api/v1/contracts/{cid}/remind", json={})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["reminded"] == 0 and body["throttled"] == 1, body
    assert body["results"][0]["reason"] == "throttled", body
    with Session(api.engine) as s:
        assert len(
            s.exec(
                select(Notification).where(
                    Notification.template_key == "contract_reminder"
                )
            ).all()
        ) == 1

    # 把上次催办时间拨回 25 小时前，可再次催办
    with Session(api.engine) as s:
        party = s.get(ContractParty, uuid.UUID(party_id))
        party.last_reminded_at = datetime.utcnow() - timedelta(hours=25)
        s.add(party)
        s.commit()

    r = client.post(f"/api/v1/contracts/{cid}/remind", json={"party_id": party_id})
    assert r.status_code == 200, r.text
    assert r.json()["reminded"] == 1
    with Session(api.engine) as s:
        party = s.get(ContractParty, uuid.UUID(party_id))
        assert party.reminded_count == 2
        assert len(
            s.exec(
                select(Notification).where(
                    Notification.template_key == "contract_reminder"
                )
            ).all()
        ) == 2

    # 已签/已拒签方不参与催办
    r = client.post(f"/api/v1/contracts/{cid}/remind", json={})
    assert r.status_code == 200
    assert r.json()["throttled"] == 1  # 仍在 24h 内


def test_multi_subscription_delivery_is_independent(api, monkeypatch):
    """两个订阅同时存在：一个失败另一个仍 delivered；旧单地址回调不被破坏。"""
    import httpx as httpx_module

    from app.api.v1.contracts import _emit_contract_callback

    staff = api.mk_user(UserRole.employee)
    client = api.login(staff)
    cid = _generate(client)
    _add_party(client, cid, name="张三", role="tenant")

    for url, label in (
        ("https://ok.example/hook", "ok"),
        ("https://bad.example/hook", "bad"),
    ):
        r = client.post(
            f"/api/v1/contracts/{cid}/subscriptions", json={"url": url, "label": label}
        )
        assert r.status_code == 200, r.text
    # 旧版单地址也配置上，验证有订阅时不会混入旧路径
    client.post(f"/api/v1/contracts/{cid}/callback", json={"url": "https://legacy.example/hook"})

    def fake_post(url, **kwargs):
        if "bad.example" in str(url):
            raise httpx_module.ConnectError("boom")
        return SimpleNamespace(status_code=200, text="ok")

    monkeypatch.setattr(httpx_module, "post", fake_post)

    with Session(api.engine) as s:
        contract = s.get(Contract, uuid.UUID(cid))
        contract.status = ContractStatus.signed
        s.add(contract)
        s.commit()
        _emit_contract_callback(s, contract, "contract.signed")

    with Session(api.engine) as s:
        events = s.exec(
            select(ContractCallbackEvent).where(
                ContractCallbackEvent.contract_id == uuid.UUID(cid)
            )
        ).all()
        by_url = {e.url: e for e in events}
        # 只投递给两个订阅，旧单地址不参与
        assert set(by_url) == {"https://ok.example/hook", "https://bad.example/hook"}, by_url
        assert by_url["https://ok.example/hook"].status == ContractCallbackStatus.delivered
        assert by_url["https://bad.example/hook"].status != ContractCallbackStatus.delivered
        assert all(e.subscription_id is not None for e in events)


def test_legacy_single_callback_still_works(api, monkeypatch):
    """未配置订阅时保持旧行为：单地址一份事件，幂等键不含订阅后缀。"""
    import httpx as httpx_module

    from app.api.v1.contracts import _emit_contract_callback

    staff = api.mk_user(UserRole.employee)
    client = api.login(staff)
    cid = _generate(client)
    _add_party(client, cid, name="张三", role="tenant")
    client.post(
        f"/api/v1/contracts/{cid}/callback", json={"url": "https://legacy.example/hook"}
    )

    monkeypatch.setattr(
        httpx_module,
        "post",
        lambda url, **kw: SimpleNamespace(status_code=200, text="ok"),
    )

    with Session(api.engine) as s:
        contract = s.get(Contract, uuid.UUID(cid))
        contract.status = ContractStatus.signed
        s.add(contract)
        s.commit()
        _emit_contract_callback(s, contract, "contract.signed")

    with Session(api.engine) as s:
        events = s.exec(
            select(ContractCallbackEvent).where(
                ContractCallbackEvent.contract_id == uuid.UUID(cid)
            )
        ).all()
        assert len(events) == 1
        assert events[0].url == "https://legacy.example/hook"
        assert events[0].subscription_id is None
        assert events[0].idempotency_key == f"{cid}:contract.signed"


# --------------------------------------------------------------------------- 代签授权链
def _grant_authorization(client, grantor_id, valid_until, **extra) -> str:
    body = {
        "grantor_user_id": str(grantor_id),
        "valid_until": valid_until.isoformat(),
    }
    body.update(extra)
    r = client.post("/api/v1/contracts/authorizations", json=body)
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _proxy_items():
    return [
        {
            "page": 1,
            "x": 20,
            "y": 88,
            "w": 22,
            "h": 8,
            "method": "personal_handwrite",
            "image_data_url": _png_stamp(),
        }
    ]


def test_proxy_sign_without_authorization_is_rejected(api):
    """无授权代签被拒，返回明确错误码且不留痕。"""
    staff = api.mk_user(UserRole.employee)
    tenant = api.mk_user(UserRole.tenant)
    client = api.login(staff)
    cid = _generate(client)
    pid = _add_party(client, cid, name="张三", role="tenant", user_id=tenant.id)

    r = client.post(
        f"/api/v1/contracts/{cid}/sign-proxy",
        json={"party_id": pid, "items": _proxy_items()},
    )
    assert r.status_code == 403, r.text
    assert r.json()["detail"] == "PROXY_AUTHORIZATION_MISSING"
    with Session(api.engine) as s:
        assert s.exec(select(SignatureRecord)).all() == []


def test_proxy_sign_expired_authorization_is_rejected(api):
    """授权过期后立即失效。"""
    staff = api.mk_user(UserRole.employee)
    tenant = api.mk_user(UserRole.tenant)
    client = api.login(staff)
    cid = _generate(client)
    pid = _add_party(client, cid, name="张三", role="tenant", user_id=tenant.id)
    _grant_authorization(
        client, tenant.id, datetime.utcnow() - timedelta(minutes=1)
    )

    r = client.post(
        f"/api/v1/contracts/{cid}/sign-proxy",
        json={"party_id": pid, "items": _proxy_items()},
    )
    assert r.status_code == 403, r.text
    assert r.json()["detail"] == "PROXY_AUTHORIZATION_EXPIRED"


def test_proxy_sign_revoked_authorization_is_rejected(api):
    """撤销后立即失效。"""
    staff = api.mk_user(UserRole.employee)
    tenant = api.mk_user(UserRole.tenant)
    client = api.login(staff)
    cid = _generate(client)
    pid = _add_party(client, cid, name="张三", role="tenant", user_id=tenant.id)
    aid = _grant_authorization(
        client, tenant.id, datetime.utcnow() + timedelta(days=7)
    )

    r = client.delete(f"/api/v1/contracts/authorizations/{aid}")
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "revoked"

    r = client.post(
        f"/api/v1/contracts/{cid}/sign-proxy",
        json={"party_id": pid, "items": _proxy_items()},
    )
    assert r.status_code == 403, r.text
    assert r.json()["detail"] == "PROXY_AUTHORIZATION_REVOKED"


def test_proxy_sign_scope_mismatch_is_rejected(api):
    """授权范围不覆盖该合同类型时拒绝。"""
    staff = api.mk_user(UserRole.employee)
    tenant = api.mk_user(UserRole.tenant)
    client = api.login(staff)
    cid = _generate(client)  # lease
    pid = _add_party(client, cid, name="张三", role="tenant", user_id=tenant.id)
    _grant_authorization(
        client,
        tenant.id,
        datetime.utcnow() + timedelta(days=7),
        contract_kinds=["purchase"],
    )

    r = client.post(
        f"/api/v1/contracts/{cid}/sign-proxy",
        json={"party_id": pid, "items": _proxy_items()},
    )
    assert r.status_code == 403, r.text
    assert r.json()["detail"] == "PROXY_AUTHORIZATION_SCOPE_MISMATCH"


def test_proxy_sign_with_authorization_is_traceable(api):
    """有授权代签成功：审计留痕、验签报告可区分、PDF 签名域写明代签与授权来源。"""
    import io

    from pyhanko.pdf_utils.reader import PdfFileReader
    from pyhanko.sign.validation.pdf_embedded import collect_embedded_signatures

    staff = api.mk_user(UserRole.employee)
    tenant = api.mk_user(UserRole.tenant)
    client = api.login(staff)
    cid = _generate(client)
    pid = _add_party(client, cid, name="张三", role="tenant", user_id=tenant.id)
    _add_party(client, cid, name="王五（业主）", role="landlord")
    aid = _grant_authorization(
        client,
        tenant.id,
        datetime.utcnow() + timedelta(days=7),
        contract_kinds=["lease"],
        seal_scope=["personal_handwrite"],
    )

    # 授权凭证上传 + 下载
    cred = client.post(
        f"/api/v1/contracts/authorizations/{aid}/credential",
        files={"file": ("auth.pdf", b"%PDF-1.4\n%%EOF\n", "application/pdf")},
    )
    assert cred.status_code == 200, cred.text
    stored = cred.json()["credential_path"]
    assert stored and stored.endswith(".pdf")
    cred_file = (
        pathlib.Path(__file__).resolve().parents[1] / "uploads" / "contracts" / "authorizations"
    ) / stored.rsplit("/", 1)[-1]
    assert client.get(
        f"/api/v1/contracts/authorizations/{aid}/credential"
    ).status_code == 200

    try:
        r = client.post(
            f"/api/v1/contracts/{cid}/sign-proxy",
            json={"party_id": pid, "items": _proxy_items()},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["proxy"] is True
        assert body["authorization_id"] == aid
        assert body["contract_status"] == "partially_signed"

        with Session(api.engine) as s:
            recs = s.exec(
                select(SignatureRecord).where(
                    SignatureRecord.party_id == uuid.UUID(pid)
                )
            ).all()
            assert len(recs) == 1
            assert str(recs[0].proxy_authorization_id) == aid
            assert recs[0].signer_user_id == staff.id  # 实际执行人=被授权员工

            logs = s.exec(
                select(ContractAuditLog).where(
                    ContractAuditLog.action == "contract.proxy_sign"
                )
            ).all()
            assert len(logs) == 1
            assert logs[0].detail["authorization_id"] == aid
            assert logs[0].detail["channel"] == "proxy"
            assert logs[0].actor_user_id == staff.id

            contract = s.get(Contract, uuid.UUID(cid))
            pdf_bytes = pathlib.Path(contract.signed_pdf_path).read_bytes()

        # PDF 签名域 Reason 写明「代签 + 授权来源」
        rdr = PdfFileReader(io.BytesIO(pdf_bytes))
        reasons = [
            str(sig.sig_object.get("/Reason") or "")
            for sig in collect_embedded_signatures(rdr)
        ]
        assert any("代签" in x and "授权" in x for x in reasons), reasons

        # 验签报告区分代签，且内嵌签名仍全部有效
        rep = client.get(f"/api/v1/contracts/{cid}/verify").json()
        mine = [
            x
            for x in rep["signatures"]
            if x["party_name"] == "张三" and not x["is_document_record"]
        ]
        assert mine and mine[0]["is_proxy"] is True
        assert mine[0]["proxy_authorization_id"] == aid
        assert rep["pdf_signature_valid_all"] is True
    finally:
        if cred_file.exists():
            cred_file.unlink()


# --------------------------------------------------------------------------- 模板库
def _create_template(client, *, name="测试租赁模板", clauses=None, fields=None) -> dict:
    body = {
        "name": name,
        "kind": "lease",
        "business_scope": "住宅租赁",
        "title": "房屋租赁合同",
        "fields": fields
        or [
            {"key": "monthly_rent", "label": "月租金（元）"},
            {"key": "tenant_name", "label": "租客姓名"},
        ],
        "clauses": clauses
        or [
            "月租金为人民币 {{monthly_rent}} 元。",
            "承租方：{{tenant_name}}。",
        ],
    }
    r = client.post("/api/v1/contracts/template-library", json=body)
    assert r.status_code == 200, r.text
    return r.json()


def test_template_generate_replaces_variables(api):
    """用模板生成合同：变量替换正确、记录模板版本、产出 PDF。"""
    staff = api.mk_user(UserRole.employee)
    client = api.login(staff)
    tpl = _create_template(client)
    assert tpl["version"] == 1
    assert tpl["variable_keys"] == ["monthly_rent", "tenant_name"]

    r = client.post(
        f"/api/v1/contracts/template-library/{tpl['id']}/generate",
        json={"variables": {"monthly_rent": "8800", "tenant_name": "张三"}},
    )
    assert r.status_code == 200, r.text
    cid = r.json()["id"]
    content = r.json()["content_html"]
    assert "8800" in content and "张三" in content
    assert "{{" not in content

    with Session(api.engine) as s:
        c = s.get(Contract, uuid.UUID(cid))
        assert str(c.template_id) == tpl["id"]
        assert c.template_version == 1
        assert c.counters == {"monthly_rent": "8800", "tenant_name": "张三"}
        assert c.document_hash
        assert c.pdf_path and pathlib.Path(c.pdf_path).exists()


def test_template_missing_variables_rejected(api):
    """缺必填变量时 400，并列出缺失项。"""
    staff = api.mk_user(UserRole.employee)
    client = api.login(staff)
    tpl = _create_template(client)
    r = client.post(
        f"/api/v1/contracts/template-library/{tpl['id']}/generate",
        json={"variables": {"monthly_rent": "8800"}},
    )
    assert r.status_code == 400, r.text
    assert "MISSING_TEMPLATE_VARIABLES" in r.json()["detail"]
    assert "tenant_name" in r.json()["detail"]


def test_template_edit_keeps_existing_contract_unchanged(api):
    """改模板后：已有合同正文不变，新合同用新版本，旧版本快照仍可查。"""
    staff = api.mk_user(UserRole.employee)
    client = api.login(staff)
    tpl = _create_template(client)

    vars_v1 = {"monthly_rent": "8800", "tenant_name": "张三"}
    r = client.post(
        f"/api/v1/contracts/template-library/{tpl['id']}/generate",
        json={"variables": vars_v1},
    )
    assert r.status_code == 200, r.text
    cid_v1 = r.json()["id"]
    content_v1 = r.json()["content_html"]

    # 编辑模板（v2）：改条款文案
    r = client.patch(
        f"/api/v1/contracts/template-library/{tpl['id']}",
        json={"clauses": ["月租金调整为人民币 {{monthly_rent}} 元（新版条款）。"]},
    )
    assert r.status_code == 200, r.text
    assert r.json()["version"] == 2

    # 已生成合同正文不变
    detail = client.get(f"/api/v1/contracts/{cid_v1}").json()
    assert detail["content_html"] == content_v1

    # 新生成合同使用 v2
    r = client.post(
        f"/api/v1/contracts/template-library/{tpl['id']}/generate",
        json={"variables": {"monthly_rent": "9900", "tenant_name": "李四"}},
    )
    assert r.status_code == 200, r.text
    assert r.json()["template_version"] == 2
    assert "新版条款" in r.json()["content_html"]
    assert "新版条款" not in content_v1

    # 版本历史：v1 快照保持旧文案
    versions = client.get(
        f"/api/v1/contracts/template-library/{tpl['id']}/versions"
    ).json()
    assert [v["version"] for v in versions] == [2, 1]
    v1 = client.get(
        f"/api/v1/contracts/template-library/{tpl['id']}/versions/1"
    ).json()
    assert v1["clauses"][0].startswith("月租金为人民币 {{monthly_rent}}")
    assert "新版条款" not in v1["clauses"][0]


def test_template_seed_covers_active_kinds(api):
    """一键导入覆盖当前在用的合同类型，重复调用幂等。"""
    staff = api.mk_user(UserRole.employee)
    client = api.login(staff)
    r = client.post("/api/v1/contracts/template-library/seed")
    assert r.status_code == 200, r.text
    kinds = {t["kind"] for t in r.json()["created"]}
    assert kinds == {"lease", "purchase", "broker"}
    assert r.json()["skipped"] == 0

    r2 = client.post("/api/v1/contracts/template-library/seed")
    assert r2.status_code == 200, r2.text
    assert r2.json()["created"] == []
    assert r2.json()["skipped"] == 3


# --------------------------------------------------------------------------- 骑缝章（仅新合同）
def _multi_page_pdf(engine, title="多页骑缝章测试合同") -> bytes:
    """条款足够多以强制多页（reportlab 自动分页）。"""
    clauses = [
        f"第 {i} 条：租赁双方应按约定履行义务，逾期支付租金的，每逾期一日按应付"
        "金额的千分之一承担违约金，并赔偿由此造成的其他损失。"
        for i in range(1, 41)
    ]
    return engine.render_document_pdf(
        title, [("甲方（出租人）", "张三"), ("乙方（承租人）", "李四")], clauses
    )


def _seal_images_by_page(pdf_bytes):
    """每页内嵌图片的 (xref, 位置矩形, 图片字节哈希) 列表。"""
    import fitz

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        pages = []
        for p in range(doc.page_count):
            page = doc[p]
            rows = []
            for img in page.get_images(full=True):
                rects = page.get_image_rects(img[0])
                digest = hashlib.sha256(doc.extract_image(img[0])["image"]).hexdigest()
                rows.append((img[0], rects[0] if rects else None, digest))
            pages.append((page.rect, rows))
        return pages
    finally:
        doc.close()


def test_seam_seal_stamps_every_page_in_order():
    """多页 PDF 每页都有骑缝章，位置贴右边缘、垂直居中，且切片随页序变化。"""
    engine = kaifang_sign_service.get_engine()
    pdf = _multi_page_pdf(engine)
    n = engine.page_count(pdf)
    assert n >= 2, "测试样本必须为多页 PDF"

    seal = engine.make_seal("电子合同骑缝专用章", "骑缝", size=300)
    stamped = engine.apply_seam_seal(pdf, seal)
    assert engine.page_count(stamped) == n, "盖骑缝章不得增删页面"

    pages = _seal_images_by_page(stamped)
    assert len(pages) == n
    hashes = []
    for idx, (rect, rows) in enumerate(pages):
        assert rows, f"第 {idx + 1} 页缺少骑缝章"
        _xref, img_rect, digest = rows[0]
        assert img_rect is not None
        diameter = min(rect.width, rect.height) * 0.22
        # 位置：右边缘内缩 3pt、垂直居中；宽度为「直径 / 页数」的切片
        assert abs(img_rect.x1 - (rect.x1 - 3)) < 1.0, img_rect
        assert abs((img_rect.y0 + img_rect.y1) / 2 - (rect.y0 + rect.y1) / 2) < 1.0
        assert abs(img_rect.width - diameter / n) < 1.0, (img_rect.width, diameter / n)
        assert abs(img_rect.height - diameter) < 1.0
        hashes.append(digest)
    assert len(set(hashes)) >= 2, "各页应承载不同的印章切片（页序决定切片）"


def test_seam_sealed_pdf_still_signs_and_verifies():
    """骑缝章后仍可定位签署，内嵌数字签名校验通过且各页骑缝章保留。"""
    engine = kaifang_sign_service.get_engine()
    pdf = _multi_page_pdf(engine)
    n = engine.page_count(pdf)
    stamped = engine.apply_seam_seal(
        pdf, engine.make_seal("电子合同骑缝专用章", "骑缝", size=300)
    )
    signed = engine.sign_pdf(
        stamped,
        engine.make_handwrite("张三"),
        page=1,
        x=20,
        y=80,
        w=20,
        h=8,
        reason="骑缝章后签署",
    )
    rep = engine.verify_pdf(signed)
    assert rep and rep[0]["valid"] == 1, rep
    assert engine.page_count(signed) == n
    assert all(rows for _, rows in _seal_images_by_page(signed)), "签署后各页骑缝章应保留"


def test_seam_seal_never_touches_signed_pdf():
    """已签 PDF（含数字签名）原样返回，不会因骑缝章改写破坏既有签名。"""
    engine = kaifang_sign_service.get_engine()
    pdf = _multi_page_pdf(engine)
    signed = engine.sign_pdf(
        pdf, engine.make_handwrite("张三"), page=1, x=20, y=80, w=20, h=8,
        reason="先签",
    )
    out = engine.apply_seam_seal(
        signed, engine.make_seal("电子合同骑缝专用章", "骑缝", size=300)
    )
    assert out == signed, "已签存量合同不得被改写"
    assert engine.verify_pdf(out)[0]["valid"] == 1


def test_seam_seal_skips_single_page():
    """单页合同无页缝可骑，原样返回。"""
    engine = kaifang_sign_service.get_engine()
    pdf = engine.render_document_pdf("单页短合同", [("甲方", "张三")], ["条款一。"])
    assert engine.page_count(pdf) == 1
    out = engine.apply_seam_seal(
        pdf, engine.make_seal("电子合同骑缝专用章", "骑缝", size=300)
    )
    assert out == pdf


def test_new_contract_generation_applies_seam_seal(api):
    """生成新合同链路：多页模板合同自动逐页加盖骑缝章。"""
    staff = api.mk_user(UserRole.employee)
    client = api.login(staff)
    clauses = [
        f"第 {i} 条：双方应按约定履行本合同全部义务，违约方承担相应法律责任。"
        for i in range(1, 41)
    ]
    tpl = _create_template(client, clauses=clauses)
    r = client.post(
        f"/api/v1/contracts/template-library/{tpl['id']}/generate",
        json={"variables": {"monthly_rent": "8800", "tenant_name": "张三"}},
    )
    assert r.status_code == 200, r.text

    with Session(api.engine) as s:
        c = s.get(Contract, uuid.UUID(r.json()["id"]))
        pdf_bytes = pathlib.Path(c.pdf_path).read_bytes()
    engine = kaifang_sign_service.get_engine()
    n = engine.page_count(pdf_bytes)
    assert n >= 2
    pages = _seal_images_by_page(pdf_bytes)
    assert len(pages) == n
    assert all(rows for _, rows in pages), "新合同每一页都应带骑缝章"
