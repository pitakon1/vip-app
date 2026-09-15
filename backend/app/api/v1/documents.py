"""文档路由：文档上传、元数据管理与下载。"""
import hashlib
import os
import secrets
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
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy import func
from sqlmodel import Session, select

from app.db import get_session
from app.core.auth import get_current_user
from app.core.pagination import PaginationParams, paginate
from app.core.uploads import HEAD_BYTES, detect_document_mime
from app.models import Document, DocumentType, Owner, User, UserRole

router = APIRouter(prefix="/documents", tags=["documents"])

# 文档落盘目录（backend/uploads/documents），由 /uploads 静态服务暴露
UPLOAD_DIR = Path(__file__).resolve().parents[3] / "uploads" / "documents"
MAX_DOCUMENT_SIZE = 20 * 1024 * 1024  # 单个文档 20MB

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


@router.get("")
def list_documents(
    pagination: PaginationParams = Depends(),
    type: Optional[DocumentType] = None,
    property_id: Optional[uuid.UUID] = None,
    lease_id: Optional[uuid.UUID] = None,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """文档列表（按 type/property_id/lease_id 筛选）。"""
    conditions = [Document.deleted_at.is_(None)]
    if type:
        conditions.append(Document.type == type)
    if property_id:
        conditions.append(Document.property_id == property_id)
    if lease_id:
        conditions.append(Document.lease_id == lease_id)

    stmt = select(Document).where(*conditions).order_by(Document.created_at.desc())
    count_stmt = select(func.count(Document.id)).where(*conditions)
    total = session.exec(count_stmt).one()
    items = session.exec(
        stmt.offset(pagination.offset).limit(pagination.limit)
    ).all()
    return paginate(items, total, pagination)


@router.post("")
def create_document(
    req: DocumentCreate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """上传文档元数据（文件 URL 由前端上传到 MinIO 后传入）。"""
    doc = Document(**req.model_dump(), uploaded_by=user.id)
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

    文件落到本地 `uploads/documents` 并由 /uploads 静态服务暴露。
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
    canonical_mime, expected_containers = allowed
    head = file.file.read(HEAD_BYTES)
    file.file.seek(0)
    detected = detect_document_mime(head)
    if detected not in expected_containers:
        raise HTTPException(
            status_code=400,
            detail=f"File content does not match its extension: {original_name}",
        )

    target_owner_id = _owner_id_for_upload(session, user, owner_id)

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"doc_{secrets.token_hex(16)}{ext}"
    dest = UPLOAD_DIR / filename
    digest = hashlib.sha256()
    size = 0
    try:
        # 边写边算哈希与大小，避免为算哈希再读一遍文件
        with dest.open("wb") as buffer:
            while True:
                chunk = file.file.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > MAX_DOCUMENT_SIZE:
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            "File too large (max "
                            f"{MAX_DOCUMENT_SIZE // (1024 * 1024)}MB)"
                        ),
                    )
                digest.update(chunk)
                buffer.write(chunk)
    except HTTPException:
        dest.unlink(missing_ok=True)
        raise
    except Exception:
        dest.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail="Failed to save document")

    doc = Document(
        owner_id=target_owner_id,
        property_id=property_id,
        lease_id=lease_id,
        type=type,
        title=(title or "").strip() or os.path.splitext(original_name)[0],
        file_url=f"/uploads/documents/{filename}",
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
    if user.role == UserRole.owner:
        # 业主只能删自己名下的文档
        if doc.owner_id != _owner_id_for_upload(session, user, None):
            raise HTTPException(status_code=403, detail="Access denied")
    elif user.role == UserRole.tenant:
        raise HTTPException(status_code=403, detail="Access denied")
    doc.deleted_at = datetime.utcnow()
    session.add(doc)
    session.commit()
    return {"ok": True, "deleted_id": str(doc.id)}


@router.get("/{document_id}")
def get_document(
    document_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """获取文档详情。"""
    doc = session.get(Document, document_id)
    if not doc or doc.deleted_at:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


@router.get("/{document_id}/download")
def download_document(
    document_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """下载文档（重定向到 MinIO presigned URL）。"""
    doc = session.get(Document, document_id)
    if not doc or doc.deleted_at:
        raise HTTPException(status_code=404, detail="Document not found")
    return RedirectResponse(url=doc.file_url)
