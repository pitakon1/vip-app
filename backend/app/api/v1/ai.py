"""AI 应用预留路由。

统一对外暴露 AI 能力接线状态与调用入口。当前支持：
- GET  /ai/health   AI 能力清单与配置状态（预留，供前端发现能力）
- POST /ai/chat     对话式 AI（智能客服/合同生成/翻译增强）
实际生成需配置 OPENAI_API_KEY；未配置时返回保留提示。
"""

from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlmodel import Session

from app.db import get_session
from app.core.auth import get_current_user
from app.models import User
from app.providers.ai import ai_client, ai_health

router = APIRouter(prefix="/ai", tags=["ai"])


class AIHealthOut(BaseModel):
    """AI 能力清单与配置状态。"""

    model_config = ConfigDict(extra="allow")

    capabilities: Optional[List[str]] = None
    configured: Optional[bool] = None
    model: Optional[str] = None


class ChatReq(BaseModel):
    """对话式 AI 请求体：messages 必填非空列表，temperature 限定 0-2。"""

    messages: List[Dict[str, str]] = Field(min_length=1)
    temperature: float = Field(default=0.3, ge=0, le=2)


@router.get("/health", response_model=AIHealthOut)
def health(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    return ai_health()


@router.post("/chat")
def chat(
    req: ChatReq,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """payload: {messages: [{"role":..,"content":..}], temperature?} 对话式 AI。"""
    try:
        result = ai_client.chat(req.messages, req.temperature)
    except Exception:
        # provider 解析/调用失败（含 data["choices"] 缺失）统一映射 502，避免裸 500
        raise HTTPException(status_code=502, detail="AI 服务暂不可用")

    # 用 .get() 兜底解析响应，缺字段不抛 KeyError
    if not isinstance(result, dict):
        raise HTTPException(status_code=502, detail="AI 服务响应异常")
    if result.get("ok") is False:
        # 未配置时的保留提示属产品内设计的降级信息，仍以 200 返回；
        # 已配置但真实调用失败（status=error）按服务不可用处理（502）。
        if result.get("status") == "error":
            raise HTTPException(status_code=502, detail="AI 服务暂不可用")
        return result
    if result.get("content") is None:
        raise HTTPException(status_code=502, detail="AI 服务响应异常")
    return result