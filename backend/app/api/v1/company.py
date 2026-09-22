"""公司信息路由：公开读取 + 管理员更新（持久化单行配置）。

- `GET  /company/info`　公开：供落地页/对外展示；无配置时回落静态占位。
- `PUT  /company/info`　管理员：upsert 公司资料（此前只有占位，前端保存会 404）。
- `POST /company/info/logo`　管理员：上传公司 Logo（multipart，落 /uploads/company）。
- `DELETE /company/info/logo`　管理员：移除公司 Logo（清库 + 删盘）。
"""
from pathlib import Path
from typing import Dict, Optional

from fastapi import APIRouter, Depends, File, UploadFile
from pydantic import BaseModel, ConfigDict
from sqlmodel import Session

from app.config import settings
from app.core.auth import require_admin
from app.core.uploads import detect_image_mime, resolve_stored_path, save_upload
from app.db import get_session
from app.models.user import User
from app.models.company_profile import (
    CompanyProfile,
    get_company_profile,
    upsert_company_profile,
)

router = APIRouter(prefix="/company", tags=["company"])

# 公司 Logo 落盘目录 / 静态 URL 前缀 / 体积上限 / 允许的扩展名与魔数。
# backend/uploads/company 由 main.py 以 /uploads/company 静态托管（同头像）。
LOGO_UPLOAD_DIR = Path(__file__).resolve().parents[3] / "uploads" / "company"
LOGO_URL_PREFIX = "/uploads/company/"
MAX_LOGO_SIZE = 2 * 1024 * 1024  # 2MB
ALLOWED_LOGO_TYPES: Dict[str, str] = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
}

# 社媒字段白名单（GET 与 PUT 共用，避免两处口径不一致导致保存后读不回来）
SOCIAL_KEYS = ("wechat", "line", "whatsapp", "facebook", "instagram")


class CompanyInfoOut(BaseModel):
    """`GET /company/info`：公司联系信息。"""

    model_config = ConfigDict(extra="allow")

    name: Optional[str] = None
    version: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    logo_url: Optional[str] = None
    social_media: Optional[Dict[str, str]] = None


class CompanyInfoIn(BaseModel):
    """`PUT /company/info`：管理员更新公司资料。"""

    model_config = ConfigDict(extra="allow")

    name: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    social_media: Optional[Dict[str, str]] = None


def _soc(profile: CompanyProfile) -> Dict[str, str]:
    """规范化为 dict（缺省给空串，与旧响应结构保持一致）。"""
    raw = profile.social_media
    base = {key: "" for key in SOCIAL_KEYS}
    if raw:
        for k, v in raw.items():
            if isinstance(v, str):
                base[k] = v
    return base


def _serialize(profile: CompanyProfile) -> Dict[str, object]:
    """统一响应体（GET / PUT / 上传 / 移除 四处共用）。"""
    return {
        "name": profile.name or settings.APP_NAME,
        "version": settings.APP_VERSION,
        "address": profile.address or "请配置公司地址",
        "phone": profile.phone or "请配置公司电话",
        "email": profile.email or "请配置公司邮箱",
        "website": profile.website or "",
        "logo_url": profile.logo_url or "",
        "social_media": _soc(profile),
    }


@router.get("/info", response_model=CompanyInfoOut)
def get_company_info(session: Session = Depends(get_session)):
    """公开接口，返回公司资料（持久化配置，缺省回落占位）。"""
    return _serialize(get_company_profile(session))


@router.put("/info", response_model=CompanyInfoOut)
def update_company_info(
    req: CompanyInfoIn,
    session: Session = Depends(get_session),
    user: User = Depends(require_admin),
):
    """管理员更新公司资料并持久化。"""
    data = req.model_dump(exclude_none=True)
    if "social_media" in data and isinstance(data["social_media"], dict):
        # 只收白名单字段，避免把任意键写进 JSON 列
        data["social_media"] = {
            k: v for k, v in data["social_media"].items() if k in SOCIAL_KEYS and isinstance(v, str)
        }
    profile = upsert_company_profile(session, data)
    return _serialize(profile)


@router.post("/info/logo", response_model=CompanyInfoOut)
async def upload_company_logo(
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    user: User = Depends(require_admin),
):
    """上传公司 Logo（multipart）。

    校验：扩展名白名单 + 文件头魔数（挡改名伪装）+ 体积上限 2MB + 服务端生成文件名。
    落盘目录由 /uploads/company 静态托管，返回值可直接作为 img 的 src。
    """
    logo_url = save_upload(
        file,
        LOGO_UPLOAD_DIR,
        MAX_LOGO_SIZE,
        set(ALLOWED_LOGO_TYPES),
        {ext: {mime} for ext, mime in ALLOWED_LOGO_TYPES.items()},
        detector=detect_image_mime,
        name_prefix="logo",
        url_prefix=LOGO_URL_PREFIX,
        label="logo",
        supported_text="（支持 JPG / PNG / WEBP / GIF）",
    )
    profile = upsert_company_profile(session, {"logo_url": logo_url})
    return _serialize(profile)


@router.delete("/info/logo", response_model=CompanyInfoOut)
def remove_company_logo(
    session: Session = Depends(get_session),
    user: User = Depends(require_admin),
):
    """移除公司 Logo：清空库中字段并删除磁盘文件（避免留下孤儿文件）。"""
    profile = get_company_profile(session)
    current = profile.logo_url
    if current:
        try:
            resolve_stored_path(current, LOGO_UPLOAD_DIR, LOGO_URL_PREFIX, "logo_url")
            (LOGO_UPLOAD_DIR / current[len(LOGO_URL_PREFIX):]).unlink(missing_ok=True)
        except Exception:
            # 文件已不在磁盘（例如人工清理）时不应阻塞「移除」动作
            pass
    profile = upsert_company_profile(session, {"logo_url": ""})
    return _serialize(profile)