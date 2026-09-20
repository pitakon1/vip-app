"""JWT 认证 + 密码哈希 + PII 字段加密 + 验证码(OTP)"""
import base64
import hashlib
import logging
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken
from jose import jwt, JWTError
import bcrypt

from app.config import settings

logger = logging.getLogger(__name__)

# 开发环境派生密钥的固定盐值（保证同一 SECRET_KEY 下重启后密钥不变）
_DEV_PII_SALT = "rental-dev-pii"


def _derive_fernet_key(secret: str) -> bytes:
    """从任意口令确定性派生 Fernet Key（SHA-256 -> 32 字节 -> urlsafe base64）。"""
    return base64.urlsafe_b64encode(hashlib.sha256(secret.encode("utf-8")).digest())


def _resolve_pii_key() -> bytes:
    """解析 PII 加密密钥。

    规则：
    - 已配置 PII_ENCRYPTION_KEY：本身是合法 Fernet Key 时直接使用，否则按口令派生；
    - 未配置且 DEBUG：由 SECRET_KEY 确定性派生，避免每次重启换钥导致历史数据无法解密；
    - 未配置且非 DEBUG：直接报错（fail closed），拒绝用不确定的密钥加密 PII。
    """
    raw = (settings.PII_ENCRYPTION_KEY or "").strip()
    if raw:
        try:
            Fernet(raw.encode("utf-8"))
        except Exception:
            return _derive_fernet_key(raw)
        return raw.encode("utf-8")
    if settings.DEBUG:
        return _derive_fernet_key(f"{_DEV_PII_SALT}:{settings.SECRET_KEY}")
    raise RuntimeError(
        "PII_ENCRYPTION_KEY 未配置：非 DEBUG 环境必须显式设置 PII 加密密钥，"
        "否则无法加解密护照号/证件号等敏感字段。"
    )


_fernet: Optional[Fernet] = None


def get_fernet() -> Fernet:
    """获取 PII 加密器（惰性初始化，密钥缺失时在非 DEBUG 下抛错）。"""
    global _fernet
    if _fernet is None:
        _fernet = Fernet(_resolve_pii_key())
    return _fernet


def generate_otp(n: int = 6) -> str:
    """生成 n 位数字验证码（密码学安全随机源）。"""
    return f"{secrets.randbelow(10 ** n):0{n}d}"


def hash_otp(code: str) -> str:
    """对验证码做 SHA-256 哈希，避免明文落库。"""
    return hashlib.sha256(code.encode("utf-8")).hexdigest()


def verify_otp(code: str, code_hash: str) -> bool:
    """常量时间比较验证码与哈希。"""
    return secrets.compare_digest(hash_otp(code), code_hash)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(
        plain_password.encode("utf-8"), hashed_password.encode("utf-8")
    )


def get_password_hash(password: str) -> str:
    return bcrypt.hashpw(
        password.encode("utf-8"), bcrypt.gensalt()
    ).decode("utf-8")


def _token_claims(token_type: str, expire: datetime) -> dict:
    """令牌公共声明：类型、过期时间、签发时间与唯一 ID（jti）。"""
    now = datetime.now(timezone.utc)
    return {
        "exp": expire,
        "iat": int(now.timestamp()),
        "jti": uuid.uuid4().hex,
        "type": token_type,
    }


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update(_token_claims("access", expire))
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_refresh_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """创建刷新令牌，有效期默认 7 天。"""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    )
    to_encode.update(_token_claims("refresh", expire))
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_access_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        return payload
    except JWTError:
        return None


def encrypt_pii(plaintext: str) -> str:
    """加密 PII 字段（护照号、身份证号、银行账户等）。"""
    if not plaintext:
        return plaintext
    return get_fernet().encrypt(plaintext.encode()).decode()


def decrypt_pii(ciphertext: str) -> str:
    """解密 PII 字段。

    历史数据可能由旧密钥加密（或为早期明文），解密失败时记录告警并原样返回，
    避免单个字段异常导致整个接口 500。
    """
    if not ciphertext:
        return ciphertext
    try:
        return get_fernet().decrypt(ciphertext.encode()).decode()
    except (InvalidToken, RuntimeError, ValueError) as exc:
        logger.warning("pii.decrypt_failed: %s", exc)
        return ciphertext