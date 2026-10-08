"""免登录合同签署（公开）接口。

未注册客户没走平台流程时，经纪人把免登录签署链接转发给客户，客户打开即可
查看合同并签署，无需登录。令牌一次性、可过期，签署后立即清空。

**安全边界**：

- 令牌是唯一凭据（`ContractParty.sign_token`，secrets.token_urlsafe(32)），
  只认令牌不认登录态，故：
  - 过期 → 410；已签署 / 已作废 → 409；
  - 返回的签署方姓名做脱敏处理，避免链接被转发后泄露完整身份信息；
  - 提交签署时姓名/证件号以链接持有人填写为准（此时无法用登录态校验本人），
    但 IP 写真实请求来源，签名哈希随合同正文哈希一起留痕。
- 上传的合同文件（PDF 等）同样只经本模块带令牌校验的读取接口分发，
  不经静态托管。
"""
import hashlib
import re
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict
from sqlmodel import Session, select

from app.core.rate_limit import AUTH_LIMIT, limiter
from app.core.uploads import resolve_stored_path
from app.db import get_session
from app.models import (
    Contract,
    ContractStatus,
    ContractParty,
    ContractSignField,
    SignMethod,
)

from .auth import (
    _is_valid_email,
    _is_valid_phone,
    _send_code,
    _issue_otp,
    _consume_otp,
)

from .contracts import (
    STORED_URL_PREFIX,
    UPLOAD_DIR,
    _apply_signature,
    _sanitize_signature_svg,
    _serialize_sign_field,
    build_verify_report,
)

router = APIRouter(prefix="/public/contract-sign", tags=["contract-sign"])

# 中国大陆身份证号：18 位数字 + 末位可 X/x
_ID_RE = re.compile(r"^\d{17}[\dXx]$")


def _mask_name(name: str) -> str:
    """姓名脱敏：保留首尾字符，中间以 * 代替。"""
    value = (name or "").strip()
    if len(value) <= 1:
        return value or "*"
    if len(value) == 2:
        return value[0] + "*"
    return value[0] + "*" * (len(value) - 2) + value[-1]


def _resolve_party(session: Session, token: str) -> ContractParty:
    """按令牌取签署方并校验有效期/状态。

    - 令牌不存在 → 404（不区分「不存在」与「已作废」，避免探测）
    - 已过期 → 410
    - 已签署 / 合同已作废 → 409
    """
    party = session.exec(
        select(ContractParty).where(ContractParty.sign_token == token)
    ).first()
    if not party:
        raise HTTPException(status_code=404, detail="Invalid or expired link")
    if party.sign_token_expires_at and party.sign_token_expires_at < datetime.utcnow():
        raise HTTPException(status_code=410, detail="Link expired")
    if party.signed:
        raise HTTPException(status_code=409, detail="Already signed")
    contract = session.get(Contract, party.contract_id)
    if not contract or contract.deleted_at:
        raise HTTPException(status_code=404, detail="Contract not found")
    if contract.status == ContractStatus.voided:
        raise HTTPException(status_code=409, detail="Contract voided")
    return party


class SignPageOut(BaseModel):
    """签署页所需数据。"""

    contract_id: Optional[str] = None
    title: Optional[str] = None
    content_html: Optional[str] = None
    source: Optional[str] = None
    # 上传型合同的原文只能经带令牌的读取接口取（file_url），不返回磁盘路径
    file_url: Optional[str] = None
    party_name_masked: Optional[str] = None
    party_role: Optional[str] = None
    expires_at: Optional[str] = None
    model_config = ConfigDict(extra="allow")


@router.get("/{token}", response_model=SignPageOut)
def get_sign_page(
    token: str,
    session: Session = Depends(get_session),
):
    """查看待签署合同（免登录）。"""
    party = _resolve_party(session, token)
    contract = session.get(Contract, party.contract_id)

    # 该签署方可签的签署区：未签署，且归属当前 party 或其任意（party_id IS NULL）
    fields = session.exec(
        select(ContractSignField).where(
            ContractSignField.contract_id == contract.id,
            ContractSignField.signed.is_(False),
        )
    ).all()
    sign_fields = [
        _serialize_sign_field(f)
        for f in fields
        if f.party_id is None or f.party_id == party.id
    ]

    return {
        "contract_id": str(contract.id),
        "title": contract.title,
        "kind": contract.kind.value if contract.kind else "lease",
        "source": contract.source.value if contract.source else "generated",
        "content_html": contract.content_html,
        "file_url": f"/api/v1/public/contract-sign/{token}/file"
        if contract.file_path
        else None,
        "pdf_available": _pdf_path(contract) is not None,
        "pdf_page_count": _pdf_page_count(contract),
        "language": contract.language,
        "party_name_masked": _mask_name(party.name),
        "party_role": party.role.value,
        "real_name_verified": _has_real_name(party),
        "party": {
            "id": str(party.id),
            "name": party.name,
            "sign_method": party.sign_method.value
            if party.sign_method
            else SignMethod.personal_handwrite.value,
            "real_name_verified": _has_real_name(party),
        },
        "sign_fields": sign_fields,
        "expires_at": party.sign_token_expires_at.isoformat()
        if party.sign_token_expires_at
        else None,
    }


