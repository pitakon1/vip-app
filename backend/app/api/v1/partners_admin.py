"""合作公司管理 API（平台侧）。

权限点：partner:manage。
平台管理员开通/编辑/启停合作公司，并指定其合作公司管理员账号。
"""
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func
from sqlmodel import Session, select

from app.db import get_session
from app.core.pagination import (
    Page,
    PaginationParams,
    paginate_query,
)
from app.core.rbac import require_permission
from app.models import Partner, PartnerStatus, User, UserRole, UserType

router = APIRouter(prefix="/admin/partners", tags=["admin-partners"])


class PartnerCreate(BaseModel):
    name: str
    contact_name: Optional[str] = None
    contact_phone: Optional[str] = None
    license_no: Optional[str] = None
    admin_user_id: Optional[uuid.UUID] = None


class PartnerUpdate(BaseModel):
    name: Optional[str] = None
    contact_name: Optional[str] = None
    contact_phone: Optional[str] = None
    license_no: Optional[str] = None
    admin_user_id: Optional[uuid.UUID] = None


class PartnerOut(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str
    name: str
    contact_name: Optional[str] = None
    contact_phone: Optional[str] = None
    license_no: Optional[str] = None
    admin_user_id: Optional[str] = None
    admin_name: Optional[str] = None
    status: str
    is_active: bool
    member_count: int = 0
    created_at: Optional[str] = None


def _member_count_map(session: Session) -> dict[uuid.UUID, int]:
    rows = session.exec(
        select(User.partner_id, func.count(User.id))
        .where(User.partner_id.is_not(None), User.deleted_at.is_(None))
        .group_by(User.partner_id)
    ).all()
    return {pid: cnt for pid, cnt in rows}


def _serialize_partner(
    session: Session, p: Partner, counts: Optional[dict[uuid.UUID, int]] = None
) -> dict:
    admin_name = None
    if p.admin_user_id:
        admin = session.get(User, p.admin_user_id)
        if admin:
            admin_name = admin.full_name or admin.email
    return {
        "id": str(p.id),
        "name": p.name,
        "contact_name": p.contact_name,
        "contact_phone": p.contact_phone,
        "license_no": p.license_no,
        "admin_user_id": str(p.admin_user_id) if p.admin_user_id else None,
        "admin_name": admin_name,
        "status": p.status.value,
        "is_active": p.is_active,
        "member_count": (counts or {}).get(p.id, 0),
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }


def _validate_admin_candidate(session: Session, admin_user_id: uuid.UUID) -> User:
    """校验目标可作为合作公司管理员：必须是 agent 且未归属任何公司。"""
    target = session.get(User, admin_user_id)
    if not target or target.deleted_at:
        raise HTTPException(status_code=404, detail="User not found")
    if target.role != UserRole.agent:
        raise HTTPException(
            status_code=400,
            detail="Only agent accounts can be designated as partner admin",
        )
    if target.partner_id is not None:
        raise HTTPException(
            status_code=400, detail="User already belongs to a partner company"
        )
    return target


def _promote_admin(session: Session, target: User, partner_id: uuid.UUID) -> None:
    target.role = UserRole.partner_admin
    target.user_type = UserType.partner
    target.partner_id = partner_id
    session.add(target)


@router.get("", response_model=Page[PartnerOut])
def list_partners(
    pagination: PaginationParams = Depends(),
    keyword: Optional[str] = None,
    session: Session = Depends(get_session),
    user: User = Depends(require_permission("partner:manage")),
):
    """合作公司列表（分页 / 关键词过滤）。"""
    conditions = [Partner.deleted_at.is_(None)]
    if keyword:
        kw = f"%{keyword}%"
        conditions.append(Partner.name.like(kw))
    stmt = (
        select(Partner)
        .where(*conditions)
        .order_by(Partner.created_at.desc())
    )
    page = paginate_query(session, stmt, pagination)
    counts = _member_count_map(session)
    page.items = [_serialize_partner(session, p, counts) for p in page.items]
    return page


@router.post("", status_code=201, response_model=PartnerOut)
def create_partner(
    req: PartnerCreate,
    session: Session = Depends(get_session),
    user: User = Depends(require_permission("partner:manage")),
):
    """开通合作公司，并可同时指定其合作公司管理员。"""
    if not req.name.strip():
        raise HTTPException(status_code=400, detail="Name required")
    dup = session.exec(
        select(Partner).where(Partner.name == req.name.strip())
    ).first()
    if dup:
        raise HTTPException(status_code=409, detail="Partner name already exists")

    partner = Partner(
        name=req.name.strip(),
        contact_name=req.contact_name,
        contact_phone=req.contact_phone,
        license_no=req.license_no,
        status=PartnerStatus.active,
        is_active=True,
        created_by=user.id,
    )
    session.add(partner)
    session.flush()

    if req.admin_user_id:
        admin = _validate_admin_candidate(session, req.admin_user_id)
        _promote_admin(session, admin, partner.id)
        partner.admin_user_id = admin.id

    session.add(partner)
    session.commit()
    session.refresh(partner)
    return _serialize_partner(session, partner)


@router.patch("/{partner_id}", response_model=PartnerOut)
def update_partner(
    partner_id: uuid.UUID,
    req: PartnerUpdate,
    session: Session = Depends(get_session),
    user: User = Depends(require_permission("partner:manage")),
):
    """编辑公司资料 / 指定或更换合作公司管理员。"""
    p = session.get(Partner, partner_id)
    if not p or p.deleted_at:
        raise HTTPException(status_code=404, detail="Partner not found")

    data = req.model_dump(exclude_unset=True)
    new_admin = data.pop("admin_user_id", None)

    if data.get("name") and data["name"].strip():
        dup = session.exec(
            select(Partner).where(
                Partner.name == data["name"].strip(), Partner.id != p.id
            )
        ).first()
        if dup:
            raise HTTPException(status_code=409, detail="Partner name already exists")
        data["name"] = data["name"].strip()

    # 更换管理员：旧管理员降回 agent（保留 partner 归属），新管理员提权。
    if new_admin is not None and str(new_admin) != str(p.admin_user_id):
        admin = _validate_admin_candidate(session, new_admin)
        if p.admin_user_id:
            old = session.get(User, p.admin_user_id)
            if old and not old.deleted_at:
                old.role = UserRole.agent
                # 保留 user_type/partner_id：语义为「仍属本公司但不再管理员」
                session.add(old)
        _promote_admin(session, admin, p.id)
        p.admin_user_id = admin.id

    for key, value in data.items():
        setattr(p, key, value)
    session.add(p)
    session.commit()
    session.refresh(p)
    return _serialize_partner(session, p)


def _set_partner_active(
    partner_id: uuid.UUID,
    is_active: bool,
    session: Session,
) -> dict:
    p = session.get(Partner, partner_id)
    if not p or p.deleted_at:
        raise HTTPException(status_code=404, detail="Partner not found")
    p.is_active = is_active
    session.add(p)
    session.commit()
    session.refresh(p)
    return {"id": str(p.id), "is_active": p.is_active}


@router.post("/{partner_id}/deactivate")
def deactivate_partner(
    partner_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(require_permission("partner:manage")),
):
    """停用合作公司。"""
    return _set_partner_active(partner_id, False, session)


@router.post("/{partner_id}/activate")
def activate_partner(
    partner_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(require_permission("partner:manage")),
):
    """启用合作公司。"""
    return _set_partner_active(partner_id, True, session)