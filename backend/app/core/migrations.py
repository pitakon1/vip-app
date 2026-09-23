"""轻量幂等数据库迁移。

**为什么不直接用 Alembic**：`backend/alembic/versions/` 为空，项目实际建表走
`SQLModel.metadata.create_all`（见 `app.db.init_db`）。而 `create_all` 只创建
**缺失的表**，对已存在的表**不会补列**——所以模型新增字段后，运行期查询会因
「no such column」直接 500。

本模块补上这一环：建缺失的表 + 给已有表补缺失的列与索引。

**所有操作都是幂等的**：先 inspect 判断存在性再执行，重复启动无副作用。
新增字段时只需往 `_ADDITIVE_COLUMNS` 里追加一行，不需要写迁移脚本文件。
"""
from typing import Dict, List

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine
from sqlmodel import SQLModel

from app.core.logging import get_logger

logger = get_logger(__name__)


def _dialect_types(engine: Engine) -> Dict[str, str]:
    """按方言给出 DDL 类型名。

    SQLite 与 PostgreSQL 在 UUID / 时间戳的类型名上不一致，`ALTER TABLE` 的
    类型必须写对，否则（尤其 PG）会建出错误列类型且难以回改。
    """
    if engine.dialect.name == "sqlite":
        return {
            "uuid": "CHAR(32)",
            "json": "JSON",
            "ts": "DATETIME",
            "float": "FLOAT",
        }
    return {
        "uuid": "UUID",
        "json": "JSONB",
        "ts": "TIMESTAMP",
        "float": "DOUBLE PRECISION",
    }


# 表 -> {列名: 类型键（见 _dialect_types）或直接 DDL 类型}
_ADDITIVE_COLUMNS: Dict[str, Dict[str, str]] = {
    # C 端决策必需字段：朝向 / 装修状况 / 配套设施 / 对外编号
    "properties": {
        "orientation": "varchar(20)",
        "decoration": "varchar(20)",
        "amenities": "json",
        "listing_no": "varchar(32)",
    },
    # 小区 C 端详情页参数 + 开发商实体外键 + 泰国产权合规字段
    "projects": {
        "developer_id": "uuid",
        "total_buildings": "integer",
        "total_floors": "integer",
        "parking_spaces": "integer",
        "management_fee_per_sqm": "float",
        "open_date": "ts",
        "avg_price": "float",
        "tenure": "varchar(20)",
        "foreign_quota_pct": "float",
        "payment_plan": "json",
    },
    # 真房源保鲜：上架单的核验时间轴与状态（见 models/verification.py）
    "listings": {
        "last_verified_at": "ts",
        "next_revalidate_at": "ts",
        "verification_status": "varchar(20)",
        "expired_at": "ts",
    },
}

# 表 -> 需要建立索引的列（索引名按 SQLAlchemy 约定 ix_<table>_<column>）
_ADDITIVE_INDEXES: Dict[str, List[str]] = {
    "properties": ["orientation", "decoration", "listing_no"],
    "projects": ["developer_id", "tenure"],
    "listings": ["next_revalidate_at", "verification_status"],
}


def ensure_schema(engine: Engine) -> None:
    """建缺失的表，并给已有表补齐缺失的列与索引（幂等）。"""
    # 延迟导入 models：`create_all` 只创建**已注册进 SQLModel.metadata** 的表，
    # 而模型是靠 `app.models` 的聚合导入完成注册的。缺了这一步，新模型（如
    # schools / developers）不会被建出来——表现为接口 500「no such table」。
    # 放在函数内而非模块顶层，避免与 app.models 之间形成导入顺序耦合。
    from app import models as _models  # noqa: F401

    # 1) 建新表：schools / developers 等本次新增的实体
    SQLModel.metadata.create_all(engine)

    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    type_map = _dialect_types(engine)
    added: List[str] = []
    indexed: List[str] = []

    with engine.begin() as conn:
        # 2) 补列：create_all 不会碰已存在的表
        for table, columns in _ADDITIVE_COLUMNS.items():
            if table not in existing_tables:
                # 表不存在时 create_all 已按模型全量建出，无需补
                continue
            present = {col["name"] for col in inspector.get_columns(table)}
            for column, type_key in columns.items():
                if column in present:
                    continue
                ddl_type = type_map.get(type_key, type_key)
                conn.execute(
                    text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl_type}")
                )
                # 同一轮内后续判断依据同步更新，避免重复 ADD COLUMN
                present.add(column)
                added.append(f"{table}.{column}")

        # 3) 补索引：新增的可筛选列没有索引会退化成全表扫描
        for table, columns in _ADDITIVE_INDEXES.items():
            if table not in existing_tables:
                continue
            for column in columns:
                index_name = f"ix_{table}_{column}"
                conn.execute(
                    text(
                        f"CREATE INDEX IF NOT EXISTS {index_name} "
                        f"ON {table} ({column})"
                    )
                )
                indexed.append(index_name)

    if added:
        logger.info("db.schema.columns_added", columns=added)
    if indexed:
        logger.info("db.schema.indexes_ensured", indexes=indexed)
