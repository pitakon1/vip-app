"""通勤测算（Google Routes API + 表级缓存）。

口径与边界：

- 只调用 Google Routes API（`computeRoutes`），**不自建地铁线路库**：
  地铁线路名、上/下车站点全部来自 `transitDetails` 返回值；
- 未配置 Key（`GOOGLE_MAPS_SERVER_API_KEY` / `GOOGLE_MAPS_API_KEY`）时
  **不发外部请求、不伪造结果**，返回 `available=False, reason="no_key"`
  以及缺失的变量名，前端按 reason 展示明确提示；
- 结果按「起点 / 终点坐标（5 位小数）+ 模式」做 sha256 归一化后写入
  `commute_cache`，默认 24h，期间同一查询不再计费调用；
- 上游报错 / 无可用路线同样返回 `available=False`，不缓存失败结果。
"""
import hashlib
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

import httpx
from sqlmodel import Session, select

from app.config import settings
from app.models.commute_cache import CommuteCache
from app.providers.geo import geo_provider

_ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes"

# 对外模式 → Google Routes 的 travelMode
_MODES = {
    "transit": "TRANSIT",
    "driving": "DRIVE",
    "walking": "WALK",
    "bicycling": "BICYCLE",
}

# transit 结果里视为「轨道交通」的 vehicle.type（用于前端「含地铁」标识）
_RAIL_TYPES = {
    "SUBWAY",
    "METRO_RAIL",
    "HEAVY_RAIL",
    "COMMUTER_TRAIN",
    "LIGHT_RAIL",
    "TRAM",
}

_FIELD_MASK = ",".join(
    [
        "routes.duration",
        "routes.distanceMeters",
        "routes.legs.steps.transitDetails",
    ]
)


def missing_credentials() -> List[str]:
    """返回缺失的 Key 变量名；非空即 fail-closed（不发请求）。"""
    key = (
        settings.GOOGLE_MAPS_SERVER_API_KEY or settings.GOOGLE_MAPS_API_KEY or ""
    ).strip()
    if key:
        return []
    return ["GOOGLE_MAPS_SERVER_API_KEY", "GOOGLE_MAPS_API_KEY"]


def _cache_key(
    origin_lat: float, origin_lng: float, dest_lat: float, dest_lng: float, mode: str
) -> str:
    raw = (
        f"{origin_lat:.5f},{origin_lng:.5f}"
        f"->{dest_lat:.5f},{dest_lng:.5f}|{mode}"
    )
    return hashlib.sha256(raw.encode()).hexdigest()


def _parse_seconds(value: Any) -> Optional[int]:
    """Google 返回的时长形如 "1234s"。"""
    if value is None:
        return None
    text = str(value).strip().lower()
    if text.endswith("s"):
        text = text[:-1]
    try:
        return int(float(text))
    except (TypeError, ValueError):
        return None


def _extract_transit(route: Dict[str, Any]) -> Dict[str, Any]:
    """从 transit 结果抽取线路与站点（不依赖本地线路库）。"""
    lines: List[str] = []
    stations: List[str] = []
    vehicle_types: List[str] = []
    for leg in route.get("legs") or []:
        for step in leg.get("steps") or []:
            td = step.get("transitDetails") or {}
            if not td:
                continue
            line = td.get("transitLine") or {}
            name = line.get("nameShort") or line.get("name")
            if name and name not in lines:
                lines.append(name)
            vtype = ((line.get("vehicle") or {}).get("type") or "").upper()
            if vtype and vtype not in vehicle_types:
                vehicle_types.append(vtype)
            stop_details = td.get("stopDetails") or {}
            for key in ("departureStop", "arrivalStop"):
                nm = (stop_details.get(key) or {}).get("name")
                if nm and nm not in stations:
                    stations.append(nm)
    return {
        "lines": lines[:6],
        "stations": stations[:10],
        "vehicle_types": vehicle_types,
        "has_rail": any(v in _RAIL_TYPES for v in vehicle_types),
    }


