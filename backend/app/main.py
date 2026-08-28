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


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理。"""
    logger.info("application.starting", app=settings.APP_NAME, version=settings.APP_VERSION)
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
