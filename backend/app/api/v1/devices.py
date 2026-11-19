"""设备推送令牌注册/注销，以及 App 端「发送测试推送」。

App 登录后把 Expo push token 注册到这里；退出登录时撤销。
Web/小程序没有原生推送通道，走站内通知列表（`/notifications/me`），
不在此接口伪造"注册成功"。
"""
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlmodel import Session

from app.core.auth import get_current_user
from app.db import get_session
from app.models import User
from app.services import push as push_service

router = APIRouter(prefix="/devices", tags=["devices"])


class PushTokenRegister(BaseModel):
    token: str
    platform: str = "unknown"  # ios | android | web
    device_id: Optional[str] = None
    app_version: Optional[str] = None


@router.post("/push-token")
def register_push_token(
    req: PushTokenRegister,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """注册/续期 Expo push token（幂等）。"""
    if not push_service.is_valid_expo_token(req.token):
        raise HTTPException(
            status_code=400,
            detail="Invalid Expo push token (expected ExponentPushToken[...] / ExpoPushToken[...])",
        )
    row = push_service.register_device_token(
        session,
        user,
        req.token,
        platform=req.platform,
        device_id=req.device_id,
        app_version=req.app_version,
    )
    return {
        "registered": True,
        "platform": row.platform,
        # 不回传完整 token（响应可能进日志/截图），只给末位便于对账
        "token_tail": row.token[-12:],
        "last_seen_at": row.last_seen_at,
    }


@router.delete("/push-token")
def unregister_push_token(
    token: str = Query(..., min_length=8),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """退出登录时撤销本设备 token。不属于当前用户的 token 一律 `revoked: false`。"""
    revoked = push_service.revoke_device_token(session, user, token)
    return {"revoked": revoked}


@router.post("/push-token/test")
def send_test_push(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """给当前账号的全部活跃设备发一条测试推送。

    真机能否收到还取决于 App 的通知权限与 Expo/FCM/APNs 凭据，
    这里只如实返回 Expo Push 的逐 token 结果，不把"已提交"当"已送达"。
    """
    if user.notify_push is False:
        raise HTTPException(
            status_code=409,
            detail="Push notifications are disabled in notification preferences",
        )
    results = push_service.send_push_to_user(
        session,
        user.id,
        title="测试推送",
        content="如果你看到这条消息，说明本设备的推送通道已打通。",
        data={"type": "push_test"},
    )
    if not results:
        raise HTTPException(
            status_code=409,
            detail="No active push token registered for this account",
        )
    sent = sum(1 for item in results if item["success"])
    return {
        "sent": sent,
        "failed": len(results) - sent,
        # 只回 token 末位，避免完整 token 进入日志/截图
        "results": [
            {
                "platform": item["platform"],
                "token_tail": item["token"][-12:],
                "success": item["success"],
                "message_id": item["message_id"],
                "error": item["error"],
            }
            for item in results
        ],
    }
