"""线索关联已注册客户账号

`leads.user_id`：线索与 `users` 的显式关联。员工从线索发起会话时优先按该字段
定位客户账号，其次才是邮箱、归一化手机号。

仅新增可空列 + 索引，不回填历史数据（历史线索没有可靠的账号关联依据，
由「发消息」匹配成功后按条回写）。

Revision ID: 0052
Revises: 0051
Create Date: 2026-11-13
"""
import sqlalchemy as sa
from alembic import op

revision = "0052"
down_revision = "0051"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "leads" not in set(inspector.get_table_names()):
        return
    columns = {c["name"] for c in inspector.get_columns("leads")}
    if "user_id" not in columns:
        op.add_column("leads", sa.Column("user_id", sa.String(36), nullable=True))
    indexes = {idx["name"] for idx in inspector.get_indexes("leads")}
    if "ix_leads_user_id" not in indexes:
        op.create_index("ix_leads_user_id", "leads", ["user_id"])


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "leads" not in set(inspector.get_table_names()):
        return
    indexes = {idx["name"] for idx in inspector.get_indexes("leads")}
    if "ix_leads_user_id" in indexes:
        op.drop_index("ix_leads_user_id", table_name="leads")
    columns = {c["name"] for c in inspector.get_columns("leads")}
    if "user_id" in columns:
        op.drop_column("leads", "user_id")
