"""add properties.video_url for video viewing

「视频看房」是列表页的入口之一，但房源表只有 photos（图片列表）没有视频字段，
导致入口无法落地。新增 `video_url` 单值列（站内 /uploads 或外部链接），
列表页的 `has_video= true` 筛选即依赖该列非空。

该列在全新库上会由 0001 的 `create_all` 随模型一起建出，故此处先探测再添加，
可重复执行。

Revision ID: 0010
Revises: 0009
Create Date: 2026-09-15
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers
revision = '0010'
down_revision = '0009'
branch_labels = None
depends_on = None

_TABLE = "properties"
_COLUMN = "video_url"


def _existing_columns(inspector, table: str) -> set:
    return {column["name"] for column in inspector.get_columns(table)}


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if _TABLE not in set(inspector.get_table_names()):
        return
    if _COLUMN in _existing_columns(inspector, _TABLE):
        return
    op.add_column(
        _TABLE,
        sa.Column(
            _COLUMN,
            sa.String(length=500),
            nullable=True,
            comment="视频看房地址（站内 /uploads 或外部链接）",
        ),
    )


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if _TABLE not in set(inspector.get_table_names()):
        return
    if _COLUMN not in _existing_columns(inspector, _TABLE):
        return
    with op.batch_alter_table(_TABLE) as batch:
        batch.drop_column(_COLUMN)