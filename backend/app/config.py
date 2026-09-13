"""应用配置模块。

使用 pydantic-settings 管理环境变量配置，支持 .env 文件覆盖。
"""
from functools import lru_cache
from typing import List

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """应用配置项。

    所有配置项均支持通过环境变量或 .env 文件覆盖。
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    # 数据库配置
    DATABASE_URL: str = (
        "postgresql+asyncpg://postgres:postgres@localhost:5432/rental_db"
    )

    # 数据库连接池配置（可环境变量覆盖，用于按 worker 数收敛连接，避免超 PG max_connections）
    DB_POOL_SIZE: int = 5
    DB_MAX_OVERFLOW: int = 10

    # Redis 配置
    REDIS_URL: str = "redis://localhost:6379/0"

    # 安全配置
    SECRET_KEY: str = "super-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # MinIO 对象存储配置
    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin"
    MINIO_BUCKET: str = "rental"
    MINIO_SECURE: bool = False

    # Celery 配置
    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/2"

    # CORS 配置
    CORS_ORIGINS: List[str] = ["*"]

    # 应用配置
    APP_NAME: str = "房地产租赁管理系统 API"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    # Uvicorn worker 数量（生产环境可环境变量覆盖）
    WEB_CONCURRENCY: int = 4

    # ==================== 新增功能配置 ====================
    # 1) 即时聊天：无额外外部依赖（使用 WebSocket + 数据库/in-process 广播）。
    #
    # 2) 电子签合同：合同渲染 + 数字签名。SIGNING_SECRET 用于 HMAC 签名，
    #    若检测到 cryptography 库则使用 RSA 签名（更接近生产电子签）。
    CONTRACT_SIGNING_SECRET: str = "change-me-signing-secret"
    CONTRACT_OUTPUT_DIR: str = "./contracts"

    # 3) AI 应用预留接口（OpenAI 兼容 /chat/completions）
    OPENAI_API_KEY: str = ""
    OPENAI_API_BASE: str = "https://api.openai.com/v1"
    OPENAI_MODEL: str = "gpt-4o-mini"

    # 4) 数据备份：每日同步。备份输出目录（生产可指向挂载盘/MinIO）。
    BACKUP_DIR: str = "./backups"

    # 5) 地图找房 + 7) 考勤定位：Google Maps API
    #    未配置时使用站内 mock 地理位置（geocode 兜底），不影响流程。
    GOOGLE_MAPS_API_KEY: str = ""
    GOOGLE_MAPS_ORIGIN: str = ""  # 可选 CORS 来源

    # 6) Google 翻译（Cloud Translation v2）
    GOOGLE_TRANSLATE_API_KEY: str = ""
    GOOGLE_TRANSLATE_V3_PROJECT: str = ""

    # 7) 考勤：GPS 半径打卡（km）。默认 500KM，超出需填外勤申请。
    ATTENDANCE_RADIUS_KM: float = 500.0
    # 考勤基准地址（公司/办公点），由管理员在 /geo/geocode 定位后写入
    ATTENDANCE_OFFICE_LAT: float = 13.7563  # 曼谷默认
    ATTENDANCE_OFFICE_LNG: float = 100.5018

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v):
        """支持逗号分隔的字符串形式配置 CORS 源。"""
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",")]
        return v


@lru_cache
def get_settings() -> Settings:
    """获取配置单例（带缓存）。"""
    return Settings()


settings = get_settings()
