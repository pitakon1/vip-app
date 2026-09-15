"""add service_orders review fields (comment + reviewed_at)

服务订单此前只有 `rating` 字段，缺少文字反馈与「已评价」标记，导致：
1）前端无法展示评价内容；2）无法阻止同一订单被重复评价。
新增 `review_comment`（文字反馈）与 `reviewed_at`（评价时间，非空即已评价）。

两列在全新库上会由 0001 的 `create_all` 随模型一起建出，故此处先探测再添加，
可重复执行。

Revision ID: 0012
Revises: 0011
Create Date: 2026-09-15
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers
revision = '0012'
down_revision = '0011'
branch_labels = None
depends_on = None

_TABLE = "service_orders"
_COLUMNS = (
    (
        # 模型侧为 Optional[str]，SQLAlchemy 生成 AutoString（VARCHAR），
        # 此处必须同为 String，否则漂移检测会报 modify_type
        "review_comment",
        sa.String(),
        "服务评价文字反馈（rating 为星级）",
    ),
    (
        "reviewed_at",
        sa.DateTime(),
        "评价时间，非空表示该订单已评价（禁止重复评价）",
    ),
)


def _existing_columns(inspector, table: str) -> set:
    return {column["name"] for column in inspector.get_columns(table)}


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if _TABLE not in set(inspector.get_table_names()):
        return
    existing = _existing_columns(inspector, _TABLE)
    for name, column_type, comment in _COLUMNS:
        if name in existing:
            continue
        op.add_column(
            _TABLE,
            sa.Column(name, column_type, nullable=True, comment=comment),
        )


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if _TABLE not in set(inspector.get_table_names()):
        return
    existing = _existing_columns(inspector, _TABLE)
    for name, _column_type, _comment in reversed(_COLUMNS):
        if name not in existing:
            continue
        op.drop_column(_TABLE, name)