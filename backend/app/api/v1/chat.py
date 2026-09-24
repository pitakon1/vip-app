"""即时聊天路由：客户 / 房东直接咨询工作人员。

REST：会话与消息历史。
WebSocket：/ws/chat/{conversation_id} 实时收发（查询参数 ?token=JWT）。

实时扇出：进程内连接表 + Redis pub/sub。多 worker 部署时消息经 Redis 频道
广播到所有 worker；Redis 不可用时退化为进程内广播（与旧行为一致）。
"""
import asyncio
import json
import logging
import uuid
from contextlib import suppress
from datetime import datetime
from typing import Any, Dict, Optional

import redis.asyncio as aioredis
from fastapi import (
    APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect,
)
from sqlmodel import Session, select
from starlette.concurrency import run_in_threadpool

from app.config import settings
from app.db import engine, get_session
from app.core.auth import get_current_user, user_from_token
from app.models import ChatParticipant, Conversation, Message, MessageType, User
from app.models.user import UserRole
from app.schemas.chat import ConversationOut, MessageOut
from app.services.chat_participants import is_participant, participant_ids, sync_participants

router = APIRouter(prefix="/chat", tags=["chat"])
logger = logging.getLogger(__name__)

# 单条消息长度上限（超出截断，避免超长文本撑爆存储与广播）
MAX_MESSAGE_LENGTH = 4000
# WebSocket 关闭码：未认证 / 参数非法 / 非参与者
WS_UNAUTHORIZED = 4401
WS_BAD_REQUEST = 4400
WS_FORBIDDEN = 4403

CHAT_CHANNEL = "chat:broadcast"


# ---------------- 连接管理（进程内 + Redis pub/sub 跨进程扇出）----------------
class ConnectionManager:
    def __init__(self) -> None:
        self.active: Dict[str, set] = {}
        # 每个 WebSocket 归属的用户 id（用于广播时排除发送者，避免自己收到回声）
        self.ws_user: Dict[int, str] = {}

    async def connect(self, conversation_id: str, ws: WebSocket, user_id: str) -> None:
        await ws.accept()
        self.active.setdefault(conversation_id, set()).add(ws)
        self.ws_user[id(ws)] = user_id

    def disconnect(self, conversation_id: str, ws: WebSocket) -> None:
        conns = self.active.get(conversation_id)
        if not conns:
            return
        conns.discard(ws)
        self.ws_user.pop(id(ws), None)
        if not conns:
            self.active.pop(conversation_id, None)

    async def broadcast_local(
        self, conversation_id: str, payload: dict, exclude_user_id: Optional[str] = None
    ) -> None:
        """只推给当前进程内订阅该会话的连接（可排除发送者，避免回声）。"""
        for ws in list(self.active.get(conversation_id, set())):
            if (
                exclude_user_id is not None
                and self.ws_user.get(id(ws)) == exclude_user_id
            ):
                continue
            try:
                await ws.send_json(payload)
            except Exception:
                self.disconnect(conversation_id, ws)

    async def publish(
        self,
        conversation_id: str,
        payload: dict,
        sender_user_id: Optional[str] = None,
    ) -> None:
        """经 Redis 发布以便跨 worker 扇出；Redis 异常时退化为进程内广播。"""
        envelope = json.dumps(
            {
                "conversation_id": conversation_id,
                "sender_user_id": sender_user_id,
                "payload": payload,
            },
            default=str,
        )
        client = await _get_pub_client()
        if client is not None:
            try:
                await client.publish(CHAT_CHANNEL, envelope)
                return
            except Exception as exc:  # noqa: BLE001 - 降级不阻断消息发送
                logger.warning("chat.publish_redis_failed: %s", exc)
        await self.broadcast_local(conversation_id, payload, sender_user_id)


manager = ConnectionManager()

_pub_client: Optional[aioredis.Redis] = None
_sub_client: Optional[aioredis.Redis] = None
_subscriber_task: Optional[asyncio.Task] = None


async def _get_pub_client() -> Optional[aioredis.Redis]:
    """发布用 Redis 客户端（惰性创建，不可用时返回 None）。"""
    global _pub_client
    if _pub_client is None:
        try:
            _pub_client = aioredis.from_url(
                settings.REDIS_URL,
                decode_responses=True,
                socket_connect_timeout=1,
                socket_timeout=2,
            )
            await _pub_client.ping()
        except Exception as exc:  # noqa: BLE001
            logger.warning("chat.pub_client_unavailable: %s", exc)
            _pub_client = None
    return _pub_client


