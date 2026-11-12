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
from sqlalchemy import func
from sqlmodel import Session, select
from starlette.concurrency import run_in_threadpool

from app.config import settings
from app.db import engine, get_session
from app.core.auth import get_current_user, user_from_token
from app.models import ChatParticipant, Conversation, Lead, Listing, Message, MessageType, User
from app.models.listing import ListingStatus
from app.models.user import UserRole
from app.schemas.chat import ConversationOut, MessageOut
from app.services.chat_participants import is_participant, participant_ids, sync_participants
from app.services.phone import phone_keys, to_e164

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


def _unread_counts(
    session: Session, user_id: uuid.UUID, conv_ids: list
) -> Dict[uuid.UUID, int]:
    """按会话统计当前用户的未读消息数。

    未读判定以消息的 `recipients_read` 快照为准（发送者自己记 read=True），
    该快照不会直接暴露给客户端；没有快照的历史消息按未读处理。
    """
    if not conv_ids:
        return {}
    rows = session.exec(
        select(Message).where(
            Message.conversation_id.in_(conv_ids),
            Message.sender_id != user_id,
        )
    ).all()
    counts: Dict[uuid.UUID, int] = {}
    for m in rows:
        marked_read = False
        for item in m.recipients_read or []:
            if str(item.get("user_id")) == str(user_id):
                marked_read = bool(item.get("read"))
                break
        if not marked_read:
            counts[m.conversation_id] = counts.get(m.conversation_id, 0) + 1
    return counts


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
    unread = _unread_counts(session, user.id, [c.id for c in ordered])
    return [{**_conversation_payload(c), "unread_count": unread.get(c.id, 0)} for c in ordered]


# ---------------- 客户账号识别（多路匹配 + 号码归一化） ----------------
def normalize_phone(raw: Any) -> str:
    """把手机号收敛成可比较的规范形式（只用于匹配，不改写存储值）。

    与注册/登录共用 `app.services.phone` 的同一份国家区号数据：
    `+66 81 234 5678`、`0066...`、`66812345678`、`0812345678` 都会产出同一组
    比对键；这里返回其中的规范键（优先「区号+号码」数字形态）。
    """
    keys = phone_keys(raw)
    if not keys:
        return ""
    parsed = to_e164(raw)
    if parsed:
        return parsed.lstrip("+")
    return sorted(keys, key=len, reverse=True)[0]


def _users_by_phone(session: Session, phones: list[str]) -> list[User]:
    """按归一化手机号找已注册账号（命中多个时由调用方报冲突）。"""
    wanted: set[str] = set()
    for phone in phones:
        wanted |= phone_keys(phone)
    if not wanted:
        return []
    # 归一化无法用 SQL 稳定表达（库函数差异大，且历史数据带分隔符），
    # 这里取有手机号的用户逐一归一后比较。users 表规模可控；后续扩容可新增
    # phone_normalized 列并建索引，替换该全表扫描。
    candidates = session.exec(
        select(User).where(User.phone.is_not(None), User.deleted_at.is_(None))
    ).all()
    return [u for u in candidates if phone_keys(u.phone) & wanted]


