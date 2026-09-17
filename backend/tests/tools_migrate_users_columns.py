"""一次性数据迁移：为真实库 users 表补齐 account-self-service 新增列。

新增列定义来自 app.models.user：
    timezone     TEXT NULL
    notify_email BOOLEAN default True
    notify_push  BOOLEAN default True

SQLite 不原生支持 ADD COLUMN IF NOT EXISTS，仅在字段缺失时 ALTER。
运行前自动备份：rental.db -> rental.db.<ts>.bak
运行（backend 目录）：python -m tests.tools_migrate_users_columns
"""
# ruff: noqa: E402
import shutil
import sqlite3
import sys
import time
from pathlib import Path

DB = Path(__file__).resolve().parents[1] / "rental.db"

COLUMNS = [
    ("timezone", "VARCHAR(64)"),
    ("notify_email", "BOOLEAN NOT NULL DEFAULT 1"),
    ("notify_push", "BOOLEAN NOT NULL DEFAULT 1"),
]


def main() -> int:
    if not DB.exists():
        print(f"数据库不存在: {DB}")
        return 1
    backup = DB.with_name(f"rental.db.{time.strftime('%Y%m%d%H%M%S')}.bak")
    shutil.copy2(DB, backup)
    print(f"已备份 -> {backup}")

    conn = sqlite3.connect(DB)
    try:
        existing = {
            row[1] for row in conn.execute("PRAGMA table_info(users)").fetchall()
        }
        added = []
        for name, ddl in COLUMNS:
            if name in existing:
                print(f"跳过（已存在）: {name}")
                continue
            conn.execute(f"ALTER TABLE users ADD COLUMN {name} {ddl}")
            added.append(name)
        conn.commit()
        if added:
            print("已新增列:", added)
        else:
            print("无需迁移，users 表已是目标结构。")
    finally:
        conn.close()
    return 0


sys.exit(main())