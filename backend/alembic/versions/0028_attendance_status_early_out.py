"""attendance status enum: add early_out（早退）

Python 侧 AttendanceStatus 新增 `early_out`。该列在 PostgreSQL 上是**原生枚举
类型** `attendancestatus`（由 0001 的 create_all 建出），枚举类型不会随
create_all 变化，模型与库不同步会让写入早退状态直接报
`invalid input value for enum attendancestatus: "early_out"`。
SQLite 上同一列是 VARCHAR(10) 且无 CHECK 约束，无需改动，故此处按方言分派。

`ALTER TYPE ... ADD VALUE` 必须在自动提交块中执行：事务内新增的枚举值不能在同
一事务里使用，且 PG 11 及更早版本不允许在事务块中新增枚举值。

Revision ID: 0028
Revises: 0027
Create Date: 2026-09-26
"""
from alembic import op

# revision identifiers
revision = "0028"
down_revision = "0027"
branch_labels = None
depends_on = None

# 类型名由 SQLAlchemy 按枚举类名推导（AttendanceStatus -> attendancestatus）
_ENUM_NAME = "attendancestatus"
_VALUE = "early_out"


def upgrade():
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    rows = bind.exec_driver_sql(
        "SELECT e.enumlabel FROM pg_type t "
        "LEFT JOIN pg_enum e ON e.enumtypid = t.oid "
        "WHERE t.typname = %s",
        (_ENUM_NAME,),
    ).fetchall()
    if not rows:
        # 枚举类型尚不存在（该库还没建 attendances 表），不需要处理
        return
    if any(r[0] == _VALUE for r in rows):
        return
    with op.get_context().autocommit_block():
        op.execute(f"ALTER TYPE {_ENUM_NAME} ADD VALUE IF NOT EXISTS '{_VALUE}'")


def downgrade():
    # PG 不支持删除枚举值，且保留该值对旧代码无影响，故不做还原
    pass