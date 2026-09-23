"""应用入口模块。

创建 FastAPI 应用，配置中间件、CORS、路由、静态文件服务和 Prometheus 指标端点。
"""
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

import structlog
from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from pydantic import BaseModel, ConfigDict
from slowapi.errors import RateLimitExceeded
from sqlalchemy import text
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import settings
from app.core.auth import require_role
from app.core.error_handlers import rate_limited_response, register_exception_handlers
from app.core.logging import configure_logging, get_logger
from app.core.migrations import ensure_schema
from app.core.metrics import observe
from app.core.rate_limit import apply_default_limit, limiter
from app.core.rbac import seed_permissions
from app.db import Session, engine
from app.models import UserRole
from app.providers.payment import channel_config as payment_channel_config
from app.redis_client import get_redis_sync
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

# 支付回调验签材料 -> 是否具备验签能力。
# 缺材料的渠道一律拒绝回调（provider.verify_webhook fail closed），
# 这里只做可见性提示：不会伪造到账，但真实到账也不会入账，上线收款前必须补齐。
# 若采用聚合支付，只需配置 AGGREGATOR_WEBHOOK_SECRET 一项。
_PAYMENT_VERIFY_PROBES = [
    ("聚合支付", bool(payment_channel_config.AGGREGATOR_WEBHOOK_SECRET)),
    ("Stripe", bool(payment_channel_config.STRIPE_WEBHOOK_SECRET)),
    ("微信支付", bool(payment_channel_config.WECHAT_PLATFORM_CERT)),
    ("支付宝", bool(payment_channel_config.ALIPAY_PUBLIC_KEY)),
    ("Wise", bool(payment_channel_config.WISE_API_KEY)),
    ("PromptPay", False),  # 无标准 webhook，需自定义验签后方可启用
]


class RootInfoOut(BaseModel):
    """根路由项目信息。"""

    model_config = ConfigDict(extra="allow")

    name: Optional[str] = None
    version: Optional[str] = None
    docs: Optional[str] = None
    health: Optional[str] = None


class HealthOut(BaseModel):
    """存活探针响应。"""

    model_config = ConfigDict(extra="allow")

    status: Optional[str] = None
    version: Optional[str] = None


class ReadinessOut(BaseModel):
    """就绪探针响应。"""

    model_config = ConfigDict(extra="allow")

    status: Optional[str] = None
    checks: Optional[dict] = None


