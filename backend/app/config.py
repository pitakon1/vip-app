"""应用配置模块。

使用 pydantic-settings 管理环境变量配置，支持 .env 文件覆盖。
"""
import json
from functools import lru_cache
from typing import List

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

    # 数据库配置。全项目使用同步 Session（SQLModel + psycopg2），
    # 因此默认驱动为 psycopg2；若填 asyncpg 会被 db.py 自动改写为 psycopg2。
    DATABASE_URL: str = (
        "postgresql+psycopg2://postgres:postgres@localhost:5432/rental_db"
    )

    # 数据库连接池配置（可环境变量覆盖，用于按 worker 数收敛连接，避免超 PG max_connections）
    DB_POOL_SIZE: int = 5
    DB_MAX_OVERFLOW: int = 10

    # Redis 配置
    REDIS_URL: str = "redis://localhost:6379/0"

    # 安全配置。注意 SECRET_KEY 刻意不设默认值：留空即等于「未配置」，
    # 非 DEBUG 环境下启动自检会直接拒绝启动（fail closed），
    # 避免"忘了改默认值"退化成可预测的签名密钥，进而可伪造任意会话。
    SECRET_KEY: str = ""
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # PII 字段加密密钥（护照号/证件号/银行账户等）。
    # 支持 Fernet Key（44 位 urlsafe base64）或任意口令（内部 SHA-256 派生）。
    # 非 DEBUG 环境必须显式配置；缺省时启动自检会报错，加解密会拒绝执行。
    PII_ENCRYPTION_KEY: str = ""

    # Celery 配置
    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/2"

    # CORS 配置。默认只放开本地开发端口，避免默认 `*` + 凭证导致任意站点可发起
    # 带凭证的跨域请求；生产环境请在 .env 显式列出前端域名（逗号分隔）。
    # 注意：这里必须是 str 而不是 List[str]。pydantic-settings 对 List 字段会在
    # source 层就强制按 JSON 解析（早于 field_validator），`a,b` 这种写法会直接
    # 抛 SettingsError。读取时请用下面的 cors_origins 属性。
    CORS_ORIGINS: str = (
        "http://localhost:3000,http://127.0.0.1:3000,"
        "http://localhost:8081,http://127.0.0.1:8081,"
        "http://localhost:19006,http://127.0.0.1:19006"
    )

    # 应用配置
    APP_NAME: str = "房地产租赁管理系统 API"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    # Uvicorn worker 数量（生产环境可环境变量覆盖）
    WEB_CONCURRENCY: int = 4

    # 速率限制（slowapi）
    RATE_LIMIT_ENABLED: bool = True
    # 全局默认限额（对所有路由生效）
    RATE_LIMIT_DEFAULT: str = "300/minute"
    # 登录/注册等凭证类接口的限额
    RATE_LIMIT_AUTH: str = "10/minute"
    # 限流计数器存储。留空时：DEBUG 用进程内存，非 DEBUG 用 REDIS_URL。
    # 多 worker 生产环境必须用 Redis，否则每个 worker 各算一份配额。
    RATE_LIMIT_STORAGE_URI: str = ""

    # ==================== 新增功能配置 ====================
    # 1) 即时聊天：无额外外部依赖（使用 WebSocket + 数据库/in-process 广播）。
    #
    # 2) 电子签合同：合同渲染 + 数字签名。SIGNING_SECRET 用于 HMAC 签名，
    #    若检测到 cryptography 库则使用 RSA 签名（更接近生产电子签）。
    #    同样不设默认值：缺省时非 DEBUG 环境启动自检会提示（见 main.py 探针表），
    #    签名时 fail closed 直接报错，避免用公开的示例密钥签出"看起来有效"的合同。
    CONTRACT_SIGNING_SECRET: str = ""
    CONTRACT_OUTPUT_DIR: str = "./contracts"

    # 3) AI 应用预留接口（OpenAI 兼容 /chat/completions）
    OPENAI_API_KEY: str = ""
    OPENAI_API_BASE: str = "https://api.openai.com/v1"
    OPENAI_MODEL: str = "gpt-4o-mini"

    # 4) 数据备份：每日同步。备份输出目录（生产可指向挂载盘/对象存储挂载点）。
    BACKUP_DIR: str = "./backups"
    # 历史备份保留天数（超期文件在每次备份后清理）
    BACKUP_RETENTION_DAYS: int = 14

    # 5) 地图找房 + 7) 考勤定位：Google Maps API
    #    未配置时使用站内 mock 地理位置（geocode 兜底），不影响流程。
    GOOGLE_MAPS_API_KEY: str = ""
    GOOGLE_MAPS_ORIGIN: str = ""  # 可选 CORS 来源

    # 6) Google 翻译（Cloud Translation v2）
    GOOGLE_TRANSLATE_API_KEY: str = ""
    GOOGLE_TRANSLATE_V3_PROJECT: str = ""

    # 7) 考勤：GPS 半径打卡（km）。默认 0.5km（500 米），超出需填外勤申请。
    ATTENDANCE_RADIUS_KM: float = 0.5
    # 考勤基准地址（公司/办公点），由管理员在 /geo/geocode 定位后写入
    ATTENDANCE_OFFICE_LAT: float = 13.7563  # 曼谷默认
    ATTENDANCE_OFFICE_LNG: float = 100.5018

    # 8) 逾期滞纳金：待缴租金单逾期后按日计提，宽限期内不计提，且有封顶。
    LATE_FEE_ENABLED: bool = True
    LATE_FEE_GRACE_DAYS: int = 3  # 宽限期（天）：到期后 N 天内不计提
    LATE_FEE_DAILY_RATE: float = 0.0005  # 日费率 0.05%（每万元每日 5 元）
    LATE_FEE_CAP_RATIO: float = 0.1  # 封顶：不超过本金 10%

    # 9) 验证码（手机号/邮箱注册、登录）。本地未配置短信/邮件 provider 时，
    #    /auth/otp/request 会把验证码写入响应 dev_code 以闭环联调。
    OTP_EXPIRE_MINUTES: int = 10  # 验证码有效期
    OTP_MAX_ATTEMPTS: int = 5  # 单码校验次数上限（超出作废）

    # 10) 小程序微信登录（miniapp 对标国内小程序）。
    #     code2session / getPhoneNumber 需要真实小程序 AppID 与 AppSecret，
    #     未配置时 /auth/wx/login、/auth/wx/bind-phone 返回 503。
    WECHAT_APPID: str = ""
    WECHAT_SECRET: str = ""

    @property
    def cors_origins(self) -> List[str]:
        """解析后的 CORS 源列表。

        兼容两种写法：逗号分隔（`a,b`）与 JSON 数组（`["a","b"]`）。
        """
        raw = (self.CORS_ORIGINS or "").strip()
        if raw.startswith("["):
            try:
                parsed = json.loads(raw)
            except json.JSONDecodeError:
                parsed = None
            if isinstance(parsed, list):
                return [str(origin).strip() for origin in parsed if str(origin).strip()]
        return [origin.strip() for origin in raw.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    """获取配置单例（带缓存）。"""
    return Settings()


settings = get_settings()
