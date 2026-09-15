"""全局异常处理器：统一错误响应结构。

响应体形如::

    {"detail": "会话不存在", "code": "NOT_FOUND", "message": "会话不存在",
     "request_id": "..."}

- `detail` 保持字符串（三端前端都读 `response.data.detail` 并直接展示，
  若改成对象会显示成 [object Object]）；
- `code`/`message` 为新增字段，供客户端做机器判断；
- `request_id` 便于把用户报错与服务端日志对上。
"""
from __future__ import annotations

import json

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.logging import get_logger
from app.core.metrics import observe_exception

logger = get_logger(__name__)


def _request_id(request: Request) -> str | None:
    return getattr(request.state, "request_id", None)


def _error_response(
    request: Request, status_code: int, message: str, code: str
) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={
            "detail": message,
            "code": code,
            "message": message,
            "request_id": _request_id(request),
        },
    )


def _split_detail(detail) -> tuple[str, str]:
    """把 FastAPI 的 detail 归一化成 (message, code)。"""
    if isinstance(detail, dict):
        message = str(detail.get("message") or detail.get("detail") or detail)
        code = str(detail.get("code") or "HTTP_ERROR")
        return message, code
    if isinstance(detail, list):
        # 校验错误列表，取第一条做可读摘要
        return str(detail[0]) if detail else "请求参数不合法", "VALIDATION_ERROR"
    return str(detail), "HTTP_ERROR"


def rate_limited_response(request: Request) -> JSONResponse:
    """429 响应。

    限流中间件在路由之前触发，此时异常不会被 ExceptionMiddleware 捕获，
    因此中间件与异常处理器共用这个构造函数，保证响应体结构一致。
    """
    return _error_response(request, 429, "请求过于频繁，请稍后再试", "RATE_LIMITED")


def register_exception_handlers(app: FastAPI) -> None:
    """注册全部全局异常处理器。"""

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException):
        message, code = _split_detail(exc.detail)
        return _error_response(request, exc.status_code, message, code)

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        request: Request, exc: RequestValidationError
    ):
        errors = exc.errors()
        if errors:
            first = errors[0]
            loc = ".".join(str(p) for p in first.get("loc", ()) if p != "body")
            message = (
                f"{loc}: {first.get('msg', '校验失败')}"
                if loc
                else str(first.get("msg", "校验失败"))
            )
        else:
            message = "请求参数不合法"
        # 额外保留完整错误列表，便于前端逐字段定位
        return JSONResponse(
            status_code=422,
            content={
                "detail": message,
                "code": "VALIDATION_ERROR",
                "message": message,
                "request_id": _request_id(request),
                "errors": json.loads(json.dumps(errors, default=str)),
            },
        )

    @app.exception_handler(RateLimitExceeded)
    async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
        logger.warning("http.rate_limited", path=request.url.path)
        return rate_limited_response(request)

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        # 内部错误详情只进日志，响应体不暴露堆栈
        observe_exception(request, exc)
        logger.error(
            "http.unhandled_exception",
            path=request.url.path,
            method=request.method,
            error=str(exc),
            exc_info=True,
        )
        return _error_response(request, 500, "服务器内部错误，请稍后重试", "INTERNAL_ERROR")