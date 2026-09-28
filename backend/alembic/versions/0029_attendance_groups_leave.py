"""attendance: 考勤组 / 考勤组成员 / 假勤申请

P1 对齐企业微信的三块能力：
- `attendance_groups`      多办公点 / 多班次的一套独立规则（坐标、半径、作息、宽限、时区）
- `attendance_group_members` 把员工显式指定到某考勤组（优先于按部门归属）
- `leave_requests`         假勤（请假）申请，审批通过后按区间写 Attendance(status=leave)

这三张表在开发/测试环境由 `SQLModel.metadata.create_all` 建出，生产环境依赖本迁移，
故迁移写成探测式：表已存在则跳过，重复执行无副作用。

`leave_type` / `status` 两列在 PostgreSQL 上是**原生枚举类型**（leavetype /
leavestatus）。这里显式声明同样的 sa.Enum，让首次执行时自动建出枚举类型；
若库中已由 create_all 建好表，本迁移整体跳过，不会产生类型冲突。

Revision ID: 0029
Revises: 0028
Create Date: 2026-09-26
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers
revision = "0029"
down_revision = "0028"
branch_labels = None
depends_on = None

_GROUP_TABLE = "attendance_groups"
_MEMBER_TABLE = "attendance_group_members"
_LEAVE_TABLE = "leave_requests"

_TIMESTAMP_COLUMNS = [
    sa.Column("created_at", sa.DateTime(), nullable=False),
    sa.Column("updated_at", sa.DateTime(), nullable=False),
    sa.Column("deleted_at", sa.DateTime(), nullable=True),
    sa.Column("metadata_", sa.JSON(), nullable=True),
    sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
]

_GROUP_COLUMNS = [
    *_TIMESTAMP_COLUMNS,
    sa.Column("name", sa.String(length=80), nullable=False),
    sa.Column("description", sa.String(length=255), nullable=True),
    sa.Column("office_lat", sa.Float(), nullable=False),
    sa.Column("office_lng", sa.Float(), nullable=False),
    sa.Column("radius_km", sa.Float(), nullable=False),
    sa.Column("utc_offset_hours", sa.Float(), nullable=False),
    sa.Column("work_start", sa.String(length=5), nullable=False),
    sa.Column("work_end", sa.String(length=5), nullable=False),
    sa.Column("late_grace_minutes", sa.Integer(), nullable=False),
    sa.Column("early_grace_minutes", sa.Integer(), nullable=False),
    sa.Column("department", sa.String(length=80), nullable=True),
    sa.Column("is_default", sa.Boolean(), nullable=False),
    sa.Column("is_active", sa.Boolean(), nullable=False),
]

_GROUP_INDEXES = [
    "created_at",
    "deleted_at",
    "name",
    "department",
    "is_default",
    "is_active",
]

_MEMBER_COLUMNS = [
    *_TIMESTAMP_COLUMNS,
    sa.Column("group_id", sa.Uuid(), nullable=False),
    sa.Column("employee_id", sa.Uuid(), nullable=False),
]

_MEMBER_INDEXES = ["created_at", "deleted_at", "group_id", "employee_id"]

_LEAVE_COLUMNS = [
    *_TIMESTAMP_COLUMNS,
    sa.Column("employee_id", sa.Uuid(), nullable=False),
    sa.Column(
        "leave_type",
        sa.Enum(
            "annual",
            "sick",
            "personal",
            "unpaid",
            "maternity",
            "other",
            name="leavetype",
        ),
        nullable=False,
    ),
    sa.Column("start_date", sa.Date(), nullable=False),
    sa.Column("end_date", sa.Date(), nullable=False),
    sa.Column("days", sa.Float(), nullable=False),
    sa.Column("reason", sa.String(length=500), nullable=False),
    sa.Column(
        "status",
        sa.Enum("pending", "approved", "rejected", "cancelled", name="leavestatus"),
        nullable=False,
    ),
    sa.Column("approved_by", sa.Uuid(), nullable=True),
    sa.Column("approved_at", sa.DateTime(), nullable=True),
    sa.Column("reply_note", sa.String(length=255), nullable=True),
]

_LEAVE_INDEXES = [
    "created_at",
    "deleted_at",
    "employee_id",
    "leave_type",
    "start_date",
    "end_date",
    "status",
]


def _create_table(table: str, columns: list, indexes: list, constraints: list) -> None:
    op.create_table(table, sa.Column("id", sa.Uuid(), nullable=False), *columns, *constraints)
    op.create_index(f"ix_{table}_id", table, ["id"])
    for col in indexes:
        op.create_index(f"ix_{table}_{col}", table, [col])


def upgrade():
    existing = set(sa.inspect(op.get_bind()).get_table_names())

    if _GROUP_TABLE not in existing:
        _create_table(
            _GROUP_TABLE,
            _GROUP_COLUMNS,
            _GROUP_INDEXES,
            [sa.PrimaryKeyConstraint("id")],
        )

    if _MEMBER_TABLE not in existing:
        _create_table(
            _MEMBER_TABLE,
            _MEMBER_COLUMNS,
            _MEMBER_INDEXES,
            [
                sa.PrimaryKeyConstraint("id"),
                sa.ForeignKeyConstraint(
                    ["group_id"], [f"{_GROUP_TABLE}.id"], name="fk_agm_group"
                ),
                sa.ForeignKeyConstraint(
                    ["employee_id"], ["employees.id"], name="fk_agm_employee"
                ),
            ],
        )

    if _LEAVE_TABLE not in existing:
        _create_table(
            _LEAVE_TABLE,
            _LEAVE_COLUMNS,
            _LEAVE_INDEXES,
            [
                sa.PrimaryKeyConstraint("id"),
                sa.ForeignKeyConstraint(
                    ["employee_id"], ["employees.id"], name="fk_leave_employee"
                ),
                sa.ForeignKeyConstraint(
                    ["approved_by"], ["users.id"], name="fk_leave_approver"
                ),
            ],
        )


def downgrade():
    existing = set(sa.inspect(op.get_bind()).get_table_names())
    # 后建先删：成员表对考勤组有外键
    for table in (_MEMBER_TABLE, _LEAVE_TABLE, _GROUP_TABLE):
        if table in existing:
            op.drop_table(table)
    # 枚举类型在 PG 上不会随 drop_table 删除；保留无副作用（重新 upgrade 会复用）