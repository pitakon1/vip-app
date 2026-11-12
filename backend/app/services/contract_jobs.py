"""电子签后台任务（进程内轻量循环，不引入额外依赖）。

职责：
1. 签署完成回调的**计划重投**：首投失败后按 30s / 2m / 10m 重试，耗尽后置 failed，
   仍可由管理端「人工重投」恢复；
2. 签署有效期扫描：把超过 `expires_at` 且仍在流转中的合同置为 `expired`，
   避免状态只靠读取时惰性更新（列表/报表看不到真实过期态）。

多 worker 部署时本循环会在每个进程各跑一份：过期更新是条件幂等写，重复执行无副作用；
回调重投用「条件 UPDATE 抢占 + rowcount 判定」保证同一条事件同一时刻只被一个进程投递，
`X-Idempotency-Key` 仍保留给对端做去重（首投与人工重投不经过抢占）。
"""
import asyncio
import hashlib
import hmac
import json
import logging
import secrets
import uuid
from datetime import datetime, timedelta
from typing import Optional

import httpx
from sqlalchemy import update
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.config import settings
from app.db import engine
from app.models import (
    Contract,
    ContractApprovalRequest,
    ContractApprovalStatus,
    ContractCallbackEvent,
    ContractCallbackStatus,
    ContractParty,
    ContractStatus,
    Notification,
    NotificationChannel,
    NotificationStatus,
)
from app.providers.notification.base import (
    NotificationChannel as ProviderChannel,
    NotificationMessage,
)
from app.providers.notification.router import notification_router

logger = logging.getLogger(__name__)

# 首次投递失败后的等待秒数：第 1/2/3 次失败分别等 30s / 2m / 10m
CALLBACK_BACKOFF_SECONDS = (30, 120, 600)
MAX_CALLBACK_ATTEMPTS = 1 + len(CALLBACK_BACKOFF_SECONDS)
# 重投抢占租约（秒）：抢占时把 next_attempt_at 推到 now + 租约，其它 worker 在本轮
# 看不到这条事件；租约需明显大于 HTTP 投递超时（5s），否则会出现投递中被抢走。
_RETRY_CLAIM_SECONDS = 120
_PENDING_STATUSES = (
    ContractStatus.draft,
    ContractStatus.sent,
    ContractStatus.partially_signed,
)

# 最近一轮后台任务快照（进程内；多 worker 下每个进程各一份，用于 /health 观测）
HOUSEKEEPING_STATE = {
    "last_run_at": None,
    "expired_count": 0,
    "retried_count": 0,
    "failed_count": 0,
    "approval_reminded_count": 0,
}


def housekeeping_snapshot() -> dict:
    """返回最近一轮执行快照：过期条数、重投条数、投递失败条数、本轮完成时间。"""
    return dict(HOUSEKEEPING_STATE)


def callback_signature(payload_bytes: bytes, secret: str) -> str:
    """回调签名：HMAC-SHA256(请求体, callback_secret)，对端据此验真与防重放。"""
    return "sha256=" + hmac.new(secret.encode(), payload_bytes, hashlib.sha256).hexdigest()


def attempt_callback(session: Session, event: ContractCallbackEvent) -> bool:
    """对一条回调事件执行**一次**投递尝试，并按结果安排下一次重投。

    返回 True 表示已送达。失败不会抛异常（回调是旁路，不得影响签署/作废等主流程）。
    """
    body = json.dumps(event.payload or {}, ensure_ascii=False, separators=(",", ":")).encode()
    headers = {
        "Content-Type": "application/json",
        "X-Idempotency-Key": event.idempotency_key,
    }
    contract = session.get(Contract, event.contract_id)
    secret = contract.callback_secret if contract is not None else None
    if secret:
        headers["X-Contract-Signature"] = callback_signature(body, secret)

    event.attempts += 1
    event.last_attempt_at = datetime.utcnow()
    error: Optional[str] = None
    try:
        resp = httpx.post(event.url, content=body, headers=headers, timeout=5.0)
        if 200 <= resp.status_code < 300:
            event.status = ContractCallbackStatus.delivered
            event.delivered_at = datetime.utcnow()
            event.last_error = None
            event.next_attempt_at = None
            session.add(event)
            session.commit()
            logger.info(
                "contract.callback_delivered",
                extra={"contract_id": str(event.contract_id), "event": event.event},
            )
            return True
        error = f"HTTP {resp.status_code}"
    except Exception as exc:  # noqa: BLE001  网络异常只记录
        error = str(exc)[:500]

    event.last_error = (error or "unknown error")[:500]
    if event.attempts < MAX_CALLBACK_ATTEMPTS:
        wait = CALLBACK_BACKOFF_SECONDS[event.attempts - 1]
        event.status = ContractCallbackStatus.pending
        event.next_attempt_at = datetime.utcnow() + timedelta(seconds=wait)
    else:
        event.status = ContractCallbackStatus.failed
        event.next_attempt_at = None
    session.add(event)
    session.commit()
    logger.warning(
        "contract.callback_attempt_failed",
        extra={
            "contract_id": str(event.contract_id),
            "event": event.event,
            "attempt": event.attempts,
            "error": event.last_error,
        },
    )
    return False


