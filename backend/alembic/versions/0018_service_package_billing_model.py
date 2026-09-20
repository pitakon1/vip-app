"""add service_package billing model + quota fields

服务套餐(service_packages)支持三种计费方式：按月 monthly / 按次 per_use / 按年 annual。
本次调整：
1) service_packages 新增：billing_model、billing_interval、unit_price、quota_total、quota_used，
   end_date 改为可空（per_use 按次结算时无到期日）。
2) service_orders 新增：billing_model、billing_amount（购买时记录的计费方式与结算金额）、
   service_package_id（按次套餐关联，完成时对 quota_used +1）。
既有行向后兼容：billing_model 默认 'annual'，其余数值列默认 0/1。
SQLite 下靠 batch 模式重建表，无法补外键约束（同 0011/0014/0017 的做法），只补列；Postgres 正常补。

Revision ID: 0018
Revises: 0017
Create Date: 2026-09-18
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers
revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None


def _tables(bind) -> set:
    return set(sa.inspect(bind).get_table_names())


def _columns(bind, table: str) -> set:
    return {c["name"] for c in sa.inspect(bind).get_columns(table)}


def upgrade():
    bind = op.get_bind()
    is_sqlite = bind.dialect.name == "sqlite"

    # ---- service_packages：三种计费字段 + end_date 变为可空 ----
    if "service_packages" in _tables(bind):
        existing = _columns(bind, "service_packages")
        with op.batch_alter_table("service_packages") as batch_op:
            if "billing_model" not in existing:
                batch_op.add_column(
                    sa.Column(
                        "billing_model",
                        sa.String(),
                        nullable=False,
                        server_default="annual",
                    )
                )
            if "billing_interval" not in existing:
                batch_op.add_column(
                    sa.Column(
                        "billing_interval",
                        sa.Integer(),
                        nullable=False,
                        server_default="1",
                    )
                )
            if "unit_price" not in existing:
                batch_op.add_column(
                    sa.Column(
                        "unit_price",
                        sa.Float(),
                        nullable=False,
                        server_default="0",
                    )
                )
            if "quota_total" not in existing:
                batch_op.add_column(
                    sa.Column(
                        "quota_total",
                        sa.Integer(),
                        nullable=False,
                        server_default="0",
                    )
                )
            if "quota_used" not in existing:
                batch_op.add_column(
                    sa.Column(
                        "quota_used",
                        sa.Integer(),
                        nullable=False,
                        server_default="0",
                    )
                )
            if "end_date" in existing:
                batch_op.alter_column(
                    "end_date",
                    existing_type=sa.DateTime(),
                    nullable=True,
                    existing_nullable=False,
                )
            # batch 重建后清掉 server_default，避免与模型定义(默认值在 ORM 层)漂移
            batch_op.alter_column(
                "billing_model",
                existing_type=sa.String(),
                nullable=False,
                existing_server_default="annual",
                server_default=None,
            )
            batch_op.alter_column(
                "billing_interval",
                existing_type=sa.Integer(),
                nullable=False,
                existing_server_default="1",
                server_default=None,
            )
            batch_op.alter_column(
                "unit_price",
                existing_type=sa.Float(),
                nullable=False,
                existing_server_default="0",
                server_default=None,
            )
            batch_op.alter_column(
                "quota_total",
                existing_type=sa.Integer(),
                nullable=False,
                existing_server_default="0",
                server_default=None,
            )
            batch_op.alter_column(
                "quota_used",
                existing_type=sa.Integer(),
                nullable=False,
                existing_server_default="0",
                server_default=None,
            )

    # ---- service_orders：购买计费记录 + 按次套餐关联 ----
    if "service_orders" in _tables(bind):
        existing = _columns(bind, "service_orders")
        with op.batch_alter_table("service_orders") as batch_op:
            if "billing_model" not in existing:
                batch_op.add_column(
                    sa.Column("billing_model", sa.String(), nullable=True)
                )
            if "billing_amount" not in existing:
                batch_op.add_column(
                    sa.Column("billing_amount", sa.Float(), nullable=True)
                )
            if "service_package_id" not in existing:
                batch_op.add_column(
                    sa.Column("service_package_id", sa.CHAR(32), nullable=True)
                )
        if not is_sqlite and "service_package_id" not in existing:
            op.create_foreign_key(
                None, "service_orders", "service_packages", ["service_package_id"], ["id"]
            )


def downgrade():
    bind = op.get_bind()
    is_sqlite = bind.dialect.name == "sqlite"

    if "service_orders" in _tables(bind):
        existing = _columns(bind, "service_orders")
        if not is_sqlite and "service_package_id" in existing:
            op.drop_constraint(None, "service_orders", type_="foreignkey")
        existing = _columns(bind, "service_orders")  # 删除外键后刷新
        for col in ("service_package_id", "billing_amount", "billing_model"):
            if col in existing:
                with op.batch_alter_table("service_orders") as batch_op:
                    batch_op.drop_column(col)

    if "service_packages" in _tables(bind):
        existing = _columns(bind, "service_packages")
        with op.batch_alter_table("service_packages") as batch_op:
            # end_date 恢复不可空（只在仍可空时；旧行已按原值保留）
            existing = _columns(bind, "service_packages")
            if "end_date" in existing:
                batch_op.alter_column(
                    "end_date",
                    existing_type=sa.DateTime(),
                    nullable=False,
                    existing_nullable=True,
                )
            for col in (
                "quota_used",
                "quota_total",
                "unit_price",
                "billing_interval",
                "billing_model",
            ):
                if col in _columns(bind, "service_packages"):
                    batch_op.drop_column(col)