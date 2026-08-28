"""Feature Flag 模型。

对应设计文档中的功能开关主数据，支持按比例与按角色灰度发布。
"""
from typing import Any, Dict, List, Optional

from sqlalchemy import Column, JSON
from sqlmodel import Field

from .base import TimestampMixin


class FeatureFlag(TimestampMixin, table=True):
    """功能开关表。"""

    __tablename__ = "feature_flags"

    key: str = Field(unique=True, index=True)
    description: Optional[str] = None
    enabled: bool = Field(default=False, index=True)
    rollout_percentage: int = Field(default=100)
    target_roles: Optional[List[Any]] = Field(
        default=None,
        sa_column=Column(JSON, nullable=True, comment="目标角色列表"),
    )
    config: Optional[Dict[str, Any]] = Field(
        default=None,
        sa_column=Column(JSON, nullable=True, comment="扩展配置"),
    )
