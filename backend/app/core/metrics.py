"""Prometheus 指标埋点。

此前 `/metrics` 只调用 `generate_latest()`，但全项目没有任何 Counter/Histogram 定义，
导出结果恒为空。这里定义 HTTP 层基础指标，并在 `app.main` 挂上中间件采集。

标签基数控制：`path` 使用路由模板（如 `/api/v1/properties/{property_id}`）而不是
真实 URL，避免每个 id 都产生一个新时间序列。
"""
import time

from fastapi import Request
from prometheus_client import Counter, Histogram

HTTP_REQUESTS_TOTAL = Counter(
    "http_requests_total",
    "HTTP 请求总数",
    ["method", "path", "status"],
)

HTTP_REQUEST_DURATION = Histogram(
    "http_request_duration_seconds",
    "HTTP 请求处理耗时（秒）",
    ["method", "path"],
    buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0),
)

HTTP_EXCEPTIONS_TOTAL = Counter(
    "http_exceptions_total",
    "未处理异常总数",
    ["method", "path", "exception"],
)

# 不需要计入指标的路径（监控自身与静态资源）
_SKIP_PATHS = ("/metrics", "/favicon.ico")


def route_path(request: Request) -> str:
    """取路由模板作为标签值；未匹配到路由（404）时归入 unmatched。"""
    route = request.scope.get("route")
    return getattr(route, "path", None) or "unmatched"


def observe(request: Request, status_code: int, duration: float) -> None:
    path = route_path(request)
    if path in _SKIP_PATHS:
        return
    method = request.method
    HTTP_REQUESTS_TOTAL.labels(method=method, path=path, status=str(status_code)).inc()
    HTTP_REQUEST_DURATION.labels(method=method, path=path).observe(duration)


def observe_exception(request: Request, exc: BaseException) -> None:
    path = route_path(request)
    HTTP_EXCEPTIONS_TOTAL.labels(
        method=request.method, path=path, exception=type(exc).__name__
    ).inc()


def timer() -> float:
    return time.perf_counter()