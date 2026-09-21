"""认证路由：登录、注册、刷新令牌、验证码、微信授权、获取当前用户信息。"""
import hashlib
import logging
import os
import re
import secrets
import uuid
from datetime import datetime, timedelta
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.security import OAuth2PasswordRequestForm
from sqlmodel import Session, select
from pydantic import BaseModel, ConfigDict

from app.config import settings
from app.db import get_session
from app.core.rate_limit import AUTH_LIMIT, limiter
from app.core.security import (
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_access_token,
    get_password_hash,
    generate_otp,
    hash_otp,
    verify_otp,
)
from app.core.auth import get_current_user, is_token_revoked, serialize_user
from app.core.uploads import detect_image_mime, save_upload
from app.models.user import User, UserRole
from app.models.owner import Owner
from app.models.tenant import Tenant
from app.models.verification_code import VerificationCode
from app.providers.notification.base import NotificationChannel, NotificationMessage
from app.providers.notification.sms_provider import SMSProvider
from app.providers.notification.email_provider import EmailProvider
from app.services import wechat as wechat_service
from app.services import oauth as oauth_service

router = APIRouter(prefix="/auth", tags=["auth"])

logger = logging.getLogger(__name__)

_PHONE_RE = re.compile(r"^\+?[0-9\-\s]{6,15}$")
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# 头像上传：落盘目录 / 静态 URL 前缀 / 体积上限 / 允许的扩展名与魔数。
# backend/uploads/avatars 由 main.py 以 /uploads/avatars 静态托管（同 properties）。
AVATAR_UPLOAD_DIR = Path(__file__).resolve().parents[3] / "uploads" / "avatars"
AVATAR_URL_PREFIX = "/uploads/avatars/"
MAX_AVATAR_SIZE = 2 * 1024 * 1024  # 2MB
ALLOWED_AVATAR_TYPES: dict[str, tuple[str, object]] = {
    ".jpg": ("image/jpeg", None),
    ".jpeg": ("image/jpeg", None),
    ".png": ("image/png", None),
    ".webp": ("image/webp", None),
    ".gif": ("image/gif", None),
}


def _is_valid_phone(value: str) -> bool:
    return bool(value) and bool(_PHONE_RE.match(value.strip()))


def _is_valid_email(value: str) -> bool:
    return bool(value) and bool(_EMAIL_RE.match(value.strip()))


# 自助注册仅开放业主/租客；员工/经纪/管理员须由后台开通
SELF_SIGNUP_ROLES = {UserRole.owner, UserRole.tenant}


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str
    user: dict


class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutResponse(BaseModel):
    ok: bool
    token_version: int
    message: str


class RegisterRequest(BaseModel):
    """注册请求：支持两种方式之一。

    - 邮箱 + 密码：`{email, password, full_name?, role?, phone?}`
    - 手机号 + 验证码：`{phone, code, full_name?, role?}`
    """

    email: str | None = None
    password: str | None = None
    phone: str | None = None
    code: str | None = None
    full_name: str = ""
    role: UserRole = UserRole.tenant


class OtpRequest(BaseModel):
    recipient: str
    channel: str = "sms"  # sms | email


class OtpLoginRequest(BaseModel):
    phone: str
    code: str


class WxLoginRequest(BaseModel):
    code: str
    nickname: str | None = None


class WxBindPhoneRequest(BaseModel):
    code: str


class OAuthLoginRequest(BaseModel):
    id_token: str | None = None
    mock_email: str | None = None


class UserMeOut(BaseModel):
    """`GET /auth/me`：当前登录用户摘要。"""

    model_config = ConfigDict(extra="allow")

    id: str | None = None
    email: str | None = None
    full_name: str | None = None
    role: str | None = None


def _build_token_response(user: User) -> TokenResponse:
    """生成访问令牌与刷新令牌并组装响应。

    payload 带上 `tv`（账号令牌版本号），登出 / 改密后旧令牌即失效。
    """
    payload = {
        "sub": str(user.id),
        "role": user.role.value,
        "tv": int(user.token_version or 0),
    }
    return TokenResponse(
        access_token=create_access_token(payload),
        refresh_token=create_refresh_token(payload),
        token_type="bearer",
        user={
            "id": str(user.id),
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role.value,
        },
    )


