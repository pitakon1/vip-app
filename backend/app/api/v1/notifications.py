"""通知路由：用户通知管理、已读标记与通知派发。"""
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from app.db import get_session
from app.core.auth import get_current_user, require_admin
from app.core.pagination import Page, PaginationParams, paginate_query
from app.models import Notification, NotificationStatus, User
from app.providers.notification.base import (
    NotificationChannel as ProviderChannel,
    NotificationMessage,
)
from app.providers.notification.router import notification_router

router = APIRouter(prefix="/notifications", tags=["notifications"])


class DispatchRequest(BaseModel):
    """通知派发请求（内部接口，admin 权限）。"""

    channel: str  # in_app/push/email/sms/wechat/line/whatsapp/facebook
    recipient: str  # user_id / 手机号 / 邮箱 / openid
    subject: Optional[str] = None
    content: str = ""
    template_key: Optional[str] = None
    template_params: Optional[dict] = None
    related_entity_type: Optional[str] = None
    related_entity_id: Optional[uuid.UUID] = None
    metadata: Optional[dict] = None


@router.get("/me", response_model=Page[Notification])
def list_my_notifications(
    pagination: PaginationParams = Depends(),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """当前用户的通知列表。"""
    conditions = [
        Notification.user_id == user.id,
        Notification.deleted_at.is_(None),
    ]
    stmt = (
        select(Notification)
        .where(*conditions)
        .order_by(Notification.created_at.desc())
    )
    return paginate_query(session, stmt, pagination)


@router.post("/dispatch")
def dispatch_notification(
    req: DispatchRequest,
    session: Session = Depends(get_session),
    user: User = Depends(require_admin),
):
    """通知派发：通过通知路由器发送到指定渠道（系统/Celery 内部接口）。"""
    try:
        channel = ProviderChannel(req.channel)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Unsupported channel: {req.channel}")

    message = NotificationMessage(
        channel=channel,
        recipient=req.recipient,
        title=req.subject or "",
        content=req.content,
        template_key=req.template_key,
        template_params=req.template_params,
        metadata=req.metadata,
        related_entity_type=req.related_entity_type,
        related_entity_id=str(req.related_entity_id) if req.related_entity_id else None,
    )
    result = notification_router.send(message)
    return {
        "success": result.success,
        "message_id": result.message_id,
        "error_message": result.error_message,
    }


@router.patch("/{notification_id}/read")
def mark_notification_read(
    notification_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """标记单条通知已读。"""
    notif = session.get(Notification, notification_id)
    if not notif or notif.deleted_at:
        raise HTTPException(status_code=404, detail="Notification not found")
    if notif.user_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    notif.status = NotificationStatus.read
    notif.read_at = datetime.utcnow()
    session.add(notif)
    session.commit()
    session.refresh(notif)
    return notif


@router.post("/read-all")
def mark_all_notifications_read(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """全部标记已读。"""
    notifs = session.exec(
        select(Notification).where(
            Notification.user_id == user.id,
            Notification.status != NotificationStatus.read,
            Notification.deleted_at.is_(None),
        )
    ).all()
    now = datetime.utcnow()
    for notif in notifs:
        notif.status = NotificationStatus.read
        notif.read_at = now
        session.add(notif)
    session.commit()
    return {"detail": f"{len(notifs)} notifications marked as read"}
