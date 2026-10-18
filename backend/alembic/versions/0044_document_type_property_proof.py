"""document type enum: add property_certificate / owner_id_card（业主上架证件）

Python 侧 DocumentType 新增 `property_certificate` / `owner_id_card`，用于业主上架
房源时强制上传的产权证与业主身份证明（复用 Document.property_id 关联到房源档案）。

documents.type 列在 PostgreSQL 上是**原生枚举**类型 `documenttype`（由 0001 的
create_all 建出），枚举类型不会随 create_all 变化，模型与库不同步会让写入这两个
取值直接报 `invalid input value for enum documenttype: "property_certificate"`。
SQLite 上同一列是 VARCHAR 且无 CHECK 约束，无需改动，故此处按方言分派。

`ALTER TYPE ... ADD VALUE` 必须在自动提交块中执行：事务内新增的枚举值不能在同一
事务里使用，且 PG 11 及更早版本不允许在事务块中新增枚举值。

Revision ID: 0044
Revises: 0043
Create Date: 2026-10-18
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers
revision = "0044"
down_revision = "0043"
branch_labels = None
depends_on = None

_ADDED_VALUES = ("property_certificate", "owner_id_card")


def _native_enum_name(bind):
    """返回 documents.type 的 native enum 类型名；非 native enum 或表不存在返回 None。"""
    try:
        columns = {c["name"]: c for c in sa.inspect(bind).get_columns("documents")}
    except Exception:
        return None
    col = columns.get("type")
    if col is None:
        return None
    typ = col["type"]
    if isinstance(typ, sa.Enum):
        name = getattr(typ, "name", None)
        return name or None
    return None


def upgrade():
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return  # SQLite/VARCHAR 无需迁移

    enum_name = _native_enum_name(bind)
    if not enum_name:
        return

    rows = bind.execute(
        sa.text(
            "SELECT enumlabel FROM pg_enum e "
            "JOIN pg_type t ON e.enumtypid = t.oid "
            "WHERE t.typname = :name"
        ).bindparams(name=enum_name)
    )
    existing = {r[0] for r in rows}
    pending = [v for v in _ADDED_VALUES if v not in existing]
    if not pending:
        return
    with op.get_context().autocommit_block():
        for value in pending:
            op.execute(
                f"ALTER TYPE {enum_name} ADD VALUE IF NOT EXISTS '{value}'"
            )


def downgrade():
    # 移除 native enum 取值需重建类型，风险高且影响存量的既有取值；
    # 在 Postgres native enum 场景下这里不做破坏性回退，仅保留说明。
    pass
