"""公司信息路由：公开读取 + 管理员更新（持久化单行配置）。

- `GET  /company/info`　公开：供落地页/对外展示；无配置时回落静态占位。
- `PUT  /company/info`　管理员：upsert 公司资料（此前只有占位，前端保存会 404）。
- `POST /company/info/logo`　管理员：上传公司 Logo（multipart，落 /uploads/company）。
- `DELETE /company/info/logo`　管理员：移除公司 Logo（清库 + 删盘）。
- `GET/PUT /company/settings`　通知规则 / 支付渠道 / 业务提醒参数（管理员，设置页两个
  tab 的「保存」此前只是前端 `setTimeout` 假成功，改了不落库、刷新即回退）。
"""
from pathlib import Path
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, File, UploadFile
from pydantic import BaseModel, ConfigDict, Field
from sqlmodel import Session

from app.config import settings as app_settings
from app.core.auth import require_admin
from app.core.uploads import detect_image_mime, resolve_stored_path, save_upload
from app.db import get_session
from app.models.user import User
from app.models.company_profile import (
    CompanyProfile,
    get_company_profile,
    upsert_company_profile,
)

router = APIRouter(prefix="/company", tags=["company"])

# 公司 Logo 落盘目录 / 静态 URL 前缀 / 体积上限 / 允许的扩展名与魔数。
# backend/uploads/company 由 main.py 以 /uploads/company 静态托管（同头像）。
LOGO_UPLOAD_DIR = Path(__file__).resolve().parents[3] / "uploads" / "company"
LOGO_URL_PREFIX = "/uploads/company/"
MAX_LOGO_SIZE = 2 * 1024 * 1024  # 2MB
ALLOWED_LOGO_TYPES: Dict[str, str] = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
}

# 社媒字段白名单（GET 与 PUT 共用，避免两处口径不一致导致保存后读不回来）
SOCIAL_KEYS = ("wechat", "line", "whatsapp", "facebook", "instagram")


class CompanyInfoOut(BaseModel):
    """`GET /company/info`：公司联系信息。"""

    model_config = ConfigDict(extra="allow")

    name: Optional[str] = None
    version: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    logo_url: Optional[str] = None
    social_media: Optional[Dict[str, str]] = None
    reg_no: Optional[str] = None
    currency: Optional[str] = None
    timezone: Optional[str] = None
    updated_at: Optional[str] = None


class CompanyInfoIn(BaseModel):
    """`PUT /company/info`：管理员更新公司资料。"""

    model_config = ConfigDict(extra="allow")

    name: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    social_media: Optional[Dict[str, str]] = None
    reg_no: Optional[str] = None
    currency: Optional[str] = None
    timezone: Optional[str] = None


# ------------------------------------------------------------ 系统配置
# 通知规则默认值（与前端 Settings 页原本写死的常量一致；未配置时返回它，
# 保证「通知设置」tab 始终有可编辑的初始规则，而不是一屏空白）。
DEFAULT_NOTIFY_ROWS: List[dict] = [
    {
        "key": "rent",
        "title": "租金到期提醒",
        "desc": "租金到期前向租客发送提醒通知",
        "channels": {"email": True, "sms": True, "push": False},
        "enabled": True,
    },
    {
        "key": "lease",
        "title": "合同到期提醒",
        "desc": "合同到期前通知业主与租客",
        "channels": {"email": True, "sms": False, "push": True},
        "enabled": True,
    },
    {
        "key": "register",
        "title": "新租客注册通知",
        "desc": "新租客完成注册后通知管理员",
        "channels": {"email": True, "sms": False, "push": True},
        "enabled": True,
    },
    {
        "key": "payment",
        "title": "付款确认通知",
        "desc": "收到租金付款后向租客发送确认",
        "channels": {"email": True, "sms": True, "push": False},
        "enabled": True,
    },
    {
        "key": "maintenance",
        "title": "维修申请通知",
        "desc": "租客提交维修申请后通知业主与员工",
        "channels": {"email": True, "sms": True, "push": True},
        "enabled": True,
    },
    {
        "key": "system",
        "title": "系统维护通知",
        "desc": "计划内系统维护提前通知全体用户",
        "channels": {"email": True, "sms": False, "push": True},
        "enabled": False,
    },
]

