"""真房源保鲜路由：核验登记、核验留痕、待复验队列、到期批量流转。

## 鉴权口径

- **写**（登记核验、手动触发到期流转）限员工：核验决定房源是否还能对外展示。
- **读**：
  - 核验留痕：员工 / 该房源可见者（业主本人可看自己房源的核验历史）；
  - 待复验队列与保鲜看板：限员工（运营作业视图）。
"""
import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict
from sqlmodel import Session, select

from app.core.auth import (
    STAFF_ROLES,
    get_current_user,
    owner_id_of,
    require_admin,
    require_employee,
)
from app.db import get_session
from app.models import (
    Listing,
    ListingVerificationStatus,
    Property,
    PropertyVerification,
    User,
    UserRole,
    VerificationMethod,
    VerificationResult,
)
from app.services import freshness_service

router = APIRouter(prefix="/verifications", tags=["verifications"])




def _owner_owns_property(session: Session, user: User, prop: Optional[Property]) -> bool:
    if prop is None or prop.deleted_at:
        return False
    owner_id = owner_id_of(session, user)
    return bool(owner_id) and prop.owner_id == owner_id


def _assert_can_read_property_history(
    session: Session, user: User, prop: Optional[Property]
) -> None:
    """核验留痕的读取门槛：员工 / 业主本人名下房源。

    刻意不用 `can_view_property`（它对租客返回 True）——留痕里含核验人、
    联系方式与备注，属内部作业数据，不是 C 端展示项。
    """
    if user.role in STAFF_ROLES:
        return
    if user.role == UserRole.owner and _owner_owns_property(session, user, prop):
        return
    raise HTTPException(status_code=404, detail="Not found")


class VerificationIn(BaseModel):
    property_id: uuid.UUID
    method: VerificationMethod
    result: VerificationResult
    listing_id: Optional[uuid.UUID] = None
    ttl_days: Optional[int] = None
    evidence: Optional[dict] = None
    note: Optional[str] = None


