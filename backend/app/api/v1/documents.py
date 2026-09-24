"""文档路由：文档上传、元数据管理与下载。"""
import hashlib
import os
import uuid
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    UploadFile,
)
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import false
from sqlmodel import Session, select

from app.db import get_session
from app.core.auth import STAFF_ROLES, get_current_user, get_current_user_allow_query_token
from app.core.pagination import Page, PaginationParams, paginate_query
from app.core.uploads import (
    detect_document_mime,
    resolve_stored_path,
    save_upload,
    validate_internal_url,
)
from app.models import (
    Document,
    DocumentType,
    Lease,
    Owner,
    Property,
    Tenant,
    User,
    UserRole,
)

router = APIRouter(prefix="/documents", tags=["documents"])

# 文档落盘目录（backend/uploads/documents）。
# 注意：该目录**不**由 /uploads 静态服务托管（见 main.py 的静态挂载说明），
# 证件、合同等敏感文件一律经下方带鉴权的读取接口分发。
UPLOAD_DIR = Path(__file__).resolve().parents[3] / "uploads" / "documents"
MAX_DOCUMENT_SIZE = 20 * 1024 * 1024  # 单个文档 20MB

# 落库的统一前缀：既用于生成，也用于读取时反解磁盘路径（白名单）
STORED_URL_PREFIX = "/uploads/documents/"

# 可全量访问文档的角色（内部员工侧）：统一走 core.auth.STAFF_ROLES

# 扩展名 -> (落库 MIME, 允许的文件头识别结果)
# 扩展名可随意改，所以必须再按文件头确认「内容属于这一类」，否则改名即可上传脚本。
ALLOWED_DOCUMENT_TYPES: dict[str, tuple[str, set]] = {
    ".pdf": ("application/pdf", {"application/pdf"}),
    ".jpg": ("image/jpeg", {"image/jpeg"}),
    ".jpeg": ("image/jpeg", {"image/jpeg"}),
    ".png": ("image/png", {"image/png"}),
    ".webp": ("image/webp", {"image/webp"}),
    ".gif": ("image/gif", {"image/gif"}),
    ".doc": ("application/msword", {"application/x-ole-storage"}),
    ".xls": ("application/vnd.ms-excel", {"application/x-ole-storage"}),
    ".docx": (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        {"application/zip"},
    ),
    ".xlsx": (
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        {"application/zip"},
    ),
}


def _owner_id_of(session: Session, user: User) -> Optional[uuid.UUID]:
    """取当前账号对应的业主档案 id（未建档返回 None）。"""
    owner = session.exec(
        select(Owner).where(Owner.user_id == user.id, Owner.deleted_at.is_(None))
    ).first()
    return owner.id if owner else None


def _lease_ids_of(session: Session, user: User) -> List[uuid.UUID]:
    """取当前租客名下全部租约 id。"""
    tenant = session.exec(
        select(Tenant).where(Tenant.user_id == user.id, Tenant.deleted_at.is_(None))
    ).first()
    if not tenant:
        return []
    return list(session.exec(select(Lease.id).where(Lease.tenant_id == tenant.id)).all())


def _can_read_document(session: Session, user: User, doc: Document) -> bool:
    """文档可见性判定。

    - 管理员/经纪/员工：全量（内部作业需要跨业主查阅）
    - 业主：仅本人名下文档
    - 租客：仅与本人租约关联的文档（未关联租约的文档不对租客开放）
    """
    if user.role in STAFF_ROLES:
        return True
    if user.role == UserRole.owner:
        return doc.owner_id == _owner_id_of(session, user)
    if user.role == UserRole.tenant:
        return doc.lease_id is not None and doc.lease_id in _lease_ids_of(session, user)
    return False


def _visibility_conditions(session: Session, user: User) -> list:
    """把可见性规则翻译成查询条件（列表接口用，避免"看得见却打不开"）。"""
    if user.role in STAFF_ROLES:
        return []
    if user.role == UserRole.owner:
        owner_id = _owner_id_of(session, user)
        return [Document.owner_id == owner_id] if owner_id else [false()]
    if user.role == UserRole.tenant:
        lease_ids = _lease_ids_of(session, user)
        return [Document.lease_id.in_(lease_ids)] if lease_ids else [false()]
    return [false()]


def _validate_stored_url(file_url: str) -> str:
    """校验入库的 file_url：只接受服务端生成的站内路径。

    此前 `create_document` 原样接受调用方传入的任意 URL，而下载接口又
    `RedirectResponse(url=doc.file_url)`，等于把正规域名出借给任意钓鱼链接做
    开放重定向。此处收口到「只能是我们自己生成的那种路径」。
    """
    return validate_internal_url(file_url, STORED_URL_PREFIX, "file_url")


