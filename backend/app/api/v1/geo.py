"""地理 / 地图找房路由。

- POST /geo/geocode         地址 → 经纬度（Google Maps，未配置走 mock）
- POST /geo/reverse         经纬度 → 地址
- POST /geo/distance        两点距离（km）
- POST /geo/attendance      考勤定位校验：是否在考勤半径内（kotlin 500KM，可配）
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.config import settings
from app.core.auth import get_current_user
from app.models import User
from app.providers.geo import geo_provider, haversine_km, is_within_radius

router = APIRouter(prefix="/geo", tags=["geo"])


class LatLng(BaseModel):
    lat: float
    lng: float


@router.post("/geocode")
def geocode(payload: dict, user: User = Depends(get_current_user)):
    address = payload.get("address")
    if not address:
        raise HTTPException(status_code=400, detail="address required")
    return geo_provider.geocode(address)


@router.post("/reverse")
def reverse(payload: LatLng, user: User = Depends(get_current_user)):
    if abs(payload.lat) > 90 or abs(payload.lng) > 180:
        raise HTTPException(status_code=400, detail="invalid coordinate")
    return geo_provider.reverse_geocode(payload.lat, payload.lng)


@router.post("/distance")
def distance(a: LatLng, b: LatLng, user: User = Depends(get_current_user)):
    d = haversine_km(a.lat, a.lng, b.lat, b.lng)
    return {"distance_km": round(d, 4)}


@router.post("/attendance")
def attendance_check(payload: LatLng, user: User = Depends(get_current_user)):
    """校验打卡点是否在考勤半径内。超出 → 需填外勤申请。"""
    within, dist = is_within_radius(payload.lat, payload.lng, settings.ATTENDANCE_RADIUS_KM)
    return {
        "within_radius": within,
        "distance_km": round(dist, 3),
        "radius_km": settings.ATTENDANCE_RADIUS_KM,
        "office": {
            "lat": settings.ATTENDANCE_OFFICE_LAT,
            "lng": settings.ATTENDANCE_OFFICE_LNG,
        },
    }