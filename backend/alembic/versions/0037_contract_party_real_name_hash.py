"""电子合同 P3 实名：contract_parties 新增 real_name_hash

持证人身份证号已明文存于 id_number；additional hash 列用于审计索引匹配，
避免默认把明文证件号暴露给仅能看到部分字段的读取路径。

Revision ID: 0037
Revises: 0036
Create Date: 2026-10-08
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers
revision = "0037"
down_revision = "0036"
branch_labels = None
depends_on = None


def _tables(bind) -> set:
    return set(sa.inspect(bind).get_table_names())


def _columns(bind, table) -> set:
    return {c["name"] for c in sa.inspect(bind).get_columns(table)}


def upgrade():
    bind = op.get_bind()
    if "contract_parties" in _tables(bind):
        cols = _columns(bind, "contract_parties")
        if "real_name_hash" not in cols:
            with op.batch_alter_table("contract_parties") as batch:
                batch.add_column(sa.Column("real_name_hash", sa.String(64), nullable=True))


def downgrade():
    bind = op.get_bind()
    if "contract_parties" in _tables(bind):
        cols = _columns(bind, "contract_parties")
        if "real_name_hash" in cols:
            with op.batch_alter_table("contract_parties") as batch:
                batch.drop_column("real_name_hash")