def deliver_callback(session: Session, event: ContractCallbackEvent) -> None:
    """立即投递一次（首投/人工重投共用）；后续重投由后台任务按计划执行。"""
    attempt_callback(session, event)


def notify_party(
    session: Session,
    contract: Contract,
    party: ContractParty,
    *,
    template_key: str,
    title: str,
    content: str,
    channels: Optional[list] = None,
) -> list:
    """通知单个签署方（站内 + 邮件），返回实际投递成功的通道列表。

    催办复用它，保证与邀请/过期通知同一条通道口径；任何通道失败只记日志。
    """
    channels = channels or ["in_app", "email"]
    delivered: list = []
    try:
        if "in_app" in channels and party.user_id:
            session.add(
                Notification(
                    id=uuid.uuid4(),
                    user_id=party.user_id,
                    channel=NotificationChannel.in_app,
                    template_key=template_key,
                    recipient=str(party.user_id),
                    subject=title,
                    content=content,
                    status=NotificationStatus.queued,
                    related_entity_type="contract",
                    related_entity_id=contract.id,
                )
            )
            delivered.append("in_app")
        if "email" in channels and party.email:
            result = notification_router.send(
                NotificationMessage(
                    channel=ProviderChannel.EMAIL,
                    recipient=party.email,
                    title=title,
                    content=content,
                    metadata={"contract_id": str(contract.id)},
                    related_entity_type="contract",
                    related_entity_id=str(contract.id),
                )
            )
            delivered.append("email" if result.success else "email_failed")
            if not result.success:
                logger.warning(
                    "contract.notify_email_failed",
                    extra={
                        "contract_id": str(contract.id),
                        "party_id": str(party.id),
                        "template_key": template_key,
                    },
                )
    except Exception:  # noqa: BLE001  通知是旁路，失败不影响主流程
        logger.exception(
            "contract.notify_failed",
            extra={"contract_id": str(contract.id), "party_id": str(party.id)},
        )
    return delivered


def notify_unsigned_parties(
    session: Session,
    contract: Contract,
    *,
    template_key: str,
    title: str,
    content: str,
) -> None:
    """通知合同全部未签方（站内 + 邮件）。任何通道失败只记日志，不改合同状态。

    过期、撤回等终态事件的旁路通知共用这一条路径，保证「站内 + 邮件」口径一致。
    """
    parties = session.exec(
        select(ContractParty).where(
            ContractParty.contract_id == contract.id,
            ContractParty.signed.is_(False),
        )
    ).all()
    for party in parties:
        notify_party(
            session,
            contract,
            party,
            template_key=template_key,
            title=title,
            content=content,
        )
    try:
        session.commit()
    except Exception:  # noqa: BLE001
        session.rollback()
        logger.exception(
            "contract.notify_commit_failed",
            extra={"contract_id": str(contract.id), "template_key": template_key},
        )


