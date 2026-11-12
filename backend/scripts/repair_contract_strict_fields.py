"""修正「已签署但归属必签区未全部落章」的矛盾记录（R6 严格判定配套修数）。

背景：旧口径下，签署方提交签署时会把该方名下所有 `required` 签署区一并置为
已签（即使并未真正落章）。新口径只认「实际落章覆盖到的必签区」，于是历史数据
里可能存在「合同 signed / completed，但仍有 required 字段 signed=False」的矛盾。

修数口径（只修矛盾，不改合同结果与统计）：
- 只处理 `status in (signed, completed)` 的合同；
- 把这些合同里未签的「已归属必签字段」补置为已签，`signed_at` 取合同签署时间
  （缺失时取当前时间）——合同早已判定完成，补标记只是让字段状态与既有结果一致；
- 不动未完成合同（required 未签是正常流转态），不动已签方的签署留痕。

幂等：重复执行只处理仍然矛盾的记录，第二次执行结果应为 0。

用法（在 backend 目录下）：
    python scripts/repair_contract_strict_fields.py --dry-run  # 只扫描不写库
    python scripts/repair_contract_strict_fields.py --check    # 有矛盾则退出码 1
    python scripts/repair_contract_strict_fields.py            # 执行修数
"""
import argparse
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlmodel import Session, select  # noqa: E402

from app.db import engine  # noqa: E402
from app.models import (  # noqa: E402
    Contract,
    ContractSignField,
    ContractStatus,
)

_DONE_STATUSES = (ContractStatus.signed, ContractStatus.completed)


def find_contradictions(session: Session) -> list[tuple[Contract, list[ContractSignField]]]:
    """返回 [(合同, 未签的归属必签字段)]：仅已签署完成但字段未全签的矛盾记录。"""
    rows = session.exec(
        select(Contract).where(Contract.status.in_(_DONE_STATUSES))
    ).all()
    result = []
    for contract in rows:
        pending = session.exec(
            select(ContractSignField).where(
                ContractSignField.contract_id == contract.id,
                ContractSignField.required.is_(True),
                ContractSignField.party_id.is_not(None),
                ContractSignField.signed.is_(False),
            )
        ).all()
        if pending:
            result.append((contract, pending))
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description="修正已签合同必签区未全签的矛盾记录")
    parser.add_argument("--dry-run", action="store_true", help="只扫描统计，不写库")
    parser.add_argument("--check", action="store_true", help="只检查：存在矛盾时退出码为 1")
    args = parser.parse_args()

    with Session(engine) as session:
        contradictions = find_contradictions(session)
        field_total = sum(len(fields) for _, fields in contradictions)
        print(
            f"[scan] 已签合同矛盾记录：contracts={len(contradictions)} fields={field_total}"
        )
        for contract, fields in contradictions[:20]:
            print(
                f"  - {contract.contract_no or contract.id} status={contract.status.value} "
                f"unsigned_required={len(fields)}"
            )
        if args.check:
            return 1 if contradictions else 0
        if args.dry_run or not contradictions:
            return 0

        repaired = 0
        for contract, fields in contradictions:
            stamp = contract.signed_at or datetime.utcnow()
            for field in fields:
                field.signed = True
                field.signed_at = stamp
                session.add(field)
                repaired += 1
        session.commit()
        print(f"[repair] 已补置已签字段：{repaired}")

        remaining = find_contradictions(session)
        print(
            f"[verify] 修数后剩余矛盾：contracts={len(remaining)} "
            f"fields={sum(len(f) for _, f in remaining)}"
        )
        return 0 if not remaining else 2


if __name__ == "__main__":
    raise SystemExit(main())
