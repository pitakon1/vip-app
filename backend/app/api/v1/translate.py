"""翻译路由：房源等多语言信息翻译。

- POST /translate  单条文本翻译 {text, target, source?}
- POST /translate/bulk  批量翻译 {keyed_texts: {key1: text}, target}
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.auth import get_current_user
from app.models import User
from app.providers.translate import translate_provider

router = APIRouter(prefix="/translate", tags=["translate"])


class TranslateReq(BaseModel):
    text: str
    target: str = "zh"
    source: str = ""


@router.post("")
def translate(req: TranslateReq, user: User = Depends(get_current_user)):
    if not req.text:
        raise HTTPException(status_code=400, detail="text required")
    return {
        "translated_text": translate_provider.translate(req.text, req.target, req.source),
        "target": req.target,
        "provider": "google" if translate_provider.configured else "mock",
    }


@router.post("/bulk")
def translate_bulk(payload: dict, user: User = Depends(get_current_user)):
    """payload: {keyed_texts: {...}, target} 批量翻译易用型接口。"""
    keyed = payload.get("keyed_texts") or {}
    target = payload.get("target", "zh")
    return {
        key: translate_provider.translate(text, target)
        for key, text in keyed.items()
    }