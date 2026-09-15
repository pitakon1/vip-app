"""会话参与者索引维护。

`Conversation.participant_ids` 是 JSON 数组，无法在 SQLite/PostgreSQL 上通用地
做成员过滤与索引，因此额外的 `chat_participants` 表承担"可索引成员索引"的角色。
本模块提供索引写入与历史数据回填，供 API 写入路径与数据迁移共用。
"""
import uuid
from typing import Iterable, List

from sqlalchemy import func
from sqlmodel import Session, select

from app.models import ChatParticipant, Conversation


def participant_ids(conv: Conversation) -> List[str]:
    """会话参与者的字符串 id 列表（含创建者兜底）。"""
    ids = [str(p) for p in (conv.participant_ids or [])]
    created_by = str(conv.created_by)
    if created_by not in ids:
        ids.append(created_by)
    return ids


def is_participant(conv: Conversation, user_id: object) -> bool:
    """判断用户是否为会话成员。"""
    return str(user_id) in participant_ids(conv)


def _to_uuid(value: object) -> uuid.UUID | None:
    try:
        return value if isinstance(value, uuid.UUID) else uuid.UUID(str(value))
    except (ValueError, AttributeError, TypeError):
        return None


def sync_participants(session: Session, conv: Conversation) -> None:
    """把会话当前参与者写入索引表（幂等，只补缺失项）。"""
    existing = {
        str(row.user_id)
        for row in session.exec(
            select(ChatParticipant).where(ChatParticipant.conversation_id == conv.id)
        ).all()
    }
    for raw in participant_ids(conv):
        if raw in existing:
            continue
        uid = _to_uuid(raw)
        if uid is None:
            continue
        session.add(ChatParticipant(conversation_id=conv.id, user_id=uid))
        existing.add(raw)


def backfill_all(session: Session, conversations: Iterable[Conversation] | None = None) -> int:
    """为历史会话回填参与者索引，返回新增的参与者行数（幂等，可重复执行）。"""
    already_indexed = {
        row for row in session.exec(select(ChatParticipant.conversation_id)).all()
    }
    if conversations is None:
        conversations = session.exec(select(Conversation)).all()

    before = int(session.exec(select(func.count(ChatParticipant.id))).one())
    for conv in conversations:
        if conv.id in already_indexed:
            continue
        sync_participants(session, conv)
    session.flush()
    after = int(session.exec(select(func.count(ChatParticipant.id))).one())
    session.commit()
    return after - before