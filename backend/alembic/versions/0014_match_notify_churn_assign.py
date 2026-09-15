"""add match notify + churn signal assign fields

补齐「有数据无动作」的两处断点：
- `property_matches.notified_at`    匹配结果推送给租客的时间（为空=未推送）
- `churn_signals.assigned_to`       派发跟进的员工（employees.id）
- `churn_signals.assigned_at`       派发时间

三列在全新库上会由 0001 的 `create_all` 随模型一起建出，故此处先探测再添加，
可重复执行。全部允许为空，无需回填默认值。`assigned_to` 的外键在 SQLite 上
无法补（同 0011 的做法），本地 `check_schema_drift.py` 会因此多报一条
`add_fk: churn_signals.None` 噪声；Postgres 上外键会正常建立，无漂移。

Revision ID: 0014
Revises: 0013
Create Date: 2026-09-15
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers
revision = '0014'
down_revision = '0013'
branch_labels = None
depends_on = None

_COLUMNS = {
    "property_matches": (
        ("notified_at", sa.DateTime(), None, None, "匹配结果推送给租客的时间"),
    ),
    "churn_signals": (
        (
            "assigned_to",
            sa.Uuid(),
            "employees",
            "id",
            "派发跟进的员工（employees.id）",
        ),
        ("assigned_at", sa.DateTime(), None, None, "派发跟进时间"),
    ),
}


def _existing_columns(inspector, table: str) -> set:
    return {column["name"] for column in inspector.get_columns(table)}


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    is_sqlite = bind.dialect.name == "sqlite"
    for table, columns in _COLUMNS.items():
        if table not in tables:
            continue
        existing = _existing_columns(inspector, table)
        for name, column_type, ref_table, ref_column, comment in columns:
            if name in existing:
                continue
            op.add_column(
                table, sa.Column(name, column_type, nullable=True, comment=comment)
            )
            # SQLite 无法给既有表补外键（同 0011 的做法），只在其上补列
            if ref_table and not is_sqlite:
                op.create_foreign_key(
                    None, table, ref_table, [name], [ref_column]
                )


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    for table, columns in _COLUMNS.items():
        if table not in tables:
            continue
        existing = _existing_columns(inspector, table)
        for name, _column_type, _ref_table, _ref_column, _comment in reversed(columns):
            if name not in existing:
                continue
            op.drop_column(table, name)