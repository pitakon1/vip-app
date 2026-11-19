"""设备推送令牌与推送发送服务。

设计要点：
- token 校验与发送都复用 `PushProvider`（Expo Push），不另写一套 HTTP 客户端；
- 同一 token 换账号登录时改归属而不是插新行（DevicePushToken.token 唯一）；
- 退出登录软撤销（`revoked_at`），不物理删除，便于排查投递问题；
- 发送前检查用户的 `notify_push` 偏好：关掉推送的用户不投递（交易类通知可 `force`）；
- 没有任何 token 时返回空结果，调用方据此提示"未注册设备"，绝不返回假成功。
"""
import logging
import uuid
from datetime import datetime
from typing import Iterable, Optional

from sqlmodel import Session, select

from app.models.device_push_token import DevicePushToken
from app.models.user import User
from app.providers.notification.base import NotificationChannel, NotificationMessage
from app.providers.notification.push_provider import PushProvider

logger = logging.getLogger(__name__)

_push_provider = PushProvider()


def is_valid_expo_token(token: str) -> bool:
    """只接受 Expo 分配的 token 形态，避免把任意字符串写库后反复投递失败。"""
    return bool(token) and _push_provider._is_valid_token(token.strip())


def register_device_token(
    session: Session,
    user: User,
    token: str,
    platform: str = "unknown",
    device_id: Optional[str] = None,
    app_version: Optional[str] = None,
) -> DevicePushToken:
    """注册/续期设备 token。

    - token 已存在且属于同一用户：更新 last_seen_at（并清掉 revoked_at）；
    - token 已存在但属于其他用户：改归属（同一台设备换了账号登录）；
    - 不存在：新建。
    """
    token = token.strip()
    platform = (platform or "unknown").lower()
    if platform not in ("ios", "android", "web"):
        platform = "unknown"

    row = session.exec(
        select(DevicePushToken).where(DevicePushToken.token == token)
    ).first()
    now = datetime.utcnow()
    if row is None:
        row = DevicePushToken(
            user_id=user.id,
            token=token,
            platform=platform,
            device_id=device_id,
            app_version=app_version,
            last_seen_at=now,
        )
    else:
        row.user_id = user.id
        row.platform = platform
        if device_id:
            row.device_id = device_id
        if app_version:
            row.app_version = app_version
        row.last_seen_at = now
        row.revoked_at = None
        row.deleted_at = None
    session.add(row)
    session.commit()
    session.refresh(row)
    logger.info(
        "push.token_registered user_id=%s platform=%s device=%s",
        user.id,
        platform,
        device_id or "-",
    )
    return row


def revoke_device_token(session: Session, user: User, token: str) -> bool:
    """撤销当前用户名下的 token；不属于该用户时返回 False（不暴露他人 token 是否存在）。"""
    token = (token or "").strip()
    row = session.exec(
        select(DevicePushToken).where(
            DevicePushToken.token == token,
            DevicePushToken.user_id == user.id,
            DevicePushToken.revoked_at.is_(None),
        )
    ).first()
    if row is None:
        return False
    row.revoked_at = datetime.utcnow()
    session.add(row)
    session.commit()
    logger.info("push.token_revoked user_id=%s platform=%s", user.id, row.platform)
    return True


def active_tokens(session: Session, user_id: uuid.UUID) -> list[DevicePushToken]:
    return list(
        session.exec(
            select(DevicePushToken).where(
                DevicePushToken.user_id == user_id,
                DevicePushToken.revoked_at.is_(None),
                DevicePushToken.deleted_at.is_(None),
            )
        ).all()
    )


def send_push_to_user(
    session: Session,
    user_id: uuid.UUID,
    title: str,
    content: str,
    data: Optional[dict] = None,
    force: bool = False,
) -> list[dict]:
    """给某个用户的全部活跃设备发推送。

    返回逐 token 的结果列表；调用方用 `sent` 数量判断是否真的投递成功。
    用户关闭了推送偏好且非强制通知时直接返回空列表（不是失败，也不是成功）。
    """
    user = session.get(User, user_id)
    if user is None:
        return []
    if not force and user.notify_push is False:
        return []

    results: list[dict] = []
    for row in active_tokens(session, user_id):
        message = NotificationMessage(
            channel=NotificationChannel.PUSH,
            recipient=row.token,
            title=title,
            content=content,
            metadata={"data": data} if data else None,
        )
        result = _push_provider.send(message)
        results.append(
            {
                "token": row.token,
                "platform": row.platform,
                "success": result.success,
                "message_id": result.message_id,
                "error": result.error_message,
            }
        )
        if not result.success:
            logger.warning(
                "push.send_failed user_id=%s platform=%s error=%s",
                user_id,
                row.platform,
                result.error_message,
            )
    return results
