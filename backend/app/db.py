"""数据库连接模块。

使用 SQLModel 创建同步数据库引擎和会话。
支持 PostgreSQL（生产）和 SQLite（开发测试）。
"""
from typing import Generator

from sqlmodel import Session, SQLModel, create_engine

from app.config import settings

# 数据库 URL 处理
_db_url = settings.DATABASE_URL

if _db_url.startswith("sqlite"):
    # SQLite 模式（本地开发测试）
    engine = create_engine(
        _db_url,
        echo=settings.DEBUG,
        connect_args={"check_same_thread": False},
    )
else:
    # PostgreSQL 模式（生产）
    from sqlalchemy.pool import QueuePool
    _sync_url = _db_url.replace(
        "postgresql+asyncpg://", "postgresql+psycopg2://"
    )
    engine = create_engine(
        _sync_url,
        echo=settings.DEBUG,
        pool_pre_ping=True,
        poolclass=QueuePool,
        pool_size=settings.DB_POOL_SIZE,
        max_overflow=settings.DB_MAX_OVERFLOW,
    )


def get_session() -> Generator[Session, None, None]:
    """获取数据库会话依赖注入函数。

    用法:
        @app.get("/items")
        def list_items(session: Session = Depends(get_session)):
            ...
    """
    with Session(engine) as session:
        try:
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise


def init_db() -> None:
    """初始化数据库表（仅用于开发环境，生产环境使用 Alembic 迁移）。"""
    SQLModel.metadata.create_all(engine)
