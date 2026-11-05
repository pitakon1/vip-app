"""佣金规则新增 partner_id（按合作公司差异化定价）

`commission_rules` 增加可空外键 `partner_id`，配合 `scope=by_partner` 使用：
该 scope 的规则必须绑定合作公司（Partner），否则创建/更新直接 400。
历史规则该列为 NULL，不影响原有解析优先级。

幂等：先探测表/列/索引再执行，可重复运行；降级时同步删除索引与列。
全新库由 `SQLModel.metadata.create_all` 按模型直接建出该列。

Revision ID: 0049
Revises: 0048
Create Date: 2026-11-05
"""
import sqlalchemy as sa
from alembic import op

revision = "0049"
down_revision = "0048"
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
    table = "commission_rules"
    if table not in _tables(bind):
        return

    if "partner_id" not in _columns(bind, table):
        with op.batch_alter_table(table) as batch:
            batch.add_column(sa.Column("partner_id", sa.Uuid(), nullable=True))

    if "ix_commission_rules_partner_id" not in _indexes(bind, table):
        op.create_index("ix_commission_rules_partner_id", table, ["partner_id"])


def downgrade():
    bind = op.get_bind()
    table = "commission_rules"
    if table not in _tables(bind):
        return

    if "ix_commission_rules_partner_id" in _indexes(bind, table):
        op.drop_index("ix_commission_rules_partner_id", table_name=table)

    if "partner_id" in _columns(bind, table):
        with op.batch_alter_table(table) as batch:
            batch.drop_column("partner_id")