async def _chat_subscriber_loop() -> None:
    """订阅 Redis 频道并把消息扇出给本进程的连接（断线自动重连）。"""
    global _sub_client
    while True:
        try:
            _sub_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
            pubsub = _sub_client.pubsub()
            await pubsub.subscribe(CHAT_CHANNEL)
            async for raw in pubsub.listen():
                if raw.get("type") != "message":
                    continue
                try:
                    envelope = json.loads(raw["data"])
                except (TypeError, ValueError):
                    continue
                await manager.broadcast_local(
                    envelope.get("conversation_id"),
                    envelope.get("payload") or {},
                    envelope.get("sender_user_id"),
                )
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001 - Redis 抖动时保持重试
            logger.warning("chat.subscriber_retry: %s", exc)
            await asyncio.sleep(1)
        finally:
            if _sub_client is not None:
                with suppress(Exception):
                    await _sub_client.aclose()
                _sub_client = None


def start_subscriber() -> None:
    """启动 Redis 订阅任务（在应用 lifespan 中调用，每个 worker 一份）。"""
    global _subscriber_task
    if _subscriber_task is None or _subscriber_task.done():
        _subscriber_task = asyncio.create_task(_chat_subscriber_loop())


async def stop_subscriber() -> None:
    """停止订阅任务并释放 Redis 连接。"""
    global _subscriber_task, _pub_client
    if _subscriber_task is not None:
        _subscriber_task.cancel()
        with suppress(asyncio.CancelledError):
            await _subscriber_task
        _subscriber_task = None
    if _pub_client is not None:
        with suppress(Exception):
            await _pub_client.aclose()
        _pub_client = None


# ---------------- 序列化 ----------------
def _conversation_payload(c: Conversation) -> Dict[str, Any]:
    return {
        "id": str(c.id),
        "title": c.title,
        "entity_type": c.entity_type,
        "entity_id": str(c.entity_id) if c.entity_id else None,
        "participant_ids": participant_ids(c),
        "created_at": c.created_at.isoformat(),
    }


def _message_payload(m: Message) -> Dict[str, Any]:
    return {
        "id": str(m.id),
        "conversation_id": str(m.conversation_id),
        "sender_id": str(m.sender_id),
        "body": m.body,
        "message_type": m.message_type.value,
        "attachments": m.attachments,
        "read_at": m.read_at.isoformat() if m.read_at else None,
        "created_at": m.created_at.isoformat(),
    }


def _ensure_participant(conv: Optional[Conversation], user: User) -> Conversation:
    """会话存在且当前用户为参与者，否则 404 / 403。"""
    if conv is None or conv.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if not is_participant(conv, user.id):
        raise HTTPException(status_code=403, detail="Not a participant of this conversation")
    return conv