def _run_startup_selfcheck() -> None:
    """启动自检：核对密钥强度与第三方集成是否处于 mock/降级模式。"""
    # 1) 签名密钥：未配置或仍是默认/示例值时，非 DEBUG 环境直接拒绝启动。
    #    配置项默认值已改为空串，此处 fail closed，避免"忘了改默认值"就上线。
    if not settings.SECRET_KEY:
        hint = (
            "SECRET_KEY 未配置。缺失签名密钥会让会话令牌无法校验；"
            "非 DEBUG 环境拒绝启动，DEBUG 下请先在后端 .env 中设置。"
        )
        if settings.DEBUG:
            logger.warning("startup.selfcheck.secret_key_missing", hint=hint)
        else:
            logger.error("startup.selfcheck.secret_key_missing", hint=hint)
            raise RuntimeError(hint)
    elif not settings.DEBUG and settings.SECRET_KEY in _FALLBACK_SECRETS:
        logger.error(
            "startup.selfcheck.insecure_secret_key",
            hint="生产环境必须设置强随机 SECRET_KEY，避免可预测签名导致会话伪造。",
        )
        raise RuntimeError("SECRET_KEY 仍是默认/示例值：非 DEBUG 环境拒绝启动。")
    elif settings.DEBUG:
        logger.info("startup.selfcheck.debug_mode", secret_key_ok=True)

    # 2) PII 加密密钥：非 DEBUG 缺省时加解密会直接报错（fail closed），必须提前暴露
    if not settings.PII_ENCRYPTION_KEY:
        log = logger.warning if settings.DEBUG else logger.error
        log(
            "startup.selfcheck.pii_key_missing",
            hint=(
                "未配置 PII_ENCRYPTION_KEY。护照号/证件号等敏感字段加解密将不可用；"
                "DEBUG 下由 SECRET_KEY 派生临时密钥，生产环境必须显式配置。"
            ),
        )

    # 3) 第三方集成模式审计：缺失 Key 的能力走 mock/站内降级
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

    # 4) CORS：非 DEBUG 下放开 `*` 且允许携带凭证，等于对任意站点开放
    if "*" in settings.cors_origins and not settings.DEBUG:
        logger.error(
            "startup.selfcheck.cors_wildcard",
            hint=(
                "CORS_ORIGINS 配置为 '*' 且 allow_credentials=True，任意站点均可发起"
                "携带凭证的跨域请求。生产环境请显式列出前端域名。"
            ),
        )

    # 5) 支付回调验签：未配置验签材料的渠道一律拒绝回调（fail closed）。
    #    此前的占位默认密钥会让生产环境在"忘记覆盖"时仍接受伪造回调，
    #    故这里显式提示，避免"看起来配好了、其实没验签"。
    unverified_channels = [name for name, ready in _PAYMENT_VERIFY_PROBES if not ready]
    if unverified_channels:
        logger.warning(
            "startup.selfcheck.payment_verify_disabled",
            channels=unverified_channels,
            note=(
                "以下渠道未配置验签材料，回调将被拒绝：既不会伪造到账，"
                "真实到账也不会入账。上线收款前请补齐密钥/证书；"
                "若改用聚合支付，只需配置 AGGREGATOR_WEBHOOK_SECRET。"
            ),
        )
    else:
        logger.info("startup.selfcheck.payment_verify", mode="all configured")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理。"""
    logger.info("application.starting", app=settings.APP_NAME, version=settings.APP_VERSION)
    _run_startup_selfcheck()
    # 幂等迁移：建缺失的表 + 给已有表补缺失的列与索引
    # （create_all 只建表不补列，模型加字段后必须在这里补齐，否则查询 500）
    ensure_schema(engine)
    # 幂等补种权限点与角色默认权限（不覆盖已有配置）
    with Session(engine) as session:
        seed_permissions(session)
    yield
    logger.info("application.stopped", app=settings.APP_NAME)


# 交互式文档与 OpenAPI 描述只在 DEBUG 下开放：生产环境暴露它们等于把完整
# 接口结构（含参数名、权限边界）交给攻击者做枚举。
_DOCS_ENABLED = settings.DEBUG

app = FastAPI(
    title="房地产租赁管理系统 API",
    description="房地产租赁管理系统后端服务",
    version=settings.APP_VERSION,
    docs_url="/docs" if _DOCS_ENABLED else None,
    redoc_url="/redoc" if _DOCS_ENABLED else None,
    openapi_url="/openapi.json" if _DOCS_ENABLED else None,
    lifespan=lifespan,
)

# 统一错误响应（保留 detail 字段以兼容三端前端）
register_exception_handlers(app)


# ==================== 中间件 ====================
# Starlette 中「后注册的更靠外层」，以下按 内 -> 外 顺序注册，
# 最终执行顺序由外到内为：CORS -> request_id -> metrics -> rate_limit -> 路由。
# 这样限流产生的 429 也会被计入指标并带上 CORS 头。


async def rate_limit_middleware(request: Request, call_next):
    """全局默认限流（超限返回 429）。

    注意：这里不能设置 `request.state._rate_limiting_complete`，否则带
    `@limiter.limit` 的接口会被装饰器判定为"已检查过"而跳过自身的更严限额。
    """
    if limiter.enabled:
        try:
            apply_default_limit(request)
        except RateLimitExceeded:
            logger.warning("http.rate_limited", path=request.url.path)
            return rate_limited_response(request)
    return await call_next(request)


async def metrics_middleware(request: Request, call_next):
    """采集 HTTP 请求数与耗时；/metrics 自身不计入。"""
    start = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        # 异常响应由 ServerErrorMiddleware 生成（500），此处先记一笔再上抛
        observe(request, 500, time.perf_counter() - start)
        raise
    observe(request, response.status_code, time.perf_counter() - start)
    return response


async def request_id_middleware(request: Request, call_next):
    """请求 ID 追踪中间件，为每个请求生成唯一 request_id。"""
    request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
    structlog.contextvars.clear_contextvars()
    structlog.contextvars.bind_contextvars(request_id=request_id)
    request.state.request_id = request_id

    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response


# 1) 限流：全局默认限额（此前只定义了 limiter，从未启用）
app.state.limiter = limiter
app.add_middleware(BaseHTTPMiddleware, dispatch=rate_limit_middleware)

# 2) Prometheus 指标
app.add_middleware(BaseHTTPMiddleware, dispatch=metrics_middleware)

# 3) 请求 ID 追踪
app.add_middleware(BaseHTTPMiddleware, dispatch=request_id_middleware)

# 4) CORS（最外层；源列表来自 CORS_ORIGINS 配置，默认仅本地开发端口）
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 挂载 v1 API 路由
app.include_router(api_router)

# 挂载公开媒体静态服务。**仅**房源图片/视频等本就需要匿名浏览的内容：
# 证件、合同等敏感文档落在 uploads/documents，不再静态托管，
# 只能经 GET /api/v1/documents/{id}/file（带令牌 + 归属校验）读取。
PUBLIC_MEDIA_DIR = UPLOAD_DIR / "properties"
PUBLIC_MEDIA_DIR.mkdir(parents=True, exist_ok=True)
app.mount(
    "/uploads/properties", StaticFiles(directory=PUBLIC_MEDIA_DIR), name="uploads"
)

# 头像静态托管（backend/uploads/avatars）：头像本身需在「我的」页跨端展示，
# 属于半公开内容，直接以静态 URL 访问，供 <img>/<Image> 作为 src。
AVATAR_MEDIA_DIR = UPLOAD_DIR / "avatars"
AVATAR_MEDIA_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/uploads/avatars", StaticFiles(directory=AVATAR_MEDIA_DIR), name="avatars")

# 公司 Logo 静态托管（backend/uploads/company）：对外展示的公司标识，
# 由设置页上传（POST /company/info/logo），前端直接以该 URL 作为 img 的 src。
COMPANY_MEDIA_DIR = UPLOAD_DIR / "company"
COMPANY_MEDIA_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/uploads/company", StaticFiles(directory=COMPANY_MEDIA_DIR), name="company-media")


@app.get("/", response_model=RootInfoOut, tags=["root"])
async def root():
    """根路由，返回项目信息。"""
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "docs": "/docs",
        "health": "/health",
    }


@app.get("/health", response_model=HealthOut, tags=["health"])
async def health_check():
    """存活探针（liveness）：进程能响应即 200，不探测外部依赖。

    依赖不可用时不应重启进程，故这里保持轻量；依赖连通性请用 `/health/ready`。
    """
    return {"status": "ok", "version": settings.APP_VERSION}


def _check_database() -> dict:
    """探测数据库连通性（`SELECT 1`）。"""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "ok"}
    except Exception as exc:  # noqa: BLE001 - 探针需返回失败原因而非抛错
        logger.warning("readiness.database_failed", error=str(exc))
        return {"status": "error", "detail": str(exc)[:200]}


def _check_redis() -> dict:
    """探测 Redis 连通性（PING）。

    Redis 是软依赖：缓存与限流在其不可用时会降级（见 core/cache.py），
    因此该检查失败只标记 degraded，不让就绪探针整体失败。
    """
    try:
        get_redis_sync().ping()
        return {"status": "ok"}
    except Exception as exc:  # noqa: BLE001
        logger.warning("readiness.redis_unavailable", error=str(exc))
        return {"status": "error", "detail": str(exc)[:200]}


@app.get("/health/ready", response_model=ReadinessOut, tags=["health"])
def readiness_check(response: Response):
    """就绪探针（readiness）：真实探测数据库与 Redis。

    - 数据库不可用 → 503（服务无法提供任何数据能力）；
    - Redis 不可用 → 200 + `status=degraded`（缓存/限流降级，业务仍可用）。
    """
    database = _check_database()
    redis = _check_redis()
    if database["status"] != "ok":
        status = "unavailable"
        response.status_code = 503
    elif redis["status"] != "ok":
        status = "degraded"
    else:
        status = "ok"
    return {"status": status, "checks": {"database": database, "redis": redis}}


# /metrics 的访问守卫：DEBUG 下开放（本地调试方便）；生产环境要求管理员令牌，
# 指标里带着请求量、业务分布等信息，匿名可读等于对外泄露运营规模与接口热度。
_METRICS_GUARD = [] if settings.DEBUG else [Depends(require_role(UserRole.admin))]


@app.get(
    "/metrics",
    tags=["monitoring"],
    include_in_schema=False,
    dependencies=_METRICS_GUARD,
)
async def metrics():
    """Prometheus 指标端点（访问策略见 `_METRICS_GUARD`）。"""
    data = generate_latest()
    return Response(content=data, media_type=CONTENT_TYPE_LATEST)