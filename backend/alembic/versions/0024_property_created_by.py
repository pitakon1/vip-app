"""add properties.created_by for property ownership isolation

房源权限分级所需：`properties.created_by` 记录是哪位员工把房源录进来的，
用于「管理员看全部、销售/经纪只看自己录的」数据隔离。

为什么指向 `users.id` 而不是 `employees.id`：admin 账号可能没有员工档案
（例如超管），若指向 employees 则这类账号录的房源无法归属；users.id 能覆盖
全部角色，且与 `sale_listings.created_by`、`chat_messages.created_by` 口径一致。

历史房源该列为 NULL：按业务约定「仅管理员可见可改」，管理员可通过
`POST /properties/{id}/assign` 补归属。

缺列的后果不是「少个功能」而是 500（列不存在时房源接口直接报错）。
全新库会由 0001 的 `create_all` 建出该列/索引，故此处先探测再添加，可重复执行。
外键在 SQLite 上跳过：SQLite 不支持 ADD CONSTRAINT，补外键只能重建整表，
收益（仅本地一致性）不抵风险；Postgres 上正常创建。

Revision ID: 0024
Revises: 0023
Create Date: 2026-09-23
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers
revision = '0024'
down_revision = '0023'
branch_labels = None
depends_on = None

_TABLE = "properties"
_COLUMN = "created_by"
_REF_TABLE = "users"
_REF_COLUMN = "id"
_COMMENT = "创建人（房源归属人），用于员工数据隔离；NULL=历史房源，仅管理员可见"
_INDEX = "ix_properties_created_by"


def _column_names(inspector, table: str) -> set:
    return {c["name"] for c in inspector.get_columns(table)}


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    is_sqlite = bind.dialect.name == "sqlite"

    if _TABLE in tables and _REF_TABLE in tables:
        if _COLUMN not in _column_names(inspector, _TABLE):
            op.add_column(
                _TABLE,
                sa.Column(_COLUMN, sa.Uuid(), nullable=True, comment=_COMMENT),
            )
            if not is_sqlite:
                op.create_foreign_key(
                    None, _TABLE, _REF_TABLE, [_COLUMN], [_REF_COLUMN]
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
    # 不用 batch_alter_table：SQLite 上它会重建整表，遇到外键引用时会失败并
    # 残留 _alembic_tmp_* 表。SQLite 3.35+ 已支持直接 DROP COLUMN，
    # 且这里补的列在 SQLite 上没有外键，可以安全删除。
    op.drop_column(_TABLE, _COLUMN)
