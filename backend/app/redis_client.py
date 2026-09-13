"""Redis 连接模块。

创建 Redis 连接池和依赖注入函数。
"""
from typing import AsyncGenerator, Optional

import redis.asyncio as redis
from redis import Redis as SyncRedis

from app.config import settings

# 创建 Redis 连接池（Redis 不可用时快速失败降级，不阻塞业务）
redis_pool = redis.ConnectionPool.from_url(
    settings.REDIS_URL,
    max_connections=20,
    decode_responses=True,
    socket_connect_timeout=1,
    socket_timeout=1,
)


def get_redis() -> redis.Redis:
    """获取 Redis 客户端依赖注入函数。

    用法:
        @app.get("/cache")
        async def get_cache(redis: redis.Redis = Depends(get_redis)):
            ...
    """
    return redis.Redis(connection_pool=redis_pool)


async def get_redis_async() -> AsyncGenerator[redis.Redis, None]:
    """获取 Redis 客户端异步依赖注入函数（自动管理连接生命周期）。"""
    client = redis.Redis(connection_pool=redis_pool)
    try:
        yield client
    finally:
        await client.aclose()


# 同步 Redis 客户端单例（Celery 任务使用）
_sync_redis: Optional[SyncRedis] = None


def get_redis_sync() -> SyncRedis:
    """获取同步 Redis 客户端单例（供 Celery 任务使用）。Redis 不可用时快速失败降级。"""
    global _sync_redis
    if _sync_redis is None:
        _sync_redis = SyncRedis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            socket_connect_timeout=1,
            socket_timeout=1,
        )
    return _sync_redis
