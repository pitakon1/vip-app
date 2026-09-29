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
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict
from sqlmodel import Session, select

from app.core.rate_limit import AUTH_LIMIT, limiter
from app.core.uploads import resolve_stored_path
from app.db import get_session
from app.models import Contract, ContractStatus, ContractParty

from .contracts import (
    STORED_URL_PREFIX,
    UPLOAD_DIR,
    _apply_signature,
    _sanitize_signature_svg,
)

router = APIRouter(prefix="/public/contract-sign", tags=["contract-sign"])


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
    return {
        "contract_id": str(contract.id),
        "title": contract.title,
        "kind": contract.kind.value if contract.kind else "lease",
        "source": contract.source.value if contract.source else "generated",
        "content_html": contract.content_html,
        "file_url": f"/api/v1/public/contract-sign/{token}/file"
        if contract.file_path
        else None,
        "language": contract.language,
        "party_name_masked": _mask_name(party.name),
        "party_role": party.role.value,
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

    sig_hash = _apply_signature(
        session,
        contract,
        party,
        # 未注册客户没有平台账号，留痕只记 IP 与姓名
        signer_user_id=party.user_id,
        ip=(request.client.host if request.client else None),
        signature_svg=sig_svg,
    )
    return {
        "signed": True,
        "signature_hash": sig_hash,
        "party_name": party.name,
        "contract_status": contract.status.value,
    }