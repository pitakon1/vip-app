"""close schema drift: broker_id columns and project lookup indexes

模型里已经存在、但迁移没有跟上的三种结构（`check_schema_drift.py` 会报出）：

1. `employees.broker_id` —— 员工归属渠道商，差异化佣金定价要按它取专属费率；
2. `commission_rules.broker_id`（含索引）—— scope=by_broker 的规则匹配字段；
3. `projects.province` / `projects.nearest_subway` 索引 —— 楼盘筛选与关键词搜索
   （`nearest_subway` 会参与 EXISTS 子查询）都会命中。

缺列的后果不是「少个功能」而是 500：Postgres 上列不存在时相关接口直接报错。
全新库会由 0001 的 `create_all` 建出这些列/索引，故此处先探测再添加，可重复执行。

外键在 SQLite 上跳过：SQLite 不支持 ADD CONSTRAINT，补外键只能重建整表，
收益（仅本地一致性）不抵风险；Postgres 上正常创建。

Revision ID: 0011
Revises: 0010
Create Date: 2026-09-15
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers
revision = '0011'
down_revision = '0010'
branch_labels = None
depends_on = None

# (表名, 列名, 引用表, 引用列, 注释)
_MISSING_COLUMNS = (
    (
        "employees",
        "broker_id",
        "broker_partners",
        "id",
        "归属分销商（渠道商），用于差异化佣金定价",
    ),
    (
        "commission_rules",
        "broker_id",
        "broker_partners",
        "id",
        "scope=by_broker 时生效：该分销商专属佣金率",
    ),
)

# (表名, 索引名, 列名)
# 注意：employees.broker_id 在模型上没有 index=True，故不建索引（多建会变成反向漂移）
_MISSING_INDEXES = (
    ("commission_rules", "ix_commission_rules_broker_id", "broker_id"),
    ("projects", "ix_projects_province", "province"),
    ("projects", "ix_projects_nearest_subway", "nearest_subway"),
)


def _tables(inspector) -> set:
    return set(inspector.get_table_names())


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = _tables(inspector)
    is_sqlite = bind.dialect.name == "sqlite"

    for table, column, ref_table, ref_column, comment in _MISSING_COLUMNS:
        if table not in tables or ref_table not in tables:
            continue
        if column in {c["name"] for c in inspector.get_columns(table)}:
            continue
        op.add_column(
            table,
            sa.Column(column, sa.Uuid(), nullable=True, comment=comment),
        )
        if not is_sqlite:
            op.create_foreign_key(None, table, ref_table, [column], [ref_column])

    # 上面的 add_column 改变了表结构，重新 reflect 一次再判断索引是否存在
    inspector = sa.inspect(bind)
    for table, name, column in _MISSING_INDEXES:
        if table not in tables:
            continue
        if column not in {c["name"] for c in inspector.get_columns(table)}:
            continue
        if name in {idx["name"] for idx in inspector.get_indexes(table)}:
            continue
        op.create_index(name, table, [column])


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = _tables(inspector)

    for table, name, column in reversed(_MISSING_INDEXES):
        if table not in tables:
            continue
        if name in {idx["name"] for idx in inspector.get_indexes(table)}:
            op.drop_index(name, table_name=table)

    for table, column, _ref_table, _ref_column, _comment in reversed(_MISSING_COLUMNS):
        if table not in tables:
            continue
        if column not in {c["name"] for c in inspector.get_columns(table)}:
            continue
        # SQLite 不允许删除「被索引引用」的列，先把该列上的索引清干净
        for idx in inspector.get_indexes(table):
            if column in (idx.get("column_names") or []):
                op.drop_index(idx["name"], table_name=table)
        # 不用 batch_alter_table：SQLite 上它会重建整表，遇到外键引用时会失败并
        # 残留 _alembic_tmp_* 表。SQLite 3.35+ 已支持直接 DROP COLUMN，
        # 且这里补的列在 SQLite 上没有外键，可以安全删除。
        op.drop_column(table, column)