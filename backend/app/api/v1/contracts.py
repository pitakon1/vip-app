"""电子签合同路由。

- POST /contracts/generate     根据租约/用户信息自动生成合同（HTML + 哈希）
- GET  /contracts/{id}         合同详情（含当事人）
- PATCH /contracts/{id}        编辑合同标题/正文（重新计算哈希，已签署不可改）
- POST /contracts/{id}/parties 为合同追加签署方
- POST /contracts/{id}/sign    某方数字签名
- POST /contracts/{id}/upload  上传经纪人自有电子合同（PDF/图片），建立 uploaded 来源合同
- POST /contracts/{id}/share-link 为某签署方生成免登录签署链接（未注册客户通道）
- POST /contracts/{id}/send    向签署方推送签署通知（站内 + 邮件）
- POST /contracts/{id}/void    作废合同
- GET  /contracts              当前用户相关合同列表

## 鉴权口径（修复：此前四个端点只校验「已登录」）

- `generate` / `add_party` / `upload` / `share-link` / `send` / `void` / `patch` 是
  **平台作业动作**，限员工（admin/agent/employee）。
- `list` / `get` 走 `contract_visibility_conditions()` / `can_view_contract()`：
  员工全量，业主/租客仅本人作为签署方或挂在本人租约下的合同。
  此前任意登录用户可列全站合同、读任意合同全文（正文含双方证件号）。
- `sign` 必须由**该签署方本人**发起：`party.user_id == 当前用户` 或邮箱归属；
  员工不再允许代签他人身份（未注册的外部签署方走免登录令牌链路），
  签名姓名一律取服务端 `party.name`，不接受客户端传入——否则可自填姓名冒充他人签署。
- 未注册客户走 `/public/contract-sign/{token}`（令牌一次性、可过期），
  不经过登录态，签署留痕写真实 IP。
"""
import base64
import hashlib
import logging
import os
import re
import secrets
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Optional

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Request,
    UploadFile,
)
from pydantic import BaseModel, ConfigDict
from sqlmodel import Session, select
from starlette.responses import FileResponse, Response

from app.config import settings
from app.core.auth import (
    STAFF_ROLES,
    can_view_contract,
    contract_visibility_conditions,
    get_current_user,
    get_current_user_allow_query_token,
    party_belongs_to_user,
    require_employee,
)
from .auth import (
    _consume_otp,
    _issue_otp,
    _send_code,
)
from app.core.uploads import resolve_stored_path, save_upload
from app.db import get_session
from app.models import (
    Notification,
    NotificationChannel,
    NotificationStatus,
    User, Contract, ContractStatus, ContractKind, ContractSource, ContractParty,
    ContractSignOrder, ContractCallbackEvent, ContractCallbackStatus,
    SignerRole, SignatureRecord, ContractSignField, SignFieldType, SignMethod,
)
from app.providers.notification.base import (
    NotificationChannel as ProviderChannel,
    NotificationMessage,
)
from app.providers.notification.router import notification_router
from app.services import esign_service
from app.services import contract_jobs
from app.services.contract_identity import MATCHED, ContractIdentityResolver
from app.services.serial_number import next_no
from .documents import ALLOWED_DOCUMENT_TYPES

router = APIRouter(prefix="/contracts", tags=["contracts"])

logger = logging.getLogger(__name__)

# 上传合同的落盘目录（backend/uploads/contracts）。
# 与 documents 一样**不**由 /uploads 静态服务托管：合同正文含双方证件号，
# 一律经带令牌校验的读取接口分发（见 contract_sign_public.py）。
UPLOAD_DIR = Path(__file__).resolve().parents[3] / "uploads" / "contracts"
MAX_CONTRACT_SIZE = 20 * 1024 * 1024  # 单个合同文件 20MB
STORED_URL_PREFIX = "/uploads/contracts/"

# 免登录签署链接默认有效期（天）。免登录链接是「持有即可签」的强凭据，
# 默认 3 天、上限 7 天：足够客户走完签署，又不至于长期滞留可被转发的链接。
# 重新生成链接会覆盖旧 token，旧链接立即失效。
_DEFAULT_TOKEN_DAYS = 3
_MAX_TOKEN_DAYS = 7


def _get_visible_contract(session: Session, user: User, contract_id: uuid.UUID) -> Contract:
    """取合同并做归属校验；不可见时统一 404（不回显「存在但你没权限」）。"""
    contract = session.get(Contract, contract_id)
    if not contract or contract.deleted_at:
        raise HTTPException(status_code=404, detail="Contract not found")
    if not can_view_contract(session, user, contract):
        raise HTTPException(status_code=404, detail="Contract not found")
    return contract


class ContractSummary(BaseModel):
    """合同列表条目。"""

    id: Optional[str] = None
    title: Optional[str] = None
    kind: Optional[str] = None
    status: Optional[str] = None
    language: Optional[str] = None
    document_hash: Optional[str] = None
    created_at: Optional[str] = None
    signed_at: Optional[str] = None
    model_config = ConfigDict(extra="allow")


class ContractPartyResponse(BaseModel):
    """合同签署方。"""

    id: Optional[str] = None
    name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
    signed: Optional[bool] = None
    signed_at: Optional[str] = None
    model_config = ConfigDict(extra="allow")


class ContractDetailResponse(BaseModel):
    """合同详情（含当事人）。"""

    id: Optional[str] = None
    title: Optional[str] = None
    status: Optional[str] = None
    language: Optional[str] = None
    document_hash: Optional[str] = None
    content_html: Optional[str] = None
    created_at: Optional[str] = None
    parties: Optional[List[ContractPartyResponse]] = None
    model_config = ConfigDict(extra="allow")


