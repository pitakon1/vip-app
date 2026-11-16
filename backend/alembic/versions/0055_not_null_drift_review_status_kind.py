"""补齐两处 NOT NULL 漂移：properties.review_status / property_bindings.kind

Revision ID: 0055
Revises: 0054
Create Date: 2026-11-16

0054 处理了三处已有 NULL 数据的字段；这两处库内可空、模型为非空，
实测无 NULL 行，直接收紧即可（SQLite 走 batch 重建）。
"""

import sqlalchemy as sa
from alembic import op

revision = "0055"
down_revision = "0054"
branch_labels = None
depends_on = None


def _tables(inspector):
    return set(inspector.get_table_names())


def _cols(inspector, table):
    return {c["name"] for c in inspector.get_columns(table)}


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = _tables(inspector)

    if "properties" in tables and "review_status" in _cols(inspector, "properties"):
        bind.execute(
            sa.text("UPDATE properties SET review_status = 'pending' WHERE review_status IS NULL")
        )
        with op.batch_alter_table("properties") as batch:
            batch.alter_column(
                "review_status", existing_type=sa.String(length=32), nullable=False
            )

    if "property_bindings" in tables and "kind" in _cols(inspector, "property_bindings"):
        with op.batch_alter_table("property_bindings") as batch:
            batch.alter_column("kind", existing_type=sa.String(length=32), nullable=False)


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = _tables(inspector)

    if "property_bindings" in tables and "kind" in _cols(inspector, "property_bindings"):
        with op.batch_alter_table("property_bindings") as batch:
            batch.alter_column("kind", existing_type=sa.String(length=32), nullable=True)

    if "properties" in tables and "review_status" in _cols(inspector, "properties"):
        with op.batch_alter_table("properties") as batch:
            batch.alter_column(
                "review_status", existing_type=sa.String(length=32), nullable=True
            )
