"""开放分销体系路由：外部渠道商、转介绍、联合单分成。"""
import re
import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlmodel import Session, select, or_

from app.db import get_session
from app.core.auth import STAFF_ROLES, get_current_user
from app.core.pagination import Page, PaginationParams, paginate_query
from app.models import (
    User,
    UserRole,
    BrokerPartner,
    BrokerLevel,
    BrokerStatus,
    BrokerType,
    BrokerRole,
    Referral,
    SplitDeal,
    Contract,
    ContractStatus,
    ContractKind,
    ContractParty,
    SignerRole,
)
from app.services import esign_service

router = APIRouter(prefix="/brokers", tags=["brokers"])

# 员工角色（可看全量）：统一走 core.auth.STAFF_ROLES


class BrokerIn(BaseModel):
    partner_name: str
    broker_type: BrokerType = BrokerType.individual
    contact_name: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    country: str = "TH"
    base_rate: float = 0.0
    upline_partner_id: Optional[uuid.UUID] = None
    referred_by_partner_id: Optional[uuid.UUID] = None


class BrokerApprove(BaseModel):
    level: BrokerLevel = BrokerLevel.silver
    base_rate: float = 0.0


class BrokerOut(BaseModel):
    """渠道商响应（与 _broker_dict 输出一致）。"""

    model_config = ConfigDict(extra="allow")

    id: Optional[str] = None
    user_id: Optional[str] = None
    partner_name: Optional[str] = None
    broker_type: Optional[str] = None
    broker_role: Optional[str] = None
    level: Optional[str] = None
    status: Optional[str] = None
    invite_code: Optional[str] = None
    contact_name: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    company_name: Optional[str] = None
    real_name: Optional[str] = None
    wechat: Optional[str] = None
    line: Optional[str] = None
    whatsapp: Optional[str] = None
    kyc_status: Optional[str] = None
    kyc_verified_at: Optional[str] = None
    distributor_active: Optional[bool] = None
    listing_active: Optional[bool] = None
    distributor_contract_id: Optional[str] = None
    listing_contract_id: Optional[str] = None
    country: Optional[str] = None
    base_rate: Optional[float] = None
    upline_partner_id: Optional[str] = None
    commission_paid: Optional[float] = None
    deal_count: Optional[int] = None
    approved_at: Optional[str] = None
    created_at: Optional[str] = None


class BrokerInviteOut(BaseModel):
    """邀请码信息响应。"""

    model_config = ConfigDict(extra="allow")

    invite_code: Optional[str] = None
    partner_name: Optional[str] = None


class ReferralOut(BaseModel):
    """转介绍记录响应（与 _referral_dict 输出一致）。"""

    model_config = ConfigDict(extra="allow")

    id: Optional[str] = None
    referrer_user_id: Optional[str] = None
    referrer_partner_id: Optional[str] = None
    invite_code: Optional[str] = None
    referred_name: Optional[str] = None
    referred_phone: Optional[str] = None
    source: Optional[str] = None
    channel: Optional[str] = None
    status: Optional[str] = None
    reward_status: Optional[str] = None
    created_at: Optional[str] = None


def _gen_code(session: Session) -> str:
    import secrets

    while True:
        code = "SEA" + secrets.token_hex(3).upper()
        if not session.exec(select(BrokerPartner).where(BrokerPartner.invite_code == code)).first():
            return code


def _broker_dict(b: BrokerPartner) -> dict:
    return {
        "id": str(b.id),
        "user_id": str(b.user_id) if b.user_id else None,
        "partner_name": b.partner_name,
        "broker_type": b.broker_type.value if b.broker_type else None,
        "broker_role": b.broker_role.value if getattr(b, "broker_role", None) else None,
        "level": b.level.value,
        "status": b.status.value,
        "invite_code": b.invite_code,
        "contact_name": b.contact_name,
        "contact_phone": b.contact_phone,
        "contact_email": b.contact_email,
        "company_name": getattr(b, "company_name", None),
        "real_name": getattr(b, "real_name", None),
        "wechat": getattr(b, "wechat", None),
        "line": getattr(b, "line", None),
        "whatsapp": getattr(b, "whatsapp", None),
        "kyc_status": getattr(b, "kyc_status", None).value if getattr(b, "kyc_status", None) else None,
        "kyc_verified_at": getattr(b, "kyc_verified_at", None).isoformat() if getattr(b, "kyc_verified_at", None) else None,
        "distributor_active": getattr(b, "distributor_active", False),
        "listing_active": getattr(b, "listing_active", False),
        "distributor_contract_id": str(b.distributor_contract_id) if getattr(b, "distributor_contract_id", None) else None,
        "listing_contract_id": str(b.listing_contract_id) if getattr(b, "listing_contract_id", None) else None,
        "country": b.country,
        "base_rate": b.base_rate,
        "upline_partner_id": str(b.upline_partner_id) if b.upline_partner_id else None,
        "commission_paid": b.commission_paid,
        "deal_count": b.deal_count,
        "approved_at": b.approved_at.isoformat() if b.approved_at else None,
        "created_at": b.created_at.isoformat() if b.created_at else None,
    }