@router.post("/generate")
def generate_contract(
    payload: dict,
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """按租约/房源/用户信息自动生成合同。payload: {counters: {...}, language?, kind?}

    限员工调用（平台作业动作）。门控用 `Depends(require_employee)` 声明式表达，
    便于鉴权矩阵自动比对各角色的实际响应。
    """
    counters = payload.get("counters") or {}
    language = payload.get("language", "zh")
    kind = payload.get("kind", "lease")
    try:
        contract_kind = ContractKind(kind)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid kind: {kind}")

    def _to_uuid(value, field: str):
        """把字符串 uuid 转为 uuid.UUID；非法值 400（否则 UUID 列绑定处理器崩溃 500）。"""
        if value is None:
            return None
        try:
            return uuid.UUID(str(value))
        except (ValueError, TypeError, AttributeError):
            raise HTTPException(status_code=400, detail=f"Invalid {field}")

    lease_id = _to_uuid(payload.get("lease_id"), "lease_id")
    property_id = _to_uuid(payload.get("property_id"), "property_id")

    meta = esign_service.generate_contract(counters, language, kind=contract_kind.value)
    contract = Contract(
        contract_no=next_no(session, "HT"),
        lease_id=lease_id,
        property_id=property_id,
        title=meta["title"],
        kind=contract_kind,
        source=ContractSource.generated,
        created_by=user.id,
        language=language,
        content_html=meta["content_html"],
        document_hash=meta["document_hash"],
        file_path=meta["file_path"],
        pdf_path=meta.get("pdf_path"),
        counters=counters,
        status=ContractStatus.draft,
    )
    session.add(contract)
    session.commit()
    session.refresh(contract)
    return {
        "id": str(contract.id),
        "title": contract.title,
        "kind": contract.kind.value,
        "source": contract.source.value,
        "status": contract.status.value,
        "document_hash": contract.document_hash,
        "file_path": contract.file_path,
        "content_html": contract.content_html,
    }


@router.get("/templates")
def list_contract_templates(user: User = Depends(require_employee)):
    """可用合同模板列表（kind → 展示名）。限员工访问，与生成合同同权限。

    从 esign_service 内置模板注册表动态生成，示例：
    [{kind: "lease", title: "租赁合同"}, {kind: "purchase", title: "房屋买卖合同"},
     {kind: "broker", title: "经纪人协议"}]
    """
    return esign_service.list_templates()


@router.post("/{contract_id}/parties")
def add_party(
    contract_id: uuid.UUID,
    payload: dict,
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """为合同追加签署方。限员工调用。

    追加签署方会写入证件号等 PII，且决定谁有权签署，属平台作业动作。
    """
    _get_visible_contract(session, user, contract_id)
    try:
        role = SignerRole(payload.get("role", "tenant"))
    except ValueError:
        raise HTTPException(status_code=400, detail="非法签署角色")
    user_id_raw = payload.get("user_id")
    try:
        user_id_u = uuid.UUID(str(user_id_raw)) if user_id_raw else None
    except (ValueError, TypeError, AttributeError):
        raise HTTPException(status_code=400, detail="Invalid user_id")

    email = (payload.get("email") or "").strip()
    # 未显式指定归属用户时，走统一身份解析（手机 → 邮箱；姓名只标记不认定）。
    # 合作方手输常带 +86、空格、全角字符或邮箱大小写差异，逐字比对会漏绑；
    # 手机与邮箱指向不同用户时不猜，保持未绑定，交人工确认。
    if user_id_u is None:
        identity = ContractIdentityResolver(session).resolve_party_user(
            role=role,
            name=payload.get("name"),
            phone=payload.get("phone"),
            email=email,
        )
        if identity.reason == MATCHED:
            user_id_u = identity.user_id

    party = ContractParty(
        contract_id=contract_id,
        user_id=user_id_u,
        name=payload.get("name", ""),
        email=email,
        id_number=payload.get("id_number"),
        phone=payload.get("phone"),
        role=role,
        sign_order=_parse_sign_order(payload.get("sign_order")),
    )
    session.add(party)
    session.commit()
    session.refresh(party)
    return {
        "id": str(party.id),
        "name": party.name,
        "role": party.role.value,
        "signed": party.signed,
        "sign_order": party.sign_order,
    }


def _parse_sign_order(raw) -> int:
    """签署顺序解析：空/0 表示不限制；非负整数，非法值 400。"""
    if raw in (None, "", 0, "0"):
        return 0
    try:
        value = int(raw)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid sign_order")
    if value < 0:
        raise HTTPException(status_code=400, detail="Invalid sign_order")
    return value


@router.post("/{contract_id}/sign-order")
def set_sign_order(
    contract_id: uuid.UUID,
    payload: dict,
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """设置多人签署顺序。payload: {type: "parallel"|"sequential", orders?: [{party_id, order}]}

    - `type=sequential` 时，后序签署方在前序未签完前会被 409 NOT_YOUR_TURN 拦下；
    - `orders` 只允许改**未签署**方的序号；同序号视为同一轮（可并行）；
    - 默认 parallel，保持既有合同行为不变。
    """
    contract = _get_visible_contract(session, user, contract_id)
    _require_editable(contract)

    raw_type = str(payload.get("type") or ContractSignOrder.parallel.value)
    try:
        order_type = ContractSignOrder(raw_type)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid sign order type")

    parties = session.exec(
        select(ContractParty).where(ContractParty.contract_id == contract_id)
    ).all()
    by_id = {str(p.id): p for p in parties}

    orders = payload.get("orders") or []
    if not isinstance(orders, list):
        raise HTTPException(status_code=400, detail="Invalid orders")
    seen: set[int] = set()
    for item in orders:
        if not isinstance(item, dict):
            raise HTTPException(status_code=400, detail="Invalid order item")
        party = by_id.get(str(item.get("party_id") or ""))
        if party is None:
            raise HTTPException(status_code=404, detail="Party not found")
        if party.signed:
            raise HTTPException(status_code=409, detail="Party already signed")
        order = _parse_sign_order(item.get("order"))
        if order > 0:
            if order in seen:
                raise HTTPException(status_code=400, detail="Duplicated sign_order")
            seen.add(order)
        party.sign_order = order
        session.add(party)

    contract.sign_order_type = order_type
    session.add(contract)
    session.commit()
    session.refresh(contract)
    parties = session.exec(
        select(ContractParty).where(ContractParty.contract_id == contract_id)
    ).all()
    return {
        "contract_id": str(contract.id),
        "sign_order_type": contract.sign_order_type.value,
        "parties": [
            {"id": str(p.id), "name": p.name, "sign_order": p.sign_order, "signed": p.signed}
            for p in sorted(parties, key=lambda x: (x.sign_order or 10**6, x.created_at or datetime.min))
        ],
    }


@router.post("/{contract_id}/callback")
def set_contract_callback(
    contract_id: uuid.UUID,
    payload: dict,
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """配置签署完成回调。payload: {url: "" | "https://..."}

    - `url` 留空 = 关闭回调；
    - 首次配置会生成 `callback_secret`，随响应返回（对端用它对
      `HMAC-SHA256(body, secret)` 做验签，请求头 `X-Contract-Signature`）；
    - 幂等键为 `合同id:contract.signed`，对端按 `X-Idempotency-Key` 去重即可。
    """
    contract = _get_visible_contract(session, user, contract_id)
    url = (payload.get("url") or "").strip()
    if url:
        if len(url) > 500 or not re.match(r"^https?://", url, re.I):
            raise HTTPException(status_code=400, detail="Invalid callback url")
    contract.callback_url = url or None
    if url and not contract.callback_secret:
        contract.callback_secret = secrets.token_urlsafe(32)
    if not url:
        contract.callback_secret = None
    session.add(contract)
    session.commit()
    session.refresh(contract)
    return {
        "contract_id": str(contract.id),
        "callback_url": contract.callback_url,
        # 明文 secret 只在此接口返回；对端需自行安全保存
        "callback_secret": contract.callback_secret,
    }


@router.get("/{contract_id}/callbacks")
def list_contract_callbacks(
    contract_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """查看回调投递记录（排障用）。"""
    _get_visible_contract(session, user, contract_id)
    events = session.exec(
        select(ContractCallbackEvent)
        .where(ContractCallbackEvent.contract_id == contract_id)
        .order_by(ContractCallbackEvent.created_at.desc())
    ).all()
    return [
        {
            "id": str(e.id),
            "event": e.event,
            "url": e.url,
            "status": e.status.value,
            "attempts": e.attempts,
            "last_error": e.last_error,
            "last_attempt_at": e.last_attempt_at.isoformat() if e.last_attempt_at else None,
            "next_attempt_at": e.next_attempt_at.isoformat() if e.next_attempt_at else None,
            "delivered_at": e.delivered_at.isoformat() if e.delivered_at else None,
            "idempotency_key": e.idempotency_key,
        }
        for e in events
    ]


@router.post("/{contract_id}/callback/retry")
def retry_contract_callback(
    contract_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """人工重投最近一次回调（已成功投递则不重复发送）。"""
    _get_visible_contract(session, user, contract_id)
    event = session.exec(
        select(ContractCallbackEvent)
        .where(ContractCallbackEvent.contract_id == contract_id)
        .order_by(ContractCallbackEvent.created_at.desc())
    ).first()
    if event is None:
        raise HTTPException(status_code=404, detail="No callback event")
    if event.status != ContractCallbackStatus.delivered:
        # 人工重投：立即试一次；失败后仍按后台计划继续重试
        _deliver_callback(session, event)
    return {
        "id": str(event.id),
        "status": event.status.value,
        "attempts": event.attempts,
        "last_error": event.last_error,
        "next_attempt_at": event.next_attempt_at.isoformat() if event.next_attempt_at else None,
    }


@router.post("/{contract_id}/sign-fields")
def upsert_sign_fields(
    contract_id: uuid.UUID,
    payload: dict,
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """批量放置/更新签署区字段。payload: {fields: [{id?, party_id, field_type, page, x, y, w, h, required?}]}

    限员工调用（合同管理与放置动作）。已签署的字段禁止改位置/归属。
    校验 party_id 归属该合同、field_type 合法。逐个 add+flush（SQLite 不依赖 bulk upsert）。
    """
    contract = _get_visible_contract(session, user, contract_id)
    _require_editable(contract)

    raw_fields = payload.get("fields") or []
    if not isinstance(raw_fields, list) or not raw_fields:
        raise HTTPException(status_code=400, detail="fields is required")

    # 预取合同全部签署方，用于归属校验
    parties = session.exec(
        select(ContractParty).where(ContractParty.contract_id == contract_id)
    ).all()
    party_ids = {p.id for p in parties}

    result_ids = []
    for item in raw_fields:
        if not isinstance(item, dict):
            raise HTTPException(status_code=400, detail="Invalid field item")

        # field_type 合法性
        raw_type = str(item.get("field_type", "signature"))
        try:
            field_type = SignFieldType(raw_type)
        except ValueError:
            raise HTTPException(
                status_code=400, detail=f"Invalid field_type: {raw_type}"
            )

        # party_id：可空；若给则须归属该合同
        party_id = None
        raw_party = item.get("party_id")
        if raw_party:
            try:
                party_id = uuid.UUID(str(raw_party))
            except (ValueError, TypeError, AttributeError):
                raise HTTPException(status_code=400, detail="Invalid party_id")
            if party_id not in party_ids:
                raise HTTPException(status_code=404, detail="Party not found")

        try:
            page = int(item.get("page", 1))
            x = min(100.0, max(0.0, float(item.get("x", 0.0) or 0.0)))
            y = min(100.0, max(0.0, float(item.get("y", 0.0) or 0.0)))
            # 尺寸兜底：缺省/0 会在前端渲染成 0×0 的隐形签署框（看不见也点不到），
            # 与 /sign-self、/sign-batch 保持同一口径（默认 20×8 页面百分比）。
            w = min(100.0, max(1.0, float(item.get("w", 0.0) or 0.0) or 20.0))
            h = min(100.0, max(1.0, float(item.get("h", 0.0) or 0.0) or 8.0))
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="Invalid coordinates")
        required = bool(item.get("required", True))

        raw_id = item.get("id")
        if raw_id:
            try:
                field_id = uuid.UUID(str(raw_id))
            except (ValueError, TypeError, AttributeError):
                raise HTTPException(status_code=400, detail="Invalid field id")
            field = session.get(ContractSignField, field_id)
            if not field or field.contract_id != contract_id:
                raise HTTPException(status_code=404, detail="Sign field not found")
            if field.signed:
                raise HTTPException(
                    status_code=409, detail="Cannot edit a signed field"
                )
            field.field_type = field_type
            field.party_id = party_id
            field.page = page
            field.x = x
            field.y = y
            field.w = w
            field.h = h
            field.required = required
        else:
            field = ContractSignField(
                contract_id=contract_id,
                party_id=party_id,
                field_type=field_type,
                page=page,
                x=x,
                y=y,
                w=w,
                h=h,
                required=required,
                created_by=user.id,
            )
            session.add(field)
        session.add(field)
        session.flush()  # 逐个 flush，拿回 id
        result_ids.append(field.id)

    session.commit()
    # 返回该合同新 sign_fields 列表
    return {
        "contract_id": str(contract_id),
        "sign_fields": _get_sign_fields(session, contract_id, user),
    }


@router.delete("/{contract_id}/sign-fields/{field_id}")
def delete_sign_field(
    contract_id: uuid.UUID,
    field_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """删除未签署的签署区字段。限员工调用。"""
    contract = _get_visible_contract(session, user, contract_id)
    _require_editable(contract)
    field = session.get(ContractSignField, field_id)
    if not field or field.contract_id != contract_id:
        raise HTTPException(status_code=404, detail="Sign field not found")
    if field.signed:
        raise HTTPException(status_code=409, detail="Cannot delete a signed field")
    session.delete(field)
    session.commit()
    return {"deleted": True, "id": str(field_id)}


def _sign_url(token: str) -> str:
    """拼免登录签署链接；未配置站点前缀时返回相对路径，由前端补 origin。"""
    base = (settings.PUBLIC_WEB_BASE_URL or "").strip().rstrip("/")
    path = f"/sign/{token}"
    return f"{base}{path}" if base else path


def _qr_data_url(text: str) -> Optional[str]:
    """把签署链接转成 PNG data URL（二维码需绝对地址才能被手机扫描）。

    生成失败时返回 None，不影响链接本身下发（二维码属便利功能）。
    """
    try:
        import io

        import qrcode

        buf = io.BytesIO()
        qrcode.make(text).save(buf, format="PNG")
        return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")
    except Exception:  # noqa: BLE001  可选依赖/编码失败都不阻断
        logger.warning("contract.qr_generate_failed", extra={"text": text[:64]})
        return None


def _issue_sign_token(party: ContractParty, expires_in_days: int) -> str:
    """为签署方生成/续期免登录签署令牌（一次性，签署后清空）。"""
    days = expires_in_days or _DEFAULT_TOKEN_DAYS
    days = max(1, min(int(days), _MAX_TOKEN_DAYS))
    token = secrets.token_urlsafe(32)
    party.sign_token = token
    party.sign_token_expires_at = datetime.utcnow() + timedelta(days=days)
    return token


def _require_editable(contract: Contract) -> None:
    """已签署/已作废/已拒签的合同不允许再改内容或作废。"""
    if contract.status in (ContractStatus.signed, ContractStatus.completed):
        raise HTTPException(status_code=409, detail="Contract already signed")
    if contract.status in (ContractStatus.voided, ContractStatus.rejected):
        raise HTTPException(status_code=409, detail="Contract already finalized")


def _ensure_not_expired(session: Session, contract: Contract) -> None:
    """签署有效期校验：过期即置 `expired` 并拒绝签署。

    只推进「未完成」的合同；已签/已作废/已拒签不动，避免把历史结果改坏。
    过期是状态机的一条正常终态：留痕、已签 PDF、审计记录全部保留。
    """
    if not contract.expires_at:
        return
    if contract.expires_at >= datetime.utcnow():
        return
    if contract.status in (
        ContractStatus.draft,
        ContractStatus.sent,
        ContractStatus.partially_signed,
    ):
        contract.status = ContractStatus.expired
        session.add(contract)
        session.commit()
    raise HTTPException(status_code=409, detail="CONTRACT_EXPIRED")


def _deliver_callback(session: Session, event: ContractCallbackEvent) -> None:
    """投递一条回调事件（单次尝试，失败后由后台任务按 30s/2m/10m 计划重投）。

    - 幂等键固定为 `合同id:事件`，重试复用同一行、同一请求体；
    - 对端需按 `X-Idempotency-Key` 去重（本服务不会因重试产生新事件）；
    - 投递失败只记录，不影响签署结果（签署与回调解耦）。
    """
    contract_jobs.deliver_callback(session, event)


def _emit_contract_callback(
    session: Session,
    contract: Contract,
    event: str = "contract.signed",
    extra: Optional[dict] = None,
) -> None:
    """合同状态变化时生成并投递回调（未配置 callback_url 时跳过）。

    - `contract.signed`：全部签署方签完；
    - `contract.declined`：拒签导致流程终止（status=rejected）；
    - `contract.voided`：合同被人工作废。
    `extra` 用于补充事件专属字段（拒签方/原因、作废原因等）。
    """
    if not contract.callback_url:
        return
    key = f"{contract.id}:{event}"
    existing = session.exec(
        select(ContractCallbackEvent).where(ContractCallbackEvent.idempotency_key == key)
    ).first()
    if existing is not None and existing.status == ContractCallbackStatus.delivered:
        return  # 已成功投递，重复触发不再发送（幂等）
    if existing is None:
        if not contract.callback_secret:
            contract.callback_secret = secrets.token_urlsafe(32)
            session.add(contract)
        parties = session.exec(
            select(ContractParty).where(ContractParty.contract_id == contract.id)
        ).all()
        payload = {
            "event": event,
            "contract_id": str(contract.id),
            "contract_no": contract.contract_no,
            "title": contract.title,
            "status": contract.status.value,
            "language": contract.language,
            "document_hash": contract.document_hash,
            "signed_at": contract.signed_at.isoformat() if contract.signed_at else None,
            "parties": [
                {
                    "id": str(p.id),
                    "name": p.name,
                    "role": p.role.value,
                    "signed": p.signed,
                    "signed_at": p.signed_at.isoformat() if p.signed_at else None,
                }
                for p in parties
            ],
        }
        if extra:
            payload.update(extra)
        existing = ContractCallbackEvent(
            contract_id=contract.id,
            event=event,
            url=contract.callback_url,
            payload=payload,
            idempotency_key=key,
        )
        session.add(existing)
        session.commit()
        session.refresh(existing)
    try:
        _deliver_callback(session, existing)
    except Exception:  # noqa: BLE001  回调是旁路，任何异常都不得影响签署
        logger.exception("contract.callback_crashed", extra={"contract_id": str(contract.id)})


def _can_sign_now(session: Session, contract: Contract, party: ContractParty) -> bool:
    """串行签署下该方此刻是否可签（并行/未编号一律可签）。"""
    if contract.sign_order_type != ContractSignOrder.sequential:
        return True
    if not party.sign_order or party.sign_order <= 0:
        return True
    earlier = session.exec(
        select(ContractParty.id).where(
            ContractParty.contract_id == contract.id,
            ContractParty.id != party.id,
            ContractParty.sign_order < party.sign_order,
            ContractParty.sign_order > 0,
            ContractParty.signed.is_(False),
            ContractParty.declined_at.is_(None),
        )
    ).first()
    return earlier is None


def _ensure_sign_turn(session: Session, contract: Contract, party: ContractParty) -> None:
    """串行签署校验：前序序号未签完时，后序签署方不可签。

    仅当合同 `sign_order_type=sequential` 且该方有明确序号（>0）时生效；
    序号相同视为同一轮（可并行），因此只拦「严格更小且未签」的签署方。
    """
    if not _can_sign_now(session, contract, party):
        raise HTTPException(status_code=409, detail="NOT_YOUR_TURN")


@router.patch("/{contract_id}")
def update_contract(
    contract_id: uuid.UUID,
    payload: dict,
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """编辑合同标题/正文。payload: {title?, content_html?}

    正文变更后重算全文哈希（`document_hash`）——哈希是签署留痕的完整性基准，
    不重算会让「签署时的哈希」与「当前正文」对不上。已签署/已作废不可改。
    """
    contract = _get_visible_contract(session, user, contract_id)
    _require_editable(contract)

    title = payload.get("title")
    content_html = payload.get("content_html")
    if title is not None:
        contract.title = str(title).strip() or contract.title
    if content_html is not None:
        contract.content_html = str(content_html)
        contract.document_hash = esign_service.content_hash(contract.content_html)
    session.add(contract)
    session.commit()
    session.refresh(contract)
    return {
        "id": str(contract.id),
        "title": contract.title,
        "status": contract.status.value,
        "document_hash": contract.document_hash,
        "content_html": contract.content_html,
    }


def _convert_upload_to_pdf(contract: Contract, stored: Path) -> tuple[bool, Optional[str]]:
    """把上传件转成可落章的 PDF 并写入 `pdf_path`。

    返回 `(ok, error_code)`：
    - 成功/原件本就是 PDF → `(True, None)`；
    - 能力未开启或转换失败 → `(False, code)`，**不阻断上传**，仅降级为无落章链路。
    """
    from app.services import pdf_convert

    try:
        pdf_bytes = pdf_convert.convert_to_pdf(stored, filename=stored.name)
    except pdf_convert.PdfConversionError as exc:
        logger.warning(
            "contract.pdf_convert_failed contract=%s code=%s", contract.id, exc.code
        )
        return False, exc.code
    except Exception:  # noqa: BLE001  任何未预期异常都不得让上传失败
        logger.exception("contract.pdf_convert_crashed contract=%s", contract.id)
        return False, "PDF_CONVERT_FAILED"

    out_dir = Path(settings.CONTRACT_OUTPUT_DIR)
    out_dir.mkdir(parents=True, exist_ok=True)
    out_file = out_dir / f"contract_{contract.id.hex[:12]}_converted.pdf"
    tmp = out_file.with_suffix(".pdf.tmp")
    tmp.write_bytes(pdf_bytes)
    os.replace(tmp, out_file)
    contract.pdf_path = str(out_file)
    return True, None


@router.post("/{contract_id}/upload")
def upload_contract_file(
    contract_id: uuid.UUID,
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """给合同挂载经纪人自有的电子合同文件（PDF/Word/图片）。

    复用文档中心的白名单 + 魔数嗅探（`save_upload`），文件名由服务端生成，
    落库只存站内相对路径（读取走带令牌校验的接口）。

    上传后尝试转 PDF（PDF 直接用原件；图片用 reportlab 包页；Word/Excel 走
    Gotenberg）。转换失败**不阻断上传**，响应里 `pdf_converted=false` 并给出
    `pdf_convert_error`，前端据此提示「该合同只能留痕、无法在 PDF 上落章」。
    """
    contract = _get_visible_contract(session, user, contract_id)
    _require_editable(contract)
    url = save_upload(
        file,
        UPLOAD_DIR,
        MAX_CONTRACT_SIZE,
        set(ALLOWED_DOCUMENT_TYPES.keys()),
        {ext: mimes for ext, (_mime, mimes) in ALLOWED_DOCUMENT_TYPES.items()},
        name_prefix="contract",
        url_prefix=STORED_URL_PREFIX,
        label="contract",
        supported_text=" (pdf/doc/docx/jpg/png/webp/gif/xls/xlsx)",
    )
    contract.file_path = url
    contract.source = ContractSource.uploaded
    contract.created_by = contract.created_by or user.id
    # 换文件后旧的转换产物必须作废，避免对新文件盖到旧 PDF 上
    contract.pdf_path = None
    contract.signed_pdf_path = None
    # 上传件的完整性哈希必须绑定真实文件字节，供完成签署与验签时复核。
    stored = resolve_stored_path(url, UPLOAD_DIR, STORED_URL_PREFIX)
    contract.document_hash = hashlib.sha256(stored.read_bytes()).hexdigest()
    pdf_ok, pdf_error = _convert_upload_to_pdf(contract, stored)
    session.add(contract)
    session.commit()
    session.refresh(contract)
    return {
        "id": str(contract.id),
        "file_path": contract.file_path,
        "source": contract.source.value,
        "document_hash": contract.document_hash,
        "pdf_converted": pdf_ok,
        "pdf_convert_error": pdf_error,
    }


@router.post("/{contract_id}/convert-pdf")
def retry_convert_contract_pdf(
    contract_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """重试「上传件转 PDF」（配置好 Gotenberg 后无需重新上传）。"""
    contract = _get_visible_contract(session, user, contract_id)
    _require_editable(contract)
    if contract.source != ContractSource.uploaded or not contract.file_path:
        raise HTTPException(status_code=400, detail="Contract has no uploaded file")
    stored = resolve_stored_path(contract.file_path, UPLOAD_DIR, STORED_URL_PREFIX)
    contract.pdf_path = None
    ok, error = _convert_upload_to_pdf(contract, stored)
    session.add(contract)
    session.commit()
    if not ok:
        # 明确告知失败原因（未启用 / 转换失败），管理端可据此排查或改配置
        raise HTTPException(status_code=502, detail=error or "PDF_CONVERT_FAILED")
    return {"pdf_converted": True, "pdf_page_count": _contract_pdf_page_count(contract)}


@router.post("/{contract_id}/share-link")
def create_share_link(
    contract_id: uuid.UUID,
    payload: dict,
    request: Request,
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """为某签署方生成免登录签署链接。payload: {party_id, expires_in_days?, reuse?}

    用于「客户没走平台流程 / 未注册账号」的场景：链接可转发给客户，
    打开即免登录签署（一次性，签署后令牌清空）。
    `reuse=true` 时复用未过期的既有令牌（展示二维码不打扰已复制的链接）。
    """
    contract = _get_visible_contract(session, user, contract_id)
    _require_editable(contract)
    party = _get_party(session, contract_id, payload.get("party_id"))
    if party.signed:
        raise HTTPException(status_code=409, detail="Party already signed")

    reuse = bool(payload.get("reuse"))
    existing = party.sign_token
    if reuse and existing and party.sign_token_expires_at and party.sign_token_expires_at > datetime.utcnow():
        token = existing
    else:
        token = _issue_sign_token(party, payload.get("expires_in_days"))
        session.add(party)
        session.commit()
        session.refresh(party)
    url = _sign_url(token)
    # 二维码必须编码绝对地址：未配置 PUBLIC_WEB_BASE_URL 时用当前请求的站点前缀补全
    abs_url = url if url.startswith(("http://", "https://")) else f"{str(request.base_url).rstrip('/')}{url}"
    return {
        "party_id": str(party.id),
        "party_name": party.name,
        "token": token,
        "url": url,
        "qr_data_url": _qr_data_url(abs_url),
        "expires_at": party.sign_token_expires_at.isoformat()
        if party.sign_token_expires_at
        else None,
    }


@router.post("/{contract_id}/send")
def send_contract(
    contract_id: uuid.UUID,
    payload: Optional[dict] = None,
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """向签署方推送签署通知（站内 + 邮件）。

    payload: {party_ids?: [uuid], channels?: ["in_app","email"], expires_in_days?}
    未指定 party_ids 时推送给全部未签署方；未注册账号的签署方（无 user_id）
    只能收到邮件，正文里带上免登录签署链接。
    """
    payload = payload or {}
    contract = _get_visible_contract(session, user, contract_id)
    _require_editable(contract)

    # 签署有效期：首次发送开始计时（默认 30 天，允许 1–90 天）。
    # 已到期/已过期的合同重新发送时续期并把状态从 expired 拉回签署中。
    if contract.expires_at is None or contract.expires_at < datetime.utcnow():
        try:
            days = int(payload.get("sign_expires_in_days") or 30)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="Invalid sign_expires_in_days")
        contract.expires_at = datetime.utcnow() + timedelta(days=min(90, max(1, days)))
        if contract.status == ContractStatus.expired:
            contract.status = (
                ContractStatus.partially_signed
                if any(p.signed for p in session.exec(
                    select(ContractParty).where(ContractParty.contract_id == contract_id)
                ).all())
                else ContractStatus.draft
            )
        session.add(contract)

    raw_ids = payload.get("party_ids") or []
    if raw_ids:
        wanted = set()
        for raw in raw_ids:
            try:
                wanted.add(uuid.UUID(str(raw)))
            except (ValueError, TypeError, AttributeError):
                raise HTTPException(status_code=400, detail="Invalid party_id")
        parties = session.exec(
            select(ContractParty).where(
                ContractParty.contract_id == contract_id,
                ContractParty.id.in_(wanted),
            )
        ).all()
    else:
        parties = session.exec(
            select(ContractParty).where(ContractParty.contract_id == contract_id)
        ).all()
    parties = [p for p in parties if not p.signed]
    if not parties:
        raise HTTPException(status_code=400, detail="No pending party to notify")

    channels = payload.get("channels") or ["in_app", "email"]
    expires_in_days = payload.get("expires_in_days")
    results = []
    for party in parties:
        # 未注册客户只能走免登录链接；已注册客户无令牌也能在站内签，但仍带链接方便查看
        if not party.sign_token or (
            party.sign_token_expires_at and party.sign_token_expires_at < datetime.utcnow()
        ):
            token = _issue_sign_token(party, expires_in_days)
        else:
            token = party.sign_token
        url = _sign_url(token)
        session.add(party)
        delivered = []
        content = f"您的合同《{contract.title}》等待签署，请点击链接完成签署：{url}"

        if "in_app" in channels and party.user_id:
            session.add(
                Notification(
                    id=uuid.uuid4(),
                    user_id=party.user_id,
                    channel=NotificationChannel.in_app,
                    template_key="contract_sign_invite",
                    recipient=str(party.user_id),
                    subject="合同待签署",
                    content=content,
                    status=NotificationStatus.queued,
                    related_entity_type="contract",
                    related_entity_id=contract.id,
                )
            )
            delivered.append("in_app")
        if "email" in channels and party.email:
            result = notification_router.send(
                NotificationMessage(
                    channel=ProviderChannel.EMAIL,
                    recipient=party.email,
                    title="合同待签署",
                    content=content,
                    metadata={"contract_id": str(contract.id), "sign_url": url},
                    related_entity_type="contract",
                    related_entity_id=str(contract.id),
                )
            )
            delivered.append("email" if result.success else "email_failed")
        if "sms" in channels and party.phone:
            result = notification_router.send(
                NotificationMessage(
                    channel=ProviderChannel.SMS,
                    recipient=party.phone,
                    title="合同待签署",
                    content=content,
                    metadata={"contract_id": str(contract.id), "sign_url": url},
                    related_entity_type="contract",
                    related_entity_id=str(contract.id),
                )
            )
            delivered.append("sms" if result.success else "sms_failed")
        results.append(
            {
                "party_id": str(party.id),
                "name": party.name,
                "channels": delivered,
                "url": url,
            }
        )

    # 有签署方在等待 → 合同进入 sent（首次发送才推进，不回退已进展的状态）
    if contract.status == ContractStatus.draft:
        contract.status = ContractStatus.sent
        session.add(contract)
    session.commit()
    return {"contract_id": str(contract.id), "status": contract.status.value, "results": results}


@router.post("/{contract_id}/void")
def void_contract(
    contract_id: uuid.UUID,
    payload: Optional[dict] = None,
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """作废合同（不可再签署）。payload: {reason?}"""
    payload = payload or {}
    contract = _get_visible_contract(session, user, contract_id)
    if contract.status == ContractStatus.voided:
        raise HTTPException(status_code=409, detail="Contract already voided")
    contract.status = ContractStatus.voided
    counters = dict(contract.counters or {})
    reason = (payload.get("reason") or "").strip()
    if reason:
        counters["void_reason"] = reason
        counters["voided_by"] = str(user.id)
        contract.counters = counters
    session.add(contract)
    session.commit()
    session.refresh(contract)
    # 作废同样对外通知：下游据此中止审批/付款等流程（回调失败不影响作废结果）
    try:
        _emit_contract_callback(
            session,
            contract,
            "contract.voided",
            extra={"reason": reason or None, "voided_by": str(user.id)},
        )
    except Exception:  # noqa: BLE001  回调是旁路
        logger.exception("contract.callback_emit_failed", extra={"contract_id": str(contract.id)})
    return {"id": str(contract.id), "status": contract.status.value}


def _mask_contact(contact: str) -> str:
    """手机号/邮箱脱敏，用于回显。"""
    value = (contact or "").strip()
    if not value:
        return ""
    if "@" in value:
        local, _, domain = value.partition("@")
        head = local[0] if len(local) >= 1 else ""
        tail = "*" * max(1, len(local) - 1)
        return f"{head}{tail}@{domain}"
    digits = value
    if len(digits) >= 7:
        return f"{digits[:3]}****{digits[-4:]}"
    return "*" * len(digits)


def _party_contact(session: Session, party: ContractParty, user: Optional[User]) -> str:
    """解析签署方用于意愿验证的联系方式：签署方手机/邮箱，其次登录账号联系方式。"""
    if party.phone or party.email:
        return (party.phone or party.email or "").strip()
    if user is not None:
        return (getattr(user, "phone", None) or getattr(user, "email", None) or "").strip()
    return ""


def _send_sign_intent_code(
    session: Session, party: ContractParty, user: Optional[User]
) -> str:
    """向签署方联系方式下发「签署意愿验证码」，返回脱敏联系方式。"""
    contact = _party_contact(session, party, user)
    if not contact:
        raise HTTPException(status_code=400, detail="No verifiable contact for this party")
    channel = "email" if "@" in contact else "sms"
    code = _issue_otp(session, contact, channel)
    if not _send_code(contact, channel, code):
        # 发码失败（多为未配短信/邮件凭据）：作废未消费的码，避免被撞库
        raise HTTPException(status_code=503, detail="Code delivery unavailable")
    return _mask_contact(contact)


def _verify_sign_intent(
    session: Session, party: ContractParty, user: Optional[User], code: Optional[str]
) -> None:
    """签署意愿二次验证（可选用）。

    对齐开放签默认交互：该步骤默认不启用，签署流程一步到位。仅当调用方**主动传入
    code** 时才校验；未传则跳过，不再强制「必须先发码」。无可用联系方式时同样跳过。
    校验失败/过期/超次数交由 `_consume_otp` 抛 4xx。
    """
    if not code:
        return
    contact = _party_contact(session, party, user)
    if not contact:
        return
    _consume_otp(session, contact, code)


@router.post("/{contract_id}/sign-code")
def send_sign_intent_code(
    contract_id: uuid.UUID,
    payload: dict,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """为签署方下发「签署意愿验证码」（签前二次确认）。payload: {party_id}

    与外端请求/身份认证分开——这是签署行为的独立意愿确认，随签署提交一起校验。
    """
    contract = _get_visible_contract(session, user, contract_id)
    if contract.status in (ContractStatus.voided, ContractStatus.rejected):
        raise HTTPException(status_code=409, detail="Contract not signable")
    party = _get_party(session, contract_id, payload.get("party_id"))
    if user.role not in STAFF_ROLES and not party_belongs_to_user(party, user):
        raise HTTPException(status_code=403, detail="Not a party of this contract")
    if party.signed:
        raise HTTPException(status_code=409, detail="Party already signed")
    masked = _send_sign_intent_code(session, party, user)
    return {"sent": True, "to_masked": masked}


@router.post("/{contract_id}/decline")
def decline_contract(
    contract_id: uuid.UUID,
    payload: dict,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """拒签：签署方拒签并填写原因。payload: {party_id, reason}

    行为对齐开放签「拒签」：拒签方置 declined_at/decline_reason；
    若再无其他必签未签方 → 合同状态置为 rejected（签署流程终止，不可恢复）。
    """
    contract = _get_visible_contract(session, user, contract_id)
    if contract.status in (ContractStatus.voided, ContractStatus.rejected):
        raise HTTPException(status_code=409, detail="Contract not signable")
    party = _get_party(session, contract_id, payload.get("party_id"))
    if user.role not in STAFF_ROLES and not party_belongs_to_user(party, user):
        raise HTTPException(status_code=403, detail="Not a party of this contract")
    if party.signed:
        raise HTTPException(status_code=409, detail="Party already signed")
    reason = (payload.get("reason") or "").strip()
    if len(reason) > 2000:
        raise HTTPException(status_code=400, detail="Reason too long")

    party.declined_at = datetime.utcnow()
    party.decline_reason = reason or None
    session.add(party)
    session.flush()

    # 其他必签未签方（含任意归属、未拒签、未签）
    remaining = session.exec(
        select(ContractParty).where(
            ContractParty.contract_id == contract.id,
            ContractParty.id != party.id,
            ContractParty.signed.is_(False),
            ContractParty.declined_at.is_(None),
        )
    ).all()
    if not remaining:
        contract.status = ContractStatus.rejected
        session.add(contract)
    session.commit()
    # 只有流程真正终止（无可签方）时才对外发 declined，避免部分拒签误触发下游终止
    if contract.status == ContractStatus.rejected:
        try:
            _emit_contract_callback(
                session,
                contract,
                "contract.declined",
                extra={
                    "party_id": str(party.id),
                    "party_name": party.name,
                    "reason": reason or None,
                },
            )
        except Exception:  # noqa: BLE001  回调是旁路
            logger.exception("contract.callback_emit_failed", extra={"contract_id": str(contract.id)})
    return {
        "party_id": str(party.id),
        "declined": True,
        "contract_status": contract.status.value,
        "reason": reason,
    }


@router.post("/{contract_id}/keyword-search")
def keyword_sign_search(
    contract_id: uuid.UUID,
    payload: dict,
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """关键字签署：在合同 PDF 中查找关键字出现位置。payload: {keyword}

    返回命中位置的页面百分比坐标候选，供「添加签署区」用关键字定位落框。
    """
    contract = _get_visible_contract(session, user, contract_id)
    keyword = (payload.get("keyword") or "").strip()
    if not keyword:
        raise HTTPException(status_code=400, detail="keyword is required")

    # 无引擎 PDF（上传型合同）→ 404；不得用 Path("") 兜底（空串等价 "." 会被判存在）
    base = _resolve_contract_pdf(contract)
    if not base:
        raise HTTPException(status_code=404, detail="Contract PDF not found")

    from app.services import kaifang_sign_service

    hits = kaifang_sign_service.get_engine().search_text(base.read_bytes(), keyword)
    return {"keyword": keyword, "count": len(hits), "hits": hits}


@router.post("/{contract_id}/keyword-fields")
def keyword_sign_fields(
    contract_id: uuid.UUID,
    payload: dict,
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """关键字签署：按第一个（或指定 index）命中位置创建签署区字段。payload:
    {keyword, party_id?, field_type?, index?}

    字段坐标以页面百分比落库（与拖拽落框一致，required 保持默认 true）。
    """
    contract = _get_visible_contract(session, user, contract_id)
    _require_editable(contract)

    base = _resolve_contract_pdf(contract)
    if not base:
        raise HTTPException(status_code=404, detail="Contract PDF not found")

    keyword = (payload.get("keyword") or "").strip()
    if not keyword:
        raise HTTPException(status_code=400, detail="keyword is required")

    from app.services import kaifang_sign_service

    hits = kaifang_sign_service.get_engine().search_text(base.read_bytes(), keyword)
    if not hits:
        raise HTTPException(status_code=404, detail="Keyword not found in contract")

    index = max(0, int(payload.get("index", 0) or 0))
    if index >= len(hits):
        raise HTTPException(status_code=400, detail="Index out of range")
    hit = hits[index]

    try:
        field_type = SignFieldType(payload.get("field_type", "signature"))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid field_type")

    party_id = None
    if payload.get("party_id"):
        try:
            party_id = uuid.UUID(str(payload["party_id"]))
        except (ValueError, TypeError, AttributeError):
            raise HTTPException(status_code=400, detail="Invalid party_id")

    # 签名框建议尺寸：宽度取关键字宽，高度取等宽（印章/签名稍宽大）
    w = max(hit["w"], 12.0)
    h = max(hit["h"], 8.0)
    field = ContractSignField(
        contract_id=contract.id,
        party_id=party_id,
        field_type=field_type,
        page=hit["page"],
        x=hit["x"],
        y=hit["y"],
        w=w,
        h=h,
        required=True,
        created_by=user.id,
    )
    session.add(field)
    session.commit()
    session.refresh(field)
    return {"field": _serialize_sign_field(field), "keyword": keyword, "hit": hit}


def _get_party(session: Session, contract_id: uuid.UUID, party_id_raw) -> ContractParty:
    """按 id 取签署方并校验归属合同；非法/不存在统一 400/404。"""
    try:
        party_id = uuid.UUID(str(party_id_raw))
    except (ValueError, TypeError, AttributeError):
        raise HTTPException(status_code=400, detail="Invalid party_id")
    party = session.get(ContractParty, party_id)
    if not party or party.contract_id != contract_id:
        raise HTTPException(status_code=404, detail="Party not found")
    return party


def _serialize_sign_field(f: ContractSignField) -> dict:
    """签署区字段序列化（供详情/列表返回）。"""
    return {
        "id": str(f.id),
        "contract_id": str(f.contract_id),
        "party_id": str(f.party_id) if f.party_id else None,
        "field_type": f.field_type.value if f.field_type else SignFieldType.signature.value,
        "page": f.page,
        "x": f.x,
        "y": f.y,
        "w": f.w,
        "h": f.h,
        "required": f.required,
        "signed": f.signed,
        "signed_at": f.signed_at.isoformat() if f.signed_at else None,
    }


def _get_sign_fields(session: Session, contract_id: uuid.UUID, user: User) -> list:
    """按合同取全部签署区字段（序列化）。"""
    rows = session.exec(
        select(ContractSignField)
        .where(ContractSignField.contract_id == contract_id)
        .order_by(ContractSignField.page, ContractSignField.y, ContractSignField.x)
    ).all()
    return [_serialize_sign_field(r) for r in rows]


def _sanitize_signature_svg(raw: str) -> str:
    """校验客户端提交的签名 SVG。

    签名由客户在自己的浏览器上手写生成，会被回显到合同页面上；直接落库/回显
    等于给了存储型 XSS 的入口（`<script>`、`onload=`、外链 `<use href>` 等）。
    这里只做「明显恶意即拒」的黑名单校验 + 体积上限，不解析 SVG 语义。
    """
    value = (raw or "").strip()
    if not value or len(value) > 200_000:
        raise HTTPException(status_code=400, detail="Invalid signature")
    low = value.lower()
    if not low.startswith("<svg"):
        raise HTTPException(status_code=400, detail="Invalid signature")
    for bad in (
        "<script",
        "<foreignobject",
        "<iframe",
        "<embed",
        "<object",
        "<style",
        "<image",
        "javascript:",
        "data:text/html",
        "xlink",
        "href",
    ):
        if bad in low:
            raise HTTPException(status_code=400, detail="Invalid signature")
    if re.search(r"\son[a-z]+\s*=", low):
        raise HTTPException(status_code=400, detail="Invalid signature")
    return value


def _pdf_signature_stamp(contract, party, method, field, img_override: Optional[bytes] = None) -> tuple:
    """决定要盖到 PDF 上的图片与位置。

    返回 (img_bytes, page, x, y, w, h, reason)：
    - 传入 `img_override`（用户自制印章/手写签名 PNG）时直接使用，对齐开放签「拖放已制作签章」；
    - company_seal → 公司公章（公司名）盖章；
    - 其余（手写/私章/日期）→ 用引擎把手写姓名/日期渲染为 PNG。
    未放置签署区字段时退回整页签名栏默认坐标。
    """
    from app.services import kaifang_sign_service

    eng = kaifang_sign_service.get_engine()
    if img_override:
        img = img_override
    elif method == SignMethod.company_seal:
        company = (party.name or "电子签章").strip()
        img = eng.make_seal(f"{company}专用章", "合同专用")
    elif method == SignMethod.date:
        img = eng.make_handwrite(datetime.utcnow().strftime("%Y-%m-%d"))
    else:
        img = eng.make_handwrite(party.name or "签名")
    if field is not None:
        page = max(1, int(getattr(field, "page", 1) or 1))
        x = float(getattr(field, "x", 0) or 0)
        y = float(getattr(field, "y", 0) or 0)
        w = float(getattr(field, "w", 0) or 0) or 20.0
        h = float(getattr(field, "h", 0) or 0) or 8.0
    else:
        page, x, y, w, h = 1, 55.0, 90.0, 24.0, 9.0
    reason = f"{party.name} 电子签署"
    return img, page, x, y, w, h, reason


def _contract_document_digest(contract: Contract) -> str:
    """按合同「权威源」计算完整性哈希。

    - 上传型：对**真实文件字节**取 sha256（此前错误地只哈希 content_html，
      而未走 /generate 的上传合同 content_html 为空，等于哈希空串）；
    - 生成型：对正文 HTML 取哈希（PDF 由该 HTML 渲染，语义等价）。
    """
    if contract.source == ContractSource.uploaded:
        stored = getattr(contract, "file_path", None)
        if stored:
            try:
                path = resolve_stored_path(stored, UPLOAD_DIR, STORED_URL_PREFIX)
            except HTTPException:
                return ""
            return hashlib.sha256(path.read_bytes()).hexdigest()
    return esign_service.content_hash(contract.content_html or "")


def _pdf_signing_baseline(contract: Contract) -> Optional[Path]:
    """定位签署的基线 PDF：优先已签存档，其次原始引擎 PDF；都没有返回 None。"""
    signed_pdf = getattr(contract, "signed_pdf_path", None)
    if signed_pdf and Path(signed_pdf).exists():
        return Path(signed_pdf)
    plain_pdf = getattr(contract, "pdf_path", None)
    if plain_pdf and Path(plain_pdf).exists():
        return Path(plain_pdf)
    return None


def _record_sign_failure(session: Session, contract_id: uuid.UUID, party_id: uuid.UUID, exc: Exception) -> None:
    """记录 PDF 签章失败并中断本次签署（不得流转为已签）。

    先回滚本事务内未提交的签署区/留痕，避免留下「字段已签但没有章」的脏数据；
    再把失败原因落到合同上，供运维追溯与前端提示。
    """
    logger.exception(
        "contract PDF signing failed: contract=%s party=%s", contract_id, party_id, exc_info=exc
    )
    session.rollback()
    fresh = session.get(Contract, contract_id)
    if fresh is not None:
        fresh.last_sign_error = f"{type(exc).__name__}: {exc}"[:500]
        fresh.last_sign_error_at = datetime.utcnow()
        session.add(fresh)
        session.commit()
    raise HTTPException(status_code=502, detail="PDF_SIGN_FAILED") from exc


def _apply_pdf_signatures(
    session: Session,
    contract: Contract,
    party: ContractParty,
    placements: list,
) -> Optional[bool]:
    """把一次签署动作里的所有落章位置写进同一份 PDF 存档。

    `placements` 为 `[(field, method, img_override)]`。要点：
    - 基线 PDF 只在内存中依次追加签名修订，**全部成功后才一次性原子替换**存档，
      避免中途失败留下半签文件；
    - 引擎签名只追加，不重写已有内容，因此前序签署人的签名始终有效；
    - 没有引擎 PDF（上传型非 PDF 合同）返回 None，仍走签名留痕；
    - 任一环节异常 → 502，且合同状态不推进。
    """
    src = _pdf_signing_baseline(contract)
    if src is None:
        return None

    from app.services import kaifang_sign_service

    contract_id, party_id = contract.id, party.id
    try:
        eng = kaifang_sign_service.get_engine()
        data = src.read_bytes()
        for field, method, img_override in placements:
            img, page, x, y, w, h, reason = _pdf_signature_stamp(
                contract, party, method, field, img_override
            )
            data = eng.sign_pdf(data, img, page=page, x=x, y=y, w=w, h=h, reason=reason)

        out_dir = Path(settings.CONTRACT_OUTPUT_DIR)
        out_dir.mkdir(parents=True, exist_ok=True)
        out = out_dir / f"contract_{contract_id.hex[:12]}.signed.pdf"
        tmp = out.with_name(out.name + ".tmp")
        tmp.write_bytes(data)
        os.replace(tmp, out)

        contract.signed_pdf_path = str(out)
        contract.last_sign_error = None
        contract.last_sign_error_at = None
        session.add(contract)
        return True
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001  统一转为可见的 502 + 失败记录
        _record_sign_failure(session, contract_id, party_id, exc)
        return None


def _apply_signature(
    session: Session,
    contract: Contract,
    party: ContractParty,
    *,
    signer_user_id: Optional[uuid.UUID],
    ip: Optional[str],
    signature_svg: Optional[str] = None,
    field_id: Optional[uuid.UUID] = None,
    method: Optional[SignMethod] = None,
) -> str:
    """写入签名 + 留痕，并推进合同状态机。返回签名哈希。

    - 签名姓名一律取服务端 `party.name`（不接受客户端传入）；
    - 一次性签署令牌在用完后清空；
    - **按字段签署**：若传 `field_id`，校验该字段归属（party 归属）且未 signed，
      签署后写 field.signed=True/signed_at，并将 field_id/method 写入本次 SignatureRecord；
      不传 `field_id` 时沿用旧链路（整方一次性签署）；
    - 状态推进：sent → partially_signed →（所有 required 归属字段签署完成）signed；
    - 经纪人协议为「平台单方预签」类：经纪乙方签署后平台甲方自动同意。
    - 合同存在引擎 PDF（pdf_path/signed_pdf_path）时，同时用 kaifangqian->Python
      引擎在该字段坐标处盖手写签名/公章并做增量数字签名（写回 signed_pdf_path）。
    """
    # 有效期与串行顺序：在签章/落痕之前拦下，保证失败不产生任何副作用
    _ensure_not_expired(session, contract)
    _ensure_sign_turn(session, contract, party)

    # --- 引擎 PDF 定位签署（可选，有 PDF 才执行；失败回退不阻断留痕） ---
    field = None
    if field_id is not None:
        field = session.get(ContractSignField, field_id)
        if not field or field.contract_id != contract.id:
            raise HTTPException(status_code=404, detail="Sign field not found")
        if field.party_id is not None and field.party_id != party.id:
            raise HTTPException(status_code=403, detail="Field not assigned to this party")
        if field.signed:
            raise HTTPException(status_code=409, detail="Sign field already signed")

    # 先签章、后置字段已签：签章失败会抛 502，字段与状态都不会推进。
    _apply_pdf_signatures(
        session,
        contract,
        party,
        [(field, method or party.sign_method or SignMethod.personal_handwrite, None)],
    )

    if field is not None:
        field.signed = True
        field.signed_at = datetime.utcnow()
        session.add(field)

    return _finalize_party_signed(
        session,
        contract,
        party,
        signer_user_id=signer_user_id,
        ip=ip,
        signature_svg=signature_svg,
        method=method or party.sign_method or SignMethod.personal_handwrite,
        field_id=field_id,
    )


def _finalize_party_signed(
    session: Session,
    contract: Contract,
    party: ContractParty,
    *,
    signer_user_id: Optional[uuid.UUID],
    ip: Optional[str],
    signature_svg: Optional[str],
    method: SignMethod,
    field_id: Optional[uuid.UUID],
) -> str:
    """写入签署留痕并推进合同状态机，返回签名哈希。

    `/sign`、`/sign-self`、`/sign-batch` 三条链路共用这一段尾巴，避免状态机分叉：
    - 签名姓名一律取服务端 `party.name`（不接受客户端传入）；
    - 一次性签署令牌在用完后清空；
    - 状态推进：sent → partially_signed →（所有归属必签字段签署完成）signed；
    - 经纪人协议为「平台单方预签」类：经纪乙方签署后平台甲方自动同意。
    """
    name = party.name
    stamp = contract.title or contract.id
    provider = esign_service.get_sign_provider()
    sig_svg = signature_svg or provider.render_signature(name, str(stamp))
    sig_hash = provider.sign_digest(
        f"{contract.document_hash}|{party.id}|{name}|{sig_svg}"
    )

    party.signed = True
    party.signed_at = datetime.utcnow()
    party.signature = sig_svg
    party.sign_token = None  # 一次性令牌：签署后立即失效
    party.sign_token_expires_at = None
    session.add(party)

    # 签署动作即视为完成该方**自己名下**仍未签的必签区。
    # 背景：发起方会预置 required=True 的签署区（归属某方），而开放签式
    # 「一次性落区并签」里签署方只提交自己拖放的签区（required=False）。
    # 若预置区始终没人签，下面 fields_done 永远为假，合同会永久卡在
    # partially_signed（状态机死锁）。因此在这条公共尾巴里把该方遗留的
    # 必签区一并置为已签，与「该方已签署」的语义保持一致。
    for own_field in session.exec(
        select(ContractSignField).where(
            ContractSignField.contract_id == contract.id,
            ContractSignField.party_id == party.id,
            ContractSignField.required.is_(True),
            ContractSignField.signed.is_(False),
        )
    ).all():
        own_field.signed = True
        own_field.signed_at = datetime.utcnow()
        session.add(own_field)

    session.add(
        SignatureRecord(
            contract_id=contract.id,
            party_id=party.id,
            field_id=field_id,
            method=method or party.sign_method or SignMethod.personal_handwrite,
            signer_user_id=signer_user_id,
            signer_name=name,
            signature_svg=sig_svg,
            signature_hash=sig_hash,
            ip=ip,
        )
    )
    session.commit()

    parties = session.exec(
        select(ContractParty).where(ContractParty.contract_id == contract.id)
    ).all()
    fully_signed = bool(parties and all(p.signed for p in parties))

    # 按字段口径完成判定：所有「已归属必签字段」都 signed 才算合同签署完成
    sign_fields = session.exec(
        select(ContractSignField).where(ContractSignField.contract_id == contract.id)
    ).all()
    required_fields = [f for f in sign_fields if f.required and f.party_id is not None]
    fields_done = bool(required_fields) and all(f.signed for f in required_fields)
    if fully_signed and fields_done:
        pass  # 合同完成
    else:
        # 字段存在但未全部完成 → 不算完成（仅当存在归属必签字段时收紧）
        if required_fields and not fields_done:
            fully_signed = False

    if not fully_signed and contract.kind in (
        ContractKind.listing_agent,
        ContractKind.broker_distributor,
    ):
        # 平台单方预签：把其余未签方自动标记为已签（且视为完成了归属字段）
        for p in parties:
            if not p.signed:
                p.signed = True
                p.signed_at = datetime.utcnow()
                session.add(p)
        for f in required_fields:
            if not f.signed:
                f.signed = True
                f.signed_at = datetime.utcnow()
                session.add(f)
        session.commit()
        fully_signed = True

    if fully_signed:
        contract.status = ContractStatus.signed
        contract.signed_at = datetime.utcnow()
        # document_hash 在生成/上传时按「权威源」写入：
        # - 生成型：正文 HTML 的哈希；
        # - 上传型：**真实文件字节**的哈希（见 upload_contract_file）。
        # 这里不能再按 content_html 重算，否则上传型合同会哈希空内容。
        if not contract.document_hash:
            contract.document_hash = _contract_document_digest(contract)
        # 整份合同落一条总览 SignatureRecord（若尚无）
        existing_overview = session.exec(
            select(SignatureRecord).where(
                SignatureRecord.contract_id == contract.id,
                SignatureRecord.field_id.is_(None),
            )
        ).first()
        if existing_overview is None:
            session.add(
                SignatureRecord(
                    contract_id=contract.id,
                    party_id=party.id,
                    method=method or party.sign_method or SignMethod.personal_handwrite,
                    signer_user_id=signer_user_id,
                    signer_name="__overview__",
                    signature_hash=contract.document_hash,
                    ip=ip,
                )
            )
    elif any(p.signed for p in parties):
        contract.status = ContractStatus.partially_signed
    else:
        contract.status = ContractStatus.sent
    session.add(contract)
    session.commit()
    if fully_signed:
        _activate_broker_role_if_agreement(session, contract)
        # 签署完成回调（出站 webhook）：失败只记事件，不影响签署结果
        _emit_contract_callback(session, contract)
    return sig_hash


@router.post("/{contract_id}/sign")
def sign_contract(
    contract_id: uuid.UUID,
    payload: dict,
    request: Request,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """对指定签署方做数字签名。payload: {party_id, signature_svg?}

    **身份绑定**（修复点）：
    - 只能签**自己**那一方（`party.user_id` 或邮箱归属）；员工不再允许代签他人身份，
      未注册的外部签署方走免登录令牌链路；
    - 签名姓名一律取服务端 `party.name`，不再接受 payload 里的 `name`——
      否则任何登录用户都能用任意 party_id 冒充他人签署；
    - IP 取真实请求来源，不再信任客户端自报。
    """
    contract = _get_visible_contract(session, user, contract_id)
    if contract.status in (ContractStatus.voided, ContractStatus.rejected):
        raise HTTPException(status_code=409, detail="Contract already finalized")
    party = _get_party(session, contract_id, payload.get("party_id"))

    if not party_belongs_to_user(party, user):
        # 只允许签署人本人（user_id 或邮箱归属）；员工同样不能代签他人身份，
        # 未注册的外部签署方走免登录令牌链路。
        raise HTTPException(status_code=403, detail="Not a party of this contract")
    if party.signed:
        raise HTTPException(status_code=409, detail="Party already signed")
    if party.declined_at:
        raise HTTPException(status_code=409, detail="Party already declined")

    # 签前意愿二次验证：签署方需提供已下发的验证码
    _verify_sign_intent(session, party, user, payload.get("code"))

    # P3 强制实名：登录态签署。
    # - 未绑定用户的外部签署方（员工代签）须先走公开端验证码实名；
    # - 已绑定登录用户的签署方，其身份经平台登录态可信，首次签署自动置为
    #   内部认证（real_name_verified_at=now，来源=internal），避免重复过验证码。
    if not party.real_name_verified_at:
        # 实名口径：已绑定登录用户的签署方（user_id 命中或邮箱命中）身份经平台登录态
        # 可信，首次签署直接置为内部认证并回写 user_id（员工代签沿用同一口径）；
        # 未绑定账号的外部签署方必须走公开端
        # `/public/contract-sign/{token}/send-code` + `verify-identity` 完成实名。
        if party.user_id is not None or party_belongs_to_user(party, user):
            party.real_name_verified_at = datetime.utcnow()
            if party.user_id is None:
                party.user_id = user.id
            session.add(party)
        else:
            raise HTTPException(status_code=403, detail="REAL_NAME_REQUIRED")

    raw_svg = payload.get("signature_svg")
    sig_svg = _sanitize_signature_svg(raw_svg) if raw_svg else None

    field_id = None
    if payload.get("field_id"):
        try:
            field_id = uuid.UUID(str(payload["field_id"]))
        except (ValueError, TypeError, AttributeError):
            raise HTTPException(status_code=400, detail="Invalid field_id")

    method = None
    if payload.get("method"):
        try:
            method = SignMethod(str(payload["method"]))
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid method")

    sig_hash = _apply_signature(
        session,
        contract,
        party,
        signer_user_id=user.id,
        ip=(request.client.host if request.client else None),
        signature_svg=sig_svg,
        field_id=field_id,
        method=method,
    )
    return {
        "party_id": str(party.id),
        "signed": True,
        "field_id": str(field_id) if field_id else None,
        "signature_hash": sig_hash,
        "contract_status": contract.status.value,
    }


@router.post("/{contract_id}/sign-self")
def sign_self(
    contract_id: uuid.UUID,
    payload: dict,
    request: Request,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """签署方在 PDF 页图任意位置「落区并签」的合并接口（法大大式自由拖签）。

    payload: {party_id, page, x, y, w, h, method, signature_svg?}
    - 身份绑定与 /sign 一致：非员工只能签**自己**那一方；
    - x/y 为页宽高百分比(0-100)，w/h 百分比(>0)，按该坐标**新建**本人签区
      （field_type=method，required=False）随后立即签署并盖到 PDF；
    - 不发明文姓名：姓名一律取服务端 `party.name`。
    """
    contract = _get_visible_contract(session, user, contract_id)
    if contract.status in (ContractStatus.voided, ContractStatus.rejected):
        raise HTTPException(status_code=409, detail="Contract already finalized")
    party = _get_party(session, contract_id, payload.get("party_id"))

    if not party_belongs_to_user(party, user):
        raise HTTPException(status_code=403, detail="Not a party of this contract")
    if party.signed:
        raise HTTPException(status_code=409, detail="Party already signed")
    if party.declined_at:
        raise HTTPException(status_code=409, detail="Party already declined")

    # 签前意愿二次验证：签署方需提供已下发的验证码
    _verify_sign_intent(session, party, user, payload.get("code"))

    # P3 强制实名：与 /sign、/sign-batch 同一口径（已绑定 user_id 或归属本账号 → 内部认证）
    if not party.real_name_verified_at:
        if party.user_id is not None or party_belongs_to_user(party, user):
            party.real_name_verified_at = datetime.utcnow()
            if party.user_id is None:
                party.user_id = user.id
            session.add(party)
        else:
            raise HTTPException(status_code=403, detail="REAL_NAME_REQUIRED")

    # 兼容「签区字段类型」与「签署方式」两种字符串：signature→手写、seal→公章、date→日期
    _method_map = {
        "signature": SignMethod.personal_handwrite,
        "personal_handwrite": SignMethod.personal_handwrite,
        "personal_seal": SignMethod.personal_seal,
        "seal": SignMethod.company_seal,
        "company_seal": SignMethod.company_seal,
        "date": SignMethod.date,
    }
    method = _method_map.get(str(payload.get("method", "")), SignMethod.personal_handwrite)

    page = max(1, int(payload.get("page", 1) or 1))
    x = min(100.0, max(0.0, float(payload.get("x", 0) or 0)))
    y = min(100.0, max(0.0, float(payload.get("y", 0) or 0)))
    w = min(100.0, max(1.0, float(payload.get("w", 0) or 0) or 20.0))
    h = min(100.0, max(1.0, float(payload.get("h", 0) or 0) or 8.0))

    # 落区字段类型映射：company_seal→seal，date→date，其余 signature
    ft = {
        SignMethod.company_seal: SignFieldType.seal,
        SignMethod.date: SignFieldType.date,
    }.get(method, SignFieldType.signature)

    field = ContractSignField(
        contract_id=contract.id,
        party_id=party.id,
        field_type=ft,
        page=page,
        x=x,
        y=y,
        w=w,
        h=h,
        required=False,
        created_by=user.id,
    )
    session.add(field)
    session.flush()  # 取 field.id 供签署/落章定位

    raw_svg = payload.get("signature_svg")
    sig_svg = _sanitize_signature_svg(raw_svg) if raw_svg else None

    sig_hash = _apply_signature(
        session,
        contract,
        party,
        signer_user_id=user.id,
        ip=(request.client.host if request.client else None),
        signature_svg=sig_svg,
        field_id=field.id,
        method=method,
    )
    session.commit()
    return {
        "party_id": str(party.id),
        "signed": True,
        "field_id": str(field.id),
        "signature_hash": sig_hash,
        "contract_status": contract.status.value,
    }


# 单次「落区并签署」最多接受的签署区数量（防滥用）
MAX_SIGN_BATCH_ITEMS = 20


def _decode_image_data_url(raw) -> Optional[bytes]:
    """解析 `data:image/png;base64,xxx` 形式的签章图片；非法或超限返回 None。"""
    if not raw or not isinstance(raw, str) or "," not in raw[:120]:
        return None
    head, _, b64 = raw.partition(",")
    if "base64" not in head.lower():
        return None
    try:
        data = base64.b64decode(b64, validate=True)
    except Exception:  # noqa: BLE001  非 base64 视为未提供图片
        return None
    if not data or len(data) > 2_000_000:
        return None
    return data


@router.post("/{contract_id}/sign-batch")
def sign_batch(
    contract_id: uuid.UUID,
    payload: dict,
    request: Request,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """开放签式「一次性落区并签署」：把本次拖放的全部签署区与签章内容**原子提交**。

    payload: {party_id, items:[{page,x,y,w,h,method|field_type,signature_svg?,image_data_url?}]}
    - 身份绑定与 /sign 一致：非员工只能签**自己**那一方；
    - 每个 item 新建本人签署区（field_type 由 method 推导，required=False），并按坐标把
      对应签章图片盖到 PDF；`image_data_url`（用户已制作的印章/手写签名 PNG）优先使用，
      缺省按类型生成（公章→公司名、日期→当天、手写→签署方姓名）；
    - 所有 item 处理完后**统一**标记该方已签并推进合同状态——一次提交只产生一次落痕，
      与开放签 demo 的 `POST /openSign/sign`（坐标 + 签章内容同体提交）语义一致。
    """
    contract = _get_visible_contract(session, user, contract_id)
    if contract.status in (ContractStatus.voided, ContractStatus.rejected):
        raise HTTPException(status_code=409, detail="Contract already finalized")
    party = _get_party(session, contract_id, payload.get("party_id"))

    # 只允许签署人本人操作（含邮箱归属），员工不再代签他人身份。
    # 未注册/未绑定的外部签署方一律走免登录令牌链路（token 绑定 party）。
    if not party_belongs_to_user(party, user):
        raise HTTPException(status_code=403, detail="Not a party of this contract")
    if party.signed:
        raise HTTPException(status_code=409, detail="Party already signed")
    if party.declined_at:
        raise HTTPException(status_code=409, detail="Party already declined")

    # 签前意愿二次验证（可选，默认不启用，对齐开放签）
    _verify_sign_intent(session, party, user, payload.get("code"))

    items = payload.get("items")
    if not isinstance(items, list) or not items:
        raise HTTPException(status_code=400, detail="No sign items")
    items = [it for it in items[:MAX_SIGN_BATCH_ITEMS] if isinstance(it, dict)]
    if not items:
        raise HTTPException(status_code=400, detail="No valid sign items")

    # P3 强制实名：登录态签署，口径与 /sign 完全一致
    if not party.real_name_verified_at:
        # 实名口径：已绑定登录用户的签署方（user_id 命中或邮箱命中）身份经平台登录态
        # 可信，首次签署直接置为内部认证并回写 user_id（员工代签沿用同一口径）；
        # 未绑定账号的外部签署方必须走公开端
        # `/public/contract-sign/{token}/send-code` + `verify-identity` 完成实名。
        if party.user_id is not None or party_belongs_to_user(party, user):
            party.real_name_verified_at = datetime.utcnow()
            if party.user_id is None:
                party.user_id = user.id
            session.add(party)
        else:
            raise HTTPException(status_code=403, detail="REAL_NAME_REQUIRED")

    created, sig_hash, pdf_signed = _sign_batch_core(
        session,
        contract,
        party,
        items=items,
        signer_user_id=user.id,
        ip=(request.client.host if request.client else None),
        created_by=user.id,
    )
    return {
        "party_id": str(party.id),
        "signed": True,
        "fields": created,
        "signature_hash": sig_hash,
        "pdf_signed": pdf_signed,
        "contract_status": contract.status.value,
    }


def _sign_batch_core(
    session: Session,
    contract: Contract,
    party: ContractParty,
    *,
    items: List[dict],
    signer_user_id: Optional[uuid.UUID],
    ip: Optional[str],
    created_by: Optional[uuid.UUID],
) -> tuple:
    """「一次性落区并签署」共用内核（站内 `/sign-batch` 与免登录公开端共用）。

    逐 item 新建签署区（required=False）并按坐标把签章图盖到 PDF；`image_data_url`
    优先使用，缺省按类型生成；最后统一落痕并推进状态机，返回 (created, signature_hash)。
    """
    # 有效期与串行顺序在落任何签区之前校验，避免产生半成品签署区
    _ensure_not_expired(session, contract)
    _ensure_sign_turn(session, contract, party)

    _method_map = {
        "signature": SignMethod.personal_handwrite,
        "personal_handwrite": SignMethod.personal_handwrite,
        "personal_seal": SignMethod.personal_seal,
        "seal": SignMethod.company_seal,
        "company_seal": SignMethod.company_seal,
        "date": SignMethod.date,
    }
    _ft_map = {
        SignMethod.company_seal: SignFieldType.seal,
        SignMethod.date: SignFieldType.date,
    }

    first_field_id: Optional[uuid.UUID] = None
    first_method: Optional[SignMethod] = None
    first_svg: Optional[str] = None
    created: List[dict] = []
    placements: list = []

    for it in items:
        method = _method_map.get(
            str(it.get("method") or it.get("field_type") or ""),
            SignMethod.personal_handwrite,
        )
        page = max(1, int(it.get("page", 1) or 1))
        x = min(100.0, max(0.0, float(it.get("x", 0) or 0)))
        y = min(100.0, max(0.0, float(it.get("y", 0) or 0)))
        w = min(100.0, max(1.0, float(it.get("w", 0) or 0) or 20.0))
        h = min(100.0, max(1.0, float(it.get("h", 0) or 0) or 8.0))
        ft = _ft_map.get(method, SignFieldType.signature)

        # 先做纯校验（SVG 黑名单、图片解码），任何一项失败都不产生副作用。
        raw_svg = it.get("signature_svg")
        svg = _sanitize_signature_svg(raw_svg) if raw_svg else None
        img = _decode_image_data_url(it.get("image_data_url"))

        field = ContractSignField(
            contract_id=contract.id,
            party_id=party.id,
            field_type=ft,
            page=page,
            x=x,
            y=y,
            w=w,
            h=h,
            required=False,
            created_by=created_by,
        )
        session.add(field)
        session.flush()  # 取 field.id 供落章定位
        placements.append((field, method, img))

        created.append(
            {
                "field_id": str(field.id),
                "field_type": ft.value,
                "page": page,
                "x": x,
                "y": y,
                "w": w,
                "h": h,
            }
        )
        if first_field_id is None:
            first_field_id = field.id
            first_method = method
            first_svg = svg

    # 全部落章先在内存里跑完，成功后才原子替换 PDF；失败则 502 且不置已签。
    pdf_signed = _apply_pdf_signatures(session, contract, party, placements) is True

    for field, _method, _img in placements:
        field.signed = True
        field.signed_at = datetime.utcnow()
        session.add(field)

    sig_hash = _finalize_party_signed(
        session,
        contract,
        party,
        signer_user_id=signer_user_id,
        ip=ip,
        signature_svg=first_svg,
        method=first_method or SignMethod.personal_handwrite,
        field_id=first_field_id,
    )
    return created, sig_hash, pdf_signed


def _activate_broker_role_if_agreement(session: Session, contract: Contract) -> None:
    """经纪人协议全部签署后，激活对应业务侧。幂等：仅当协议为 signed 且尚未激活。

    在 contracts.py 内联实现，避免循环导入 broker 路由。根据合同 kind 更新
    BrokerPartner.distributor_active / listing_active。
    """
    from app.models import BrokerPartner

    if contract.kind not in (ContractKind.broker_distributor, ContractKind.listing_agent):
        return
    if contract.status != ContractStatus.signed:
        return

    partner = None
    if contract.kind == ContractKind.broker_distributor:
        partner = session.exec(
            select(BrokerPartner).where(
                BrokerPartner.distributor_contract_id == contract.id,
                BrokerPartner.deleted_at.is_(None),
            )
        ).first()
        active_field = "distributor_active"
    else:
        partner = session.exec(
            select(BrokerPartner).where(
                BrokerPartner.listing_contract_id == contract.id,
                BrokerPartner.deleted_at.is_(None),
            )
        ).first()
        active_field = "listing_active"
    if partner is None:
        return
    if getattr(partner, active_field):
        return  # 幂等：已激活
    setattr(partner, active_field, True)
    session.add(partner)
    session.commit()


def _pdf_signature_health(contract: Contract) -> Optional[str]:
    """计算已签 PDF 的内嵌签名健康度（不落库，纯展示态）。

    - `ok`：所有签名域的 `valid` 均为 1；
    - `invalid`：存在 `valid != 1` 的签名域（历史多人签署全量重写导致）；
    - None：无已签存档 / 文件缺失 / 引擎异常，无法判定（前端不提示）。

    该值只用于「历史签名异常，建议重签」提示，**不改变合同状态**。
    """
    signed = getattr(contract, "signed_pdf_path", None)
    if not signed:
        return None
    path = Path(signed)
    if not path.exists():
        return None
    try:
        from app.services import kaifang_sign_service

        report = kaifang_sign_service.get_engine().verify_pdf(path.read_bytes())
    except Exception:  # noqa: BLE001  验签失败不应让列表/详情整体失败
        logger.exception("verify signed pdf failed: %s", path)
        return None
    if not report:
        return None
    return "ok" if all(int(x.get("valid", 0)) == 1 for x in report) else "invalid"


@router.get("", response_model=List[ContractSummary])
def list_contracts(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """当前用户可见的合同列表。

    员工看到全量；业主/租客只看到本人作为签署方或挂在本人租约下的合同
    （见 `contract_visibility_conditions`）。修复前这里是全站合同无过滤返回。
    员工视角附带 `signature_health`（计算态，不落库）：历史签名失效的合同
    需要在列表直接可见「建议重签」，不能只显示「已签署」。
    """
    conditions = contract_visibility_conditions(session, user)
    query = select(Contract).where(Contract.deleted_at.is_(None))
    if conditions:
        query = query.where(*conditions)
    contracts = session.exec(query.order_by(Contract.created_at.desc())).all()
    is_staff = user.role in STAFF_ROLES
    items = []
    for c in contracts:
        item = {
            "id": str(c.id),
            "title": c.title,
            "kind": c.kind.value if c.kind else "lease",
            "source": c.source.value if c.source else "generated",
            "status": c.status.value,
            "language": c.language,
            "document_hash": c.document_hash,
            "created_at": c.created_at.isoformat(),
            "signed_at": c.signed_at.isoformat() if c.signed_at else None,
            "signature_health": _pdf_signature_health(c) if is_staff else None,
            # 签署有效期（过期只是展示态；实际状态由签署/读取接口推进为 expired）
            "expires_at": c.expires_at.isoformat() if c.expires_at else None,
            "sign_order_type": c.sign_order_type.value
            if c.sign_order_type
            else "parallel",
        }
        items.append(item)
    return items


@router.get("/preview/{preview_token}")
def preview_contract_file(
    preview_token: str,
    session: Session = Depends(get_session),
):
    """凭短令牌返回合同原始文件（无鉴权，令牌 15 分钟过期）。

    三端直接在 iframe/浏览器/下载器里打开，规避浏览器无法带 Bearer 头的问题。
    仅返回落盘原件，不暴露合同 id；令牌无效/过期分别 404/410。
    """
    contract = session.exec(
        select(Contract).where(Contract.preview_token == preview_token)
    ).first()
    if not contract or contract.deleted_at:
        raise HTTPException(status_code=404, detail="Contract not found")
    if contract.preview_token_expires_at is not None and (
        contract.preview_token_expires_at < datetime.utcnow()
    ):
        raise HTTPException(status_code=410, detail="Preview link expired")
    if not contract.file_path:
        raise HTTPException(status_code=404, detail="Contract file not found")
    path = resolve_stored_path(
        contract.file_path,
        UPLOAD_DIR,
        STORED_URL_PREFIX,
        not_found_message="Contract file not found on disk",
    )
    return FileResponse(path)


@router.get("/{contract_id}/file-url")
def get_contract_file_url(
    contract_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """生成 15 分钟有效期的合同原件一次性预览 URL（限员工）。

    复用详情端点的可见性校验确认当前用户能看这份合同；拿不到合同或
    `file_path` 为空时 404。返回相对 URL，前端补 origin 后交给三端打开。
    """
    contract = _get_visible_contract(session, user, contract_id)
    if not contract.file_path:
        raise HTTPException(status_code=404, detail="Contract file not found")
    token = secrets.token_urlsafe(24)
    contract.preview_token = token
    contract.preview_token_expires_at = datetime.utcnow() + timedelta(minutes=15)
    session.add(contract)
    session.commit()
    return {"url": f"/api/v1/contracts/preview/{token}"}


def _resolve_contract_pdf(contract: Contract) -> Optional[Path]:
    """返回合同引擎 PDF 的落盘路径（优先已签存档，其次原始 PDF）。"""
    from app.services import kaifang_sign_service  # noqa: F401  仅用于路径语义

    for attr in ("signed_pdf_path", "pdf_path"):
        v = getattr(contract, attr, None)
        if v and Path(v).exists():
            return Path(v)
    return None


def _contract_pdf_page_count(contract: Contract) -> Optional[int]:
    """合同引擎 PDF 的页数。

    三端前端都按 `pdf_page_count` 逐页渲染文档背景（翻页/多页落框），
    详情响应若不回该字段，前端会退化成「永远只有第 1 页」。
    无 PDF 或引擎不可用时返回 None（前端按 1 页降级）。
    """
    path = _resolve_contract_pdf(contract)
    if not path:
        return None
    try:
        from app.services import kaifang_sign_service

        return kaifang_sign_service.get_engine().page_count(path.read_bytes())
    except Exception:  # noqa: BLE001  引擎异常不应让详情接口整体失败
        return None


@router.get("/{contract_id}/pdf")
def get_contract_pdf(
    contract_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user_allow_query_token),
):
    """合同引擎 PDF 原件/已签件（可见者访问，浏览器内嵌预览）。

    鉴权兼容 `Authorization` 头与 `?token=`（供 App/小程序 `<Image>` 加载）。
    """
    contract = _get_visible_contract(session, user, contract_id)
    p = _resolve_contract_pdf(contract)
    if not p:
        raise HTTPException(status_code=404, detail="Contract PDF not found")
    return FileResponse(p, media_type="application/pdf")


@router.get("/{contract_id}/pdf-pages/{page}")
def get_contract_pdf_page(
    contract_id: uuid.UUID,
    page: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user_allow_query_token),
):
    """合同引擎 PDF 第 N 页渲染为 PNG（供前端页图预览 / 拖拽定位签署）。"""
    from fastapi.responses import Response

    contract = _get_visible_contract(session, user, contract_id)
    p = _resolve_contract_pdf(contract)
    if not p:
        raise HTTPException(status_code=404, detail="Contract PDF not found")
    # 页号从 1 起：page=0 / 负数会被引擎解释为「从末页倒推」，返回 200 与真实页图。
    if page < 1:
        raise HTTPException(status_code=404, detail="Page out of range")
    from app.services import kaifang_sign_service

    try:
        png = kaifang_sign_service.get_engine().page_image(p.read_bytes(), page=page)
    except IndexError:
        raise HTTPException(status_code=404, detail="Page out of range")
    return Response(content=png, media_type="image/png")


@router.get("/{contract_id}", response_model=ContractDetailResponse)
def get_contract(
    contract_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """合同详情（含当事人与正文）。

    正文含双方证件号，属 PII：可见性走 `can_view_contract()`，
    不可见时返回 404（不暴露「存在但你没权限」）。
    """
    contract = _get_visible_contract(session, user, contract_id)
    parties = session.exec(
        select(ContractParty).where(ContractParty.contract_id == contract_id)
    ).all()
    is_staff = user.role in STAFF_ROLES
    return {
        "id": str(contract.id),
        "title": contract.title,
        "kind": contract.kind.value if contract.kind else "lease",
        "source": contract.source.value if contract.source else "generated",
        "created_by": str(contract.created_by) if contract.created_by else None,
        "status": contract.status.value,
        "language": contract.language,
        "document_hash": contract.document_hash,
        "content_html": contract.content_html,
        "file_path": contract.file_path,
        "pdf_available": _resolve_contract_pdf(contract) is not None,
        "pdf_page_count": _contract_pdf_page_count(contract),
        # 计算态：`invalid` 表示已签 PDF 存在签名域校验未通过（历史缺陷），
        # 前端据此提示「历史签名异常，建议重签」，不落库、不改合同状态。
        "signature_health": _pdf_signature_health(contract),
        # 是否已有已签 PDF 存档（决定详情页是否显示「下载已签合同」）
        "signed_pdf_available": bool(getattr(contract, "signed_pdf_path", None)),
        # 签署有效期与顺序编排（供列表/详情提示与顺序编排 UI 回显）
        "expires_at": contract.expires_at.isoformat() if contract.expires_at else None,
        "expired": bool(contract.expires_at and contract.expires_at < datetime.utcnow()),
        "sign_order_type": contract.sign_order_type.value
        if contract.sign_order_type
        else "parallel",
        "callback_url": contract.callback_url if is_staff else None,
        "can_edit": is_staff
        and contract.status
        not in (ContractStatus.signed, ContractStatus.completed, ContractStatus.voided),
        "created_at": contract.created_at.isoformat(),
        "parties": [
            {
                "id": str(p.id),
                # 归属用户：前端据此判断「哪一方是本人」，避免遍历所有未签方代签
                "user_id": str(p.user_id) if p.user_id else None,
                "name": p.name,
                "email": p.email,
                "phone": p.phone,
                "role": p.role.value,
                "signed": p.signed,
                "sign_method": p.sign_method.value if p.sign_method else SignMethod.personal_handwrite.value,
                "real_name_verified_at": p.real_name_verified_at.isoformat()
                if p.real_name_verified_at
                else None,
                "signed_at": p.signed_at.isoformat() if p.signed_at else None,
                "sign_order": p.sign_order,
                "can_sign_now": _can_sign_now(session, contract, p),
                "declined_at": p.declined_at.isoformat() if p.declined_at else None,
                "decline_reason": p.decline_reason,
                # 签署令牌属敏感凭据：只对员工回显（业主/租客本就无需链接）
                "sign_token": p.sign_token if is_staff else None,
                "sign_token_expires_at": (
                    p.sign_token_expires_at.isoformat()
                    if is_staff and p.sign_token_expires_at
                    else None
                ),
                "sign_url": (
                    _sign_url(p.sign_token) if is_staff and p.sign_token else None
                ),
            }
            for p in parties
        ],
        "sign_fields": _get_sign_fields(session, contract_id, user),
    }


def build_verify_report(
    session: Session,
    contract: Contract,
) -> dict:
    """构建合同验签报告（供站内与公开验签共用）。

    口径（BUG#3 修复后）：
    - 生成型合同：正文 HTML 的 sha256 为权威哈希；
    - 上传型合同：**真实文件字节**的 sha256 为权威哈希（历史数据可能按旧口径
      哈希空正文，此类仅标记 `document_hash_legacy`，不计为篡改）；
    - tampered = 复算权威哈希 != document_hash；
    - signatures = SignatureRecord 逐条，按时间升序；每条复算其 signature_hash 比对；
    - pdf_signature = 引擎内嵌签名验签结果（多人签署时每一条的 valid 均应为 1）。
    """
    provider = esign_service.get_sign_provider()
    content_sha = esign_service.content_hash(contract.content_html or "")
    if contract.source == ContractSource.uploaded:
        doc_digest = _contract_document_digest(contract)
        digest_source = "file_bytes" if doc_digest else "content_html"
        if not doc_digest:
            doc_digest = content_sha
    else:
        doc_digest = content_sha
        digest_source = "content_html"
    # 历史上传件在修复前一律按 content_html 哈希（常见为空正文字面量），
    # 与新的文件字节口径天然不同；识别出来只做标记，不判为篡改。
    legacy = (
        contract.source == ContractSource.uploaded
        and bool(contract.document_hash)
        and contract.document_hash == content_sha
        and doc_digest != content_sha
    )
    recomputed = doc_digest
    sign_digest = provider.sign_digest(str(contract.document_hash or ""))
    tampered = (
        bool(contract.document_hash) and not legacy and recomputed != contract.document_hash
    )

    signatures = session.exec(
        select(SignatureRecord)
        .where(SignatureRecord.contract_id == contract.id)
        .order_by(SignatureRecord.created_at.asc())
    ).all()

    sign_types = {}
    sig_list = []
    for rec in signatures:
        method = rec.method.value if rec.method else SignMethod.personal_handwrite.value

        field = session.get(ContractSignField, rec.field_id) if rec.field_id else None
        # 整份合同总览记录（签署完成时落的一条哨兵记录，无签名图、无签署区）：
        # 它不是某个签署方的签名，既不该计入签署方式统计，也不该按「复算签名哈希」
        # 判定——否则它的 signature_svg 为空会被误判成「内容被篡改」，
        # 与整份合同「验签通过」的结论自相矛盾，且会把内部哨兵名 `__overview__` 露给用户。
        is_document_record = rec.field_id is None and rec.signer_name == "__overview__"

        if is_document_record:
            sig_list.append(
                {
                    "party_name": None,
                    "role": "document",
                    "is_document_record": True,
                    "method": method,
                    "signed_at": rec.created_at.isoformat() if rec.created_at else None,
                    "ip": rec.ip,
                    "signature_hash": rec.signature_hash,
                    # 总览记录的完整性 = 落库文档哈希与当前文档哈希一致且未被篡改
                    "signature_success": bool(
                        rec.signature_hash and rec.signature_hash == contract.document_hash
                    )
                    and not tampered,
                    "field_id": None,
                    "signer_user_id": str(rec.signer_user_id)
                    if rec.signer_user_id
                    else None,
                    "x": None,
                    "y": None,
                    "w": None,
                    "h": None,
                    "page": None,
                }
            )
            continue

        sign_types[method] = sign_types.get(method, 0) + 1

        # 复算该签名哈希：与 _apply_signature 一致
        recomputed_hash = None
        if rec.signature_hash and rec.signer_name and rec.signature_svg:
            try:
                recomputed_hash = provider.sign_digest(
                    f"{contract.document_hash}|{rec.party_id}|"
                    f"{rec.signer_name}|{rec.signature_svg}"
                )
            except Exception:
                recomputed_hash = None

        sig_list.append(
            {
                "party_name": rec.signer_name,
                "role": None,
                "is_document_record": False,
                "method": method,
                "signed_at": rec.created_at.isoformat() if rec.created_at else None,
                "ip": rec.ip,
                "signature_hash": rec.signature_hash,
                "signature_success": bool(
                    recomputed_hash and recomputed_hash == rec.signature_hash
                ),
                "field_id": str(rec.field_id) if rec.field_id else None,
                "signer_user_id": str(rec.signer_user_id)
                if rec.signer_user_id
                else None,
                "x": field.x if field else None,
                "y": field.y if field else None,
                "w": field.w if field else None,
                "h": field.h if field else None,
                "page": field.page if field else None,
            }
        )

    # ---- kaifangqian->Python 引擎内嵌 PDF 签名核验（有已签 PDF 时） ----
    engine_report = None
    if getattr(contract, "signed_pdf_path", None):
        from pathlib import Path

        p = Path(contract.signed_pdf_path)
        if p.exists():
            try:
                from app.services import kaifang_sign_service

                engine_report = kaifang_sign_service.get_engine().verify_pdf(
                    p.read_bytes()
                )
            except Exception:  # noqa: BLE001
                engine_report = None

    pdf_signature_all_valid = None
    if isinstance(engine_report, list) and engine_report:
        pdf_signature_all_valid = all(item.get("valid") == 1 for item in engine_report)

    return {
        "contract_id": str(contract.id),
        "title": contract.title,
        "kind": contract.kind.value if contract.kind else "lease",
        "status": contract.status.value if contract.status else None,
        "document_hash": contract.document_hash,
        # 复算出的权威哈希：生成型=正文 HTML，上传型=文件字节
        "content_sha256": recomputed,
        "content_html_sha256": content_sha,
        "document_hash_source": digest_source,
        # 历史上传件按旧口径（正文哈希）落库时置 True，仅提示、不计篡改
        "document_hash_legacy": legacy,
        "sign_digest": sign_digest,
        "tampered": tampered,
        "sign_types_summary": sign_types,
        "signatures": sig_list,
        "pdf_signature": engine_report,  # 引擎内嵌数字签名验签结果
        "pdf_signed": bool(getattr(contract, "signed_pdf_path", None)),
        # 多人依次签署后，每条内嵌签名的 valid 都应为 1
        "pdf_signature_valid_all": pdf_signature_all_valid,
        # `verified` 必须同时满足：内容未篡改、留有签署记录、PDF 签名域全部有效。
        # 历史双签文件中前一位 `valid=0` 时，不能笼统显示「验签通过」。
        "verified": (
            not tampered
            and bool(sig_list)
            and pdf_signature_all_valid is not False
        ),
    }


@router.get("/{contract_id}/verify")
def verify_contract(
    contract_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """验签报告（员工可访问）。详见 `build_verify_report`。"""
    contract = _get_visible_contract(session, user, contract_id)
    return build_verify_report(session, contract)


@router.get("/{contract_id}/signed-file")
def download_signed_contract(
    contract_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """下载已签 PDF（需可见权限；不暴露上传目录）。未产出已签件时 404。"""
    contract = _get_visible_contract(session, user, contract_id)
    signed = getattr(contract, "signed_pdf_path", None)
    if not signed or not Path(signed).exists():
        raise HTTPException(status_code=404, detail="Signed file not available")
    name = f"{contract.contract_no or 'contract'}_signed.pdf"
    return FileResponse(
        Path(signed), media_type="application/pdf", filename=name
    )


def _build_evidence_report_pdf(contract: Contract, report: dict, parties) -> bytes:
    """生成存证报告 PDF（内容哈希 + 签署留痕 + 内嵌签名校验）。

    全部数据来自当前存档的实时计算结果，不读写数据库标记位。
    """
    import html
    from io import BytesIO

    from reportlab.lib import colors
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.platypus import Paragraph, Spacer, Table, TableStyle

    from app.services import kaifang_sign_service

    engine = kaifang_sign_service.get_engine()
    font = engine._font()
    base = ParagraphStyle("base", fontName=font, fontSize=9.5, leading=14)
    h1 = ParagraphStyle("h1", parent=base, fontSize=16, leading=22, spaceAfter=6)
    h2 = ParagraphStyle("h2", parent=base, fontSize=11.5, leading=17, spaceBefore=10, spaceAfter=5)
    small = ParagraphStyle("small", parent=base, fontSize=8, leading=11, textColor=colors.grey)

    def p(value, style=base) -> Paragraph:
        return Paragraph(html.escape("" if value is None else str(value)), style)

    def table(rows, widths):
        t = Table([[p(c) for c in row] for row in rows], colWidths=widths)
        t.setStyle(
            TableStyle(
                [
                    ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#d8dde3")),
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f2f5f8")),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 6),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                    ("TOPPADDING", (0, 0), (-1, -1), 4),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ]
            )
        )
        return t

    if report.get("tampered"):
        verdict = "内容哈希与存档不一致，存在篡改风险。"
    elif report.get("pdf_signature_valid_all") is False:
        verdict = "存在校验未通过的 PDF 签名域（历史签名异常），建议重新签署。"
    elif report.get("verified"):
        verdict = "验签通过：内容未篡改，且全部 PDF 签名域校验通过。"
    else:
        verdict = "无有效签署记录，无法确认合同效力。"

    story = [
        Paragraph("电子合同存证报告", h1),
        p(f"合同编号：{contract.contract_no or '-'}    生成时间：{datetime.utcnow().isoformat()}Z"),
        Paragraph("一、合同信息", h2),
        table(
            [
                ["项目", "内容"],
                ["标题", contract.title or "-"],
                ["状态", contract.status.value if contract.status else "-"],
                ["来源", contract.source.value if contract.source else "-"],
                ["语言", contract.language or "-"],
                ["创建时间", contract.created_at.isoformat() if contract.created_at else "-"],
                ["签署完成时间", contract.signed_at.isoformat() if contract.signed_at else "-"],
            ],
            [90, 390],
        ),
        Paragraph("二、内容完整性", h2),
        table(
            [
                ["项目", "内容"],
                ["存档哈希 document_hash", report.get("document_hash") or "-"],
                ["哈希口径", report.get("document_hash_source") or "-"],
                ["复算哈希", report.get("content_sha256") or "-"],
                ["历史旧口径", "是（仅提示，不计篡改）" if report.get("document_hash_legacy") else "否"],
                ["是否篡改", "是" if report.get("tampered") else "否"],
            ],
            [110, 370],
        ),
        Paragraph("三、签署方", h2),
        table(
            [["签署方", "角色", "状态", "签署时间"]]
            + [
                [
                    x.name or "-",
                    x.role.value if x.role else "-",
                    "已签署" if x.signed else ("已拒签" if x.declined_at else "待签署"),
                    x.signed_at.isoformat() if x.signed_at else "-",
                ]
                for x in parties
            ],
            [150, 90, 90, 150],
        ),
    ]

    sigs = report.get("signatures") or []
    story.append(Paragraph("四、签署留痕", h2))
    if sigs:
        story.append(
            table(
                [["签署人", "方式", "时间", "IP", "签名哈希", "校验"]]
                + [
                    [
                        s.get("party_name") or s.get("signer_name") or "-",
                        s.get("method") or "-",
                        s.get("signed_at") or "-",
                        s.get("ip") or "-",
                        (s.get("signature_hash") or "-")[:16],
                        "通过" if s.get("signature_success") else "未通过",
                    ]
                    for s in sigs
                ],
                [90, 80, 120, 80, 70, 40],
            )
        )
    else:
        story.append(p("无签署留痕。", small))

    pdf_sigs = report.get("pdf_signature") or []
    story.append(Paragraph("五、PDF 内嵌签名", h2))
    if pdf_sigs:
        story.append(
            table(
                [["#", "签名主体", "签名域", "校验结果"]]
                + [
                    [
                        str(i + 1),
                        s.get("signed_by") or "-",
                        s.get("field_name") or "-",
                        "valid=1（通过）" if int(s.get("valid", 0)) == 1 else f"valid={s.get('valid')}（未通过）",
                    ]
                    for i, s in enumerate(pdf_sigs)
                ],
                [30, 190, 130, 130],
            )
        )
    else:
        story.append(p("无 PDF 内嵌签名（或尚未产出已签 PDF）。", small))

    story += [
        Paragraph("六、结论", h2),
        p(verdict),
        Spacer(1, 8),
        p("说明：本报告由系统按当前存档实时计算生成，仅用于存证与审计参考，不改变合同状态。", small),
    ]

    stream = BytesIO()
    engine._pdf_doc(stream).build(story)
    return stream.getvalue()


@router.get("/{contract_id}/evidence-report")
def download_evidence_report(
    contract_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """下载存证报告（PDF，需可见权限，含内容哈希与签名校验结论）。"""
    contract = _get_visible_contract(session, user, contract_id)
    report = build_verify_report(session, contract)
    parties = session.exec(
        select(ContractParty)
        .where(ContractParty.contract_id == contract_id)
        .order_by(ContractParty.created_at.asc())
    ).all()
    content = _build_evidence_report_pdf(contract, report, parties)
    name = f"{contract.contract_no or 'contract'}_evidence.pdf"
    return Response(
        content=content,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )