"""设备推送令牌：注册/改归属/撤销与测试推送契约。

真机能否收到推送取决于设备与 FCM/APNs 凭据，这里锁死服务端契约：
token 形态校验、同一 token 换账号改归属、撤销只作用于本人、
无活跃 token / 关闭推送时测试接口必须明确报错而不是假成功。
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

from app.api.v1 import auth as auth_module  # noqa: E402
from app.db import get_session  # noqa: E402
from app.main import app  # noqa: E402
from app.models import DevicePushToken, User, UserRole  # noqa: E402
from app.providers.notification.base import NotificationResult  # noqa: E402
from app.providers.notification.push_provider import PushProvider  # noqa: E402
from app.services import push as push_service  # noqa: E402

TOKEN_A = "ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]"
TOKEN_B = "ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]"


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
    def _mk_user(notify_push=True):
        with Session(engine) as s:
            u = User(
                email=f"{uuid.uuid4().hex[:12]}@test.com",
                hashed_password="x",
                full_name="推送用户",
                role=UserRole.tenant,
                notify_push=notify_push,
            )
            s.add(u)
            s.commit()
            s.refresh(u)
            return u

    sessions = []

    def _login(user):
        s = Session(engine)
        sessions.append(s)
        bound = s.get(User, user.id)
        app.dependency_overrides[get_session] = lambda: s
        app.dependency_overrides[auth_module.get_current_user] = lambda: bound
        return TestClient(app)

    factory = SimpleNamespace(mk_user=_mk_user, login=_login, engine=engine)
    try:
        yield factory
    finally:
        for s in sessions:
            s.close()
        app.dependency_overrides.clear()


def test_invalid_token_rejected(api):
    client = api.login(api.mk_user())
    resp = client.post(
        "/api/v1/devices/push-token",
        json={"token": "not-a-token", "platform": "ios"},
    )
    assert resp.status_code == 400
    assert "Expo push token" in resp.json()["detail"]


def test_register_and_idempotent(api):
    user = api.mk_user()
    client = api.login(user)
    body = {"token": TOKEN_A, "platform": "ios", "app_version": "0.1.0"}

    first = client.post("/api/v1/devices/push-token", json=body)
    assert first.status_code == 200
    assert first.json()["registered"] is True
    assert first.json()["platform"] == "ios"
    assert first.json()["token_tail"] == TOKEN_A[-12:]

    second = client.post("/api/v1/devices/push-token", json=body)
    assert second.status_code == 200
    with Session(api.engine) as s:
        rows = s.exec(select(DevicePushToken)).all()
    assert len(rows) == 1


def test_same_token_moves_to_new_user(api):
    """同设备换账号：token 改归属，不给两个用户同时发。"""
    owner = api.mk_user()
    other = api.mk_user()
    assert api.login(owner).post(
        "/api/v1/devices/push-token", json={"token": TOKEN_A, "platform": "android"}
    ).status_code == 200
    assert api.login(other).post(
        "/api/v1/devices/push-token", json={"token": TOKEN_A, "platform": "android"}
    ).status_code == 200

    with Session(api.engine) as s:
        row = s.exec(
            select(DevicePushToken).where(DevicePushToken.token == TOKEN_A)
        ).one()
        assert row.user_id == other.id
        assert len(s.exec(select(DevicePushToken)).all()) == 1


def test_revoke_only_own_token(api):
    owner = api.mk_user()
    stranger = api.mk_user()
    api.login(owner).post(
        "/api/v1/devices/push-token", json={"token": TOKEN_A, "platform": "ios"}
    )

    denied = api.login(stranger).delete(
        "/api/v1/devices/push-token", params={"token": TOKEN_A}
    )
    assert denied.status_code == 200
    assert denied.json()["revoked"] is False

    ok = api.login(owner).delete(
        "/api/v1/devices/push-token", params={"token": TOKEN_A}
    )
    assert ok.status_code == 200
    assert ok.json()["revoked"] is True

    with Session(api.engine) as s:
        row = s.exec(
            select(DevicePushToken).where(DevicePushToken.token == TOKEN_A)
        ).one()
        assert row.revoked_at is not None


def test_test_push_without_token_is_conflict(api):
    client = api.login(api.mk_user())
    resp = client.post("/api/v1/devices/push-token/test")
    assert resp.status_code == 409
    assert "No active push token" in resp.json()["detail"]


def test_test_push_respects_preference(api):
    client = api.login(api.mk_user(notify_push=False))
    client.post("/api/v1/devices/push-token", json={"token": TOKEN_A, "platform": "ios"})
    resp = client.post("/api/v1/devices/push-token/test")
    assert resp.status_code == 409
    assert "disabled" in resp.json()["detail"]


def test_test_push_sends_to_active_tokens(api, monkeypatch):
    sent = []

    def _fake_send(self, message):
        sent.append(message.recipient)
        return NotificationResult(success=True, message_id="ok")

    monkeypatch.setattr(PushProvider, "send", _fake_send)

    client = api.login(api.mk_user())
    client.post("/api/v1/devices/push-token", json={"token": TOKEN_A, "platform": "ios"})
    client.post("/api/v1/devices/push-token", json={"token": TOKEN_B, "platform": "android"})

    resp = client.post("/api/v1/devices/push-token/test")
    assert resp.status_code == 200
    assert resp.json()["sent"] == 2
    assert set(sent) == {TOKEN_A, TOKEN_B}


def test_send_push_to_user_skips_revoked(api, monkeypatch):
    monkeypatch.setattr(
        PushProvider, "send", lambda self, m: NotificationResult(success=True)
    )
    user = api.mk_user()
    client = api.login(user)
    client.post("/api/v1/devices/push-token", json={"token": TOKEN_A, "platform": "ios"})
    client.delete("/api/v1/devices/push-token", params={"token": TOKEN_A})

    with Session(api.engine) as s:
        assert push_service.send_push_to_user(s, user.id, "t", "c") == []
