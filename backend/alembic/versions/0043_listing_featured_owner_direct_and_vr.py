"""add listings.is_featured/owner_direct and properties.vr_url

C 端分类页（对标贝壳）有三个入口此前没有数据支撑：
- 租房页「房东直租」→ `listings.owner_direct`
- 商铺办公/厂房的「优选/严选」→ `listings.is_featured`
- 商办/住宅的「VR 看房」→ `properties.vr_url`（外链，不做三维引擎）

布尔列带默认值 False：历史行按「非优选、非直租」处理，语义明确；
`vr_url` NULL = 未录入（不编造）。

全新库会由 0001 的 `create_all` 建出这些列/索引，故此处逐列探测后再添加，
可重复执行（幂等）。

Revision ID: 0043
Revises: 0042
Create Date: 2026-10-17
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers
revision = "0043"
down_revision = "0042"
branch_labels = None
depends_on = None

# listings 上的布尔列：(列名, 注释)
_LISTING_COLUMNS = [
    ("is_featured", "是否优选/严选"),
    ("owner_direct", "是否房东直租"),
]


def _column_names(inspector, table: str) -> set:
    return {c["name"] for c in inspector.get_columns(table)}


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "properties" in tables:
        if "vr_url" not in _column_names(inspector, "properties"):
            op.add_column(
                "properties",
                sa.Column(
                    "vr_url", sa.String(500), nullable=True, comment="VR 看房地址（外链）"
                ),
            )

    if "listings" in tables:
        inspector = sa.inspect(bind)
        existing = _column_names(inspector, "listings")
        for name, comment in _LISTING_COLUMNS:
            if name in existing:
                continue
            # server_default=false() 让既有行直接落 False；PG 上再摘掉默认值交给
            # ORM 维护。SQLite 不支持 `ALTER COLUMN ... DROP DEFAULT`，且保留该
            # 默认值无害，故仅在非 SQLite 方言上执行这一步。
            op.add_column(
                "listings",
                sa.Column(name, sa.Boolean(), nullable=False,
                          server_default=sa.false(), comment=comment),
            )
            if bind.dialect.name != "sqlite":
                op.alter_column("listings", name, server_default=None)
            # add_column 改变了表结构，重新 reflect 后再判断索引
            inspector = sa.inspect(bind)
            idx_name = f"ix_listings_{name}"
            existing_idx = {idx["name"] for idx in inspector.get_indexes("listings")}
            if idx_name not in existing_idx:
                op.create_index(idx_name, "listings", [name])


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "listings" in tables:
        for name, _comment in _LISTING_COLUMNS:
            inspector = sa.inspect(bind)
            for idx in inspector.get_indexes("listings"):
                if idx.get("name") == f"ix_listings_{name}":
                    op.drop_index(f"ix_listings_{name}", table_name="listings")
            if name in _column_names(inspector, "listings"):
                op.drop_column("listings", name)

    if "properties" in tables:
        if "vr_url" in _column_names(inspector, "properties"):
            op.drop_column("properties", "vr_url")
