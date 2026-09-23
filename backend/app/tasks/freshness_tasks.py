"""真房源保鲜定时任务。

`revalidate_listings` 每天跑一次：把保鲜到期仍未复验的上架单自动下架，
并给「维护人」与「录入人」发复验提醒（ACN 贡献角色的直接用途之一——
提醒必须发给对这套房负责的人，而不是群发）。

提醒对象取 `PropertyContribution` 里的 maintainer，没有维护人则退到 lister，
两者都没有则退到房源 `created_by`，保证提醒不会因为角色缺失而消失。
"""
import uuid
from datetime import datetime, timezone

from sqlmodel import Session, select

from app.celery_app import celery_app
from app.db import engine
from app.models import (
    ACNRole,
    Listing,
    ListingVerificationStatus,
    Notification,
    NotificationChannel,
    NotificationStatus,
    Property,
    PropertyContribution,
)
from app.services import freshness_service


def _resolve_owner_users(session: Session, property_id) -> list:
    """找这套房的负责员工（维护人 → 录入人 → 档案 created_by），去重返回 user_id。"""
    candidates = []
    for role in (ACNRole.maintainer, ACNRole.lister):
        row = session.exec(
            select(PropertyContribution)
            .where(
                PropertyContribution.property_id == property_id,
                PropertyContribution.role == role,
                PropertyContribution.status == "active",
                PropertyContribution.user_id.is_not(None),
            )
            .order_by(PropertyContribution.granted_at)
        ).first()
        if row and row.user_id:
            candidates.append(row.user_id)
        if candidates:
            break

    if not candidates:
        prop = session.get(Property, property_id)
        if prop is not None and prop.created_by:
            candidates.append(prop.created_by)

    deduped = []
    for uid in candidates:
        if uid not in deduped:
            deduped.append(uid)
    return deduped


def _notify_once(
    session: Session, user_id, template_key: str, subject: str, content: str, listing: Listing
):
    """同一房源同一模板只推一次（重跑不刷屏）。"""
    if not user_id:
        return
    exists = session.exec(
        select(Notification).where(
            Notification.template_key == template_key,
            Notification.related_entity_id == listing.id,
        )
    ).first()
    if exists:
        return
    session.add(
        Notification(
            id=uuid.uuid4(),
            user_id=user_id,
            channel=NotificationChannel.in_app,
            template_key=template_key,
            recipient=str(user_id),
            subject=subject,
            content=content,
            status=NotificationStatus.queued,
            related_entity_type="listing",
            related_entity_id=listing.id,
        )
    )


@celery_app.task(name="revalidate_listings")
def revalidate_listings():
    """每天 10:00 执行：保鲜到期房源自动下架 + 复验提醒。

    为什么是 10:00 而不是凌晨：提醒是给经纪人看的，凌晨推送会被淹没在
    其他系统消息里；10:00 是上班后处理待办的时间窗。
    """
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    with Session(engine) as session:
        expired = freshness_service.expire_due_listings(session, now=now)

        for listing in expired:
            prop = session.get(Property, listing.property_id)
            name = (prop.display_name if prop else None) or "房源"
            for uid in _resolve_owner_users(session, listing.property_id):
                _notify_once(
                    session,
                    uid,
                    "listing_verification_expired",
                    "房源保鲜到期已自动下架",
                    f"「{name}」超过保鲜期未复验，已自动下架。"
                    f"请完成实勘或房东确认后重新核验上架。",
                    listing,
                )

        # 临近到期（pending）的房源提前提醒，避免走到自动下架
        pending = session.exec(
            select(Listing).where(
                Listing.deleted_at.is_(None),
                Listing.next_revalidate_at.is_not(None),
            )
        ).all()
        upcoming = [
            item
            for item in pending
            if freshness_service.refresh_listing_verification_state(item, now=now)
            == ListingVerificationStatus.pending.value
        ]
        for listing in upcoming:
            prop = session.get(Property, listing.property_id)
            name = (prop.display_name if prop else None) or "房源"
            for uid in _resolve_owner_users(session, listing.property_id):
                _notify_once(
                    session,
                    uid,
                    "listing_verification_due",
                    "房源保鲜即将到期",
                    f"「{name}」的核验将在 "
                    f"{freshness_service.listing_freshness_payload(listing, now=now)['days_left']} "
                    f"天后到期，请及时复验，否则将自动下架。",
                    listing,
                )

        session.commit()
        return {"expired": len(expired), "notified_upcoming": len(upcoming)}
