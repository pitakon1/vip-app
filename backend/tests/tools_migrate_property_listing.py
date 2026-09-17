"""一次性数据迁移：回滚 properties 表的「listing_status」列（删除即下架）。

放弃链家式上架/下架发布态后回滚该列，资源是否对外展示由软删除
（deleted_at）统一控制：删除房源 = 下架。

SQLite 3.35+ 支持 `DROP COLUMN`。运行前自动备份：rental.db -> rental.db.<ts>.bak
运行（backend 目录）：python -m tests.tools_migrate_property_listing
"""
# ruff: noqa: E402
import shutil
import sqlite3
import sys
import time
from pathlib import Path

DB = Path(__file__).resolve().parents[1] / "rental.db"


def main() -> int:
    if not DB.exists():
        print(f"数据库不存在: {DB}")
        return 1
    conn = sqlite3.connect(DB)
    try:
        existing = {
            row[1] for row in conn.execute("PRAGMA table_info(properties)").fetchall()
        }
        if "listing_status" not in existing:
            print("无需迁移，properties 表已不含 listing_status 列。")
            conn.close()
            return 0

        backup = DB.with_name(f"rental.db.{time.strftime('%Y%m%d%H%M%S')}.bak")
        shutil.copy2(DB, backup)
        print(f"已备份 -> {backup}")

        conn.execute("ALTER TABLE properties DROP COLUMN listing_status")
        conn.commit()
        print("已删除列: listing_status")
    finally:
        conn.close()
    return 0


sys.exit(main())