"""房源上架单路由。

业主或「房源上架经纪人」发布房源：收集完整房源信息 + 联系方式 + 分佣配置，
并做去重落库（结构化唯一键强命中合并 / 相似度进疑似人工审核），随后进入平台上架审核。

依赖 app.services.dedupe_service 做档案定位与疑似提取。
"""
import uuid
from datetime import datetime
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import or_
from sqlmodel import Session, select

from app.db import get_session
from app.core.auth import STAFF_ROLES, get_current_user
from app.core.pagination import Page, PaginationParams, paginate_query
from app.models import (
    User,
    UserRole,
    Owner,
    Property,
    Project,
    BrokerPartner,
    Listing,
    ListingType,
    PublisherType,
    ListingStatus,
    MandateType,
    NonExclusiveSplit,
    DedupeState,
    PropertyDedupeReview,
    DuplicateMatchType,
    ReviewStatus,
)
from app.services import dedupe_service, commission_rates

router = APIRouter(prefix="/listings", tags=["listings"])

# 分佣比例取值约束
SALE_RATE_MIN, SALE_RATE_MAX = 3.0, 6.0
RENTAL_MONTHS_ALLOWED = {1.0, 1.5, 2.0, 3.0}
# 独家/快速成交时客源方可分比例区间
EXCLUSIVE_BUYER_MIN, EXCLUSIVE_BUYER_MAX = 70.0, 100.0
# 非独家分成档位映射（客源方%, 房源方%）
NON_EXCLUSIVE_MAP = {
    NonExclusiveSplit.sp_65_35: (65, 35),
    NonExclusiveSplit.sp_50_50: (50, 50),
    NonExclusiveSplit.sp_30_70: (30, 70),
    NonExclusiveSplit.sp_20_80: (20, 80),
}
# 非管理员/非发布人对外可读状态
_PUBLIC_STATUSES = (ListingStatus.active,)

# 分佣配置字段：平台与业主/经纪人的议价条款，对无关登录用户（典型是租客）必须置空。
# 见 `_serialize` 的 include_commission 说明。
_COMMISSION_FIELDS = (
    "sale_commission_rate",
    "rental_commission_months",
    "mandate_type",
    "split_option",
    "buyer_side_rate",
    "listing_side_rate",
    "owner_commission_rate",
)


class ListingCreate(BaseModel):
    # 房源档案信息
    project_id: Optional[uuid.UUID] = None
    owner_id: Optional[uuid.UUID] = None
    room_number: str
    floor: Optional[int] = None
    building: Optional[str] = None
    address: str
    property_type: str = "apartment"
    size_sqm: Optional[float] = None
    bedrooms: Optional[int] = None
    bathrooms: Optional[int] = None
    description: Optional[str] = None
    photos: Optional[List[str]] = None
    furnished: bool = False
    available_from: Optional[datetime] = None
    video_url: Optional[str] = None

    # 上架类型与价格
    listing_type: ListingType = ListingType.rent
    asking_price: Optional[float] = None  # sell 必填
    monthly_rent: Optional[float] = None  # rent 必填
    currency: str = "THB"

    # 分佣配置
    sale_commission_rate: Optional[float] = None  # 3-6
    rental_commission_months: Optional[float] = None  # 1/1.5/2/3
    mandate_type: MandateType = MandateType.non_exclusive
    split_option: Optional[NonExclusiveSplit] = None
    buyer_side_rate: Optional[float] = None  # exclusive 时 70-100

    # 业主联系方式（后台选填、可隐藏）
    owner_contact_name: Optional[str] = None
    owner_contact_phone: Optional[str] = None
    owner_contact_channel: Optional[str] = None
    owner_contact_visible: bool = False

    # 经纪人联系方式（broker 发布时，显示前端）
    broker_company: Optional[str] = None
    broker_real_name: Optional[str] = None
    broker_phone: Optional[str] = None
    broker_wechat: Optional[str] = None
    broker_line: Optional[str] = None
    broker_whatsapp: Optional[str] = None


