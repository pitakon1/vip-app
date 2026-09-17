"""create companyprofile table (single-row company info)

远端联调代码中 `GET /company/info` 由静态占位改为读库（app.models.company_profile），
本地 SQLite 缺这张表导致 500。迁移补建：
- id            固定主键 = 1，保证单行
- name/address/phone/email/website   展示信息
- social_media  JSON 社媒链接
- updated_at    更新时间

新建库上会由 0001 的 create_all 随模型一起建出，此处先探测再创建，可重复执行。

Revision ID: 0016
Revises: 0015
Create Date: 2026-09-17
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers
revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None

_TABLE = "companyprofile"


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if _TABLE in set(inspector.get_table_names()):
        return
    op.create_table(
        _TABLE,
        sa.Column("id", sa.Integer(), primary_key=True, server_default="1"),
        sa.Column("name", sa.String(length=200), nullable=True),
        sa.Column("address", sa.String(length=500), nullable=True),
        sa.Column("phone", sa.String(length=50), nullable=True),
        sa.Column("email", sa.String(length=200), nullable=True),
        sa.Column("website", sa.String(length=500), nullable=True),
        sa.Column("social_media", sa.JSON(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if _TABLE not in set(inspector.get_table_names()):
        return
    op.drop_table(_TABLE)
