"""add attendance_appeals table

新增打卡异常申诉表：员工对某天迟到/早退/缺勤记录发起申诉（附理由），
管理员/代理审批。审批通过不直接改 attendances.status，只留痕，避免与
考勤校准对主状态的双写冲突。复用探测式 op.create_table，表已存在则跳过。

Revision ID: 0031
Revises: 0030
Create Date: 2026-09-29
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers
revision = "0031"
down_revision = "0030"
branch_labels = None
depends_on = None

_TABLE = "attendance_appeals"

_TIMESTAMP_COLUMNS = [
    sa.Column("created_at", sa.DateTime(), nullable=False),
    sa.Column("updated_at", sa.DateTime(), nullable=False),
    sa.Column("deleted_at", sa.DateTime(), nullable=True),
    sa.Column("metadata_", sa.JSON(), nullable=True),
    sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
]

_COLUMNS = [
    *_TIMESTAMP_COLUMNS,
    sa.Column("employee_id", sa.Uuid(), nullable=False),
    sa.Column("attendance_id", sa.Uuid(), nullable=True),
    sa.Column("date", sa.Date(), nullable=False),
    sa.Column("reason", sa.String(), nullable=False),
    sa.Column("status", sa.String(), nullable=False),
    sa.Column("reply_note", sa.String(), nullable=True),
    sa.Column("approved_by", sa.Uuid(), nullable=True),
    sa.Column("approved_at", sa.DateTime(), nullable=True),
]

_INDEXES = [
    "created_at",
    "deleted_at",
    "employee_id",
    "date",
    "status",
]


def upgrade():
    existing = set(sa.inspect(op.get_bind()).get_table_names())
    if _TABLE not in existing:
        op.create_table(
            _TABLE,
            sa.Column("id", sa.Uuid(), nullable=False),
            *_COLUMNS,
            sa.PrimaryKeyConstraint("id"),
            sa.ForeignKeyConstraint(["employee_id"], ["employees.id"], name="fk_appeal_employee"),
            sa.ForeignKeyConstraint(["attendance_id"], ["attendances.id"], name="fk_appeal_attendance"),
            sa.ForeignKeyConstraint(["approved_by"], ["users.id"], name="fk_appeal_approver"),
        )
        op.create_index(f"ix_{_TABLE}_id", _TABLE, ["id"])
        for col in _INDEXES:
            op.create_index(f"ix_{_TABLE}_{col}", _TABLE, [col])


def downgrade():
    existing = set(sa.inspect(op.get_bind()).get_table_names())
    if _TABLE in existing:
        op.drop_table(_TABLE)