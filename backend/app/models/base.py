"""模型公共字段基类。

对应设计文档 §5.1 公共字段规范。
"""
import uuid
from datetime import datetime
from typing import Any, Dict, Optional

from sqlalchemy import JSON
from sqlmodel import Field, SQLModel


class TimestampMixin(SQLModel):
    """公共字段 Mixin。

    包含主键 UUID、创建时间、更新时间、软删除时间、扩展元数据和乐观锁版本号。
    """

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        primary_key=True,
        index=True,
        description="主键 UUID",
    )

    created_at: datetime = Field(
        default_factory=datetime.utcnow,
        description="创建时间",
    )

    updated_at: datetime = Field(
        default_factory=datetime.utcnow,
        sa_column_kwargs={"onupdate": datetime.utcnow},
        description="更新时间",
    )

    deleted_at: Optional[datetime] = Field(
        default=None,
        description="软删除时间，非空表示已删除",
    )

    # 注意：metadata 为 SQLAlchemy 保留属性名，故 Python 字段使用 metadata_。
    # 使用 sa_column_kwargs 而非 sa_column=Column(...)，避免在 Mixin 中
    # 创建被多个子表共享的单一 Column 对象（会触发
    # "Column object already assigned to Table" 错误）。
    metadata_: Optional[Dict[str, Any]] = Field(
        default=None,
        sa_type=JSON,
        sa_column_kwargs={
            "nullable": True,
            "comment": "扩展元数据",
        },
        description="扩展元数据",
    )

    version: int = Field(
        default=1,
        sa_column_kwargs={
            "nullable": False,
            "default": 1,
            "comment": "乐观锁版本号",
        },
        description="乐观锁版本号",
    )
