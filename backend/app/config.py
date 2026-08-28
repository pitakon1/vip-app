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
