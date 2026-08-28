"""文档模型。

对应设计文档中的文档/附件主数据，覆盖合同、收据、验房照片、税务发票等。
注意：version 字段继承自 TimestampMixin（乐观锁版本号），用于文档版本管理。
"""
from enum import Enum
from typing import Any, List, Optional
import uuid

from sqlalchemy import Column, JSON
from sqlmodel import Field

from .base import TimestampMixin


class DocumentType(str, Enum):
    """文档类型枚举。"""

    contract = "contract"
    receipt = "receipt"
    inspection_photo = "inspection_photo"
    tax_invoice = "tax_invoice"
    wht_certificate = "wht_certificate"
    other = "other"


class Document(TimestampMixin, table=True):
    """文档表。

    version 字段由 TimestampMixin 提供，同时承担文档版本号职责。
    """

    __tablename__ = "documents"

    owner_id: uuid.UUID = Field(foreign_key="owners.id", index=True)
    property_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="properties.id"
    )
    lease_id: Optional[uuid.UUID] = Field(default=None, foreign_key="leases.id")
    type: DocumentType = Field(index=True)
    title: str
    file_url: str
    file_size: Optional[int] = None
    mime_type: Optional[str] = None
    file_hash: Optional[str] = Field(default=None, description="SHA-256 哈希")
    uploaded_by: uuid.UUID = Field(foreign_key="users.id")
    tags: Optional[List[Any]] = Field(
        default=None, sa_column=Column(JSON, nullable=True)
    )