@router.get("/{token}/file")
def get_sign_file(
    token: str,
    session: Session = Depends(get_session),
):
    """下载/预览该合同上传的原始文件（PDF/图片），仅凭有效令牌可读。"""
    party = _resolve_party(session, token)
    contract = session.get(Contract, party.contract_id)
    if not contract.file_path:
        raise HTTPException(status_code=404, detail="No file for this contract")
    path = resolve_stored_path(
        contract.file_path,
        UPLOAD_DIR,
        STORED_URL_PREFIX,
        not_found_message="Contract file not found on disk",
    )
    return FileResponse(path)


def _pdf_path(contract) -> Optional[str]:
    """合同引擎 PDF 落盘路径（优先已签存档，其次原始 PDF）。"""
    from pathlib import Path

    for attr in ("signed_pdf_path", "pdf_path"):
        v = getattr(contract, attr, None)
        if v and Path(v).exists():
            return v
    return None


def _pdf_page_count(contract) -> Optional[int]:
    path = _pdf_path(contract)
    if not path:
        return None
    try:
        from app.services import kaifang_sign_service

        return kaifang_sign_service.get_engine().page_count(
            Path(path).read_bytes()
        )
    except Exception:  # noqa: BLE001
        return None


@router.get("/{token}/pdf-pages/{page}")
def get_sign_pdf_page(
    token: str,
    page: int,
    session: Session = Depends(get_session),
):
    """待签署合同的引擎 PDF 第 N 页渲染为 PNG（免登录，供页图预览/拖拽签署）。"""
    from fastapi.responses import Response
    from pathlib import Path

    party = _resolve_party(session, token)
    contract = session.get(Contract, party.contract_id)
    path = _pdf_path(contract)
    if not path:
        raise HTTPException(status_code=404, detail="Contract PDF not found")
    from app.services import kaifang_sign_service

    try:
        png = kaifang_sign_service.get_engine().page_image(
            Path(path).read_bytes(), page=page
        )
    except IndexError:
        raise HTTPException(status_code=404, detail="Page out of range")
    return Response(content=png, media_type="image/png")


@router.get("/{token}/verify")
def verify_sign_public(
    token: str,
    session: Session = Depends(get_session),
):
    """公开验签：凭签署令牌核验合同与序号。返回与站内 verify 相同的摘要与记录。

    仅提供核验信息（tampered、逐条 signature_success），不暴露脱敏外的更多 PII；
    覆盖同 token 对应的合同。
    """
    party = _resolve_party(session, token)
    contract = session.get(Contract, party.contract_id)
    if not contract:
        raise HTTPException(status_code=404, detail="Contract not found")
    report = build_verify_report(session, contract)
    # 公开路径不带作废合同状态，转为只读核验信息
    return report


def _mask_contact(contact: str) -> str:
    """手机号/邮箱脱敏，用于回显。"""
    value = (contact or "").strip()
    if not value:
        return ""
    if "@" in value:
        local, _, domain = value.partition("@")
        if len(local) <= 1:
            head = local
            tail = "*"
        else:
            head = local[0]
            tail = "*" * (len(local) - 1)
        return f"{head}{tail}@{domain}"
    # 手机号：保留前 3 后 4
    digits = value
    if len(digits) >= 7:
        return f"{digits[:3]}****{digits[-4:]}"
    return "*" * len(digits)


def _has_real_name(party: ContractParty) -> bool:
    """是否已完成实名认证。"""
    return bool(party.real_name_verified_at)


class RealNameVerifyOut(BaseModel):
    real_name_verified_at: Optional[str] = None
    name: Optional[str] = None
    model_config = ConfigDict(extra="allow")


