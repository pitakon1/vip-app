"""小区公告路由。

- POST   /announcements            员工/物业发布公告（project_id 为空即平台公告）
- GET    /announcements/mine       租客读取：自己租约所在楼盘公告 + 平台公告
- GET    /announcements            员工列表（按楼盘筛选，含已过期）
- DELETE /announcements/{id}       员工软删除

公告是 B 类自建数据：没有第三方接口，内容由物业/员工后台录入后 C 端展示。
"""
import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import or_
from sqlmodel import Session, select

from app.db import get_session
from app.core.auth import get_current_user, require_employee
from app.models import (
    Announcement,
    AnnouncementCategory,
    Lease,
    LeaseStatus,
    Project,
    Property,
    Tenant,
    User,
)

router = APIRouter(prefix="/announcements", tags=["announcements"])


class AnnouncementCreate(BaseModel):
    title: str
    content: str
    category: AnnouncementCategory = AnnouncementCategory.notice
    project_id: Optional[uuid.UUID] = None
    is_pinned: bool = False
    expires_at: Optional[datetime] = None


class AnnouncementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: Optional[uuid.UUID] = None
    project_name: Optional[str] = None
    title: str
    content: str
    category: AnnouncementCategory
    is_pinned: bool
    published_at: datetime
    expires_at: Optional[datetime] = None
    publisher_name: Optional[str] = None
    scope: str = "project"  # project | platform


def _to_out(session: Session, rows: List[Announcement]) -> List[AnnouncementOut]:
    project_ids = {a.project_id for a in rows if a.project_id}
    names = {}
    for pid in project_ids:
        p = session.get(Project, pid)
        if p:
            names[pid] = p.name
    return [
        AnnouncementOut(
            id=a.id,
            project_id=a.project_id,
            project_name=names.get(a.project_id) if a.project_id else None,
            title=a.title,
            content=a.content,
            category=a.category,
            is_pinned=a.is_pinned,
            published_at=a.published_at,
            expires_at=a.expires_at,
            publisher_name=a.publisher_name,
            scope="project" if a.project_id else "platform",
        )
        for a in rows
    ]


def _active_announcements(project_id: Optional[uuid.UUID]):
    now = datetime.utcnow()
    stmt = select(Announcement).where(
        Announcement.deleted_at.is_(None),
        or_(Announcement.expires_at.is_(None), Announcement.expires_at > now),
        or_(
            Announcement.project_id.is_(None),
            Announcement.project_id == project_id if project_id else False,
        ),
    )
    return stmt


@router.post("", response_model=AnnouncementOut)
def create_announcement(
    data: AnnouncementCreate,
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    if data.project_id and not session.get(Project, data.project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    if not data.title.strip() or not data.content.strip():
        raise HTTPException(status_code=422, detail="Title and content are required")
    a = Announcement(
        project_id=data.project_id,
        title=data.title.strip(),
        content=data.content.strip(),
        category=data.category,
        is_pinned=data.is_pinned,
        expires_at=data.expires_at,
        publisher_user_id=user.id,
        publisher_name=user.full_name or user.email,
    )
    session.add(a)
    session.commit()
    session.refresh(a)
    return _to_out(session, [a])[0]


@router.get("/mine", response_model=List[AnnouncementOut])
def my_announcements(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """租客视角：优先取生效租约对应楼盘，外加平台公告；无租约时只看平台公告。"""
    project_id: Optional[uuid.UUID] = None
    tenant = session.exec(
        select(Tenant).where(Tenant.user_id == user.id, Tenant.deleted_at.is_(None))
    ).first()
    if tenant:
        lease = session.exec(
            select(Lease).where(
                Lease.tenant_id == tenant.id,
                Lease.status == LeaseStatus.active,
                Lease.deleted_at.is_(None),
            )
        ).first()
        if lease:
            prop = session.get(Property, lease.property_id)
            if prop:
                project_id = prop.project_id
    stmt = _active_announcements(project_id).order_by(
        Announcement.is_pinned.desc(), Announcement.published_at.desc()
    )
    return _to_out(session, list(session.exec(stmt).all()))


@router.get("", response_model=List[AnnouncementOut])
def list_announcements(
    project_id: Optional[uuid.UUID] = None,
    limit: int = 100,
    session: Session = Depends(get_session),
    _user: User = Depends(require_employee),
):
    stmt = select(Announcement).where(Announcement.deleted_at.is_(None))
    if project_id:
        stmt = stmt.where(Announcement.project_id == project_id)
    stmt = stmt.order_by(
        Announcement.is_pinned.desc(), Announcement.published_at.desc()
    ).limit(min(max(limit, 1), 200))
    return _to_out(session, list(session.exec(stmt).all()))


@router.delete("/{announcement_id}")
def delete_announcement(
    announcement_id: uuid.UUID,
    session: Session = Depends(get_session),
    _user: User = Depends(require_employee),
):
    a = session.get(Announcement, announcement_id)
    if not a or a.deleted_at:
        raise HTTPException(status_code=404, detail="Announcement not found")
    a.deleted_at = datetime.utcnow()
    session.add(a)
    session.commit()
    return {"ok": True}
