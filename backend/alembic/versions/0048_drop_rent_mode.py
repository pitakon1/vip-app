"""drop rent_mode (整租/合租)

产品决策：平台只做整套出租，C 端不再提供「合租」筛选，因此移除
`properties.rent_mode` 列及其索引（0047 引入）。`min_lease_months` 保留。

幂等：列/索引不存在时直接跳过。

Revision ID: 0048
Revises: 0047
Create Date: 2026-10-27
"""
import sqlalchemy as sa
from alembic import op

revision = "0048"
down_revision = "0047"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "properties" not in set(inspector.get_table_names()):
        return

    for idx in inspector.get_indexes("properties"):
        if idx.get("name") == "ix_properties_rent_mode":
            op.drop_index("ix_properties_rent_mode", table_name="properties")

    inspector = sa.inspect(bind)
    if "rent_mode" in {c["name"] for c in inspector.get_columns("properties")}:
        op.drop_column("properties", "rent_mode")


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "properties" not in set(inspector.get_table_names()):
        return

    if "rent_mode" not in {c["name"] for c in inspector.get_columns("properties")}:
        op.add_column(
            "properties",
            sa.Column("rent_mode", sa.String(10), nullable=True, comment="出租方式：whole/shared"),
        )
        op.create_index("ix_properties_rent_mode", "properties", ["rent_mode"])