def _referral_dict(r: Referral) -> dict:
    return {
        "id": str(r.id),
        "referrer_user_id": str(r.referrer_user_id) if r.referrer_user_id else None,
        "referrer_partner_id": str(r.referrer_partner_id) if r.referrer_partner_id else None,
        "invite_code": r.invite_code,
        "referred_name": r.referred_name,
        "referred_phone": r.referred_phone,
        "source": r.source,
        "channel": r.channel,
        "status": r.status,
        "reward_status": r.reward_status,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


@router.get("", response_model=Page[BrokerOut])
def list_brokers(
    status: Optional[BrokerStatus] = None,
    level: Optional[BrokerLevel] = None,
    pagination: PaginationParams = Depends(),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """渠道商列表（管理/经纪人）。"""
    if user.role not in STAFF_ROLES:
        raise HTTPException(status_code=403, detail="No permission")
    query = select(BrokerPartner).where(BrokerPartner.deleted_at.is_(None))
    if status:
        query = query.where(BrokerPartner.status == status)
    if level:
        query = query.where(BrokerPartner.level == level)
    query = query.order_by(BrokerPartner.created_at.desc())
    page = paginate_query(session, query, pagination)
    page.items = [_broker_dict(i) for i in page.items]
    return page


@router.post("")
def create_broker(
    req: BrokerIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """登记外部渠道商/独立经纪人（管理/经纪人发起，默认待审）。"""
    if user.role not in STAFF_ROLES:
        raise HTTPException(status_code=403, detail="No permission")
    code = _gen_code(session)
    broker = BrokerPartner(
        partner_name=req.partner_name,
        broker_type=req.broker_type,
        contact_name=req.contact_name,
        contact_phone=req.contact_phone,
        contact_email=req.contact_email,
        country=req.country,
        base_rate=req.base_rate,
        upline_partner_id=req.upline_partner_id,
        referred_by_partner_id=req.referred_by_partner_id,
        invite_code=code,
        status=BrokerStatus.pending,
        user_id=user.id if req.broker_type == BrokerType.individual else None,
    )
    session.add(broker)
    session.commit()
    session.refresh(broker)
    return _broker_dict(broker)


@router.get("/me", response_model=BrokerOut)
def my_broker(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """当前用户绑定的渠道商身份。"""
    broker = session.exec(
        select(BrokerPartner).where(BrokerPartner.user_id == user.id, BrokerPartner.deleted_at.is_(None))
    ).first()
    if not broker:
        code = _gen_code(session)
        broker = BrokerPartner(
            partner_name=user.full_name,
            broker_type=BrokerType.individual,
            status=BrokerStatus.pending,
            invite_code=code,
            country="TH",
            user_id=user.id,
        )
        session.add(broker)
        session.commit()
        session.refresh(broker)
    return _broker_dict(broker)


@router.get("/invite/{invite_code}", response_model=BrokerInviteOut)
def get_invite(
    invite_code: str,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """查询邀请码信息（转介绍溯源）。"""
    broker = session.exec(
        select(BrokerPartner).where(BrokerPartner.invite_code == invite_code)
    ).first()
    if not broker:
        raise HTTPException(status_code=404, detail="Invite code not found")
    return {"invite_code": broker.invite_code, "partner_name": broker.partner_name}


@router.post("/{broker_id}/approve")
def approve_broker(
    broker_id: uuid.UUID,
    req: BrokerApprove,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """审批渠道商并定级。"""
    if user.role not in (UserRole.admin, UserRole.agent):
        raise HTTPException(status_code=403, detail="No permission")
    broker = session.get(BrokerPartner, broker_id)
    if not broker or broker.deleted_at:
        raise HTTPException(status_code=404, detail="Broker not found")
    broker.status = BrokerStatus.active
    broker.level = req.level
    broker.base_rate = req.base_rate
    broker.approved_at = datetime.utcnow()
    session.add(broker)
    session.commit()
    session.refresh(broker)
    return _broker_dict(broker)


@router.post("/{broker_id}/suspend")
def suspend_broker(
    broker_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    if user.role not in (UserRole.admin, UserRole.agent):
        raise HTTPException(status_code=403, detail="No permission")
    broker = session.get(BrokerPartner, broker_id)
    if not broker:
        raise HTTPException(status_code=404, detail="Broker not found")
    broker.status = BrokerStatus.suspended
    session.add(broker)
    session.commit()
    return _broker_dict(broker)


@router.post("/referrals")
def create_referral(
    invite_code: str,
    referred_name: Optional[str] = None,
    referred_phone: Optional[str] = None,
    source: str = "link",
    property_id: Optional[uuid.UUID] = None,
    project_id: Optional[uuid.UUID] = None,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """记录转介绍（被推荐人通过邀请码注册/留资）。"""
    broker = session.exec(
        select(BrokerPartner).where(BrokerPartner.invite_code == invite_code)
    ).first()
    if not broker:
        raise HTTPException(status_code=404, detail="Invite code not found")
    # 邀请码状态校验：仅 active 邀请码可用，pending/suspended 一律拒绝
    if broker.status != BrokerStatus.active:
        raise HTTPException(status_code=400, detail="邀请码未激活")
    # 自荐拦截：当前登录用户不得使用自己（绑定的账号）的邀请码刷量
    if broker.user_id and broker.user_id == user.id:
        raise HTTPException(status_code=400, detail="不能使用自己的邀请码")
    phone_norm = str(referred_phone).strip() if referred_phone else None
    if phone_norm is not None:
        # referred_phone 格式校验
        if not re.fullmatch(r"\+?[0-9\s\-]{6,20}", phone_norm):
            raise HTTPException(status_code=400, detail="referred_phone 格式非法")
        # 自荐拦截：被推荐手机号与邀请人账号手机号相同
        if broker.user_id:
            inviter = session.get(User, broker.user_id)
            if inviter and inviter.phone and inviter.phone == phone_norm:
                raise HTTPException(status_code=400, detail="不能推荐自己")
        # 同一 phone 已被同一邀请码引用过 → 409（防重复刷量）
        dup = session.exec(
            select(Referral).where(
                Referral.invite_code == invite_code,
                Referral.referred_phone == phone_norm,
                Referral.deleted_at.is_(None),
            )
        ).first()
        if dup:
            raise HTTPException(status_code=409, detail="该手机号已被该邀请码推荐过")
    ref = Referral(
        referrer_partner_id=broker.id,
        referrer_user_id=broker.user_id,
        invite_code=invite_code,
        referred_user_id=user.id,
        referred_name=referred_name or user.full_name,
        referred_phone=phone_norm,
        source=source,
        property_id=property_id,
        project_id=project_id,
        status="referred",
    )
    session.add(ref)
    session.commit()
    session.refresh(ref)
    return _referral_dict(ref)


@router.get("/referrals/mine", response_model=List[ReferralOut])
def my_referrals(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """我的转介绍记录（作为推荐人）。"""
    # referrer_partner_id 是 broker_partners.id、referrer_user_id 是 users.id，
    # 两者不能混比（partner_id == user.id 跨域比较恒不成立）——先取当前用户绑定的渠道商。
    broker = session.exec(
        select(BrokerPartner).where(
            BrokerPartner.user_id == user.id, BrokerPartner.deleted_at.is_(None)
        )
    ).first()
    rows = session.exec(
        select(Referral)
        .where(
            or_(
                Referral.referrer_user_id == user.id,
                Referral.referrer_partner_id == broker.id if broker else Referral.id.is_(None),
            ),
            Referral.deleted_at.is_(None),
        )
        .order_by(Referral.created_at.desc())
    ).all()
    return [_referral_dict(r) for r in rows]


@router.post("/{broker_id}/agreements")
def create_broker_agreement(
    broker_id: uuid.UUID,
    body: dict,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """为经纪人生成并绑定在线协议。

    body: {role: "listing_agent" | "distributor"}。
    按 role 生成对应协议合同（kind），追加平台甲方 + 经纪乙方两方，完成后由 /contracts/{id}/sign 激活。
    """
    broker = session.get(BrokerPartner, broker_id)
    if not broker or broker.deleted_at:
        raise HTTPException(status_code=404, detail="Broker not found")
    # 仅本人或员工可发起
    if broker.user_id not in (None, user.id) and user.role not in STAFF_ROLES:
        raise HTTPException(status_code=403, detail="No permission")

    role = body.get("role", "listing_agent")
    if role not in ("listing_agent", "distributor"):
        raise HTTPException(status_code=400, detail="role must be listing_agent/distributor")
    if role == "listing_agent":
        kind = ContractKind.listing_agent
        contract_field = "listing_contract_id"
    else:
        kind = ContractKind.broker_distributor
        contract_field = "distributor_contract_id"

    # 已在有效签署中 → 直接返回既有协议
    existing_id = getattr(broker, contract_field)
    if existing_id:
        exist = session.get(Contract, existing_id)
        if exist and not exist.deleted_at:
            return {
                "contract_id": str(exist.id),
                "kind": exist.kind.value,
                "status": exist.status.value,
            }

    channels = "/".join(
        x for x in (broker.wechat, broker.line, broker.whatsapp) if x
    ) or broker.contact_email or ""
    counters = {
        "broker_name": broker.real_name or broker.contact_name or broker.partner_name,
        "broker_company": broker.company_name or broker.partner_name,
        "broker_phone": broker.contact_phone or "",
        "broker_channel": channels,
        "broker_id_number": "",
    }
    meta = esign_service.generate_contract(counters, "zh", kind=kind.value)
    contract = Contract(
        title=meta["title"],
        kind=kind,
        language="zh",
        content_html=meta["content_html"],
        document_hash=meta["document_hash"],
        file_path=meta["file_path"],
        counters=counters,
        status=ContractStatus.draft,
    )
    session.add(contract)
    session.flush()

    # 甲方=平台，乙方=经纪人
    session.add(ContractParty(
        contract_id=contract.id,
        name="好房网平台",
        email="platform@haofang.local",
        role=SignerRole.witness,
    ))
    session.add(ContractParty(
        contract_id=contract.id,
        user_id=broker.user_id,
        name=broker.real_name or broker.contact_name or broker.partner_name,
        email=broker.contact_email or "",
        phone=broker.contact_phone,
        role=SignerRole.agent,
    ))
    setattr(broker, contract_field, contract.id)
    session.add(broker)
    session.commit()
    return {
        "contract_id": str(contract.id),
        "kind": kind.value,
        "status": contract.status.value,
    }


@router.get("/{broker_id}/agreements")
def get_broker_agreements(
    broker_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """查询经纪人两份协议的签署状态。"""
    broker = session.get(BrokerPartner, broker_id)
    if not broker or broker.deleted_at:
        raise HTTPException(status_code=404, detail="Broker not found")
    if broker.user_id not in (None, user.id) and user.role not in STAFF_ROLES:
        raise HTTPException(status_code=403, detail="No permission")

    def _state(contract_id):
        if not contract_id:
            return {"contract_id": None, "status": "not_signed", "signed": False}
        c = session.get(Contract, contract_id)
        if not c:
            return {"contract_id": None, "status": "not_signed", "signed": False}
        return {"contract_id": str(c.id), "status": c.status.value, "signed": c.status == ContractStatus.signed}

    return {
        "distributor": _state(broker.distributor_contract_id),
        "listing_agent": _state(broker.listing_contract_id),
    }


@router.post("/split-deals")
def create_split(
    deal_id: uuid.UUID,
    commission_total: float,
    participants: list,   # [{"role","rate","user_id"/"employee_id"/"partner_id"}] rate=0-100
    currency: str = "THB",
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """创建联合单分成（多人/多角色拆分佣金）。"""
    if user.role not in STAFF_ROLES:
        raise HTTPException(status_code=403, detail="No permission")
    # 入参校验：SplitDeal 模型对 commission_total / split_rate / split_amount
    # 均有 gt=0 约束，非法值会抛 IntegrityError 500——提前 400 拒绝。
    if not isinstance(commission_total, (int, float)) or commission_total <= 0:
        raise HTTPException(status_code=400, detail="commission_total 必须 > 0")
    total_rate = 0.0
    for p in participants:
        if not isinstance(p, dict):
            raise HTTPException(status_code=400, detail="参与者格式非法")
        rate = p.get("rate", 0)
        if not isinstance(rate, (int, float)) or rate <= 0 or rate > 100:
            raise HTTPException(status_code=400, detail="split rate 须在 (0, 100] 区间")
        total_rate += rate
    if total_rate > 100 + 1e-9:
        raise HTTPException(status_code=400, detail="参与者比率合计不能超过 100%")
    created = []
    for p in participants:
        split = SplitDeal(
            deal_id=deal_id,
            commission_total=commission_total,
            currency=currency,
            participant_role=p.get("role", "agent"),
            participant_user_id=p.get("user_id"),
            participant_employee_id=p.get("employee_id"),
            participant_partner_id=p.get("partner_id"),
            split_rate=p.get("rate", 0),
            split_amount=commission_total * p.get("rate", 0) / 100,
            status="pending",
        )
        session.add(split)
        session.refresh(split) if split.id else None
        created.append(
            {
                "id": str(split.id),
                "role": split.participant_role,
                "rate": split.split_rate,
                "amount": split.split_amount,
                "status": split.status,
            }
        )
    session.commit()
    return {"deal_id": str(deal_id), "commission_total": commission_total, "splits": created}