"""「我的」账户/设置自助端点单测：编辑资料 / 修改密码 / 个人偏好。

覆盖：PATCH /auth/me（资料 + 唯一性冲突 409）、POST /auth/me/password
（校验旧密码 + token_version 递增）、GET/PATCH /auth/me/preferences（合并语义）。

沿用 test_new_features_api.py 的 TestClient + dependency_overrides 风格，
内存 SQLite，不触碰真实数据库。
"""

import sys
import pathlib
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlmodel import SQLModel, Session, create_engine, select
from sqlalchemy.pool import StaticPool
from types import SimpleNamespace

BASE_DIR = pathlib.Path(__file__).resolve().parents[1]
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from app.db import get_session  # noqa: E402
from app.core import auth as auth_module  # noqa: E402
from app.core.security import verify_password  # noqa: E402
from app.models import User, UserRole  # noqa: E402
from app.main import app  # noqa: E402


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
    def _mk_user(role=UserRole.tenant, password="secret1", phone=None):
        from app.core.security import get_password_hash

        with Session(engine) as s:
            u = User(
                email=f"{uuid.uuid4().hex[:12]}@test.com",
                hashed_password=get_password_hash(password),
                full_name="测试用户",
                role=role,
                phone=phone,
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


# ------------------------------------------------------------ 编辑资料
def test_update_me_partial_fields(api):
    user = api.mk_user(phone=None)
    client = api.login(user)
    r = client.patch("/api/v1/auth/me", json={"full_name": "新名字", "phone": "13900001111"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["full_name"] == "新名字"
    assert body["phone"] == "13900001111"
    # 未提供字段保持原值
    assert body["email"] == user.email


def test_update_me_email_conflict_409(api):
    a = api.mk_user()
    b = api.mk_user()
    client = api.login(a)
    r = client.patch("/api/v1/auth/me", json={"email": b.email})
    assert r.status_code == 409


def test_update_me_phone_conflict_409(api):
    a = api.mk_user(phone="10086")
    b = api.mk_user()
    client = api.login(b)
    r = client.patch("/api/v1/auth/me", json={"phone": "10086"})
    assert r.status_code == 409


# ------------------------------------------------------------ 修改密码
def test_change_password_updates_hash_and_revokes_tokens(api, engine):
    user = api.mk_user(password="oldpass1")
    client = api.login(user)
    r = client.post(
        "/api/v1/auth/me/password",
        json={"old_password": "oldpass1", "new_password": "newpass1"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["ok"] is True
    with Session(engine) as s:
        db_user = s.get(User, user.id)
        assert verify_password("newpass1", db_user.hashed_password)
        assert db_user.token_version == 1


def test_change_password_wrong_old_password(api, engine):
    user = api.mk_user(password="oldpass1")
    client = api.login(user)
    r = client.post(
        "/api/v1/auth/me/password",
        json={"old_password": "wrong", "new_password": "newpass1"},
    )
    assert r.status_code == 400
    with Session(engine) as s:
        db_user = s.get(User, user.id)
        assert db_user.token_version == 0, "旧密码错误时不应吊销令牌"


# ------------------------------------------------------------ 个人偏好
def test_preferences_read_default(api):
    user = api.mk_user()
    client = api.login(user)
    r = client.get("/api/v1/auth/me/preferences")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["language"] == "zh"
    assert body["notify_email"] is True
    assert body["notify_push"] is True


def test_preferences_patch_merge_semantics(api):
    user = api.mk_user()
    client = api.login(user)
    r = client.patch(
        "/api/v1/auth/me/preferences",
        json={"timezone": "Asia/Bangkok", "notify_push": False},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["timezone"] == "Asia/Bangkok"
    assert body["notify_push"] is False
    # 未传字段合并保持默认
    assert body["notify_email"] is True
    assert body["language"] == "zh"


def test_preferences_invalid_language_400(api):
    user = api.mk_user()
    client = api.login(user)
    r = client.patch("/api/v1/auth/me/preferences", json={"language": "fr"})
    assert r.status_code == 400