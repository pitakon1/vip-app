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
from datetime import datetime, timedelta, timezone
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
from sqlalchemy import func
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
from app.core.uploads import detect_document_mime, resolve_stored_path, save_upload
from app.db import get_session
from app.models import (
    Notification,
    NotificationChannel,
    NotificationStatus,
    User, Contract, ContractStatus, ContractKind, ContractSource, ContractParty,
    ContractSignOrder, ContractCallbackEvent, ContractCallbackStatus,
    ContractCallbackSubscription,
    ContractSignAuthorization,
    ContractTemplate,
    ContractTemplateVersion,
    ApprovalObjectType,
    ContractApprovalStatus,
    ContractApprovalRule,
    ContractApprovalRequest,
    SignerRole, SignatureRecord, ContractSignField, SignFieldType, SignMethod,
    UserRole,
)
from app.providers.notification.base import (
    NotificationChannel as ProviderChannel,
    NotificationMessage,
)
from app.providers.notification.router import notification_router
from app.services import esign_service
from app.services import contract_jobs
from app.services import contract_approval
from app.services import contract_audit as audit
from app.services.contract_privacy import initiator_contact
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
# 授权书（代签授权凭证）与合同同域落盘，但不与合同文件混放
AUTHORIZATION_DIR = UPLOAD_DIR / "authorizations"
AUTHORIZATION_URL_PREFIX = STORED_URL_PREFIX + "authorizations/"

# 免登录签署链接默认有效期（天）。免登录链接是「持有即可签」的强凭据，
# 默认 3 天、上限 7 天：足够客户走完签署，又不至于长期滞留可被转发的链接。
# 重新生成链接会覆盖旧 token，旧链接立即失效。
_DEFAULT_TOKEN_DAYS = 3
_MAX_TOKEN_DAYS = 7


def _get_visible_contract(
    session: Session,
    user: User,
    contract_id: uuid.UUID,
    request: Optional[Request] = None,
) -> Contract:
    """取合同并做归属校验；不可见时统一 404（不回显「存在但你没权限」）。

    不可见时额外落一条 `contract.permission_denied` 审计（含操作人与 IP），
    合同本身不存在则不记，避免把「无效 id 探测」混入权限拒绝口径。
    """
    contract = session.get(Contract, contract_id)
    if not contract or contract.deleted_at:
        raise HTTPException(status_code=404, detail="Contract not found")
    if not can_view_contract(session, user, contract):
        audit.record_contract_audit(
            session,
            action=audit.ACTION_PERMISSION_DENIED,
            contract_id=contract_id,
            result="failure",
            actor=user,
            request=request,
            detail={"reason": "not_visible"},
            error="contract_not_visible",
        )
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
    # 发起方最小联系信息（姓名与手机号均已脱敏，不返回完整号码/邮箱）
    initiator_name: Optional[str] = None
    initiator_phone_masked: Optional[str] = None
    model_config = ConfigDict(extra="allow")


@router.post("/generate")
def generate_contract(
    payload: dict,
    request: Request,
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
    audit.record_contract_audit(
        session,
        action=audit.ACTION_CREATE,
        contract_id=contract.id,
        actor=user,
        request=request,
        detail={
            "source": contract.source.value,
            "kind": contract.kind.value,
            "language": contract.language,
        },
    )
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


# ---------------------------------------------------------------------------
# 合同审批流
#
# 规则表配置化（改阈值无需改代码）；提交时匹配规则，命中则合同进入
# pending_approval，审批通过前 `send` 一律 409。当前仅 contract 启用，
# sale_mandate / service_order 预留 object_type，不开放入口。
# ---------------------------------------------------------------------------
def _serialize_approval_rule(rule: ContractApprovalRule) -> dict:
    return {
        "id": str(rule.id),
        "object_type": rule.object_type.value,
        "field": rule.field,
        "operator": rule.operator.value,
        "threshold": rule.threshold,
        "threshold_max": rule.threshold_max,
        "approval_role": rule.approval_role,
        "approval_level": rule.approval_level,
        "priority": rule.priority,
        "enabled": rule.enabled,
        "note": rule.note,
    }


def _require_admin(user: User) -> None:
    if user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="ADMIN_REQUIRED")


class ApprovalRulePatch(BaseModel):
    """规则可调字段：阈值、层级、角色、优先级、启停与说明。"""

    threshold: Optional[float] = None
    threshold_max: Optional[float] = None
    approval_role: Optional[str] = None
    approval_level: Optional[int] = None
    priority: Optional[int] = None
    enabled: Optional[bool] = None
    note: Optional[str] = None


class ApprovalCommentBody(BaseModel):
    comment: Optional[str] = None


