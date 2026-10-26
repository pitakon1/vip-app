"""真房源保鲜与上架时长提醒定时任务。

`revalidate_listings` 每天跑一次：把保鲜到期仍未复验的上架单自动下架，
并给「房源录入人」发复验提醒（ACN 贡献角色已整体下线，不再区分
maintainer / lister，提醒对象取房源档案的 `created_by`）。

`check_listing_age_reminders` 每天跑一次：上架单在线满「出租 6 个月 /
出售 1 年」时，给该房源的上架人（`publisher_user_id`，缺失回退档案
`created_by`）发一条站内提醒，提示确认是否续期或下架。同一房源同一
类型只提醒一次（`template_key + related_entity_id` 幂等）。
"""
import uuid
from datetime import datetime, timedelta, timezone

from sqlmodel import Session, select

from app.celery_app import celery_app
from app.db import engine
from app.models import (
    Listing,
    ListingStatus,
    ListingType,
    ListingVerificationStatus,
    Notification,
    NotificationChannel,
    NotificationStatus,
    Property,
)
from app.services import freshness_service

# 上架时长提醒周期：出租房源 6 个月、出售房源 1 年（按 30 天/月折算）
LISTING_AGE_REMINDER_DAYS = {
    ListingType.rent: 180,
    ListingType.sell: 365,
}


def _resolve_owner_users(session: Session, property_id) -> list:
    """找这套房的负责员工（房源档案 `created_by`），无则返回空列表。"""
    prop = session.get(Property, property_id)
    if prop is None or not prop.created_by:
        return []
    return [prop.created_by]


def _notify_once(
    session: Session, user_id, template_key: str, subject: str, content: str, listing: Listing
) -> bool:
    """同一房源同一模板只推一次（重跑不刷屏）；返回本次是否真的新增了通知。"""
    if not user_id:
        return False
    exists = session.exec(
        select(Notification).where(
            Notification.template_key == template_key,
            Notification.related_entity_id == listing.id,
        )
    ).first()
    if exists:
        return False
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
    return True


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


@celery_app.task(name="check_listing_age_reminders")
def check_listing_age_reminders():
    """每天 10:30 执行：上架满 6 个月（出租）/ 1 年（出售）提醒上架人。

    只针对在线（active）上架单；提醒对象优先 `publisher_user_id`（谁上架提醒谁），
    缺失时回退房源档案 `created_by`。一次性提醒，不自动下架——由上架人自行
    决定续期或下架。
    """
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    notified = 0
    with Session(engine) as session:
        active = session.exec(
            select(Listing).where(
                Listing.deleted_at.is_(None),
                Listing.status == ListingStatus.active,
            )
        ).all()

        for listing in active:
            days = LISTING_AGE_REMINDER_DAYS.get(listing.listing_type)
            if not days:
                continue
            # 上架时间：审核通过时间（reviewed_at），缺失时回退创建时间
            published_at = listing.reviewed_at or listing.created_at
            if not published_at:
                continue
            if now - published_at < timedelta(days=days):
                continue

            uid = listing.publisher_user_id
            if not uid:
                owners = _resolve_owner_users(session, listing.property_id)
                uid = owners[0] if owners else None
            if not uid:
                continue

            prop = session.get(Property, listing.property_id)
            name = (prop.display_name if prop else None) or "房源"
            if listing.listing_type == ListingType.rent:
                subject = "出租房源上架已满 6 个月"
                content = (
                    f"「{name}」已上架满 6 个月，请确认是否仍在出租："
                    f"如仍有效请续期，如已租出请及时下架。"
                )
            else:
                subject = "出售房源上架已满 1 年"
                content = (
                    f"「{name}」已上架满 1 年，请确认是否仍在售："
                    f"如仍有效请续期，如已售出请及时下架。"
                )
            if _notify_once(
                session,
                uid,
                f"listing_age_reminder_{listing.listing_type.value}",
                subject,
                content,
                listing,
            ):
                notified += 1

        session.commit()
        return {"notified": notified}
