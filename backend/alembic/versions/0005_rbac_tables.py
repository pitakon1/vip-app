"""add rbac tables (permissions / role_permissions / user_groups / user_group_members)

账号权限体系四张表（v2.0）。复用 create_all 仅创建缺失表，幂等。
权限点与角色默认分配由 app.core.rbac.seed_permissions 在应用启动时补种。

Revision ID: 0005
Revises: 0004
Create Date: 2026-09-15
"""
from alembic import op

# revision identifiers
revision = '0005'
down_revision = '0004'
branch_labels = None
depends_on = None


def upgrade():
    from app.models import *  # noqa: F401, F403
    from sqlmodel import SQLModel
    SQLModel.metadata.create_all(op.get_bind())


def downgrade():
    op.execute("DROP TABLE IF EXISTS user_group_members")
    op.execute("DROP TABLE IF EXISTS user_groups")
    op.execute("DROP TABLE IF EXISTS role_permissions")
    op.execute("DROP TABLE IF EXISTS permissions")