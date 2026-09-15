"""用户分组 API（管理员维护分组与成员）。权限点：group:manage"""
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from app.db import get_session
from app.core.rbac import require_permission
from app.models import User, UserGroup, UserGroupMember

router = APIRouter(prefix="/user-groups", tags=["user-groups"])


class GroupCreate(BaseModel):
    name: str
    description: Optional[str] = None


class GroupUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class MemberAdd(BaseModel):
    user_id: uuid.UUID


def _serialize_group(session: Session, g: UserGroup) -> dict:
    members = session.exec(
        select(UserGroupMember).where(UserGroupMember.group_id == g.id)
    ).all()
    member_names: list[dict] = []
    if members:
        user_ids = [m.user_id for m in members]
        users = {
            u.id: u
            for u in session.exec(
                select(User).where(User.id.in_(user_ids))
            ).all()
        }
        member_names = [
            {
                "user_id": str(m.user_id),
                "full_name": users.get(m.user_id).full_name if users.get(m.user_id) else None,
                "email": users.get(m.user_id).email if users.get(m.user_id) else None,
            }
            for m in members
        ]
    return {
        "id": str(g.id),
        "name": g.name,
        "description": g.description,
        "is_active": g.is_active,
        "member_count": len(members),
        "members": member_names,
        "created_at": g.created_at.isoformat() if g.created_at else None,
    }


@router.get("")
def list_groups(
    session: Session = Depends(get_session),
    user: User = Depends(require_permission("group:manage")),
):
    """分组列表（含成员）。"""
    groups = session.exec(
        select(UserGroup)
        .where(UserGroup.deleted_at.is_(None))
        .order_by(UserGroup.created_at.desc())
    ).all()
    return {"items": [_serialize_group(session, g) for g in groups], "total": len(groups)}


@router.post("", status_code=201)
def create_group(
    req: GroupCreate,
    session: Session = Depends(get_session),
    user: User = Depends(require_permission("group:manage")),
):
    """创建分组。"""
    if not req.name.strip():
        raise HTTPException(status_code=400, detail="Name required")
    existing = session.exec(
        select(UserGroup).where(UserGroup.name == req.name.strip())
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Group name already exists")
    g = UserGroup(name=req.name.strip(), description=req.description)
    session.add(g)
    session.commit()
    session.refresh(g)
    return _serialize_group(session, g)


@router.patch("/{group_id}")
def update_group(
    group_id: uuid.UUID,
    req: GroupUpdate,
    session: Session = Depends(get_session),
    user: User = Depends(require_permission("group:manage")),
):
    """更新分组（名称/描述/启用状态）。"""
    g = session.get(UserGroup, group_id)
    if not g or g.deleted_at:
        raise HTTPException(status_code=404, detail="Group not found")
    data = req.model_dump(exclude_unset=True)
    if data.get("name") and data["name"].strip():
        dup = session.exec(
            select(UserGroup).where(
                UserGroup.name == data["name"].strip(), UserGroup.id != g.id
            )
        ).first()
        if dup:
            raise HTTPException(status_code=409, detail="Group name already exists")
        data["name"] = data["name"].strip()
    for key, value in data.items():
        setattr(g, key, value)
    session.add(g)
    session.commit()
    session.refresh(g)
    return _serialize_group(session, g)


@router.delete("/{group_id}")
def delete_group(
    group_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(require_permission("group:manage")),
):
    """删除分组（软删除，关联成员一并移除）。"""
    from datetime import datetime

    g = session.get(UserGroup, group_id)
    if not g or g.deleted_at:
        raise HTTPException(status_code=404, detail="Group not found")
    g.deleted_at = datetime.utcnow()
    members = session.exec(
        select(UserGroupMember).where(UserGroupMember.group_id == g.id)
    ).all()
    for m in members:
        session.delete(m)
    session.add(g)
    session.commit()
    return {"id": str(g.id), "ok": True}


@router.post("/{group_id}/members", status_code=201)
def add_member(
    group_id: uuid.UUID,
    req: MemberAdd,
    session: Session = Depends(get_session),
    user: User = Depends(require_permission("group:manage")),
):
    """向分组添加成员。"""
    g = session.get(UserGroup, group_id)
    if not g or g.deleted_at:
        raise HTTPException(status_code=404, detail="Group not found")
    target = session.get(User, req.user_id)
    if not target or target.deleted_at:
        raise HTTPException(status_code=404, detail="User not found")
    dup = session.exec(
        select(UserGroupMember).where(
            UserGroupMember.group_id == g.id, UserGroupMember.user_id == req.user_id
        )
    ).first()
    if dup:
        return _serialize_group(session, g)
    session.add(UserGroupMember(group_id=g.id, user_id=req.user_id))
    session.commit()
    return _serialize_group(session, g)


@router.delete("/{group_id}/members/{user_id}")
def remove_member(
    group_id: uuid.UUID,
    user_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(require_permission("group:manage")),
):
    """从分组移除成员。"""
    row = session.exec(
        select(UserGroupMember).where(
            UserGroupMember.group_id == group_id, UserGroupMember.user_id == user_id
        )
    ).first()
    if row:
        session.delete(row)
        session.commit()
    return {"ok": True}