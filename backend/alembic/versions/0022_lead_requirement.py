"""add leads.requirement for CRM customer demand field

Web 端「客户管理」新增/编辑线索弹窗有「需求」输入框，并在编辑时回填
（`lead.requirement`），但 Lead 模型/接口都没有该字段：提交内容被 Pydantic
静默丢弃（写不进），列表接口也读不回（回填恒为空）。故补 `requirement` 列。

该列在全新库上会由 0001 的 `create_all` 随模型一起建出，故此处先探测再添加，
可重复执行。

Revision ID: 0022
Revises: 0021
Create Date: 2026-09-23
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers
revision = '0022'
down_revision = '0021'
branch_labels = None
depends_on = None

_TABLE = "leads"
_COLUMN = "requirement"


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
            sa.Text(),
            nullable=True,
            comment="客户需求描述（CRM 表单「需求」字段）",
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