"""统一返回信封中间件。

对标参考项目（房少 ERP）的 `return_msg($code, $msg, $data)`：所有**成功**的
JSON 响应统一包裹成::

    {"code": 0, "msg": "ok", "data": <原响应体>}

并在响应头写入 `X-Api-Envelope: 1`，供三端在各自的中心 HTTP 层做**单点解包**
（详见 frontend-web / mobile-app / miniapp 的 `lib/api`）。

为什么用「响应头 + 形状」双条件而不是无条件包裹后靠字段猜：
- 存量响应体里有少量结构本身带 `code` 字段的（如错误体），若客户端靠「有没有
  code 字段」判断信封，会把错误体误判成信封；用显式响应头零歧义。
- 错误响应（>=400）不走本中间件，客户端仍按既有 `detail`/`message` 读取，
  保证三端错误处理逻辑零改动。

**必须跳过**的响应：
- `/health*`（探针）、`/docs` `/redoc` `/openapi.json`（文档）、`/metrics`（指标）、
  `/uploads*`（静态媒体）——这些是基础设施响应，不应被业务信封污染；
- 所有非 `application/json` 的响应（FileResponse / StreamingResponse / 纯文本 /
  blob 导出）——由 Content-Type 自动命中跳过，无需逐端点维护清单。
"""
from __future__ import annotations

import json

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.core.logging import get_logger

logger = get_logger(__name__)

# 前缀匹配的跳过清单（基础设施与静态媒体）
_SKIP_PREFIXES = (
    "/health",
    "/docs",
    "/redoc",
    "/openapi.json",
    "/uploads",
    "/metrics",
)

# 成功信封的响应头标记：三端据此单点解包
ENVELOPE_HEADER = "X-Api-Envelope"


def _is_skip_path(path: str) -> bool:
    return any(path.startswith(prefix) for prefix in _SKIP_PREFIXES)


class EnvelopeMiddleware(BaseHTTPMiddleware):
    """把成功的 JSON 响应包裹成 `{code, msg, data}`。"""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)

        # CORS 预检不经过业务，直接放行
        if request.method == "OPTIONS":
            return response
        # 错误响应保留既有结构（detail/message/request_id），不包裹
        if response.status_code >= 400:
            return response
        if _is_skip_path(request.url.path):
            return response
        if "application/json" not in response.headers.get("content-type", "").lower():
            return response

        # BaseHTTPMiddleware 的响应体是流式的，需一次性取出后再决定是否包裹
        chunks: list[bytes] = []
        async for chunk in response.body_iterator:
            chunks.append(chunk if isinstance(chunk, bytes) else str(chunk).encode("utf-8"))
        raw = b"".join(chunks)

        headers = dict(response.headers)
        headers.pop("content-length", None)

        try:
            parsed = json.loads(raw.decode("utf-8")) if raw else None
        except (ValueError, UnicodeDecodeError):
            # Content-Type 写着 JSON 但实际不是合法 JSON：原样透传，避免把坏响应吞掉
            logger.warning("envelope.body_not_json", path=request.url.path)
            return Response(
                content=raw,
                status_code=response.status_code,
                headers=headers,
                media_type=response.headers.get("content-type"),
            )

        body = json.dumps(
            {"code": 0, "msg": "ok", "data": parsed}, ensure_ascii=False
        ).encode("utf-8")
        headers[ENVELOPE_HEADER] = "1"
        return Response(
            content=body,
            status_code=response.status_code,
            headers=headers,
            media_type="application/json",
        )


def register_envelope_middleware(app) -> None:
    """注册信封中间件。

    调用点必须位于请求 ID 中间件之后、CORS 之前（见 `main.py`）：Starlette 中
    「后注册的更靠外层」，这样最终执行顺序为
    `CORS -> envelope -> request_id -> metrics -> rate_limit -> 路由`，
    既能包裹业务响应，又让 CORS 预检在最外层短路（不经过信封）。
    """
    app.add_middleware(EnvelopeMiddleware)
