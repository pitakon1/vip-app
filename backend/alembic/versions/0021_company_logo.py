"""add companyprofile.logo_url for company logo upload/remove

设置页「公司 Logo」区域有「移除」与「点击上传」两个入口，但公司配置表没有任何
Logo 字段：移除只能改本地 state（刷新即复活），上传无处落库。故补 `logo_url`
单值列（站内 /uploads/company 路径），由 `POST/DELETE /company/info/logo` 维护。

该列在全新库上会由 0001 的 `create_all` 随模型一起建出，故此处先探测再添加，
可重复执行。

Revision ID: 0021
Revises: 0020
Create Date: 2026-09-22
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers
revision = '0021'
down_revision = '0020'
branch_labels = None
depends_on = None

_TABLE = "companyprofile"
_COLUMN = "logo_url"


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
            comment="公司 Logo（站内 /uploads/company 路径，空表示未设置）",
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