class ListingUpdate(BaseModel):
    asking_price: Optional[float] = None
    monthly_rent: Optional[float] = None
    sale_commission_rate: Optional[float] = None
    rental_commission_months: Optional[float] = None
    mandate_type: Optional[MandateType] = None
    split_option: Optional[NonExclusiveSplit] = None
    buyer_side_rate: Optional[float] = None
    owner_contact_name: Optional[str] = None
    owner_contact_phone: Optional[str] = None
    owner_contact_channel: Optional[str] = None
    owner_contact_visible: Optional[bool] = None
    broker_company: Optional[str] = None
    broker_real_name: Optional[str] = None
    broker_phone: Optional[str] = None
    broker_wechat: Optional[str] = None
    broker_line: Optional[str] = None
    broker_whatsapp: Optional[str] = None
    status: Optional[ListingStatus] = None


def _apply_split_sides(
    mandate_type: MandateType,
    buyer_side_rate: Optional[float],
    split_option: Optional[NonExclusiveSplit],
    payload: dict,
) -> dict:
    """按委托方式得出 客源方/房源方 分成 %（写回 payload）。"""
    if mandate_type == MandateType.exclusive:
        buyer = buyer_side_rate
        if buyer is None or not (EXCLUSIVE_BUYER_MIN <= buyer <= EXCLUSIVE_BUYER_MAX):
            raise HTTPException(
                status_code=400,
                detail=f"独家/快速成交：客源方可分比例须在 {EXCLUSIVE_BUYER_MIN}%-{EXCLUSIVE_BUYER_MAX}% 之间",
            )
        payload["buyer_side_rate"] = buyer
        payload["listing_side_rate"] = round(100 - buyer, 2)
        payload["split_option"] = None
    else:
        if buyer_side_rate is not None:
            raise HTTPException(
                status_code=400, detail="非独家委托请通过 split_option 选择分成档位"
            )
        option = split_option or NonExclusiveSplit.sp_65_35
        if option not in NON_EXCLUSIVE_MAP:
            raise HTTPException(status_code=400, detail="无效的分成档位")
        buyer, listing = NON_EXCLUSIVE_MAP[option]
        payload["buyer_side_rate"] = float(buyer)
        payload["listing_side_rate"] = float(listing)
        payload["split_option"] = option
    return payload


def _validate_commission(req, payload: dict) -> dict:
    """校验并规整佣金数值；未传时留空由发布侧决定默认值。"""
    if req.sale_commission_rate is not None and not (
        SALE_RATE_MIN <= req.sale_commission_rate <= SALE_RATE_MAX
    ):
        raise HTTPException(
            status_code=400,
            detail=f"卖房佣金比例须在 {SALE_RATE_MIN}-{SALE_RATE_MAX}% 之间",
        )
    if req.rental_commission_months is not None and req.rental_commission_months not in RENTAL_MONTHS_ALLOWED:
        raise HTTPException(
            status_code=400, detail="租房佣金月数须为 1/1.5/2/3 个月"
        )
    return payload


