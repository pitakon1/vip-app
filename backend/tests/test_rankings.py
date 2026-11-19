"""平台成交榜单：样本量口径、最小样本阈值、非全市场标注。"""

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app.db import get_session
from app.main import app
from app.models import Property, PropertyDeal, PropertyDealStatus, Project


@pytest.fixture()
def engine():
    # TestClient 的请求在线程池里执行；内存 SQLite 必须用 StaticPool 共享同一连接，
    # 否则请求线程会看到一个空库（conftest 默认引擎是线程局部连接）。
    eng = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(eng)
    return eng


def _seed(engine):
    with Session(engine) as s:
        p1 = Project(name="Alpha", address="A", district="Watthana", city="Bangkok")
        p2 = Project(name="Beta", address="B", district="Khlong Toei", city="Bangkok")
        s.add(p1)
        s.add(p2)
        s.commit()
        s.refresh(p1)
        s.refresh(p2)

        for i in range(6):
            prop = Property(
                project_id=p1.id,
                owner_id=uuid.uuid4(),
                room_number=f"A{i}",
                address="A",
                size_sqm=50,
            )
            s.add(prop)
            s.commit()
            s.refresh(prop)
            s.add(
                PropertyDeal(
                    sale_listing_id=uuid.uuid4(),
                    property_id=prop.id,
                    sale_price=5_000_000,
                    status=PropertyDealStatus.completed,
                )
            )

        # Beta 只有 2 套成交：低于 min_sample，不应进榜单
        for i in range(2):
            prop = Property(
                project_id=p2.id,
                owner_id=uuid.uuid4(),
                room_number=f"B{i}",
                address="B",
                size_sqm=40,
            )
            s.add(prop)
            s.commit()
            s.refresh(prop)
            s.add(
                PropertyDeal(
                    sale_listing_id=uuid.uuid4(),
                    property_id=prop.id,
                    sale_price=3_000_000,
                    status=PropertyDealStatus.completed,
                )
            )
        s.commit()


def test_rankings_project_sample_and_threshold(engine):
    _seed(engine)
    with Session(engine) as s:
        app.dependency_overrides[get_session] = lambda: s
        try:
            data = TestClient(app).get(
                "/api/v1/public/rankings",
                params={"scope": "project", "metric": "deal_count", "days": 90},
            ).json()
        finally:
            app.dependency_overrides.clear()

    assert data["source"] == "platform_deals"
    assert data["caveat"] == "platform_sample_only"
    # 样本量 = 窗口内全部成交（8），不是条目数
    assert data["sample_count"] == 8
    assert data["min_sample"] == 5
    assert data["published"] is True
    # Beta 仅 2 套，被最小样本阈值过滤
    assert [it["name"] for it in data["items"]] == ["Alpha"]
    assert data["items"][0]["sample_count"] == 6
    assert data["items"][0]["rank"] == 1


def test_rankings_district_scope(engine):
    _seed(engine)
    with Session(engine) as s:
        app.dependency_overrides[get_session] = lambda: s
        try:
            data = TestClient(app).get(
                "/api/v1/public/rankings",
                params={"scope": "district", "metric": "avg_price", "days": 90},
            ).json()
        finally:
            app.dependency_overrides.clear()

    assert data["scope"] == "district"
    assert [it["name"] for it in data["items"]] == ["Watthana"]
    assert data["items"][0]["avg_price"] == 5_000_000


def test_rankings_unpublished_when_sample_too_small(engine):
    with Session(engine) as s:
        proj = Project(name="Gamma", address="C", district="Asok", city="Bangkok")
        s.add(proj)
        s.commit()
        s.refresh(proj)
        prop = Property(
            project_id=proj.id,
            owner_id=uuid.uuid4(),
            room_number="C1",
            address="C",
            size_sqm=30,
        )
        s.add(prop)
        s.commit()
        s.refresh(prop)
        s.add(
            PropertyDeal(
                sale_listing_id=uuid.uuid4(),
                property_id=prop.id,
                sale_price=2_000_000,
                status=PropertyDealStatus.completed,
            )
        )
        s.commit()

        app.dependency_overrides[get_session] = lambda: s
        try:
            data = TestClient(app).get(
                "/api/v1/public/rankings", params={"scope": "project"}
            ).json()
        finally:
            app.dependency_overrides.clear()

    assert data["sample_count"] == 1
    assert data["published"] is False
    assert data["items"] == []
