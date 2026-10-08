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
- `sign` 必须由**该签署方本人**发起：`party.user_id == 当前用户`；
  员工代签仍允许（记录 `signer_user_id` 留痕），但签名姓名一律取服务端 `party.name`，
  不接受客户端传入——否则可自填姓名冒充他人签署。
- 未注册客户走 `/public/contract-sign/{token}`（令牌一次性、可过期），
  不经过登录态，签署留痕写真实 IP。
"""
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

from app.config import settings
from app.core.auth import (
    STAFF_ROLES,
    can_view_contract,
    contract_visibility_conditions,
    get_current_user,
    require_employee,
)
from app.core.uploads import save_upload
from app.db import get_session
from app.models import (
    Notification,
    NotificationChannel,
    NotificationStatus,
    User, Contract, ContractStatus, ContractKind, ContractSource, ContractParty,
    SignerRole, SignatureRecord, ContractSignField, SignFieldType, SignMethod,
)
from app.providers.notification.base import (
    NotificationChannel as ProviderChannel,
    NotificationMessage,
)
from app.providers.notification.router import notification_router
from app.services import esign_service
from .documents import ALLOWED_DOCUMENT_TYPES

router = APIRouter(prefix="/contracts", tags=["contracts"])

# 上传合同的落盘目录（backend/uploads/contracts）。
# 与 documents 一样**不**由 /uploads 静态服务托管：合同正文含双方证件号，
# 一律经带令牌校验的读取接口分发（见 contract_sign_public.py）。
UPLOAD_DIR = Path(__file__).resolve().parents[3] / "uploads" / "contracts"
MAX_CONTRACT_SIZE = 20 * 1024 * 1024  # 单个合同文件 20MB
STORED_URL_PREFIX = "/uploads/contracts/"

# 免登录签署链接默认有效期（天）
_DEFAULT_TOKEN_DAYS = 7
_MAX_TOKEN_DAYS = 60


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
    party = ContractParty(
        contract_id=contract_id,
        user_id=user_id_u,
        name=payload.get("name", ""),
        email=payload.get("email", ""),
        id_number=payload.get("id_number"),
        phone=payload.get("phone"),
        role=role,
    )
    session.add(party)
    session.commit()
    session.refresh(party)
    return {
        "id": str(party.id),
        "name": party.name,
        "role": party.role.value,
        "signed": party.signed,
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
            x = float(item.get("x", 0.0))
            y = float(item.get("y", 0.0))
            w = float(item.get("w", 0.0))
            h = float(item.get("h", 0.0))
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


def _issue_sign_token(party: ContractParty, expires_in_days: int) -> str:
    """为签署方生成/续期免登录签署令牌（一次性，签署后清空）。"""
    days = expires_in_days or _DEFAULT_TOKEN_DAYS
    days = max(1, min(int(days), _MAX_TOKEN_DAYS))
    token = secrets.token_urlsafe(32)
    party.sign_token = token
    party.sign_token_expires_at = datetime.utcnow() + timedelta(days=days)
    return token


def _require_editable(contract: Contract) -> None:
    """已签署/已作废的合同不允许再改内容或作废。"""
    if contract.status in (ContractStatus.signed, ContractStatus.completed):
        raise HTTPException(status_code=409, detail="Contract already signed")
    if contract.status == ContractStatus.voided:
        raise HTTPException(status_code=409, detail="Contract already voided")


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
    session.add(contract)
    session.commit()
    session.refresh(contract)
    return {"id": str(contract.id), "file_path": contract.file_path, "source": contract.source.value}


@router.post("/{contract_id}/share-link")
def create_share_link(
    contract_id: uuid.UUID,
    payload: dict,
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """为某签署方生成免登录签署链接。payload: {party_id, expires_in_days?}

    用于「客户没走平台流程 / 未注册账号」的场景：链接可转发给客户，
    打开即免登录签署（一次性，签署后令牌清空）。
    """
    contract = _get_visible_contract(session, user, contract_id)
    _require_editable(contract)
    party = _get_party(session, contract_id, payload.get("party_id"))
    if party.signed:
        raise HTTPException(status_code=409, detail="Party already signed")

    token = _issue_sign_token(party, payload.get("expires_in_days"))
    session.add(party)
    session.commit()
    session.refresh(party)
    return {
        "party_id": str(party.id),
        "party_name": party.name,
        "token": token,
        "url": _sign_url(token),
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
    return {"id": str(contract.id), "status": contract.status.value}


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
    """
    name = party.name
    stamp = contract.title or contract.id
    provider = esign_service.get_sign_provider()
    sig_svg = signature_svg or provider.render_signature(name, str(stamp))
    sig_hash = provider.sign_digest(
        f"{contract.document_hash}|{party.id}|{name}|{sig_svg}"
    )

    # 按字段签署：校验归属 + 未签
    if field_id is not None:
        field = session.get(ContractSignField, field_id)
        if not field or field.contract_id != contract.id:
            raise HTTPException(status_code=404, detail="Sign field not found")
        if field.party_id is not None and field.party_id != party.id:
            raise HTTPException(status_code=403, detail="Field not assigned to this party")
        if field.signed:
            raise HTTPException(status_code=409, detail="Sign field already signed")
        field.signed = True
        field.signed_at = datetime.utcnow()
        session.add(field)

    party.signed = True
    party.signed_at = datetime.utcnow()
    party.signature = sig_svg
    party.sign_token = None  # 一次性令牌：签署后立即失效
    party.sign_token_expires_at = None
    session.add(party)
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
        contract.document_hash = esign_service.content_hash(contract.content_html)
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
    - 非员工只能签**自己**那一方（`party.user_id == 当前用户`）；
    - 员工可代签（记录 `signer_user_id` 留痕），但仍不能修改签名姓名；
    - 签名姓名一律取服务端 `party.name`，不再接受 payload 里的 `name`——
      否则任何登录用户都能用任意 party_id 冒充他人签署；
    - IP 取真实请求来源，不再信任客户端自报。
    """
    contract = _get_visible_contract(session, user, contract_id)
    if contract.status == ContractStatus.voided:
        raise HTTPException(status_code=409, detail="Contract already voided")
    party = _get_party(session, contract_id, payload.get("party_id"))

    if user.role not in STAFF_ROLES and party.user_id != user.id:
        # 非员工只能签自己那一方；未绑定用户的签署方只有员工能代签
        raise HTTPException(status_code=403, detail="Not a party of this contract")
    if party.signed:
        raise HTTPException(status_code=409, detail="Party already signed")

    # P3 强制实名：登录态签署。
    # - 未绑定用户的外部签署方（员工代签）须先走公开端验证码实名；
    # - 已绑定登录用户的签署方，其身份经平台登录态可信，首次签署自动置为
    #   内部认证（real_name_verified_at=now，来源=internal），避免重复过验证码。
    if not party.real_name_verified_at:
        if party.user_id is not None:
            party.real_name_verified_at = datetime.utcnow()
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


@router.get("", response_model=List[ContractSummary])
def list_contracts(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """当前用户可见的合同列表。

    员工看到全量；业主/租客只看到本人作为签署方或挂在本人租约下的合同
    （见 `contract_visibility_conditions`）。修复前这里是全站合同无过滤返回。
    """
    conditions = contract_visibility_conditions(session, user)
    query = select(Contract).where(Contract.deleted_at.is_(None))
    if conditions:
        query = query.where(*conditions)
    contracts = session.exec(query.order_by(Contract.created_at.desc())).all()
    return [
        {
            "id": str(c.id),
            "title": c.title,
            "kind": c.kind.value if c.kind else "lease",
            "source": c.source.value if c.source else "generated",
            "status": c.status.value,
            "language": c.language,
            "document_hash": c.document_hash,
            "created_at": c.created_at.isoformat(),
            "signed_at": c.signed_at.isoformat() if c.signed_at else None,
        }
        for c in contracts
    ]


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
        "can_edit": is_staff
        and contract.status
        not in (ContractStatus.signed, ContractStatus.completed, ContractStatus.voided),
        "created_at": contract.created_at.isoformat(),
        "parties": [
            {
                "id": str(p.id),
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

    口径：
    - content_sha256 = 复算当前 content_html；
    - sign_digest = 现有 HMAC 摘要（对当前 document_hash 做 HMAC-SHA256）；
    - tampered = 复算 content_sha256 != document_hash；
    - signatures = SignatureRecord 逐条，按时间升序；每条复算其 signature_hash 比对。
    """
    provider = esign_service.get_sign_provider()
    recomputed = esign_service.content_hash(contract.content_html or "")
    sign_digest = provider.sign_digest(str(contract.document_hash or ""))
    tampered = bool(contract.document_hash) and recomputed != contract.document_hash

    signatures = session.exec(
        select(SignatureRecord)
        .where(SignatureRecord.contract_id == contract.id)
        .order_by(SignatureRecord.created_at.asc())
    ).all()

    sign_types = {}
    sig_list = []
    for rec in signatures:
        method = rec.method.value if rec.method else SignMethod.personal_handwrite.value
        sign_types[method] = sign_types.get(method, 0) + 1

        field = session.get(ContractSignField, rec.field_id) if rec.field_id else None
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

    return {
        "contract_id": str(contract.id),
        "title": contract.title,
        "kind": contract.kind.value if contract.kind else "lease",
        "status": contract.status.value if contract.status else None,
        "document_hash": contract.document_hash,
        "content_sha256": recomputed,
        "sign_digest": sign_digest,
        "tampered": tampered,
        "sign_types_summary": sign_types,
        "signatures": sig_list,
        "verified": not tampered and bool(sig_list),
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