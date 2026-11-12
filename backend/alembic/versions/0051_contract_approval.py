"""合同审批流：新增 pending_approval 状态与审批规则/审批单表

- `contracts.status` 枚举补 `pending_approval`（PostgreSQL 原生枚举需 ALTER TYPE）；
- 新建 `contract_approval_rules`（规则配置）与 `contract_approval_requests`（审批单）。
  默认规则由应用启动时的 `seed_approval_rules()` 幂等补种，迁移不写种子数据。

幂等：先探测表/类型再执行；全新库由 `SQLModel.metadata.create_all` 直接建出。

Revision ID: 0051
Revises: 0050
Create Date: 2026-11-12
"""
import sqlalchemy as sa
from alembic import op

revision = "0051"
down_revision = "0050"
branch_labels = None
depends_on = None


def _tables(bind) -> set:
    return set(sa.inspect(bind).get_table_names())


def upgrade():
    bind = op.get_bind()
    tables = _tables(bind)

    # PostgreSQL 原生枚举：已有 contractstatus 类型时补值；SQLite 为 VARCHAR 无需处理
    if bind.dialect.name == "postgresql" and "contracts" in tables:
        op.execute("ALTER TYPE contractstatus ADD VALUE IF NOT EXISTS 'pending_approval'")

    if "contract_approval_rules" not in tables:
        op.create_table(
            "contract_approval_rules",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("object_type", sa.String(32), nullable=False),
            sa.Column("field", sa.String(64), nullable=False),
            sa.Column("operator", sa.String(16), nullable=False),
            sa.Column("threshold", sa.Float(), nullable=False, server_default="0"),
            sa.Column("threshold_max", sa.Float(), nullable=True),
            sa.Column("approval_role", sa.String(32), nullable=False),
            sa.Column("approval_level", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("priority", sa.Integer(), nullable=False, server_default="100"),
            sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("note", sa.String(255), nullable=True),
            sa.Column("created_by", sa.String(36), nullable=True),
            sa.Column("updated_by", sa.String(36), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.Column("deleted_at", sa.DateTime(), nullable=True),
            sa.Column("metadata_", sa.JSON(), nullable=True),
            sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        )
        op.create_index(
            "ix_contract_approval_rules_object_type",
            "contract_approval_rules",
            ["object_type"],
        )
        op.create_index(
            "ix_contract_approval_rules_field", "contract_approval_rules", ["field"]
        )

    if "contract_approval_requests" not in tables:
        op.create_table(
            "contract_approval_requests",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("object_type", sa.String(32), nullable=False),
            sa.Column("object_id", sa.String(36), nullable=False),
            sa.Column("status", sa.String(16), nullable=False),
            sa.Column("submitter_id", sa.String(36), nullable=False),
            sa.Column("submitted_at", sa.DateTime(), nullable=False),
            sa.Column("level_started_at", sa.DateTime(), nullable=False),
            sa.Column("current_level", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("required_level", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("approver_id", sa.String(36), nullable=True),
            sa.Column("approver_name", sa.String(128), nullable=True),
            sa.Column("comment", sa.String(1000), nullable=True),
            sa.Column("processed_at", sa.DateTime(), nullable=True),
            sa.Column("cancelled_at", sa.DateTime(), nullable=True),
            sa.Column("document_hash", sa.String(128), nullable=True),
            sa.Column("rule_hits", sa.JSON(), nullable=True),
            sa.Column("steps", sa.JSON(), nullable=True),
            sa.Column("reminded_at", sa.DateTime(), nullable=True),
            sa.Column("remind_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.Column("deleted_at", sa.DateTime(), nullable=True),
            sa.Column("metadata_", sa.JSON(), nullable=True),
            sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        )
        op.create_index(
            "ix_contract_approval_requests_object_id",
            "contract_approval_requests",
            ["object_id"],
        )
        op.create_index(
            "ix_contract_approval_requests_status",
            "contract_approval_requests",
            ["status"],
        )
        op.create_index(
            "ix_contract_approval_requests_submitter_id",
            "contract_approval_requests",
            ["submitter_id"],
        )


def downgrade():
    bind = op.get_bind()
    tables = _tables(bind)
    if "contract_approval_requests" in tables:
        op.drop_table("contract_approval_requests")
    if "contract_approval_rules" in tables:
        op.drop_table("contract_approval_rules")