# 支付渠道默认值：只保留渠道结构与字段名，**不放示例账号/密钥**——
# 这些值现在会真正落库并对外展示，写死示例号等于把伪造数据当真实配置。
DEFAULT_PAYMENT_CHANNELS: List[dict] = [
    {
        "key": "bank",
        "name": "银行转账",
        "desc": "支持 Bangkok Bank / Kasikorn / SCB 网银转账",
        "enabled": True,
        "icon": '<path d="M3 21h18"/><path d="M3 10h18"/><path d="M5 6l7-3 7 3"/><path d="M4 10v11"/><path d="M20 10v11"/><path d="M8 14v3"/><path d="M12 14v3"/><path d="M16 14v3"/>',
        "fields": [
            {"label": "Bangkok Bank 账号", "value": "", "mono": True},
            {"label": "Kasikorn 账号", "value": "", "mono": True},
            {"label": "PromptPay 账号", "value": "", "mono": True},
            {"label": "账户持有人姓名", "value": "", "mono": False},
        ],
    },
    {
        "key": "card",
        "name": "信用卡",
        "desc": "Visa / Mastercard 在线支付",
        "enabled": True,
        "icon": '<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>',
        "fields": [{"label": "商户 ID (Merchant ID)", "value": "", "mono": True}],
        "cards": [
            {"name": "Visa", "checked": True},
            {"name": "Mastercard", "checked": True},
            {"name": "American Express", "checked": False},
        ],
    },
    {
        "key": "alipay",
        "name": "支付宝",
        "desc": "Alipay 跨境收款",
        "enabled": False,
        "icon": '<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/>',
        "fields": [
            {"label": "商户 ID (Partner ID)", "value": "", "mono": True},
            {"label": "API Key", "value": "", "mono": True, "password": True, "hint": "出于安全考虑，密钥已加密保存"},
        ],
    },
    {
        "key": "wechat",
        "name": "微信支付",
        "desc": "WeChat Pay 跨境收款",
        "enabled": False,
        "icon": '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
        "fields": [
            {"label": "商户 ID (MCH ID)", "value": "", "mono": True},
            {"label": "API Key", "value": "", "mono": True, "password": True, "hint": "出于安全考虑，密钥已加密保存"},
        ],
    },
    {
        "key": "wise",
        "name": "Wise",
        "desc": "Wise Business 跨境收款",
        "enabled": False,
        "icon": '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
        "fields": [{"label": "Wise Business ID", "value": "", "mono": True}],
    },
]

# 业务提醒参数默认值（App 管理端「业务设置」展示的就是这三个值）
DEFAULT_BUSINESS: dict = {
    "rent_reminder_days": 7,
    "lease_reminder_days": 30,
    "auto_dunning": True,
}


class NotifyChannelsIn(BaseModel):
    """通知渠道开关。"""

    email: bool = False
    sms: bool = False
    push: bool = False


class NotifyRowIn(BaseModel):
    """一条通知规则。"""

    key: str = Field(max_length=50)
    title: str = Field(default="", max_length=100)
    desc: str = Field(default="", max_length=200)
    channels: NotifyChannelsIn = Field(default_factory=NotifyChannelsIn)
    enabled: bool = True


class PaymentFieldIn(BaseModel):
    """支付渠道下的一个配置项。"""

    label: str = Field(default="", max_length=100)
    value: str = Field(default="", max_length=500)
    mono: bool = False
    password: bool = False
    hint: Optional[str] = Field(default=None, max_length=200)


class PaymentCardIn(BaseModel):
    """支持的卡种。"""

    name: str = Field(default="", max_length=50)
    checked: bool = False


class PaymentChannelIn(BaseModel):
    """一个支付渠道。"""

    key: str = Field(max_length=50)
    name: str = Field(default="", max_length=100)
    desc: str = Field(default="", max_length=200)
    enabled: bool = False
    icon: str = Field(default="", max_length=1000)
    fields: List[PaymentFieldIn] = Field(default_factory=list)
    cards: Optional[List[PaymentCardIn]] = None


class BusinessSettingsIn(BaseModel):
    """业务提醒参数（天数上下限挡住误填）。"""

    rent_reminder_days: int = Field(default=7, ge=0, le=180)
    lease_reminder_days: int = Field(default=30, ge=0, le=365)
    auto_dunning: bool = True


class CompanySettingsIn(BaseModel):
    """`PUT /company/settings`：管理员更新系统配置。"""

    notify_rows: Optional[List[NotifyRowIn]] = None
    payment_channels: Optional[List[PaymentChannelIn]] = None
    business: Optional[BusinessSettingsIn] = None


class CompanySettingsOut(BaseModel):
    """`GET /company/settings`：通知规则 / 支付渠道 / 业务提醒参数。"""

    model_config = ConfigDict(extra="allow")

    notify_rows: List[Dict[str, object]] = Field(default_factory=list)
    payment_channels: List[Dict[str, object]] = Field(default_factory=list)
    business: Dict[str, object] = Field(default_factory=dict)


def _settings_payload(profile: CompanyProfile) -> Dict[str, object]:
    """读配置：库里有就按库里的返回，缺哪段补哪段的默认值。"""
    raw = profile.settings if isinstance(profile.settings, dict) else {}
    notify = raw.get("notify_rows")
    channels = raw.get("payment_channels")
    business = raw.get("business")
    return {
        "notify_rows": notify if isinstance(notify, list) and notify else DEFAULT_NOTIFY_ROWS,
        "payment_channels": channels
        if isinstance(channels, list) and channels
        else DEFAULT_PAYMENT_CHANNELS,
        "business": {**DEFAULT_BUSINESS, **(business if isinstance(business, dict) else {})},
    }


