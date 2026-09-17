"""maintenance_tickets support owner submissions

业主端新增「提交工单」：业主没有租客档案，原 tenant_id 非空导致无法提单。
本次调整：
- tenant_id 改为可空（batch 重建表，SQLite 上由 render_as_batch 自动处理）
- 新增 owner_id（owners.id 外键列，可空），业主/租客至少其一
- 全新库会由 0001 的 create_all 随模型一起建出，此处先探测再执行，可重复运行。
  SQLite 无法给既有表补外键约束（同 0011/0014 的做法），只补列；Postgres 正常补。

Revision ID: 0017
Revises: 0016
Create Date: 2026-09-17
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers
revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None

_TABLE = "maintenance_tickets"


def _columns(bind) -> set:
    return {c["name"] for c in sa.inspect(bind).get_columns(_TABLE)}


def upgrade():
    bind = op.get_bind()
    if _TABLE not in set(sa.inspect(bind).get_table_names()):
        return
    if "owner_id" in _columns(bind):
        return
    is_sqlite = bind.dialect.name == "sqlite"
    with op.batch_alter_table(_TABLE) as batch_op:
        batch_op.alter_column(
            "tenant_id",
            existing_type=sa.CHAR(32),
            nullable=True,
            existing_nullable=False,
        )
        batch_op.add_column(sa.Column("owner_id", sa.CHAR(32), nullable=True))
    if not is_sqlite:
        op.create_foreign_key(
            None, _TABLE, "owners", ["owner_id"], ["id"]
        )


def downgrade():
    bind = op.get_bind()
    if _TABLE not in set(sa.inspect(bind).get_table_names()):
        return
    if "owner_id" not in _columns(bind):
        return
    with op.batch_alter_table(_TABLE) as batch_op:
        batch_op.drop_column("owner_id")
        batch_op.alter_column(
            "tenant_id",
            existing_type=sa.CHAR(32),
            nullable=False,
            existing_nullable=True,
        )
