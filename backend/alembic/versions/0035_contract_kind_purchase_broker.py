"""合同类型 ContractKind 新增 purchase / broker

contracts.kind 列若为 PostgreSQL native enum（由 ContractKind 模型映射），
则为该 enum 类型补充 'purchase' / 'broker' 两个取值；若列为 VARCHAR/CHECK
约束存储，则本迁移不做任何变更（SQLite 同理）。探测 + IF NOT EXISTS，
可重复运行；power 无关紧要的既有取值不受影响。

Revision ID: 0035
Revises: 0034
Create Date: 2026-09-30
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers
revision = "0035"
down_revision = "0034"
branch_labels = None
depends_on = None

_ADDED_VALUES = ("purchase", "broker")


def _native_enum_name(bind):
    """返回 contracts.kind 的 native enum 类型名；非 native enum 或表不存在返回 None。"""
    try:
        columns = {c["name"]: c for c in sa.inspect(bind).get_columns("contracts")}
    except Exception:
        return None
    col = columns.get("kind")
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
    for value in _ADDED_VALUES:
        if value in existing:
            continue
        op.execute(
            sa.text(
                f"ALTER TYPE {enum_name} ADD VALUE IF NOT EXISTS :value"
            ).bindparams(value=value)
        )


def downgrade():
    # 移除 native enum 取值需重建类型，风险高且影响存量的既有取值；
    # 在 Postgres native enum 场景下这里不做破坏性回退，仅保留说明。
    pass