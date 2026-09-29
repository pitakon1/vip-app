"""分佣拆分：结算支持多角色/合作公司 + 分佣规则表

- commission_settlements：新增 `role`（listing_agent/client_agent/handler/
  partner_company/platform）、`partner_id`（合作公司）、`contract_id`（关联电子合同）、
  `split_percent`（该角色分成比例），并将 `employee_id` 改为可空
  （partner_company/platform 类结算没有个人经纪人）。
- 新建 `commission_split_rules` 表：按成交类型 + 角色配置分成比例
  （scope=all 全局 / by_partner 限定合作公司）。
- CommissionRule.scope 枚举追加 `by_partner`（纯枚举，无需迁移）。

表/列/索引均先探测再执行，可重复运行；全新库在 0001 的 create_all 时随模型自动建出。

Revision ID: 0034
Revises: 0033
Create Date: 2026-09-29
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers
revision = "0034"
down_revision = "0033"
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

    # 1) commission_settlements：加列 + employee_id 允许为空
    if "commission_settlements" in _tables(bind):
        cols = _columns(bind, "commission_settlements")
        with op.batch_alter_table("commission_settlements") as batch:
            if "role" not in cols:
                batch.add_column(
                    sa.Column(
                        "role", sa.String(32), nullable=False, server_default="platform"
                    )
                )
            if "partner_id" not in cols:
                batch.add_column(sa.Column("partner_id", sa.Uuid(), nullable=True))
            if "contract_id" not in cols:
                batch.add_column(sa.Column("contract_id", sa.Uuid(), nullable=True))
            if "split_percent" not in cols:
                batch.add_column(
                    sa.Column("split_percent", sa.Float(), nullable=False, server_default="0")
                )
            # employee_id 改为可空（SQLite 需整表重建，用 batch）
            batch.alter_column(
                "employee_id", existing_type=sa.Uuid(), nullable=True
            )
        indexes = _indexes(bind, "commission_settlements")
        for idx, col in (
            ("ix_commission_settlements_role", "role"),
            ("ix_commission_settlements_partner_id", "partner_id"),
            ("ix_commission_settlements_contract_id", "contract_id"),
        ):
            if idx not in indexes and col in _columns(bind, "commission_settlements"):
                op.create_index(idx, "commission_settlements", [col])

    # 2) 新建 commission_split_rules 表
    table = "commission_split_rules"
    if table not in _tables(bind):
        op.create_table(
            table,
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.Column("deleted_at", sa.DateTime(), nullable=True),
            sa.Column("metadata_", sa.JSON(), nullable=True),
            sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("deal_type", sa.String(32), nullable=False, server_default="new_rental"),
            sa.Column("role", sa.String(32), nullable=False),
            sa.Column("percent", sa.Float(), nullable=False, server_default="0"),
            sa.Column("partner_id", sa.Uuid(), nullable=True),
            sa.Column("scope", sa.String(16), nullable=False, server_default="all"),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default="1"),
            sa.Column("effective_from", sa.DateTime(), nullable=True),
            sa.Column("effective_to", sa.DateTime(), nullable=True),
            sa.Column("created_by", sa.Uuid(), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(f"ix_{table}_id", table, ["id"])
        op.create_index(f"ix_{table}_deal_type", table, ["deal_type"])
        op.create_index(f"ix_{table}_role", table, ["role"])
        op.create_index(f"ix_{table}_scope", table, ["scope"])
        op.create_index(f"ix_{table}_partner_id", table, ["partner_id"])


def downgrade():
    bind = op.get_bind()
    existing = set(_tables(bind))

    if "commission_split_rules" in existing:
        op.drop_table("commission_split_rules")

    if "commission_settlements" in existing:
        indexes = _indexes(bind, "commission_settlements")
        for idx in (
            "ix_commission_settlements_contract_id",
            "ix_commission_settlements_partner_id",
            "ix_commission_settlements_role",
        ):
            if idx in indexes:
                op.drop_index(idx, table_name="commission_settlements")
        cols = _columns(bind, "commission_settlements")
        with op.batch_alter_table("commission_settlements") as batch:
            for col in ("split_percent", "contract_id", "partner_id", "role"):
                if col in cols:
                    batch.drop_column(col)
            batch.alter_column("employee_id", existing_type=sa.Uuid(), nullable=False)