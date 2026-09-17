"""add payment reconciliation fields (reconciled_at / by / note / status)

财务对账此前只能只读查看汇总与明细，无法对每一笔核对到账进行"核销"留痕。
新增四列，记录管理端确认到账的时间、操作人、备注与核销状态：
- `reconciled_at`          核对(核销)时间，未核销为 null
- `reconciled_by`          核对人 users.id，未核销为 null
- `reconciliation_note`    核对备注
- `reconciliation_status`  核销状态：unreconciled / reconciled

四列在全新库上会由 0001 的 create_all 随模型一起建出，故此处先探测再添加，
可重复执行。

Revision ID: 0015
Revises: 0014
Create Date: 2026-09-17
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers
revision = '0015'
down_revision = '0014'
branch_labels = None
depends_on = None

_TABLE = "payments"
_COLUMNS = (
    (
        "reconciled_at",
        sa.DateTime(),
        "财务核销时间",
        {"nullable": True},
    ),
    (
        "reconciled_by",
        sa.Uuid(),
        "财务核销人(users.id)",
        {"nullable": True},
    ),
    (
        "reconciliation_note",
        sa.String(),
        "财务核销备注",
        {"nullable": True},
    ),
    (
        "reconciliation_status",
        sa.String(length=32),
        "核销状态：unreconciled / reconciled",
        {"nullable": False, "server_default": "unreconciled", "comment": "核销状态：unreconciled / reconciled"},
    ),
)


def _existing_columns(inspector, table: str) -> set:
    return {column["name"] for column in inspector.get_columns(table)}


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if _TABLE not in set(inspector.get_table_names()):
        return
    existing = _existing_columns(inspector, _TABLE)
    for name, column_type, comment, kwargs in _COLUMNS:
        if name in existing:
            continue
        kwargs_with_comment = {**kwargs, "comment": comment}
        op.add_column(_TABLE, sa.Column(name, column_type, **kwargs_with_comment))


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if _TABLE not in set(inspector.get_table_names()):
        return
    existing = _existing_columns(inspector, _TABLE)
    for name, _column_type, _comment, _kwargs in reversed(_COLUMNS):
        if name not in existing:
            continue
        op.drop_column(_TABLE, name)