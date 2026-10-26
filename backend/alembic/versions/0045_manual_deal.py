"""add manual_deals table（非平台成交手工补录业绩）

平台租约成交由 CommissionSettlement 自动生成业绩；非平台成交
（平台对接客户 / 销售自主拓客）通过本表补录并计入当月业绩。

`source` / `deal_type` 使用普通字符串列（不使用 PostgreSQL 原生枚举），
避免像 0044 那样需要 ALTER TYPE 扩容枚举取值。建表复用探测式写法：
表已存在则跳过，重复执行无副作用。

Revision ID: 0045
Revises: 0044
Create Date: 2026-10-26
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers
revision = "0045"
down_revision = "0044"
branch_labels = None
depends_on = None

_TABLE = "manual_deals"

_TIMESTAMP_COLUMNS = [
    sa.Column("created_at", sa.DateTime(), nullable=False),
    sa.Column("updated_at", sa.DateTime(), nullable=False),
    sa.Column("deleted_at", sa.DateTime(), nullable=True),
    sa.Column("metadata_", sa.JSON(), nullable=True),
    sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
]

_COLUMNS = [
    *_TIMESTAMP_COLUMNS,
    sa.Column("employee_id", sa.Uuid(), nullable=False),
    sa.Column("source", sa.String(32), nullable=False),
    sa.Column("deal_type", sa.String(32), nullable=False),
    sa.Column("deal_date", sa.Date(), nullable=False),
    sa.Column("deal_amount", sa.Float(), nullable=False, server_default="0"),
    sa.Column("commission_amount", sa.Float(), nullable=False, server_default="0"),
    sa.Column("currency", sa.String(3), nullable=False, server_default="THB"),
    sa.Column("customer_name", sa.String(), nullable=True),
    sa.Column("property_id", sa.Uuid(), nullable=True),
    sa.Column("note", sa.String(), nullable=True),
    sa.Column("created_by", sa.Uuid(), nullable=True),
]

_INDEXES = [
    "created_at",
    "deleted_at",
    "employee_id",
    "source",
    "deal_date",
    "property_id",
]


def upgrade():
    existing = set(sa.inspect(op.get_bind()).get_table_names())
    if _TABLE not in existing:
        op.create_table(
            _TABLE,
            sa.Column("id", sa.Uuid(), nullable=False),
            *_COLUMNS,
            sa.PrimaryKeyConstraint("id"),
            sa.ForeignKeyConstraint(
                ["employee_id"], ["employees.id"], name="fk_manual_deals_employee_id"
            ),
            sa.ForeignKeyConstraint(
                ["property_id"], ["properties.id"], name="fk_manual_deals_property_id"
            ),
            sa.ForeignKeyConstraint(
                ["created_by"], ["users.id"], name="fk_manual_deals_created_by"
            ),
        )
        op.create_index(f"ix_{_TABLE}_id", _TABLE, ["id"])
        for col in _INDEXES:
            op.create_index(f"ix_{_TABLE}_{col}", _TABLE, [col])


def downgrade():
    existing = set(sa.inspect(op.get_bind()).get_table_names())
    if _TABLE in existing:
        op.drop_table(_TABLE)
