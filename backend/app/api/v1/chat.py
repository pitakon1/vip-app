"""即时聊天路由：客户 / 房东直接咨询工作人员。

REST：会话与消息历史。
WebSocket：/ws/chat/{conversation_id} 实时收发（查询参数 ?token=JWT）。
"""
import uuid
from typing import Dict

from fastapi import (
    APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect,
)
from sqlmodel import Session, select

from app.db import get_session
from app.core.auth import get_current_user
from app.core.security import decode_access_token
from app.models import User, Conversation, Message, MessageType

router = APIRouter(prefix="/chat", tags=["chat"])


# ---------------- 连接管理（in-process 广播；分布式可换 Redis pub/sub）----------------
class ConnectionManager:
    def __init__(self) -> None:
        self.active: Dict[str, set] = {}

    async def connect(self, conversation_id: str, ws: WebSocket) -> None:
        await ws.accept()
        self.active.setdefault(conversation_id, set()).add(ws)

    def disconnect(self, conversation_id: str, ws: WebSocket) -> None:
        self.active.get(conversation_id, set()).discard(ws)

    async def broadcast(self, conversation_id: str, payload: dict) -> None:
        dead = []
        for ws in self.active.get(conversation_id, set()):
            try:
                await ws.send_json(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(conversation_id, ws)


manager = ConnectionManager()


# ---------------- REST ----------------
@router.get("/conversations")
def my_conversations(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    me = str(user.id)
    convs = session.exec(select(Conversation)).all()
    result = []
    for c in convs:
        ids = [str(p) for p in (c.participant_ids or [])]
        if me in ids:
            result.append(
                {
                    "id": str(c.id),
                    "title": c.title,
                    "entity_type": c.entity_type,
                    "entity_id": str(c.entity_id) if c.entity_id else None,
                    "participant_ids": ids,
                    "created_at": c.created_at.isoformat(),
                }
            )
    return result


@router.post("/conversations")
def create_conversation(
    payload: dict,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """创建会话。payload: {title?, participant_user_ids: [uuid...], entity_type?, entity_id?}"""
    participant_ids = payload.get("participant_user_ids") or []
    if not participant_ids:
        raise HTTPException(status_code=400, detail="participant_user_ids required")
    if str(user.id) not in [str(p) for p in participant_ids]:
        participant_ids.append(user.id)
    conv = Conversation(
        title=payload.get("title") or "咨询会话",
        entity_type=payload.get("entity_type"),
        entity_id=payload.get("entity_id"),
        participant_ids=[str(p) for p in participant_ids],
        created_by=user.id,
    )
    session.add(conv)
    session.commit()
    session.refresh(conv)
    return {
        "id": str(conv.id),
        "title": conv.title,
        "participant_ids": [str(p) for p in conv.participant_ids],
        "created_at": conv.created_at.isoformat(),
    }


@router.get("/conversations/{conversation_id}/messages")
def list_messages(
    conversation_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    msgs = session.exec(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.asc())
    ).all()
    return [
        {
            "id": str(m.id),
            "sender_id": str(m.sender_id),
            "body": m.body,
            "message_type": m.message_type.value,
            "attachments": m.attachments,
            "read_at": m.read_at.isoformat() if m.read_at else None,
            "created_at": m.created_at.isoformat(),
        }
        for m in msgs
    ]


@router.post("/conversations/{conversation_id}/messages")
def send_message(
    conversation_id: uuid.UUID,
    payload: dict,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    conv = session.get(Conversation, conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    msg = Message(
        conversation_id=conversation_id,
        sender_id=user.id,
        body=payload.get("body", ""),
        message_type=MessageType(payload.get("message_type", "text")),
        attachments=payload.get("attachments"),
        recipients_read=[{"user_id": str(p), "read": str(p) == str(user.id)}
                         for p in (conv.participant_ids or [])],
    )
    session.add(msg)
    session.commit()
    session.refresh(msg)
    return {
        "id": str(msg.id),
        "conversation_id": str(msg.conversation_id),
        "sender_id": str(msg.sender_id),
        "body": msg.body,
        "message_type": msg.message_type.value,
        "attachments": msg.attachments,
        "created_at": msg.created_at.isoformat(),
    }


@router.websocket("/ws/chat/{conversation_id}")
async def chat_ws(websocket: WebSocket, conversation_id: str):
    """WebSocket 实时聊天。连接：/ws/chat/{id}?token=JWT。"""
    token = websocket.query_params.get("token")
    if not token or not decode_access_token(token):
        await websocket.close(code=4401)
        return
    await manager.connect(conversation_id, websocket)
    try:
        while True:
            data = await websocket.receive_json()
            await manager.broadcast(
                conversation_id,
                {"event": "message", "sender": data.get("sender"), "body": data.get("body")},
            )
    except WebSocketDisconnect:
        manager.disconnect(conversation_id, websocket)