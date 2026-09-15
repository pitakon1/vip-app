"""add indexes on created_at / deleted_at / users.last_login_at

`TimestampMixin.created_at` / `deleted_at` 与 `User.last_login_at` 此前没有索引：
- `deleted_at IS NULL` 出现在几乎所有列表查询里；
- `ORDER BY created_at DESC` 是各端列表的默认排序；
- 运营看板的 DAU/WAU/MAU 与活跃趋势按 `last_login_at` 做范围过滤。

数据库已存在的表在创建时（历史迁移走 create_all）不会带上这些新索引，故此处显式补齐。
逐表检查现有索引，已存在则跳过，可重复执行。

Revision ID: 0007
Revises: 0006
Create Date: 2026-09-15
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers
revision = '0007'
down_revision = '0006'
branch_labels = None
depends_on = None

# Mixin 公共字段（所有表）
_MIXIN_COLUMNS = ("created_at", "deleted_at")
# 额外按表补的列
_EXTRA_COLUMNS = {"users": ("last_login_at",)}


def _targets() -> list[tuple[str, str]]:
    """返回需要补索引的 (表名, 列名) 列表（以模型元数据为准）。"""
    import app.models  # noqa: F401
    from sqlmodel import SQLModel

    targets: list[tuple[str, str]] = []
    for table in SQLModel.metadata.sorted_tables:
        columns = list(_MIXIN_COLUMNS) + list(_EXTRA_COLUMNS.get(table.name, ()))
        for column in columns:
            if column in table.columns:
                targets.append((table.name, column))
    return targets


def _existing_indexes(inspector, table: str) -> set:
    return {idx["name"] for idx in inspector.get_indexes(table)}


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    for table_name, column in _targets():
        if table_name not in existing_tables:
            continue
        index_name = f"ix_{table_name}_{column}"
        if index_name in _existing_indexes(inspector, table_name):
            continue
        op.create_index(index_name, table_name, [column])


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    for table_name, column in _targets():
        if table_name not in existing_tables:
            continue
        index_name = f"ix_{table_name}_{column}"
        if index_name in _existing_indexes(inspector, table_name):
            op.drop_index(index_name, table_name=table_name)