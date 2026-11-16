"""用户手机号归一化列与唯一索引

`users.phone_normalized` 存 E.164（`+区号+号码`），把注册/登录/CRM 匹配从
「全表扫描 + 多形态比对」改为「唯一索引精确查询」。

历史数据不在这里回填：迁移只加列 + 唯一索引（SQLite/PostgreSQL 的唯一索引
都允许多个 NULL），随后执行
`python scripts/backfill_phone_normalized.py --apply` 回填非冲突号码；
同号多账号的冲突组保持 NULL 并在脚本输出中列出，需人工处理。

Revision ID: 0053
Revises: 0052
Create Date: 2026-11-13
"""
import sqlalchemy as sa
from alembic import op

revision = "0053"
down_revision = "0052"
branch_labels = None
depends_on = None

INDEX_NAME = "ix_users_phone_normalized"


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "users" not in set(inspector.get_table_names()):
        return
    columns = {c["name"] for c in inspector.get_columns("users")}
    if "phone_normalized" not in columns:
        op.add_column("users", sa.Column("phone_normalized", sa.String(20), nullable=True))
    indexes = {idx["name"] for idx in inspector.get_indexes("users")}
    if INDEX_NAME not in indexes:
        op.create_index(INDEX_NAME, "users", ["phone_normalized"], unique=True)


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "users" not in set(inspector.get_table_names()):
        return
    indexes = {idx["name"] for idx in inspector.get_indexes("users")}
    if INDEX_NAME in indexes:
        op.drop_index(INDEX_NAME, table_name="users")
    columns = {c["name"] for c in inspector.get_columns("users")}
    if "phone_normalized" in columns:
        op.drop_column("users", "phone_normalized")
