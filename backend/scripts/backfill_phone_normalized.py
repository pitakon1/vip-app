"""回填 `users.phone_normalized`（E.164），供唯一索引查询使用（幂等）。

背景：注册/登录/CRM 匹配原先靠「全表扫描 + 多形态比对」。迁移 0053 已加列与
唯一索引，这里把历史手机号统一规范化为 E.164 写入，查询即可走索引。

规则：
- 只处理 `phone` 非空、`phone_normalized` 为空或与规范化结果不一致的行；
- 同一规范化号码对应多个账号时，**整组保持 NULL** 并打印冲突，交人工处理
  （唯一索引允许多个 NULL，因此不会阻塞迁移）；
- 无法解析（位数/区号不合法）的号码保持 NULL 并打印，不猜测、不改原 phone。

用法（在 backend 目录下，先 dry-run 再 apply）：
    python scripts/backfill_phone_normalized.py            # 只统计，不写库
    python scripts/backfill_phone_normalized.py --apply    # 实际回填
"""
import argparse
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlmodel import Session, select  # noqa: E402

from app.db import engine  # noqa: E402
from app.models import User  # noqa: E402
from app.services.phone import to_e164  # noqa: E402


def run(apply: bool) -> int:
    with Session(engine) as session:
        users = session.exec(select(User).where(User.phone.is_not(None))).all()
        parsed: dict[str, list[User]] = defaultdict(list)
        unparsable: list[tuple[str, str]] = []

        for user in users:
            raw = (user.phone or "").strip()
            if not raw:
                continue
            canonical = to_e164(raw)
            if not canonical:
                unparsable.append((str(user.id), raw))
                continue
            parsed[canonical].append(user)

        conflicts = {k: v for k, v in parsed.items() if len(v) > 1}
        changed = 0
        already = 0
        conflict_rows = set()
        for canonical, group in parsed.items():
            if canonical in conflicts:
                conflict_rows.update(str(u.id) for u in group)
                continue
            user = group[0]
            if user.phone_normalized == canonical:
                already += 1
                continue
            if apply:
                user.phone_normalized = canonical
                session.add(user)
            changed += 1

        print(f"users_with_phone     : {len(users)}")
        print(f"normalized_ready     : {sum(len(g) for g in parsed.values())}")
        print(f"already_normalized   : {already}")
        print(f"to_update            : {changed}")
        print(f"unparsable           : {len(unparsable)}")
        for uid, raw in unparsable[:20]:
            print(f"  - unparsable user={uid} phone={raw!r}")
        print(f"conflict_groups      : {len(conflicts)}")
        for canonical, group in conflicts.items():
            ids = ", ".join(str(u.id) for u in group)
            print(f"  - {canonical} -> users: {ids}")

        if apply:
            session.commit()
            print(f"APPLIED: {changed} row(s) updated")
        else:
            print("DRY-RUN: nothing written (use --apply to write)")
        return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Backfill users.phone_normalized")
    parser.add_argument("--apply", action="store_true", help="实际写入（默认只统计）")
    args = parser.parse_args()
    return run(apply=args.apply)


if __name__ == "__main__":
    raise SystemExit(main())
