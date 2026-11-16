"""房产自助绑定申请 / 审核路由。

C 端（业主、租客统一）提交「添加我的房产」申请，后台审核通过后才建立
用户与房源的关联（Owner 档案 + Property）。附件不公开托管，仅本人与
内部员工可通过带鉴权接口读取。
"""
import os
import uuid
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field as PydanticField
from sqlmodel import Session, select

from app.core.auth import STAFF_ROLES, get_current_user
from app.core.cache import delete_cache_pattern, invalidate_aggregate_caches
from app.core.pagination import Page, PaginationParams, paginate_query
from app.core.uploads import detect_document_mime, save_upload
from app.db import get_session
from app.models import (
    Lease,
    LeaseStatus,
    Listing,
    ListingStatus,
    Notification,
    NotificationChannel,
    Owner,
    Property,
    PropertyBinding,
    PropertyBindingKind,
    PropertyBindingStatus,
    PropertyReviewStatus,
    User,
)
from app.services import dedupe_service
from app.services.serial_number import next_no

router = APIRouter(prefix="/property-bindings", tags=["property-bindings"])

# 证明材料落盘目录（backend/uploads/property_bindings），不对外静态托管
UPLOAD_DIR = Path(__file__).resolve().parents[3] / "uploads" / "property_bindings"
MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024
STORED_URL_PREFIX = "/uploads/property_bindings/"

# 产权证明 / 购房合同 / 身份证明：只接受 PDF 与常见图片
ALLOWED_ATTACHMENT_TYPES: dict[str, tuple[str, set]] = {
    ".pdf": ("application/pdf", {"application/pdf"}),
    ".jpg": ("image/jpeg", {"image/jpeg"}),
    ".jpeg": ("image/jpeg", {"image/jpeg"}),
    ".png": ("image/png", {"image/png"}),
    ".webp": ("image/webp", {"image/webp"}),
}


class AttachmentIn(BaseModel):
    name: str
    url: str
    size: Optional[int] = None
    content_type: Optional[str] = None


class PropertyBindingCreate(BaseModel):
    # claim=认领系统内已有房源（property_id 必填）；new=业主自助录入新房源
    kind: PropertyBindingKind = PropertyBindingKind.new
    property_id: Optional[uuid.UUID] = None
    address: str = PydanticField(min_length=1, max_length=300)
    room_number: str = PydanticField(min_length=1, max_length=50)
    size_sqm: Optional[float] = None
    property_type: str = PydanticField(default="apartment", max_length=30)
    note: Optional[str] = None
    attachments: List[AttachmentIn] = PydanticField(default_factory=list)


class ReviewAction(BaseModel):
    note: Optional[str] = None
    # 认领审核：审核人员可指定 / 改判目标房源（命中多个候选时由人判定）
    property_id: Optional[uuid.UUID] = None


class RejectAction(BaseModel):
    reason: str = PydanticField(min_length=1, max_length=500)
    note: Optional[str] = None


def _property_brief(session: Session, property_id: Optional[uuid.UUID]) -> Optional[dict]:
    """审核页展示的目标房源摘要（含租约 / 挂牌数量，帮助判断认领是否合理）。"""
    if not property_id:
        return None
    prop = session.get(Property, property_id)
    if not prop or prop.deleted_at:
        return None
    owner_name = None
    if prop.owner_id:
        owner = session.get(Owner, prop.owner_id)
        owner_user = session.get(User, owner.user_id) if owner and owner.user_id else None
        owner_name = owner_user.full_name if owner_user else None
    lease_count = session.exec(
        select(Lease.id).where(
            Lease.property_id == prop.id,
            Lease.status == LeaseStatus.active,
            Lease.deleted_at.is_(None),
        )
    ).all()
    listing_count = session.exec(
        select(Listing.id).where(
            Listing.property_id == prop.id,
            Listing.status == ListingStatus.active,
            Listing.deleted_at.is_(None),
        )
    ).all()
    return {
        "id": str(prop.id),
        "address": prop.address,
        "room_number": prop.room_number,
        "building": prop.building,
        "floor": prop.floor,
        "size_sqm": prop.size_sqm,
        "property_type": prop.property_type,
        "status": prop.status.value if prop.status else None,
        "review_status": (
            prop.review_status.value if prop.review_status else None
        ),
        "owner_name": owner_name,
        "active_lease_count": len(lease_count),
        "active_listing_count": len(listing_count),
    }


