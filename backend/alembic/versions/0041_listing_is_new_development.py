"""add listings.is_new_development for new-home vs resale

购房业务口径所需：`listings.is_new_development` 区分新房（一手房）与二手房。
放在上架单而非房源档案上，因为 C 端找房列表查询的就是上架单，
且「新房/二手房」由发布时决定。

缺列的后果不是「少个功能」而是 500（列不存在时上架单接口直接报错）。
全新库会由 0001 的 `create_all` 建出该列/索引，故此处先探测再添加，可重复执行。
现有上架单一律回填 False（= 二手房），不凭空造出「新房」数据。

Revision ID: 0041
Revises: 0040
Create Date: 2026-10-17
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers
revision = '0041'
down_revision = '0040'
branch_labels = None
depends_on = None

_TABLE = "listings"
_COLUMN = "is_new_development"
_COMMENT = "是否新房（一手房）；False=二手房（或租金单）"
_INDEX = "ix_listings_is_new_development"


def _column_names(inspector, table: str) -> set:
    return {c["name"] for c in inspector.get_columns(table)}


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if _TABLE in tables and _COLUMN not in _column_names(inspector, _TABLE):
        # NOT NULL 列必须给 server_default，否则已有行无法回填（PG 会直接报错）
        op.add_column(
            _TABLE,
            sa.Column(
                _COLUMN,
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
                comment=_COMMENT,
            ),
        )

    # add_column 改变了表结构，重新 reflect 一次再判断索引是否存在
    inspector = sa.inspect(bind)
    if _TABLE in tables and _COLUMN in _column_names(inspector, _TABLE):
        existing = {idx["name"] for idx in inspector.get_indexes(_TABLE)}
        if _INDEX not in existing:
            op.create_index(_INDEX, _TABLE, [_COLUMN])


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if _TABLE not in tables or _COLUMN not in _column_names(inspector, _TABLE):
        return

    # SQLite 不允许删除「被索引引用」的列，先把该列上的索引清干净
    for idx in inspector.get_indexes(_TABLE):
        if _COLUMN in (idx.get("column_names") or []):
            op.drop_index(idx["name"], table_name=_TABLE)
    op.drop_column(_TABLE, _COLUMN)
