"""add user_calendar_events table

新增用户自定义日程事件表：三端日历聚合 viewings / receivables / leases
之外，展示用户自行添加的自由日程（title + start_at），按 user_id 隔离，
软删除。复用探测式 op.create_table 建表，与 0029 风格一致：
表已存在则跳过，重复执行无副作用。

Revision ID: 0030
Revises: 0029
Create Date: 2026-09-29
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers
revision = "0030"
down_revision = "0029"
branch_labels = None
depends_on = None

_TABLE = "user_calendar_events"

_TIMESTAMP_COLUMNS = [
    sa.Column("created_at", sa.DateTime(), nullable=False),
    sa.Column("updated_at", sa.DateTime(), nullable=False),
    sa.Column("deleted_at", sa.DateTime(), nullable=True),
    sa.Column("metadata_", sa.JSON(), nullable=True),
    sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
]

_COLUMNS = [
    *_TIMESTAMP_COLUMNS,
    sa.Column("user_id", sa.Uuid(), nullable=False),
    sa.Column("title", sa.String(), nullable=False),
    sa.Column("start_at", sa.DateTime(), nullable=False),
    sa.Column("end_at", sa.DateTime(), nullable=True),
    sa.Column("all_day", sa.Boolean(), nullable=False),
    sa.Column("note", sa.String(), nullable=True),
]

_INDEXES = [
    "created_at",
    "deleted_at",
    "user_id",
    "start_at",
]


def upgrade():
    existing = set(sa.inspect(op.get_bind()).get_table_names())
    if _TABLE not in existing:
        op.create_table(
            _TABLE,
            sa.Column("id", sa.Uuid(), nullable=False),
            *_COLUMNS,
            sa.PrimaryKeyConstraint("id"),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_cal_user"),
        )
        op.create_index(f"ix_{_TABLE}_id", _TABLE, ["id"])
        for col in _INDEXES:
            op.create_index(f"ix_{_TABLE}_{col}", _TABLE, [col])


def downgrade():
    existing = set(sa.inspect(op.get_bind()).get_table_names())
    if _TABLE in existing:
        op.drop_table(_TABLE)