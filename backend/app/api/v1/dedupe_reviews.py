"""房源去重疑似重复审核路由（运营/staff）。

对发布房源时相似度命中或强命中重复而被标记的候选，人工确认「合并」或「驳回（非重复）」。
"""
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlmodel import Session, select

from app.db import get_session
from app.core.auth import STAFF_ROLES, get_current_user
from app.core.pagination import Page, PaginationParams, paginate_query
from app.models import (
    User,
    Listing,
    ListingStatus,
    DedupeState,
    PropertyDedupeReview,
    ReviewStatus,
)

router = APIRouter(prefix="/dedupe-reviews", tags=["dedupe-reviews"])


class DedupeReviewOut(BaseModel):
    """去重审核条目响应。"""

    model_config = ConfigDict(extra="allow")

    id: Optional[str] = None
    candidate_listing_id: Optional[str] = None
    candidate_property_id: Optional[str] = None
    matched_property_id: Optional[str] = None
    matched_listing_id: Optional[str] = None
    match_type: Optional[str] = None
    match_key: Optional[str] = None
    score: Optional[float] = None
    status: Optional[str] = None
    reviewed_by: Optional[str] = None
    note: Optional[str] = None
    created_at: Optional[str] = None


def _serialize(r: PropertyDedupeReview) -> dict:
    return {
        "id": str(r.id),
        "candidate_listing_id": str(r.candidate_listing_id) if r.candidate_listing_id else None,
        "candidate_property_id": str(r.candidate_property_id) if r.candidate_property_id else None,
        "matched_property_id": str(r.matched_property_id) if r.matched_property_id else None,
        "matched_listing_id": str(r.matched_listing_id) if r.matched_listing_id else None,
        "match_type": r.match_type.value if r.match_type else None,
        "match_key": r.match_key,
        "score": r.score,
        "status": r.status.value if r.status else None,
        "reviewed_by": str(r.reviewed_by) if r.reviewed_by else None,
        "note": r.note,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


@router.get("", response_model=Page[DedupeReviewOut])
def list_dedupe_reviews(
    status: Optional[ReviewStatus] = None,
    pagination: PaginationParams = Depends(),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """待办疑似重复列表。"""
    if user.role not in STAFF_ROLES:
        raise HTTPException(status_code=403, detail="No permission")
    query = select(PropertyDedupeReview).where(PropertyDedupeReview.deleted_at.is_(None))
    if status:
        query = query.where(PropertyDedupeReview.status == status)
    stmt = query.order_by(PropertyDedupeReview.created_at.asc())
    page = paginate_query(session, stmt, pagination)
    page.items = [_serialize(i) for i in page.items]
    return page


@router.post("/{review_id}/merge")
def merge_dedupe_review(
    review_id: uuid.UUID,
    body: dict,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """人工确认重复：把候选并入匹配方（抑制候选上架单），候选状态 merged。"""
    if user.role not in STAFF_ROLES:
        raise HTTPException(status_code=403, detail="No permission")
    review = session.get(PropertyDedupeReview, review_id)
    if not review or review.deleted_at:
        raise HTTPException(status_code=404, detail="Review not found")
    if review.status not in (ReviewStatus.pending, ReviewStatus.blocked):
        raise HTTPException(status_code=400, detail="Review already handled")

    candidate = session.get(Listing, review.candidate_listing_id) if review.candidate_listing_id else None
    # 合并方向：候选并入匹配方（matched_property / matched_listing）
    matched_listing_id = review.matched_listing_id

    if candidate:
        candidate.dedupe_state = DedupeState.merged
        if matched_listing_id:
            candidate.merged_into_listing_id = matched_listing_id
        candidate.status = ListingStatus.closed  # 停用候选上架单
        session.add(candidate)

    review.status = ReviewStatus.merged
    review.reviewed_by = user.id
    review.reviewed_at = datetime.utcnow()
    review.note = body.get("note") or review.note
    session.add(review)
    session.commit()
    session.refresh(review)
    return _serialize(review)


@router.post("/{review_id}/dismiss")
def dismiss_dedupe_review(
    review_id: uuid.UUID,
    body: dict,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """判非重复：候选解除标记，继续正常上架审核（pending → 交由列表审核）。"""
    if user.role not in STAFF_ROLES:
        raise HTTPException(status_code=403, detail="No permission")
    review = session.get(PropertyDedupeReview, review_id)
    if not review or review.deleted_at:
        raise HTTPException(status_code=404, detail="Review not found")
    # 与 merge 一致的「已处理」守卫：已合并（merged）/已驳回（dismissed）不可再改，
    # 否则候选上架单已被合并抑制后又被放行，形成矛盾脏数据。
    if review.status not in (ReviewStatus.pending, ReviewStatus.blocked):
        raise HTTPException(status_code=409, detail="Review already handled")
    candidate = session.get(Listing, review.candidate_listing_id) if review.candidate_listing_id else None

    if candidate and candidate.dedupe_state == DedupeState.suspect:
        candidate.dedupe_state = DedupeState.new
        session.add(candidate)

    review.status = ReviewStatus.dismissed
    review.reviewed_by = user.id
    review.reviewed_at = datetime.utcnow()
    review.note = body.get("note") or review.note
    session.add(review)
    session.commit()
    session.refresh(review)
    return _serialize(review)