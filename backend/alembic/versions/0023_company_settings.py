"""add companyprofile settings columns (reg_no / currency / timezone / settings)

设置页多处「填了就丢、刷新即回退」：

- 「公司信息」的注册号 / 结算币种 / 时区三个输入框只在本地 state 里有值（默认写死
  在代码里），后端 CompanyProfile 没有对应列 → 保存不上、读不回来，展示的一直是
  源码里的示例值。
- 「通知设置」「支付渠道」两个 tab 的「保存」只是 `setTimeout` 后弹一句成功：
  开关改了不落库，刷新即回退。

故补 4 列：`reg_no` / `currency` / `timezone` 为单值列，`settings` 为 JSON 列，
集中存放通知行规则、支付渠道配置与业务提醒参数（保持单行配置表不动）。
全新库上这些列由 0001 的 create_all 随模型一起建出，故先探测再添加，可重复执行。

Revision ID: 0023
Revises: 0022
Create Date: 2026-09-23
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers
revision = '0023'
down_revision = '0022'
branch_labels = None
depends_on = None

_TABLE = "companyprofile"
_COLUMNS = [
    sa.Column("reg_no", sa.String(length=100), nullable=True, comment="公司注册号"),
    sa.Column("currency", sa.String(length=20), nullable=True, comment="结算币种"),
    sa.Column("timezone", sa.String(length=50), nullable=True, comment="时区"),
    sa.Column("settings", sa.JSON(), nullable=True, comment="通知规则 / 支付渠道 / 业务提醒配置"),
]


def _existing_columns(inspector, table: str) -> set:
    return {column["name"] for column in inspector.get_columns(table)}


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if _TABLE not in set(inspector.get_table_names()):
        return
    existing = _existing_columns(inspector, _TABLE)
    for column in _COLUMNS:
        if column.name in existing:
            continue
        op.add_column(_TABLE, column)


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if _TABLE not in set(inspector.get_table_names()):
        return
    existing = _existing_columns(inspector, _TABLE)
    with op.batch_alter_table(_TABLE) as batch:
        for column in _COLUMNS:
            if column.name in existing:
                batch.drop_column(column.name)