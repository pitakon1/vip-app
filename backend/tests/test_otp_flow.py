"""OTP 短信链路回归：fail-closed / 频控 / 过期 / 次数上限 / 发码 + 登录。

背景：`/auth/otp/request` 是公开接口（任何人可对任意手机号请求发码），
必须有四道闸：
1. 未配 Twilio 凭据 → 503 且**不落库**（不能假成功，也不能留下可撞库的码）；
2. 同一接收方重发冷却 → 429 + Retry-After；
3. 同一接收方 24h 条数上限 → 429；
4. 码本身有有效期与校验次数上限。
本文件逐条锁死，避免以后被"顺手简化"掉。
"""

import pathlib
import re
import sys
import uuid
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

BASE_DIR = pathlib.Path(__file__).resolve().parents[1]
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from app.api.v1 import auth as auth_module  # noqa: E402
from app.config import settings  # noqa: E402
from app.db import get_session  # noqa: E402
from app.main import app  # noqa: E402
from app.models import User, UserRole, VerificationCode  # noqa: E402
from app.providers.notification.base import NotificationResult  # noqa: E402
from app.providers.notification.sms_provider import SMSProvider  # noqa: E402

PHONE = "+66812345678"


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
    def _get_session():
        with Session(engine) as s:
            yield s

    app.dependency_overrides[get_session] = _get_session
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


@pytest.fixture(autouse=True)
def _no_twilio(monkeypatch):
    """默认把所有 Twilio 变量清空：每条用例显式决定是否注入凭据。"""
    monkeypatch.setattr(settings, "TWILIO_ACCOUNT_SID", "")
    monkeypatch.setattr(settings, "TWILIO_AUTH_TOKEN", "")
    monkeypatch.setattr(settings, "TWILIO_FROM_NUMBER", "")
    monkeypatch.setattr(settings, "OTP_RESEND_SECONDS", 60)
    monkeypatch.setattr(settings, "OTP_DAILY_LIMIT", 10)
    monkeypatch.setattr(settings, "OTP_DEV_CODE_ECHO", False)


def _rows(engine):
    with Session(engine) as s:
        return s.exec(select(VerificationCode)).all()


def _request(api, recipient=PHONE, channel="sms"):
    return api.post(
        "/api/v1/auth/otp/request", json={"recipient": recipient, "channel": channel}
    )


# ---------------------------------------------------------------- fail closed
def test_sms_without_credentials_returns_503_and_no_code(api, engine, monkeypatch):
    """未配凭据：503 + 明确缺失变量；库里不能留下任何验证码行。"""
    monkeypatch.setattr(settings, "DEBUG", False)
    resp = _request(api)
    assert resp.status_code == 503
    detail = resp.json()["detail"]
    for name in ("TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER"):
        assert name in detail
    assert _rows(engine) == []


def test_missing_credentials_helper_reports_partial(monkeypatch):
    """只配了一半也要报出缺的那几项（部署时最常见的状态）。"""
    monkeypatch.setattr(settings, "TWILIO_ACCOUNT_SID", "AC_test")
    monkeypatch.setattr(settings, "TWILIO_AUTH_TOKEN", "")
    monkeypatch.setattr(settings, "TWILIO_FROM_NUMBER", "+14155551234")
    assert SMSProvider.missing_credentials() == ["TWILIO_AUTH_TOKEN"]


# ---------------------------------------------------------------- 正常发码
def test_sms_with_credentials_returns_200_without_dev_code(api, engine, monkeypatch):
    """凭据齐全且网关返回成功：200，不回显 dev_code，落一行码。"""
    monkeypatch.setattr(settings, "DEBUG", False)
    monkeypatch.setattr(settings, "TWILIO_ACCOUNT_SID", "AC_test")
    monkeypatch.setattr(settings, "TWILIO_AUTH_TOKEN", "token")
    monkeypatch.setattr(settings, "TWILIO_FROM_NUMBER", "+14155551234")
    sent = {}

    def _fake_send(self, message):
        sent["to"] = message.recipient
        sent["content"] = message.content
        return NotificationResult(success=True, message_id="SM_test")

    monkeypatch.setattr(SMSProvider, "send", _fake_send)

    resp = _request(api)
    assert resp.status_code == 200
    assert resp.json()["dev_code"] is None
    assert sent["to"] == PHONE
    rows = _rows(engine)
    assert len(rows) == 1
    assert rows[0].recipient == PHONE and rows[0].channel == "sms"
    # 明文码绝不出现在响应里
    code = re.search(r"\d{6}", sent["content"]).group(0)
    assert code not in resp.text


