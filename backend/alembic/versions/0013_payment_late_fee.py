"""add payment late fee fields (accrued / waived / updated_at)

逾期滞纳金此前完全缺失：只能在系统外手工催缴，无法对账也无法审计减免。
新增三列：
- `late_fee_accrued`   已计提滞纳金（按逾期天数 × 日费率重算，非累加）
- `late_fee_waived`    人工减免额（减免只在此累计，不会被下一次计提冲掉）
- `late_fee_updated_at` 最近一次计提时间

三列在全新库上会由 0001 的 `create_all` 随模型一起建出，故此处先探测再添加，
可重复执行。

Revision ID: 0013
Revises: 0012
Create Date: 2026-09-15
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers
revision = '0013'
down_revision = '0012'
branch_labels = None
depends_on = None

_TABLE = "payments"
_COLUMNS = (
    (
        "late_fee_accrued",
        sa.Float(),
        "已计提逾期滞纳金（由定时任务按逾期天数重算）",
    ),
    (
        "late_fee_waived",
        sa.Float(),
        "已减免的逾期滞纳金（人工审批，累计值）",
    ),
    (
        "late_fee_updated_at",
        sa.DateTime(),
        "最近一次滞纳金计提时间",
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
        if name == "late_fee_updated_at":
            # 时间戳允许为空，未计提过即为 null
            op.add_column(
                _TABLE, sa.Column(name, column_type, nullable=True, comment=comment)
            )
            continue
        # 金额列带 NOT NULL 默认值，历史行回填为 0
        op.add_column(
            _TABLE,
            sa.Column(
                name,
                column_type,
                nullable=False,
                server_default="0",
                comment=comment,
            ),
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