def _soc(profile: CompanyProfile) -> Dict[str, str]:
    """规范化为 dict（缺省给空串，与旧响应结构保持一致）。"""
    raw = profile.social_media
    base = {key: "" for key in SOCIAL_KEYS}
    if raw:
        for k, v in raw.items():
            if isinstance(v, str):
                base[k] = v
    return base


def _serialize(profile: CompanyProfile) -> Dict[str, object]:
    """统一响应体（GET / PUT / 上传 / 移除 四处共用）。"""
    return {
        "name": profile.name or app_settings.APP_NAME,
        "version": app_settings.APP_VERSION,
        "address": profile.address or "请配置公司地址",
        "phone": profile.phone or "请配置公司电话",
        "email": profile.email or "请配置公司邮箱",
        "website": profile.website or "",
        "logo_url": profile.logo_url or "",
        "social_media": _soc(profile),
        # 此前这三项只有前端写死的示例值（注册号/币种/时区），改成真实读写
        "reg_no": profile.reg_no or "",
        "currency": profile.currency or "",
        "timezone": profile.timezone or "",
        # 页面右上角「最后更新」此前是写死的日期，改为真实更新时间
        "updated_at": profile.updated_at.isoformat() if profile.updated_at else "",
    }


@router.get("/info", response_model=CompanyInfoOut)
def get_company_info(session: Session = Depends(get_session)):
    """公开接口，返回公司资料（持久化配置，缺省回落占位）。"""
    return _serialize(get_company_profile(session))


@router.put("/info", response_model=CompanyInfoOut)
def update_company_info(
    req: CompanyInfoIn,
    session: Session = Depends(get_session),
    user: User = Depends(require_admin),
):
    """管理员更新公司资料并持久化。"""
    data = req.model_dump(exclude_none=True)
    if "social_media" in data and isinstance(data["social_media"], dict):
        # 只收白名单字段，避免把任意键写进 JSON 列
        data["social_media"] = {
            k: v for k, v in data["social_media"].items() if k in SOCIAL_KEYS and isinstance(v, str)
        }
    profile = upsert_company_profile(session, data)
    return _serialize(profile)


@router.post("/info/logo", response_model=CompanyInfoOut)
async def upload_company_logo(
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    user: User = Depends(require_admin),
):
    """上传公司 Logo（multipart）。

    校验：扩展名白名单 + 文件头魔数（挡改名伪装）+ 体积上限 2MB + 服务端生成文件名。
    落盘目录由 /uploads/company 静态托管，返回值可直接作为 img 的 src。
    """
    logo_url = save_upload(
        file,
        LOGO_UPLOAD_DIR,
        MAX_LOGO_SIZE,
        set(ALLOWED_LOGO_TYPES),
        {ext: {mime} for ext, mime in ALLOWED_LOGO_TYPES.items()},
        detector=detect_image_mime,
        name_prefix="logo",
        url_prefix=LOGO_URL_PREFIX,
        label="logo",
        supported_text="（支持 JPG / PNG / WEBP / GIF）",
    )
    profile = upsert_company_profile(session, {"logo_url": logo_url})
    return _serialize(profile)


@router.delete("/info/logo", response_model=CompanyInfoOut)
def remove_company_logo(
    session: Session = Depends(get_session),
    user: User = Depends(require_admin),
):
    """移除公司 Logo：清空库中字段并删除磁盘文件（避免留下孤儿文件）。"""
    profile = get_company_profile(session)
    current = profile.logo_url
    if current:
        try:
            resolve_stored_path(current, LOGO_UPLOAD_DIR, LOGO_URL_PREFIX, "logo_url")
            (LOGO_UPLOAD_DIR / current[len(LOGO_URL_PREFIX):]).unlink(missing_ok=True)
        except Exception:
            # 文件已不在磁盘（例如人工清理）时不应阻塞「移除」动作
            pass
    profile = upsert_company_profile(session, {"logo_url": ""})
    return _serialize(profile)


@router.get("/settings", response_model=CompanySettingsOut)
def get_company_settings(
    session: Session = Depends(get_session),
    user: User = Depends(require_admin),
):
    """读取系统配置（通知规则 / 支付渠道 / 业务提醒参数）。

    仅管理员可读：支付渠道里含收款账号等配置，不能公开。
    未配置时回落默认值，保证设置页各 tab 始终有可编辑的初始内容。
    """
    return _settings_payload(get_company_profile(session))


@router.put("/settings", response_model=CompanySettingsOut)
def update_company_settings(
    req: CompanySettingsIn,
    session: Session = Depends(get_session),
    user: User = Depends(require_admin),
):
    """管理员保存系统配置（此前前端只是 setTimeout 假成功，改了不落库）。"""
    data = req.model_dump(exclude_none=True)
    current = _settings_payload(get_company_profile(session))
    current.update(data)
    profile = upsert_company_profile(session, {"settings": current})
    return _settings_payload(profile)