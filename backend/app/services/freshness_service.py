"""真房源保鲜服务：核验留痕、保鲜状态判定、到期自动下架。

## 保鲜状态机

    unverified ──核验通过──▶ verified ──临近到期(≤7天)──▶ pending
                                ▲                            │
                                │                      到期未复验
                          复验通过│                            ▼
                                └──────────────────────── expired ──复验通过──▶ verified

- `verified`：保鲜期内，C 端展示「已核验」徽标；
- `pending`：临近到期仍展示，但**排序降权**（有复验压力的房源会被优先处理）；
- `expired`：到期未复验 → 上架单状态置 `expired`，对外不再作为有效房源展示。
  这是「真房源」的关键一环：**过期房源必须自动消失，不能靠人记得去下架**。

## 为什么状态是「算出来的」而不是只靠定时任务

`refresh_listing_verification_state()` 在读取时按时间戳实时重算状态，
Celery 任务只是**把到期房源落库**（供通知与统计）。这样即使 worker 挂了，
C 端的徽标也不会显示错误状态——读路径永远正确，写路径只是补记录。
"""
import uuid
from datetime import datetime, timedelta
from typing import Optional

from sqlmodel import Session, select

from app.models import (
    Listing,
    ListingStatus,
    ListingVerificationStatus,
    PropertyVerification,
    VerificationMethod,
    VerificationResult,
)

# 默认保鲜期：30 天。泰国租赁市场换手快（短租/长租混杂），
# 30 天是一个月租约周期的自然粒度；房源明显是「挂出去就没人管」的重灾区。
DEFAULT_TTL_DAYS = 30

# 「临近到期」窗口：进入此窗口后状态为 pending（降权，仍展示）
PENDING_WINDOW_DAYS = 7

# 联系不上（unreachable）时的短保鲜期：不许直接下架（可能只是暂时打不通），
# 但要快速回到复验队列，避免长期占用「有效房源」的展示位。
UNREACHABLE_TTL_DAYS = 7


def _now(now: Optional[datetime] = None) -> datetime:
    return now or datetime.utcnow()


def compute_next_due(
    verified_at: datetime, ttl_days: int = DEFAULT_TTL_DAYS
) -> datetime:
    """由核验时间 + 保鲜期算下次复验时间。"""
    return verified_at + timedelta(days=max(1, int(ttl_days)))


def refresh_listing_verification_state(
    listing: Listing, *, now: Optional[datetime] = None
) -> str:
    """按时间戳实时重算保鲜状态（不落库，读路径用）。

    返回 `ListingVerificationStatus` 的值。
    """
    now = _now(now)
    if not listing.next_revalidate_at:
        return (
            ListingVerificationStatus.verified.value
            if listing.last_verified_at
            else ListingVerificationStatus.unverified.value
        )
    if listing.next_revalidate_at <= now:
        return ListingVerificationStatus.expired.value
    if listing.next_revalidate_at - now <= timedelta(days=PENDING_WINDOW_DAYS):
        return ListingVerificationStatus.pending.value
    return ListingVerificationStatus.verified.value


def listing_freshness_payload(
    listing: Listing, *, now: Optional[datetime] = None
) -> dict:
    """C 端徽标载荷：状态 + 剩余天数。前端三语只负责翻译 label。"""
    now = _now(now)
    status = refresh_listing_verification_state(listing, now=now)
    days_left = None
    if listing.next_revalidate_at:
        days_left = (listing.next_revalidate_at - now).days
    return {
        "verification_status": status,
        "last_verified_at": (
            listing.last_verified_at.isoformat() if listing.last_verified_at else None
        ),
        "next_revalidate_at": (
            listing.next_revalidate_at.isoformat()
            if listing.next_revalidate_at
            else None
        ),
        "days_left": days_left,
        "is_listable": status
        in (
            ListingVerificationStatus.verified.value,
            ListingVerificationStatus.pending.value,
        ),
    }