def _serialize(
    li: Listing,
    *,
    include_owner_contact: bool,
    include_commission: bool = True,
) -> dict:
    """上架单 → 响应体。

    两个按角色收敛的口径，调用方必须自己想清楚再传：

    - `include_owner_contact`：业主联系方式，只有 staff / 发布人本人可见。
    - `include_commission`：**分佣配置**（卖房佣金比例、租房佣金月数、独家与否、
      分成档位、客源/房源分成比例、业主佣金比例）。这些是平台与业主/经纪人之间的
      议价条款，不是给终端用户看的信息。

      为什么必须裁：租客在同一份列表里就能读到「客源 65% / 房源 35%」，
      等于把自己的议价底牌摊给对手方。发布人本人与所属业主是协议当事方，应当可见；
      staff 全量可见；其余登录用户一律不下发。
    """
    data = {
        "id": str(li.id),
        "property_id": str(li.property_id),
        "listing_type": li.listing_type.value if li.listing_type else None,
        "publisher": li.publisher.value if li.publisher else None,
        "publisher_user_id": str(li.publisher_user_id),
        "publisher_broker_id": str(li.publisher_broker_id) if li.publisher_broker_id else None,
        "owner_id": str(li.owner_id),
        "status": li.status.value if li.status else None,
        "asking_price": li.asking_price,
        "monthly_rent": li.monthly_rent,
        "currency": li.currency,
        "sale_commission_rate": li.sale_commission_rate,
        "rental_commission_months": li.rental_commission_months,
        "mandate_type": li.mandate_type.value if li.mandate_type else None,
        "split_option": li.split_option.value if li.split_option else None,
        "buyer_side_rate": li.buyer_side_rate,
        "listing_side_rate": li.listing_side_rate,
        "owner_commission_rate": li.owner_commission_rate,
        "broker_company": li.broker_company,
        "broker_real_name": li.broker_real_name,
        "broker_phone": li.broker_phone,
        "broker_wechat": li.broker_wechat,
        "broker_line": li.broker_line,
        "broker_whatsapp": li.broker_whatsapp,
        "dedupe_state": li.dedupe_state.value if li.dedupe_state else None,
        "merged_into_listing_id": str(li.merged_into_listing_id) if li.merged_into_listing_id else None,
        "reject_reason": li.reject_reason,
        "reviewed_at": li.reviewed_at.isoformat() if li.reviewed_at else None,
        "owner_contact_visible": li.owner_contact_visible,
        "created_at": li.created_at.isoformat() if li.created_at else None,
    }
    # 业主联系方式仅对可读方放行（见权限判断），公开接口恒不含
    if include_owner_contact:
        data["owner_contact_name"] = li.owner_contact_name
        data["owner_contact_phone"] = li.owner_contact_phone
        data["owner_contact_channel"] = li.owner_contact_channel
    else:
        data["owner_contact_name"] = None
        data["owner_contact_phone"] = None
        data["owner_contact_channel"] = None
    # 分佣配置：置 None 而不是删 key——前端有既有的字段读取与类型定义，
    # 删 key 会让它们读到 undefined，置 None 语义更明确
    if not include_commission:
        for field in _COMMISSION_FIELDS:
            data[field] = None
    return data


def _pick_cover(photos: Any) -> Optional[str]:
    """取 photos 首图作为封面（兼容字符串 / {url,path} 字典两种形态）。"""
    if isinstance(photos, list) and photos:
        first = photos[0]
        if isinstance(first, str):
            return first
        if isinstance(first, dict):
            return first.get("url") or first.get("path")
    return None


def _enum_value(value: Any) -> Optional[str]:
    """枚举取 .value，非枚举原样返回。"""
    if value is None:
        return None
    return value.value if hasattr(value, "value") else value


def _property_view(prop: Optional[Property], project: Optional[Project]) -> dict:
    """房源档案 + 楼盘 → C 端找房口径的展示字段。

    让 B 端「房源管理/我的上架单」列表的房源列与 C 端找房卡片对齐，
    提供封面、项目名、地址分区、朝向、装修等 C 端决策字段。
    """
    return {
        "property_type": _enum_value(prop.property_type) if prop else None,
        "room_number": prop.room_number if prop else None,
        "property_address": prop.address if prop else None,
        "district": project.district if project else None,
        "city": project.city if project else None,
        "project_id": str(project.id) if project else None,
        "project_name": project.name if project else None,
        "size_sqm": prop.size_sqm if prop else None,
        "bedrooms": prop.bedrooms if prop else None,
        "bathrooms": prop.bathrooms if prop else None,
        "floor": prop.floor if prop else None,
        "building": prop.building if prop else None,
        "orientation": _enum_value(prop.orientation) if prop else None,
        "decoration": _enum_value(prop.decoration) if prop else None,
        "furnished": bool(prop.furnished) if prop else False,
        "cover": _pick_cover(prop.photos) if prop else None,
    }


def _can_view_owner_contact(user: User, li: Listing) -> bool:
    """业主联系方式可见：发布人本人 或 staff。"""
    if user.role in STAFF_ROLES:
        return True
    if li.owner_contact_visible and li.publisher_user_id == user.id:
        return True
    return False


def _can_view_commission(user: User, li: Listing, owner_id: Optional[uuid.UUID] = None) -> bool:
    """分佣配置可见：staff / 该上架单的发布人本人 / 该上架单所属业主本人。

    `owner_id` 是调用方一次性查出的「当前用户的 Owner.id」，传进来是为了
    避免在列表里逐条回查 owners 表（N+1）。
    """
    if user.role in STAFF_ROLES:
        return True
    if li.publisher_user_id == user.id:
        return True
    if owner_id is not None and li.owner_id == owner_id:
        return True
    return False


