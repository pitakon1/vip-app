"""add chat_participants index table + backfill

即时聊天参与者索引表。
原 `Conversation.participant_ids` 是 JSON 数组列，SQLite/PostgreSQL 都无法对其建索引或
下推过滤，导致「我的会话」只能全表扫描后在 Python 侧过滤。本迁移建索引表，
并把历史会话的参与者做一次真实数据回填（幂等，可重复执行）。

Revision ID: 0006
Revises: 0005
Create Date: 2026-09-15
"""
from alembic import op

# revision identifiers
revision = '0006'
down_revision = '0005'
branch_labels = None
depends_on = None


def upgrade():
    import app.models  # noqa: F401
    from sqlmodel import SQLModel

    # create_all 只创建缺失的表，不会改动既有表（chat_participants 为新增表）
    SQLModel.metadata.create_all(op.get_bind())

    # 真实数据回填：把既有会话的参与者写入索引表
    from sqlmodel import Session

    from app.core.logging import get_logger
    from app.services.chat_participants import backfill_all

    logger = get_logger(__name__)
    with Session(op.get_bind()) as session:
        added = backfill_all(session)
    if added:
        logger.info("migration.0006_backfilled_participants", rows=added)


def downgrade():
    op.execute("DROP TABLE IF EXISTS chat_participants")