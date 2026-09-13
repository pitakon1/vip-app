"""AI 应用预留路由。

统一对外暴露 AI 能力接线状态与调用入口。当前支持：
- GET  /ai/health   AI 能力清单与配置状态（预留，供前端发现能力）
- POST /ai/chat     对话式 AI（智能客服/合同生成/翻译增强）
实际生成需配置 OPENAI_API_KEY；未配置时返回保留提示。
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app.db import get_session
from app.core.auth import get_current_user
from app.models import User
from app.providers.ai import ai_client, ai_health

router = APIRouter(prefix="/ai", tags=["ai"])


@router.get("/health")
def health(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    return ai_health()


@router.post("/chat")
def chat(
    payload: dict,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """payload: {messages: [{"role":..,"content":..}], temperature?} 对话式 AI。"""
    messages = payload.get("messages")
    if not messages:
        raise HTTPException(status_code=400, detail="messages required")
    return ai_client.chat(messages, payload.get("temperature", 0.3))