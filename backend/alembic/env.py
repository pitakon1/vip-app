"""Alembic 环境配置。

基于 SQLModel.metadata + 同步 engine（psycopg2）执行迁移。
所有表模型通过导入 app.models 自动注册到 SQLModel.metadata。
"""
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from sqlmodel import SQLModel

# 导入所有模型，确保 SQLModel.metadata 包含全部表定义
import app.models  # noqa: F401
from app.config import settings

# Alembic 配置对象
config = context.config

# 从应用配置注入数据库 URL（覆盖 alembic.ini 中的空值）。
# 项目全量使用同步 Session，若 .env 里写的是 asyncpg 驱动则统一改写为 psycopg2。
_db_url = settings.DATABASE_URL.replace(
    "postgresql+asyncpg://", "postgresql+psycopg2://"
)
config.set_main_option("sqlalchemy.url", _db_url)

# 日志配置
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# 迁移目标元数据：SQLModel.metadata
target_metadata = SQLModel.metadata


def _is_sqlite(connection) -> bool:
    """SQLite 不支持大部分 ALTER TABLE，需走 batch（重建表）模式。"""
    return connection.dialect.name == "sqlite"


def run_migrations_offline() -> None:
    """离线模式：生成 SQL 脚本而不连接数据库。"""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        compare_server_default=True,
        # 让 autogenerate 能识别列类型/默认值变化，而不是把改动当噪声
        render_as_batch=url.startswith("sqlite"),
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection) -> None:
    """在已建立的连接上执行迁移。"""
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        compare_server_default=True,
        # SQLite 下启用 batch 模式，使 add_column/drop_column/alter_column 可执行
        render_as_batch=_is_sqlite(connection),
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """在线模式：使用同步 engine 建立连接并执行迁移。"""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
        future=True,
    )

    with connectable.connect() as connection:
        do_run_migrations(connection)

    connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