def record_verification(
    session: Session,
    *,
    property_id: uuid.UUID,
    method: VerificationMethod,
    result: VerificationResult,
    listing_id: Optional[uuid.UUID] = None,
    verified_by_user_id: Optional[uuid.UUID] = None,
    verified_by_partner_id: Optional[uuid.UUID] = None,
    ttl_days: Optional[int] = None,
    evidence: Optional[dict] = None,
    note: Optional[str] = None,
    verified_at: Optional[datetime] = None,
) -> PropertyVerification:
    """登记一次核验并联动上架单保鲜状态。

    副作用（同一事务内提交，避免「核验已记、房源状态没动」）：
    - `verified` / `price_changed` → 恢复 `verified`，顺延 `next_revalidate_at`；
      若该单此前因保鲜到期被置 `expired`，复验通过后重新上架为 `active`。
    - `unavailable` → 上架单置 `closed`（已租/已售/撤单，不再对外展示）。
    - `unreachable` → 置 `pending` 并按短保鲜期顺延，**不直接下架**。
    """
    verified_at = _now(verified_at)
    ttl = ttl_days or (
        UNREACHABLE_TTL_DAYS
        if result == VerificationResult.unreachable
        else DEFAULT_TTL_DAYS
    )
    next_due = compute_next_due(verified_at, ttl)

    record = PropertyVerification(
        property_id=property_id,
        listing_id=listing_id,
        method=method,
        result=result,
        verified_by_user_id=verified_by_user_id,
        verified_by_partner_id=verified_by_partner_id,
        verified_at=verified_at,
        next_due_at=next_due,
        evidence=evidence,
        note=note,
    )
    session.add(record)

    if listing_id:
        listing = session.get(Listing, listing_id)
        if listing is not None:
            _apply_result_to_listing(listing, result, verified_at, next_due)
            session.add(listing)

    session.commit()
    session.refresh(record)
    return record


def _apply_result_to_listing(
    listing: Listing,
    result: VerificationResult,
    verified_at: datetime,
    next_due: datetime,
) -> None:
    listing.last_verified_at = verified_at
    listing.next_revalidate_at = next_due
    if result == VerificationResult.unavailable:
        listing.verification_status = ListingVerificationStatus.verified.value
        listing.status = ListingStatus.closed
        return
    if result == VerificationResult.unreachable:
        listing.verification_status = ListingVerificationStatus.pending.value
        return

    listing.verification_status = ListingVerificationStatus.verified.value
    # 保鲜到期被自动下架的房源，复验通过后重新上架（否则会永远沉底）
    if listing.status == ListingStatus.expired:
        listing.status = ListingStatus.active
        listing.expired_at = None


def expire_due_listings(
    session: Session,
    *,
    now: Optional[datetime] = None,
    limit: Optional[int] = None,
) -> list[Listing]:
    """把保鲜到期未复验的上架单自动流转为 `expired`（Celery 任务调用）。

    只处理「对外可见」的状态（active / pending）——已租/已售/已下架的单
    再标 expired 没有意义，也会污染运营统计。
    返回被处理的房源列表，供任务发通知。
    """
    now = _now(now)
    query = select(Listing).where(
        Listing.deleted_at.is_(None),
        Listing.next_revalidate_at.is_not(None),
        Listing.next_revalidate_at <= now,
        Listing.status.in_(
            [ListingStatus.active, ListingStatus.pending]
        ),
    )
    if limit:
        query = query.limit(limit)

    expired: list[Listing] = []
    for listing in session.exec(query).all():
        listing.status = ListingStatus.expired
        listing.verification_status = ListingVerificationStatus.expired.value
        listing.expired_at = now
        session.add(listing)
        expired.append(listing)
    if expired:
        session.commit()
    return expired


def freshness_summary(
    session: Session, *, now: Optional[datetime] = None
) -> dict:
    """保鲜状态分布（运营看板）。"""
    now = _now(now)
    listings = session.exec(
        select(Listing).where(Listing.deleted_at.is_(None))
    ).all()
    counts = {s.value: 0 for s in ListingVerificationStatus}
    for listing in listings:
        counts[refresh_listing_verification_state(listing, now=now)] += 1
    return {
        "total": len(listings),
        "by_status": counts,
        # 待处理队列 = 需要有人去复验的（已过期 + 临近到期）
        "action_required": counts[ListingVerificationStatus.expired.value]
        + counts[ListingVerificationStatus.pending.value],
    }


def verification_history(
    session: Session,
    *,
    property_id: Optional[uuid.UUID] = None,
    listing_id: Optional[uuid.UUID] = None,
    limit: int = 50,
) -> list[PropertyVerification]:
    """核验留痕（按时间倒序）。"""
    query = select(PropertyVerification).where(
        PropertyVerification.deleted_at.is_(None)
    )
    if property_id:
        query = query.where(PropertyVerification.property_id == property_id)
    if listing_id:
        query = query.where(PropertyVerification.listing_id == listing_id)
    return list(
        session.exec(
            query.order_by(PropertyVerification.verified_at.desc()).limit(limit)
        ).all()
    )
