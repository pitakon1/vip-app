"""支付回调事件的幂等与留档表。

## 为什么需要这张表（P0 修复背景）

原实现在 `app/providers/payment/service.py` 里用**进程内 `set`** 做回调幂等：
- 生产是 `uvicorn --workers 4`（见 `backend/Dockerfile`），每个进程各持一份集合、
  互相看不见 → 同一笔回调被不同 worker 各处理一次，**重复入账、重复通知、重复事件**；
- 幂等标记发生在 `session.commit()` **之前**，若随后的落库失败，键已被占用，
  渠道重投会被判成 `duplicate webhook` 直接丢弃 → 支付丢失；
- 集合超过 10000 条会整体 `clear()`，历史键全丢，重投同样产生重复。

## 现在的口径

- 幂等键落 `dedupe_key` **单列唯一索引**，值由 `service._webhook_dedupe_key()` 计算：
  优先用**渠道事件 id**（Stripe 的 `evt_…`），因为同一笔支付的多条事件共享
  transaction_id（`payment_intent.processing` 与 `payment_intent.succeeded` 的 id 相同）；
  若只按 transaction_id 去重，后到的 `succeeded` 会被当成重复丢掉——比原 bug 更严重。
  渠道不给事件 id 时退化为 `channel:tx:<交易号>:<业务状态>`。
- 幂等记录的插入与业务落库**在同一个事务**里提交——插入冲突即视为重复投递。
- 查不到对应支付单的回调不丢弃：以 `status=unmatched` 留档并让渠道重投
  （见 `handle_webhook`），供人工或定时任务补单。
"""
import hashlib
import json
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import JSON, Column
from sqlmodel import Field

from .base import TimestampMixin

# status 取值（不建 Enum，避免 SQLite/PG 枚举迁移成本）
WEBHOOK_PROCESSED = "processed"  # 已匹配支付单并完成业务处理
WEBHOOK_UNMATCHED = "unmatched"  # 回调到达时本地还没有对应支付单（多为回调早于下单落库）
WEBHOOK_IGNORED = "ignored"  # 匹配到了但无需变更（已终态等）


def build_dedupe_key(
    channel: str,
    event_id: Optional[str] = None,
    transaction_id: Optional[str] = None,
    event_status: Optional[str] = None,
    idempotency_key: Optional[str] = None,
    payload: Optional[dict] = None,
) -> str:
    """计算回调幂等键。

    优先级：渠道事件 id > (交易号 + 业务状态) > (幂等键 + 业务状态) > 报文哈希。
    注意**不能**只用交易号：同一笔支付的 processing / succeeded 共享交易号，
    只用交易号会把后到的成功事件当作重复丢弃。
    """
    if event_id:
        return f"{channel}:evt:{event_id}"
    if transaction_id:
        return f"{channel}:tx:{transaction_id}:{event_status or '-'}"
    if idempotency_key:
        return f"{channel}:idem:{idempotency_key}:{event_status or '-'}"
    try:
        raw = json.dumps(payload or {}, sort_keys=True, ensure_ascii=False, default=str)
    except (TypeError, ValueError):
        raw = str(payload)
    return f"{channel}:hash:{hashlib.sha256(raw.encode('utf-8')).hexdigest()[:40]}"


class PaymentWebhookEvent(TimestampMixin, table=True):
    """渠道回调的原始留档 + 幂等键。

    一行 = 一次渠道回调的到达记录。`raw_payload` 保留原始报文，
    便于线上出现"渠道说成功、本地没入账"时逐字段比对。
    """

    __tablename__ = "payment_webhook_events"

    dedupe_key: str = Field(
        unique=True,
        index=True,
        max_length=200,
        description="幂等键（唯一）：渠道事件 id 优先，退化到 交易号+状态",
    )
    channel: str = Field(index=True, max_length=32, description="支付渠道")
    event_id: Optional[str] = Field(
        default=None,
        index=True,
        max_length=128,
        description="渠道事件 id（Stripe evt_…）；渠道不提供时为空",
    )
    transaction_id: Optional[str] = Field(
        default=None,
        index=True,
        max_length=128,
        description="渠道交易号；为空表示渠道未回传",
    )
    idempotency_key: Optional[str] = Field(
        default=None,
        index=True,
        max_length=128,
        description="下单时传给渠道的幂等键，用于交易号缺失时兜底匹配",
    )
    payment_id: Optional[uuid.UUID] = Field(
        default=None,
        index=True,
        description="匹配到的支付单；unmatched 时为空",
    )
    status: str = Field(
        default=WEBHOOK_UNMATCHED,
        index=True,
        max_length=16,
        description="processed / unmatched / ignored",
    )
    event_status: Optional[str] = Field(
        default=None,
        max_length=32,
        description="渠道回报的业务状态原文（succeeded / failed / refunded …）",
    )
    note: Optional[str] = Field(
        default=None,
        max_length=255,
        description="处理结论备注，如 matched_by=idempotency_key",
    )
    processed_at: Optional[datetime] = Field(
        default=None,
        description="处理完成时间；unmatched 保持为空",
    )
    raw_payload: Optional[dict] = Field(
        default=None,
        sa_column=Column(JSON, nullable=True, comment="渠道原始报文留档"),
        description="渠道原始报文",
    )

    @property
    def payload_text(self) -> str:
        """原始报文的 JSON 文本（日志/导出用）。"""
        try:
            return json.dumps(self.raw_payload, ensure_ascii=False, default=str)
        except (TypeError, ValueError):
            return str(self.raw_payload)

    def mark(
        self,
        status: str,
        payment_id: Optional[uuid.UUID] = None,
        note: Optional[str] = None,
    ) -> None:
        """结单：写结论。调用方负责 commit（必须与业务变更同事务）。"""
        self.status = status
        if payment_id is not None:
            self.payment_id = payment_id
        if note is not None:
            self.note = note
        self.processed_at = datetime.utcnow()
