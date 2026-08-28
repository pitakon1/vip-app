"""轻量 Redis 缓存工具。

为热点只读接口提供 JSON 序列化的缓存读写与失效能力。
- 序列化支持 datetime / UUID / Enum / SQLModel 对象
- Redis 不可用时自动降级（直接读写 DB，不影响业务）
"""
import json
from datetime import date, datetime
from enum import Enum
from typing import Any, Iterable, Optional
from uuid import UUID

from app.redis_client import get_redis_sync


def _default_serializer(obj: Any) -> Any:
    """将非 JSON 原生类型转为可序列化值。"""
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    if isinstance(obj, UUID):
        return str(obj)
    if isinstance(obj, Enum):
        return obj.value
    if hasattr(obj, "model_dump"):
        return obj.model_dump()
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")


def get_cache(key: str) -> Optional[Any]:
    """读取缓存，未命中或异常返回 None。"""
    try:
        raw = get_redis_sync().get(key)
        if raw is None:
            return None
        return json.loads(raw)
    except Exception:
        return None


def set_cache(key: str, value: Any, ttl: int) -> None:
    """写入缓存（TTL 秒）。Redis 异常时静默降级。"""
    try:
        get_redis_sync().set(
            key, json.dumps(value, default=_default_serializer), ex=ttl
        )
    except Exception:
        pass


def delete_cache_pattern(pattern: str) -> None:
    """按 key 模式批量删除缓存（用于写操作后失效相关读缓存）。"""
    try:
        redis = get_redis_sync()
        keys: Iterable[bytes] = redis.scan_iter(match=pattern, count=100)
        for key in keys:
            redis.delete(key)
    except Exception:
        pass
