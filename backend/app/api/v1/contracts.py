"""电子签合同路由。

- POST /contracts/generate     根据租约/用户信息自动生成合同（HTML + 哈希）
- GET  /contracts/{id}         合同详情（含当事人）
- POST /contracts/{id}/parties 为合同追加签署方
- POST /contracts/{id}/sign    某方数字签名
- GET  /contracts              当前用户相关合同列表
"""
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.db import get_session
from app.core.auth import get_current_user
from app.models import (
    User, Contract, ContractStatus, ContractParty, SignerRole, SignatureRecord,
)
from app.services import esign_service

router = APIRouter(prefix="/contracts", tags=["contracts"])


@router.post("/generate")
def generate_contract(
    payload: dict,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """按租约/房源/用户信息自动生成合同。payload: {counters: {...}, language?}"""
    counters = payload.get("counters") or {}
    language = payload.get("language", "zh")
    meta = esign_service.generate_contract(counters, language)
    contract = Contract(
        lease_id=payload.get("lease_id"),
        property_id=payload.get("property_id"),
        title=meta["title"],
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
        "status": contract.status.value,
        "document_hash": contract.document_hash,
        "file_path": contract.file_path,
        "content_html": contract.content_html,
    }


@router.post("/{contract_id}/parties")
def add_party(
    contract_id: uuid.UUID,
    payload: dict,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    contract = session.get(Contract, contract_id)
    if not contract:
        raise HTTPException(status_code=404, detail="Contract not found")
    party = ContractParty(
        contract_id=contract_id,
        user_id=payload.get("user_id"),
        name=payload.get("name", ""),
        email=payload.get("email", ""),
        id_number=payload.get("id_number"),
        phone=payload.get("phone"),
        role=SignerRole(payload.get("role", "tenant")),
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


@router.post("/{contract_id}/sign")
def sign_contract(
    contract_id: uuid.UUID,
    payload: dict,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """payload: {party_id, name?, ip?} 对指定签署方做数字签名。"""
    contract = session.get(Contract, contract_id)
    if not contract:
        raise HTTPException(status_code=404, detail="Contract not found")
    party = session.get(ContractParty, payload["party_id"])
    if not party or party.contract_id != contract_id:
        raise HTTPException(status_code=404, detail="Party not found")

    name = payload.get("name") or party.name
    stamp = contract.title or contract.id
    sig_svg = esign_service.signature_svg(name, str(stamp))
    sig_hash = esign_service.sign_digest(
        f"{contract.document_hash}|{party.id}|{name}"
    )
    party.signed = True
    party.signed_at = datetime.utcnow()
    party.signature = sig_svg
    record = SignatureRecord(
        contract_id=contract_id,
        party_id=party.id,
        signer_user_id=user.id,
        signer_name=name,
        signature_svg=sig_svg,
        signature_hash=sig_hash,
        ip=payload.get("ip"),
    )
    session.add(record)
    session.commit()

    # 所有人签署 → 完成
    parties = session.exec(
        select(ContractParty).where(ContractParty.contract_id == contract_id)
    ).all()
    if parties and all(p.signed for p in parties):
        contract.status = ContractStatus.signed
        contract.signed_at = datetime.utcnow()
        session.add(contract)
        session.commit()
    return {"party_id": str(party.id), "signed": True, "signature_hash": sig_hash}


@router.get("")
def list_contracts(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    contracts = session.exec(select(Contract).order_by(Contract.created_at.desc())).all()
    return [
        {
            "id": str(c.id),
            "title": c.title,
            "status": c.status.value,
            "language": c.language,
            "document_hash": c.document_hash,
            "created_at": c.created_at.isoformat(),
            "signed_at": c.signed_at.isoformat() if c.signed_at else None,
        }
        for c in contracts
    ]


@router.get("/{contract_id}")
def get_contract(
    contract_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    contract = session.get(Contract, contract_id)
    if not contract:
        raise HTTPException(status_code=404, detail="Contract not found")
    parties = session.exec(
        select(ContractParty).where(ContractParty.contract_id == contract_id)
    ).all()
    return {
        "id": str(contract.id),
        "title": contract.title,
        "status": contract.status.value,
        "language": contract.language,
        "document_hash": contract.document_hash,
        "content_html": contract.content_html,
        "created_at": contract.created_at.isoformat(),
        "parties": [
            {
                "id": str(p.id),
                "name": p.name,
                "email": p.email,
                "role": p.role.value,
                "signed": p.signed,
                "signed_at": p.signed_at.isoformat() if p.signed_at else None,
            }
            for p in parties
        ],
    }