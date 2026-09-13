"""地理 / 地图 Provider（Google Maps）。

职责：
- geocode / reverse_geocode：地址 ↔ 经纬度（Google Geocoding API）
- haversine 距离计算
- is_within_radius：判断打卡点是否在考勤半径内

未配置 GOOGLE_MAPS_API_KEY 时自动降级为站内 mock（确定性 geocode），
保证开发环境流程可跑通；生产配置密钥后走真实 Google API。
"""
import hashlib
import math
from typing import Optional, Tuple

import httpx

from app.config import settings


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """两点球面距离（km）。"""
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = (
        math.sin(dp / 2) ** 2
        + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    )
    return 2 * R * math.asin(math.sqrt(a))


def is_within_radius(
    lat: float, lng: float, radius_km: float,
    office_lat: Optional[float] = None,
    office_lng: Optional[float] = None,
) -> Tuple[bool, float]:
    """打卡点是否在考勤半径内。返回 (是否在半径内, 距基准点距离 km)。"""
    o_lat = office_lat if office_lat is not None else settings.ATTENDANCE_OFFICE_LAT
    o_lng = office_lng if office_lng is not None else settings.ATTENDANCE_OFFICE_LNG
    dist = haversine_km(lat, lng, o_lat, o_lng)
    return dist <= radius_km, dist


def _mock_geocode(seed: str) -> Tuple[float, float]:
    """无密钥时的确定性 mock：映射到东南亚区域（曼谷周边）。"""
    h = int(hashlib.sha256((seed or "x").encode()).hexdigest()[:8], 16)
    lat = 13.5 + (h % 200) / 100.0  # 13.5 ~ 15.5
    lng = 99.8 + ((h >> 8) % 400) / 100.0  # 99.8 ~ 103.8
    return round(lat, 6), round(lng, 6)


class GeoProvider:
    """Google Maps 地理服务适配器。"""

    def __init__(self) -> None:
        self.key = settings.GOOGLE_MAPS_API_KEY

    @property
    def configured(self) -> bool:
        return bool(self.key)

    def geocode(self, address: str) -> dict:
        """地址 → {lat, lng, formatted_address}。"""
        if not self.configured:
            lat, lng = _mock_geocode(address)
            return {
                "ok": True, "provider": "mock",
                "lat": lat, "lng": lng, "formatted_address": address,
            }
        url = "https://maps.googleapis.com/maps/api/geocode/json"
        resp = httpx.get(
            url, params={"address": address, "key": self.key}, timeout=10
        ).json()
        if not resp.get("results"):
            raise RuntimeError("Geocode failed: no result: %s" % resp.get("status"))
        loc = resp["results"][0]["geometry"]["location"]
        return {
            "ok": True, "provider": "google",
            "lat": loc["lat"], "lng": loc["lng"],
            "formatted_address": resp["results"][0]["formatted_address"],
        }

    def reverse_geocode(self, lat: float, lng: float) -> dict:
        """经纬度 → 地址。"""
        if not self.configured:
            return {"ok": True, "provider": "mock", "address": f"{lat:.6f},{lng:.6f}"}
        url = "https://maps.googleapis.com/maps/api/geocode/json"
        resp = httpx.get(
            url, params={"latlng": f"{lat},{lng}", "key": self.key}, timeout=10
        ).json()
        addr = resp["results"][0]["formatted_address"] if resp.get("results") else ""
        return {"ok": True, "provider": "google", "address": addr}


geo_provider = GeoProvider()