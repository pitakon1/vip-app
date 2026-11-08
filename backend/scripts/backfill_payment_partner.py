"""为历史支付单回填归属合作公司 `payments.partner_id`（幂等、可重复执行）。

背景：多个 partner 共用同一套库，支付单必须带 `partner_id` 才能做跨公司隔离。
存量行没有该字段，本脚本按 `app.services.payment_partner.resolve_payment_partner`
的固定优先级推导并回填：
    租约经办 agent → 租约业主 → 收款方 payee → 付款方 payer → 房源业主 → 房源录入人

**只写 NULL 行**：已有归属（含人工修正过）的一律不动，重复执行无副作用。
推导不出归属的记录保持 NULL，不做删除/拒绝；运行期按「管理员 + 平台员工 +
该单 payer/payee 本人可见」兜底（见 `payment_visibility_conditions`）。

用法（在 backend 目录下）：
    python scripts/backfill_payment_partner.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import func  # noqa: E402
from sqlmodel import Session, select  # noqa: E402

from app.db import engine  # noqa: E402
from app.models import Payment  # noqa: E402
from app.services.payment_partner import resolve_payment_partner  # noqa: E402


def backfill(session: Session, batch_size: int = 200) -> dict:
    """回填并返回统计。只处理未删除且 `partner_id IS NULL` 的行。"""
    total = session.exec(select(func.count()).select_from(Payment)).one()
    todo = session.exec(
        select(Payment).where(
            Payment.partner_id.is_(None), Payment.deleted_at.is_(None)
        )
    ).all()
    deleted_null = session.exec(
        select(func.count())
        .select_from(Payment)
        .where(Payment.partner_id.is_(None), Payment.deleted_at.is_not(None))
    ).one()

    updated = 0
    unresolved: list[str] = []
    for payment in todo:
        partner_id = resolve_payment_partner(
            session,
            payer_id=payment.payer_id,
            payee_id=payment.payee_id,
            lease_id=payment.lease_id,
            property_id=payment.property_id,
        )
        if partner_id is None:
            unresolved.append(str(payment.id))
            continue
        payment.partner_id = partner_id
        session.add(payment)
        updated += 1
        if updated % batch_size == 0:
            session.commit()

    session.commit()
    return {
        "total": int(total or 0),
        "already_attributed": int(total or 0) - len(todo) - int(deleted_null or 0),
        "scanned_null": len(todo),
        "updated": updated,
        "unresolved": len(unresolved),
        "deleted_null_skipped": int(deleted_null or 0),
        "unresolved_ids": unresolved[:20],
    }


def main() -> None:
    with Session(engine) as session:
        stats = backfill(session)
    scanned = stats["scanned_null"]
    ratio = (stats["unresolved"] / scanned * 100) if scanned else 0.0
    print(f"[backfill-payment-partner] {stats}")
    print(
        f"[backfill-payment-partner] 无法判定归属 {stats['unresolved']} 条"
        f"（占待回填 {scanned} 条的 {ratio:.1f}%），保持 NULL。"
        "兜底：管理员/平台员工可见 + 该单 payer/payee 本人可见，不直接拒绝。"
    )


if __name__ == "__main__":
    main()