def _resolve_user_by_identifier(session: Session, identifier: str) -> User | None:
    """按登录标识解析用户：含 @ 按邮箱，否则按手机号。"""
    if not identifier:
        return None
    if "@" in identifier:
        return session.exec(select(User).where(User.email == identifier)).first()
    return session.exec(select(User).where(User.phone == identifier)).first()


def _finalize_login(session: Session, user: User) -> TokenResponse:
    """记录登录时间（运营看板 DAU/MAU 数据源）并返回令牌。"""
    user.last_login_at = datetime.utcnow()
    session.add(user)
    session.commit()
    return _build_token_response(user)


def _send_code(recipient: str, channel: str, code: str) -> bool:
    """通过 provider 发送验证码；返回是否配置成功。发送失败（多为未配凭据）返回 False。"""
    if channel == "sms":
        provider = SMSProvider()
        msg = NotificationMessage(
            channel=NotificationChannel.SMS,
            recipient=recipient,
            title="验证码",
            content=f"您的验证码是 {code}，{settings.OTP_EXPIRE_MINUTES} 分钟内有效。",
        )
    else:
        provider = EmailProvider()
        msg = NotificationMessage(
            channel=NotificationChannel.EMAIL,
            recipient=recipient,
            title="验证码",
            content=f"您的验证码是 {code}，{settings.OTP_EXPIRE_MINUTES} 分钟内有效。",
        )
    return bool(provider.send(msg).success)


def _issue_otp(session: Session, recipient: str, channel: str) -> str:
    """生成验证码入库并作废旧码，返回明文（供 dev_code / 日志兜底）。"""
    now = datetime.utcnow()
    # 作废该接收方未消费的历史码
    for old in session.exec(
        select(VerificationCode).where(
            VerificationCode.recipient == recipient,
            VerificationCode.used_at.is_(None),
        )
    ).all():
        old.used_at = now
        session.add(old)
    code = generate_otp()
    session.add(
        VerificationCode(
            recipient=recipient,
            channel=channel,
            code_hash=hash_otp(code),
            expires_at=now + timedelta(minutes=settings.OTP_EXPIRE_MINUTES),
        )
    )
    session.commit()
    return code


def _consume_otp(session: Session, recipient: str, code: str) -> None:
    """校验并消费验证码。任一不满足都抛 4xx。"""
    now = datetime.utcnow()
    latest = session.exec(
        select(VerificationCode)
        .where(
            VerificationCode.recipient == recipient,
            VerificationCode.used_at.is_(None),
        )
        .order_by(VerificationCode.created_at.desc())
    ).first()
    if not latest:
        raise HTTPException(status_code=400, detail="No verification code requested")
    if now > latest.expires_at:
        raise HTTPException(status_code=400, detail="Verification code expired")
    latest.attempts = int(latest.attempts or 0) + 1
    if latest.attempts > settings.OTP_MAX_ATTEMPTS:
        latest.used_at = now
        session.add(latest)
        session.commit()
        raise HTTPException(
            status_code=400,
            detail="Too many attempts, please request a new code",
        )
    if not verify_otp(code, latest.code_hash):
        session.add(latest)
        session.commit()
        raise HTTPException(status_code=400, detail="Invalid verification code")
    latest.used_at = now
    session.add(latest)
    session.commit()


def _sync_role_profile(session: Session, user: User) -> None:
    """按角色同步建立业主/租客档案，保证登录后各端页面可正常拉取数据。"""
    if user.role == UserRole.owner:
        if not session.exec(select(Owner).where(Owner.user_id == user.id)).first():
            session.add(Owner(user_id=user.id, owner_type="individual"))
    elif user.role == UserRole.tenant:
        if not session.exec(select(Tenant).where(Tenant.user_id == user.id)).first():
            session.add(Tenant(user_id=user.id))
    session.commit()


@router.post("/login", response_model=TokenResponse)
@limiter.limit(AUTH_LIMIT)
def login(
    request: Request,
    form: OAuth2PasswordRequestForm = Depends(),
    session: Session = Depends(get_session),
):
    user = _resolve_user_by_identifier(session, (form.username or "").strip())
    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect credentials")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")
    return _finalize_login(session, user)


