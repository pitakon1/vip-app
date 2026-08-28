"""initial migration

Revision ID: 0001
Revises: 
Create Date: 2026-07-28
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = '0001'
down_revision = None
branch_labels = None
depends_on = None

def upgrade():
    # 使用 SQLModel 创建所有表
    from app.models import *  # noqa: F401, F403
    from sqlmodel import SQLModel
    SQLModel.metadata.create_all(op.get_bind())

def downgrade():
    from app.models import *  # noqa: F401, F403
    from sqlmodel import SQLModel
    SQLModel.metadata.drop_all(op.get_bind())