def emit_expired_callback(session: Session, contract: Contract) -> None:
    """补发 `contract.expired` 事件（未配置 callback_url 时跳过）。

    读路径的惰性过期与后台扫描可能同时触发，二者写入同一 `idempotency_key`；
    这里直接吞掉唯一键冲突，视为「另一方已发出」。
    """
    if not contract.callback_url:
        return
    key = f"{contract.id}:contract.expired"
    existing = session.exec(
        select(ContractCallbackEvent).where(ContractCallbackEvent.idempotency_key == key)
    ).first()
    if existing is not None:
        return
    if not contract.callback_secret:
        contract.callback_secret = secrets.token_urlsafe(32)
        session.add(contract)
    parties = session.exec(
        select(ContractParty).where(ContractParty.contract_id == contract.id)
    ).all()
    event = ContractCallbackEvent(
        contract_id=contract.id,
        event="contract.expired",
        url=contract.callback_url,
        payload={
            "event": "contract.expired",
            "contract_id": str(contract.id),
            "contract_no": contract.contract_no,
            "title": contract.title,
            "status": contract.status.value,
            "language": contract.language,
            "document_hash": contract.document_hash,
            "expires_at": contract.expires_at.isoformat() if contract.expires_at else None,
            "parties": [
                {
                    "id": str(p.id),
                    "name": p.name,
                    "role": p.role.value,
                    "signed": p.signed,
                    "signed_at": p.signed_at.isoformat() if p.signed_at else None,
                }
                for p in parties
            ],
        },
        idempotency_key=key,
    )
    session.add(event)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()  # 并发方已插入同一事件
        return
    session.refresh(event)
    try:
        attempt_callback(session, event)
    except Exception:  # noqa: BLE001  回调是旁路
        logger.exception("contract.expired_callback_crashed", extra={"contract_id": str(contract.id)})


def expire_due_contracts(session: Session, now: Optional[datetime] = None) -> int:
    """把已过签署有效期、仍在流转中的合同置为 expired。返回更新条数。

    状态落库后对每个合同补发通知与 `contract.expired` 回调；两者都是旁路，
    失败只记日志，不回滚过期状态。
    """
    now = now or datetime.utcnow()
    rows = session.exec(
        select(Contract).where(
            Contract.expires_at.is_not(None),
            Contract.expires_at < now,
            Contract.status.in_(_PENDING_STATUSES),
        )
    ).all()
    for contract in rows:
        contract.status = ContractStatus.expired
        session.add(contract)
    if rows:
        session.commit()
        logger.info("contract.expired_swept", extra={"count": len(rows)})
        for contract in rows:
            notify_unsigned_parties(
                session,
                contract,
                template_key="contract_expired",
                title="合同已过期",
                content=(
                    f"合同《{contract.title}》已超过签署有效期，签署流程已终止。"
                    "如需继续签署，请联系经纪人在系统内重新发起。"
                ),
            )
            emit_expired_callback(session, contract)
    HOUSEKEEPING_STATE["expired_count"] = len(rows)
    return len(rows)


def retry_due_callbacks(session: Session, now: Optional[datetime] = None) -> int:
    """重投到期的待投递回调事件。返回本轮实际投递条数（被抢占的不计）。

    多 worker 并发安全：先用条件 UPDATE 抢占——把 `next_attempt_at` 推到
    `now + 120s`，只有 `rowcount == 1` 的进程拿到归属；抢占独立提交后再投递，
    避免投递失败回滚时把抢占一并回滚、导致同一事件被重复投递。
    """
    now = now or datetime.utcnow()
    rows = session.exec(
        select(ContractCallbackEvent).where(
            ContractCallbackEvent.status == ContractCallbackStatus.pending,
            ContractCallbackEvent.next_attempt_at.is_not(None),
            ContractCallbackEvent.next_attempt_at <= now,
        )
    ).all()
    processed = 0
    failed = 0
    for row in rows:
        claimed = session.execute(
            update(ContractCallbackEvent)
            .where(
                ContractCallbackEvent.id == row.id,
                ContractCallbackEvent.status == ContractCallbackStatus.pending,
                ContractCallbackEvent.next_attempt_at.is_not(None),
                ContractCallbackEvent.next_attempt_at <= now,
            )
            .values(next_attempt_at=now + timedelta(seconds=_RETRY_CLAIM_SECONDS))
        )
        session.commit()
        if claimed.rowcount != 1:
            continue  # 已被其它 worker 抢占，本轮跳过
        event = session.exec(
            select(ContractCallbackEvent)
            .where(ContractCallbackEvent.id == row.id)
            .execution_options(populate_existing=True)
        ).first()
        if event is None:
            continue
        if not attempt_callback(session, event):
            failed += 1
        processed += 1
    HOUSEKEEPING_STATE["retried_count"] = processed
    HOUSEKEEPING_STATE["failed_count"] = failed
    return processed