@router.post("/register", response_model=TokenResponse)
@limiter.limit(AUTH_LIMIT)
def register(
    request: Request,
    req: RegisterRequest,
    session: Session = Depends(get_session),
):
    if req.role not in SELF_SIGNUP_ROLES:
        raise HTTPException(
            status_code=403,
            detail="Self-registration only supports owner/tenant. Staff roles require admin onboarding.",
        )
    phone = (req.phone or "").strip() or None
    email = (req.email or "").strip() or None

    if phone and req.code:
        # 方式一：手机号 + 验证码
        if not _is_valid_phone(phone):
            raise HTTPException(status_code=400, detail="Invalid phone number")
        if session.exec(select(User).where(User.phone == phone)).first():
            raise HTTPException(status_code=409, detail="Phone already registered")
        _consume_otp(session, phone, (req.code or "").strip())
        # 手机号用户无真实密码（占位邮箱满足 email 非空唯一）
        user = User(
            email=f"ph{secrets.token_hex(4)}@customer.local",
            hashed_password=get_password_hash(secrets.token_hex(16)),
            full_name=req.full_name or "用户",
            role=req.role,
            phone=phone,
        )
    elif email and req.password:
        # 方式二：邮箱 + 密码
        if not _is_valid_email(email):
            raise HTTPException(status_code=400, detail="Invalid email address")
        if session.exec(select(User).where(User.email == email)).first():
            raise HTTPException(status_code=400, detail="Email already registered")
        user = User(
            email=email,
            hashed_password=get_password_hash(req.password),
            full_name=req.full_name or "用户",
            role=req.role,
            phone=phone,
        )
    else:
        raise HTTPException(
            status_code=400,
            detail="Provide either phone+code or email+password to register",
        )

    session.add(user)
    session.commit()
    session.refresh(user)
    _sync_role_profile(session, user)
    return _build_token_response(user)


@router.post("/otp/request")
@limiter.limit(AUTH_LIMIT)
def request_otp(
    request: Request,
    req: OtpRequest,
    session: Session = Depends(get_session),
):
    """请求发送验证码。channel=sms 需手机号、email 需邮箱。

    本地未配置短信/邮件凭据时，返回体携带 dev_code（并打印日志）以便闭环联调。
    """
    recipient = (req.recipient or "").strip()
    channel = (req.channel or "sms").lower().strip()
    if channel == "sms":
        if not _is_valid_phone(recipient):
            raise HTTPException(status_code=400, detail="Invalid phone number")
    elif channel == "email":
        if not _is_valid_email(recipient):
            raise HTTPException(status_code=400, detail="Invalid email address")
    else:
        raise HTTPException(status_code=400, detail="channel must be sms or email")

    code = _issue_otp(session, recipient, channel)
    sent = _send_code(recipient, channel, code)
    dev_code = code if (settings.DEBUG or not sent) else None
    if dev_code:
        logger.info("otp.dev_code channel=%s recipient=%s code=%s", channel, recipient, code)
    return {
        "ok": True,
        "message": "Verification code sent",
        "dev_code": dev_code,
    }


@router.post("/login/otp", response_model=TokenResponse)
@limiter.limit(AUTH_LIMIT)
def login_by_otp(
    request: Request,
    req: OtpLoginRequest,
    session: Session = Depends(get_session),
):
    """手机号 + 验证码登录（含手机号注册后首次登录）。"""
    phone = (req.phone or "").strip()
    if not _is_valid_phone(phone):
        raise HTTPException(status_code=400, detail="Invalid phone number")
    user = session.exec(select(User).where(User.phone == phone)).first()
    if not user:
        raise HTTPException(status_code=404, detail="No account found for this phone")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")
    _consume_otp(session, phone, (req.code or "").strip())
    return _finalize_login(session, user)


