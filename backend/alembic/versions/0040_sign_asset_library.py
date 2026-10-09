"""签名资产库：新增 sign_assets 表（我的签名/印章）

对应开放签「我的签名 / 印模印章」：手写签名、系统生成/印模抠图/上传的印章，
归属当前登录用户个人，签署时复用。

Revision ID: 0040
Revises: 0039
Create Date: 2026-10-09
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers
revision = "0040"
down_revision = "0039"
branch_labels = None
depends_on = None


def _tables(bind) -> set:
    return set(sa.inspect(bind).get_table_names())


def upgrade():
    bind = op.get_bind()
    table = "sign_assets"
    if table in _tables(bind):
        return
    op.create_table(
        table,
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.Column("metadata_", sa.JSON(), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("asset_type", sa.String(20), nullable=False, server_default="handwrite"),
        sa.Column("source", sa.String(20), nullable=False, server_default="drew"),
        sa.Column("data_url", sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(f"ix_{table}_id", table, ["id"])
    op.create_index(f"ix_{table}_user_id", table, ["user_id"])


def downgrade():
    bind = op.get_bind()
    table = "sign_assets"
    if table not in _tables(bind):
        return
    op.drop_index(f"ix_{table}_user_id", table_name=table)
    op.drop_index(f"ix_{table}_id", table_name=table)
    op.drop_table(table)