"""Schema 漂移检测。

对比 `SQLModel.metadata`（模型定义）与真实数据库的差异，用于在部署前/CI 中
发现「模型已改但没写迁移」的情况——这正是此前 `maintenance_tickets` 缺列、
`/dashboard/trend` 500 的直接原因（历史上所有迁移都只调用 `create_all`，
它只能建表，不能 ALTER 既有表）。

用法::

    cd backend
    python scripts/check_schema_drift.py          # 有漂移则退出码 1
    python scripts/check_schema_drift.py --verbose

发现漂移后的修复方式::

    alembic revision --autogenerate -m "describe the change"
    # 检视生成的版本文件后:
    alembic upgrade head
"""
import argparse
import sys
from pathlib import Path

# 允许直接以脚本方式运行（python scripts/check_schema_drift.py）
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from alembic.autogenerate import compare_metadata  # noqa: E402
from alembic.runtime.migration import MigrationContext  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlmodel import SQLModel  # noqa: E402

import app.models  # noqa: F401,E402  确保全部表注册到 metadata
from app.config import settings  # noqa: E402

# 这些差异属于已知无害噪声，不计入漂移
IGNORED_TYPES = ("remove_table",)


def _describe(diff) -> str:
    """把 Alembic 的差异元组渲染成一行可读文本。

    各元组的真实形状（见 `alembic.operations.ops` 中各 Op 的 `to_diff_tuple`）::

        ("add_table", Table)                              # 2 元组
        ("remove_table", Table)                           # 2 元组
        ("add_column", schema, table, Column)             # 4 元组
        ("remove_column", schema, table, Column)          # 4 元组
        ("modify_*", schema, table, column, existing, old, new)   # 7 元组
        ("add_index", Index) / ("remove_index", Index)    # 2 元组
        ("add_constraint"/"add_fk"/..., Constraint)       # 2 元组
        ("add_table_comment", Table, existing)            # 3 元组
        ("execute", sqltext)                              # 2 元组

    注意「表/索引/约束」这类差异是 **2 元组**（对象在 `diff[1]`），此前按
    `diff[2]` 取值会在遇到索引差异时抛 `IndexError`。
    """
    if not isinstance(diff, tuple) or not diff:
        return str(diff)
    kind = diff[0]

    if kind in ("add_table", "remove_table", "add_table_comment",
                "remove_table_comment"):
        return f"{kind}: {getattr(diff[1], 'name', diff[1])}"

    if kind in ("add_column", "remove_column"):
        return f"{kind}: {diff[2]}.{getattr(diff[3], 'name', diff[3])}"

    if kind.startswith("modify_") and len(diff) >= 7:
        return f"{kind}: {diff[2]}.{diff[3]}: {diff[5]} -> {diff[6]}"

    if kind in ("add_index", "remove_index"):
        index = diff[1]
        table = getattr(getattr(index, "table", None), "name", None)
        return f"{kind}: {table}.{getattr(index, 'name', index)}"

    if kind in ("add_constraint", "remove_constraint", "add_fk", "remove_fk"):
        constraint = diff[1]
        table = getattr(getattr(constraint, "table", None), "name", None)
        return f"{kind}: {table}.{getattr(constraint, 'name', constraint)}"

    if kind == "execute":
        return f"execute: {diff[1]}"

    return str(diff)


def main() -> int:
    parser = argparse.ArgumentParser(description="检测模型与数据库的 schema 漂移")
    parser.add_argument("--verbose", action="store_true", help="打印全部原始差异")
    args = parser.parse_args()

    url = settings.DATABASE_URL
    # 同步驱动：本脚本使用同步 engine 做比对
    url = url.replace("postgresql+asyncpg", "postgresql+psycopg2")

    engine = create_engine(url)
    with engine.connect() as connection:
        context = MigrationContext.configure(
            connection,
            opts={"compare_type": True, "compare_server_default": True},
        )
        diffs = compare_metadata(context, SQLModel.metadata)
    engine.dispose()

    relevant = [d for d in diffs if not (
        isinstance(d, tuple) and d[0] in IGNORED_TYPES
    )]

    if not relevant:
        print("schema drift: none")
        return 0

    print(f"schema drift: {len(relevant)} difference(s) found")
    for diff in relevant:
        print(f"  - {_describe(diff)}")
        if args.verbose:
            print(f"    raw: {diff!r}")
    print(
        "\n修复：alembic revision --autogenerate -m \"...\" && "
        "检视版本文件后执行 alembic upgrade head"
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())