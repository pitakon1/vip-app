"""实名认证 API：证件上传 + 人工审核（不接人脸识别 / 第三方核验）。

链路：
1. `POST /identity/submit`：本人上传证件正/反面 + PDPA 同意勾选 → 生成 pending 记录；
2. `GET /identity/me`：本人查看当前状态（none / pending / approved / rejected + 驳回原因）；
3. 后台 `GET /identity/pending` / `approve` / `reject`（仅 admin），驳回必填原因；
4. 证件图片不做静态托管，只能通过 `.../file/{side}` 鉴权读取（本人或 admin）。

安全取舍：
- 文件按扩展名 + 文件头双校验，单张 8MB 上限；
- 证件号在接口里只回脱敏尾号，完整号码留在库里供审核比对；
- 查询串令牌只用于文件读取接口，供 `<img>` / 小程序 previewImage 使用。
"""
import uuid
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlmodel import Session, select

from app.core.auth import (
    get_current_user,
    get_current_user_allow_query_token,
)
from app.core.uploads import detect_image_mime, resolve_stored_path, save_upload
from app.db import get_session
from app.models import (
    Consent,
    IdentityDocType,
    IdentityReviewStatus,
    IdentityVerification,
    Notification,
    NotificationChannel,
    NotificationStatus,
    User,
    UserRole,
)

router = APIRouter(prefix="/identity", tags=["identity"])

IDENTITY_DIR = Path(__file__).resolve().parents[3] / "uploads" / "identity"
MAX_IDENTITY_SIZE = 8 * 1024 * 1024  # 单张证件 8MB
STORED_URL_PREFIX = "/identity-files/"

ALLOWED_IMAGE_TYPES = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
}


class IdentityOut(BaseModel):
    """实名认证状态（本人视角；证件号已脱敏）。"""

    status: str  # none / pending / approved / rejected
    id: Optional[uuid.UUID] = None
    doc_type: Optional[str] = None
    real_name: Optional[str] = None
    id_number_masked: Optional[str] = None
    has_front: bool = False
    has_back: bool = False
    submitted_at: Optional[datetime] = None
    reviewed_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None
    consent_granted_at: Optional[datetime] = None
    consent_policy_version: Optional[str] = None
    is_verified: bool = False


class IdentityPendingItem(BaseModel):
    """后台审核队列条目。"""

    id: uuid.UUID
    user_id: uuid.UUID
    user_name: Optional[str] = None
    user_email: Optional[str] = None
    user_phone: Optional[str] = None
    user_is_verified: bool = False
    doc_type: str
    real_name: str
    id_number_masked: Optional[str] = None
    has_front: bool = True
    has_back: bool = False
    submitted_at: datetime
    consent_granted_at: datetime
    consent_policy_version: str


class IdentityRejectIn(BaseModel):
    reason: str


class StagingUploadOut(BaseModel):
    """单文件预上传结果（小程序端 `Taro.uploadFile` 一次只能带一个文件）。"""

    stored: str


def _mask_id_number(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    tail = value[-4:]
    return f"****{tail}" if len(value) > 4 else "****"


def _save_identity_image(upload: UploadFile, *, name_prefix: str) -> str:
    return save_upload(
        upload,
        IDENTITY_DIR,
        MAX_IDENTITY_SIZE,
        set(ALLOWED_IMAGE_TYPES),
        {ext: {mime} for ext, mime in ALLOWED_IMAGE_TYPES.items()},
        detector=detect_image_mime,
        name_prefix=name_prefix,
        url_prefix=STORED_URL_PREFIX,
        label="identity document",
        supported_text="（支持 JPG / PNG / WEBP）",
    )


def _resolve_staged(stored: Optional[str], user: User) -> Optional[str]:
    """校验 staging 地址确实存在且属于当前用户。

    staging 文件名带 `stage_{user_id}_` 前缀（user_id 是服务端写入的，
    客户端无法伪造），避免把别人的证件材料挂到自己名下。
    """
    value = (stored or "").strip()
    if not value:
        return None
    path = resolve_stored_path(
        value,
        IDENTITY_DIR,
        STORED_URL_PREFIX,
        url_name="staged_file_url",
        not_found_message="证件图片不存在，请重新上传",
    )
    if not path.name.startswith(f"stage_{user.id.hex}_"):
        raise HTTPException(status_code=403, detail="证件材料不属于当前账号，请重新上传")
    return value


def _latest(session: Session, user_id: uuid.UUID) -> Optional[IdentityVerification]:
    return session.exec(
        select(IdentityVerification)
        .where(
            IdentityVerification.user_id == user_id,
            IdentityVerification.deleted_at.is_(None),
        )
        .order_by(IdentityVerification.submitted_at.desc())
    ).first()


def _to_out(user: User, record: Optional[IdentityVerification]) -> IdentityOut:
    if not record:
        return IdentityOut(status="none", is_verified=bool(user.is_verified))
    return IdentityOut(
        status=record.status.value,
        id=record.id,
        doc_type=record.doc_type.value,
        real_name=record.real_name,
        id_number_masked=_mask_id_number(record.id_number),
        has_front=bool(record.front_file_url),
        has_back=bool(record.back_file_url),
        submitted_at=record.submitted_at,
        reviewed_at=record.reviewed_at,
        rejection_reason=record.rejection_reason,
        consent_granted_at=record.consent_granted_at,
        consent_policy_version=record.consent_policy_version,
        is_verified=bool(user.is_verified),
    )


def _require_admin(user: User) -> None:
    if user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="仅管理员可审核实名认证")


