"""合同表增加 PDF 签章失败追溯字段

`contracts` 增加 `last_sign_error` / `last_sign_error_at`：PDF 定位签章失败时
记录原因与时间，签署成功后清空。历史行为 NULL，不需要回填。

幂等：先探测表/列再执行；全新库由 `SQLModel.metadata.create_all` 直接建出。

Revision ID: 0050
Revises: 0049
Create Date: 2026-11-12
"""
import sqlalchemy as sa
from alembic import op

revision = "0050"
down_revision = "0049"
branch_labels = None
depends_on = None


def _columns(bind, table) -> set:
    return {c["name"] for c in sa.inspect(bind).get_columns(table)}


def upgrade():
    bind = op.get_bind()
    table = "contracts"
    if table not in set(sa.inspect(bind).get_table_names()):
        return
    cols = _columns(bind, table)
    with op.batch_alter_table(table) as batch:
        if "last_sign_error" not in cols:
            batch.add_column(sa.Column("last_sign_error", sa.String(500), nullable=True))
        if "last_sign_error_at" not in cols:
            batch.add_column(sa.Column("last_sign_error_at", sa.DateTime(), nullable=True))


def downgrade():
    bind = op.get_bind()
    table = "contracts"
    if table not in set(sa.inspect(bind).get_table_names()):
        return
    cols = _columns(bind, table)
    with op.batch_alter_table(table) as batch:
        if "last_sign_error_at" in cols:
            batch.drop_column("last_sign_error_at")
        if "last_sign_error" in cols:
            batch.drop_column("last_sign_error")