def _stored_file_path(doc: Document) -> Path:
    """把落库的 file_url 反解为磁盘路径，并确保不逃出文档目录。"""
    return resolve_stored_path(
        doc.file_url,
        UPLOAD_DIR,
        STORED_URL_PREFIX,
        url_name="file_url",
        not_found_message="Document file not found on disk",
    )


def _attachment_name(doc: Document, path: Path) -> str:
    """拼下载文件名：标题 + 落盘扩展名，去掉可能破坏响应头的字符。"""
    stem = "".join(
        ch for ch in (doc.title or "document") if ch.isprintable() and ch not in '"\\\r\n'
    ).strip()
    return f"{stem or 'document'}{path.suffix}"


def _resolve_readable_document(
    session: Session, user: User, document_id: uuid.UUID
) -> tuple[Document, Path]:
    """按可见性规则取文档及其磁盘路径，不可见时抛 404/403。

    预览（/file）与下载（/download）共用：两者的取件与鉴权完全一致，
    只在响应头（Content-Type / Content-Disposition）上不同。
    """
    doc = session.get(Document, document_id)
    if not doc or doc.deleted_at:
        raise HTTPException(status_code=404, detail="Document not found")
    if not _can_read_document(session, user, doc):
        raise HTTPException(status_code=403, detail="Access denied")
    return doc, _stored_file_path(doc)


def _owner_id_for_upload(
    session: Session, user: User, owner_id: Optional[uuid.UUID]
) -> uuid.UUID:
    """解析文档归属的业主：业主只能传到自己名下，员工必须显式指定。"""
    if user.role == UserRole.owner:
        owner = session.exec(
            select(Owner).where(
                Owner.user_id == user.id, Owner.deleted_at.is_(None)
            )
        ).first()
        if not owner:
            raise HTTPException(status_code=404, detail="Owner profile not found")
        # 忽略入参，避免业主把文档挂到别的业主名下
        return owner.id
    if user.role == UserRole.tenant:
        raise HTTPException(status_code=403, detail="Tenants cannot upload documents")
    if not owner_id:
        raise HTTPException(status_code=400, detail="owner_id is required")
    return owner_id


class DocumentCreate(BaseModel):
    owner_id: uuid.UUID
    property_id: Optional[uuid.UUID] = None
    lease_id: Optional[uuid.UUID] = None
    type: DocumentType
    title: str
    file_url: str
    file_size: Optional[int] = None
    mime_type: Optional[str] = None
    file_hash: Optional[str] = None
    tags: Optional[List[str]] = None


