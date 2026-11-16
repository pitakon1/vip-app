"""数据库完整性补齐：缺失索引 + NOT NULL 漂移回填

Revision ID: 0054
Revises: 0053
Create Date: 2026-11-16

背景（本轮四层检测发现）：
1. `listings.is_featured` 在模型里声明了 index=True，但 0043 迁移对「列已存在」的表
   直接 `continue`，把索引创建也一起跳过了，导致老库 / create_all 建出的库上
   始终没有 `ix_listings_is_featured`，C 端「优选」筛选只能全表扫描。
2. 三处字段在模型里是 NOT NULL，但库里允许 NULL 且已有 NULL 数据：
   - contract_parties.sign_order（10 行 NULL，模型默认 0）
   - contracts.sign_order_type（9 行 NULL，模型默认 parallel）
   - sign_assets.scope（2 行 NULL，模型默认 personal）
   代码靠 `or` 兜底才没炸，但读出来是 None 时排序/分支都依赖隐式兜底，
   且直接 SQL 写入可以继续破坏约束。这里先回填再收紧。

说明：SQLite 需要 batch 模式重建表；已有孤儿数据不做删除（单独在文档记录）。
"""

import sqlalchemy as sa
from alembic import op

revision = "0054"
down_revision = "0053"
branch_labels = None
depends_on = None


def _has_table(inspector, name):
    return name in set(inspector.get_table_names())


def _index_names(inspector, table):
    return {i["name"] for i in inspector.get_indexes(table)}


def _columns(inspector, table):
    return {c["name"] for c in inspector.get_columns(table)}


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    # 1) 补齐缺失索引（幂等）
    if _has_table(inspector, "listings"):
        existing = _index_names(inspector, "listings")
        if "ix_listings_is_featured" not in existing and "is_featured" in _columns(inspector, "listings"):
            op.create_index("ix_listings_is_featured", "listings", ["is_featured"])

    # 2) 回填 NULL 并收紧为 NOT NULL
    if _has_table(inspector, "contract_parties"):
        if "sign_order" in _columns(inspector, "contract_parties"):
            bind.execute(
                sa.text("UPDATE contract_parties SET sign_order = 0 WHERE sign_order IS NULL")
            )
            with op.batch_alter_table("contract_parties") as batch:
                batch.alter_column(
                    "sign_order", existing_type=sa.Integer(), nullable=False
                )

    if _has_table(inspector, "contracts"):
        if "sign_order_type" in _columns(inspector, "contracts"):
            bind.execute(
                sa.text(
                    "UPDATE contracts SET sign_order_type = 'parallel' "
                    "WHERE sign_order_type IS NULL"
                )
            )
            with op.batch_alter_table("contracts") as batch:
                batch.alter_column(
                    "sign_order_type",
                    existing_type=sa.String(length=16),
                    nullable=False,
                )

    if _has_table(inspector, "sign_assets"):
        if "scope" in _columns(inspector, "sign_assets"):
            bind.execute(
                sa.text("UPDATE sign_assets SET scope = 'personal' WHERE scope IS NULL")
            )
            with op.batch_alter_table("sign_assets") as batch:
                batch.alter_column(
                    "scope", existing_type=sa.String(length=16), nullable=False
                )


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if _has_table(inspector, "sign_assets") and "scope" in _columns(inspector, "sign_assets"):
        with op.batch_alter_table("sign_assets") as batch:
            batch.alter_column("scope", existing_type=sa.String(length=16), nullable=True)

    if _has_table(inspector, "contracts") and "sign_order_type" in _columns(inspector, "contracts"):
        with op.batch_alter_table("contracts") as batch:
            batch.alter_column(
                "sign_order_type", existing_type=sa.String(length=16), nullable=True
            )

    if _has_table(inspector, "contract_parties") and "sign_order" in _columns(inspector, "contract_parties"):
        with op.batch_alter_table("contract_parties") as batch:
            batch.alter_column("sign_order", existing_type=sa.Integer(), nullable=True)

    if _has_table(inspector, "listings"):
        if "ix_listings_is_featured" in _index_names(inspector, "listings"):
            op.drop_index("ix_listings_is_featured", table_name="listings")