def _notify_user(
    session: Session,
    record: IdentityVerification,
    *,
    approved: bool,
    reason: Optional[str] = None,
) -> None:
    subject = "实名认证已通过" if approved else "实名认证被驳回"
    content = "你的实名认证已通过审核。" if approved else f"驳回原因：{reason}"
    session.add(
        Notification(
            user_id=record.user_id,
            channel=NotificationChannel.in_app,
            template_key="identity.approved" if approved else "identity.rejected",
            recipient=str(record.user_id),
            subject=subject,
            content=content,
            status=NotificationStatus.queued,
            related_entity_type="identity_verification",
            related_entity_id=record.id,
        )
    )


@router.get("/me", response_model=IdentityOut)
def get_my_identity(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    return _to_out(user, _latest(session, user.id))


@router.post("/staging", response_model=StagingUploadOut)
def stage_identity_document(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
):
    """单文件预上传（给小程序用：`Taro.uploadFile` 一次只能传一个文件）。

    只做落盘 + 返回 staging 地址，不落库、不改状态；`/identity/submit` 接受
    带本人前缀的 staging 地址作为正面/反面材料。
    """
    stored = _save_identity_image(file, name_prefix=f"stage_{user.id.hex}")
    return StagingUploadOut(stored=stored)


@router.post("/submit", response_model=IdentityOut)
def submit_identity(
    request: Request,
    doc_type: str = Form(...),
    real_name: str = Form(...),
    consent: bool = Form(...),
    id_number: Optional[str] = Form(None),
    policy_version: str = Form("2026-11"),
    front: Optional[UploadFile] = File(None),
    back: Optional[UploadFile] = File(None),
    front_stored: Optional[str] = Form(None),
    back_stored: Optional[str] = Form(None),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """提交实名认证材料。

    `consent` 必须为 true（PDPA 同意），否则直接 400，不保存任何文件。
    已有 pending / approved 记录时返回 409，避免重复提交造成审核队列堆积。

    材料既可以随请求直接上传（`front` / `back`），也可以先经 `/identity/staging`
    预传再用 `front_stored` / `back_stored` 引用（小程序端一次只能传一个文件）。
    """
    if not consent:
        raise HTTPException(
            status_code=400,
            detail="需要先同意个人信息处理规则（PDPA）才能提交",
        )
    try:
        doc_type_enum = IdentityDocType(doc_type)
    except ValueError:
        raise HTTPException(status_code=400, detail="不支持的证件类型")

    real_name = (real_name or "").strip()
    if not real_name or len(real_name) > 100:
        raise HTTPException(status_code=400, detail="请填写证件上的姓名")
    id_number = (id_number or "").strip() or None
    if id_number and len(id_number) > 64:
        raise HTTPException(status_code=400, detail="证件号码过长")

    latest = _latest(session, user.id)
    if latest and latest.status == IdentityReviewStatus.pending:
        raise HTTPException(status_code=409, detail="已有待审核的实名认证，请等待审核结果")
    if latest and latest.status == IdentityReviewStatus.approved:
        raise HTTPException(status_code=409, detail="实名认证已通过，无需重复提交")

    front_url: Optional[str] = None
    if front is not None and (front.filename or "").strip():
        front_url = _save_identity_image(front, name_prefix="idfront")
    if not front_url:
        front_url = _resolve_staged(front_stored, user)
    if not front_url:
        raise HTTPException(status_code=400, detail="请上传证件正面照片")

    back_url: Optional[str] = None
    if back is not None and (back.filename or "").strip():
        back_url = _save_identity_image(back, name_prefix="idback")
    if not back_url:
        back_url = _resolve_staged(back_stored, user)

    now = datetime.utcnow()
    record = IdentityVerification(
        user_id=user.id,
        doc_type=doc_type_enum,
        real_name=real_name,
        id_number=id_number,
        front_file_url=front_url,
        back_file_url=back_url,
        status=IdentityReviewStatus.pending,
        submitted_at=now,
        consent_granted_at=now,
        consent_policy_version=(policy_version or "2026-11").strip()[:32],
    )
    session.add(record)
    # PDPA 同意单独留痕：目的 + 时间 + 政策版本 + 来源 IP/UA
    session.add(
        Consent(
            user_id=user.id,
            purpose="identity_verification",
            granted=True,
            granted_at=now,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            policy_version=record.consent_policy_version,
        )
    )
    session.commit()
    session.refresh(record)
    return _to_out(user, record)


@router.get("/me/file/{side}")
def get_my_identity_file(
    side: str,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user_allow_query_token),
):
    """本人读取自己的证件图片（<img> / 小程序 previewImage 用 ?token=）。"""
    record = _latest(session, user.id)
    if not record:
        raise HTTPException(status_code=404, detail="尚未提交实名认证")
    return _file_response(record, side)


@router.get("/pending", response_model=List[IdentityPendingItem])
def list_pending_identity(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    _require_admin(user)
    rows = session.exec(
        select(IdentityVerification)
        .where(
            IdentityVerification.status == IdentityReviewStatus.pending,
            IdentityVerification.deleted_at.is_(None),
        )
        .order_by(IdentityVerification.submitted_at.asc())
    ).all()
    items: List[IdentityPendingItem] = []
    for row in rows:
        owner = session.get(User, row.user_id)
        items.append(
            IdentityPendingItem(
                id=row.id,
                user_id=row.user_id,
                user_name=owner.full_name if owner else None,
                user_email=owner.email if owner else None,
                user_phone=owner.phone if owner else None,
                user_is_verified=bool(owner.is_verified) if owner else False,
                doc_type=row.doc_type.value,
                real_name=row.real_name,
                id_number_masked=_mask_id_number(row.id_number),
                has_front=bool(row.front_file_url),
                has_back=bool(row.back_file_url),
                submitted_at=row.submitted_at,
                consent_granted_at=row.consent_granted_at,
                consent_policy_version=row.consent_policy_version,
            )
        )
    return items


@router.get("/{verification_id}/file/{side}")
def get_identity_file_for_review(
    verification_id: uuid.UUID,
    side: str,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user_allow_query_token),
):
    """审核查看：admin 可看全部，本人只能看自己的。"""
    record = session.get(IdentityVerification, verification_id)
    if not record or record.deleted_at:
        raise HTTPException(status_code=404, detail="认证记录不存在")
    if record.user_id != user.id and user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="无权查看该证件材料")
    return _file_response(record, side)


