"""Redis 连接模块。

提供同步 Redis 客户端单例（Celery 任务及缓存模块使用）。
"""
from typing import Optional

from redis import Redis as SyncRedis

from app.config import settings

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