class VerificationOut(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: Optional[str] = None
    property_id: Optional[str] = None
    listing_id: Optional[str] = None
    method: Optional[str] = None
    result: Optional[str] = None
    verified_by_user_id: Optional[str] = None
    verified_by_partner_id: Optional[str] = None
    verified_at: Optional[str] = None
    next_due_at: Optional[str] = None
    evidence: Optional[dict] = None
    note: Optional[str] = None


def _verification_dict(v: PropertyVerification) -> dict:
    return {
        "id": str(v.id),
        "property_id": str(v.property_id),
        "listing_id": str(v.listing_id) if v.listing_id else None,
        "method": v.method.value,
        "result": v.result.value,
        "verified_by_user_id": str(v.verified_by_user_id) if v.verified_by_user_id else None,
        "verified_by_partner_id": (
            str(v.verified_by_partner_id) if v.verified_by_partner_id else None
        ),
        "verified_at": v.verified_at.isoformat() if v.verified_at else None,
        "next_due_at": v.next_due_at.isoformat() if v.next_due_at else None,
        "evidence": v.evidence,
        "note": v.note,
    }


@router.post("", response_model=VerificationOut)
def record_verification(
    payload: VerificationIn,
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """登记一次房源核验（限员工），并联动上架单保鲜状态。

    结论为 `unavailable` 时会把上架单置为 `closed`；
    `expired` 状态的上架单复验通过后会自动重新上架。
    三端暂无调用方：接口就绪，前端页面待做（见 tools_contract_check --orphans 清单）。"""
    prop = session.get(Property, payload.property_id)
    if prop is None or prop.deleted_at:
        raise HTTPException(status_code=404, detail="Property not found")
    if payload.listing_id:
        listing = session.get(Listing, payload.listing_id)
        if listing is None or listing.deleted_at:
            raise HTTPException(status_code=404, detail="Listing not found")
        if listing.property_id != payload.property_id:
            raise HTTPException(
                status_code=400, detail="Listing does not belong to this property"
            )
    if payload.ttl_days is not None and payload.ttl_days < 1:
        raise HTTPException(status_code=400, detail="ttl_days 至少为 1")

    record = freshness_service.record_verification(
        session,
        property_id=payload.property_id,
        listing_id=payload.listing_id,
        method=payload.method,
        result=payload.result,
        verified_by_user_id=user.id,
        ttl_days=payload.ttl_days,
        evidence=payload.evidence,
        note=payload.note,
    )
    return _verification_dict(record)


@router.get("/properties/{property_id}/history", response_model=List[VerificationOut])
def property_verification_history(
    property_id: uuid.UUID,
    limit: int = Query(50, ge=1, le=200),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """某房源的核验留痕。员工全量；业主仅本人名下房源。

    三端暂无调用方：接口就绪，前端页面待做（见 tools_contract_check --orphans 清单）。"""
    prop = session.get(Property, property_id)
    if user.role not in STAFF_ROLES:
        _assert_can_read_property_history(session, user, prop)
    rows = freshness_service.verification_history(
        session, property_id=property_id, limit=limit
    )
    return [_verification_dict(v) for v in rows]


@router.get("/listings/{listing_id}/history", response_model=List[VerificationOut])
def listing_verification_history(
    listing_id: uuid.UUID,
    limit: int = Query(50, ge=1, le=200),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """某上架单的核验留痕。员工全量；业主仅本人名下房源的上架单。

    三端暂无调用方：接口就绪，前端页面待做（见 tools_contract_check --orphans 清单）。"""
    listing = session.get(Listing, listing_id)
    if listing is None or listing.deleted_at:
        raise HTTPException(status_code=404, detail="Listing not found")
    _assert_can_read_property_history(
        session, user, session.get(Property, listing.property_id)
    )
    rows = freshness_service.verification_history(
        session, listing_id=listing_id, limit=limit
    )
    return [_verification_dict(v) for v in rows]


@router.get("/listings/{listing_id}/freshness")
def listing_freshness(
    listing_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """上架单的保鲜状态（C 端徽标数据源）。

    三端暂无调用方：接口就绪，前端页面待做（见 tools_contract_check --orphans 清单）。"""
    listing = session.get(Listing, listing_id)
    if listing is None or listing.deleted_at:
        raise HTTPException(status_code=404, detail="Listing not found")
    return freshness_service.listing_freshness_payload(listing)


@router.get("/summary")
def verification_summary(
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """保鲜状态分布 + 待处理量（运营看板，限员工）。

    三端暂无调用方：接口就绪，前端页面待做（见 tools_contract_check --orphans 清单）。"""
    return freshness_service.freshness_summary(session)


@router.get("/queue", response_model=List[dict])
def verification_queue(
    limit: int = Query(100, ge=1, le=500),
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """待复验队列：已过期 + 临近到期的上架单（限员工）。

    过期在前（已影响线上展示），临近到期在后，各按到期时间升序。
    三端暂无调用方：接口就绪，前端页面待做（见 tools_contract_check --orphans 清单）。"""
    now = datetime.utcnow()
    listings = session.exec(
        select(Listing).where(
            Listing.deleted_at.is_(None),
            Listing.next_revalidate_at.is_not(None),
        )
    ).all()

    pending: list = []
    for listing in listings:
        state = freshness_service.refresh_listing_verification_state(listing, now=now)
        if state in (
            ListingVerificationStatus.expired.value,
            ListingVerificationStatus.pending.value,
        ):
            payload = freshness_service.listing_freshness_payload(listing, now=now)
            pending.append(
                {
                    "listing_id": str(listing.id),
                    "property_id": str(listing.property_id),
                    "status": listing.status.value,
                    **payload,
                }
            )
    pending.sort(
        key=lambda row: (
            0 if row["verification_status"] == ListingVerificationStatus.expired.value else 1,
            row["next_revalidate_at"] or "",
        )
    )
    return pending[:limit]


@router.post("/expire-due")
def expire_due(
    limit: Optional[int] = Query(None, ge=1, le=2000),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """手动触发「保鲜到期自动下架」（限管理员）。

    定时任务 `revalidate_listings` 是主入口；此端点供运维补跑（worker 挂掉后
    补一次）与测试用，不必等下一个 10:00。
    三端暂无调用方：接口就绪，前端页面待做（见 tools_contract_check --orphans 清单）。"""
    if user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Admin role required")
    expired = freshness_service.expire_due_listings(session, limit=limit)
    return {
        "expired": len(expired),
        "listing_ids": [str(item.id) for item in expired],
    }