def _serialize(
    binding: PropertyBinding,
    applicant: Optional[User] = None,
    target: Optional[dict] = None,
) -> dict:
    return {
        "id": str(binding.id),
        "user_id": str(binding.user_id),
        "applicant_name": applicant.full_name if applicant else None,
        "applicant_email": applicant.email if applicant else None,
        "applicant_phone": applicant.phone if applicant else None,
        "kind": binding.kind.value if binding.kind else None,
        "status": binding.status.value if binding.status else None,
        "address": binding.address,
        "room_number": binding.room_number,
        "size_sqm": binding.size_sqm,
        "property_type": binding.property_type,
        "note": binding.note,
        "attachments": binding.attachments or [],
        "reject_reason": binding.reject_reason,
        "review_note": binding.review_note,
        "reviewed_by": str(binding.reviewed_by) if binding.reviewed_by else None,
        "reviewed_at": binding.reviewed_at.isoformat() if binding.reviewed_at else None,
        "matched_property_id": (
            str(binding.matched_property_id) if binding.matched_property_id else None
        ),
        "property_id": str(binding.property_id) if binding.property_id else None,
        # 目标房源摘要：认领时是命中的既有房源；新建时是待审房源
        "target_property": target,
        "created_at": binding.created_at.isoformat() if binding.created_at else None,
        "updated_at": binding.updated_at.isoformat() if binding.updated_at else None,
    }


def _validate_attachments(items: List[AttachmentIn]) -> list[dict]:
    """只接受服务端生成的上传路径，并确认磁盘文件真实存在。"""
    if not items:
        raise HTTPException(status_code=400, detail="请至少上传一份产权证明材料")
    result: list[dict] = []
    for item in items:
        url = item.url or ""
        if not url.startswith(STORED_URL_PREFIX):
            raise HTTPException(status_code=400, detail="非法的附件地址")
        filename = os.path.basename(url)
        if not filename or filename != Path(filename).name:
            raise HTTPException(status_code=400, detail="非法的附件地址")
        if not (UPLOAD_DIR / filename).is_file():
            raise HTTPException(status_code=400, detail="附件不存在，请重新上传")
        result.append(
            {
                "name": item.name or filename,
                "url": url,
                "size": item.size,
                "content_type": item.content_type,
            }
        )
    return result


def _notify(session: Session, user: User, template_key: str, subject: str, content: str,
            binding_id: uuid.UUID) -> None:
    session.add(
        Notification(
            user_id=user.id,
            channel=NotificationChannel.in_app,
            template_key=template_key,
            recipient=user.email or str(user.id),
            subject=subject,
            content=content,
            related_entity_type="property_binding",
            related_entity_id=binding_id,
        )
    )


def _ensure_owner(session: Session, user_id: uuid.UUID) -> Owner:
    """取（或创建）用户的业主档案。档案本身不授予任何数据权限，
    房源的可见性由「审核通过的绑定 + Property.review_status」决定。"""
    owner = session.exec(
        select(Owner).where(
            Owner.user_id == user_id,
            Owner.deleted_at.is_(None),
        )
    ).first()
    if not owner:
        owner = Owner(user_id=user_id)
        session.add(owner)
        session.flush()
    return owner


