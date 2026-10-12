"""个人签名/印章资产库（对应开放签「我的签名 / 印模印章」）。

能力：
- 保存手写签名 / 印章（系统生成或上传）到「我的签名」库，签署时复用；
- 印模印章：扫描真实印章图片 → 自动透明化抠图 → 生成透明底印章并入库；
- 资产归属当前登录用户本人，仅本人可读/删。
"""
import base64
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlmodel import Session, select

from app.core.auth import get_current_user
from app.db import get_session
from app.models import (
    SignAsset,
    SignAssetType,
    SignAssetSource,
    User,
)
from app.services import kaifang_sign_service

router = APIRouter(prefix="/sign-assets", tags=["sign-assets"])

_MAX_DATA_URL_LEN = 800_000  # 单张签名/印章 base64 上限（够高清 PNG）


def _png_data_url(png_bytes: bytes) -> str:
    return "data:image/png;base64," + base64.b64encode(png_bytes).decode("ascii")


def _serialize(asset: SignAsset) -> dict:
    return {
        "id": str(asset.id),
        "name": asset.name,
        "asset_type": asset.asset_type.value,
        "source": asset.source.value,
        "data_url": asset.data_url,
        "created_at": asset.created_at.isoformat() if asset.created_at else None,
    }


class SignAssetIn(BaseModel):
    name: str
    asset_type: str = "handwrite"
    source: str = "drew"
    data_url: str
    model_config = ConfigDict(extra="allow")


@router.get("")
def list_sign_assets(
    asset_type: str = "",
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """我的签名/印章资产列表。asset_type 可选过滤 handwrite|seal。"""
    q = select(SignAsset).where(SignAsset.user_id == user.id)
    if asset_type:
        try:
            SignAssetType(asset_type)
            q = q.where(SignAsset.asset_type == asset_type)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid asset_type")
    rows = session.exec(q.order_by(SignAsset.created_at.desc())).all()
    return [_serialize(r) for r in rows]


@router.post("")
def create_sign_asset(
    payload: SignAssetIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """保存手写签名 / 印章资产。data_url 为 base64 data URL。"""
    try:
        asset_type = SignAssetType(payload.asset_type or "handwrite")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid asset_type")
    try:
        source = SignAssetSource(payload.source or "drew")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid source")

    data_url = (payload.data_url or "").strip()
    if not data_url.startswith("data:image/") or len(data_url) > _MAX_DATA_URL_LEN:
        raise HTTPException(status_code=400, detail="Invalid data_url")

    asset = SignAsset(
        user_id=user.id,
        name=(payload.name or "").strip()[:50],
        asset_type=asset_type,
        source=source,
        data_url=data_url,
    )
    session.add(asset)
    session.commit()
    session.refresh(asset)
    return _serialize(asset)


class GenerateSealIn(BaseModel):
    """系统模板生成公章（对应开放签「模板制作」）。

    company_name 沿顶部环绕（开放签 entpName），middle_text 居中横排（开放签 middleText）。
    """
    name: str = "公司公章"
    company_name: str = ""
    middle_text: str = "测试印章"
    size: int = 360
    model_config = ConfigDict(extra="allow")


@router.post("/generate-seal")
def generate_seal_preview(
    payload: GenerateSealIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """系统模板生成电子公章图，返回透明底 PNG 供前端预览。不落库。

    需保存到「我的印章」时再调用 POST /sign-assets。
    """
    try:
        png = kaifang_sign_service.get_engine().make_seal(
            (payload.company_name or "").strip(),
            (payload.middle_text or "").strip(),
            max(180, min(480, payload.size or 360)),
        )
    except Exception:  # noqa: BLE001
        raise HTTPException(status_code=400, detail="Failed to generate seal")
    return {"data_url": _png_data_url(png)}


@router.post("/imprint")
def create_imprint_seal(
    payload: dict,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """印模印章：上传真实印章扫描图，自动透明化抠图后生成透明章入库。

    payload: {name, image_base64}  —— image_base64 为原始图片（png/jpg）base64，
    不含 data: 头。
    """
    name = (payload.get("name") or "我的印章").strip()[:50]
    raw = (payload.get("image_base64") or "").strip()
    if not raw:
        raise HTTPException(status_code=400, detail="image_base64 is required")
    if len(raw) > _MAX_DATA_URL_LEN:
        raise HTTPException(status_code=400, detail="image too large")
    try:
        image_bytes = base64.b64decode(raw)
    except Exception:  # noqa: BLE001
        raise HTTPException(status_code=400, detail="Invalid image_base64")

    try:
        png = kaifang_sign_service.get_engine().make_imprint_seal(image_bytes)
    except Exception:  # noqa: BLE001
        raise HTTPException(status_code=400, detail="Failed to process image")

    asset = SignAsset(
        user_id=user.id,
        name=name,
        asset_type=SignAssetType.seal,
        source=SignAssetSource.imprint,
        data_url=_png_data_url(png),
    )
    session.add(asset)
    session.commit()
    session.refresh(asset)
    return _serialize(asset)


@router.delete("/{asset_id}")
def delete_sign_asset(
    asset_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """删除我的签名/印章资产。"""
    asset = session.get(SignAsset, asset_id)
    if not asset or asset.user_id != user.id:
        raise HTTPException(status_code=404, detail="Sign asset not found")
    session.delete(asset)
    session.commit()
    return {"deleted": True, "id": str(asset_id)}