def _persist_message(
    conversation_id: uuid.UUID,
    sender_id: uuid.UUID,
    body: str,
    message_type: str,
    attachments: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    """落库一条消息（WebSocket 与 REST 共用，避免 WS 消息不落库）。

    接收方已读状态取自会话的参与者列表（服务端权威），不信任客户端传入。
    """
    try:
        mtype = MessageType(message_type)
    except ValueError:
        mtype = MessageType.text
    with Session(engine) as session:
        conv = session.get(Conversation, conversation_id)
        if conv is None:
            raise HTTPException(status_code=404, detail="Conversation not found")
        msg = Message(
            conversation_id=conversation_id,
            sender_id=sender_id,
            body=body,
            message_type=mtype,
            attachments=attachments,
            recipients_read=[
                {"user_id": p, "read": p == str(sender_id)}
                for p in participant_ids(conv)
            ],
        )
        session.add(msg)
        session.commit()
        session.refresh(msg)
        return _message_payload(msg)


# ---------------- REST ----------------
@router.get("/support", response_model=ConversationOut)
def support_conversation(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """返回当前用户与「平台客服」间的会话（无则创建）。

    IM 客服复用既有会话体系：客服账号取最早创建的 admin（管理员登录三端聊天
    列表即为该会话回复）。按 entity_type='support' 幂等，同一用户只保留一个客服会话。
    """
    cs = session.exec(
        select(User)
        .where(User.role == UserRole.admin, User.deleted_at.is_(None))
        .order_by(User.created_at)
    ).first()
    if cs is None or str(cs.id) == str(user.id):
        raise HTTPException(status_code=404, detail="客服暂未开通")

    existing = session.exec(
        select(Conversation).where(
            Conversation.entity_type == "support",
            Conversation.deleted_at.is_(None),
        )
    ).all()
    for conv in existing:
        ids = participant_ids(conv)
        if str(user.id) in ids and str(cs.id) in ids:
            return _conversation_payload(conv)

    conv = Conversation(
        title="平台客服",
        entity_type="support",
        participant_ids=[str(user.id), str(cs.id)],
        created_by=user.id,
    )
    session.add(conv)
    session.flush()
    sync_participants(session, conv)
    session.commit()
    session.refresh(conv)
    return _conversation_payload(conv)


@router.get("/conversations", response_model=list[ConversationOut])
def my_conversations(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """当前用户的会话列表（按参与者索引表过滤，避免全表扫描）。"""
    conv_ids = session.exec(
        select(ChatParticipant.conversation_id)
        .where(ChatParticipant.user_id == user.id)
        .order_by(ChatParticipant.created_at.desc())
        .offset(offset)
        .limit(limit)
    ).all()
    if not conv_ids:
        return []
    convs = session.exec(
        select(Conversation).where(
            Conversation.id.in_(conv_ids), Conversation.deleted_at.is_(None)
        )
    ).all()
    by_id = {c.id: c for c in convs}
    ordered = [by_id[cid] for cid in conv_ids if cid in by_id]
    return [_conversation_payload(c) for c in ordered]


@router.post("/conversations", response_model=ConversationOut)
def create_conversation(
    payload: dict,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """创建会话。payload: {title?, participant_user_ids: [uuid...], participant_phones: [str],
    participant_emails: [str], entity_type?, entity_id?}

    CRM「联系客户-发消息」解析客户账号：按 participant_user_ids 直接指定，或按
    participant_phones / participant_emails 命中已注册账号（多端客户可能仅用邮箱
    或手机号注册）。解析不到的客户不自动建号，若最终除发起者外没有任何参与人则 404。
    """
    raw_ids = payload.get("participant_user_ids") or []
    raw_phones = payload.get("participant_phones") or []
    raw_emails = payload.get("participant_emails") or []
    if not raw_ids and not raw_phones and not raw_emails:
        raise HTTPException(
            status_code=400,
            detail="participant_user_ids / participant_phones / participant_emails required",
        )

    normalized: list[str] = []

    def _push(u: Optional[User]) -> None:
        if u is not None and str(u.id) not in normalized:
            normalized.append(str(u.id))

    for value in raw_ids:
        try:
            uid = str(uuid.UUID(str(value)))
        except (ValueError, AttributeError, TypeError):
            raise HTTPException(status_code=400, detail=f"Invalid user id: {value}")
        # 与 phone/email 路径一致：校验用户真实存在，否则参与者索引会写进
        # 幽灵 user_id（FK IntegrityError 500 或不可达的幽灵参与者）
        if session.get(User, uuid.UUID(uid)) is None:
            raise HTTPException(status_code=404, detail=f"User not found: {value}")
        if uid not in normalized:
            normalized.append(uid)

    # 按手机号 / 邮箱 / 姓名命中已注册账号（客户可能仅邮箱或仅手机号注册）
    for phone in raw_phones:
        p = str(phone).strip()
        if p:
            _push(session.exec(select(User).where(User.phone == p)).first())
    for email in raw_emails:
        e = str(email).strip().lower()
        if e:
            _push(session.exec(select(User).where(User.email == e)).first())

    if str(user.id) not in normalized:
        normalized.append(str(user.id))
    if len(normalized) <= 1:
        raise HTTPException(
            status_code=404,
            detail="客户尚未注册账号，暂无法在 App 内发消息，请先通过电话联系",
        )

    conv = Conversation(
        title=payload.get("title") or "咨询会话",
        entity_type=payload.get("entity_type"),
        entity_id=payload.get("entity_id"),
        participant_ids=normalized,
        created_by=user.id,
    )
    session.add(conv)
    session.flush()
    sync_participants(session, conv)
    session.commit()
    session.refresh(conv)
    return _conversation_payload(conv)


@router.get("/conversations/{conversation_id}/messages", response_model=list[MessageOut])
def list_messages(
    conversation_id: uuid.UUID,
    limit: int = Query(50, ge=1, le=200),
    before: Optional[datetime] = None,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """会话消息历史。

    默认返回最近 limit 条（按时间正序输出，与前端渲染顺序一致）；
    继续翻页时传入 before=当前最早一条的 created_at。
    """
    conv = _ensure_participant(session.get(Conversation, conversation_id), user)
    stmt = select(Message).where(Message.conversation_id == conv.id)
    if before is not None:
        stmt = stmt.where(Message.created_at < before)
    rows = session.exec(stmt.order_by(Message.created_at.desc()).limit(limit)).all()
    return [_message_payload(m) for m in reversed(rows)]


@router.post("/conversations/{conversation_id}/messages", response_model=MessageOut)
async def send_message(
    conversation_id: uuid.UUID,
    payload: dict,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """发送消息（REST 通道）。落库后广播给会话中已连接 WebSocket 的其他参与者。"""
    conv = _ensure_participant(session.get(Conversation, conversation_id), user)
    body = (payload.get("body") or "").strip()
    if not body:
        raise HTTPException(status_code=400, detail="body required")
    stored = await run_in_threadpool(
        _persist_message,
        conv.id,
        user.id,
        body[:MAX_MESSAGE_LENGTH],
        payload.get("message_type", "text"),
        payload.get("attachments"),
    )
    await manager.publish(
        str(conv.id), {"event": "message", **stored}, str(user.id)
    )
    return stored


# ---------------- WebSocket ----------------
def _authorize_ws(conversation_id: uuid.UUID, user_id: str) -> bool:
    """校验用户是会话成员（在同步会话中执行，避免阻塞事件循环）。"""
    with Session(engine) as session:
        conv = session.get(Conversation, conversation_id)
        return conv is not None and is_participant(conv, user_id)


def _ws_user_id(token: str) -> Optional[str]:
    """WebSocket 握手认证：复用 `user_from_token` 的完整校验。

    此前只调 `decode_access_token`，不校验账号是否被停用、令牌是否已被吊销，
    于是登出或停用账号后，旧令牌仍能连上 WS 收发消息（HTTP 接口已经拒绝，
    WS 这条旁路绕过了它）。这里复用同一套校验，在同步会话中执行以免阻塞事件循环。
    """
    with Session(engine) as session:
        try:
            user = user_from_token(token, session)
        except HTTPException:
            return None
        return str(user.id)


@router.websocket("/ws/chat/{conversation_id}")
async def chat_ws(websocket: WebSocket, conversation_id: str):
    """WebSocket 实时聊天。连接：/ws/chat/{id}?token=JWT。"""
    user_id = await run_in_threadpool(
        _ws_user_id, websocket.query_params.get("token") or ""
    )
    if not user_id:
        await websocket.close(code=WS_UNAUTHORIZED)
        return

    try:
        conv_uuid = uuid.UUID(conversation_id)
    except (ValueError, AttributeError):
        await websocket.close(code=WS_BAD_REQUEST)
        return

    if not await run_in_threadpool(_authorize_ws, conv_uuid, user_id):
        await websocket.close(code=WS_FORBIDDEN)
        return

    await manager.connect(conversation_id, websocket, str(user_id))
    try:
        while True:
            data = await websocket.receive_json()
            body = (data.get("body") or "").strip()
            if not body:
                continue
            stored = await run_in_threadpool(
                _persist_message,
                conv_uuid,
                uuid.UUID(str(user_id)),
                body[:MAX_MESSAGE_LENGTH],
                data.get("message_type", "text"),
                data.get("attachments"),
            )
            await manager.publish(
                conversation_id, {"event": "message", **stored}, str(user_id)
            )
    except WebSocketDisconnect:
        manager.disconnect(conversation_id, websocket)
    except Exception as exc:  # noqa: BLE001 - 异常断开也要清理连接
        logger.warning("chat.ws_closed: %s", exc)
        manager.disconnect(conversation_id, websocket)