"""add rental filter fields on properties

C 端租房筛选对齐贝壳的两个核心维度：
- `rent_mode`（整租 / 合租）：整套出租与只租一个房间的价格与看房口径不同，
  不能靠 bedrooms 推断，必须显式记录。
- `min_lease_months`（最短租期）：支撑「一个月起租 / 1-3 个月 / 4-6 个月 / 年租」筛选。

回填口径：
- `rent_mode`：回填「有在租上架单」的房源为 'whole'。平台既有在租房源均为整套
  挂牌（房号 + 楼层 + 独立面积），合租记录需由录入端显式写入，不在此臆造。
- `min_lease_months`：保持 NULL——历史数据没有租期口径，NULL = 未录入。

逐列探测后再添加，可重复执行（幂等）。

Revision ID: 0047
Revises: 0046
Create Date: 2026-10-27
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers
revision = "0047"
down_revision = "0046"
branch_labels = None
depends_on = None

_PROPERTY_COLUMNS = [
    ("rent_mode", sa.String(10), "出租方式：whole=整租 / shared=合租（仅租侧）"),
    ("min_lease_months", sa.Integer(), "最短租期（月）"),
]


def _column_names(inspector, table: str) -> set:
    return {c["name"] for c in inspector.get_columns(table)}


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "properties" not in set(inspector.get_table_names()):
        return

    existing = _column_names(inspector, "properties")
    for name, col_type, comment in _PROPERTY_COLUMNS:
        if name in existing:
            continue
        op.add_column(
            "properties",
            sa.Column(name, col_type, nullable=True, comment=comment),
        )

    inspector = sa.inspect(bind)
    existing_idx = {idx["name"] for idx in inspector.get_indexes("properties")}
    if "ix_properties_rent_mode" not in existing_idx:
        op.create_index("ix_properties_rent_mode", "properties", ["rent_mode"])

    # 既有在租房源补「整租」：仅回填确实有在租上架单的房源，不留死标签
    if "listings" in set(inspector.get_table_names()):
        op.execute(
            "UPDATE properties SET rent_mode = 'whole' "
            "WHERE rent_mode IS NULL AND id IN ("
            "SELECT property_id FROM listings "
            "WHERE listing_type = 'rent' AND property_id IS NOT NULL"
            ")"
        )


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "properties" not in set(inspector.get_table_names()):
        return

    for idx in inspector.get_indexes("properties"):
        if idx.get("name") == "ix_properties_rent_mode":
            op.drop_index("ix_properties_rent_mode", table_name="properties")

    inspector = sa.inspect(bind)
    existing = _column_names(inspector, "properties")
    for name, _col_type, _comment in _PROPERTY_COLUMNS:
        if name in existing:
            op.drop_column("properties", name)