def _file_response(record: IdentityVerification, side: str) -> FileResponse:
    if side not in ("front", "back"):
        raise HTTPException(status_code=400, detail="side 只能是 front 或 back")
    stored = record.front_file_url if side == "front" else record.back_file_url
    if not stored:
        raise HTTPException(status_code=404, detail="该面证件未上传")
    path = resolve_stored_path(
        stored,
        IDENTITY_DIR,
        STORED_URL_PREFIX,
        url_name="identity_file_url",
        not_found_message="证件图片不存在",
    )
    return FileResponse(path, media_type="image/jpeg" if path.suffix == ".jpg" else None)


@router.post("/{verification_id}/approve", response_model=IdentityPendingItem)
def approve_identity(
    verification_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    _require_admin(user)
    record = _get_pending(session, verification_id)
    record.status = IdentityReviewStatus.approved
    record.rejection_reason = None
    record.reviewed_by_user_id = user.id
    record.reviewed_at = datetime.utcnow()
    owner = session.get(User, record.user_id)
    if owner:
        owner.is_verified = True
        session.add(owner)
    _notify_user(session, record, approved=True)
    session.add(record)
    session.commit()
    session.refresh(record)
    owner = session.get(User, record.user_id)
    return _pending_item(record, owner)


@router.post("/{verification_id}/reject", response_model=IdentityPendingItem)
def reject_identity(
    verification_id: uuid.UUID,
    payload: IdentityRejectIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    _require_admin(user)
    reason = (payload.reason or "").strip()
    if not reason:
        raise HTTPException(status_code=400, detail="驳回必须填写原因")
    record = _get_pending(session, verification_id)
    record.status = IdentityReviewStatus.rejected
    record.rejection_reason = reason[:500]
    record.reviewed_by_user_id = user.id
    record.reviewed_at = datetime.utcnow()
    _notify_user(session, record, approved=False, reason=record.rejection_reason)
    session.add(record)
    session.commit()
    session.refresh(record)
    return _pending_item(record, session.get(User, record.user_id))


def _get_pending(session: Session, verification_id: uuid.UUID) -> IdentityVerification:
    record = session.get(IdentityVerification, verification_id)
    if not record or record.deleted_at:
        raise HTTPException(status_code=404, detail="认证记录不存在")
    if record.status != IdentityReviewStatus.pending:
        raise HTTPException(status_code=409, detail="该记录已审核，不能重复操作")
    return record


def _pending_item(
    record: IdentityVerification, owner: Optional[User]
) -> IdentityPendingItem:
    return IdentityPendingItem(
        id=record.id,
        user_id=record.user_id,
        user_name=owner.full_name if owner else None,
        user_email=owner.email if owner else None,
        user_phone=owner.phone if owner else None,
        user_is_verified=bool(owner.is_verified) if owner else False,
        doc_type=record.doc_type.value,
        real_name=record.real_name,
        id_number_masked=_mask_id_number(record.id_number),
        has_front=bool(record.front_file_url),
        has_back=bool(record.back_file_url),
        submitted_at=record.submitted_at,
        consent_granted_at=record.consent_granted_at,
        consent_policy_version=record.consent_policy_version,
    )