def _call_routes(
    key: str,
    origin_lat: float,
    origin_lng: float,
    dest_lat: float,
    dest_lng: float,
    mode: str,
) -> Dict[str, Any]:
    body = {
        "origin": {"location": {"latLng": {"latitude": origin_lat, "longitude": origin_lng}}},
        "destination": {
            "location": {"latLng": {"latitude": dest_lat, "longitude": dest_lng}}
        },
        "travelMode": _MODES[mode],
        "computeAlternativeRoutes": False,
        "units": "METRIC",
    }
    return httpx.post(
        _ROUTES_URL,
        json=body,
        headers={
            "X-Goog-Api-Key": key,
            "X-Goog-FieldMask": _FIELD_MASK,
            "Content-Type": "application/json",
        },
        timeout=settings.COMMUTE_TIMEOUT_SECONDS,
    ).json()


def estimate_commute(
    session: Session,
    *,
    origin_lat: float,
    origin_lng: float,
    destination: Optional[str] = None,
    dest_lat: Optional[float] = None,
    dest_lng: Optional[float] = None,
    mode: str = "transit",
) -> Dict[str, Any]:
    """计算通勤时长与线路；任何外部依赖缺失都返回可展示的失败原因。"""
    mode = (mode or "transit").strip().lower()
    if mode not in _MODES:
        return {
            "available": False,
            "reason": "bad_mode",
            "mode": mode,
            "supported_modes": list(_MODES),
        }

    missing = missing_credentials()
    if missing:
        # fail-closed：不计费、不返回假数据（含 mock geocode）
        return {
            "available": False,
            "reason": "no_key",
            "missing": missing,
            "mode": mode,
        }

    dest_label = (destination or "").strip()
    if dest_lat is None or dest_lng is None:
        if not dest_label:
            return {"available": False, "reason": "no_destination", "mode": mode}
        try:
            geo = geo_provider.geocode(dest_label)
        except Exception as exc:  # noqa: BLE001
            return {
                "available": False,
                "reason": "geocode_failed",
                "error": str(exc)[:200],
                "mode": mode,
            }
        dest_lat = float(geo["lat"])
        dest_lng = float(geo["lng"])
        dest_label = geo.get("formatted_address") or dest_label

    key = _cache_key(origin_lat, origin_lng, dest_lat, dest_lng, mode)
    now = datetime.utcnow()
    cached = session.exec(
        select(CommuteCache).where(CommuteCache.cache_key == key)
    ).first()
    if cached and cached.expires_at and cached.expires_at > now:
        payload = dict(cached.payload or {})
        payload["cached"] = True
        return payload

    key_value = (
        settings.GOOGLE_MAPS_SERVER_API_KEY or settings.GOOGLE_MAPS_API_KEY or ""
    ).strip()
    try:
        data = _call_routes(key_value, origin_lat, origin_lng, dest_lat, dest_lng, mode)
    except Exception as exc:  # noqa: BLE001  网络/超时
        return {
            "available": False,
            "reason": "upstream_error",
            "error": str(exc)[:200],
            "mode": mode,
        }

    routes = data.get("routes") or []
    if not routes:
        return {
            "available": False,
            "reason": "no_route",
            "mode": mode,
            "upstream_status": data.get("error", {}).get("status"),
        }

    route = routes[0]
    duration_seconds = _parse_seconds(route.get("duration"))
    distance_meters = route.get("distanceMeters")
    payload: Dict[str, Any] = {
        "available": True,
        "reason": None,
        "provider": "google",
        "mode": mode,
        "duration_seconds": duration_seconds,
        "duration_minutes": (
            None if duration_seconds is None else max(1, round(duration_seconds / 60))
        ),
        "distance_km": (
            None if distance_meters is None else round(distance_meters / 1000, 2)
        ),
        "origin": {"lat": origin_lat, "lng": origin_lng},
        "destination": {"lat": dest_lat, "lng": dest_lng, "label": dest_label},
        "transit": _extract_transit(route) if mode == "transit" else None,
        "cached": False,
        "fetched_at": now.isoformat() + "Z",
    }

    expires_at = now + timedelta(seconds=max(60, settings.COMMUTE_CACHE_TTL_SECONDS))
    if cached:
        cached.payload = payload
        cached.expires_at = expires_at
        cached.updated_at = now
        session.add(cached)
    else:
        session.add(
            CommuteCache(
                cache_key=key,
                mode=mode,
                payload=payload,
                expires_at=expires_at,
            )
        )
    session.commit()
    return payload