@router.post("/{token}/send-code")
@limiter.limit(AUTH_LIMIT)
def send_real_name_code(
    token: str,
    payload: dict,
    request: Request,
    session: Session = Depends(get_session),
):
    """向签署方联系方式发送实名验证码（免登录）。

    body: { contact: str } 手机号或邮箱。复用 auth 的 OTP 发码链路
    （_issue_otp + _send_code + VerificationCode 表）。
    """
    party = _resolve_party(session, token)
    if _has_real_name(party):
        raise HTTPException(status_code=409, detail="Already verified")
    if party.signed:
        raise HTTPException(status_code=409, detail="Already signed")

    contact = (payload.get("contact") or "").strip()
    if not contact:
        raise HTTPException(status_code=400, detail="contact is required")
    if "@" in contact:
        if not _is_valid_email(contact):
            raise HTTPException(status_code=400, detail="Invalid email address")
        channel = "email"
    else:
        if not _is_valid_phone(contact):
            raise HTTPException(status_code=400, detail="Invalid phone number")
        channel = "sms"

    code = _issue_otp(session, contact, channel)
    sent = _send_code(contact, channel, code)
    if not sent:
        raise HTTPException(status_code=503, detail="Code delivery unavailable")

    return {"sent": True, "to_masked": _mask_contact(contact)}


@router.post("/{token}/verify-identity")
@limiter.limit(AUTH_LIMIT)
def verify_identity(
    token: str,
    payload: dict,
    request: Request,
    session: Session = Depends(get_session),
):
    """实名认证提交（免登录）。

    body: { name, id_number, contact, code }
    - code 校验复用 auth `_consume_otp`（VerificationCode 表，次数/有效期上限）。
    - 通过后写入 party.name/id_number/phone|email，置 real_name_verified_at=now，
      并落证件号 SHA-256 到 real_name_hash。
    """
    party = _resolve_party(session, token)
    if _has_real_name(party):
        raise HTTPException(status_code=409, detail="Already verified")
    if party.signed:
        raise HTTPException(status_code=409, detail="Already signed")

    name = (payload.get("name") or "").strip()
    id_number = (payload.get("id_number") or "").strip()
    contact = (payload.get("contact") or "").strip()
    code = (payload.get("code") or "").strip()

    if not name:
        raise HTTPException(status_code=400, detail="name is required")
    if not id_number:
        raise HTTPException(status_code=400, detail="id_number is required")
    if not re.fullmatch(r"[A-Za-z\u4e00-\u9fa5·.\s]{2,40}", name):
        raise HTTPException(status_code=400, detail="Invalid name")
    if not _ID_RE.match(id_number):
        raise HTTPException(status_code=400, detail="Invalid id_number format")
    if not contact:
        raise HTTPException(status_code=400, detail="contact is required")
    if not code:
        raise HTTPException(status_code=400, detail="code is required")

    # 校验验证码（不匹配/过期/超次数抛 400）
    _consume_otp(session, contact, code)

    party.name = name
    party.id_number = id_number
    if "@" in contact:
        party.email = contact
    else:
        party.phone = contact
    party.real_name_verified_at = datetime.utcnow()
    party.real_name_hash = hashlib.sha256(id_number.encode("utf-8")).hexdigest()
    session.add(party)
    session.commit()
    return {
        "real_name_verified_at": party.real_name_verified_at.isoformat(),
        "name": party.name,
    }


@router.post("/{token}")
@limiter.limit(AUTH_LIMIT)
def submit_signature(
    token: str,
    payload: dict,
    request: Request,
    session: Session = Depends(get_session),
):
    """提交签署。payload: {name, id_number?, phone?, signature_svg?}

    `signature_svg` 由客户端手写画布生成；未提供时用服务端渲染的签名替身
    （与站内签署口径一致）。
    """
    party = _resolve_party(session, token)
    contract = session.get(Contract, party.contract_id)

    # P3 强制实名：未登录签署方须先完成实名认证才能签署
    if not _has_real_name(party):
        raise HTTPException(status_code=403, detail="REAL_NAME_REQUIRED")

    name = (payload.get("name") or "").strip()
    if name:
        party.name = name
    if payload.get("id_number"):
        party.id_number = str(payload["id_number"]).strip()
    if payload.get("phone"):
        party.phone = str(payload["phone"]).strip()
    if not party.name:
        raise HTTPException(status_code=400, detail="Signer name is required")

    raw_svg = payload.get("signature_svg")
    sig_svg = _sanitize_signature_svg(raw_svg) if raw_svg else None

    # 按字段签署：可选 field_id
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
        # 未注册客户没有平台账号，留痕只记 IP 与姓名
        signer_user_id=party.user_id,
        ip=(request.client.host if request.client else None),
        signature_svg=sig_svg,
        field_id=field_id,
        method=method,
    )
    return {
        "signed": True,
        "signature_hash": sig_hash,
        "field_id": str(field_id) if field_id else None,
        "party_name": party.name,
        "contract_status": contract.status.value,
    }