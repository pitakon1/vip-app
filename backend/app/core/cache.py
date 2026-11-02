"""轻量 Redis 缓存工具。

为热点只读接口提供 JSON 序列化的缓存读写与失效能力。
- 序列化支持 datetime / UUID / Enum / SQLModel 对象
- Redis 不可用时自动降级（直接读写 DB，不影响业务）

**日志约定**：缓存读写失败可以静默降级（业务不受影响），但
`delete_cache_pattern` 失败**必须记日志**——写操作后失效失败会留下脏缓存，
且 TTL 到期前无人能察觉。这里曾经是三个 `except Exception: pass`，
导致「数据不对」类问题完全无法排查。
"""
import json
import time
from datetime import date, datetime
from enum import Enum
from typing import Any, Iterable, Optional
from uuid import UUID

from app.core.logging import get_logger
from app.redis_client import get_redis_sync

logger = get_logger(__name__)

# Redis 不可用时的熔断窗口（秒）。
# 缓存是软依赖：连接失败时同步客户端每次尝试都要等连接超时（本机 IPv6+IPv4
# 双栈各一次，约 2s）。权限校验（require_permission）每个请求都会「读缓存 +
# 写缓存」，Redis 掉线时单个接口就会被拖慢约 4s，表现为「切页一直转圈」。
# 这里在首次失败后直接熔断一段时间，期间所有缓存读写立即降级回源，
# 避免每个请求都重复支付连接超时；窗口结束再放一次探测，自动恢复缓存。
_CIRCUIT_COOLDOWN = 60.0
_circuit_open_until = 0.0


def _circuit_open() -> bool:
    """当前是否处于 Redis 熔断窗口。"""
    return time.monotonic() < _circuit_open_until


def _trip_circuit() -> None:
    """标记 Redis 不可用并开启熔断窗口（只记录一次，避免刷日志）。"""
    global _circuit_open_until
    if not _circuit_open():
        logger.warning("cache.redis_unavailable", cooldown_s=_CIRCUIT_COOLDOWN)
    _circuit_open_until = time.monotonic() + _CIRCUIT_COOLDOWN


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
    if _circuit_open():
        return None
    try:
        raw = get_redis_sync().get(key)
        if raw is None:
            return None
        return json.loads(raw)
    except Exception:
        # 读失败降级为回源查库，业务无感，无需告警
        _trip_circuit()
        return None


def set_cache(key: str, value: Any, ttl: int) -> None:
    """写入缓存（TTL 秒）。Redis 异常时静默降级。"""
    if _circuit_open():
        return
    try:
        get_redis_sync().set(
            key, json.dumps(value, default=_default_serializer), ex=ttl
        )
    except Exception:
        # 写失败只是没有缓存，不影响正确性
        _trip_circuit()


def delete_cache_pattern(pattern: str) -> None:
    """按 key 模式批量删除缓存（用于写操作后失效相关读缓存）。

    失效失败**必须留痕**：此时缓存里仍是旧数据，TTL 到期前用户会看到过期内容，
    而调用方已经返回成功。没有日志的话这类问题无法定位。

    用 `scan_iter` 而非 `KEYS`：`KEYS` 会阻塞 Redis 单线程，key 一多就是线上事故。
    """
    try:
        if _circuit_open():
            # 熔断期间 Redis 不可用，缓存本就不存在，无需失效；跳过避免写接口被拖慢
            return
        redis = get_redis_sync()
        keys: Iterable[bytes] = redis.scan_iter(match=pattern, count=500)
        for key in keys:
            redis.delete(key)
    except Exception:
        _trip_circuit()
        logger.warning("cache.invalidate_failed", pattern=pattern, exc_info=True)


def invalidate_aggregate_caches() -> None:
    """失效聚合看板缓存（房源/售单写操作后必须调用）。

    `dashboard` 与 `operations` 两个概览接口缓存的是「房源总数 / 空置 / 已出租 /
    即将到期」这类统计口径。任何一条房源或售单变更都会让它们失真，而它们的 key
    此前不在任何失效模式里，只能等 60 秒 TTL 自然过期——用户改完房源立刻回看板
    会看到旧数字，很容易误判为保存失败。

    注意两个 key 的前缀**不一致**（历史原因，别合并）：
    dashboard 是 `cache:dashboard:summary`，operations 是 `operations:overview`。
    """
    delete_cache_pattern("cache:dashboard:*")
    delete_cache_pattern("operations:*")