def remind_stale_approvals(session: Session, now: Optional[datetime] = None) -> int:
    """给超过 24 小时未处理的审批单发一次提醒（站内信 + 邮件）。

    - 幂等：发送前先把 `reminded_at` 落库，同一层级只提醒一次；
    - 层级推进时审批服务会清空 `reminded_at`，新层级重新计 24 小时；
    - 通知失败只记日志，不回滚提醒标记（与「失败只记日志、只发一次」一致）。
    """
    from app.services import contract_approval as approval

    now = now or datetime.utcnow()
    deadline = now - timedelta(hours=approval.APPROVAL_REMIND_HOURS)
    rows = session.exec(
        select(ContractApprovalRequest).where(
            ContractApprovalRequest.status == ContractApprovalStatus.pending,
            ContractApprovalRequest.level_started_at <= deadline,
            ContractApprovalRequest.reminded_at.is_(None),
        )
    ).all()
    reminded = 0
    for request in rows:
        # 先占位提交，避免多 worker / 多轮扫描重复提醒
        request.reminded_at = now
        request.remind_count = (request.remind_count or 0) + 1
        session.add(request)
        try:
            session.commit()
        except Exception:  # noqa: BLE001  并发冲突时由另一方发送
            session.rollback()
            continue

        contract = session.get(Contract, request.object_id)
        role = approval.current_role(request)
        approvers = [
            u for u in approval.eligible_approvers(session, role) if u.id != request.submitter_id
        ]
        title = "合同审批待处理"
        body = (
            f"合同《{contract.title if contract else request.object_id}》已提交超过 24 小时"
            "仍未审批，请尽快处理。"
        )
        for approver in approvers:
            try:
                session.add(
                    Notification(
                        id=uuid.uuid4(),
                        user_id=approver.id,
                        channel=NotificationChannel.in_app,
                        template_key="contract_approval_reminder",
                        recipient=str(approver.id),
                        subject=title,
                        content=body,
                        status=NotificationStatus.queued,
                        related_entity_type="contract",
                        related_entity_id=request.object_id,
                    )
                )
                if approver.email:
                    notification_router.send(
                        NotificationMessage(
                            channel=ProviderChannel.EMAIL,
                            recipient=approver.email,
                            title=title,
                            content=body,
                            metadata={"approval_id": str(request.id)},
                            related_entity_type="contract",
                            related_entity_id=str(request.object_id),
                        )
                    )
            except Exception:  # noqa: BLE001  通知失败只记日志
                logger.exception(
                    "contract.approval_remind_failed",
                    extra={
                        "approval_id": str(request.id),
                        "approver_id": str(approver.id),
                    },
                )
        try:
            session.commit()
        except Exception:  # noqa: BLE001
            session.rollback()
            logger.exception(
                "contract.approval_remind_commit_failed",
                extra={"approval_id": str(request.id)},
            )
        reminded += 1
    return reminded


def run_housekeeping() -> None:
    """同步执行一轮后台任务（供测试与后台线程直接调用）。

    每轮刷新 `HOUSEKEEPING_STATE`，供 `/health` 观测：过期条数、重投条数、
    本轮投递失败条数、本轮完成时间（多 worker 下各进程独立计数）。
    """
    expired = retried = failed = reminded = 0
    with Session(engine) as session:
        try:
            expired = expire_due_contracts(session)
        except Exception:  # noqa: BLE001  单项失败不影响其它任务
            logger.exception("contract.expire_sweep_failed")
        try:
            retried = retry_due_callbacks(session)
            failed = HOUSEKEEPING_STATE["failed_count"]
        except Exception:  # noqa: BLE001
            logger.exception("contract.callback_retry_sweep_failed")
        try:
            reminded = remind_stale_approvals(session)
        except Exception:  # noqa: BLE001  提醒失败只记日志
            logger.exception("contract.approval_remind_sweep_failed")
    HOUSEKEEPING_STATE.update(
        {
            "last_run_at": datetime.utcnow().isoformat(),
            "expired_count": expired,
            "retried_count": retried,
            "failed_count": failed,
            "approval_reminded_count": reminded,
        }
    )


async def housekeeping_loop() -> None:
    """应用生命周期内运行的无限循环；间隔由 CONTRACT_HOUSEKEEPING_SECONDS 控制。"""
    interval = max(10, int(settings.CONTRACT_HOUSEKEEPING_SECONDS))
    while True:
        try:
            await asyncio.to_thread(run_housekeeping)
        except Exception:  # noqa: BLE001
            logger.exception("contract.housekeeping_loop_failed")
        await asyncio.sleep(interval)
