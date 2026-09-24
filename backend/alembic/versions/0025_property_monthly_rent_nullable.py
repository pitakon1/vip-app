"""properties.monthly_rent nullable

纯售（sell-only）房源没有月租金，`Property.monthly_rent` 模型已改为
`Optional[float]`（见 models/property.py），本迁移让数据库列同步可空。

SQLite 由 env.py 的 `render_as_batch` 自动走批量重建表；Postgres 直接
alter_column。迁移为探测式：properties 表由 create_all 创建而非 0001 建表，
全新库该列已 nullable，此处重复执行无副作用。

Revision ID: 0025
Revises: 0024
Create Date: 2026-09-24
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers
revision = "0025"
down_revision = "0024"
branch_labels = None
depends_on = None

_TABLE = "properties"
_COLUMN = "monthly_rent"


def _column_names(inspector, table: str) -> set:
    return {c["name"] for c in inspector.get_columns(table)}


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    if _TABLE not in tables or _COLUMN not in _column_names(inspector, _TABLE):
        return
    if bind.dialect.name == "sqlite":
        # SQLite 不支持 ALTER COLUMN，走 batch 重建表（env.py 仅对 autogenerate
        # 生效 render_as_batch，运行时 op 调用需显式 batch_alter_table）
        with op.batch_alter_table(_TABLE) as batch_op:
            batch_op.alter_column(_COLUMN, existing_type=sa.Float(), nullable=True)
    else:
        op.alter_column(_TABLE, _COLUMN, existing_type=sa.Float(), nullable=True)


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    if _TABLE not in tables or _COLUMN not in _column_names(inspector, _TABLE):
        return
    # 先回填 NULL（历史 sell 单无月租 → 0），再改回 NOT NULL
    op.execute(f"UPDATE {_TABLE} SET {_COLUMN} = 0 WHERE {_COLUMN} IS NULL")
    if bind.dialect.name == "sqlite":
        with op.batch_alter_table(_TABLE) as batch_op:
            batch_op.alter_column(_COLUMN, existing_type=sa.Float(), nullable=False)
    else:
        op.alter_column(_TABLE, _COLUMN, existing_type=sa.Float(), nullable=False)
