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
from app.core.auth import get_current_user
from app.core.security import decode_access_token
from app.models import ChatParticipant, Conversation, Message, MessageType, User
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

    async def connect(self, conversation_id: str, ws: WebSocket) -> None:
        await ws.accept()
        self.active.setdefault(conversation_id, set()).add(ws)

    def disconnect(self, conversation_id: str, ws: WebSocket) -> None:
        conns = self.active.get(conversation_id)
        if not conns:
            return
        conns.discard(ws)
        if not conns:
            self.active.pop(conversation_id, None)

    async def broadcast_local(self, conversation_id: str, payload: dict) -> None:
        """只推给当前进程内订阅该会话的连接。"""
        for ws in list(self.active.get(conversation_id, set())):
            try:
                await ws.send_json(payload)
            except Exception:
                self.disconnect(conversation_id, ws)

    async def publish(self, conversation_id: str, payload: dict) -> None:
        """经 Redis 发布以便跨 worker 扇出；Redis 异常时退化为进程内广播。"""
        envelope = json.dumps(
            {"conversation_id": conversation_id, "payload": payload}, default=str
        )
        client = await _get_pub_client()
        if client is not None:
            try:
                await client.publish(CHAT_CHANNEL, envelope)
                return
            except Exception as exc:  # noqa: BLE001 - 降级不阻断消息发送
                logger.warning("chat.publish_redis_failed: %s", exc)
        await self.broadcast_local(conversation_id, payload)


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
                    envelope.get("conversation_id"), envelope.get("payload") or {}
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
    """创建会话。payload: {title?, participant_user_ids: [uuid...], entity_type?, entity_id?}"""
    raw_ids = payload.get("participant_user_ids") or []
    if not raw_ids:
        raise HTTPException(status_code=400, detail="participant_user_ids required")

    normalized: list[str] = []
    for value in raw_ids:
        try:
            uid = str(uuid.UUID(str(value)))
        except (ValueError, AttributeError, TypeError):
            raise HTTPException(status_code=400, detail=f"Invalid user id: {value}")
        if uid not in normalized:
            normalized.append(uid)
    if str(user.id) not in normalized:
        normalized.append(str(user.id))

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
def send_message(
    conversation_id: uuid.UUID,
    payload: dict,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """发送消息（REST 通道）。"""
    conv = _ensure_participant(session.get(Conversation, conversation_id), user)
    body = (payload.get("body") or "").strip()
    if not body:
        raise HTTPException(status_code=400, detail="body required")
    return _persist_message(
        conv.id,
        user.id,
        body[:MAX_MESSAGE_LENGTH],
        payload.get("message_type", "text"),
        payload.get("attachments"),
    )


# ---------------- WebSocket ----------------
def _authorize_ws(conversation_id: uuid.UUID, user_id: str) -> bool:
    """校验用户是会话成员（在同步会话中执行，避免阻塞事件循环）。"""
    with Session(engine) as session:
        conv = session.get(Conversation, conversation_id)
        return conv is not None and is_participant(conv, user_id)


@router.websocket("/ws/chat/{conversation_id}")
async def chat_ws(websocket: WebSocket, conversation_id: str):
    """WebSocket 实时聊天。连接：/ws/chat/{id}?token=JWT。"""
    payload = decode_access_token(websocket.query_params.get("token") or "")
    user_id = (payload or {}).get("sub")
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

    await manager.connect(conversation_id, websocket)
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
            await manager.publish(conversation_id, {"event": "message", **stored})
    except WebSocketDisconnect:
        manager.disconnect(conversation_id, websocket)
    except Exception as exc:  # noqa: BLE001 - 异常断开也要清理连接
        logger.warning("chat.ws_closed: %s", exc)
        manager.disconnect(conversation_id, websocket)