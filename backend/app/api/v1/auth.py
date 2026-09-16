"""认证路由：登录、注册、刷新令牌、获取当前用户信息。"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlmodel import Session, select
from pydantic import BaseModel, ConfigDict

from app.db import get_session
from app.core.rate_limit import AUTH_LIMIT, limiter
from app.core.security import (
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_access_token,
    get_password_hash,
)
from app.core.auth import get_current_user, is_token_revoked
from app.models.user import User, UserRole
from app.models.owner import Owner
from app.models.tenant import Tenant

router = APIRouter(prefix="/auth", tags=["auth"])


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
    email: str
    password: str
    full_name: str
    role: UserRole = UserRole.tenant
    phone: str | None = None


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


@router.post("/login", response_model=TokenResponse)
@limiter.limit(AUTH_LIMIT)
def login(
    request: Request,
    form: OAuth2PasswordRequestForm = Depends(),
    session: Session = Depends(get_session),
):
    from datetime import datetime as _dt

    user = session.exec(select(User).where(User.email == form.username)).first()
    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")
    # 记录登录时间（运营看板 DAU/MAU 数据源）
    user.last_login_at = _dt.utcnow()
    session.add(user)
    session.commit()
    return _build_token_response(user)


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
    existing = session.exec(select(User).where(User.email == req.email)).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(
        email=req.email,
        hashed_password=get_password_hash(req.password),
        full_name=req.full_name,
        role=req.role,
        phone=req.phone,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    # 同步建立业主/租客档案，保证登录后各端页面可正常拉取数据
    if req.role == UserRole.owner:
        session.add(Owner(user_id=user.id, owner_type="individual"))
    elif req.role == UserRole.tenant:
        session.add(Tenant(user_id=user.id))
    session.commit()
    return _build_token_response(user)


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
