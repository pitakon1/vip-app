"""经纪人分级签约 + 房源上架 + 去重

- contracts 新增 kind 列（区分租赁合同/两份经纪人协议）。
- properties 新增去重档案字段（dedupe_type / dedupe_key 唯一索引 / address_norm）。
- 新建 listings（房源上架单）、property_dedupe_reviews（疑似重复审核）表。
- broker_partners 新增 公司/实名/KYC/联系渠道/业务侧激活 字段，并对存量宽松回填，
  避免锁死存量经纪人（broker_role=both、real_name=partner_name、kyc_status=verified）。

表/列/索引均先探测再执行，可重复运行；全新库在 0001 的 create_all 时随模型自动建出。

Revision ID: 0020
Revises: 0019
Create Date: 2026-09-20
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers
revision = "0020"
down_revision = "0019"
branch_labels = None
depends_on = None


def _tables(bind) -> set:
    return set(sa.inspect(bind).get_table_names())


def _columns(bind, table) -> set:
    return {c["name"] for c in sa.inspect(bind).get_columns(table)}


def _indexes(bind, table) -> set:
    return {i["name"] for i in sa.inspect(bind).get_indexes(table)}


def _add_col(table, colname, *args, **kw):
    """探测后加列，幂等。"""
    bind = op.get_bind()
    if colname not in _columns(bind, table):
        op.add_column(table, sa.Column(colname, *args, **kw))


def upgrade():
    bind = op.get_bind()

    # 1) contracts.kind
    if "contracts" in _tables(bind):
        _add_col(
            "contracts", "kind", sa.String(32), nullable=False, server_default="lease"
        )
        if "ix_contracts_kind" not in _indexes(bind, "contracts"):
            op.create_index("ix_contracts_kind", "contracts", ["kind"])

    # 2) properties 去重字段
    if "properties" in _tables(bind):
        _add_col(
            "properties", "dedupe_type", sa.String(32), nullable=False,
            server_default="none",
        )
        _add_col("properties", "dedupe_key", sa.String(200), nullable=True)
        _add_col("properties", "address_norm", sa.String(300), nullable=True)
        indexes = _indexes(bind, "properties")
        if "ix_properties_dedupe_key" not in indexes:
            op.create_index(
                "ix_properties_dedupe_key", "properties", ["dedupe_key"], unique=True
            )
        if "ix_properties_address_norm" not in indexes:
            op.create_index("ix_properties_address_norm", "properties", ["address_norm"])

    # 3) listings 表
    if "listings" not in _tables(bind):
        op.create_table(
            "listings",
            sa.Column("id", sa.CHAR(32), primary_key=True),
            sa.Column("property_id", sa.CHAR(32), nullable=False),
            sa.Column("listing_type", sa.String(16), nullable=False, server_default="rent"),
            sa.Column("publisher", sa.String(16), nullable=False, server_default="owner"),
            sa.Column("publisher_user_id", sa.CHAR(32), nullable=False),
            sa.Column("publisher_broker_id", sa.CHAR(32), nullable=True),
            sa.Column("owner_id", sa.CHAR(32), nullable=False),
            sa.Column("status", sa.String(16), nullable=False, server_default="pending"),
            sa.Column("asking_price", sa.Numeric(), nullable=True),
            sa.Column("monthly_rent", sa.Numeric(), nullable=True),
            sa.Column("currency", sa.String(3), nullable=False, server_default="THB"),
            sa.Column("sale_commission_rate", sa.Numeric(), nullable=True),
            sa.Column("rental_commission_months", sa.Numeric(), nullable=True),
            sa.Column("mandate_type", sa.String(24), nullable=False, server_default="non_exclusive"),
            sa.Column("split_option", sa.String(24), nullable=True),
            sa.Column("buyer_side_rate", sa.Numeric(), nullable=True),
            sa.Column("listing_side_rate", sa.Numeric(), nullable=True),
            sa.Column("owner_commission_rate", sa.Numeric(), nullable=False, server_default="100"),
            sa.Column("owner_contact_visible", sa.Boolean(), nullable=False, server_default="0"),
            sa.Column("owner_contact_name", sa.String(255), nullable=True),
            sa.Column("owner_contact_phone", sa.String(64), nullable=True),
            sa.Column("owner_contact_channel", sa.String(32), nullable=True),
            sa.Column("broker_company", sa.String(255), nullable=True),
            sa.Column("broker_real_name", sa.String(128), nullable=True),
            sa.Column("broker_phone", sa.String(64), nullable=True),
            sa.Column("broker_wechat", sa.String(128), nullable=True),
            sa.Column("broker_line", sa.String(128), nullable=True),
            sa.Column("broker_whatsapp", sa.String(128), nullable=True),
            sa.Column("dedupe_state", sa.String(24), nullable=False, server_default="new"),
            sa.Column("merged_into_listing_id", sa.CHAR(32), nullable=True),
            sa.Column("reject_reason", sa.String(500), nullable=True),
            sa.Column("reviewed_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.Column("deleted_at", sa.DateTime(), nullable=True),
            sa.Column("metadata_", sa.JSON(), nullable=True, comment="扩展元数据"),
            sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        )
        for idx, cols in {
            "ix_listings_property_id": ["property_id"],
            "ix_listings_listing_type": ["listing_type"],
            "ix_listings_publisher": ["publisher"],
            "ix_listings_publisher_broker_id": ["publisher_broker_id"],
            "ix_listings_owner_id": ["owner_id"],
            "ix_listings_status": ["status"],
            "ix_listings_dedupe_state": ["dedupe_state"],
            "ix_listings_id": ["id"],
            "ix_listings_created_at": ["created_at"],
        }.items():
            op.create_index(idx, "listings", cols)

    # 4) property_dedupe_reviews 表
    if "property_dedupe_reviews" not in _tables(bind):
        op.create_table(
            "property_dedupe_reviews",
            sa.Column("id", sa.CHAR(32), primary_key=True),
            sa.Column("candidate_listing_id", sa.CHAR(32), nullable=False),
            sa.Column("candidate_property_id", sa.CHAR(32), nullable=True),
            sa.Column("matched_listing_id", sa.CHAR(32), nullable=True),
            sa.Column("matched_property_id", sa.CHAR(32), nullable=True),
            sa.Column("match_type", sa.String(24), nullable=False, server_default="fuzzy"),
            sa.Column("match_key", sa.String(200), nullable=True),
            sa.Column("score", sa.Float(), nullable=False, server_default="0"),
            sa.Column("status", sa.String(16), nullable=False, server_default="pending"),
            sa.Column("reviewed_by", sa.CHAR(32), nullable=True),
            sa.Column("reviewed_at", sa.DateTime(), nullable=True),
            sa.Column("note", sa.String(500), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.Column("deleted_at", sa.DateTime(), nullable=True),
            sa.Column("metadata_", sa.JSON(), nullable=True, comment="扩展元数据"),
            sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        )
        for idx, cols in {
            "ix_property_dedupe_reviews_candidate_listing_id": ["candidate_listing_id"],
            "ix_property_dedupe_reviews_matched_property_id": ["matched_property_id"],
            "ix_property_dedupe_reviews_status": ["status"],
            "ix_property_dedupe_reviews_id": ["id"],
            "ix_property_dedupe_reviews_created_at": ["created_at"],
        }.items():
            op.create_index(idx, "property_dedupe_reviews", cols)

    # 5) broker_partners 新字段 + 回填
    if "broker_partners" in _tables(bind):
        for col in (
            ("company_name", sa.String(255), True),
            ("real_name", sa.String(128), True),
            ("wechat", sa.String(128), True),
            ("line", sa.String(128), True),
            ("whatsapp", sa.String(128), True),
            ("kyc_status", sa.String(16), False, "none"),
            ("kyc_verified_at", sa.DateTime(), True),
            ("broker_role", sa.String(24), False, "distributor"),
            ("distributor_active", sa.Boolean(), False, "0"),
            ("listing_active", sa.Boolean(), False, "0"),
            ("distributor_contract_id", sa.CHAR(32), True),
            ("listing_contract_id", sa.CHAR(32), True),
        ):
            _add_col("broker_partners", col[0], col[1], nullable=col[2], server_default=col[3] if len(col) > 3 and col[3] is not None else None)

        # 对存量经纪人宽松回填：避免 lock 存量（broker_role=both、实名用 partner_name、KYC=verified）
        op.execute("UPDATE broker_partners SET broker_role = 'both' WHERE broker_role = 'distributor'")
        op.execute("UPDATE broker_partners SET real_name = partner_name WHERE real_name IS NULL OR real_name = ''")
        op.execute("UPDATE broker_partners SET kyc_status = 'verified' WHERE kyc_status = 'none'")


def downgrade():
    bind = op.get_bind()

    if "property_dedupe_reviews" in _tables(bind):
        op.drop_table("property_dedupe_reviews")
    if "listings" in _tables(bind):
        op.drop_table("listings")

    if "properties" in _tables(bind):
        indexes = _indexes(bind, "properties")
        if "ix_properties_address_norm" in indexes:
            op.drop_index("ix_properties_address_norm", table_name="properties")
        if "ix_properties_dedupe_key" in indexes:
            op.drop_index("ix_properties_dedupe_key", table_name="properties")
        with op.batch_alter_table("properties") as batch:
            for col in ("address_norm", "dedupe_key", "dedupe_type"):
                if col in _columns(bind, "properties"):
                    batch.drop_column(col)

    if "contracts" in _tables(bind):
        if "ix_contracts_kind" in _indexes(bind, "contracts"):
            op.drop_index("ix_contracts_kind", table_name="contracts")
        if "kind" in _columns(bind, "contracts"):
            with op.batch_alter_table("contracts") as batch:
                batch.drop_column("kind")

    if "broker_partners" in _tables(bind):
        with op.batch_alter_table("broker_partners") as batch:
            for col in (
                "listing_contract_id", "distributor_contract_id", "listing_active",
                "distributor_active", "broker_role", "kyc_verified_at", "kyc_status",
                "whatsapp", "line", "wechat", "real_name", "company_name",
            ):
                if col in _columns(bind, "broker_partners"):
                    batch.drop_column(col)