"""回填历史聊天消息的已读快照 `chat_messages.recipients_read`（幂等）。

背景：消息已读状态保存在 JSON 快照 `[{user_id, read}]`。早于该机制写入的
历史消息快照为空，导致：
1. 会话未读数永远按「未读」统计，无法清零；
2. `PUT /chat/conversations/{id}/read` 找不到对应条目，旧消息永远标不成已读。

本脚本只为「快照为空 / 空数组」的消息补建快照：
- 成员取 `chat_participants`（回落到 `chats.participant_ids`）；
- 发送者标记 read=true，其余成员 read=false —— 与现行写入路径一致，
  不改变当前未读数的呈现，只让旧消息可以被正常标记已读。

用法（在 backend 目录下，先 dry-run 再 apply）：
    python scripts/backfill_chat_recipients_read.py            # 只统计
    python scripts/backfill_chat_recipients_read.py --apply    # 实际写入
    python scripts/backfill_chat_recipients_read.py --apply --limit 500
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlmodel import Session, select  # noqa: E402

from app.db import engine  # noqa: E402
from app.models import Conversation, Message, ChatParticipant  # noqa: E402


def _participants(session: Session, chat: Conversation | None, chat_id) -> list[str]:
    rows = session.exec(
        select(ChatParticipant).where(ChatParticipant.conversation_id == chat_id)
    ).all()
    if rows:
        return [str(r.user_id) for r in rows]
    raw = getattr(chat, "participant_ids", None) if chat else None
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError:
            raw = []
    return [str(p) for p in (raw or [])]


def run(apply: bool, limit: int | None) -> int:
    with Session(engine) as session:
        stmt = select(Message).where(Message.recipients_read.is_(None))
        if limit:
            stmt = stmt.limit(limit)
        # 在库侧只筛 NULL（历史数据），空数组在 Python 侧再过滤，避免 JSON 跨库比较差异
        messages = [m for m in session.exec(stmt).all() if not m.recipients_read]

        chats = {
            c.id: c
            for c in session.exec(
                select(Conversation).where(
                    Conversation.id.in_({m.conversation_id for m in messages})
                )
            ).all()
        }

        updated = 0
        empty = 0
        for msg in messages:
            members = _participants(session, chats.get(msg.conversation_id), msg.conversation_id)
            if not members:
                empty += 1
                continue
            sender = str(msg.sender_id)
            snapshot = [
                {"user_id": uid, "read": uid == sender} for uid in members
            ]
            msg.recipients_read = snapshot
            if apply:
                session.add(msg)
            updated += 1

        print(f"messages_without_snapshot : {len(messages)}")
        print(f"to_backfill               : {updated}")
        print(f"skipped_no_participants   : {empty}")
        if apply:
            session.commit()
            print(f"APPLIED: {updated} message(s) updated")
        else:
            print("DRY-RUN: nothing written (use --apply to write)")
        return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Backfill chat_messages.recipients_read")
    parser.add_argument("--apply", action="store_true", help="实际写入（默认只统计）")
    parser.add_argument("--limit", type=int, default=None, help="最多处理多少条（调试用）")
    args = parser.parse_args()
    return run(apply=args.apply, limit=args.limit)


if __name__ == "__main__":
    raise SystemExit(main())