@router.post("/conversations", response_model=ConversationOut)
def create_conversation(
    payload: dict,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """创建会话。payload: {title?, participant_user_ids: [uuid...], participant_phones: [str],
    participant_emails: [str], lead_id?, entity_type?, entity_id?, listing_id?}

    CRM「联系客户-发消息」按多路识别客户账号，任一命中即可建会话：
    线索已关联的 user_id → 邮箱 → 归一化手机号（泰国号码 +66/0066/0 开头视为同号）。
    多路指向不同账号、同一手机号/邮箱命中多个账号时返回 409 冲突，不随机取；
    全部未命中返回 404 并指明未注册的联系方式。命中后会回写 `lead.user_id`。

    C 端「联系经纪人」：传 listing_id，由服务端从公开上架单解析发布人账号，
    前端不需要也不应该拿到经纪人内部 user id。已存在同房源会话时直接复用。
    """
    raw_ids = payload.get("participant_user_ids") or []
    raw_phones = payload.get("participant_phones") or []
    raw_emails = payload.get("participant_emails") or []
    raw_lead_id = payload.get("lead_id")
    raw_listing_id = payload.get("listing_id")
    raw_property_id = payload.get("property_id")
    listing: Optional[Listing] = None
    if raw_listing_id or raw_property_id:
        try:
            if raw_listing_id:
                listing = session.get(Listing, uuid.UUID(str(raw_listing_id)))
            else:
                # 兼容旧入口：客户端手里只有 property_id（收藏页/降价提醒），
                # 服务端取该房源最新一条在架 listing 作为会话实体。
                listing = session.exec(
                    select(Listing)
                    .where(
                        Listing.property_id == uuid.UUID(str(raw_property_id)),
                        Listing.status == ListingStatus.active,
                        Listing.deleted_at.is_(None),
                    )
                    .order_by(Listing.created_at.desc())
                ).first()
        except (ValueError, AttributeError, TypeError):
            raise HTTPException(status_code=400, detail="Invalid listing_id / property_id")
        if listing is None or listing.deleted_at or listing.status != ListingStatus.active:
            raise HTTPException(status_code=404, detail="Listing not found")
        # 明确指定了参与者时以显式列表为准；只给 listing_id 时联系发布人
        if not raw_ids and not raw_phones and not raw_emails and not raw_lead_id:
            raw_ids = [listing.publisher_user_id]
    if not raw_ids and not raw_phones and not raw_emails and not raw_lead_id:
        raise HTTPException(
            status_code=400,
            detail="participant_user_ids / participant_phones / participant_emails / lead_id / listing_id required",
        )

    normalized: list[str] = []

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

    # ---- 多路识别客户账号：线索已关联 user_id → 邮箱 → 归一化手机号 ----
    lead: Optional[Lead] = None
    if raw_lead_id:
        try:
            lead = session.get(Lead, uuid.UUID(str(raw_lead_id)))
        except (ValueError, AttributeError, TypeError):
            raise HTTPException(status_code=400, detail="Invalid lead_id")
        if lead is None or lead.deleted_at is not None:
            raise HTTPException(status_code=404, detail="线索不存在或已删除")

    # 1) 线索已关联账号：最高优先级；关联失效（账号被删）时继续走邮箱/手机号
    linked_user: Optional[User] = None
    if lead is not None and lead.user_id is not None:
        linked_user = session.get(User, lead.user_id)
        if linked_user is not None and linked_user.deleted_at is not None:
            linked_user = None

    phone_values = [str(p).strip() for p in raw_phones if str(p).strip()]
    email_values = [str(e).strip().lower() for e in raw_emails if str(e).strip()]
    # 前端只传 lead_id 时，用线索自身的联系方式兜底参与匹配
    if lead is not None:
        if lead.phone and lead.phone.strip():
            phone_values.append(lead.phone.strip())
        if lead.email and lead.email.strip():
            email_values.append(lead.email.strip().lower())
    phone_values = list(dict.fromkeys(phone_values))
    email_values = list(dict.fromkeys(email_values))

    # 2) 邮箱匹配（大小写不敏感）；同一邮箱命中多个账号时报冲突，不随机取
    email_users: list[User] = []
    email_ids: set[str] = set()
    for email in email_values:
        hits = session.exec(
            select(User).where(
                func.lower(User.email) == email, User.deleted_at.is_(None)
            )
        ).all()
        if len(hits) > 1:
            raise HTTPException(
                status_code=409,
                detail=f"邮箱 {email} 匹配到多个账号，无法确定客户身份，请人工核对",
            )
        if hits and str(hits[0].id) not in email_ids:
            email_ids.add(str(hits[0].id))
            email_users.append(hits[0])

    # 3) 手机号匹配：归一化后比较；命中多个账号时报冲突，不随机取
    phone_users = _users_by_phone(session, phone_values)
    phone_ids = {str(u.id) for u in phone_users}
    if len(phone_ids) > 1:
        raise HTTPException(
            status_code=409,
            detail="手机号匹配到多个账号，无法确定客户身份，请人工核对后再发起会话",
        )

    resolved = set(email_ids) | phone_ids
    if linked_user is not None:
        resolved.add(str(linked_user.id))

    # 多路命中不同账号：拒绝并由人工核对，绝不猜一个继续
    if len(resolved) > 1:
        raise HTTPException(
            status_code=409,
            detail=(
                "客户身份信息冲突：线索关联账号、邮箱、手机号分别指向不同账号，"
                "请先核对线索里的邮箱/手机号后再发起会话"
            ),
        )
    # 显式 user_id 与其它识别结果不一致也按冲突处理
    if resolved and normalized and not resolved.issubset(set(normalized)):
        raise HTTPException(
            status_code=409,
            detail="客户身份信息冲突：指定的用户与邮箱/手机号匹配到的账号不一致，请人工核对",
        )
    for uid in sorted(resolved):
        if uid not in normalized:
            normalized.append(uid)

    # 匹配成功后回写线索关联，后续发起直接走最高优先级路径
    if (
        lead is not None
        and lead.user_id is None
        and len(resolved) == 1
        and str(user.id) not in resolved
    ):
        lead.user_id = uuid.UUID(next(iter(resolved)))
        session.add(lead)
        session.commit()

    if str(user.id) not in normalized:
        normalized.append(str(user.id))
    if len(normalized) <= 1:
        # 联系方式/线索关联到的就是发起者本人：同样不能自聊
        if str(user.id) in resolved:
            raise HTTPException(
                status_code=400,
                detail="该线索关联的账号或联系方式对应您自己，无法与自己发起会话",
            )
        # 发布人自己点「联系经纪/发送消息」：没有可对话的另一方，给明确原因，
        # 否则会落到下面「客户尚未注册账号」的误导性提示。
        if listing is not None and str(listing.publisher_user_id) == str(user.id):
            raise HTTPException(
                status_code=400,
                detail="这是您自己发布的房源，无法与自己发起会话",
            )
        # 明确告诉员工是哪个联系方式没注册，便于改为电话联系或补录
        if phone_values and email_values:
            detail = (
                f"客户尚未注册账号：手机号 {phone_values[0]} 与邮箱 {email_values[0]} "
                "均未匹配到已注册用户，请先通过电话联系"
            )
        elif phone_values:
            detail = f"手机号 {phone_values[0]} 未注册账号，暂无法在 App 内发消息，请先通过电话联系"
        elif email_values:
            detail = f"邮箱 {email_values[0]} 未注册账号，暂无法在 App 内发消息，请先通过电话联系"
        else:
            detail = "客户尚未注册账号，暂无法在 App 内发消息，请先通过电话联系"
        raise HTTPException(status_code=404, detail=detail)

    entity_type = payload.get("entity_type") or ("listing" if listing else None)
    entity_id = payload.get("entity_id") or (listing.id if listing else None)

    # 同一实体 + 同一组参与者重复发起时复用已有会话，避免每点一次多一条空会话
    # （房源「联系经纪人」与 CRM「联系客户-发消息」共用此规则）
    wanted = set(normalized)
    existing = session.exec(
        select(Conversation)
        .where(
            Conversation.entity_type == entity_type,
            Conversation.entity_id == entity_id,
            Conversation.deleted_at.is_(None),
        )
        .order_by(Conversation.created_at.desc())
    ).all()
    for c in existing:
        if set(participant_ids(c)) == wanted:
            return _conversation_payload(c)

    conv = Conversation(
        title=payload.get("title") or "咨询会话",
        entity_type=entity_type,
        entity_id=entity_id,
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


@router.post("/conversations/{conversation_id}/read")
def mark_conversation_read(
    conversation_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """把会话内「发给当前用户」的消息标为已读（进入会话时调用，未读数随之清零）。"""
    conv = _ensure_participant(session.get(Conversation, conversation_id), user)
    rows = session.exec(
        select(Message).where(
            Message.conversation_id == conv.id,
            Message.sender_id != user.id,
        )
    ).all()
    now = datetime.utcnow()
    updated = 0
    for m in rows:
        # 必须逐项复制 dict：JSON 列按值比较脏数据，若直接原地改内部 dict 再赋回
        # 同一个列表，SQLAlchemy 看到的新旧值仍是同一对象，判定「未变化」而不发 UPDATE。
        snapshot = [dict(item) for item in (m.recipients_read or [])]
        changed = False
        for item in snapshot:
            if str(item.get("user_id")) == str(user.id) and not item.get("read"):
                item["read"] = True
                item["read_at"] = now.isoformat()
                changed = True
        if changed:
            m.recipients_read = snapshot
            session.add(m)
            updated += 1
    if updated:
        session.commit()
    return {"updated": updated}


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
        return (
            conv is not None
            and conv.deleted_at is None
            and is_participant(conv, user_id)
        )


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