"""verification_codes + users.phone unique + users.wechat_openid

全端注册覆盖：
- 新增 verification_codes 表（手机号/邮箱验证码，存 SHA-256 哈希）。
- users.phone 唯一索引（手机号注册/登录查重，同一手机号只能对应一个账号；
  SQLite/PostgreSQL 对 NULL 手机号不会冲突，历史上邮箱注册的用户不受影响）。
- users 新增 wechat_openid 列（小程序微信登录态），加唯一索引。

表/列均先探测再执行，可重复运行；全新库会由 0001 的 create_all 随模型统一建出。

Revision ID: 0019
Revises: 0018
Create Date: 2026-09-20
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers
revision = "0019"
down_revision = "0018"
branch_labels = None
depends_on = None

_TABLE = "verification_codes"


def _tables(bind) -> set:
    return set(sa.inspect(bind).get_table_names())


def _columns(bind, table) -> set:
    return {c["name"] for c in sa.inspect(bind).get_columns(table)}


def _indexes(bind, table) -> set:
    return {i["name"] for i in sa.inspect(bind).get_indexes(table)}


def upgrade():
    bind = op.get_bind()

    # 1) verification_codes 表
    if _TABLE not in _tables(bind):
        op.create_table(
            _TABLE,
            sa.Column("id", sa.CHAR(32), primary_key=True),
            sa.Column("recipient", sa.String(255), nullable=False),
            sa.Column("channel", sa.String(16), nullable=False, server_default="sms"),
            sa.Column("code_hash", sa.String(64), nullable=False),
            sa.Column("expires_at", sa.DateTime(), nullable=False),
            sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("used_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.Column("deleted_at", sa.DateTime(), nullable=True),
            sa.Column(
                "metadata_",
                sa.JSON(),
                nullable=True,
                comment="扩展元数据",
            ),
            sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        )
        op.create_index("ix_verification_codes_recipient", _TABLE, ["recipient"])
        op.create_index("ix_verification_codes_channel", _TABLE, ["channel"])
        op.create_index("ix_verification_codes_id", _TABLE, ["id"])
        op.create_index("ix_verification_codes_created_at", _TABLE, ["created_at"])

    # 2) users.phone 唯一索引
    if "users" in _tables(bind) and (
        "phone" in _columns(bind, "users")
        and "uq_users_phone" not in _indexes(bind, "users")
    ):
        op.create_index("uq_users_phone", "users", ["phone"], unique=True)

    # 3) users.wechat_openid 列 + 唯一索引
    if "users" in _tables(bind):
        if "wechat_openid" not in _columns(bind, "users"):
            op.add_column(
                "users",
                sa.Column("wechat_openid", sa.String(128), nullable=True),
            )
        if "ix_users_wechat_openid" not in _indexes(bind, "users"):
            op.create_index("ix_users_wechat_openid", "users", ["wechat_openid"])


def downgrade():
    bind = op.get_bind()
    if _TABLE in _tables(bind):
        op.drop_table(_TABLE)
    if "users" in _tables(bind):
        if "uq_users_phone" in _indexes(bind, "users"):
            op.drop_index("uq_users_phone", table_name="users")
        if "ix_users_wechat_openid" in _indexes(bind, "users"):
            op.drop_index("ix_users_wechat_openid", table_name="users")
        if "wechat_openid" in _columns(bind, "users"):
            with op.batch_alter_table("users") as batch:
                batch.drop_column("wechat_openid")