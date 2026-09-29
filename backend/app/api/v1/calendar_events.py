"""用户自定义日程事件路由。

三端日历在聚合 viewings / receivables / leases 之外，额外展示用户自行
添加的自由日程。数据按 user_id 隔离：本人可见 / 可改 / 可删，软删除。
"""
import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from app.db import get_session
from app.core.auth import get_current_user
from app.models import User, UserCalendarEvent

router = APIRouter(prefix="/calendar-events", tags=["calendar-events"])


class CalendarEventCreate(BaseModel):
    title: str = ""
    start_at: datetime
    end_at: Optional[datetime] = None
    all_day: bool = False
    note: Optional[str] = None


class CalendarEventUpdate(BaseModel):
    title: Optional[str] = None
    start_at: Optional[datetime] = None
    end_at: Optional[datetime] = None
    all_day: Optional[bool] = None
    note: Optional[str] = None


def _owner_event(session: Session, user: User, event_id: uuid.UUID) -> UserCalendarEvent:
    """校验事件归属与软删除，缺失 / 非本人 / 已删一律 404。"""
    ev = session.get(UserCalendarEvent, event_id)
    if not ev or ev.deleted_at or ev.user_id != user.id:
        raise HTTPException(status_code=404, detail="日程事件不存在")
    return ev


def _out(ev: UserCalendarEvent) -> dict:
    return {
        "id": str(ev.id),
        "user_id": str(ev.user_id),
        "title": ev.title,
        "start_at": ev.start_at.isoformat() if ev.start_at else None,
        "end_at": ev.end_at.isoformat() if ev.end_at else None,
        "all_day": ev.all_day,
        "note": ev.note,
        "created_at": ev.created_at.isoformat() if ev.created_at else None,
        "updated_at": ev.updated_at.isoformat() if ev.updated_at else None,
    }


@router.post("")
def create_calendar_event(
    req: CalendarEventCreate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """新建用户日程事件。"""
    title = req.title.strip()
    if not title:
        raise HTTPException(status_code=422, detail="日程标题不能为空")
    ev = UserCalendarEvent(
        user_id=user.id,
        title=title,
        start_at=req.start_at,
        end_at=req.end_at,
        all_day=req.all_day,
        note=req.note,
    )
    session.add(ev)
    session.commit()
    session.refresh(ev)
    return _out(ev)


@router.get("")
def list_calendar_events(
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """列出当前用户的日程事件，可按开始/结束时间过滤。"""
    conditions = [
        UserCalendarEvent.user_id == user.id,
        UserCalendarEvent.deleted_at.is_(None),
    ]
    if start:
        conditions.append(UserCalendarEvent.start_at >= start)
    if end:
        conditions.append(UserCalendarEvent.start_at < end)

    items = session.exec(
        select(UserCalendarEvent)
        .where(*conditions)
        .order_by(UserCalendarEvent.start_at.asc())
    ).all()
    return {"items": [_out(ev) for ev in items], "total": len(items)}


@router.get("/{event_id}")
def get_calendar_event(
    event_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """日程事件详情（仅本人）。"""
    return _out(_owner_event(session, user, event_id))


@router.patch("/{event_id}")
def update_calendar_event(
    event_id: uuid.UUID,
    req: CalendarEventUpdate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """更新日程事件（仅本人）。"""
    ev = _owner_event(session, user, event_id)
    data = req.model_dump(exclude_unset=True)
    if "title" in data and not (data["title"] or "").strip():
        raise HTTPException(status_code=422, detail="日程标题不能为空")
    for key, value in data.items():
        setattr(ev, key, value)
    session.add(ev)
    session.commit()
    session.refresh(ev)
    return _out(ev)


@router.delete("/{event_id}")
def delete_calendar_event(
    event_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """软删除日程事件（仅本人）。"""
    ev = _owner_event(session, user, event_id)
    ev.deleted_at = datetime.utcnow()
    session.add(ev)
    session.commit()
    return {"id": str(ev.id), "deleted": True}