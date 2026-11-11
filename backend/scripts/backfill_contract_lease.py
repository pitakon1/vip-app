"""为历史合同回填租约归属 `contracts.lease_id`（幂等、可重复执行）。

背景：合同表不冗余存 `owner_id`，业主可见性由 `lease_id → leases.owner_id`
派生（或业主本人就是签署方）。历史合同在生成/上传时没有挂租约，业主侧就
看不到，只有创建人和签署方能看。本脚本按租约回填：

    房源 ID（若合同上有）→ 签署方身份（见 app/services/contract_identity.py）
    → 候选租约（签署时间窗口：起租前 90 天 ~ 到期后 30 天）

签署方身份按标准流程解析：`user_id → 手机号 → 邮箱 → 姓名`。其中姓名仅做
`name_only` 标记、不自动认定；冲突 / 多义 / 停用 / 无档案同样落到人工核对。
合作方手输的姓名空格、全角字符、`+86`、前导 `0`、邮箱大小写由解析模块归一化。

**只写 `lease_id IS NULL`、未删除、`kind=lease` 的合同**：已有租约（含人工
修正过）的一律不动，重复执行无副作用。未解析出身份、或租约候选不唯一时保持
NULL，只报告不猜测——错挂租约比不挂更糟。

用法（在 backend 目录下）：
    python scripts/backfill_contract_lease.py            # 执行回填
    python scripts/backfill_contract_lease.py --dry-run  # 只看统计不写库
"""
import argparse
import sys
from datetime import timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlmodel import Session, select  # noqa: E402

from app.db import engine  # noqa: E402
from app.models import Contract, ContractKind, Lease  # noqa: E402
from app.services.contract_identity import (  # noqa: E402
    ContractIdentityResolver,
)

# 合同签署通常早于起租；到期后也偶有补签。窗口只用于在多个候选中收窄，
# 不作为硬性前置条件——候选本来就只有一个时直接认定。
_WINDOW_BEFORE = timedelta(days=90)
_WINDOW_AFTER = timedelta(days=30)

# 统计口径：身份解析原因 + 租约选择原因
_UNRESOLVED_REASONS = (
    "no_identity",
    "name_only",
    "identity_ambiguous",
    "identity_conflict",
    "identity_inactive",
    "no_profile",
    "no_lease",
    "ambiguous",
)


def _in_window(lease: Lease, created_at) -> bool:
    if created_at is None:
        return True
    return (
        lease.start_date - _WINDOW_BEFORE
        <= created_at
        <= lease.end_date + _WINDOW_AFTER
    )


def resolve_lease_id(
    session: Session,
    contract: Contract,
    resolver: ContractIdentityResolver | None = None,
) -> tuple:
    """返回 `(lease, reason)`：命中唯一租约时 lease 非空，否则 reason 说明原因。"""
    identity = (resolver or ContractIdentityResolver(session)).resolve(contract)
    # 身份未解析完整（含仅姓名、冲突、多义、停用、无档案）时不自动回填
    unresolved = identity.unresolved_reason
    if unresolved:
        return None, unresolved

    owner_ids, tenant_ids = identity.owner_ids, identity.tenant_ids
    stmt = select(Lease).where(Lease.deleted_at.is_(None))
    if contract.property_id:
        stmt = stmt.where(Lease.property_id == contract.property_id)
    if owner_ids:
        stmt = stmt.where(Lease.owner_id.in_(owner_ids))
    if tenant_ids:
        stmt = stmt.where(Lease.tenant_id.in_(tenant_ids))
    candidates = session.exec(stmt).all()
    if not candidates:
        return None, "no_lease"

    if len(candidates) > 1:
        narrowed = [x for x in candidates if _in_window(x, contract.created_at)]
        if narrowed:
            candidates = narrowed
    if len(candidates) == 1:
        return candidates[0], "matched"
    return None, "ambiguous"


def backfill(session: Session, dry_run: bool = False) -> dict:
    base = select(Contract).where(Contract.lease_id.is_(None))
    todo = session.exec(
        base.where(
            Contract.deleted_at.is_(None),
            Contract.kind == ContractKind.lease,
        )
    ).all()
    already = session.exec(
        select(Contract).where(Contract.lease_id.is_not(None))
    ).all()
    non_lease = session.exec(
        base.where(
            Contract.deleted_at.is_(None),
            Contract.kind != ContractKind.lease,
        )
    ).all()
    deleted = session.exec(
        base.where(Contract.deleted_at.is_not(None))
    ).all()

    resolver = ContractIdentityResolver(session)
    updated = 0
    reasons: dict[str, list[str]] = {reason: [] for reason in _UNRESOLVED_REASONS}
    for contract in todo:
        lease, reason = resolve_lease_id(session, contract, resolver)
        if lease is None:
            reasons.setdefault(reason, []).append(str(contract.id))
            continue
        if not dry_run:
            contract.lease_id = lease.id
            if contract.property_id is None:
                contract.property_id = lease.property_id
            session.add(contract)
        updated += 1
    if not dry_run:
        session.commit()

    return {
        "scanned_null": len(todo),
        "updated": updated,
        "already_linked": len(already),
        "non_lease_skipped": len(non_lease),
        "deleted_skipped": len(deleted),
        "unresolved": {k: len(v) for k, v in reasons.items()},
        "unresolved_ids": {k: v[:10] for k, v in reasons.items() if v},
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dry-run", action="store_true", help="只统计可回填数量，不写库"
    )
    args = parser.parse_args()
    with Session(engine) as session:
        stats = backfill(session, dry_run=args.dry_run)
    print(f"[backfill-contract-lease] {'(dry-run) ' if args.dry_run else ''}{stats}")
    if any(stats["unresolved"].values()):
        print(
            "[backfill-contract-lease] 未回填原因："
            "no_identity=签署方没有任何可用身份信号；"
            "name_only=仅姓名命中（不自动认定）；"
            "identity_conflict=多个信号指向不同用户；"
            "identity_ambiguous=同一信号命中多个用户；"
            "identity_inactive=命中用户已停用；"
            "no_profile=命中用户没有业主/租客档案；"
            "no_lease=按房源/身份找不到租约；"
            "ambiguous=候选租约不唯一。以上保持 NULL，需人工核对。"
        )


if __name__ == "__main__":
    main()
