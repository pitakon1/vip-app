"""实名认证（证件上传 + 人工审核）契约测试。

不接人脸识别/第三方核验，这里锁死服务端行为：
- 未同意 PDPA 不落库；
- 同一用户不能重复提交 pending / approved；
- 驳回必须写原因，驳回后可重新提交；
- 审核通过置 User.is_verified 并发站内通知；
- 证件图片只允许本人或 admin 读取。
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

from app.api.v1 import identity as identity_module  # noqa: E402
from app.core import auth as core_auth  # noqa: E402
from app.db import get_session  # noqa: E402
from app.main import app  # noqa: E402
from app.models import (  # noqa: E402
    Consent,
    IdentityReviewStatus,
    IdentityVerification,
    Notification,
    User,
    UserRole,
)

PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 128


@pytest.fixture()
def api(tmp_path, monkeypatch):
    monkeypatch.setattr(identity_module, "IDENTITY_DIR", tmp_path)
    eng = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(eng)

    sessions = []

    def _mk_user(role=UserRole.tenant):
        with Session(eng) as s:
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

    def _login(user):
        s = Session(eng)
        sessions.append(s)
        bound = s.get(User, user.id)
        app.dependency_overrides[get_session] = lambda: s
        app.dependency_overrides[core_auth.get_current_user] = lambda: bound
        app.dependency_overrides[
            core_auth.get_current_user_allow_query_token
        ] = lambda: bound
        return TestClient(app)

    factory = SimpleNamespace(
        mk_user=_mk_user, login=_login, engine=eng, tmp_path=tmp_path
    )
    try:
        yield factory
    finally:
        for s in sessions:
            s.close()
        app.dependency_overrides.clear()


def _submit(client, **overrides):
    data = {
        "doc_type": "passport",
        "real_name": "张三",
        "consent": "true",
        "id_number": "E12345678",
        "policy_version": "2026-11",
    }
    data.update(overrides)
    return client.post(
        "/api/v1/identity/submit",
        data=data,
        files={"front": ("front.png", PNG_BYTES, "image/png")},
    )


def test_requires_pdpa_consent(api):
    client = api.login(api.mk_user())
    resp = _submit(client, consent="false")
    assert resp.status_code == 400
    assert "PDPA" in resp.json()["detail"]
    with Session(api.engine) as s:
        assert s.exec(select(IdentityVerification)).all() == []
        assert s.exec(select(Consent)).all() == []


def test_submit_creates_pending_and_consent(api):
    user = api.mk_user()
    client = api.login(user)
    resp = _submit(client)
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "pending"
    assert body["id_number_masked"] == "****5678"
    assert body["is_verified"] is False
    assert body["has_front"] is True
    assert body["has_back"] is False

    with Session(api.engine) as s:
        record = s.exec(select(IdentityVerification)).one()
        assert record.status == IdentityReviewStatus.pending
        assert record.front_file_url.startswith("/identity-files/idfront_")
        consent = s.exec(select(Consent)).one()
        assert consent.purpose == "identity_verification"
        assert consent.granted is True
        assert consent.policy_version == "2026-11"
    # 文件确实落在私有目录（且不在静态托管目录）
    assert list(api.tmp_path.glob("idfront_*"))

    again = _submit(client)
    assert again.status_code == 409


def test_admin_approve_sets_verified_and_notifies(api):
    user = api.mk_user()
    inserted = _submit(api.login(user)).json()
    admin = api.login(api.mk_user(UserRole.admin))

    pending = admin.get("/api/v1/identity/pending")
    assert pending.status_code == 200
    rows = pending.json()
    assert len(rows) == 1
    assert rows[0]["id"] == str(inserted["id"])

    resp = admin.post(f"/api/v1/identity/{inserted['id']}/approve")
    assert resp.status_code == 200
    assert resp.json()["user_is_verified"] is True

    with Session(api.engine) as s:
        assert s.get(User, user.id).is_verified is True
        notif = s.exec(select(Notification)).one()
        assert notif.template_key == "identity.approved"
        assert notif.user_id == user.id
        assert notif.related_entity_id == uuid.UUID(inserted["id"])

    assert api.login(user).get("/api/v1/identity/me").json()["status"] == "approved"


def test_reject_requires_reason_and_allows_resubmit(api):
    user = api.mk_user()
    inserted = _submit(api.login(user)).json()
    admin = api.login(api.mk_user(UserRole.admin))

    bad = admin.post(f"/api/v1/identity/{inserted['id']}/reject", json={"reason": "  "})
    assert bad.status_code == 400

    ok = admin.post(
        f"/api/v1/identity/{inserted['id']}/reject",
        json={"reason": "证件照片反光，请重拍"},
    )
    assert ok.status_code == 200

    mine = api.login(user).get("/api/v1/identity/me").json()
    assert mine["status"] == "rejected"
    assert mine["rejection_reason"] == "证件照片反光，请重拍"
    assert mine["is_verified"] is False

    # 驳回后允许重新提交
    resubmitted = _submit(api.login(user))
    assert resubmitted.status_code == 200
    assert resubmitted.json()["status"] == "pending"


def test_identity_files_are_private(api):
    owner = api.mk_user()
    inserted = _submit(api.login(owner)).json()

    own = api.login(owner).get("/api/v1/identity/me/file/front")
    assert own.status_code == 200

    stranger = api.login(api.mk_user())
    denied = stranger.get(f"/api/v1/identity/{inserted['id']}/file/front")
    assert denied.status_code == 403

    admin = api.login(api.mk_user(UserRole.admin))
    allowed = admin.get(f"/api/v1/identity/{inserted['id']}/file/front")
    assert allowed.status_code == 200
    assert allowed.headers["content-type"].startswith("image/")


def test_staged_back_upload_for_miniapp(api):
    """小程序一次只能传一个文件：反面先 staging，再随 submit 引用。"""
    user = api.mk_user()
    client = api.login(user)

    staged = client.post(
        "/api/v1/identity/staging",
        files={"file": ("back.png", PNG_BYTES, "image/png")},
    )
    assert staged.status_code == 200
    stored = staged.json()["stored"]
    assert stored.startswith("/identity-files/stage_")

    resp = _submit(client, back_stored=stored)
    assert resp.status_code == 200
    assert resp.json()["has_back"] is True

    with Session(api.engine) as s:
        record = s.exec(select(IdentityVerification)).one()
        assert record.back_file_url == stored


def test_staged_file_from_another_user_is_rejected(api):
    victim = api.mk_user()
    staged = (
        api.login(victim)
        .post(
            "/api/v1/identity/staging",
            files={"file": ("back.png", PNG_BYTES, "image/png")},
        )
        .json()["stored"]
    )

    attacker = api.login(api.mk_user())
    resp = _submit(attacker, back_stored=staged)
    assert resp.status_code == 403
    with Session(api.engine) as s:
        assert s.exec(select(IdentityVerification)).all() == []


def test_submit_requires_front_image(api):
    client = api.login(api.mk_user())
    resp = client.post(
        "/api/v1/identity/submit",
        data={"doc_type": "passport", "real_name": "张三", "consent": "true"},
    )
    assert resp.status_code == 400
    assert "正面" in resp.json()["detail"]
