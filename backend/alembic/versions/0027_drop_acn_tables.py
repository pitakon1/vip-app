"""drop ACN tables（property_contributions / commission_split_plans）

ACN（经纪人合作网络：房源贡献角色 + 贡献度分佣）整体下线：
三端一个调用方都没有，而平台的分销分账已由 `brokers` 的 SplitDeal 一套承担，
两套分佣引擎并存只会长期不一致。相关的模型 / 路由 / service / 定时任务依赖
均已移除，此处删除遗留的两张表。

迁移为探测式：这两张表由 `create_all` 创建而非 0001 建表，若库中不存在则跳过，
重复执行无副作用。downgrade 重建同结构空表（含唯一约束与全部索引），
便于回滚到「表在但功能已下线」的状态。

Revision ID: 0027
Revises: 0026
Create Date: 2026-09-25
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers
revision = "0027"
down_revision = "0026"
branch_labels = None
depends_on = None

_CONTRIB_TABLE = "property_contributions"
_PLAN_TABLE = "commission_split_plans"

# 重建用列定义：与移除前的模型（TimestampMixin + 各自字段）保持一致
_CONTRIB_COLUMNS = [
    sa.Column("id", sa.Uuid(), nullable=False),
    sa.Column("created_at", sa.DateTime(), nullable=False),
    sa.Column("updated_at", sa.DateTime(), nullable=False),
    sa.Column("deleted_at", sa.DateTime(), nullable=True),
    sa.Column("metadata_", sa.JSON(), nullable=True),
    sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
    sa.Column("property_id", sa.Uuid(), nullable=False),
    sa.Column("listing_id", sa.Uuid(), nullable=True),
    sa.Column("role", sa.String(length=14), nullable=False),
    sa.Column("user_id", sa.Uuid(), nullable=True),
    sa.Column("partner_id", sa.Uuid(), nullable=True),
    sa.Column("actor_key", sa.String(length=80), nullable=False),
    sa.Column("weight", sa.Float(), nullable=False),
    sa.Column("share_rate", sa.Float(), nullable=True),
    sa.Column("status", sa.String(), nullable=False),
    sa.Column("granted_at", sa.DateTime(), nullable=False),
    sa.Column("revoked_at", sa.DateTime(), nullable=True),
    sa.Column("note", sa.String(length=500), nullable=True),
]

_CONTRIB_INDEXES = [
    "id",
    "created_at",
    "deleted_at",
    "property_id",
    "listing_id",
    "role",
    "actor_key",
    "user_id",
    "partner_id",
    "status",
]

_PLAN_COLUMNS = [
    sa.Column("id", sa.Uuid(), nullable=False),
    sa.Column("created_at", sa.DateTime(), nullable=False),
    sa.Column("updated_at", sa.DateTime(), nullable=False),
    sa.Column("deleted_at", sa.DateTime(), nullable=True),
    sa.Column("metadata_", sa.JSON(), nullable=True),
    sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
    sa.Column("property_id", sa.Uuid(), nullable=True),
    sa.Column("deal_id", sa.Uuid(), nullable=True),
    sa.Column("lease_id", sa.Uuid(), nullable=True),
    sa.Column("commission_total", sa.Float(), nullable=False),
    sa.Column("currency", sa.String(length=3), nullable=False),
    sa.Column("entries", sa.JSON(), nullable=True),
    sa.Column("participant_count", sa.Integer(), nullable=False),
    sa.Column("status", sa.String(), nullable=False),
    sa.Column("computed_at", sa.DateTime(), nullable=False),
    sa.Column("note", sa.String(length=500), nullable=True),
]

_PLAN_INDEXES = [
    "id",
    "created_at",
    "deleted_at",
    "property_id",
    "deal_id",
    "lease_id",
    "status",
]


def upgrade():
    bind = op.get_bind()
    existing = set(sa.inspect(bind).get_table_names())
    # 先删方案表：它对 properties / property_deals / leases 有外键，与贡献表无依赖，
    # 但保持「后建先删」的顺序便于人工核对
    for table in (_PLAN_TABLE, _CONTRIB_TABLE):
        if table in existing:
            op.drop_table(table)


def downgrade():
    bind = op.get_bind()
    existing = set(sa.inspect(bind).get_table_names())

    if _CONTRIB_TABLE not in existing:
        op.create_table(
            _CONTRIB_TABLE,
            *_CONTRIB_COLUMNS,
            sa.PrimaryKeyConstraint("id"),
            sa.ForeignKeyConstraint(["property_id"], ["properties.id"]),
            sa.ForeignKeyConstraint(["listing_id"], ["listings.id"]),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
            sa.ForeignKeyConstraint(["partner_id"], ["broker_partners.id"]),
            sa.UniqueConstraint(
                "property_id", "role", "actor_key", name="uq_property_contribution"
            ),
        )
        for col in _CONTRIB_INDEXES:
            op.create_index(f"ix_{_CONTRIB_TABLE}_{col}", _CONTRIB_TABLE, [col])

    if _PLAN_TABLE not in existing:
        op.create_table(
            _PLAN_TABLE,
            *_PLAN_COLUMNS,
            sa.PrimaryKeyConstraint("id"),
            sa.ForeignKeyConstraint(["property_id"], ["properties.id"]),
            sa.ForeignKeyConstraint(["deal_id"], ["property_deals.id"]),
            sa.ForeignKeyConstraint(["lease_id"], ["leases.id"]),
        )
        for col in _PLAN_INDEXES:
            op.create_index(f"ix_{_PLAN_TABLE}_{col}", _PLAN_TABLE, [col])