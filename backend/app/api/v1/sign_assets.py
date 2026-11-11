"""签名/印章资产库（对应开放签「我的签名 / 印模印章」+ 企业印章库）。

能力：
- 保存手写签名 / 印章（系统生成或上传）到「我的签名」库，签署时复用；
- 印模印章：扫描真实印章图片 → 自动透明化抠图 → 生成透明底印章并入库；
- 企业印章库（scope=company）：员工共建共用，全部员工可见可选；个人资产
  仅本人可读/删，企业印章由员工维护（删除限创建人或管理员）。
"""
import base64
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlmodel import Session, select

from app.core.auth import STAFF_ROLES, get_current_user
from app.db import get_session
from app.models import (
    SignAsset,
    SignAssetScope,
    SignAssetType,
    SignAssetSource,
    User,
)
from app.services import kaifang_sign_service

router = APIRouter(prefix="/sign-assets", tags=["sign-assets"])

_MAX_DATA_URL_LEN = 800_000  # 单张签名/印章 base64 上限（够高清 PNG）
# 企业印章类别（对齐开放签「企业公章/合同章/法人章」）
_COMPANY_SEAL_TYPES = {"company", "contract", "legal_rep"}


def _png_data_url(png_bytes: bytes) -> str:
    return "data:image/png;base64," + base64.b64encode(png_bytes).decode("ascii")


def _serialize(asset: SignAsset) -> dict:
    return {
        "id": str(asset.id),
        "name": asset.name,
        "asset_type": asset.asset_type.value,
        "source": asset.source.value,
        "scope": asset.scope.value if asset.scope else SignAssetScope.personal.value,
        "seal_type": asset.seal_type,
        "data_url": asset.data_url,
        "created_at": asset.created_at.isoformat() if asset.created_at else None,
    }


def _parse_scope(raw, user: User) -> SignAssetScope:
    """解析资产范围；企业印章仅员工可建，避免普通用户污染公司印章库。"""
    try:
        scope = SignAssetScope(str(raw or SignAssetScope.personal.value))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid scope")
    if scope == SignAssetScope.company and user.role not in STAFF_ROLES:
        raise HTTPException(status_code=403, detail="Only staff can manage company seals")
    return scope


class SignAssetIn(BaseModel):
    name: str
    asset_type: str = "handwrite"
    source: str = "drew"
    scope: str = "personal"
    # 企业印章类别：company=公章 / contract=合同章 / legal_rep=法人章（仅 scope=company）
    seal_type: str = ""
    data_url: str
    model_config = ConfigDict(extra="allow")


def _parse_seal_type(raw, scope: SignAssetScope) -> Optional[str]:
    """企业印章才记录类别；个人资产一律为空，非法值直接 400。"""
    if scope != SignAssetScope.company:
        return None
    value = str(raw or "company").strip()
    if value not in _COMPANY_SEAL_TYPES:
        raise HTTPException(status_code=400, detail="Invalid seal_type")
    return value


@router.get("")
def list_sign_assets(
    asset_type: str = "",
    scope: str = "personal",
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """签名/印章资产列表。

    - `scope=personal`（默认）：我自己的个人资产；
    - `scope=company`：企业印章库（全员可见，仅员工可访问）。
    """
    try:
        wanted_scope = SignAssetScope(scope or "personal")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid scope")
    if wanted_scope == SignAssetScope.company:
        if user.role not in STAFF_ROLES:
            raise HTTPException(status_code=403, detail="Only staff can view company seals")
        q = select(SignAsset).where(SignAsset.scope == SignAssetScope.company)
    else:
        q = select(SignAsset).where(
            SignAsset.user_id == user.id,
            SignAsset.scope == SignAssetScope.personal,
        )
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
    scope = _parse_scope(payload.scope, user)
    if scope == SignAssetScope.company and asset_type != SignAssetType.seal:
        # 企业库只放公章/合同章，个人手写签名不进公共库
        raise HTTPException(status_code=400, detail="Company assets must be seals")
    seal_type = _parse_seal_type(payload.seal_type, scope)

    asset = SignAsset(
        user_id=user.id,
        name=(payload.name or "").strip()[:50],
        asset_type=asset_type,
        source=source,
        scope=scope,
        seal_type=seal_type,
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
    scope = _parse_scope(payload.get("scope"), user)
    seal_type = _parse_seal_type(payload.get("seal_type"), scope)
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
        scope=scope,
        seal_type=seal_type,
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
    """删除签名/印章资产。

    - 个人资产：仅本人可删；
    - 企业印章：创建人可删，管理员（admin）可删任意企业印章。
    """
    asset = session.get(SignAsset, asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Sign asset not found")
    is_company = asset.scope == SignAssetScope.company
    if is_company:
        is_admin = user.role.value == "admin"
        if asset.user_id != user.id and not is_admin:
            raise HTTPException(status_code=404, detail="Sign asset not found")
    elif asset.user_id != user.id:
        raise HTTPException(status_code=404, detail="Sign asset not found")
    session.delete(asset)
    session.commit()
    return {"deleted": True, "id": str(asset_id)}