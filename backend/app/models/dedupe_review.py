"""房源去重疑似重复审核模型。

发布房源时若无法以结构化唯一键强命中，但相似度达到阈值，则写入一条疑似重复待审记录，
由运营人工确认「合并」或「驳回非重复」。
"""
from datetime import datetime
from enum import Enum
from typing import Optional
import uuid

from sqlmodel import Field

from .base import TimestampMixin


class DuplicateMatchType(str, Enum):
    """匹配类型。"""

    structured = "structured"  # 结构化唯一键强命中（楼盘/楼栋/房号）
    free_address = "free_address"  # 自由地址+房号哈希命中
    fuzzy = "fuzzy"  # 相似度模糊命中


class ReviewStatus(str, Enum):
    """审核状态。"""

    pending = "pending"
    merged = "merged"  # 确认重复，已合并
    dismissed = "dismissed"  # 判非重复
    blocked = "blocked"


class PropertyDedupeReview(TimestampMixin, table=True):
    """房源去重审核表。"""

    __tablename__ = "property_dedupe_reviews"

    candidate_listing_id: uuid.UUID = Field(foreign_key="listings.id", index=True)
    candidate_property_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="properties.id", index=True
    )
    matched_listing_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="listings.id", index=True
    )
    matched_property_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="properties.id", index=True
    )
    match_type: DuplicateMatchType = Field(default=DuplicateMatchType.fuzzy)
    match_key: Optional[str] = Field(default=None, description="命中使用的 key")
    score: float = Field(default=0.0, description="相似度 0-100")
    status: ReviewStatus = Field(default=ReviewStatus.pending, index=True)
    reviewed_by: Optional[uuid.UUID] = Field(default=None, foreign_key="users.id")
    reviewed_at: Optional[datetime] = None
    note: Optional[str] = None