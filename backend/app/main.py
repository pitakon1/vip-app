"""应用入口模块。

创建 FastAPI 应用，配置中间件、CORS、路由、静态文件服务和 Prometheus 指标端点。
"""
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

from app.config import settings
from app.core.logging import configure_logging, get_logger
from app.api.v1 import api_router

# 配置结构化日志
configure_logging()
logger = get_logger(__name__)

# 上传文件静态目录（backend/uploads）
UPLOAD_DIR = Path(__file__).resolve().parent.parent / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


_DEFAULT_SECRET = "super-secret-key-change-in-production"

# 第三方能力 -> (配置字段, 缺省时是否走 mock 降级)
_INTEGRATION_PROBES = [
    ("AI 对话", "OPENAI_API_KEY", True),
    ("地图/考勤定位", "GOOGLE_MAPS_API_KEY", True),
    ("翻译", "GOOGLE_TRANSLATE_API_KEY", True),
    ("电子签", "CONTRACT_SIGNING_SECRET", False),
]
_FALLBACK_SECRETS = (_DEFAULT_SECRET, "change-me-signing-secret")


def _run_startup_selfcheck() -> None:
    """启动自检：核对密钥强度与第三方集成是否处于 mock/降级模式。"""
    # 1) 密钥强度：非 DEBUG 下仍用默认/示例签名密钥属高危
    if not settings.DEBUG and settings.SECRET_KEY in _FALLBACK_SECRETS:
        logger.error(
            "startup.selfcheck.insecure_secret_key",
            hint="生产环境必须设置强随机 SECRET_KEY，避免可预测签名导致会话伪造。",
        )
    elif settings.DEBUG:
        logger.info("startup.selfcheck.debug_mode", secret_key_ok=True)

    # 2) 第三方集成模式审计：缺失 Key 的能力走 mock/站内降级
    mock_enabled = []
    for name, field, has_mock_fallback in _INTEGRATION_PROBES:
        if not getattr(settings, field, ""):
            mock_enabled.append(name if has_mock_fallback else f"{name}(需配置)")
    if mock_enabled:
        logger.warning(
            "startup.selfcheck.integrations_mock",
            integrations=mock_enabled,
            note="以下能力未配置第三方凭证，将返回 mock/占位响应；上线前请核对。",
        )
    else:
        logger.info("startup.selfcheck.integrations", mode="all configured")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理。"""
    logger.info("application.starting", app=settings.APP_NAME, version=settings.APP_VERSION)
    _run_startup_selfcheck()
    yield
    logger.info("application.stopped", app=settings.APP_NAME)


app = FastAPI(
    title="房地产租赁管理系统 API",
    description="房地产租赁管理系统后端服务",
    version=settings.APP_VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)

# 配置 CORS（开发模式允许所有源）
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 挂载 v1 API 路由
app.include_router(api_router)

# 挂载上传文件静态服务（/uploads/... 直接可访问）
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    """请求 ID 追踪中间件，为每个请求生成唯一 request_id。"""
    request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
    structlog.contextvars.clear_contextvars()
    structlog.contextvars.bind_contextvars(request_id=request_id)

    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response


@app.get("/", tags=["root"])
async def root():
    """根路由，返回项目信息。"""
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "docs": "/docs",
        "health": "/health",
    }


@app.get("/health", tags=["health"])
async def health_check():
    """健康检查端点。"""
    return {"status": "ok"}


@app.get("/metrics", tags=["monitoring"], include_in_schema=False)
async def metrics():
    """Prometheus 指标端点。"""
    data = generate_latest()
    return Response(content=data, media_type=CONTENT_TYPE_LATEST)
