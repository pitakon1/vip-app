"""API 速率限制配置。

此前该模块只定义了 `limiter` 但从未在任何地方使用，等于完全没限流：
登录/注册等凭证接口可被无限次爆破。现在：

- `app.main` 注册限流中间件执行「全局默认限额」（见 `apply_default_limit`）；
- 敏感/高开销接口用 `@limiter.limit(...)` 叠加更严格的限额。

存储说明：多 worker 生产环境必须用 Redis，否则每个 worker 各算一份配额。
"""
from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import settings


def client_key(request: Request) -> str:
    """限流维度标识。

    服务部署在 Nginx 之后，`request.client.host` 会是反代地址（所有请求同 IP，
    全局限流会退化成"所有人共享一份配额"），因此优先取 X-Forwarded-For 首个地址。
    """
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        first = forwarded.split(",")[0].strip()
        if first:
            return first
    return get_remote_address(request)


def _storage_uri() -> str:
    """限流计数器存储地址。

    - 显式配置 RATE_LIMIT_STORAGE_URI 时优先使用；
    - DEBUG（本地开发，通常没有 Redis）用进程内存，避免未启动 Redis 时全部请求失败；
    - 生产用 Redis，使多 worker 共享同一份配额。
    """
    if settings.RATE_LIMIT_STORAGE_URI:
        return settings.RATE_LIMIT_STORAGE_URI
    return "memory://" if settings.DEBUG else settings.REDIS_URL


_default_limits = [settings.RATE_LIMIT_DEFAULT] if settings.RATE_LIMIT_DEFAULT else []

limiter = Limiter(
    key_func=client_key,
    default_limits=_default_limits,
    storage_uri=_storage_uri(),
    enabled=settings.RATE_LIMIT_ENABLED,
    # 存储（Redis）不可用时放行：限流是保护措施，不应因限流组件自身故障把 API 变成 500
    swallow_errors=True,
)

# 凭证类接口（登录/注册/刷新）使用的限额字符串
AUTH_LIMIT = settings.RATE_LIMIT_AUTH


def apply_default_limit(request: Request) -> None:
    """对当前请求执行全局默认限额，超限抛 `RateLimitExceeded`。

    不使用 slowapi 自带的 `SlowAPIMiddleware`：它靠 `route.endpoint` 定位处理函数，
    而 FastAPI 0.141 起 `include_router` 注册的是 `_IncludedRouter`（没有 `endpoint`
    属性），于是所有被 include 的路由都被判定为"无需限流"而静默跳过——
    实测只有直接挂在 app 上的路由会生效，本项目的 API 全部走 include_router。

    这里把 handler 传 None，只让 limiter 应用全局默认限额；带 `@limiter.limit`
    的路由由装饰器自行校验，两者互不影响（装饰器会用 request.state 去重）。

    存储（Redis）不可用时由 limiter 的 `swallow_errors` 放行（见上方构造参数）。
    """
    limiter._check_request_limit(request, None, True)