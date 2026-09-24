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
    try:
        translated = translate_provider.translate(req.text, req.target, req.source)
    except Exception:
        # 真实 provider 失败（网络/密钥/限流等）映射为 502，而不是裸 500
        raise HTTPException(status_code=502, detail="翻译服务暂不可用")
    return {
        "translated_text": translated,
        "target": req.target,
        "provider": "google" if translate_provider.configured else "mock",
    }


MAX_BULK_ITEMS = 50
MAX_BULK_TEXT_LEN = 500


@router.post("/bulk")
def translate_bulk(payload: dict, user: User = Depends(get_current_user)):
    """payload: {keyed_texts: {...}, target} 批量翻译易用型接口。"""
    keyed = payload.get("keyed_texts") or {}
    target = payload.get("target", "zh")
    if not isinstance(keyed, dict):
        raise HTTPException(status_code=422, detail="keyed_texts must be an object")
    if len(keyed) > MAX_BULK_ITEMS:
        raise HTTPException(status_code=422, detail=f"too many texts (max {MAX_BULK_ITEMS})")
    for key, text in keyed.items():
        if not isinstance(text, str):
            raise HTTPException(status_code=422, detail=f"text for key '{key}' must be a string")
        if len(text) > MAX_BULK_TEXT_LEN:
            raise HTTPException(status_code=422, detail=f"text for key '{key}' too long (max {MAX_BULK_TEXT_LEN})")
    out = {}
    for key, text in keyed.items():
        try:
            out[key] = translate_provider.translate(text, target)
        except Exception:
            # 单条失败隔离：成功的照常返回，失败的给原文 + 错误标记
            out[key] = {"text": text, "error": "翻译服务暂不可用"}
    return out