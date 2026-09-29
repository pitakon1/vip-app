"""电子合同签署入口：上传来源 + 免登录签署链接

- contracts 新增 `source`（generated/uploaded，区分平台生成与经纪人上传）与
  `created_by`（记录发起/上传人）。
- contract_parties 新增 `sign_token`（唯一索引，免登录签署令牌，签署后清空）、
  `sign_token_expires_at`（令牌有效期）、`declined_at` / `decline_reason`（拒签留痕）。

表/列/索引均先探测再执行，可重复运行；全新库在 0001 的 create_all 时随模型自动建出。

Revision ID: 0033
Revises: 0032
Create Date: 2026-09-29
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers
revision = "0033"
down_revision = "0032"
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

    # 1) contracts：来源 + 发起人
    if "contracts" in _tables(bind):
        _add_col(
            "contracts", "source", sa.String(32), nullable=False,
            server_default="generated",
        )
        _add_col("contracts", "created_by", sa.Uuid(), nullable=True)
        if "ix_contracts_source" not in _indexes(bind, "contracts"):
            op.create_index("ix_contracts_source", "contracts", ["source"])

    # 2) contract_parties：免登录签署令牌 + 拒签留痕
    if "contract_parties" in _tables(bind):
        _add_col("contract_parties", "sign_token", sa.String(64), nullable=True)
        _add_col(
            "contract_parties", "sign_token_expires_at", sa.DateTime(), nullable=True
        )
        _add_col("contract_parties", "declined_at", sa.DateTime(), nullable=True)
        _add_col("contract_parties", "decline_reason", sa.String(300), nullable=True)
        indexes = _indexes(bind, "contract_parties")
        if "ix_contract_parties_sign_token" not in indexes:
            op.create_index(
                "ix_contract_parties_sign_token",
                "contract_parties",
                ["sign_token"],
                unique=True,
            )


def downgrade():
    bind = op.get_bind()

    if "contract_parties" in _tables(bind):
        cols = _columns(bind, "contract_parties")
        if "ix_contract_parties_sign_token" in _indexes(bind, "contract_parties"):
            op.drop_index(
                "ix_contract_parties_sign_token", table_name="contract_parties"
            )
        for col in ("decline_reason", "declined_at", "sign_token_expires_at", "sign_token"):
            if col in cols:
                op.drop_column("contract_parties", col)

    if "contracts" in _tables(bind):
        cols = _columns(bind, "contracts")
        if "ix_contracts_source" in _indexes(bind, "contracts"):
            op.drop_index("ix_contracts_source", table_name="contracts")
        for col in ("created_by", "source"):
            if col in cols:
                op.drop_column("contracts", col)