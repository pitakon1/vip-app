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
    # 部门树：员工归属部门的结构化外键
    "employees": {
        "department_id": "uuid",
    },
    # 单据编号：对外可引用的稳定编号（历史 NULL 行由 backfill_serial_numbers 回填）
    "contracts": {"contract_no": "varchar(32)"},
    "leases": {"lease_no": "varchar(32)"},
    "payments": {"receipt_no": "varchar(32)"},
}

# 表 -> 需要建立索引的列（索引名按 SQLAlchemy 约定 ix_<table>_<column>）
_ADDITIVE_INDEXES: Dict[str, List[str]] = {
    "properties": ["orientation", "decoration", "listing_no"],
    "projects": ["developer_id", "tenure"],
    "listings": ["next_revalidate_at", "verification_status"],
    "employees": ["department_id"],
    "contracts": ["contract_no"],
    "leases": ["lease_no"],
    "payments": ["receipt_no"],
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


# 内置数据字典种子：(value, zh, en, th)；label 取 zh，多语言写进 label_i18n。
# 覆盖 C 端此前散落在 Python Enum / 前端 i18n 的四组枚举。
_OPTION_SEEDS: Dict[str, List[tuple]] = {
    "orientation": [
        ("north", "朝北", "North", "ทิศเหนือ"),
        ("south", "朝南", "South", "ทิศใต้"),
        ("east", "朝东", "East", "ทิศตะวันออก"),
        ("west", "朝西", "West", "ทิศตะวันตก"),
        ("northeast", "朝东北", "Northeast", "ทิศตะวันออกเฉียงเหนือ"),
        ("northwest", "朝西北", "Northwest", "ทิศตะวันตกเฉียงเหนือ"),
        ("southeast", "朝东南", "Southeast", "ทิศตะวันออกเฉียงใต้"),
        ("southwest", "朝西南", "Southwest", "ทิศตะวันตกเฉียงใต้"),
    ],
    "decoration": [
        ("bare", "毛坯", "Bare shell", "ห้องเปล่า"),
        ("simple", "简装", "Basic", "ตกแต่งพื้นฐาน"),
        ("standard", "精装", "Fully fitted", "ตกแต่งครบ"),
        ("luxury", "豪装", "Luxury", "ตกแต่งหรู"),
        ("fully_furnished", "带家具家电", "Furnished", "พร้อมเฟอร์นิเจอร์"),
    ],
    "amenity": [
        ("aircon", "空调", "Air conditioning", "เครื่องปรับอากาศ"),
        ("pool", "泳池", "Pool", "สระว่ายน้ำ"),
        ("gym", "健身房", "Gym", "ฟิตเนส"),
        ("parking", "停车位", "Parking", "ที่จอดรถ"),
        ("elevator", "电梯", "Elevator", "ลิฟต์"),
        ("balcony", "阳台", "Balcony", "ระเบียง"),
        ("garden", "花园/庭院", "Garden / yard", "สวน / ลาน"),
    ],
    "property_type": [
        ("apartment", "公寓", "Apartment", "อพาร์ตเมนต์"),
        ("condo", "公寓", "Condo", "คอนโด"),
        ("villa", "别墅", "Villa", "วิลล่า"),
        ("house", "别墅", "House", "บ้าน"),
        ("shop", "商铺", "Shop", "ร้านค้า"),
        ("commercial", "商铺", "Commercial", "พาณิชย์"),
        ("office", "写字楼", "Office", "สำนักงาน"),
        ("factory", "厂房", "Factory", "โรงงาน"),
    ],
}


def seed_options(engine: Engine) -> None:
    """幂等种子：把内置枚举灌入 `options`。

    **只补不缺**：已存在的 (type,value) 跳过，不覆盖后台对文案/排序/启停的改动——
    否则每次启动都会把管理员改过的文案冲回默认值。
    """
    from sqlmodel import Session, select

    from app.models import OptionItem

    created = 0
    with Session(engine) as session:
        for type_, entries in _OPTION_SEEDS.items():
            for sort, (value, zh, en, th) in enumerate(entries):
                existing = session.exec(
                    select(OptionItem).where(
                        OptionItem.type == type_, OptionItem.value == value
                    )
                ).first()
                if existing is not None:
                    continue
                session.add(
                    OptionItem(
                        type=type_,
                        value=value,
                        label=zh,
                        label_i18n={"zh": zh, "en": en, "th": th},
                        sort=sort,
                        is_active=True,
                        is_system=True,
                    )
                )
                created += 1
        session.commit()
    if created:
        logger.info("db.options.seeded", count=created)


def backfill_serial_numbers(engine: Engine) -> None:
    """为历史 NULL 单据编号回填（幂等，只补 NULL，按 created_at 升序）。

    四类单据：(properties.listing_no/FY、contracts.contract_no/HT、
    leases.lease_no/ZL、payments.receipt_no/SK)。回填用行自身 created_at 推周期，
    并推进同一 `serial_numbers` 游标，保证后续新单不会与历史号重号。

    分批提交，避免大表长事务；仅处理 NULL 行，重复启动无副作用。
    """
    from sqlalchemy import inspect as _inspect
    from sqlmodel import Session, select

    from app.services.serial_number import next_no, period_of
    from app.models import Contract, Lease, Payment, Property

    specs = [
        (Property, "listing_no", "FY"),
        (Contract, "contract_no", "HT"),
        (Lease, "lease_no", "ZL"),
        (Payment, "receipt_no", "SK"),
    ]

    inspector = _inspect(engine)
    existing_tables = set(inspector.get_table_names())
    total = 0

    for model, column, prefix in specs:
        table = model.__tablename__
        if table not in existing_tables:
            continue
        col = getattr(model, column)
        try:
            with Session(engine) as session:
                rows = session.exec(
                    select(model).where(col.is_(None)).order_by(model.created_at)
                ).all()
                for obj in rows:
                    setattr(obj, column, next_no(session, prefix, period_of(obj.created_at)))
                    session.add(obj)
                    total += 1
                session.commit()
        except Exception:
            logger.warning(
                "db.serial.backfill_failed", table=table, exc_info=True
            )
    if total:
        logger.info("db.serial.backfilled", count=total)
