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
            # 连接超时收紧到 0.5s：Redis 是软依赖，不可用时应快速降级。
            # 原先 1s 在 localhost 双栈（IPv6+IPv4）下会累计约 2s，
            # 而权限校验每个请求读写各一次，会把接口拖慢约 4s。
            socket_connect_timeout=0.5,
            socket_timeout=1,
        )
    return _sync_redis