@router.get("/approval-rules")
def list_approval_rules(
    object_type: str = ApprovalObjectType.contract.value,
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """审批规则列表（默认仅启用规则；管理员可查全部）。"""
    try:
        obj_type = ApprovalObjectType(object_type)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid object_type")
    rules = contract_approval.list_rules(
        session, object_type=obj_type, enabled_only=user.role != UserRole.admin
    )
    return [_serialize_approval_rule(r) for r in rules]


@router.patch("/approval-rules/{rule_id}")
def patch_approval_rule(
    rule_id: uuid.UUID,
    payload: ApprovalRulePatch,
    request: Request,
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """修改规则阈值/启停（管理员）。改完立即生效，无需发版。"""
    _require_admin(user)
    rule = session.get(ContractApprovalRule, rule_id)
    if rule is None or rule.deleted_at:
        raise HTTPException(status_code=404, detail="Rule not found")
    data = payload.model_dump(exclude_unset=True)
    if "approval_role" in data and data["approval_role"]:
        if not contract_approval.role_user_roles(session, data["approval_role"]):
            raise HTTPException(status_code=400, detail="Invalid approval_role")
    if "approval_level" in data and data["approval_level"] not in (1, 2):
        raise HTTPException(status_code=400, detail="approval_level must be 1 or 2")
    for key, value in data.items():
        setattr(rule, key, value)
    rule.updated_by = user.id
    session.add(rule)
    session.commit()
    session.refresh(rule)
    return _serialize_approval_rule(rule)


@router.post("/{contract_id}/submit-approval")
def submit_contract_approval(
    contract_id: uuid.UUID,
    request: Request,
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """提交合同审批：自动匹配规则，命中则进入 pending_approval。"""
    contract = _get_visible_contract(session, user, contract_id, request=request)
    try:
        result = contract_approval.submit_contract_for_approval(session, contract, user)
    except contract_approval.ApprovalError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.code)
    approval = result.get("approval")
    audit.record_contract_audit(
        session,
        action=audit.ACTION_SUBMIT_APPROVAL,
        contract_id=contract.id,
        actor=user,
        request=request,
        detail={
            "requires_approval": result.get("requires_approval"),
            "already_pending": result.get("already_pending"),
            "approval_id": approval.get("id") if approval else None,
            "rule_hits": [h.get("rule_id") for h in (approval or {}).get("rule_hits", [])],
        },
    )
    return result


@router.get("/approvals")
def list_contract_approvals(
    scope: str = "pending",
    status: Optional[str] = None,
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """审批列表：scope=pending（待我审）/ submitted（我提交的）。"""
    if scope not in ("pending", "submitted"):
        raise HTTPException(status_code=400, detail="Invalid scope")

    query = select(ContractApprovalRequest).where(
        ContractApprovalRequest.object_type == ApprovalObjectType.contract
    )
    if scope == "submitted":
        query = query.where(ContractApprovalRequest.submitter_id == user.id)
        if status:
            try:
                query = query.where(ContractApprovalRequest.status == ContractApprovalStatus(status))
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid status")
    else:
        query = query.where(ContractApprovalRequest.status == ContractApprovalStatus.pending)

    rows = session.exec(
        query.order_by(ContractApprovalRequest.submitted_at.desc())
    ).all()

    if scope == "pending":
        rows = [
            r
            for r in rows
            if r.submitter_id != user.id
            and contract_approval.is_eligible(
                session, user, contract_approval.current_role(r)
            )
        ]

    contract_ids = {r.object_id for r in rows}
    contracts = {}
    if contract_ids:
        for contract in session.exec(
            select(Contract).where(Contract.id.in_(contract_ids))
        ).all():
            contracts[contract.id] = contract
    return [
        contract_approval.serialize_request(
            session, r, contract=contracts.get(r.object_id)
        )
        for r in rows
    ]


def _get_visible_approval(
    session: Session, user: User, approval_id: uuid.UUID
) -> ContractApprovalRequest:
    approval = session.get(ContractApprovalRequest, approval_id)
    if approval is None or approval.deleted_at:
        raise HTTPException(status_code=404, detail="Approval not found")
    if user.role == UserRole.admin or approval.submitter_id == user.id:
        return approval
    if approval.approver_id == user.id:
        return approval
    if approval.status == ContractApprovalStatus.pending and contract_approval.is_eligible(
        session, user, contract_approval.current_role(approval)
    ):
        return approval
    raise HTTPException(status_code=403, detail="Not allowed to view approval")


def _get_approval_for_decision(
    session: Session, approval_id: uuid.UUID
) -> ContractApprovalRequest:
    """审批动作专用取单：只校验存在性，层级/自审等由服务层给出明确原因。

    详情接口仍走 `_get_visible_approval` 做可见性收敛；审批动作不能让
    「层级不符」在可见性检查里变成笼统的 403，否则用户看不到拒批原因。
    """
    approval = session.get(ContractApprovalRequest, approval_id)
    if approval is None or approval.deleted_at:
        raise HTTPException(status_code=404, detail="Approval not found")
    return approval


@router.get("/approvals/{approval_id}")
def get_contract_approval(
    approval_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """审批详情：合同摘要、命中规则、分级计划与审批留痕。"""
    approval = _get_visible_approval(session, user, approval_id)
    return contract_approval.serialize_request(session, approval)


@router.post("/approvals/{approval_id}/approve")
def approve_contract_approval(
    approval_id: uuid.UUID,
    request: Request,
    payload: Optional[ApprovalCommentBody] = None,
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """审批通过；两级审批时第一级通过后仍为 pending，等待第二级。"""
    approval = _get_approval_for_decision(session, approval_id)
    comment = payload.comment if payload else None
    try:
        result = contract_approval.approve_request(session, approval, user, comment)
    except contract_approval.ApprovalError as exc:
        audit.record_contract_audit(
            session,
            action=audit.ACTION_APPROVE,
            contract_id=approval.object_id,
            result="failure",
            actor=user,
            request=request,
            detail={"approval_id": str(approval.id), "level": approval.current_level},
            error=exc.code,
        )
        raise HTTPException(status_code=exc.status_code, detail=exc.message)
    audit.record_contract_audit(
        session,
        action=audit.ACTION_APPROVE,
        contract_id=approval.object_id,
        actor=user,
        request=request,
        detail={
            "approval_id": str(approval.id),
            "level": result.get("current_level"),
            "status": result.get("status"),
            "contract_status": result.get("contract_status"),
        },
    )
    return result


@router.post("/approvals/{approval_id}/reject")
def reject_contract_approval(
    approval_id: uuid.UUID,
    request: Request,
    payload: ApprovalCommentBody,
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """驳回：退回草稿并保留意见；重新提交会生成新的审批单。"""
    approval = _get_approval_for_decision(session, approval_id)
    try:
        result = contract_approval.reject_request(
            session, approval, user, payload.comment or ""
        )
    except contract_approval.ApprovalError as exc:
        audit.record_contract_audit(
            session,
            action=audit.ACTION_REJECT,
            contract_id=approval.object_id,
            result="failure",
            actor=user,
            request=request,
            detail={"approval_id": str(approval.id), "level": approval.current_level},
            error=exc.code,
        )
        raise HTTPException(status_code=exc.status_code, detail=exc.message)
    audit.record_contract_audit(
        session,
        action=audit.ACTION_REJECT,
        contract_id=approval.object_id,
        actor=user,
        request=request,
        detail={
            "approval_id": str(approval.id),
            "level": approval.current_level,
            "comment": result.get("approval", {}).get("comment"),
        },
    )
    return result


# ---------------------------------------------------------------------------
# 代签授权链
#
# 员工代签他人身份前必须有覆盖该合同的有效授权；授权过期/撤销后立即失效。
# 授权范围 = 房源集合 + 合同类型集合 + 允许的签章方式（均为空表示不限）。
# ---------------------------------------------------------------------------
AUTHORIZATION_MAX_SIZE = 10 * 1024 * 1024  # 授权书 10MB
_AUTHORIZATION_TYPES = {".pdf", ".jpg", ".jpeg", ".png", ".webp"}


def _parse_iso_dt(value, field: str) -> Optional[datetime]:
    """解析 ISO 时间串为 UTC naive 时间；空值返回 None，非法值 400。"""
    if value in (None, ""):
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail=f"Invalid {field}")
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
    return parsed


def _parse_str_list(value, field: str) -> Optional[List[str]]:
    """把字符串列表去重规整；None/空列表返回 None（语义：不限）。"""
    if value is None:
        return None
    if not isinstance(value, list):
        raise HTTPException(status_code=400, detail=f"Invalid {field}")
    out: List[str] = []
    for item in value:
        text = str(item).strip()
        if text and text not in out:
            out.append(text)
    return out or None


def _authorization_status(auth: ContractSignAuthorization, now: Optional[datetime] = None) -> str:
    now = now or datetime.utcnow()
    if auth.revoked_at:
        return "revoked"
    if auth.valid_until and auth.valid_until < now:
        return "expired"
    if auth.valid_from and auth.valid_from > now:
        return "pending"
    return "active"


def _serialize_authorization(session: Session, auth: ContractSignAuthorization) -> dict:
    grantor = session.get(User, auth.grantor_user_id)
    grantee = session.get(User, auth.grantee_user_id)
    return {
        "id": str(auth.id),
        "grantor_user_id": str(auth.grantor_user_id),
        "grantor_name": (grantor.full_name or grantor.email) if grantor else None,
        "grantee_user_id": str(auth.grantee_user_id),
        "grantee_name": (grantee.full_name or grantee.email) if grantee else None,
        "property_ids": auth.property_ids or [],
        "contract_kinds": auth.contract_kinds or [],
        "seal_scope": auth.seal_scope or [],
        "valid_from": auth.valid_from.isoformat() if auth.valid_from else None,
        "valid_until": auth.valid_until.isoformat() if auth.valid_until else None,
        "revoked_at": auth.revoked_at.isoformat() if auth.revoked_at else None,
        "credential_path": auth.credential_path,
        "note": auth.note,
        "status": _authorization_status(auth),
        "created_at": auth.created_at.isoformat() if auth.created_at else None,
    }


def _authorization_covers(
    auth: ContractSignAuthorization,
    contract: Contract,
    methods: List[SignMethod],
) -> bool:
    """授权范围是否覆盖本次代签（房源 / 合同类型 / 签章方式）。"""
    if auth.property_ids:
        if contract.property_id is None:
            return False
        allowed = {str(x) for x in auth.property_ids}
        if str(contract.property_id) not in allowed:
            return False
    if auth.contract_kinds:
        kind = contract.kind.value if contract.kind else None
        if kind not in set(auth.contract_kinds):
            return False
    if auth.seal_scope:
        allowed_methods = set(auth.seal_scope)
        if any((m or SignMethod.personal_handwrite).value not in allowed_methods for m in methods):
            return False
    return True


def _resolve_proxy_authorization(
    session: Session,
    contract: Contract,
    party: ContractParty,
    employee: User,
    authorization_id_raw,
    methods: List[SignMethod],
) -> ContractSignAuthorization:
    """找到覆盖本次代签的有效授权；不满足时抛出带明确错误码的 403。

    错误码：
    - `PROXY_AUTHORIZATION_MISSING`：该员工对这位授权人没有任何授权
    - `PROXY_AUTHORIZATION_REVOKED`：授权已撤销
    - `PROXY_AUTHORIZATION_EXPIRED`：授权不在有效期内
    - `PROXY_AUTHORIZATION_SCOPE_MISMATCH`：授权不覆盖该房源/合同类型/签章方式
    """
    authorization_id = None
    if authorization_id_raw:
        try:
            authorization_id = uuid.UUID(str(authorization_id_raw))
        except (ValueError, TypeError, AttributeError):
            raise HTTPException(status_code=400, detail="Invalid authorization_id")

    rows = session.exec(
        select(ContractSignAuthorization)
        .where(ContractSignAuthorization.grantee_user_id == employee.id)
        .order_by(ContractSignAuthorization.created_at.desc())
    ).all()
    # 授权人必须是该签署方本人（user_id 命中或邮箱归属），否则授权不覆盖此合同
    candidates = []
    for auth in rows:
        grantor = session.get(User, auth.grantor_user_id)
        if grantor and party_belongs_to_user(party, grantor):
            candidates.append(auth)
    if authorization_id is not None:
        candidates = [a for a in candidates if a.id == authorization_id]
        if not candidates:
            raise HTTPException(status_code=404, detail="Authorization not found")

    if not candidates:
        raise HTTPException(status_code=403, detail="PROXY_AUTHORIZATION_MISSING")

    now = datetime.utcnow()
    live = [a for a in candidates if not a.revoked_at]
    if not live:
        raise HTTPException(status_code=403, detail="PROXY_AUTHORIZATION_REVOKED")

    in_time = [
        a
        for a in live
        if (a.valid_from is None or a.valid_from <= now)
        and (a.valid_until is None or a.valid_until >= now)
    ]
    if not in_time:
        raise HTTPException(status_code=403, detail="PROXY_AUTHORIZATION_EXPIRED")

    covered = [a for a in in_time if _authorization_covers(a, contract, methods)]
    if not covered:
        raise HTTPException(status_code=403, detail="PROXY_AUTHORIZATION_SCOPE_MISMATCH")
    return covered[0]


@router.post("/authorizations")
def create_sign_authorization(
    payload: dict,
    request: Request,
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """建立代签授权。payload: {grantor_user_id, grantee_user_id?, property_ids?,
    contract_kinds?, seal_scope?, valid_from?, valid_until, note?}

    授权人 = 被代签的当事人；被授权人默认当前员工。授权凭证通过
    `POST /contracts/authorizations/{id}/credential` 上传。
    """
    def _as_uuid(value, field: str) -> uuid.UUID:
        try:
            return uuid.UUID(str(value))
        except (ValueError, TypeError, AttributeError):
            raise HTTPException(status_code=400, detail=f"Invalid {field}")

    grantor_id = _as_uuid(payload.get("grantor_user_id"), "grantor_user_id")
    grantee_id = (
        _as_uuid(payload["grantee_user_id"], "grantee_user_id")
        if payload.get("grantee_user_id")
        else user.id
    )
    if grantor_id == grantee_id:
        raise HTTPException(status_code=400, detail="Grantor and grantee must differ")

    grantor = session.get(User, grantor_id)
    if not grantor or not grantor.is_active:
        raise HTTPException(status_code=404, detail="Grantor not found")
    grantee = session.get(User, grantee_id)
    if not grantee or not grantee.is_active:
        raise HTTPException(status_code=404, detail="Grantee not found")
    if grantee.role not in STAFF_ROLES:
        raise HTTPException(status_code=400, detail="Grantee must be staff")

    valid_until = _parse_iso_dt(payload.get("valid_until"), "valid_until")
    if valid_until is None:
        raise HTTPException(status_code=400, detail="valid_until is required")
    valid_from = _parse_iso_dt(payload.get("valid_from"), "valid_from")
    if valid_from and valid_from >= valid_until:
        raise HTTPException(status_code=400, detail="valid_from must be before valid_until")

    property_ids = _parse_str_list(payload.get("property_ids"), "property_ids")
    contract_kinds = _parse_str_list(payload.get("contract_kinds"), "contract_kinds")
    if contract_kinds:
        invalid = [k for k in contract_kinds if k not in {x.value for x in ContractKind}]
        if invalid:
            raise HTTPException(status_code=400, detail=f"Invalid contract_kinds: {invalid}")
    seal_scope = _parse_str_list(payload.get("seal_scope"), "seal_scope")
    if seal_scope:
        invalid = [m for m in seal_scope if m not in {x.value for x in SignMethod}]
        if invalid:
            raise HTTPException(status_code=400, detail=f"Invalid seal_scope: {invalid}")

    auth = ContractSignAuthorization(
        grantor_user_id=grantor_id,
        grantee_user_id=grantee_id,
        property_ids=property_ids,
        contract_kinds=contract_kinds,
        seal_scope=seal_scope,
        valid_from=valid_from,
        valid_until=valid_until,
        note=(payload.get("note") or None),
        created_by=user.id,
    )
    session.add(auth)
    session.commit()
    session.refresh(auth)
    audit.record_contract_audit(
        session,
        action=audit.ACTION_AUTHORIZATION_GRANT,
        actor=user,
        request=request,
        detail={
            "authorization_id": str(auth.id),
            "grantor_user_id": str(grantor_id),
            "grantee_user_id": str(grantee_id),
            "property_ids": property_ids,
            "contract_kinds": contract_kinds,
            "seal_scope": seal_scope,
            "valid_until": valid_until.isoformat(),
        },
    )
    return _serialize_authorization(session, auth)


@router.get("/authorizations")
def list_sign_authorizations(
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """列出与当前账号相关的授权：管理员看全部，员工看自己授出/获得的。"""
    stmt = select(ContractSignAuthorization).order_by(
        ContractSignAuthorization.created_at.desc()
    )
    if user.role != "admin":
        stmt = stmt.where(
            (ContractSignAuthorization.grantor_user_id == user.id)
            | (ContractSignAuthorization.grantee_user_id == user.id)
        )
    rows = session.exec(stmt).all()
    return [_serialize_authorization(session, a) for a in rows]


def _get_authorization_for_update(
    session: Session, authorization_id: uuid.UUID, user: User
) -> ContractSignAuthorization:
    auth = session.get(ContractSignAuthorization, authorization_id)
    if not auth:
        raise HTTPException(status_code=404, detail="Authorization not found")
    # 授权人、被授权人、创建人（代客户建档的员工）与管理员可撤销/补凭证
    allowed = (auth.grantor_user_id, auth.grantee_user_id, auth.created_by)
    if user.role != "admin" and user.id not in allowed:
        raise HTTPException(status_code=403, detail="Not allowed to manage this authorization")
    return auth


@router.delete("/authorizations/{authorization_id}")
def revoke_sign_authorization(
    authorization_id: uuid.UUID,
    request: Request,
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """撤销授权：撤销后立即失效（代签会被拒绝）。幂等。"""
    auth = _get_authorization_for_update(session, authorization_id, user)
    if not auth.revoked_at:
        auth.revoked_at = datetime.utcnow()
        auth.revoked_by = user.id
        session.add(auth)
        session.commit()
        session.refresh(auth)
        audit.record_contract_audit(
            session,
            action=audit.ACTION_AUTHORIZATION_REVOKE,
            actor=user,
            request=request,
            detail={
                "authorization_id": str(auth.id),
                "grantor_user_id": str(auth.grantor_user_id),
                "grantee_user_id": str(auth.grantee_user_id),
            },
        )
    return _serialize_authorization(session, auth)


@router.post("/authorizations/{authorization_id}/credential")
def upload_authorization_credential(
    authorization_id: uuid.UUID,
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """上传授权书（授权凭证）：PDF / JPG / PNG / WEBP，限 10MB。"""
    auth = _get_authorization_for_update(session, authorization_id, user)
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in _AUTHORIZATION_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported credential type: {ext or 'none'}（支持 PDF / JPG / PNG / WEBP）",
        )
    file_url = save_upload(
        file,
        AUTHORIZATION_DIR,
        AUTHORIZATION_MAX_SIZE,
        _AUTHORIZATION_TYPES,
        {ext: {"application/pdf"} if ext == ".pdf" else {"image/png", "image/jpeg", "image/webp"}},
        detector=detect_document_mime,
        name_prefix="auth",
        url_prefix=AUTHORIZATION_URL_PREFIX,
        label="credential",
        supported_text="（支持 PDF / JPG / PNG / WEBP）",
    )
    auth.credential_path = file_url
    session.add(auth)
    session.commit()
    session.refresh(auth)
    return _serialize_authorization(session, auth)


@router.get("/authorizations/{authorization_id}/credential")
def download_authorization_credential(
    authorization_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """下载授权书（授权人与被授权人均可查看）。"""
    auth = session.get(ContractSignAuthorization, authorization_id)
    if not auth:
        raise HTTPException(status_code=404, detail="Authorization not found")
    if user.role != "admin" and user.id not in (auth.grantor_user_id, auth.grantee_user_id):
        raise HTTPException(status_code=403, detail="Not allowed to read this credential")
    if not auth.credential_path:
        raise HTTPException(status_code=404, detail="Credential not uploaded")
    path = resolve_stored_path(auth.credential_path, AUTHORIZATION_DIR, AUTHORIZATION_URL_PREFIX)
    return FileResponse(path)


# ---------------------------------------------------------------------------
# 合同模板库
#
# 模板 = 标题 + 字段（变量占位符）+ 条款；生成合同时一次性渲染并落库，
# 因此后续编辑模板不会影响已经创建的合同（旧合同保留自身正文与版本号）。
# 与既有手填/内置生成流程并存，不改变原有入口。
# ---------------------------------------------------------------------------
_DEFAULT_TEMPLATE_SEEDS = [
    {
        "name": "住宅租赁合同（标准模板）",
        "kind": "lease",
        "business_scope": "住宅租赁",
        "title": "房屋租赁合同",
        "fields": [
            {"key": "contract_no", "label": "合同编号"},
            {"key": "property_address", "label": "物业地址"},
            {"key": "room_number", "label": "房号"},
            {"key": "monthly_rent", "label": "月租金（元）", "default": "8000"},
            {"key": "deposit", "label": "押金（元）", "default": "16000"},
            {"key": "start_date", "label": "租赁开始日期"},
            {"key": "term_months", "label": "租期（月）", "default": "12"},
            {"key": "tenant_name", "label": "租客姓名"},
            {"key": "tenant_id_number", "label": "租客证件号"},
            {"key": "landlord_name", "label": "业主/房东姓名"},
            {"key": "landlord_id_number", "label": "业主证件号"},
            {"key": "sign_date", "label": "签署日期"},
        ],
        "clauses": [
            "出租方将上述房屋出租给承租方使用，承租方确认已实地查看并认可房屋现状。",
            "月租金为人民币 {{monthly_rent}} 元，承租方应于每月 5 日前支付当月租金。",
            "承租方应于签约时支付押金人民币 {{deposit}} 元，租赁期满无违约且房屋完好时无息退还。",
            "租赁期限自 {{start_date}} 起共 {{term_months}} 个月。",
            "水、电、燃气、物业等费用由承租方按实际使用承担；房屋主体结构维修由出租方负责。",
            "任何一方提前解除合同应提前 30 日书面通知对方，并按合同约定承担违约责任。",
        ],
    },
    {
        "name": "房屋买卖合同（标准模板）",
        "kind": "purchase",
        "business_scope": "二手房买卖",
        "title": "房屋买卖合同",
        "fields": [
            {"key": "contract_no", "label": "合同编号"},
            {"key": "property_address", "label": "房屋坐落"},
            {"key": "room_number", "label": "房号"},
            {"key": "property_area", "label": "建筑面积（㎡）"},
            {"key": "total_price", "label": "房屋总价（元）"},
            {"key": "down_payment", "label": "定金（元）", "default": "50000"},
            {"key": "delivery_date", "label": "交付日期"},
            {"key": "seller_name", "label": "出卖方姓名"},
            {"key": "seller_id_number", "label": "出卖方证件号"},
            {"key": "buyer_name", "label": "买受方姓名"},
            {"key": "buyer_id_number", "label": "买受方证件号"},
            {"key": "sign_date", "label": "签署日期"},
        ],
        "clauses": [
            "出卖方自愿将上述房屋出售给买受方，买受方已实地查看并认可房屋现状。",
            "房屋成交总价为人民币 {{total_price}} 元，买受方于签约时支付定金人民币 {{down_payment}} 元。",
            "买卖双方应于 {{delivery_date}} 前共同办理网签、过户及物业交割手续。",
            "交易税费按国家及当地规定由双方各自承担。",
        ],
    },
    {
        "name": "经纪人协议（标准模板）",
        "kind": "broker",
        "business_scope": "经纪服务",
        "title": "经纪人协议",
        "fields": [
            {"key": "contract_no", "label": "协议编号"},
            {"key": "broker_name", "label": "经纪人姓名"},
            {"key": "broker_company", "label": "所属公司"},
            {"key": "broker_phone", "label": "联系电话"},
            {"key": "broker_id_number", "label": "证件号"},
            {"key": "listing_address", "label": "服务房源"},
            {"key": "commission_rate", "label": "佣金比例", "default": "1.5%"},
            {"key": "sign_date", "label": "签署日期"},
        ],
        "clauses": [
            "经纪人 {{broker_name}}（{{broker_company}}）负责上述房源的带看、撮合与签约协助。",
            "佣金比例为成交价的 {{commission_rate}}，于交易完成且款项到账后结算。",
            "经纪人应如实披露房源信息，不得隐瞒重大瑕疵或重复收取费用。",
        ],
    },
]


def _serialize_template(t: ContractTemplate, *, detail: bool = False) -> dict:
    data = {
        "id": str(t.id),
        "name": t.name,
        "kind": t.kind.value if t.kind else None,
        "business_scope": t.business_scope,
        "title": t.title,
        "fields": t.fields or [],
        "clauses": t.clauses or [],
        "variable_keys": esign_service.template_variable_keys(
            t.title, t.fields, t.clauses
        ),
        "version": t.version_no,
        "active": t.active,
        "note": t.note,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "updated_at": t.updated_at.isoformat() if t.updated_at else None,
    }
    if detail:
        preview_rows = []
        for f in t.fields or []:
            key = (f or {}).get("key")
            if not key:
                continue
            preview_rows.append(
                ((f or {}).get("label") or key, (f or {}).get("default") or "＿＿＿＿")
            )
        data["preview_html"] = esign_service.render_structured_html(
            t.title, preview_rows, t.clauses or []
        )
    return data


def _serialize_template_version(v: ContractTemplateVersion) -> dict:
    return {
        "template_id": str(v.template_id),
        "version": v.version_no,
        "name": v.name,
        "kind": v.kind.value if v.kind else None,
        "business_scope": v.business_scope,
        "title": v.title,
        "fields": v.fields or [],
        "clauses": v.clauses or [],
        "note": v.note,
        "created_at": v.created_at.isoformat() if v.created_at else None,
    }


def _snapshot_template_version(
    session: Session, t: ContractTemplate, user: User
) -> ContractTemplateVersion:
    snap = ContractTemplateVersion(
        template_id=t.id,
        version_no=t.version_no,
        name=t.name,
        kind=t.kind,
        business_scope=t.business_scope,
        title=t.title,
        fields=list(t.fields or []),
        clauses=list(t.clauses or []),
        note=t.note,
        created_by=user.id,
    )
    session.add(snap)
    return snap


def _get_template(session: Session, template_id: uuid.UUID) -> ContractTemplate:
    t = session.get(ContractTemplate, template_id)
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    return t


def _normalize_template_fields(value) -> list:
    if not isinstance(value, list):
        raise HTTPException(status_code=400, detail="Invalid fields")
    out = []
    seen = set()
    for item in value:
        if not isinstance(item, dict):
            raise HTTPException(status_code=400, detail="Invalid fields")
        key = str(item.get("key") or "").strip()
        if not key:
            raise HTTPException(status_code=400, detail="Field key is required")
        if key in seen:
            raise HTTPException(status_code=400, detail=f"Duplicate field key: {key}")
        seen.add(key)
        row = {"key": key, "label": str(item.get("label") or key)}
        if item.get("default") not in (None, ""):
            row["default"] = str(item["default"])
        out.append(row)
    return out


def _normalize_template_clauses(value) -> list:
    if not isinstance(value, list):
        raise HTTPException(status_code=400, detail="Invalid clauses")
    return [str(c).strip() for c in value if str(c).strip()]


@router.get("/template-library")
def list_template_library(
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """合同模板库列表（含变量占位符与当前版本号）。"""
    rows = session.exec(
        select(ContractTemplate).order_by(ContractTemplate.created_at.desc())
    ).all()
    return [_serialize_template(t) for t in rows]


@router.post("/template-library/seed")
def seed_template_library(
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """按当前在用的合同类型导入标准模板（幂等：同名同类型已存在则跳过）。"""
    created = []
    for seed in _DEFAULT_TEMPLATE_SEEDS:
        exists = session.exec(
            select(ContractTemplate).where(
                ContractTemplate.name == seed["name"],
                ContractTemplate.kind == ContractKind(seed["kind"]),
            )
        ).first()
        if exists:
            continue
        t = ContractTemplate(
            name=seed["name"],
            kind=ContractKind(seed["kind"]),
            business_scope=seed["business_scope"],
            title=seed["title"],
            fields=seed["fields"],
            clauses=seed["clauses"],
            version_no=1,
            created_by=user.id,
            updated_by=user.id,
        )
        session.add(t)
        session.commit()
        session.refresh(t)
        _snapshot_template_version(session, t, user)
        session.commit()
        created.append(_serialize_template(t))
    return {"created": created, "skipped": len(_DEFAULT_TEMPLATE_SEEDS) - len(created)}


@router.post("/template-library")
def create_template(
    payload: dict,
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """新建合同模板（v1）。payload: {name, kind, business_scope?, title, fields, clauses, note?}"""
    name = str(payload.get("name") or "").strip()
    title = str(payload.get("title") or "").strip()
    if not name or not title:
        raise HTTPException(status_code=400, detail="name and title are required")
    try:
        kind = ContractKind(payload.get("kind", "lease"))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid kind")

    t = ContractTemplate(
        name=name,
        kind=kind,
        business_scope=(payload.get("business_scope") or None),
        title=title,
        fields=_normalize_template_fields(payload.get("fields") or []),
        clauses=_normalize_template_clauses(payload.get("clauses") or []),
        version_no=1,
        note=(payload.get("note") or None),
        created_by=user.id,
        updated_by=user.id,
    )
    session.add(t)
    session.commit()
    session.refresh(t)
    _snapshot_template_version(session, t, user)
    session.commit()
    return _serialize_template(t, detail=True)


@router.patch("/template-library/{template_id}")
def update_template(
    template_id: uuid.UUID,
    payload: dict,
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """编辑模板（保留版本历史）：version+1，旧版本快照不可变。

    已生成的合同正文已物化在合同表，不受本次编辑影响。
    """
    t = _get_template(session, template_id)
    if "name" in payload:
        t.name = str(payload.get("name") or "").strip() or t.name
    if "title" in payload:
        t.title = str(payload.get("title") or "").strip() or t.title
    if "business_scope" in payload:
        t.business_scope = payload.get("business_scope") or None
    if "note" in payload:
        t.note = payload.get("note") or None
    if "kind" in payload:
        try:
            t.kind = ContractKind(payload["kind"])
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid kind")
    if "fields" in payload:
        t.fields = _normalize_template_fields(payload.get("fields"))
    if "clauses" in payload:
        t.clauses = _normalize_template_clauses(payload.get("clauses"))

    t.version_no = (t.version_no or 1) + 1
    t.updated_by = user.id
    session.add(t)
    session.commit()
    session.refresh(t)
    _snapshot_template_version(session, t, user)
    session.commit()
    return _serialize_template(t, detail=True)


@router.get("/template-library/{template_id}")
def get_template(
    template_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    return _serialize_template(_get_template(session, template_id), detail=True)


@router.get("/template-library/{template_id}/versions")
def list_template_versions(
    template_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    _get_template(session, template_id)
    rows = session.exec(
        select(ContractTemplateVersion)
        .where(ContractTemplateVersion.template_id == template_id)
        .order_by(ContractTemplateVersion.version_no.desc())
    ).all()
    return [_serialize_template_version(v) for v in rows]


@router.get("/template-library/{template_id}/versions/{version}")
def get_template_version(
    template_id: uuid.UUID,
    version: int,
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    _get_template(session, template_id)
    snap = session.exec(
        select(ContractTemplateVersion).where(
            ContractTemplateVersion.template_id == template_id,
            ContractTemplateVersion.version_no == version,
        )
    ).first()
    if not snap:
        raise HTTPException(status_code=404, detail="Template version not found")
    return _serialize_template_version(snap)


@router.post("/template-library/{template_id}/generate")
def generate_from_template(
    template_id: uuid.UUID,
    payload: dict,
    request: Request,
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """用模板生成合同：variables 替换占位符后一次性物化正文与 PDF。

    payload: {variables: {key: value}, lease_id?, property_id?, language?, title?}
    缺少必填变量（既未传值也无默认值）时 400 并列出缺失项。
    """
    t = _get_template(session, template_id)
    variables = payload.get("variables") or {}
    if not isinstance(variables, dict):
        raise HTTPException(status_code=400, detail="Invalid variables")

    defaults = {
        (f or {}).get("key"): (f or {}).get("default")
        for f in (t.fields or [])
        if (f or {}).get("key")
    }
    missing = [
        key
        for key in esign_service.template_variable_keys(t.title, t.fields, t.clauses)
        if key not in variables and defaults.get(key) in (None, "")
    ]
    if missing:
        raise HTTPException(
            status_code=400, detail=f"MISSING_TEMPLATE_VARIABLES: {missing}"
        )

    def _to_uuid(value, field: str):
        if value in (None, ""):
            return None
        try:
            return uuid.UUID(str(value))
        except (ValueError, TypeError, AttributeError):
            raise HTTPException(status_code=400, detail=f"Invalid {field}")

    meta = esign_service.generate_from_template(
        t.title,
        t.fields,
        t.clauses,
        variables,
        language=payload.get("language") or "zh",
    )
    contract = Contract(
        contract_no=next_no(session, "HT"),
        lease_id=_to_uuid(payload.get("lease_id"), "lease_id"),
        property_id=_to_uuid(payload.get("property_id"), "property_id"),
        title=(str(payload.get("title")).strip() if payload.get("title") else meta["title"]),
        kind=t.kind,
        source=ContractSource.generated,
        created_by=user.id,
        language=meta["language"],
        content_html=meta["content_html"],
        document_hash=meta["document_hash"],
        file_path=meta["file_path"],
        pdf_path=meta.get("pdf_path"),
        counters=variables,
        template_id=t.id,
        template_version=t.version_no,
        status=ContractStatus.draft,
    )
    session.add(contract)
    session.commit()
    session.refresh(contract)
    audit.record_contract_audit(
        session,
        action=audit.ACTION_CREATE,
        contract_id=contract.id,
        actor=user,
        request=request,
        detail={
            "source": contract.source.value,
            "kind": contract.kind.value,
            "language": contract.language,
            "template_id": str(t.id),
            "template_version": t.version_no,
        },
    )
    return {
        "id": str(contract.id),
        "title": contract.title,
        "kind": contract.kind.value,
        "status": contract.status.value,
        "document_hash": contract.document_hash,
        "content_html": contract.content_html,
        "template_id": str(t.id),
        "template_version": t.version_no,
        "rendered_fields": meta["rendered_fields"],
    }


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
            "subscription_id": str(e.subscription_id) if e.subscription_id else None,
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


@router.get("/{contract_id}/subscriptions")
def list_contract_subscriptions(
    contract_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """查看合同的多回调订阅（未配置时返回空列表，此时走默认单地址回调）。"""
    _get_visible_contract(session, user, contract_id)
    subs = session.exec(
        select(ContractCallbackSubscription)
        .where(ContractCallbackSubscription.contract_id == contract_id)
        .order_by(ContractCallbackSubscription.created_at)
    ).all()
    return [
        {
            "id": str(s.id),
            "url": s.url,
            "label": s.label,
            "active": s.active,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        }
        for s in subs
    ]


@router.post("/{contract_id}/subscriptions")
def add_contract_subscription(
    contract_id: uuid.UUID,
    payload: dict,
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """新增一个回调订阅。payload: {url, label?}

    同一合同下同一 URL 只保留一条（重复添加返回已存在的那条，不新建）。
    """
    contract = _get_visible_contract(session, user, contract_id)
    url = (payload.get("url") or "").strip()
    if not url or len(url) > 500 or not re.match(r"^https?://", url, re.I):
        raise HTTPException(status_code=400, detail="Invalid callback url")
    existing = session.exec(
        select(ContractCallbackSubscription).where(
            ContractCallbackSubscription.contract_id == contract.id,
            ContractCallbackSubscription.url == url,
        )
    ).first()
    if existing is not None:
        return {
            "id": str(existing.id),
            "url": existing.url,
            "label": existing.label,
            "active": existing.active,
            "created_at": existing.created_at.isoformat() if existing.created_at else None,
        }
    sub = ContractCallbackSubscription(
        contract_id=contract.id,
        url=url,
        label=(payload.get("label") or "").strip()[:64] or None,
        created_by=user.id,
    )
    session.add(sub)
    if not contract.callback_secret:
        # 订阅同样需要签名密钥；生成后与旧接口共用同一个 secret
        contract.callback_secret = secrets.token_urlsafe(32)
        session.add(contract)
    session.commit()
    session.refresh(sub)
    return {
        "id": str(sub.id),
        "url": sub.url,
        "label": sub.label,
        "active": sub.active,
        "created_at": sub.created_at.isoformat() if sub.created_at else None,
        "callback_secret": contract.callback_secret,
    }


@router.delete("/{contract_id}/subscriptions/{subscription_id}")
def delete_contract_subscription(
    contract_id: uuid.UUID,
    subscription_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """删除一个回调订阅（已产生的投递记录保留，可继续排障/重投）。"""
    _get_visible_contract(session, user, contract_id)
    sub = session.get(ContractCallbackSubscription, subscription_id)
    if sub is None or sub.contract_id != contract_id:
        raise HTTPException(status_code=404, detail="Subscription not found")
    session.delete(sub)
    session.commit()
    return {"deleted": str(subscription_id)}


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
    except Exception as exc:  # noqa: BLE001  二维码属便利功能，失败不阻断链接下发
        # 不吞异常原因：把异常类型/消息与堆栈一并打到日志，便于定位缺依赖还是编码参数问题
        logger.error(
            "contract.qr_generate_failed",
            extra={"text": text[:64], "error": f"{type(exc).__name__}: {exc}"},
            exc_info=True,
        )
        return None


def _issue_sign_token(party: ContractParty, expires_in_days: int) -> str:
    """为签署方生成/续期免登录签署令牌（一次性，签署后清空）。"""
    days = expires_in_days or _DEFAULT_TOKEN_DAYS
    days = max(1, min(int(days), _MAX_TOKEN_DAYS))
    token = secrets.token_urlsafe(32)
    party.sign_token = token
    party.sign_token_expires_at = datetime.utcnow() + timedelta(days=days)
    return token


# 已进入终态、不再接受任何签署动作的合同状态（作废 / 拒签 / 撤回）
_FINALIZED_STATUSES = (
    ContractStatus.voided,
    ContractStatus.rejected,
    ContractStatus.revoked,
)


def _require_editable(contract: Contract) -> None:
    """已签署/已作废/已拒签/已撤回的合同不允许再改内容或作废。"""
    if contract.status in (ContractStatus.signed, ContractStatus.completed):
        raise HTTPException(status_code=409, detail="Contract already signed")
    if contract.status in _FINALIZED_STATUSES:
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
        # 与后台过期扫描可能同时触发：两者写入同一幂等键，冲突由内部吞掉
        contract_jobs.emit_expired_callback(session, contract)
    raise HTTPException(status_code=409, detail="CONTRACT_EXPIRED")


def _deliver_callback(session: Session, event: ContractCallbackEvent) -> None:
    """投递一条回调事件（单次尝试，失败后由后台任务按 30s/2m/10m 计划重投）。

    - 幂等键固定为 `合同id:事件`，重试复用同一行、同一请求体；
    - 对端需按 `X-Idempotency-Key` 去重（本服务不会因重试产生新事件）；
    - 投递失败只记录，不影响签署结果（签署与回调解耦）。
    """
    contract_jobs.deliver_callback(session, event)


def _callback_payload(
    session: Session,
    contract: Contract,
    event: str,
    extra: Optional[dict] = None,
) -> dict:
    """构造回调请求体快照（同一合同的多订阅共用同一份快照）。"""
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
    return payload


def _emit_contract_callback(
    session: Session,
    contract: Contract,
    event: str = "contract.signed",
    extra: Optional[dict] = None,
) -> None:
    """合同状态变化时生成并投递回调。

    投递目标分两种情况，互不干扰：

    - **未配置订阅**：沿用 `contract.callback_url` 单地址，幂等键 `合同id:事件`
      （与旧版完全一致，已配置的单地址回调不受影响）；
    - **配置了订阅**：每个启用中的订阅各投递一份，幂等键
      `合同id:事件#订阅id`，各自独立记录状态与重试，一个失败不影响另一个。
    """
    subs = session.exec(
        select(ContractCallbackSubscription).where(
            ContractCallbackSubscription.contract_id == contract.id,
            ContractCallbackSubscription.active.is_(True),
        )
    ).all()
    targets = [s.url for s in subs]
    if not targets:
        if not contract.callback_url:
            return
        targets = [contract.callback_url]

    if not contract.callback_secret:
        contract.callback_secret = secrets.token_urlsafe(32)
        session.add(contract)

    payload: Optional[dict] = None
    for sub in subs or [None]:
        url = sub.url if sub is not None else contract.callback_url
        key = (
            f"{contract.id}:{event}#{sub.id}"
            if sub is not None
            else f"{contract.id}:{event}"
        )
        existing = session.exec(
            select(ContractCallbackEvent).where(
                ContractCallbackEvent.idempotency_key == key
            )
        ).first()
        if existing is not None and existing.status == ContractCallbackStatus.delivered:
            continue  # 该目标已成功投递，重复触发不再发送（幂等）
        if existing is None:
            if payload is None:
                payload = _callback_payload(session, contract, event, extra)
            existing = ContractCallbackEvent(
                contract_id=contract.id,
                event=event,
                url=url,
                payload=payload,
                idempotency_key=key,
                subscription_id=sub.id if sub is not None else None,
            )
            session.add(existing)
            session.commit()
            session.refresh(existing)
        try:
            _deliver_callback(session, existing)
        except Exception:  # noqa: BLE001  回调是旁路，任何异常都不得影响签署
            logger.exception(
                "contract.callback_crashed",
                extra={"contract_id": str(contract.id), "subscription_id": key},
            )


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
    request: Request,
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
    contract = _get_visible_contract(session, user, contract_id, request=request)
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
    audit.record_contract_audit(
        session,
        action=audit.ACTION_CREATE,
        contract_id=contract.id,
        actor=user,
        request=request,
        detail={
            "source": contract.source.value,
            "pdf_converted": pdf_ok,
            "file_path": contract.file_path,
        },
    )
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
    """为某签署方生成免登录签署链接。payload: {party_id, expires_in_days?, reuse?, rotate?}

    用于「客户没走平台流程 / 未注册账号」的场景：链接可转发给客户，
    打开即免登录签署（一次性，签署后令牌清空）。
    `reuse=true` 时复用未过期的既有令牌（展示二维码不打扰已复制的链接）；
    `rotate=true` 是显式「重新生成链接」：仅在当前链接**未过期**时可用，
    立即作废旧令牌（旧链接此后 404），新令牌按默认 3 天签发，并写操作留痕。
    """
    contract = _get_visible_contract(session, user, contract_id, request=request)
    _require_editable(contract)
    party = _get_party(session, contract_id, payload.get("party_id"))
    if party.signed:
        raise HTTPException(status_code=409, detail="Party already signed")

    reuse = bool(payload.get("reuse"))
    rotate = bool(payload.get("rotate"))
    existing = party.sign_token
    active = bool(
        existing
        and party.sign_token_expires_at
        and party.sign_token_expires_at > datetime.utcnow()
    )
    if rotate and not active:
        # 没有可作废的在途链接时不提供「重新生成」，避免误判为「刷新了旧链接」
        raise HTTPException(status_code=409, detail="NO_ACTIVE_LINK")
    if rotate:
        token = _issue_sign_token(party, payload.get("expires_in_days"))
        # 操作留痕：与 void_contract 写 counters 的口径一致，保留最近 20 次
        counters = dict(contract.counters or {})
        trail = list(counters.get("link_rotations") or [])
        trail.append(
            {
                "at": datetime.utcnow().isoformat(),
                "by": str(user.id),
                "party_id": str(party.id),
            }
        )
        counters["link_rotations"] = trail[-20:]
        contract.counters = counters
        session.add(party)
        session.add(contract)
        session.commit()
        session.refresh(party)
        logger.info(
            "contract.sign_link_rotated",
            extra={"contract_id": str(contract.id), "party_id": str(party.id), "by": str(user.id)},
        )
        audit.record_contract_audit(
            session,
            action=audit.ACTION_LINK_ROTATE,
            contract_id=contract.id,
            actor=user,
            request=request,
            detail={
                "party_id": str(party.id),
                "previous_invalidated": bool(existing),
                "expires_at": party.sign_token_expires_at.isoformat()
                if party.sign_token_expires_at
                else None,
            },
        )
    elif reuse and active:
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
        "rotated": rotate,
        "previous_invalidated": bool(rotate and existing),
        "expires_at": party.sign_token_expires_at.isoformat()
        if party.sign_token_expires_at
        else None,
    }


@router.post("/{contract_id}/send")
def send_contract(
    contract_id: uuid.UUID,
    request: Request,
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
    contract = _get_visible_contract(session, user, contract_id, request=request)
    _require_editable(contract)
    # 与签署/撤回串行化：续期会回写状态与签署链接，必须基于最新已提交状态判定
    contract = _lock_contract_row(session, contract)

    # 审批闸门：命中规则但审批未通过时不得发送签署。
    # 前端漏掉「提交审批」也会在这里自动补建审批单并拦截。
    if contract_approval.approval_required_for_send(session, contract, user):
        raise HTTPException(status_code=409, detail="APPROVAL_REQUIRED")

    # 续期判定：状态已 expired，或有效期已过但尚未被惰性/后台标记。
    # 首次发送（expires_at 为空）不算续期。
    now = datetime.utcnow()
    renewing = contract.status == ContractStatus.expired or (
        contract.expires_at is not None and contract.expires_at < now
    )

    # 签署有效期：首次发送开始计时（默认 30 天，允许 1–90 天）。
    # 已到期/已过期的合同重新发送时续期并把状态从 expired 拉回签署中。
    if contract.expires_at is None or contract.expires_at < now:
        try:
            days = int(payload.get("sign_expires_in_days") or 30)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="Invalid sign_expires_in_days")
        contract.expires_at = now + timedelta(days=min(90, max(1, days)))
        if renewing:
            signed_any = session.exec(
                select(ContractParty.id).where(
                    ContractParty.contract_id == contract_id,
                    ContractParty.signed.is_(True),
                )
            ).first()
            contract.status = (
                ContractStatus.partially_signed if signed_any else ContractStatus.sent
            )
            # 续期留痕：次数 + 每次的时间/操作人/新有效期（只追加，保留最近 20 次）
            counters = dict(contract.counters or {})
            trail = list(counters.get("renewals") or [])
            trail.append(
                {
                    "at": now.isoformat(),
                    "by": str(user.id),
                    "expires_at": contract.expires_at.isoformat(),
                }
            )
            counters["renewals"] = trail[-20:]
            counters["renewal_count"] = int(counters.get("renewal_count") or 0) + 1
            contract.counters = counters
        session.add(contract)

    # 续期必须覆盖全部未签方（重签链接 + 重新通知），忽略局部的 party_ids 选择
    raw_ids = [] if renewing else (payload.get("party_ids") or [])
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
    # 续期与首次邀请使用不同模板，便于签署方区分「新邀请」与「期限更新后重发」
    invite_template = "contract_renewed" if renewing else "contract_sign_invite"
    invite_subject = "合同签署已续期" if renewing else "合同待签署"
    results = []
    for party in parties:
        # 未注册客户只能走免登录链接；已注册客户无令牌也能在站内签，但仍带链接方便查看。
        # 续期时强制重签链接（旧 token 立即失效），常规发送仅在缺失/过期时补发。
        if renewing or not party.sign_token or (
            party.sign_token_expires_at and party.sign_token_expires_at < now
        ):
            token = _issue_sign_token(party, expires_in_days)
        else:
            token = party.sign_token
        url = _sign_url(token)
        session.add(party)
        delivered = []
        content = (
            f"您的合同《{contract.title}》签署期限已更新，请重新点击链接完成签署：{url}"
            if renewing
            else f"您的合同《{contract.title}》等待签署，请点击链接完成签署：{url}"
        )

        if "in_app" in channels and party.user_id:
            session.add(
                Notification(
                    id=uuid.uuid4(),
                    user_id=party.user_id,
                    channel=NotificationChannel.in_app,
                    template_key=invite_template,
                    recipient=str(party.user_id),
                    subject=invite_subject,
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
                    title=invite_subject,
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
                    title=invite_subject,
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
    audit.record_contract_audit(
        session,
        action=audit.ACTION_RENEW if renewing else audit.ACTION_SEND,
        contract_id=contract.id,
        actor=user,
        request=request,
        detail={
            "renewed": renewing,
            "renewal_count": int((contract.counters or {}).get("renewal_count") or 0),
            "party_count": len(results),
            "channels": channels,
            "expires_at": contract.expires_at.isoformat()
            if contract.expires_at
            else None,
        },
    )
    return {
        "contract_id": str(contract.id),
        "status": contract.status.value,
        "renewed": renewing,
        "renewal_count": int((contract.counters or {}).get("renewal_count") or 0),
        "expires_at": contract.expires_at.isoformat() if contract.expires_at else None,
        "results": results,
    }


_REMIND_THROTTLE = timedelta(hours=24)


@router.post("/{contract_id}/remind")
def remind_contract(
    contract_id: uuid.UUID,
    payload: dict,
    request: Request,
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """催办未签签署方（站内信 + 邮件）。

    payload: `{party_id?: "..." | null, channels?: ["in_app","email"]}`；
    不传 `party_id` 时对全部未签方一键催办。

    防刷口径：**同一签署方 24 小时内只发一次**，重复请求返回
    `reminded=false, reason="throttled"`，不会新增任何通知。
    催办不轮换签署链接（避免把已发出的链接变无效）。
    """
    contract = _get_visible_contract(session, user, contract_id, request=request)
    if contract.status not in (
        ContractStatus.draft,
        ContractStatus.sent,
        ContractStatus.partially_signed,
    ):
        raise HTTPException(status_code=409, detail="合同当前状态不可催办")
    _ensure_not_expired(session, contract)

    party_id_raw = payload.get("party_id")
    if party_id_raw:
        try:
            wanted = uuid.UUID(str(party_id_raw))
        except (ValueError, TypeError, AttributeError):
            raise HTTPException(status_code=400, detail="Invalid party_id")
        parties = session.exec(
            select(ContractParty).where(
                ContractParty.contract_id == contract_id,
                ContractParty.id == wanted,
            )
        ).all()
        if not parties:
            raise HTTPException(status_code=404, detail="Party not found")
    else:
        parties = session.exec(
            select(ContractParty).where(ContractParty.contract_id == contract_id)
        ).all()
    parties = [p for p in parties if not p.signed and not p.declined_at]
    if not parties:
        raise HTTPException(status_code=400, detail="No pending party to remind")

    channels = payload.get("channels") or ["in_app", "email"]
    now = datetime.utcnow()
    results = []
    reminded = 0
    for party in parties:
        if party.last_reminded_at and now - party.last_reminded_at < _REMIND_THROTTLE:
            results.append(
                {
                    "party_id": str(party.id),
                    "name": party.name,
                    "reminded": False,
                    "reason": "throttled",
                    "last_reminded_at": party.last_reminded_at.isoformat(),
                    "reminded_count": party.reminded_count or 0,
                }
            )
            continue
        # 已有有效令牌就直接复用；缺失或过期才补发，催办绝不主动作废旧链接
        if not party.sign_token or (
            party.sign_token_expires_at and party.sign_token_expires_at < now
        ):
            _issue_sign_token(party, None)
            session.add(party)
        url = _sign_url(party.sign_token or "")
        content = (
            f"您的合同《{contract.title}》仍在等待签署，请尽快点击链接完成签署：{url}"
        )
        delivered = contract_jobs.notify_party(
            session,
            contract,
            party,
            template_key="contract_reminder",
            title="合同签署催办",
            content=content,
            channels=channels,
        )
        party.reminded_count = (party.reminded_count or 0) + 1
        party.last_reminded_at = now
        session.add(party)
        reminded += 1
        results.append(
            {
                "party_id": str(party.id),
                "name": party.name,
                "reminded": True,
                "reason": None,
                "last_reminded_at": now.isoformat(),
                "reminded_count": party.reminded_count,
                "channels": delivered,
                "url": url,
            }
        )

    session.commit()
    audit.record_contract_audit(
        session,
        action=audit.ACTION_REMIND,
        contract_id=contract.id,
        actor=user,
        request=request,
        detail={
            "reminded": reminded,
            "throttled": len(results) - reminded,
            "channels": channels,
            "party_ids": [r["party_id"] for r in results if r["reminded"]],
        },
    )
    return {
        "contract_id": str(contract.id),
        "reminded": reminded,
        "throttled": len(results) - reminded,
        "results": results,
    }


@router.post("/{contract_id}/void")
def void_contract(
    contract_id: uuid.UUID,
    request: Request,
    payload: Optional[dict] = None,
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """作废合同（不可再签署）。payload: {reason?}"""
    payload = payload or {}
    contract = _get_visible_contract(session, user, contract_id, request=request)
    # 与签署串行化：锁住合同行后再读状态，避免「签署刚完成、作废基于旧状态」
    # 或两边同时判定可写导致的终态互相覆盖（PG 生效，SQLite 单写锁天然串行）。
    contract = _lock_contract_row(session, contract)
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
    audit.record_contract_audit(
        session,
        action=audit.ACTION_VOID,
        contract_id=contract.id,
        actor=user,
        request=request,
        detail={"reason": reason or None, "status": contract.status.value},
    )
    return {"id": str(contract.id), "status": contract.status.value}


@router.post("/{contract_id}/revoke")
def revoke_contract(
    contract_id: uuid.UUID,
    request: Request,
    payload: Optional[dict] = None,
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """撤回合同（`revoked` 终态）。payload: {reason?}

    - 仅员工可撤回；仅限「尚未全部签署完成」的流转中合同（草稿/已发送/部分签署/已过期）；
    - 已签署完成的合同不允许撤回，应走作废（保留已签结果的可追溯性）；
    - 撤回后：旧签署链接全部立即失效、未签方收到站内 + 邮件通知、对外发
      `contract.revoked` 回调、操作留痕写入 `counters.revocations`。
    """
    payload = payload or {}
    contract = _get_visible_contract(session, user, contract_id, request=request)
    # 与签署串行化：锁内复核状态，避免「最后一方刚签完就被撤回」
    contract = _lock_contract_row(session, contract)
    if contract.status == ContractStatus.revoked:
        raise HTTPException(status_code=409, detail="Contract already revoked")
    if contract.status not in (
        ContractStatus.draft,
        ContractStatus.sent,
        ContractStatus.partially_signed,
        ContractStatus.expired,
    ):
        raise HTTPException(status_code=409, detail="CONTRACT_NOT_REVOCABLE")

    reason = (payload.get("reason") or "").strip()
    now = datetime.utcnow()
    contract.status = ContractStatus.revoked
    counters = dict(contract.counters or {})
    trail = list(counters.get("revocations") or [])
    trail.append({"at": now.isoformat(), "by": str(user.id), "reason": reason or None})
    counters["revocations"] = trail[-20:]
    counters["revoked_at"] = now.isoformat()
    if reason:
        counters["revoke_reason"] = reason
    contract.counters = counters
    session.add(contract)

    # 旧签署链接立即失效：清空所有未签方的免登录令牌（已签方令牌签署时已清空）
    unsigned = session.exec(
        select(ContractParty).where(
            ContractParty.contract_id == contract_id,
            ContractParty.signed.is_(False),
        )
    ).all()
    for party in unsigned:
        party.sign_token = None
        party.sign_token_expires_at = None
        session.add(party)
    session.commit()
    session.refresh(contract)

    # 通知未签签署方（站内 + 邮件）：失败只记日志，不影响撤回结果
    try:
        contract_jobs.notify_unsigned_parties(
            session,
            contract,
            template_key="contract_revoked",
            title="合同已撤回",
            content=(
                f"合同《{contract.title}》已被撤回，签署流程已终止，原签署链接已失效。"
                "如有疑问请联系经纪人。"
            ),
        )
    except Exception:  # noqa: BLE001  通知是旁路
        logger.exception("contract.revoke_notify_failed", extra={"contract_id": str(contract.id)})
    # 对外回调：下游据此中止审批/付款等流程（投递失败由后台任务按计划重投）
    try:
        _emit_contract_callback(
            session,
            contract,
            "contract.revoked",
            extra={"reason": reason or None, "revoked_by": str(user.id)},
        )
    except Exception:  # noqa: BLE001  回调是旁路
        logger.exception("contract.callback_emit_failed", extra={"contract_id": str(contract.id)})
    audit.record_contract_audit(
        session,
        action=audit.ACTION_REVOKE,
        contract_id=contract.id,
        actor=user,
        request=request,
        detail={
            "reason": reason or None,
            "status": contract.status.value,
            "invalidated_links": len(unsigned),
        },
    )
    return {
        "id": str(contract.id),
        "status": contract.status.value,
        "revoked_at": now.isoformat(),
    }


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
    if contract.status in _FINALIZED_STATUSES:
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
    request: Request,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """拒签：签署方拒签并填写原因。payload: {party_id, reason}

    行为对齐开放签「拒签」：拒签方置 declined_at/decline_reason；
    若再无其他必签未签方 → 合同状态置为 rejected（签署流程终止，不可恢复）。
    """
    contract = _get_visible_contract(session, user, contract_id, request=request)
    # 与签署/作废串行化：并发拒签若不锁合同行，两方会各自看到「对方未拒签」，
    # 结果没有任何一方把合同置为 rejected（PG 生效，SQLite 单写锁天然串行）。
    contract = _lock_contract_row(session, contract)
    if contract.status in _FINALIZED_STATUSES:
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
    audit.record_contract_audit(
        session,
        action=audit.ACTION_DECLINE,
        contract_id=contract.id,
        actor=user,
        request=request,
        detail={
            "party_id": str(party.id),
            "party_name": party.name,
            "party_role": party.role.value,
            "reason": reason or None,
            "contract_status": contract.status.value,
        },
    )
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


def _pdf_signature_stamp(
    contract, party, method, field, img_override: Optional[bytes] = None,
    proxy_reason: Optional[str] = None,
) -> tuple:
    """决定要盖到 PDF 上的图片与位置。

    返回 (img_bytes, page, x, y, w, h, reason)：
    - 传入 `img_override`（用户自制印章/手写签名 PNG）时直接使用，对齐开放签「拖放已制作签章」；
    - company_seal → 公司公章（公司名）盖章；
    - 其余（手写/私章/日期）→ 用引擎把手写姓名/日期渲染为 PNG。
    未放置签署区字段时退回整页签名栏默认坐标。
    - `proxy_reason` 非空表示代签：写进 PDF 签名域的 Reason，与本人签署可区分。
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
    if proxy_reason:
        # 代签：在 PDF 签名域 Reason 中写明「代签 + 授权来源」
        reason = f"{party.name} 代签（{proxy_reason}）"
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
    proxy_reason: Optional[str] = None,
) -> Optional[bool]:
    """把一次签署动作里的所有落章位置写进同一份 PDF 存档。

    `placements` 为 `[(field, method, img_override)]`。要点：
    - 基线 PDF 只在内存中依次追加签名修订，**全部成功后才一次性原子替换**存档，
      避免中途失败留下半签文件；
    - 引擎签名只追加，不重写已有内容，因此前序签署人的签名始终有效；
    - 没有引擎 PDF（上传型非 PDF 合同）返回 None，仍走签名留痕；
    - 任一环节异常 → 502，且合同状态不推进；
    - `proxy_reason` 非空时写进 PDF 签名域 Reason，标记代签与授权来源。
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
                contract, party, method, field, img_override, proxy_reason=proxy_reason
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


def _lock_contract_row(session: Session, contract: Contract) -> Contract:
    """锁住合同行并刷新到最新已提交状态（R10 并发签署串行化）。

    - PostgreSQL：真正执行 `SELECT ... FOR UPDATE`，同一合同上的并发签署、
      作废、拒签在此排队，后到者看到的是前者提交后的状态；
    - SQLite（开发/测试）：方言忽略 `FOR UPDATE`，单库写锁天然串行；
    - `populate_existing` 确保拿到锁后重读，避免命中身份映射里的旧对象。
    """
    locked = session.exec(
        select(Contract)
        .where(Contract.id == contract.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    ).first()
    if locked is None:
        raise HTTPException(status_code=404, detail="Contract not found")
    return locked


def _assert_party_unsigned(session: Session, party: ContractParty) -> None:
    """锁内复核签署方是否已被并发签署，避免重复留痕。

    只读 `signed` 列、不 refresh 对象本身：公开签署链路会在调用前修改
    `party.name/phone` 但尚未提交，refresh 会把客户填写的实名信息丢掉。
    """
    signed = session.exec(
        select(ContractParty.signed).where(ContractParty.id == party.id)
    ).first()
    if signed:
        raise HTTPException(status_code=409, detail="Party already signed")


def _mark_required_fields_covered(
    session: Session,
    contract_id: uuid.UUID,
    party_id: uuid.UUID,
    rects: List[tuple],
) -> None:
    """把本次落章**实际覆盖到**的该方必签区置为已签（R6 严格判定）。

    `rects` 为本次提交的签章矩形 `(page, x, y, w, h)`，坐标口径与签署区一致（百分比）。
    仅当必签区中心点落在某个落章矩形内才算签完：签署方拖放的框没有覆盖预置必签区时，
    该必签区保持未签，合同不会被判完成（不再「签了名就自动把本人必签区全部置已签」）。
    """
    pending = session.exec(
        select(ContractSignField).where(
            ContractSignField.contract_id == contract_id,
            ContractSignField.party_id == party_id,
            ContractSignField.required.is_(True),
            ContractSignField.signed.is_(False),
        )
    ).all()
    for field in pending:
        cx = field.x + field.w / 2
        cy = field.y + field.h / 2
        for page, x, y, w, h in rects:
            if field.page == page and x <= cx <= x + w and y <= cy <= y + h:
                field.signed = True
                field.signed_at = datetime.utcnow()
                session.add(field)
                break


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
    proxy_authorization_id: Optional[uuid.UUID] = None,
    proxy_reason: Optional[str] = None,
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
    # 并发签署串行化：先锁合同并复核该方未被并发签署，再做任何写操作
    contract = _lock_contract_row(session, contract)
    _assert_party_unsigned(session, party)

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
        proxy_reason=proxy_reason,
    )

    if field is not None:
        field.signed = True
        field.signed_at = datetime.utcnow()
        session.add(field)
        # R6：本次落章覆盖到的其他必签区一并置已签（未覆盖的保持未签）
        _mark_required_fields_covered(
            session,
            contract.id,
            party.id,
            [(field.page, field.x, field.y, field.w, field.h)],
        )

    return _finalize_party_signed(
        session,
        contract,
        party,
        signer_user_id=signer_user_id,
        ip=ip,
        signature_svg=signature_svg,
        method=method or party.sign_method or SignMethod.personal_handwrite,
        field_id=field_id,
        proxy_authorization_id=proxy_authorization_id,
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
    proxy_authorization_id: Optional[uuid.UUID] = None,
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

    # 字段级完成判定按「真实落章」执行：签署动作本身不再把该方未落章的
    # required 字段置为已签。调用方（sign-batch / sign-self）在落章后按
    # 实际坐标覆盖关系调用 `_mark_required_fields_covered`，只有被签章真正
    # 覆盖到的必签区才算签完；未覆盖的保持未签，合同不会被判完成。

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
            proxy_authorization_id=proxy_authorization_id,
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
    contract = _get_visible_contract(session, user, contract_id, request=request)
    if contract.status in _FINALIZED_STATUSES:
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
    audit.record_contract_audit(
        session,
        action=audit.ACTION_SIGN,
        contract_id=contract.id,
        actor=user,
        request=request,
        detail={
            "channel": "staff",
            "party_id": str(party.id),
            "party_name": party.name,
            "party_role": party.role.value,
            "method": (method or party.sign_method or SignMethod.personal_handwrite).value,
            "field_id": str(field_id) if field_id else None,
            "contract_status": contract.status.value,
        },
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
    contract = _get_visible_contract(session, user, contract_id, request=request)
    if contract.status in _FINALIZED_STATUSES:
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
    audit.record_contract_audit(
        session,
        action=audit.ACTION_SIGN,
        contract_id=contract.id,
        actor=user,
        request=request,
        detail={
            "channel": "staff",
            "party_id": str(party.id),
            "party_name": party.name,
            "party_role": party.role.value,
            "method": method.value,
            "field_id": str(field.id),
            "contract_status": contract.status.value,
        },
    )
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
    contract = _get_visible_contract(session, user, contract_id, request=request)
    if contract.status in _FINALIZED_STATUSES:
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
    audit.record_contract_audit(
        session,
        action=audit.ACTION_SIGN,
        contract_id=contract.id,
        actor=user,
        request=request,
        detail={
            "channel": "staff",
            "party_id": str(party.id),
            "party_name": party.name,
            "party_role": party.role.value,
            "field_count": len(created),
            "pdf_signed": pdf_signed,
            "contract_status": contract.status.value,
        },
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
    proxy: Optional[dict] = None,
) -> tuple:
    """「一次性落区并签署」共用内核（站内 `/sign-batch`、代签与免登录公开端共用）。

    逐 item 新建签署区（required=False）并按坐标把签章图盖到 PDF；`image_data_url`
    优先使用，缺省按类型生成；最后统一落痕并推进状态机，返回 (created, signature_hash)。
    `proxy` 为代签上下文（`authorization_id` / `reason`），为空表示本人签署。
    """
    # 并发签署串行化：先锁合同并复核该方未被并发签署，再做任何写操作
    contract = _lock_contract_row(session, contract)
    _assert_party_unsigned(session, party)

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
    parsed: List[tuple] = []
    rects: List[tuple] = []

    # 先归一化坐标并做「必签区全覆盖」预校验，再写任何字段/文件：
    # 一次性签署是一次原子动作，若本次落章没覆盖该方全部未签必签区，
    # 必须整单拒绝；否则签署方会被标记已签且无法再次补签，剩余必签区永久悬空。
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
        parsed.append((it, method, page, x, y, w, h))
        rects.append((page, x, y, w, h))

    pending_required = session.exec(
        select(ContractSignField).where(
            ContractSignField.contract_id == contract.id,
            ContractSignField.party_id == party.id,
            ContractSignField.required.is_(True),
            ContractSignField.signed.is_(False),
        )
    ).all()
    uncovered = [
        f
        for f in pending_required
        if not any(
            f.page == page and x <= f.x + f.w / 2 <= x + w and y <= f.y + f.h / 2 <= y + h
            for page, x, y, w, h in rects
        )
    ]
    if uncovered:
        raise HTTPException(
            status_code=409,
            detail=(
                f"REQUIRED_FIELDS_NOT_COVERED: 还有 {len(uncovered)} 个必签区"
                "未被本次签章覆盖，请调整签章位置后重新提交"
            ),
        )

    for it, method, page, x, y, w, h in parsed:
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
    pdf_signed = _apply_pdf_signatures(
        session, contract, party, placements,
        proxy_reason=(proxy or {}).get("reason"),
    ) is True

    for field, _method, _img in placements:
        field.signed = True
        field.signed_at = datetime.utcnow()
        session.add(field)

    # R6：只把本次落章真实覆盖到的必签区置已签，未覆盖的保持未签
    _mark_required_fields_covered(session, contract.id, party.id, rects)

    sig_hash = _finalize_party_signed(
        session,
        contract,
        party,
        signer_user_id=signer_user_id,
        ip=ip,
        signature_svg=first_svg,
        method=first_method or SignMethod.personal_handwrite,
        field_id=first_field_id,
        proxy_authorization_id=(proxy or {}).get("authorization_id"),
    )
    return created, sig_hash, pdf_signed


# 签署入口的 method/field_type 字符串 → 签署方式（代签范围校验用）
_SIGN_METHOD_BY_NAME = {
    "signature": SignMethod.personal_handwrite,
    "personal_handwrite": SignMethod.personal_handwrite,
    "personal_seal": SignMethod.personal_seal,
    "seal": SignMethod.company_seal,
    "company_seal": SignMethod.company_seal,
    "date": SignMethod.date,
}


@router.post("/{contract_id}/sign-proxy")
def sign_proxy(
    contract_id: uuid.UUID,
    payload: dict,
    request: Request,
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """员工代签：必须有覆盖该合同的有效授权，否则拒绝并返回明确错误码。

    payload: {party_id, authorization_id?, items:[{page,x,y,w,h,method,signature_svg?,image_data_url?}]}
    - 授权人必须是被代签的签署方本人；被授权人必须是当前员工；
    - 授权须未撤销、在有效期内、且范围覆盖该合同的房源/类型/签章方式；
    - 代签在审计（`contract.proxy_sign`）与 PDF 签名域 Reason 上都标记「代签 + 授权来源」，
      并与本人签署在验签报告中可区分（`is_proxy`）。
    """
    contract = _get_visible_contract(session, user, contract_id, request=request)
    if contract.status in _FINALIZED_STATUSES:
        raise HTTPException(status_code=409, detail="Contract already finalized")
    party = _get_party(session, contract_id, payload.get("party_id"))
    if party.signed:
        raise HTTPException(status_code=409, detail="Party already signed")
    if party.declined_at:
        raise HTTPException(status_code=409, detail="Party already declined")

    items = payload.get("items")
    if not isinstance(items, list) or not items:
        raise HTTPException(status_code=400, detail="No sign items")
    items = [it for it in items[:MAX_SIGN_BATCH_ITEMS] if isinstance(it, dict)]
    if not items:
        raise HTTPException(status_code=400, detail="No valid sign items")

    methods = [
        _SIGN_METHOD_BY_NAME.get(
            str(it.get("method") or it.get("field_type") or ""),
            SignMethod.personal_handwrite,
        )
        for it in items
    ]

    auth = _resolve_proxy_authorization(
        session, contract, party, user, payload.get("authorization_id"), methods
    )
    grantor = session.get(User, auth.grantor_user_id)
    grantor_name = (grantor.full_name or grantor.email) if grantor else str(auth.grantor_user_id)
    proxy_reason = f"授权人 {grantor_name}，授权编号 {str(auth.id)[:8]}"

    created, sig_hash, pdf_signed = _sign_batch_core(
        session,
        contract,
        party,
        items=items,
        signer_user_id=user.id,
        ip=(request.client.host if request.client else None),
        created_by=user.id,
        proxy={"authorization_id": auth.id, "reason": proxy_reason},
    )
    audit.record_contract_audit(
        session,
        action=audit.ACTION_PROXY_SIGN,
        contract_id=contract.id,
        actor=user,
        request=request,
        detail={
            "channel": "proxy",
            "party_id": str(party.id),
            "party_name": party.name,
            "party_role": party.role.value,
            "authorization_id": str(auth.id),
            "grantor_user_id": str(auth.grantor_user_id),
            "grantee_user_id": str(auth.grantee_user_id),
            "field_count": len(created),
            "pdf_signed": pdf_signed,
            "contract_status": contract.status.value,
        },
    )
    return {
        "party_id": str(party.id),
        "signed": True,
        "fields": created,
        "signature_hash": sig_hash,
        "pdf_signed": pdf_signed,
        "contract_status": contract.status.value,
        "proxy": True,
        "authorization_id": str(auth.id),
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
            # 最近一次签章失败（员工可见）：列表即标红，不必点进详情才知道
            "sign_error": bool(is_staff and c.last_sign_error),
            "sign_error_message": (c.last_sign_error or None) if is_staff else None,
            # 签署有效期（过期只是展示态；实际状态由签署/读取接口推进为 expired）
            "expires_at": c.expires_at.isoformat() if c.expires_at else None,
            "sign_order_type": c.sign_order_type.value
            if c.sign_order_type
            else "parallel",
        }
        items.append(item)
    return items


@router.get("/stats")
def contract_stats(
    start_at: Optional[str] = None,
    end_at: Optional[str] = None,
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """合同报表统计（员工）。新增「终止类」聚合，不改变任何既有计数。

    口径（写死在返回值 `period`/`terminated` 里，避免前端各自解释）：

    - **归期字段：`contracts.created_at`（合同创建时间）**，与列表默认排序一致；
      `start_at`/`end_at` 均为闭区间，`end_at` 含当天最后一刻（调用方传 ISO 时间）。
    - **分母**：归期内、未软删除的全部合同数（`total`）。
    - **分子（终止类）**：归期内状态为 `voided` / `rejected` / `revoked` 的合同数之和。
    - **`rate`** = 终止类数 / total，`total = 0` 时为 `0`，保留 4 位小数。
    - `by_status` 保留 9 个状态各自计数，**`voided`、`rejected` 仍独立呈现**，
      终止类是并列的新增聚合字段，不替换、不合并原有数字。
    - **为什么撤回并入终止类**：作废、拒签、撤回的共性都是「签署流程在完成前被终止，
      合同不会再推进到已签」，差异只在发起方（员工作废 / 签署方拒签 / 员工撤回）
      与留痕原因；报表若只加作废+拒签，会漏掉撤回，导致「终止总量」偏小。
      三者仍分别计数，需要分因分析时按 `by_status` 取明细。
    """
    def _parse(raw: Optional[str], field: str) -> Optional[datetime]:
        if not raw:
            return None
        try:
            return datetime.fromisoformat(raw.replace("Z", "+00:00")).replace(tzinfo=None)
        except (ValueError, AttributeError):
            raise HTTPException(status_code=400, detail=f"Invalid {field}")

    start = _parse(start_at, "start_at")
    end = _parse(end_at, "end_at")
    if start and end and start > end:
        raise HTTPException(status_code=400, detail="start_at must be <= end_at")

    conditions = [Contract.deleted_at.is_(None)]
    if start:
        conditions.append(Contract.created_at >= start)
    if end:
        conditions.append(Contract.created_at <= end)

    rows = session.exec(
        select(Contract.status, func.count(Contract.id))
        .where(*conditions)
        .group_by(Contract.status)
    ).all()
    # 兼容驱动返回枚举或字符串两种形态
    counts = {}
    for status_value, count in rows:
        key = status_value.value if hasattr(status_value, "value") else str(status_value)
        counts[key] = int(count)

    by_status = {s.value: counts.get(s.value, 0) for s in ContractStatus}
    total = sum(by_status.values())
    terminated_count = sum(
        by_status.get(s.value, 0)
        for s in (ContractStatus.voided, ContractStatus.rejected, ContractStatus.revoked)
    )
    return {
        "period": {
            "basis": "created_at",
            "start_at": start.isoformat() if start else None,
            "end_at": end.isoformat() if end else None,
        },
        "total": total,
        "by_status": by_status,
        # 新增聚合列：与 by_status.voided / by_status.rejected 并列，不改动原值
        "terminated": {
            "count": terminated_count,
            "rate": round(terminated_count / total, 4) if total else 0.0,
            "components": {
                "voided": by_status.get("voided", 0),
                "rejected": by_status.get("rejected", 0),
                "revoked": by_status.get("revoked", 0),
            },
        },
        "generated_at": datetime.utcnow().isoformat(),
    }


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
    request: Request,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """合同详情（含当事人与正文）。

    正文含双方证件号，属 PII：可见性走 `can_view_contract()`，
    不可见时返回 404（不暴露「存在但你没权限」）。
    """
    contract = _get_visible_contract(session, user, contract_id, request=request)
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
        # 发起方最小联系信息：与免登录签署页同一份脱敏口径，仅脱敏名 + 脱敏手机号
        **initiator_contact(session, contract),
        "expired": bool(contract.expires_at and contract.expires_at < datetime.utcnow()),
        "sign_order_type": contract.sign_order_type.value
        if contract.sign_order_type
        else "parallel",
        "callback_url": contract.callback_url if is_staff else None,
        "can_edit": is_staff
        and contract.status
        not in (
            ContractStatus.signed,
            ContractStatus.completed,
            ContractStatus.voided,
            ContractStatus.revoked,
        ),
        # 可撤回：员工 + 未完成签署的流转中合同（已签/已作废/已拒签/已撤回均不可）
        "can_revoke": is_staff
        and contract.status
        in (
            ContractStatus.draft,
            ContractStatus.sent,
            ContractStatus.partially_signed,
            ContractStatus.expired,
        ),
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
                # 催办留痕：签署页/详情页可据此展示「已催办」状态
                "reminded_count": p.reminded_count or 0,
                "last_reminded_at": (
                    p.last_reminded_at.isoformat() if p.last_reminded_at else None
                ),
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
        # 审批状态与意见：详情页展示最新一张审批单（历史审批在审批列表里查）
        "approval": (
            contract_approval.serialize_request(session, latest)
            if (latest := contract_approval.latest_request(session, contract_id))
            else None
        ),
        "can_submit_approval": is_staff
        and contract.status
        in (ContractStatus.draft, ContractStatus.pending_approval),
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
                    "is_proxy": False,
                    "proxy_authorization_id": None,
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
                # 代签与本人签署在验签报告中可区分
                "is_proxy": rec.proxy_authorization_id is not None,
                "proxy_authorization_id": str(rec.proxy_authorization_id)
                if rec.proxy_authorization_id
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
    request: Request,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """验签报告。

    - 员工：沿用合同可见性口径（不可见仍按 404，不改变既有行为）；
    - 签署方本人：可验自己参与的合同（user_id 或邮箱归属）；
    - 其余登录用户：403（明确「无权验签」而非静默 404）。
    """
    contract = session.get(Contract, contract_id)
    if not contract or contract.deleted_at:
        raise HTTPException(status_code=404, detail="Contract not found")
    if user.role in STAFF_ROLES:
        _get_visible_contract(session, user, contract_id, request=request)
    else:
        parties = session.exec(
            select(ContractParty).where(ContractParty.contract_id == contract_id)
        ).all()
        if not any(party_belongs_to_user(p, user) for p in parties):
            raise HTTPException(status_code=403, detail="Not a party of this contract")
    return build_verify_report(session, contract)


@router.get("/{contract_id}/signed-file")
def download_signed_contract(
    contract_id: uuid.UUID,
    request: Request,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """下载已签 PDF（需可见权限；不暴露上传目录）。未产出已签件时 404。"""
    contract = _get_visible_contract(session, user, contract_id, request=request)
    signed = getattr(contract, "signed_pdf_path", None)
    if not signed or not Path(signed).exists():
        raise HTTPException(status_code=404, detail="Signed file not available")
    audit.record_contract_audit(
        session,
        action=audit.ACTION_DOWNLOAD_SIGNED,
        contract_id=contract.id,
        actor=user,
        request=request,
        detail={"contract_status": contract.status.value},
    )
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
    request: Request,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """下载存证报告（PDF，需可见权限，含内容哈希与签名校验结论）。"""
    contract = _get_visible_contract(session, user, contract_id, request=request)
    report = build_verify_report(session, contract)
    parties = session.exec(
        select(ContractParty)
        .where(ContractParty.contract_id == contract_id)
        .order_by(ContractParty.created_at.asc())
    ).all()
    content = _build_evidence_report_pdf(contract, report, parties)
    audit.record_contract_audit(
        session,
        action=audit.ACTION_DOWNLOAD_EVIDENCE,
        contract_id=contract.id,
        actor=user,
        request=request,
        detail={
            "contract_status": contract.status.value,
            "tampered": report.get("tampered"),
        },
    )
    name = f"{contract.contract_no or 'contract'}_evidence.pdf"
    return Response(
        content=content,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )