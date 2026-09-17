"""公司信息路由：公开读取 + 管理员更新（持久化单行配置）。

- `GET  /company/info`　公开：供落地页/对外展示；无配置时回落静态占位。
- `PUT  /company/info`　管理员：upsert 公司资料（此前只有占位，前端保存会 404）。
"""
from typing import Dict, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict

from app.config import settings
from app.core.auth import require_admin
from app.db import get_session
from app.models.user import User
from app.models.company_profile import (
    CompanyProfile,
    get_company_profile,
    upsert_company_profile,
)
from sqlmodel import Session

router = APIRouter(prefix="/company", tags=["company"])


class CompanyInfoOut(BaseModel):
    """`GET /company/info`：公司联系信息。"""

    model_config = ConfigDict(extra="allow")

    name: Optional[str] = None
    version: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
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
    if not raw:
        return {"wechat": "", "line": "", "whatsapp": ""}
    base = {"wechat": "", "line": "", "whatsapp": ""}
    for k, v in raw.items():
        if isinstance(v, str):
            base[k] = v
    return base


@router.get("/info", response_model=CompanyInfoOut)
def get_company_info(session: Session = Depends(get_session)):
    """公开接口，返回公司资料（持久化配置，缺省回落占位）。"""
    profile = get_company_profile(session)
    return {
        "name": profile.name or settings.APP_NAME,
        "version": settings.APP_VERSION,
        "address": profile.address or "请配置公司地址",
        "phone": profile.phone or "请配置公司电话",
        "email": profile.email or "请配置公司邮箱",
        "website": profile.website or "",
        "social_media": _soc(profile),
    }


@router.put("/info", response_model=CompanyInfoOut)
def update_company_info(
    req: CompanyInfoIn,
    session: Session = Depends(get_session),
    user: User = Depends(require_admin),
):
    """管理员更新公司资料并持久化。"""
    data = req.model_dump(exclude_none=True)
    profile = upsert_company_profile(session, data)
    return {
        "name": profile.name or settings.APP_NAME,
        "version": settings.APP_VERSION,
        "address": profile.address or "请配置公司地址",
        "phone": profile.phone or "请配置公司电话",
        "email": profile.email or "请配置公司邮箱",
        "website": profile.website or "",
        "social_media": _soc(profile),
    }