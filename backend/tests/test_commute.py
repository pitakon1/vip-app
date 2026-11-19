"""通勤测算：无 Key fail-closed、transit 解析、缓存命中、接口 404。

真实 Google Routes 调用不进入单测（按次计费且需要 Key），
上游响应用 monkeypatch 注入固定报文，锁死解析与缓存契约。
"""

import pathlib
import sys
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

BASE_DIR = pathlib.Path(__file__).resolve().parents[1]
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from app.config import settings  # noqa: E402
from app.db import get_session  # noqa: E402
from app.main import app  # noqa: E402
from app.models import CommuteCache  # noqa: E402
from app.services import commute as commute_service  # noqa: E402


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


def _fake_route() -> dict:
    return {
        "routes": [
            {
                "duration": "1500s",
                "distanceMeters": 8400,
                "legs": [
                    {
                        "steps": [
                            {
                                "transitDetails": {
                                    "stopDetails": {
                                        "departureStop": {"name": "Asok BTS"},
                                        "arrivalStop": {"name": "Siam BTS"},
                                    },
                                    "transitLine": {
                                        "name": "Sukhumvit Line",
                                        "nameShort": "BTS",
                                        "vehicle": {"type": "SUBWAY"},
                                    },
                                }
                            }
                        ]
                    }
                ],
            }
        ]
    }


def test_no_key_fail_closed(engine, monkeypatch):
    monkeypatch.setattr(settings, "GOOGLE_MAPS_SERVER_API_KEY", "")
    monkeypatch.setattr(settings, "GOOGLE_MAPS_API_KEY", "")

    called = {"v": False}

    def _boom(*_a, **_k):
        called["v"] = True
        raise AssertionError("no key must not call upstream")

    monkeypatch.setattr(commute_service, "_call_routes", _boom)

    with Session(engine) as s:
        res = commute_service.estimate_commute(
            s,
            origin_lat=13.7,
            origin_lng=100.5,
            destination="Siam",
            mode="transit",
        )

    assert res["available"] is False
    assert res["reason"] == "no_key"
    assert res["missing"] == ["GOOGLE_MAPS_SERVER_API_KEY", "GOOGLE_MAPS_API_KEY"]
    assert called["v"] is False


def test_bad_mode_rejected(engine, monkeypatch):
    monkeypatch.setattr(settings, "GOOGLE_MAPS_SERVER_API_KEY", "k")
    with Session(engine) as s:
        res = commute_service.estimate_commute(
            s, origin_lat=13.7, origin_lng=100.5, destination="Siam", mode="teleport"
        )
    assert res["available"] is False
    assert res["reason"] == "bad_mode"
    assert "transit" in res["supported_modes"]


def test_transit_parse_and_cache(engine, monkeypatch):
    monkeypatch.setattr(settings, "GOOGLE_MAPS_SERVER_API_KEY", "k")
    calls = {"n": 0}

    def _fake_call(*_a, **_k):
        calls["n"] += 1
        return _fake_route()

    monkeypatch.setattr(commute_service, "_call_routes", _fake_call)

    with Session(engine) as s:
        first = commute_service.estimate_commute(
            s,
            origin_lat=13.7,
            origin_lng=100.5,
            destination="Siam",
            mode="transit",
        )
        assert first["available"] is True
        assert first["duration_seconds"] == 1500
        assert first["duration_minutes"] == 25
        assert first["distance_km"] == 8.4
        assert first["transit"]["lines"] == ["BTS"]
        assert first["transit"]["stations"] == ["Asok BTS", "Siam BTS"]
        assert first["transit"]["has_rail"] is True
        assert first["cached"] is False

        rows = s.exec(select(CommuteCache)).all()
        assert len(rows) == 1

        second = commute_service.estimate_commute(
            s,
            origin_lat=13.7,
            origin_lng=100.5,
            destination="Siam",
            mode="transit",
        )
        assert second["available"] is True
        assert second["cached"] is True

    assert calls["n"] == 1


def test_no_route_not_cached(engine, monkeypatch):
    monkeypatch.setattr(settings, "GOOGLE_MAPS_SERVER_API_KEY", "k")
    monkeypatch.setattr(commute_service, "_call_routes", lambda *_a, **_k: {"routes": []})

    with Session(engine) as s:
        res = commute_service.estimate_commute(
            s, origin_lat=13.7, origin_lng=100.5, destination="Nowhere", mode="driving"
        )
        assert res["available"] is False
        assert res["reason"] == "no_route"
        assert s.exec(select(CommuteCache)).all() == []


def test_endpoint_404_when_listing_missing(engine):
    with Session(engine) as s:
        app.dependency_overrides[get_session] = lambda: s
        try:
            client = TestClient(app)
            resp = client.post(
                f"/api/v1/public/listings/{uuid.uuid4()}/commute",
                json={"destination": "Siam", "mode": "transit"},
            )
        finally:
            app.dependency_overrides.clear()
    assert resp.status_code == 404