def _match_candidates(
    session: Session,
    *,
    address: str,
    room_number: str,
    project_id: Optional[uuid.UUID] = None,
    building: Optional[str] = None,
) -> list[dict]:
    """按地址 / 房号匹配系统内已有房源，供申请人选择认领。

    多层匹配：结构化/自由地址唯一键强命中 → 相似度候选 → 房号一致且地址
    相似度 ≥ 0.5 的兜底候选。命中多个时不替用户做决定，全部返回由人选择
    （审核人员也可在审核时改判）。
    """
    resolved = dedupe_service.resolve(
        session,
        project_id=project_id,
        building=building,
        room_number=room_number,
        address=address,
    )
    seen: dict[uuid.UUID, dict] = {}

    def add(prop: Optional[Property], score: float, matched_by: str) -> None:
        if prop is None or prop.deleted_at:
            return
        current = seen.get(prop.id)
        if current is not None and current["score"] >= score:
            return
        seen[prop.id] = {
            "property_id": str(prop.id),
            "address": prop.address,
            "room_number": prop.room_number,
            "building": prop.building,
            "floor": prop.floor,
            "size_sqm": prop.size_sqm,
            "property_type": prop.property_type,
            "status": prop.status.value if prop.status else None,
            "review_status": (
                prop.review_status.value if prop.review_status else None
            ),
            "score": round(score, 2),
            "matched_by": matched_by,
        }

    if resolved["existing"] is not None:
        add(resolved["existing"], 100.0, "exact")
    for item in resolved.get("fuzzy") or []:
        add(session.get(Property, item["property_id"]), float(item["score"]), "similar")

    room_n = dedupe_service.norm_room(room_number)
    if room_n:
        stmt = select(Property).where(
            Property.deleted_at.is_(None),
            Property.review_status == PropertyReviewStatus.approved,
        )
        if project_id:
            stmt = stmt.where(Property.project_id == project_id)
        coarse_room = (room_number or "").strip()
        if coarse_room:
            stmt = stmt.where(Property.room_number.ilike(f"%{coarse_room}%"))
        for cand in session.exec(stmt.limit(50)).all():
            if dedupe_service.norm_room(cand.room_number) != room_n:
                continue
            score = dedupe_service.address_similarity(
                address or "", cand.address or ""
            )
            if score >= 0.5:
                add(cand, score * 100, "address")

    return sorted(seen.values(), key=lambda x: x["score"], reverse=True)[:10]


def _bind_pending_property(
    session: Session,
    *,
    user: User,
    owner: Owner,
    address: str,
    room_number: str,
    size_sqm: Optional[float],
    property_type: str,
    note: Optional[str],
) -> Property:
    """为「新建房源」申请落一条待审房源（不对外展示）。

    若命中的是本人上一轮被驳回的待审房源，则复用同一条记录，避免重复建档
    与 dedupe_key 唯一索引冲突；命中他人/已通过审核的房源时提示走认领。
    """
    resolved = dedupe_service.resolve(
        session,
        project_id=None,
        building=None,
        room_number=room_number,
        address=address,
    )
    existing = resolved["existing"]
    if existing is not None:
        reusable = (
            existing.review_status == PropertyReviewStatus.pending
            and existing.created_by == user.id
        )
        if not reusable:
            raise HTTPException(
                status_code=409,
                detail="系统中已有该房源，请在匹配结果中选择「认领」",
            )
        existing.address = address
        existing.room_number = room_number
        existing.size_sqm = size_sqm
        existing.property_type = property_type or "apartment"
        existing.description = note
        existing.owner_id = owner.id
        existing.review_status = PropertyReviewStatus.pending
        session.add(existing)
        session.flush()
        return existing

    prop = Property(
        owner_id=owner.id,
        room_number=room_number,
        address=address,
        size_sqm=size_sqm,
        property_type=property_type or "apartment",
        description=note,
        created_by=user.id,
        review_status=PropertyReviewStatus.pending,
        dedupe_type=resolved["dedupe_type"],
        dedupe_key=resolved["dedupe_key"],
        address_norm=resolved["address_norm"],
        listing_no=next_no(session, "FY"),
    )
    session.add(prop)
    session.flush()
    return prop


