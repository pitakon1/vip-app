"""add users.token_version for token revocation

JWT 是自包含的：签发后在过期前一直有效，登出 / 重置密码都无法让旧令牌失效。
`users.token_version` 作为令牌版本号写入令牌的 `tv` 声明，登出或改密时 +1，
服务端校验不一致即拒绝，实现「改密/登出后旧令牌立即失效」。

该列在全新库上会由 0001 的 `create_all` 随模型一起建出，故此处先探测再添加，
可重复执行。

Revision ID: 0008
Revises: 0007
Create Date: 2026-09-15
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers
revision = '0008'
down_revision = '0007'
branch_labels = None
depends_on = None

_COLUMN = "token_version"


def _existing_columns(inspector, table: str) -> set:
    return {column["name"] for column in inspector.get_columns(table)}


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "users" not in set(inspector.get_table_names()):
        return
    if _COLUMN in _existing_columns(inspector, "users"):
        return
    op.add_column(
        "users",
        sa.Column(
            _COLUMN,
            sa.Integer(),
            nullable=False,
            server_default="0",
            comment="令牌版本号，用于登出/改密后吊销旧令牌",
        ),
    )


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "users" not in set(inspector.get_table_names()):
        return
    if _COLUMN not in _existing_columns(inspector, "users"):
        return
    with op.batch_alter_table("users") as batch:
        batch.drop_column(_COLUMN)