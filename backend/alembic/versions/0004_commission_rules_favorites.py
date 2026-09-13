"""add commission_rules and favorites tables

新增佣金规则配置表与房源收藏表（v1.9）。
复用 create_all（仅创建缺失表），保证列类型与模型一致。

Revision ID: 0004
Revises: 0003
Create Date: 2026-09-13
"""
from alembic import op

# revision identifiers
revision = '0004'
down_revision = '0003'
branch_labels = None
depends_on = None


def upgrade():
    from app.models import *  # noqa: F401, F403
    from sqlmodel import SQLModel
    SQLModel.metadata.create_all(op.get_bind())


def downgrade():
    op.execute("DROP TABLE IF EXISTS commission_rules")
    op.execute("DROP TABLE IF EXISTS favorites")