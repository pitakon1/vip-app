"""public listing query indexes（公开列表/首屏索引）

补齐 C 端公开列表的固定查询路径：按楼盘、按房源类型、按面积/租金/挂牌价筛选，
以及「状态 + 业务类型 + 最新排序」的组合查询。

另建城市表达式索引：公开接口用 `slug_expr(Project.city)`（lower + 按固定顺序
replace 去掉空格/连字符/点/撇号/下划线）做城市比对，普通 `idx(city)` 无法命中
表达式查询，必须建同名表达式索引，SQLite 与 PostgreSQL 均支持。

`replace` 的嵌套顺序与 `public.py` 的 `_SLUG_STRIP = (" ", "-", ".", "'", "’", "_")`
完全一致；改字符集或顺序时必须同步修改本迁移与 `slug_expr`，否则索引失效。

全部使用 `CREATE INDEX IF NOT EXISTS` 的探测式写法，重复执行无副作用。

Revision ID: 0046
Revises: 0045
Create Date: 2026-10-27
"""
from alembic import op

# revision identifiers
revision = "0046"
down_revision = "0045"
branch_labels = None
depends_on = None

_INDEX_DEFINITIONS = [
    "ix_properties_project_id ON properties(project_id)",
    "ix_properties_property_type ON properties(property_type)",
    "ix_properties_size_sqm ON properties(size_sqm)",
    "ix_listings_monthly_rent ON listings(monthly_rent)",
    "ix_listings_asking_price ON listings(asking_price)",
    "ix_listings_status_type_created ON listings(status, listing_type, created_at)",
    (
        "ix_projects_city_slug ON projects "
        "(replace(replace(replace(replace(replace(replace(lower(city), ' ', ''), "
        "'-', ''), '.', ''), '''', ''), '’', ''), '_', ''))"
    ),
]


def upgrade():
    for definition in _INDEX_DEFINITIONS:
        op.execute(f"CREATE INDEX IF NOT EXISTS {definition}")


def downgrade():
    for definition in _INDEX_DEFINITIONS:
        index_name = definition.split(" ON ", 1)[0]
        op.execute(f"DROP INDEX IF EXISTS {index_name}")
