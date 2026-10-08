"""电子合同签署 P1+P2：签署区字段 + 企业盖章

- 新建 `contract_sign_fields` 表：签署区（手写/手章/公章/日期）占位。
- `contract_parties` 新增 `sign_method`（默认 personal_handwrite）、
  `real_name_verified_at`（P3 预留）。
- `signature_records` 新增 `field_id`（关联签署区）、`method`（签署方式）。

表/列/索引先探测再执行，兼容 SQLite（batch_alter_table 整表重建）。
Revision ID: 0036
Revises: 0035
Create Date: 2026-10-08
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers
revision = "0036"
down_revision = "0035"
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

    # 1) 新建 contract_sign_fields 表
    table = "contract_sign_fields"
    if table not in _tables(bind):
        op.create_table(
            table,
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.Column("deleted_at", sa.DateTime(), nullable=True),
            sa.Column("metadata_", sa.JSON(), nullable=True),
            sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("contract_id", sa.Uuid(), nullable=False),
            sa.Column("party_id", sa.Uuid(), nullable=True),
            sa.Column("field_type", sa.String(32), nullable=False, server_default="signature"),
            sa.Column("page", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("x", sa.Float(), nullable=False, server_default="0"),
            sa.Column("y", sa.Float(), nullable=False, server_default="0"),
            sa.Column("w", sa.Float(), nullable=False, server_default="0"),
            sa.Column("h", sa.Float(), nullable=False, server_default="0"),
            sa.Column("required", sa.Boolean(), nullable=False, server_default="1"),
            sa.Column("signed", sa.Boolean(), nullable=False, server_default="0"),
            sa.Column("signed_at", sa.DateTime(), nullable=True),
            sa.Column("created_by", sa.Uuid(), nullable=True),
            sa.ForeignKeyConstraint(["contract_id"], ["contracts.id"]),
            sa.ForeignKeyConstraint(["party_id"], ["contract_parties.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(f"ix_{table}_id", table, ["id"])
        op.create_index(f"ix_{table}_contract_id", table, ["contract_id"])
        op.create_index(f"ix_{table}_party_id", table, ["party_id"])

    # 2) contract_parties 加列
    if "contract_parties" in _tables(bind):
        cols = _columns(bind, "contract_parties")
        with op.batch_alter_table("contract_parties") as batch:
            if "sign_method" not in cols:
                batch.add_column(
                    sa.Column(
                        "sign_method",
                        sa.String(32),
                        nullable=False,
                        server_default="personal_handwrite",
                    )
                )
            if "real_name_verified_at" not in cols:
                batch.add_column(
                    sa.Column("real_name_verified_at", sa.DateTime(), nullable=True)
                )

    # 3) signature_records 加列 + 索引
    if "signature_records" in _tables(bind):
        cols = _columns(bind, "signature_records")
        with op.batch_alter_table("signature_records") as batch:
            if "field_id" not in cols:
                batch.add_column(
                    sa.Column("field_id", sa.Uuid(), nullable=True)
                )
            if "method" not in cols:
                batch.add_column(
                    sa.Column(
                        "method",
                        sa.String(32),
                        nullable=False,
                        server_default="personal_handwrite",
                    )
                )
        cols_after = _columns(bind, "signature_records")  # 批量建列后重新查询
        if "field_id" in cols_after:
            indexes = _indexes(bind, "signature_records")
            if "ix_signature_records_field_id" not in indexes:
                op.create_index(
                    "ix_signature_records_field_id", "signature_records", ["field_id"]
                )


def downgrade():
    bind = op.get_bind()

    if "signature_records" in _tables(bind):
        indexes = _indexes(bind, "signature_records")
        if "ix_signature_records_field_id" in indexes:
            op.drop_index("ix_signature_records_field_id", table_name="signature_records")
        cols = _columns(bind, "signature_records")
        with op.batch_alter_table("signature_records") as batch:
            if "method" in cols:
                batch.drop_column("method")
            if "field_id" in cols:
                batch.drop_column("field_id")

    if "contract_parties" in _tables(bind):
        cols = _columns(bind, "contract_parties")
        with op.batch_alter_table("contract_parties") as batch:
            if "real_name_verified_at" in cols:
                batch.drop_column("real_name_verified_at")
            if "sign_method" in cols:
                batch.drop_column("sign_method")

    if "contract_sign_fields" in _tables(bind):
        op.drop_table("contract_sign_fields")