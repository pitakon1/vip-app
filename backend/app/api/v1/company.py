"""公司信息路由：公开的公司联系信息。"""
from typing import Dict, Optional

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict

from app.config import settings

router = APIRouter(prefix="/company", tags=["company"])


class CompanyInfoOut(BaseModel):
    """`GET /company/info`：公司联系信息。"""

    model_config = ConfigDict(extra="allow")

    name: Optional[str] = None
    version: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    social_media: Optional[Dict[str, str]] = None


@router.get("/info", response_model=CompanyInfoOut)
def get_company_info():
    """公开接口，返回公司地址/电话/社交媒体。"""
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "address": "请配置公司地址",
        "phone": "请配置公司电话",
        "email": "请配置公司邮箱",
        "social_media": {
            "wechat": "",
            "line": "",
            "whatsapp": "",
        },
    }
