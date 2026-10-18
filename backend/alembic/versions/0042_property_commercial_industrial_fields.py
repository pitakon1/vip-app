"""add commercial/industrial fields on properties, sale_status on projects

C 端「商铺办公 / 厂房」分类页（对标贝壳）需要工业口径字段：
层高、土地面积、楼面荷载、柱距、电力容量、环评、整层/整栋出租、可注册公司。
购房新房页需要 `projects.sale_status` 支撑「在售/待售楼盘」口径。

全部列 nullable，历史行无需回填（NULL = 未录入，不编造数据）。
全新库会由 0001 的 `create_all` 建出这些列/索引，故此处逐列探测后再添加，
可重复执行（幂等）。

Revision ID: 0042
Revises: 0041
Create Date: 2026-10-17
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers
revision = "0042"
down_revision = "0041"
branch_labels = None
depends_on = None

# (列名, 类型, 注释)
_PROPERTY_COLUMNS = [
    ("ceiling_height_m", sa.Float(), "层高（米），商铺/厂房/写字楼"),
    ("land_area_sqm", sa.Float(), "土地面积（㎡），厂房/独栋"),
    ("floor_loading_kg_sqm", sa.Float(), "楼面荷载（kg/㎡），厂房"),
    ("column_spacing", sa.String(50), "柱距（如 8x8，米），厂房"),
    ("power_capacity_kva", sa.Float(), "电力容量（kVA），厂房"),
    ("environmental_permit", sa.Boolean(), "是否可办理环评，厂房"),
    ("whole_floor_only", sa.Boolean(), "是否仅整层出租，写字楼"),
    ("whole_building_only", sa.Boolean(), "是否仅整栋出租，写字楼/厂房"),
    ("company_registrable", sa.Boolean(), "是否可注册公司，写字楼/商铺"),
]


def _column_names(inspector, table: str) -> set:
    return {c["name"] for c in inspector.get_columns(table)}


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "properties" in tables:
        existing = _column_names(inspector, "properties")
        for name, col_type, comment in _PROPERTY_COLUMNS:
            if name in existing:
                continue
            op.add_column(
                "properties",
                sa.Column(name, col_type, nullable=True, comment=comment),
            )

    # projects.sale_status：自由字符串 + 索引
    inspector = sa.inspect(bind)
    if "projects" in tables:
        if "sale_status" not in _column_names(inspector, "projects"):
            op.add_column(
                "projects",
                sa.Column(
                    "sale_status",
                    sa.String(20),
                    nullable=True,
                    comment="销售状态：pre_sale/on_sale/sold_out",
                ),
            )
        # add_column 改变了表结构，重新 reflect 后再判断索引
        inspector = sa.inspect(bind)
        existing_idx = {idx["name"] for idx in inspector.get_indexes("projects")}
        if "ix_projects_sale_status" not in existing_idx:
            op.create_index("ix_projects_sale_status", "projects", ["sale_status"])


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "projects" in tables:
        for idx in inspector.get_indexes("projects"):
            if idx.get("name") == "ix_projects_sale_status":
                op.drop_index("ix_projects_sale_status", table_name="projects")
        if "sale_status" in _column_names(inspector, "projects"):
            op.drop_column("projects", "sale_status")

    if "properties" in tables:
        inspector = sa.inspect(bind)
        existing = _column_names(inspector, "properties")
        for name, _col_type, _comment in _PROPERTY_COLUMNS:
            if name in existing:
                op.drop_column("properties", name)