# ---------------------------------------------------------------- 频控
def test_resend_cooldown_returns_429(api, engine, monkeypatch):
    """60s 内二次发码 → 429 + Retry-After，且不新增码行。"""
    monkeypatch.setattr(settings, "DEBUG", True)
    monkeypatch.setattr(settings, "OTP_DEV_CODE_ECHO", True)  # 走 dev 回显，不依赖网关

    assert _request(api).status_code == 200
    first_rows = len(_rows(engine))

    resp = _request(api)
    assert resp.status_code == 429
    assert int(resp.headers["Retry-After"]) > 0
    assert len(_rows(engine)) == first_rows


def test_daily_limit_returns_429(api, engine, monkeypatch):
    """24h 条数上限：关掉冷却后仍应在第 N+1 次被拦。"""
    monkeypatch.setattr(settings, "DEBUG", True)
    monkeypatch.setattr(settings, "OTP_DEV_CODE_ECHO", True)
    monkeypatch.setattr(settings, "OTP_RESEND_SECONDS", 0)
    monkeypatch.setattr(settings, "OTP_DAILY_LIMIT", 2)

    assert _request(api).status_code == 200
    assert _request(api).status_code == 200
    resp = _request(api)
    assert resp.status_code == 429
    assert "Daily" in resp.json()["detail"]


def test_cooldown_is_per_recipient(api, engine, monkeypatch):
    """频控按接收方独立计数：另一个号码不受影响。"""
    monkeypatch.setattr(settings, "DEBUG", True)
    monkeypatch.setattr(settings, "OTP_DEV_CODE_ECHO", True)

    assert _request(api, recipient=PHONE).status_code == 200
    assert _request(api, recipient="+66899999999").status_code == 200


# ---------------------------------------------------------------- 校验
def test_expired_code_rejected(engine):
    with Session(engine) as s:
        s.add(
            VerificationCode(
                recipient=PHONE,
                channel="sms",
                code_hash=auth_module.hash_otp("123456"),
                expires_at=datetime.utcnow() - timedelta(seconds=1),
            )
        )
        s.commit()
        with pytest.raises(Exception) as exc:
            auth_module._consume_otp(s, PHONE, "123456")
    assert getattr(exc.value, "status_code", None) == 400
    assert "expired" in str(exc.value).lower()


def test_attempts_cap_invalidates_code(engine):
    """连续错码达到上限后码被作废：此后即便输对也不再通过。"""
    with Session(engine) as s:
        auth_module._issue_otp(s, PHONE, "sms")
        for _ in range(settings.OTP_MAX_ATTEMPTS):
            with pytest.raises(Exception):
                auth_module._consume_otp(s, PHONE, "000000")
        with pytest.raises(Exception) as exc:
            auth_module._consume_otp(s, PHONE, "000000")
    assert getattr(exc.value, "status_code", None) == 400
    assert "Too many attempts" in str(exc.value)


def test_otp_login_end_to_end(api, engine, monkeypatch):
    """发码 → 校验 → 登录：dev 回显拿到明文后能换到 token。"""
    monkeypatch.setattr(settings, "DEBUG", True)
    monkeypatch.setattr(settings, "OTP_DEV_CODE_ECHO", True)
    with Session(engine) as s:
        s.add(
            User(
                email="otp-user@test.com",
                phone=PHONE,
                phone_normalized=PHONE,
                hashed_password="x",
                full_name="OTP 用户",
                role=UserRole.tenant,
            )
        )
        s.commit()

    code = _request(api).json()["dev_code"]
    assert code and len(code) >= 4

    resp = api.post("/api/v1/auth/login/otp", json={"phone": PHONE, "code": code})
    assert resp.status_code == 200, resp.text
    assert resp.json()["access_token"]
