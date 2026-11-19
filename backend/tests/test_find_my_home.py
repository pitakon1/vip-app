"""「帮我找房」匿名线索：结构化需求落 Lead + 站内通知。"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

from app.db import get_session
from app.main import app
from app.models import Lead, Notification, User, UserRole


@pytest.fixture()
def engine():
    # TestClient 请求在线程池执行，内存 SQLite 必须 StaticPool 共享连接
    eng = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(eng)
    return eng


def _seed_users(engine):
    with Session(engine) as s:
        s.add(
            User(
                email="admin@test.local",
                hashed_password="x",
                full_name="Admin",
                role=UserRole.admin,
            )
        )
        s.add(
            User(
                email="agent@test.local",
                hashed_password="x",
                full_name="Agent",
                role=UserRole.agent,
            )
        )
        # 非员工角色与小号不应收到线索通知
        s.add(
            User(
                email="tenant@test.local",
                hashed_password="x",
                full_name="Tenant",
                role=UserRole.tenant,
            )
        )
        s.add(
            User(
                email="inactive@test.local",
                hashed_password="x",
                full_name="Inactive agent",
                role=UserRole.agent,
                is_active=False,
            )
        )
        s.commit()


def _post(payload):
    return TestClient(app).post("/api/v1/public/inquiries", json=payload)


def test_find_my_home_creates_structured_lead(engine):
    _seed_users(engine)
    with Session(engine) as s:
        app.dependency_overrides[get_session] = lambda: s
        try:
            resp = _post(
                {
                    "name": "李先生",
                    "phone": "+66812345678",
                    "intent": "find_my_home",
                    "budget_min": 15000,
                    "budget_max": 25000,
                    "currency": "thb",
                    "areas": ["Sukhumvit", "Silom"],
                    "move_in_date": "2026-12-01",
                    "language": "zh",
                }
            )
        finally:
            app.dependency_overrides.clear()

        assert resp.status_code == 200
        body = resp.json()
        assert body["ok"] is True

        lead = s.exec(select(Lead)).one()
        assert lead.source == "find_my_home"
        assert lead.budget_min == 15000
        assert lead.budget_max == 25000
        assert lead.budget_currency == "THB"
        assert "Sukhumvit" in (lead.requirement or "")
        assert "2026-12-01" in (lead.requirement or "")
        criteria = lead.interested_projects[0]
        assert criteria["type"] == "find_my_home"
        assert criteria["areas"] == ["Sukhumvit", "Silom"]
        assert criteria["language"] == "zh"

        # 只通知在职 admin + agent，不通知 tenant / 停用账号
        notifs = s.exec(select(Notification)).all()
        assert len(notifs) == 2
        assert {n.template_key for n in notifs} == {"lead.new"}
        assert {n.subject for n in notifs} == {"新的找房需求"}
        recipients = {n.recipient for n in notifs}
        with Session(engine) as s2:
            staff_ids = {
                str(u.id)
                for u in s2.exec(
                    select(User).where(
                        User.role.in_([UserRole.admin, UserRole.agent]),
                        User.is_active.is_(True),
                    )
                ).all()
            }
        assert recipients == staff_ids
        assert all(n.related_entity_id == lead.id for n in notifs)


def test_find_my_home_requires_contact(engine):
    with Session(engine) as s:
        app.dependency_overrides[get_session] = lambda: s
        try:
            resp = _post(
                {"name": "无联系方式", "intent": "find_my_home", "areas": ["Asok"]}
            )
        finally:
            app.dependency_overrides.clear()
    assert resp.status_code == 400


def test_find_my_home_rejects_reversed_budget(engine):
    with Session(engine) as s:
        app.dependency_overrides[get_session] = lambda: s
        try:
            resp = _post(
                {
                    "name": "预算反了",
                    "phone": "+66800000000",
                    "intent": "find_my_home",
                    "budget_min": 30000,
                    "budget_max": 10000,
                }
            )
        finally:
            app.dependency_overrides.clear()
    assert resp.status_code == 400


def test_find_my_home_rejects_bad_move_in_date(engine):
    with Session(engine) as s:
        app.dependency_overrides[get_session] = lambda: s
        try:
            resp = _post(
                {
                    "name": "日期错",
                    "phone": "+66800000001",
                    "intent": "find_my_home",
                    "move_in_date": "2026/12/01",
                }
            )
        finally:
            app.dependency_overrides.clear()
    assert resp.status_code == 400


def test_listing_inquiry_still_works(engine):
    """向后兼容：老调用方不带 intent，仍按房源留资落库。"""
    with Session(engine) as s:
        app.dependency_overrides[get_session] = lambda: s
        try:
            resp = _post(
                {
                    "name": "旧表单",
                    "phone": "+66800000002",
                    "source": "listing_detail",
                    "message": "想约看",
                }
            )
        finally:
            app.dependency_overrides.clear()

        assert resp.status_code == 200
        lead = s.exec(select(Lead)).one()
        assert lead.source == "listing_detail"
        assert lead.interested_projects is None
