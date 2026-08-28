"""Alembic 环境配置。

基于 SQLModel.metadata + async engine 实现异步迁移。
所有表模型通过导入 app.models 自动注册到 SQLModel.metadata。
"""
import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool
from sqlalchemy.ext.asyncio import async_engine_from_config

from sqlmodel import SQLModel

# 导入所有模型，确保 SQLModel.metadata 包含全部表定义
import app.models  # noqa: F401
from app.config import settings

# Alembic 配置对象
config = context.config

# 从应用配置注入数据库 URL（覆盖 alembic.ini 中的空值）
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

# 日志配置
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# 迁移目标元数据：SQLModel.metadata
target_metadata = SQLModel.metadata


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
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """在线模式（异步）：使用 async engine 建立连接并执行迁移。"""
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
        future=True,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    """在线模式入口：根据驱动选择同步或异步执行。"""
    url = config.get_main_option("sqlalchemy.url") or ""
    # DATABASE_URL 使用 asyncpg 驱动时，走异步迁移路径
    if url.startswith("postgresql+asyncpg"):
        asyncio.run(run_async_migrations())
        return

    # 同步驱动回退路径
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
