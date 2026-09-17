"""开放分销体系路由：外部渠道商、转介绍、联合单分成。"""
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
    Referral,
    SplitDeal,
)

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
    level: Optional[str] = None
    status: Optional[str] = None
    invite_code: Optional[str] = None
    contact_name: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
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
        "broker_type": b.broker_type.value,
        "level": b.level.value,
        "status": b.status.value,
        "invite_code": b.invite_code,
        "contact_name": b.contact_name,
        "contact_phone": b.contact_phone,
        "contact_email": b.contact_email,
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
    ref = Referral(
        referrer_partner_id=broker.id,
        referrer_user_id=broker.user_id,
        invite_code=invite_code,
        referred_user_id=user.id,
        referred_name=referred_name or user.full_name,
        referred_phone=referred_phone,
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
    rows = session.exec(
        select(Referral)
        .where(
            or_(Referral.referrer_user_id == user.id, Referral.referrer_partner_id == user.id),
            Referral.deleted_at.is_(None),
        )
        .order_by(Referral.created_at.desc())
    ).all()
    return [_referral_dict(r) for r in rows]


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