@router.get("/match", response_model=dict)
def match_existing_properties(
    address: str = "",
    room_number: str = "",
    project_id: Optional[uuid.UUID] = None,
    building: Optional[str] = None,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """提交前匹配系统内已有房源：命中则可选择「认领」，未命中走「新建」。"""
    if not (address.strip() or room_number.strip()):
        return {"items": []}
    items = _match_candidates(
        session,
        address=address.strip(),
        room_number=room_number.strip(),
        project_id=project_id,
        building=building,
    )
    # 审核人员改判需要「当前归属 + 关联数据量」来判断，C 端不返回业主信息
    if user.role in STAFF_ROLES:
        for item in items:
            brief = _property_brief(session, uuid.UUID(item["property_id"]))
            if brief:
                item["owner_name"] = brief["owner_name"]
                item["active_lease_count"] = brief["active_lease_count"]
                item["active_listing_count"] = brief["active_listing_count"]
    return {"items": items}


@router.post("/attachments")
def upload_attachment(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
):
    """上传房产证明材料（multipart）。落盘后返回站内受保护路径。"""
    original_name = file.filename or "attachment"
    ext = os.path.splitext(original_name)[1].lower()
    allowed = ALLOWED_ATTACHMENT_TYPES.get(ext)
    if not allowed:
        raise HTTPException(
            status_code=400,
            detail="Unsupported attachment type（支持 PDF / JPG / PNG / WEBP）",
        )
    canonical_mime, _ = allowed
    try:
        url = save_upload(
            file,
            UPLOAD_DIR,
            MAX_ATTACHMENT_SIZE,
            set(ALLOWED_ATTACHMENT_TYPES),
            {e: m for e, (_, m) in ALLOWED_ATTACHMENT_TYPES.items()},
            detector=detect_document_mime,
            name_prefix="binding",
            url_prefix=STORED_URL_PREFIX,
            label="attachment",
            supported_text="（支持 PDF / JPG / PNG / WEBP）",
        )
    finally:
        size = file.file.tell()
    return {
        "name": original_name,
        "url": url,
        "size": size,
        "content_type": canonical_mime,
    }


@router.get("/me", response_model=List[dict])
def list_my_bindings(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """我的房产绑定申请（含历史驳回记录）。"""
    rows = session.exec(
        select(PropertyBinding)
        .where(
            PropertyBinding.user_id == user.id,
            PropertyBinding.deleted_at.is_(None),
        )
        .order_by(PropertyBinding.created_at.desc())
    ).all()
    return [
        _serialize(r, user, _property_brief(session, r.property_id))
        for r in rows
    ]


@router.post("")
def create_binding(
    req: PropertyBindingCreate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """提交房产绑定申请；同一用户同时只能有一条待审申请。

    - `kind=claim`：按 `property_id` 认领系统内已有房源，审核通过后只把该房源
      关联到申请人，**不另建重复房源**（租约 / 挂牌 / 收款记录继续挂原记录）。
    - `kind=new`：业主自助录入新房源，先落一条 `review_status=pending` 的房源，
      审核通过前不对外展示、不能被搜索、也不能挂牌。
    """
    pending = session.exec(
        select(PropertyBinding).where(
            PropertyBinding.user_id == user.id,
            PropertyBinding.status == PropertyBindingStatus.pending,
            PropertyBinding.deleted_at.is_(None),
        )
    ).first()
    if pending:
        raise HTTPException(status_code=409, detail="已有待审核的房产申请，请等待审核结果")

    attachments = _validate_attachments(req.attachments)
    owner = _ensure_owner(session, user.id)

    if req.kind == PropertyBindingKind.claim:
        if not req.property_id:
            raise HTTPException(status_code=400, detail="认领房源需要选择目标房源")
        prop = session.get(Property, req.property_id)
        if not prop or prop.deleted_at:
            raise HTTPException(status_code=404, detail="目标房源不存在")
        if prop.review_status != PropertyReviewStatus.approved:
            raise HTTPException(status_code=409, detail="该房源尚未通过审核，暂不可认领")
        if prop.owner_id == owner.id:
            raise HTTPException(status_code=409, detail="该房源已在你的名下")
        claimed = session.exec(
            select(PropertyBinding).where(
                PropertyBinding.matched_property_id == prop.id,
                PropertyBinding.kind == PropertyBindingKind.claim,
                PropertyBinding.status == PropertyBindingStatus.approved,
                PropertyBinding.deleted_at.is_(None),
            )
        ).first()
        if claimed:
            raise HTTPException(status_code=409, detail="该房源已被其他用户认领")
        binding = PropertyBinding(
            user_id=user.id,
            kind=PropertyBindingKind.claim,
            address=prop.address,
            room_number=prop.room_number,
            size_sqm=prop.size_sqm if req.size_sqm is None else req.size_sqm,
            property_type=prop.property_type or req.property_type or "apartment",
            note=req.note,
            attachments=attachments,
            status=PropertyBindingStatus.pending,
            matched_property_id=prop.id,
            property_id=prop.id,
        )
    else:
        prop = _bind_pending_property(
            session,
            user=user,
            owner=owner,
            address=req.address.strip(),
            room_number=req.room_number.strip(),
            size_sqm=req.size_sqm,
            property_type=req.property_type or "apartment",
            note=req.note,
        )
        binding = PropertyBinding(
            user_id=user.id,
            kind=PropertyBindingKind.new,
            address=req.address.strip(),
            room_number=req.room_number.strip(),
            size_sqm=req.size_sqm,
            property_type=req.property_type or "apartment",
            note=req.note,
            attachments=attachments,
            status=PropertyBindingStatus.pending,
            property_id=prop.id,
        )

    session.add(binding)
    session.commit()
    session.refresh(binding)
    # 新建待审房源会改变可见集合，缓存必须失效
    delete_cache_pattern("cache:properties:*")
    invalidate_aggregate_caches()
    return _serialize(binding, user, _property_brief(session, binding.property_id))


@router.get("", response_model=Page[dict])
def list_bindings(
    status: Optional[PropertyBindingStatus] = None,
    keyword: Optional[str] = None,
    pagination: PaginationParams = Depends(),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """后台审核队列。"""
    if user.role not in STAFF_ROLES:
        raise HTTPException(status_code=403, detail="No permission")

    conditions = [PropertyBinding.deleted_at.is_(None)]
    if status:
        conditions.append(PropertyBinding.status == status)
    if keyword:
        pattern = f"%{keyword.strip()}%"
        conditions.append(
            PropertyBinding.address.like(pattern)
            | PropertyBinding.room_number.like(pattern)
        )

    stmt = (
        select(PropertyBinding)
        .where(*conditions)
        .order_by(PropertyBinding.created_at.desc())
    )
    page = paginate_query(session, stmt, pagination)

    user_ids = {b.user_id for b in page.items}
    applicants = {
        u.id: u
        for u in (
            session.exec(select(User).where(User.id.in_(user_ids))).all()
            if user_ids
            else []
        )
    }
    page.items = [
        _serialize(
            b,
            applicants.get(b.user_id),
            _property_brief(session, b.property_id),
        )
        for b in page.items
    ]
    return page


@router.get("/{binding_id}", response_model=dict)
def get_binding(
    binding_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    binding = session.get(PropertyBinding, binding_id)
    if not binding or binding.deleted_at:
        raise HTTPException(status_code=404, detail="Binding not found")
    if binding.user_id != user.id and user.role not in STAFF_ROLES:
        raise HTTPException(status_code=403, detail="No permission")
    applicant = session.get(User, binding.user_id)
    return _serialize(
        binding, applicant, _property_brief(session, binding.property_id)
    )


@router.get("/{binding_id}/attachments/{index}")
def download_attachment(
    binding_id: uuid.UUID,
    index: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """附件鉴权下载：仅申请人本人与内部员工可读。"""
    binding = session.get(PropertyBinding, binding_id)
    if not binding or binding.deleted_at:
        raise HTTPException(status_code=404, detail="Binding not found")
    if binding.user_id != user.id and user.role not in STAFF_ROLES:
        raise HTTPException(status_code=403, detail="No permission")

    attachments = binding.attachments or []
    if index < 0 or index >= len(attachments):
        raise HTTPException(status_code=404, detail="Attachment not found")

    item = attachments[index] or {}
    filename = os.path.basename(str(item.get("url") or ""))
    path = UPLOAD_DIR / filename
    if not filename or not path.is_file():
        raise HTTPException(status_code=404, detail="Attachment file not found")

    return FileResponse(
        path,
        media_type=item.get("content_type") or "application/octet-stream",
        filename=item.get("name") or filename,
    )


@router.post("/{binding_id}/approve")
def approve_binding(
    binding_id: uuid.UUID,
    body: ReviewAction,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """审核通过。

    - 认领（claim）：把既有房源关联到申请人，不新建房源；原房源的租约 /
      挂牌 / 收款记录都挂在同一个 `properties.id` 上，因此不断链。
    - 新建（new）：把提交时创建的待审房源置为 approved，审核通过后才可见、可挂牌。
    """
    if user.role not in STAFF_ROLES:
        raise HTTPException(status_code=403, detail="No permission")

    binding = session.get(PropertyBinding, binding_id)
    if not binding or binding.deleted_at:
        raise HTTPException(status_code=404, detail="Binding not found")
    if binding.status != PropertyBindingStatus.pending:
        raise HTTPException(status_code=409, detail="该申请已处理")

    applicant = session.get(User, binding.user_id)
    if not applicant or applicant.deleted_at:
        raise HTTPException(status_code=400, detail="申请人不存在")

    owner = _ensure_owner(session, binding.user_id)
    kind = binding.kind or PropertyBindingKind.new

    if kind == PropertyBindingKind.claim:
        target_id = body.property_id or binding.matched_property_id or binding.property_id
        if not target_id:
            raise HTTPException(status_code=400, detail="缺少认领的目标房源")
        prop = session.get(Property, target_id)
        if not prop or prop.deleted_at:
            raise HTTPException(status_code=404, detail="目标房源不存在")
        if prop.review_status != PropertyReviewStatus.approved:
            raise HTTPException(status_code=409, detail="该房源尚未通过审核，不能作为认领目标")
        if prop.owner_id == owner.id:
            raise HTTPException(status_code=409, detail="该房源已在申请人名下")
        conflict = session.exec(
            select(PropertyBinding).where(
                PropertyBinding.matched_property_id == prop.id,
                PropertyBinding.kind == PropertyBindingKind.claim,
                PropertyBinding.status == PropertyBindingStatus.approved,
                PropertyBinding.id != binding.id,
                PropertyBinding.deleted_at.is_(None),
            )
        ).first()
        if conflict:
            raise HTTPException(status_code=409, detail="该房源已被其他用户认领")
        # 只改归属，不新建房源：租约 / 挂牌 / 收款记录继续挂在同一条记录上
        prop.owner_id = owner.id
        prop.review_status = PropertyReviewStatus.approved
        session.add(prop)
        binding.matched_property_id = prop.id
        binding.property_id = prop.id
        content = (
            f"你认领的房产（{prop.address} {prop.room_number}）已通过审核，"
            "现可在「我的房产」中查看。"
        )
    else:
        prop = session.get(Property, binding.property_id) if binding.property_id else None
        if prop is None or prop.deleted_at:
            # 兼容历史数据（提交时未落待审房源）：按申请信息补建一条
            prop = Property(
                owner_id=owner.id,
                room_number=binding.room_number,
                address=binding.address,
                size_sqm=binding.size_sqm,
                property_type=binding.property_type or "apartment",
                description=binding.note,
                created_by=binding.user_id,
                review_status=PropertyReviewStatus.approved,
            )
        prop.owner_id = owner.id
        prop.room_number = binding.room_number
        prop.address = binding.address
        prop.size_sqm = binding.size_sqm
        prop.property_type = binding.property_type or "apartment"
        prop.review_status = PropertyReviewStatus.approved
        session.add(prop)
        session.flush()
        binding.property_id = prop.id
        content = (
            f"你提交的房源（{binding.address} {binding.room_number}）已通过审核，"
            "现可在「我的房产」中查看并挂牌。"
        )

    now = datetime.utcnow()
    binding.status = PropertyBindingStatus.approved
    binding.reviewed_by = user.id
    binding.reviewed_at = now
    binding.review_note = body.note
    binding.reject_reason = None
    session.add(binding)
    _notify(
        session,
        applicant,
        "property_binding_approved",
        "房产绑定申请已通过",
        content,
        binding.id,
    )
    session.commit()
    session.refresh(binding)
    delete_cache_pattern("cache:properties:*")
    invalidate_aggregate_caches()
    return _serialize(
        binding, applicant, _property_brief(session, binding.property_id)
    )


@router.post("/{binding_id}/reject")
def reject_binding(
    binding_id: uuid.UUID,
    body: RejectAction,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """审核驳回：必须填写原因，用户可修改后重新提交。"""
    if user.role not in STAFF_ROLES:
        raise HTTPException(status_code=403, detail="No permission")

    binding = session.get(PropertyBinding, binding_id)
    if not binding or binding.deleted_at:
        raise HTTPException(status_code=404, detail="Binding not found")
    if binding.status != PropertyBindingStatus.pending:
        raise HTTPException(status_code=409, detail="该申请已处理")

    applicant = session.get(User, binding.user_id)
    if not applicant:
        raise HTTPException(status_code=400, detail="申请人不存在")

    binding.status = PropertyBindingStatus.rejected
    binding.reviewed_by = user.id
    binding.reviewed_at = datetime.utcnow()
    binding.reject_reason = body.reason.strip()
    binding.review_note = body.note
    session.add(binding)
    _notify(
        session,
        applicant,
        "property_binding_rejected",
        "房产绑定申请被驳回",
        f"你提交的房产（{binding.address} {binding.room_number}）绑定申请被驳回：{binding.reject_reason}。可修改材料后重新提交。",
        binding.id,
    )
    session.commit()
    session.refresh(binding)
    return _serialize(
        binding, applicant, _property_brief(session, binding.property_id)
    )