@router.get("", response_model=Page[Document])
def list_documents(
    pagination: PaginationParams = Depends(),
    type: Optional[DocumentType] = None,
    property_id: Optional[uuid.UUID] = None,
    lease_id: Optional[uuid.UUID] = None,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """文档列表（按 type/property_id/lease_id 筛选，并按角色收敛可见范围）。"""
    conditions = [Document.deleted_at.is_(None)]
    conditions.extend(_visibility_conditions(session, user))
    if type:
        conditions.append(Document.type == type)
    if property_id:
        conditions.append(Document.property_id == property_id)
    if lease_id:
        conditions.append(Document.lease_id == lease_id)

    stmt = select(Document).where(*conditions).order_by(Document.created_at.desc())
    return paginate_query(session, stmt, pagination)


@router.post("")
def create_document(
    req: DocumentCreate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """登记文档元数据（文件由 /documents/upload 落盘后回填 URL）。

    归属口径与 /upload 完全一致（复用 _owner_id_for_upload）：
    租客禁止登记（403），业主强制挂到本人名下（忽略入参 owner_id），
    员工/管理员须显式指定业主。租约/房源若指定，必须属于该业主。

    `file_url` 只接受服务端生成的 `/uploads/documents/<文件名>` 形式，
    不允许外部地址，避免库里存进任意链接后被下载接口当作跳转目标。
    """
    data = req.model_dump()
    # 归属收口：与 /upload 同口径，防止租客任意指定 owner_id/lease_id 登记他人文档
    data["owner_id"] = _owner_id_for_upload(session, user, data.get("owner_id"))
    if data.get("lease_id"):
        lease = session.get(Lease, data["lease_id"])
        if not lease:
            raise HTTPException(status_code=404, detail="Lease not found")
        if lease.owner_id != data["owner_id"]:
            raise HTTPException(
                status_code=403, detail="Lease does not belong to owner"
            )
    if data.get("property_id"):
        prop = session.get(Property, data["property_id"])
        if not prop or prop.deleted_at:
            raise HTTPException(status_code=404, detail="Property not found")
        if prop.owner_id != data["owner_id"]:
            raise HTTPException(
                status_code=403, detail="Property does not belong to owner"
            )
    doc = Document(
        **{**data, "file_url": _validate_stored_url(req.file_url)},
        uploaded_by=user.id,
    )
    session.add(doc)
    session.commit()
    session.refresh(doc)
    return doc


@router.post("/upload")
def upload_document(
    file: UploadFile = File(...),
    type: DocumentType = Form(DocumentType.other),
    title: Optional[str] = Form(None),
    property_id: Optional[uuid.UUID] = Form(None),
    lease_id: Optional[uuid.UUID] = Form(None),
    owner_id: Optional[uuid.UUID] = Form(None),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """上传文档文件并落库元数据（multipart）。

    文件落到本地 `uploads/documents`，该目录不对外静态托管，读取需带令牌
    走 `GET /documents/{id}/file`（预览）或 `/download`（下载）。
    文档中心的「上传文档」入口此前只有前端占位提示，没有任何后端上传能力。

    安全校验：扩展名白名单 + 文件头魔数确认（挡住改名伪装）+ 体积上限 +
    文件名由服务端生成（不采用客户端文件名，避免路径穿越与覆盖）。
    """
    original_name = file.filename or "document"
    ext = os.path.splitext(original_name)[1].lower()
    allowed = ALLOWED_DOCUMENT_TYPES.get(ext)
    if not allowed:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Unsupported document type: {ext or 'none'}"
                "（支持 PDF / JPG / PNG / WEBP / GIF / DOC(X) / XLS(X)）"
            ),
        )
    canonical_mime, _ = allowed

    target_owner_id = _owner_id_for_upload(session, user, owner_id)

    digest = hashlib.sha256()
    file_url = save_upload(
        file,
        UPLOAD_DIR,
        MAX_DOCUMENT_SIZE,
        set(ALLOWED_DOCUMENT_TYPES),
        {ext: containers for ext, (_, containers) in ALLOWED_DOCUMENT_TYPES.items()},
        detector=detect_document_mime,
        name_prefix="doc",
        url_prefix=STORED_URL_PREFIX,
        label="document",
        supported_text="（支持 PDF / JPG / PNG / WEBP / GIF / DOC(X) / XLS(X)）",
        digest=digest,
    )
    # save_upload 逐块读完整个上传流，此时指针位置即实际字节数
    size = file.file.tell()

    doc = Document(
        owner_id=target_owner_id,
        property_id=property_id,
        lease_id=lease_id,
        type=type,
        title=(title or "").strip() or os.path.splitext(original_name)[0],
        file_url=file_url,
        file_size=size,
        mime_type=file.content_type or canonical_mime,
        file_hash=digest.hexdigest(),
        uploaded_by=user.id,
    )
    session.add(doc)
    session.commit()
    session.refresh(doc)
    return doc


@router.delete("/{document_id}")
def delete_document(
    document_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """删除文档（软删除：仅打标记，保留物理文件与审计线索）。"""
    doc = session.get(Document, document_id)
    if not doc or doc.deleted_at:
        raise HTTPException(status_code=404, detail="Document not found")
    # 租客一律不可删；业主/员工沿用可见性规则（业主限本人名下）
    if user.role == UserRole.tenant or not _can_read_document(session, user, doc):
        raise HTTPException(status_code=403, detail="Access denied")
    doc.deleted_at = datetime.utcnow()
    session.add(doc)
    session.commit()
    return {"ok": True, "deleted_id": str(doc.id)}


@router.get("/{document_id}", response_model=Document)
def get_document(
    document_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """获取文档详情（需在可见范围内）。"""
    doc = session.get(Document, document_id)
    if not doc or doc.deleted_at:
        raise HTTPException(status_code=404, detail="Document not found")
    if not _can_read_document(session, user, doc):
        raise HTTPException(status_code=403, detail="Access denied")
    return doc


@router.get("/{document_id}/file")
def read_document_file(
    document_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user_allow_query_token),
):
    """预览文档原文（内联返回，供 <img> / 小程序 previewImage 使用）。

    认证支持 `Authorization` 头或 `?token=`（见 `get_current_user_allow_query_token`）。
    文件从磁盘流式回传，不暴露也不重定向到落库路径。
    """
    doc, path = _resolve_readable_document(session, user, document_id)
    return FileResponse(path, media_type=doc.mime_type or "application/octet-stream")


@router.get("/{document_id}/download")
def download_document(
    document_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user_allow_query_token),
):
    """下载文档（附带文件名，浏览器按附件处理）。

    此前实现是 `RedirectResponse(url=doc.file_url)`，而 file_url 曾被允许由调用方
    任意指定，等于把正规域名出借给外部钓鱼链接做开放重定向；现在一律由服务端
    解析磁盘路径后流式回传，重定向面彻底移除。
    """
    doc, path = _resolve_readable_document(session, user, document_id)
    return FileResponse(
        path,
        media_type=doc.mime_type or "application/octet-stream",
        filename=_attachment_name(doc, path),
    )