@router.post("/wx/login", response_model=TokenResponse)
@limiter.limit(AUTH_LIMIT)
def wx_login(
    request: Request,
    req: WxLoginRequest,
    session: Session = Depends(get_session),
):
    """小程序微信一键授权登录（对标国内小程序）。

    用 wx.login 的 code 换 openid → 按 openid 找/建用户（role=tenant）并发 token。
    未配置 WECHAT_APPID/SECRET 时返回 503。
    """
    if not settings.WECHAT_APPID or not settings.WECHAT_SECRET:
        raise HTTPException(status_code=503, detail="WeChat login not configured")
    openid = wechat_service.code2session((req.code or "").strip())
    if not openid:
        raise HTTPException(status_code=401, detail="WeChat login failed")
    user = session.exec(select(User).where(User.wechat_openid == openid)).first()
    if not user:
        user = User(
            email=f"wx{openid}@wx.local",
            hashed_password=get_password_hash(secrets.token_hex(16)),
            full_name=(req.nickname or "").strip() or "微信用户",
            role=UserRole.tenant,
            wechat_openid=openid,
        )
        session.add(user)
        session.commit()
        session.refresh(user)
        _sync_role_profile(session, user)
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")
    return _finalize_login(session, user)


@router.post("/wx/bind-phone")
def wx_bind_phone(
    req: WxBindPhoneRequest,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """登录态下用微信手机号授权 code 绑定手机号（查重 409）。"""
    if not settings.WECHAT_APPID or not settings.WECHAT_SECRET:
        raise HTTPException(status_code=503, detail="WeChat binding not configured")
    phone = wechat_service.get_phone_number((req.code or "").strip())
    if not phone:
        raise HTTPException(status_code=400, detail="Failed to get phone number")
    clash = session.exec(
        select(User).where(User.phone == phone, User.id != user.id)
    ).first()
    if clash:
        raise HTTPException(status_code=409, detail="Phone already bound to another account")
    user.phone = phone
    session.add(user)
    session.commit()
    session.refresh(user)
    return serialize_user(user)


@router.get("/oauth/status")
def oauth_status():
    """Google/Apple OAuth 可用状态（供前端决定走真实授权还是 mock）。"""
    return {
        "google": {"enabled": bool(settings.GOOGLE_CLIENT_ID), "mock": settings.DEBUG},
        "apple": {"enabled": bool(settings.APPLE_CLIENT_ID), "mock": settings.DEBUG},
    }


def _oauth_find_or_create(
    session: Session,
    email: str,
    full_name: str | None,
) -> User:
    """按邮箱找/建 OAuth 用户（role=tenant, is_verified=True）。

    已存在直接复用；不存在则以随机密码创建并同步租客档案。返回 user（未校验 active）。
    """
    user = session.exec(select(User).where(User.email == email)).first()
    if not user:
        user = User(
            email=email,
            hashed_password=get_password_hash(secrets.token_hex(16)),
            full_name=(full_name or "").strip() or "用户",
            role=UserRole.tenant,
            is_verified=True,
        )
        session.add(user)
        session.commit()
        session.refresh(user)
        _sync_role_profile(session, user)
    return user


def _resolve_oauth_login(
    provider: str,
    client_id: str,
    verifier,
    req: OAuthLoginRequest,
) -> tuple[str, str | None]:
    """解析 OAuth 登录身份：(email, name)。

    顺序：已配置 → 校验真实 idToken；未配置 → DEBUG+mock_email 兜底。
    校验失败返回 401，非法 mock_email 返回 400，未配置返回 503。
    """
    fail_detail = f"{provider} login failed"
    not_configured = f"{provider} sign-in not configured"
    if client_id:
        data = verifier((req.id_token or "").strip())
        if not data:
            raise HTTPException(status_code=401, detail=fail_detail)
        if data.get("aud") != client_id:
            raise HTTPException(status_code=401, detail=fail_detail)
        return str(data.get("email")), data.get("name")
    elif settings.DEBUG and req.mock_email:
        mock = req.mock_email.strip()
        if _is_valid_email(mock):
            logger.info("oauth.mock %s=%s", provider.lower(), mock)
            return mock, None
        raise HTTPException(
            status_code=400,
            detail="Invalid mock email for developer sign-in",
        )
    else:
        raise HTTPException(status_code=503, detail=not_configured)


@router.post("/oauth/google", response_model=TokenResponse)
@limiter.limit(AUTH_LIMIT)
def oauth_google_login(
    request: Request,
    req: OAuthLoginRequest,
    session: Session = Depends(get_session),
):
    """Google OAuth 登录。未配置 GOOGLE_CLIENT_ID 时仅 DEBUG+mock_email 兜底。"""
    email, name = _resolve_oauth_login(
        "Google",
        settings.GOOGLE_CLIENT_ID,
        oauth_service.verify_google_id_token,
        req,
    )
    user = _oauth_find_or_create(session, email, name)
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")
    return _finalize_login(session, user)


@router.post("/oauth/apple", response_model=TokenResponse)
@limiter.limit(AUTH_LIMIT)
def oauth_apple_login(
    request: Request,
    req: OAuthLoginRequest,
    session: Session = Depends(get_session),
):
    """Apple OAuth 登录。未配置 APPLE_CLIENT_ID 时仅 DEBUG+mock_email 兜底。"""
    email, name = _resolve_oauth_login(
        "Apple",
        settings.APPLE_CLIENT_ID,
        oauth_service.verify_apple_id_token,
        req,
    )
    user = _oauth_find_or_create(session, email, name)
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")
    return _finalize_login(session, user)


@router.post("/refresh", response_model=TokenResponse)
@limiter.limit(AUTH_LIMIT)
def refresh(
    request: Request,
    req: RefreshRequest,
    session: Session = Depends(get_session),
):
    """使用刷新令牌换取新的访问令牌与刷新令牌。"""
    payload = decode_access_token(req.refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")
    try:
        user_uid = uuid.UUID(user_id) if isinstance(user_id, str) else user_id
    except (ValueError, AttributeError):
        raise HTTPException(status_code=401, detail="Invalid token payload")
    user = session.get(User, user_uid)
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")
    if is_token_revoked(payload, user):
        raise HTTPException(status_code=401, detail="Token revoked, please login again")
    return _build_token_response(user)


@router.post("/logout", response_model=LogoutResponse)
def logout(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """登出：吊销该账号此前签发的所有令牌。

    JWT 自包含、无法单独作废，故这里递增账号的令牌版本号：此后凡是 `tv` 与账号当前
    版本不一致的 access / refresh 令牌都会被拒绝（未过期也无效）。

    因此登出对该账号的**所有端**生效；如需「只登出当前设备」，需要引入按 jti 的
    令牌黑名单（Redis），本项目暂未提供。
    """
    user.token_version = int(user.token_version or 0) + 1
    session.add(user)
    session.commit()
    return LogoutResponse(
        ok=True,
        token_version=user.token_version,
        message="Logged out. All previously issued tokens are now revoked.",
    )


@router.get("/me", response_model=UserMeOut)
def get_me(current_user: User = Depends(get_current_user)):
    return {
        "id": str(current_user.id),
        "email": current_user.email,
        "full_name": current_user.full_name,
        "role": current_user.role.value,
    }


class UpdateSelfRequest(BaseModel):
    """更新当前用户资料：允许全名/手机/邮箱/头像；其余字段忽略。"""

    full_name: str | None = None
    phone: str | None = None
    email: str | None = None
    avatar_url: str | None = None


@router.patch("/me")
def update_me(
    req: UpdateSelfRequest,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """更新当前用户资料。

    邮箱 / 手机号若与**其它**账号冲突返回 409；未提供的字段保持不变。
    返回按项目既有方式脱敏后的最新用户。
    """
    data = req.model_dump(exclude_unset=True)
    if not data:
        return serialize_user(user)

    if data.get("email") is not None and data["email"] != user.email:
        clash = session.exec(
            select(User).where(User.email == data["email"], User.id != user.id)
        ).first()
        if clash:
            raise HTTPException(status_code=409, detail="Email already in use")
        user.email = data["email"]
    if data.get("phone") is not None and data["phone"] != user.phone:
        clash = session.exec(
            select(User).where(User.phone == data["phone"], User.id != user.id)
        ).first()
        if clash:
            raise HTTPException(status_code=409, detail="Phone already in use")
        user.phone = data["phone"]
    if data.get("full_name") is not None:
        user.full_name = data["full_name"]
    if data.get("avatar_url") is not None:
        user.avatar_url = data["avatar_url"]

    session.add(user)
    session.commit()
    session.refresh(user)
    return serialize_user(user)


@router.post("/me/avatar")
async def upload_avatar(
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """上传当前用户头像（multipart）。

    图片落到本地 `uploads/avatars`，该目录由 /uploads/avatars 静态托管，前端
    可直接以返回的站内 URL 作为 img/Image 的 src。校验：扩展名白名单 +
    文件头魔数确认（挡改名伪装）+ 体积上限（2MB）+ 服务端生成文件名。
    上传成功后直接回写 user.avatar_url 并返回最新用户。
    """
    digest = hashlib.sha256()
    avatar_url = save_upload(
        file,
        AVATAR_UPLOAD_DIR,
        MAX_AVATAR_SIZE,
        set(ALLOWED_AVATAR_TYPES),
        {ext: {mime} for ext, (mime, _) in ALLOWED_AVATAR_TYPES.items()},
        detector=detect_image_mime,
        name_prefix="avatar",
        url_prefix=AVATAR_URL_PREFIX,
        label="avatar",
        supported_text="（支持 JPG / PNG / WEBP / GIF）",
        digest=digest,
    )
    user.avatar_url = avatar_url
    session.add(user)
    session.commit()
    session.refresh(user)
    return serialize_user(user)


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str


@router.post("/me/password")
def change_password(
    req: ChangePasswordRequest,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """修改当前用户密码：校验旧密码，成功则递增 token_version 使其它会话失效。"""
    if not req.new_password or len(req.new_password) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters")
    if not verify_password(req.old_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect old password")
    user.hashed_password = get_password_hash(req.new_password)
    user.token_version = int(user.token_version or 0) + 1
    session.add(user)
    session.commit()
    return {
        "ok": True,
        "message": "Password updated. Other sessions have been signed out.",
    }


class PreferencesOut(BaseModel):
    language: str = "zh"
    timezone: str | None = None
    notify_email: bool = True
    notify_push: bool = True


class UpdatePreferencesRequest(BaseModel):
    """个人偏好：合并语义，仅更新传入字段。language 限定 zh/en/th。"""

    language: str | None = None
    timezone: str | None = None
    notify_email: bool | None = None
    notify_push: bool | None = None


def _prefs_to_out(user: User) -> PreferencesOut:
    return PreferencesOut(
        language=(user.preferred_language or "zh"),
        timezone=user.timezone,
        notify_email=user.notify_email,
        notify_push=user.notify_push,
    )


@router.get("/me/preferences", response_model=PreferencesOut)
def get_my_preferences(user: User = Depends(get_current_user)):
    """读取当前用户个人偏好。"""
    return _prefs_to_out(user)


@router.patch("/me/preferences", response_model=PreferencesOut)
def update_my_preferences(
    req: UpdatePreferencesRequest,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """更新当前用户个人偏好（合并语义，只更新传入的字段）。"""
    data = req.model_dump(exclude_unset=True)
    if data.get("language") is not None:
        lang = data["language"]
        if lang not in ("zh", "en", "th"):
            raise HTTPException(status_code=400, detail="language must be one of zh/en/th")
        user.preferred_language = lang
    if data.get("timezone") is not None:
        if not data["timezone"].strip():
            raise HTTPException(status_code=400, detail="timezone must not be empty")
        user.timezone = data["timezone"]
    if data.get("notify_email") is not None:
        user.notify_email = bool(data["notify_email"])
    if data.get("notify_push") is not None:
        user.notify_push = bool(data["notify_push"])

    session.add(user)
    session.commit()
    session.refresh(user)
    return _prefs_to_out(user)


@router.delete("/me")
def delete_me(session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    """账号注销（G2）：软删除并匿名化 PII。

    说明：合同/财务记录按法定留存期保留（不可删，G1），仅移除可识别个人信息的字段，
    并将账号置为停用。data 如需彻底物理删除，另行走保留期到期清理任务。
    """
    user.is_active = False
    user.email = f"deleted-{uuid.uuid4().hex[:12]}@deleted.local"  # 匿名化邮箱（保持唯一）
    user.phone = None
    user.full_name = "已注销用户"
    user.avatar_url = None
    session.add(user)
    session.commit()
    return {
        "ok": True,
        "message": "Account deactivated and personal data anonymized. Financial/contract records retained per legal retention.",
    }
