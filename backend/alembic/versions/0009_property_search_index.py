"""add trigram indexes for property / sale listing keyword search

房源与挂牌列表新增关键词搜索（`ILIKE '%kw%'`）。普通 B-tree 索引对前置通配符无效，
这里在 Postgres 上补 pg_trgm 的 GIN 索引，让 `col ILIKE '%kw%'` 能走索引。

- 仅 Postgres 生效（SQLite 无 pg_trgm，本地/测试环境退化为顺序扫描）。
- 若当前库用户没有 CREATE EXTENSION 权限（部分托管 PG），只跳过索引、不阻断迁移：
  搜索仍然可用，只是不走索引。

Revision ID: 0009
Revises: 0008
Create Date: 2026-09-15
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers
revision = '0009'
down_revision = '0008'
branch_labels = None
depends_on = None

# (表名, 参与关键词搜索的列)
_SEARCH_COLUMNS = {
    "properties": ("room_number", "address", "building", "description"),
    # 房源关键词搜索会通过 EXISTS 命中关联楼盘的名称/地址/城市/城区，一并联索引
    "projects": ("name", "address", "city", "district", "nearest_subway"),
    "sale_listings": ("title", "address", "description"),
}


def _index_name(table: str, column: str) -> str:
    return f"ix_{table}_{column}_trgm"


def upgrade():
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    try:
        op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    except Exception:
        # 没有超级用户权限时跳过（搜索功能不受影响，仅少一层索引加速）
        return
    for table, columns in _SEARCH_COLUMNS.items():
        if table not in tables:
            continue
        existing = {idx["name"] for idx in inspector.get_indexes(table)}
        for column in columns:
            name = _index_name(table, column)
            if name in existing:
                continue
            op.execute(
                f"CREATE INDEX IF NOT EXISTS {name} "
                f"ON {table} USING gin ({column} gin_trgm_ops)"
            )


def downgrade():
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    for table, columns in _SEARCH_COLUMNS.items():
        for column in columns:
            op.execute(f"DROP INDEX IF EXISTS {_index_name(table, column)}")