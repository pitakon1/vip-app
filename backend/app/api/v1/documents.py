"""文档路由：文档元数据管理与下载。"""
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy import func
from sqlmodel import Session, select

from app.db import get_session
from app.core.auth import get_current_user
from app.core.pagination import PaginationParams, paginate
from app.models import Document, DocumentType, User

router = APIRouter(prefix="/documents", tags=["documents"])


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
