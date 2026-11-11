"""电子签后台任务（进程内轻量循环，不引入额外依赖）。

职责：
1. 签署完成回调的**计划重投**：首投失败后按 30s / 2m / 10m 重试，耗尽后置 failed，
   仍可由管理端「人工重投」恢复；
2. 签署有效期扫描：把超过 `expires_at` 且仍在流转中的合同置为 `expired`，
   避免状态只靠读取时惰性更新（列表/报表看不到真实过期态）。

多 worker 部署时本循环会在每个进程各跑一份：过期更新是条件幂等写，重复执行无副作用；
回调重投存在极小概率的并发重复投递，对端应按 `X-Idempotency-Key` 去重（协议已要求）。
"""
import asyncio
import hashlib
import hmac
import json
import logging
from datetime import datetime, timedelta
from typing import Optional

import httpx
from sqlmodel import Session, select

from app.config import settings
from app.db import engine
from app.models import (
    Contract,
    ContractCallbackEvent,
    ContractCallbackStatus,
    ContractStatus,
)

logger = logging.getLogger(__name__)

# 首次投递失败后的等待秒数：第 1/2/3 次失败分别等 30s / 2m / 10m
CALLBACK_BACKOFF_SECONDS = (30, 120, 600)
MAX_CALLBACK_ATTEMPTS = 1 + len(CALLBACK_BACKOFF_SECONDS)
_PENDING_STATUSES = (
    ContractStatus.draft,
    ContractStatus.sent,
    ContractStatus.partially_signed,
)


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


def expire_due_contracts(session: Session, now: Optional[datetime] = None) -> int:
    """把已过签署有效期、仍在流转中的合同置为 expired。返回更新条数。"""
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
    return len(rows)


def retry_due_callbacks(session: Session, now: Optional[datetime] = None) -> int:
    """重投到期的待投递回调事件。返回本轮处理条数。"""
    now = now or datetime.utcnow()
    rows = session.exec(
        select(ContractCallbackEvent).where(
            ContractCallbackEvent.status == ContractCallbackStatus.pending,
            ContractCallbackEvent.next_attempt_at.is_not(None),
            ContractCallbackEvent.next_attempt_at <= now,
        )
    ).all()
    for event in rows:
        attempt_callback(session, event)
    return len(rows)


def run_housekeeping() -> None:
    """同步执行一轮后台任务（供测试与后台线程直接调用）。"""
    with Session(engine) as session:
        try:
            expire_due_contracts(session)
        except Exception:  # noqa: BLE001  单项失败不影响其它任务
            logger.exception("contract.expire_sweep_failed")
        try:
            retry_due_callbacks(session)
        except Exception:  # noqa: BLE001
            logger.exception("contract.callback_retry_sweep_failed")


async def housekeeping_loop() -> None:
    """应用生命周期内运行的无限循环；间隔由 CONTRACT_HOUSEKEEPING_SECONDS 控制。"""
    interval = max(10, int(settings.CONTRACT_HOUSEKEEPING_SECONDS))
    while True:
        try:
            await asyncio.to_thread(run_housekeeping)
        except Exception:  # noqa: BLE001
            logger.exception("contract.housekeeping_loop_failed")
        await asyncio.sleep(interval)
