"""drop mortgage_applications

平台不做按揭这类金融业务，按揭功能整体下线（模型 / 路由 / 三端入口已移除），
此处删除遗留的 `mortgage_applications` 表。

迁移为探测式：该表由 `create_all` 创建而非 0001 建表（见 tools_dump_routes 同源
的说明），若库中不存在则直接返回，重复执行无副作用。downgrade 重建同结构空表，
便于回滚到「表在但功能已下线」的状态。

Revision ID: 0026
Revises: 0025
Create Date: 2026-09-25
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers
revision = "0026"
down_revision = "0025"
branch_labels = None
depends_on = None

_TABLE = "mortgage_applications"

# 重建用列定义：与移除前的 MortgageApplication(TimestampMixin) 保持一致
_COLUMNS = [
    sa.Column("id", sa.Uuid(), nullable=False),
    sa.Column("created_at", sa.DateTime(), nullable=False),
    sa.Column("updated_at", sa.DateTime(), nullable=False),
    sa.Column("deleted_at", sa.DateTime(), nullable=True),
    sa.Column("metadata_", sa.JSON(), nullable=True),
    sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
    sa.Column("deal_id", sa.Uuid(), nullable=True),
    sa.Column("buyer_user_id", sa.Uuid(), nullable=False),
    sa.Column("bank", sa.String(length=120), nullable=False),
    sa.Column("loan_amount", sa.Float(), nullable=False),
    sa.Column("currency", sa.String(length=3), nullable=False, server_default="THB"),
    sa.Column("term_months", sa.Integer(), nullable=False, server_default="360"),
    sa.Column("interest_rate", sa.Float(), nullable=True),
    sa.Column("status", sa.String(length=20), nullable=False, server_default="applied"),
    sa.Column("status_at", sa.DateTime(), nullable=True),
    sa.Column("notes", sa.String(), nullable=True),
]


def upgrade():
    bind = op.get_bind()
    if _TABLE not in set(sa.inspect(bind).get_table_names()):
        return
    op.drop_table(_TABLE)


def downgrade():
    bind = op.get_bind()
    if _TABLE in set(sa.inspect(bind).get_table_names()):
        return
    op.create_table(
        _TABLE,
        *_COLUMNS,
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["deal_id"], ["property_deals.id"]),
        sa.ForeignKeyConstraint(["buyer_user_id"], ["users.id"]),
    )
    op.create_index(f"ix_{_TABLE}_id", _TABLE, ["id"])
    op.create_index(f"ix_{_TABLE}_created_at", _TABLE, ["created_at"])
    op.create_index(f"ix_{_TABLE}_deleted_at", _TABLE, ["deleted_at"])
    op.create_index(f"ix_{_TABLE}_deal_id", _TABLE, ["deal_id"])
    op.create_index(f"ix_{_TABLE}_buyer_user_id", _TABLE, ["buyer_user_id"])
    op.create_index(f"ix_{_TABLE}_status", _TABLE, ["status"])