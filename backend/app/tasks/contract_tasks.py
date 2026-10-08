"""电子合同到期催签任务。

扫描契约签署方：签署令牌即将到期（剩余 ≤3 天）、未过期、未签署的 party，
对每项推送"合同待签署，即将到期"提醒。

通知方式沿用站内通知链路（Notification 表 queued → send_pending_notifications 消费）：
- 站内（in_app）：party.user_id 存在时；
- 短信（sms）：party.user_id 且 party.phone 存在；
- 邮件（email）：party.user_id 且 party.email 存在。

去重沿用相关通知的既有约定：template_key + related_entity_id 幂等，避免重复推送。
"""
from datetime import datetime, timedelta, timezone
import uuid

from sqlmodel import Session, select

from app.celery_app import celery_app
from app.db import engine
from app.config import settings
from app.models.contract import ContractParty, Contract
from app.models.notification import Notification, NotificationChannel, NotificationStatus

_REMIND_DAYS = 3  # 剩余 ≤3 天提醒


def _contract_sign_url(token: str) -> str:
    """复现 contracts._sign_url 的链接拼接（避免循环导入）。"""
    base = (settings.PUBLIC_WEB_BASE_URL or "").strip().rstrip("/")
    path = f"/sign/{token}"
    return f"{base}{path}" if base else path


def _notify_reminder(
    session: Session,
    party: ContractParty,
    contract_title: str,
) -> None:
    """对单个待签 party 推送催签通知；幂等按 template_key + related_entity_id。"""
    if not party.user_id:
        return  # 未绑定用户的 party 无法走站内通知链路，跳过站内推送
    url = _contract_sign_url(party.sign_token) if party.sign_token else ""
    subject = "合同待签署"
    content = (
        f"您的合同《{contract_title}》即将到期，请尽快完成签署。"
        f"{('签署链接：' + url) if url else ''}"
    )
    template_key = "contract_sign_expiring"
    related_entity_id = party.id

    # 站内
    _push(
        session,
        user_id=party.user_id,
        channel=NotificationChannel.in_app,
        template_key=template_key,
        recipient=str(party.user_id),
        subject=subject,
        content=content,
        related_entity_id=related_entity_id,
    )
    # 短信
    if party.phone:
        _push(
            session,
            user_id=party.user_id,
            channel=NotificationChannel.sms,
            template_key=template_key,
            recipient=party.phone,
            subject=subject,
            content=content,
            related_entity_id=related_entity_id,
        )
    # 邮件
    if party.email:
        _push(
            session,
            user_id=party.user_id,
            channel=NotificationChannel.email,
            template_key=template_key,
            recipient=party.email,
            subject=subject,
            content=content,
            related_entity_id=related_entity_id,
        )


def _push(
    session: Session,
    *,
    user_id,
    channel: NotificationChannel,
    template_key: str,
    recipient: str,
    subject: str,
    content: str,
    related_entity_id,
):
    """创建 queued 通知并幂等去重（template_key + related_entity_id + 正文）。"""
    exists = session.exec(
        select(Notification).where(
            Notification.template_key == template_key,
            Notification.related_entity_id == related_entity_id,
            Notification.content == content,
        )
    ).first()
    if exists:
        return
    session.add(
        Notification(
            id=uuid.uuid4(),
            user_id=user_id,
            channel=channel,
            template_key=template_key,
            recipient=recipient,
            subject=subject,
            content=content,
            status=NotificationStatus.queued,
            related_entity_type="contract",
            related_entity_id=related_entity_id,
        )
    )


@celery_app.task(name="check_expiring_contract_signers")
def check_expiring_contract_signers():
    """每日扫描即将到期且未签署的契约签署方，推送催签通知。

    条件：sign_token_expires_at 未来且剩余 ≤ _REMIND_DAYS 天，signed=False。
    """
    now = datetime.now(timezone.utc)
    warn_before = now + timedelta(days=_REMIND_DAYS)
    # 清零 microsecond，与既有通知提醒窗口约定保持一致
    warn_before = warn_before.replace(microsecond=0)

    with Session(engine) as session:
        parties = session.exec(
            select(ContractParty).where(
                ContractParty.signed.is_(False),
                ContractParty.sign_token_expires_at.isnot(None),
                ContractParty.sign_token_expires_at <= warn_before,
                ContractParty.sign_token_expires_at > now,
            )
        ).all()

        reminded = 0
        contract_titles = {}
        for party in parties:
            contract_title = contract_titles.get(party.contract_id)
            if contract_title is None:
                contract = session.get(Contract, party.contract_id)
                contract_title = contract.title if contract else "合同"
                contract_titles[party.contract_id] = contract_title
            before = len(
                session.exec(
                    select(Notification).where(
                        Notification.related_entity_id == party.id,
                        Notification.template_key == "contract_sign_expiring",
                    )
                ).all()
            )
            _notify_reminder(session, party, contract_title=contract_title)
            after = len(
                session.exec(
                    select(Notification).where(
                        Notification.related_entity_id == party.id,
                        Notification.template_key == "contract_sign_expiring",
                    )
                ).all()
            )
            reminded += max(0, after - before)

        session.commit()
    return {"checked": True, "reminded": reminded}