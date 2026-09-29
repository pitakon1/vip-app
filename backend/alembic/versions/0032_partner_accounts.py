"""add partners table and partner fields on users

新增合作公司/合作伙伴账号体系：
- 新增 `partners` 表（合作公司档案，admin_user_id 指向其合作公司管理员账号）；
- 给 `users` 增加 `user_type`（platform/partner，区分平台/合作员工）与
  `partner_id`（归属合作公司）两列，存量账号回填为平台员工。

Revision ID: 0032
Revises: 0031
Create Date: 2026-09-29
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers
revision = "0032"
down_revision = "0031"
branch_labels = None
depends_on = None

_TABLE = "partners"

_TIMESTAMP_COLUMNS = [
    sa.Column("created_at", sa.DateTime(), nullable=False),
    sa.Column("updated_at", sa.DateTime(), nullable=False),
    sa.Column("deleted_at", sa.DateTime(), nullable=True),
    sa.Column("metadata_", sa.JSON(), nullable=True),
    sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
]

_COLUMNS = [
    *_TIMESTAMP_COLUMNS,
    sa.Column("name", sa.String(), nullable=False),
    sa.Column("contact_name", sa.String(), nullable=True),
    sa.Column("contact_phone", sa.String(), nullable=True),
    sa.Column("license_no", sa.String(), nullable=True),
    sa.Column("admin_user_id", sa.Uuid(), nullable=True),
    sa.Column("status", sa.String(), nullable=False, server_default="pending"),
    sa.Column("is_active", sa.Boolean(), nullable=False, server_default="1"),
    sa.Column("created_by", sa.Uuid(), nullable=True),
]

_INDEXES = ["created_at", "deleted_at", "name", "admin_user_id", "status"]


def upgrade():
    existing = set(sa.inspect(op.get_bind()).get_table_names())
    if _TABLE not in existing:
        op.create_table(
            _TABLE,
            sa.Column("id", sa.Uuid(), nullable=False),
            *_COLUMNS,
            sa.PrimaryKeyConstraint("id"),
            sa.ForeignKeyConstraint(["admin_user_id"], ["users.id"], name="fk_partner_admin"),
            sa.ForeignKeyConstraint(["created_by"], ["users.id"], name="fk_partner_creator"),
        )
        op.create_index(f"ix_{_TABLE}_id", _TABLE, ["id"])
        for col in _INDEXES:
            op.create_index(f"ix_{_TABLE}_{col}", _TABLE, [col])

    # users 加列（存量账号默认回填为平台员工）
    inspector = sa.inspect(op.get_bind())
    user_cols = {c["name"] for c in inspector.get_columns("users")}
    if "user_type" not in user_cols:
        op.add_column(
            "users",
            sa.Column(
                "user_type",
                sa.String(),
                nullable=False,
                server_default="platform",
            ),
        )
    if "partner_id" not in user_cols:
        op.add_column(
            "users",
            sa.Column("partner_id", sa.Uuid(), nullable=True),
        )
        op.create_index("ix_users_partner_id", "users", ["partner_id"])


def downgrade():
    inspector = sa.inspect(op.get_bind())
    user_cols = {c["name"] for c in inspector.get_columns("users")}
    if "partner_id" in user_cols:
        op.drop_index("ix_users_partner_id", table_name="users")
        op.drop_column("users", "partner_id")
    if "user_type" in user_cols:
        op.drop_column("users", "user_type")

    existing = set(inspector.get_table_names())
    if _TABLE in existing:
        op.drop_table(_TABLE)