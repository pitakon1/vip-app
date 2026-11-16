"""LianLian 泰国适配器单元测试：签名串、请求签名、回调验签与应答格式。"""
import uuid

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, select

from app.db import get_session
from app.main import app
from app.models.payment import Payment, PaymentType
from app.models.user import User
from app.providers.payment import lianlian_provider as llp
from app.providers.payment.base import PaymentRequest
from app.providers.payment.lianlian_provider import LianLianProvider


def _keypair_pem() -> tuple[str, str]:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()
    public_pem = key.public_key().public_bytes(
        serialization.Encoding.PEM,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode()
    return private_pem, public_pem


def test_canonical_string_matches_document_sample():
    """文档 /docs/signature 的排序示例必须逐字符一致。"""
    payload = {
        "c": {"b": "11", "a": "10"},
        "a": "100",
        "b": [
            {"c": "3", "b": "2", "a": "1"},
            {"c": "6", "b": "5", "a": "4"},
        ],
    }
    assert (
        llp._canonical_string(payload)
        == "a=100&a=1&b=2&c=3&a=4&b=5&c=6&a=10&b=11"
    )


def test_sign_and_webhook_verify_roundtrip(monkeypatch):
    private_pem, public_pem = _keypair_pem()
    monkeypatch.setattr(llp, "LIANLIAN_PRIVATE_KEY", private_pem)
    monkeypatch.setattr(llp, "LIANLIAN_PUBLIC_KEY", public_pem)

    payload = {
        "merchant_id": "142023010100009001",
        "merchant_order_id": "ORDER_202301010001",
        "order_id": "122023010100160021",
        "order_status": "PS",
        "order_amount": "88.99",
        "order_currency": "THB",
        "complete_time": "2023-01-01 13:19:13",
    }
    headers = llp._signature_headers(payload)
    assert headers["sign-type"] == "RSA"
    assert headers["sign"]

    provider = LianLianProvider()
    assert provider.verify_webhook(payload, headers) is True
    # 报文被篡改后必须验签失败
    tampered = dict(payload, order_amount="1.00")
    assert provider.verify_webhook(tampered, headers) is False


def test_webhook_verify_fail_closed_without_public_key(monkeypatch):
    private_pem, _ = _keypair_pem()
    monkeypatch.setattr(llp, "LIANLIAN_PRIVATE_KEY", private_pem)
    monkeypatch.setattr(llp, "LIANLIAN_PUBLIC_KEY", "")

    payload = {"merchant_order_id": "ORDER_1", "order_status": "PS"}
    headers = llp._signature_headers(payload)
    assert LianLianProvider().verify_webhook(payload, headers) is False


def test_parse_payment_and_refund_webhook():
    provider = LianLianProvider()

    payment = provider.parse_webhook(
        {
            "merchant_order_id": "ORDER_1",
            "order_id": "122023010100160021",
            "order_status": "PS",
            "order_amount": "88.99",
            "order_currency": "THB",
        },
        {},
    )
    assert payment["transaction_id"] == "ORDER_1"
    assert payment["status"] == "succeeded"
    assert payment["amount"] == 88.99

    refund = provider.parse_webhook(
        {
            "merchant_order_id": "ORDER_1",
            "merchant_refund_id": "REFUND_1",
            "refund_status": "RS",
            "refund_amount": "10.00",
            "refund_currency": "THB",
        },
        {},
    )
    assert refund["transaction_id"] == "ORDER_1"
    # 退款通知只留档，不改写原支付单状态（避免部分退款被标成整单 refunded）
    assert refund["status"] == "refund_completed"


def test_create_payment_fails_closed_when_unconfigured(monkeypatch):
    monkeypatch.setattr(llp, "LIANLIAN_MERCHANT_ID", "")
    monkeypatch.setattr(llp, "LIANLIAN_PRIVATE_KEY", "")

    result = LianLianProvider().create_payment(
        PaymentRequest(
            amount=100.0,
            currency="THB",
            channel=llp.PaymentChannel.LIANLIAN,
            idempotency_key="ORDER_1",
        )
    )
    assert result.success is False
    assert "not configured" in (result.error_message or "")


def test_webhook_endpoint_returns_lianlian_ack(monkeypatch):
    """回调必须原样返回 200000/Success，且不能被统一信封包裹。"""
    monkeypatch.setattr(
        LianLianProvider, "verify_webhook", lambda self, payload, headers: True
    )
    # TestClient 请求可能跑在不同线程，StaticPool 保证共享同一个内存库连接
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)

    with Session(engine) as s:
        user = User(
            email=f"{uuid.uuid4().hex[:12]}@test.com",
            hashed_password="x",
            full_name="测试用户",
        )
        s.add(user)
        s.commit()
        s.refresh(user)
        s.add(
            Payment(
                payer_id=user.id,
                amount=88.99,
                currency="THB",
                payment_type=PaymentType.rent,
                channel="lianlian",
                idempotency_key="ORDER_LLP_1",
            )
        )
        s.commit()

    def _session_override():
        with Session(engine) as s:
            yield s

    app.dependency_overrides[get_session] = _session_override
    try:
        client = TestClient(app)
        resp = client.post(
            "/api/v1/payments/webhook/lianlian",
            json={
                "merchant_id": "142023010100009001",
                "merchant_order_id": "ORDER_LLP_1",
                "order_id": "122023010100160021",
                "order_status": "PS",
                "order_amount": "88.99",
                "order_currency": "THB",
                "complete_time": "2023-01-01 13:19:13",
            },
        )
        assert resp.status_code == 200
        assert resp.json() == {"code": 200000, "message": "Success"}
        assert resp.headers.get("x-api-envelope") is None

        # 重复投递也应返回相同应答，避免渠道重投
        again = client.post(
            "/api/v1/payments/webhook/lianlian",
            json={
                "merchant_id": "142023010100009001",
                "merchant_order_id": "ORDER_LLP_1",
                "order_id": "122023010100160021",
                "order_status": "PS",
                "order_amount": "88.99",
                "order_currency": "THB",
                "complete_time": "2023-01-01 13:19:13",
            },
        )
        assert again.status_code == 200
        assert again.json() == {"code": 200000, "message": "Success"}
    finally:
        app.dependency_overrides.pop(get_session, None)

    with Session(engine) as s:
        payment = s.exec(
            select(Payment).where(Payment.idempotency_key == "ORDER_LLP_1")
        ).one()
        assert payment.status.value == "succeeded"
