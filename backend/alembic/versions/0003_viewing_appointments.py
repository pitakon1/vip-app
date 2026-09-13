"""add viewing_appointments table

新增预约看房表：访客（潜在租客）对意向房源发起看房预约，员工接单确认，
形成「找房 → 预约 → 看房 → 成交」转化闭环（v1.9）。
复用 create_all（仅创建缺失表），保证列类型与模型一致。

Revision ID: 0003
Revises: 0002
Create Date: 2026-09-13
"""
from alembic import op

# revision identifiers
revision = '0003'
down_revision = '0002'
branch_labels = None
depends_on = None


def upgrade():
    # 仅创建当前缺失的表（viewing_appointments），列类型与模型自动对齐
    from app.models import *  # noqa: F401, F403
    from sqlmodel import SQLModel
    SQLModel.metadata.create_all(op.get_bind())


def downgrade():
    op.execute("DROP TABLE IF EXISTS viewing_appointments")