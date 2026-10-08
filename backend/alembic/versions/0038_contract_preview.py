"""合同原件预览：contracts 新增 preview_token 与 preview_token_expires_at

- `preview_token`（唯一索引）：15 分钟有效期的一次性预览令牌，供无鉴权预览接口
  取回合同原始文件（规避浏览器无法带 Bearer 头的限制）。
- `preview_token_expires_at`：令牌过期时间。

列先探测再执行，可重复运行；全新库在 0001 的 create_all 时随模型自动建出。

Revision ID: 0038
Revises: 0037
Create Date: 2026-10-08
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers
revision = "0038"
down_revision = "0037"
branch_labels = None
depends_on = None


def _tables(bind) -> set:
    return set(sa.inspect(bind).get_table_names())


def _columns(bind, table) -> set:
    return {c["name"] for c in sa.inspect(bind).get_columns(table)}


def _indexes(bind, table) -> set:
    return {i["name"] for i in sa.inspect(bind).get_indexes(table)}


def upgrade():
    bind = op.get_bind()
    if "contracts" in _tables(bind):
        cols = _columns(bind, "contracts")
        indexes = _indexes(bind, "contracts")
        with op.batch_alter_table("contracts") as batch:
            if "preview_token" not in cols:
                batch.add_column(
                    sa.Column("preview_token", sa.String(64), nullable=True)
                )
            if "preview_token_expires_at" not in cols:
                batch.add_column(
                    sa.Column("preview_token_expires_at", sa.DateTime(), nullable=True)
                )
        if "ix_contracts_preview_token" not in indexes:
            op.create_index(
                "ix_contracts_preview_token",
                "contracts",
                ["preview_token"],
                unique=True,
            )


def downgrade():
    bind = op.get_bind()
    if "contracts" in _tables(bind):
        if "ix_contracts_preview_token" in _indexes(bind, "contracts"):
            op.drop_index("ix_contracts_preview_token", table_name="contracts")
        cols = _columns(bind, "contracts")
        with op.batch_alter_table("contracts") as batch:
            if "preview_token_expires_at" in cols:
                batch.drop_column("preview_token_expires_at")
            if "preview_token" in cols:
                batch.drop_column("preview_token")