def _get_owner_id_for_user(session: Session, user: User) -> Optional[uuid.UUID]:
    """当前用户对应的 Owner.id（仅 owner 角色有）。列表接口调用一次即可。"""
    if user.role != UserRole.owner:
        return None
    owner = session.exec(
        select(Owner).where(Owner.user_id == user.id, Owner.deleted_at.is_(None))
    ).first()
    return owner.id if owner else None



def _get_broker_for_user(session: Session, user: User) -> Optional[BrokerPartner]:
    return session.exec(
        select(BrokerPartner).where(
            BrokerPartner.user_id == user.id,
            BrokerPartner.deleted_at.is_(None),
        )
    ).first()


@router.get("", response_model=Page[dict])
def list_listings(
    status: Optional[ListingStatus] = None,
    listing_type: Optional[ListingType] = None,
    publisher: Optional[PublisherType] = None,
    q: Optional[str] = Query(None, max_length=100, description="关键词：地址/房号/描述"),
    pagination: PaginationParams = Depends(),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """上架单列表。staff 看全量；普通用户看已上架 + 自己发布的全部。"""
    is_staff = user.role in STAFF_ROLES
    query = select(Listing).where(Listing.deleted_at.is_(None))
    if not is_staff:
        # 普通用户可看已上架单 + 自己发布的非上架单（便于「我的上架单」管理）
        query = query.where(
            or_(
                Listing.status.in_(_PUBLIC_STATUSES),
                Listing.publisher_user_id == user.id,
            )
        )
    if status:
        query = query.where(Listing.status == status)
    if listing_type:
        query = query.where(Listing.listing_type == listing_type)
    if publisher:
        query = query.where(Listing.publisher == publisher)
    keyword = (q or "").strip()
    if keyword:
        pattern = f"%{keyword}%"
        query = query.where(
            or_(
                Listing.broker_company.ilike(pattern),
                Listing.broker_real_name.ilike(pattern),
            )
        )
    stmt = query.order_by(Listing.created_at.desc())
    page = paginate_query(session, stmt, pagination)
    # 业主的 Owner.id 只查一次，避免逐条回查 owners（N+1）
    owner_id_for_user = _get_owner_id_for_user(session, user)
    # 批量取房源档案与楼盘，构建 C 端口径展示字段（同样只查两次，避免 N+1）
    listings = page.items
    prop_ids = [li.property_id for li in listings if li.property_id]
    props = session.exec(
        select(Property).where(Property.id.in_(prop_ids), Property.deleted_at.is_(None))
    ).all() if prop_ids else []
    prop_map = {p.id: p for p in props}
    project_ids = [p.project_id for p in props if p.project_id]
    projects = session.exec(
        select(Project).where(Project.id.in_(project_ids))
    ).all() if project_ids else []
    project_map = {pr.id: pr for pr in projects}

    rows = []
    for li in listings:
        prop = prop_map.get(li.property_id)
        project = project_map.get(prop.project_id) if prop else None
        item = _serialize(
            li,
            include_owner_contact=(is_staff or _can_view_owner_contact(user, li)),
            include_commission=_can_view_commission(user, li, owner_id_for_user),
        )
        item.update(_property_view(prop, project))
        rows.append(item)
    page.items = rows
    return page


@router.post("")
def create_listing(
    req: ListingCreate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """发布房源（上架单）。

    业主自主发布 → publisher=owner；房源上架经纪人 → publisher=broker（须 listing_active）。
    发布过程做去重落库；疑似重复写 PropertyDedupeReview 交人工。
    """
    publisher: PublisherType
    publisher_broker_id: Optional[uuid.UUID] = None
    owner_id: Optional[uuid.UUID] = None

    if user.role == UserRole.owner:
        publisher = PublisherType.owner
        owner = session.exec(
            select(Owner).where(Owner.user_id == user.id, Owner.deleted_at.is_(None))
        ).first()
        if not owner:
            raise HTTPException(status_code=404, detail="Owner profile not found")
        owner_id = owner.id
    else:
        broker = _get_broker_for_user(session, user)
        if broker is None:
            # 内部员工/管理员可代为上架（标注发布人为操作者）
            publisher = PublisherType.broker
        elif not broker.listing_active:
            raise HTTPException(
                status_code=403,
                detail="您尚未签署《房源经纪人上架房源协议》，无法作为房源上架经纪人发布房源",
            )
        else:
            publisher = PublisherType.broker
            publisher_broker_id = broker.id
        if not req.owner_id:
            raise HTTPException(status_code=400, detail="业主发布请填写 owner_id（业主归属）")
        if not session.get(Owner, req.owner_id) or session.get(Owner, req.owner_id).deleted_at:
            raise HTTPException(status_code=404, detail="Owner not found")
        owner_id = req.owner_id

    payload = req.model_dump()
    payload = _validate_commission(req, payload)
    payload = _apply_split_sides(
        req.mandate_type, req.buyer_side_rate, req.split_option, payload
    )

    # ---------- 去重定位档案 ----------
    dedupe = dedupe_service.resolve(
        session,
        project_id=req.project_id,
        building=req.building,
        room_number=req.room_number,
        address=req.address,
    )

    if dedupe["existing"] is not None:
        prop = dedupe["existing"]
        existing_dedupe_state = DedupeState.new
        # 同一档案上已存在「同类型」有效上架单 → 判定重复阻断（待人工）
        dup = session.exec(
            select(Listing).where(
                Listing.property_id == prop.id,
                Listing.listing_type == req.listing_type,
                Listing.status.in_(
                    [ListingStatus.pending, ListingStatus.active]
                ),
                Listing.merged_into_listing_id.is_(None),
                Listing.deleted_at.is_(None),
            )
        ).first()
        if dup:
            existing_dedupe_state = DedupeState.blocked
    else:
        prop = Property(
            project_id=req.project_id,
            owner_id=owner_id,
            room_number=req.room_number,
            floor=req.floor,
            building=req.building,
            address=req.address,
            property_type=req.property_type,
            monthly_rent=req.monthly_rent or 0.0,
            currency=req.currency,
            size_sqm=req.size_sqm,
            bedrooms=req.bedrooms,
            bathrooms=req.bathrooms,
            description=req.description,
            photos=req.photos,
            furnished=req.furnished,
            available_from=req.available_from,
            video_url=req.video_url,
            dedupe_type=dedupe["dedupe_type"],
            dedupe_key=dedupe["dedupe_key"],
            address_norm=dedupe["address_norm"],
        )
        session.add(prop)
        existing_dedupe_state = DedupeState.new

    # ---------- 分佣默认值 ----------
    if publisher == PublisherType.owner:
        payload["owner_commission_rate"] = 100.0
        if req.listing_type == ListingType.sell and payload.get("sale_commission_rate") is None:
            payload["sale_commission_rate"] = commission_rates.resolve_commission_rate(
                session, deal_type="sale_transaction"
            )
        if req.listing_type == ListingType.rent and payload.get("rental_commission_months") is None:
            payload["rental_commission_months"] = 1.0

    # 疑似重复（相似度命中，无强命中）
    fuzzy = dedupe["fuzzy"] if dedupe["existing"] is None else []

    # 已由发布方身份解析出的字段从 payload 剔除，避免覆盖显式传参
    payload.pop("owner_id", None)
    payload.pop("project_id", None)
    payload.pop("listing_type", None)  # 下方用 req.listing_type 显式传入，避免重复关键字

    listing = Listing(
        property_id=prop.id,
        listing_type=req.listing_type,
        publisher=publisher,
        publisher_user_id=user.id,
        publisher_broker_id=publisher_broker_id,
        owner_id=owner_id,
        status=ListingStatus.pending,
        dedupe_state=DedupeState.suspect if fuzzy else existing_dedupe_state,
        **{k: v for k, v in payload.items() if hasattr(Listing, k)},
    )
    session.add(listing)

    review_ids: List[str] = []
    if fuzzy:
        session.flush()  # 拿到 listing.id / prop.id
        for f in fuzzy:
            review = PropertyDedupeReview(
                candidate_listing_id=listing.id,
                candidate_property_id=prop.id,
                matched_property_id=f["property_id"],
                match_type=DuplicateMatchType.fuzzy,
                match_key=dedupe["dedupe_key"],
                score=f["score"],
                status=ReviewStatus.pending,
            )
            session.add(review)
            review_ids.append(str(review.id))

    session.commit()
    session.refresh(listing)
    return {
        **{k: v for k, v in _serialize(listing, include_owner_contact=True).items()},
        "dedupe_reviews": review_ids,
    }


@router.get("/{listing_id}")
def get_listing(
    listing_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    li = session.get(Listing, listing_id)
    if not li or li.deleted_at:
        raise HTTPException(status_code=404, detail="Listing not found")
    if user.role not in STAFF_ROLES and li.status not in _PUBLIC_STATUSES and li.publisher_user_id != user.id:
        raise HTTPException(status_code=403, detail="No permission")
    return _serialize(
        li,
        include_owner_contact=_can_view_owner_contact(user, li),
        # 非 staff 也可能合法读到已上架单（租客看房源），分佣一并按角色收敛
        include_commission=_can_view_commission(user, li, _get_owner_id_for_user(session, user)),
    )


@router.patch("/{listing_id}")
def update_listing(
    listing_id: uuid.UUID,
    req: ListingUpdate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    li = session.get(Listing, listing_id)
    if not li or li.deleted_at:
        raise HTTPException(status_code=404, detail="Listing not found")
    is_staff = user.role in STAFF_ROLES
    if not is_staff and li.publisher_user_id != user.id:
        raise HTTPException(status_code=403, detail="No permission")
    update = req.model_dump(exclude_unset=True)
    # 仅 staff 可改状态；佣金/分成规则统一再校验
    if "status" in update and not is_staff:
        update.pop("status", None)
    if "mandate_type" in update or "buyer_side_rate" in update or "split_option" in update:
        _apply_split_sides(
            req.mandate_type or li.mandate_type,
            req.buyer_side_rate if req.buyer_side_rate is not None else li.buyer_side_rate,
            req.split_option or li.split_option or NonExclusiveSplit.sp_65_35,
            update,
        )
    if "sale_commission_rate" in update:
        if update["sale_commission_rate"] is not None and not (
            SALE_RATE_MIN <= update["sale_commission_rate"] <= SALE_RATE_MAX
        ):
            raise HTTPException(status_code=400, detail="卖房佣金比例须在 3-6% 之间")
    if "rental_commission_months" in update:
        if update["rental_commission_months"] is not None and update["rental_commission_months"] not in RENTAL_MONTHS_ALLOWED:
            raise HTTPException(status_code=400, detail="租房佣金月数须为 1/1.5/2/3 个月")
    for k, v in update.items():
        if hasattr(Listing, k):
            setattr(li, k, v)
    session.add(li)
    session.commit()
    session.refresh(li)
    return _serialize(li, include_owner_contact=_can_view_owner_contact(user, li))


@router.post("/{listing_id}/review")
def review_listing(
    listing_id: uuid.UUID,
    body: dict,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """平台上架审核：approved → active；rejected → rejected（附原因）。"""
    if user.role not in STAFF_ROLES:
        raise HTTPException(status_code=403, detail="No permission")
    li = session.get(Listing, listing_id)
    if not li or li.deleted_at:
        raise HTTPException(status_code=404, detail="Listing not found")
    decision = body.get("decision")
    if decision not in ("approved", "rejected"):
        raise HTTPException(status_code=400, detail="decision must be approved/rejected")
    if decision == "approved":
        li.status = ListingStatus.active
    else:
        li.status = ListingStatus.rejected
        li.reject_reason = body.get("note")
    li.reviewed_at = datetime.utcnow()
    session.add(li)
    session.commit()
    session.refresh(li)
    return _serialize(li, include_owner_contact=True)


@router.post("/{listing_id}/close")
def close_listing(
    listing_id: uuid.UUID,
    body: dict,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """下架/成交关闭。"""
    li = session.get(Listing, listing_id)
    if not li or li.deleted_at:
        raise HTTPException(status_code=404, detail="Listing not found")
    if user.role not in STAFF_ROLES and li.publisher_user_id != user.id:
        raise HTTPException(status_code=403, detail="No permission")
    li.status = ListingStatus.closed
    if body.get("sold") and li.listing_type == ListingType.sell:
        li.status = ListingStatus.sold
    if body.get("rented") and li.listing_type == ListingType.rent:
        li.status = ListingStatus.rented
    li.reviewed_at = datetime.utcnow()
    session.add(li)
    session.commit()
    session.refresh(li)
    return _serialize(li, include_owner_contact=_can_view_owner_contact(user, li))