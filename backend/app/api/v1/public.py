"""公开（匿名可访问）API 层。

**为什么需要独立一层**：站内原有接口一律强制鉴权（`get_current_user` 要求
`Authorization` 头，匿名直接 401），C 端"先浏览、后注册"的流量入口在**接口层**
就被拦死了——前端路由怎么放都进不来。本模块是「浏览不需注册、只在需要登录的
动作上才要求注册」这条产品原则的技术落点。

**安全边界（重要）**：

- 只读接口只返回 C 端该看到的字段：**不含**业主联系方式（`owner_contact_*`）、
  内部租态、成本、佣金配置（`*_rate` / `split_option`）、去重键（`dedupe_key` /
  `address_norm`）、审核痕迹（`reject_reason` / `reviewed_at`）；
- 只展示 `ListingStatus.active` 的上架单（待审核 / 已下架 / 已驳回一律不可见）；
- 留资接口带限流，防批量灌水；
- 除留资外**不做任何写操作**。
"""
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, or_
from sqlmodel import Session, select

from app.core.auth import user_from_token
from app.core.events import publish_event
from app.core.logging import get_logger
from app.core.pagination import Page, PaginationParams, paginate
from app.core.rate_limit import AUTH_LIMIT, limiter
from app.db import get_session
from app.models import (
    Developer,
    Lead,
    LeadStage,
    Listing,
    ListingStatus,
    ListingType,
    Project,
    Property,
    PropertyStatus,
    School,
)
from app.providers.geo import haversine_km, lat_lng_bounds
from app.services import freshness_service
from app.services.search import relevance_score, resolve_sort

logger = get_logger(__name__)

router = APIRouter(prefix="/public", tags=["public"])

# /public/listings 支持的排序取值。relevance 不在前端筛选栏里也允许传：
# 关键词搜索时它是「不显式指定排序」的默认口径。
_LISTING_SORTS = ["latest", "price_asc", "price_desc", "area_desc", "distance", "relevance"]

# 学区找房：候选集上限。距离要精确算（haversine）而 SQL 里没法算，
# 因此先按 bounding box 粗筛、再在 Python 里精算与排序。
# 上限是防止无边界扫描把库拖死的第一道闸。
_SCHOOL_CANDIDATE_LIMIT = 800


# ==================== 输出 Schema ====================


class PublicListingCard(BaseModel):
    """房源卡片（列表用）。字段经过裁剪，仅保留 C 端决策所需。"""

    model_config = ConfigDict(extra="allow")

    id: Optional[uuid.UUID] = None  # Listing.id
    property_id: Optional[uuid.UUID] = None
    listing_type: Optional[str] = None
    property_type: Optional[str] = None  # 房源类型（公寓/别墅/写字楼…），C 端「更多」筛选消费
    room_number: Optional[str] = None
    address: Optional[str] = None
    district: Optional[str] = None
    city: Optional[str] = None
    project_id: Optional[uuid.UUID] = None
    project_name: Optional[str] = None
    price: Optional[float] = None
    currency: str = "THB"
    size_sqm: Optional[float] = None
    bedrooms: Optional[int] = None
    bathrooms: Optional[int] = None
    floor: Optional[int] = None
    building: Optional[str] = None
    orientation: Optional[str] = None
    decoration: Optional[str] = None
    amenities: Optional[List[Any]] = None
    furnished: bool = False
    cover: Optional[str] = None
    video_url: Optional[str] = None
    listing_no: Optional[str] = None
    updated_at: Optional[datetime] = None
    # 兼容字段：C 端列表页既有的消费口径（月租 / 挂牌价 / 相册 / 房源态 / 创建时间）。
    # 保留它们是为了让公开接口能直接替换原来需要鉴权的 /properties，
    # 避免为了改数据源而重写列表页的筛选与渲染逻辑。
    monthly_rent: Optional[float] = None
    asking_price: Optional[float] = None
    sale_price: Optional[float] = None
    photos: Optional[List[Any]] = None
    status: Optional[str] = None
    created_at: Optional[datetime] = None
    # 学区：带学校筛选时回填最近学校与距离
    nearest_school_name: Optional[str] = None
    nearest_school_km: Optional[float] = None
    # 真房源保鲜（对标贝壳「真房源」）：C 端信任信号，免登录即可见。
    # 只暴露状态与核验时间，不含核验人/方式/证据（那些属内部作业数据）。
    verification_status: Optional[str] = None
    last_verified_at: Optional[datetime] = None
    verified_days_ago: Optional[int] = None


class PublicBrokerCard(BaseModel):
    """经纪人卡片。只展示对外联络方式，不含佣金与合作协议信息。"""

    model_config = ConfigDict(extra="allow")

    company: Optional[str] = None
    real_name: Optional[str] = None
    phone: Optional[str] = None
    wechat: Optional[str] = None
    line: Optional[str] = None
    whatsapp: Optional[str] = None


class PublicProjectBrief(BaseModel):
    """小区信息块（嵌在房源详情里）。"""

    model_config = ConfigDict(extra="allow")

    id: Optional[uuid.UUID] = None
    name: Optional[str] = None
    address: Optional[str] = None
    district: Optional[str] = None
    city: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    total_units: Optional[int] = None
    total_buildings: Optional[int] = None
    total_floors: Optional[int] = None
    parking_spaces: Optional[int] = None
    completion_year: Optional[int] = None
    open_date: Optional[datetime] = None
    management_fee_per_sqm: Optional[float] = None
    avg_price: Optional[float] = None
    tenure: Optional[str] = None
    foreign_quota_pct: Optional[float] = None
    developer_id: Optional[uuid.UUID] = None
    developer_name: Optional[str] = None
    amenities: Optional[Dict[str, Any]] = None
    payment_plan: Optional[Dict[str, Any]] = None
    nearest_subway: Optional[str] = None


class PublicNearbySchool(BaseModel):
    """房源详情页的周边学校（老站最值钱的区块）。"""

    model_config = ConfigDict(extra="allow")

    id: Optional[uuid.UUID] = None
    name: Optional[str] = None
    name_en: Optional[str] = None
    stage: Optional[str] = None
    curriculum: Optional[str] = None
    district: Optional[str] = None
    distance_km: Optional[float] = None


class PublicListingDetail(PublicListingCard):
    """房源详情。"""

    description: Optional[str] = None
    deposit_amount: Optional[float] = None
    deposit_months: Optional[int] = None
    photos: List[Any] = []
    lat: Optional[float] = None
    lng: Optional[float] = None
    project: Optional[PublicProjectBrief] = None
    nearby_schools: List[PublicNearbySchool] = []
    broker: Optional[PublicBrokerCard] = None
    mandate_type: Optional[str] = None


class PublicSchoolCard(BaseModel):
    """学校卡片。"""

    model_config = ConfigDict(extra="allow")

    id: Optional[uuid.UUID] = None
    name: Optional[str] = None
    name_en: Optional[str] = None
    stage: Optional[str] = None
    curriculum: Optional[str] = None
    district: Optional[str] = None
    city: Optional[str] = None
    address: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    student_count: Optional[int] = None
    age_range: Optional[str] = None
    tuition_range: Optional[str] = None
    phone: Optional[str] = None
    website: Optional[str] = None
    cover_url: Optional[str] = None
    description: Optional[str] = None
    photos: Optional[List[Any]] = None


class PublicSchoolDetail(PublicSchoolCard):
    """学校详情 + 该校周边房源（学区找房的真正入口）。"""

    nearby_listings: List[PublicListingCard] = []


class PublicProjectCard(BaseModel):
    """小区卡片。带「售 N 间 / 租 N 间 + 价格区间」聚合（老站的做法）。"""

    model_config = ConfigDict(extra="allow")

    id: Optional[uuid.UUID] = None
    name: Optional[str] = None
    address: Optional[str] = None
    district: Optional[str] = None
    city: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    cover: Optional[str] = None
    total_units: Optional[int] = None
    completion_year: Optional[int] = None
    tenure: Optional[str] = None
    developer_name: Optional[str] = None
    sale_count: int = 0
    rent_count: int = 0
    sale_price_min: Optional[float] = None
    sale_price_max: Optional[float] = None
    rent_price_min: Optional[float] = None
    rent_price_max: Optional[float] = None


class PublicProjectDetail(PublicProjectCard):
    """小区详情 + 该小区在售/在租列表。"""

    total_buildings: Optional[int] = None
    total_floors: Optional[int] = None
    parking_spaces: Optional[int] = None
    management_fee_per_sqm: Optional[float] = None
    avg_price: Optional[float] = None
    foreign_quota_pct: Optional[float] = None
    amenities: Optional[Dict[str, Any]] = None
    payment_plan: Optional[Dict[str, Any]] = None
    listings: List[PublicListingCard] = []


def _mask_contact(value: Optional[str]) -> Optional[str]:
    """联系方式打码：仅保留结尾 4 位，中段用星号占位。

    留资 / 登录后才能看完整联系方式（贝壳口径）。未登录访客在详情页只能看到
    打码版，防止爬虫与匿名访客直接拿到经纪人真实电话去骚扰。
    """
    if not value:
        return value
    v = str(value).strip()
    if len(v) <= 4:
        # 过短就全打码，不泄露真实长度以外信息
        return "***"
    return f"{'*' * 3} {v[-4:]}"


class InquiryCreate(BaseModel):
    """匿名留资请求。"""

    name: str
    phone: str  # 匿名留资必须留手机号（贝壳口径），前端已做校验
    wechat_id: Optional[str] = None
    line_id: Optional[str] = None
    email: Optional[str] = None
    message: Optional[str] = None
    listing_id: Optional[uuid.UUID] = None
    property_id: Optional[uuid.UUID] = None
    project_id: Optional[uuid.UUID] = None
    school_id: Optional[uuid.UUID] = None
    source: str = "listing_detail"


class InquiryOut(BaseModel):
    """留资响应。不返回线索内部细节，避免被当接口探测。"""

    model_config = ConfigDict(extra="allow")

    ok: bool = True
    id: Optional[uuid.UUID] = None


# ==================== 内部工具 ====================


def _cover(photos: Any) -> Optional[str]:
    """从 photos 字段里取第一张图作为封面。

    photos 历史上出现过纯字符串列表与 {url/path} 字典列表两种形态，两种都兼容。
    """
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
    return value.value if hasattr(value, "value") else str(value)


def _sort_key_price(listing: Listing) -> float:
    """按业务类型取价格（租=月租、售=挂牌价），空值排到最后。"""
    price = (
        listing.monthly_rent
        if listing.listing_type == ListingType.rent
        else listing.asking_price
    )
    return price if price is not None else float("inf")


def _build_card(
    listing: Listing,
    prop: Optional[Property],
    project: Optional[Project],
) -> PublicListingCard:
    """把 (上架单, 房源档案, 楼盘) 组装成 C 端卡片。

    价格口径：租用 `monthly_rent`、售用 `asking_price`，统一成 `price` 一个字段，
    前端不需要按业务类型分支。
    """
    price = (
        listing.monthly_rent
        if listing.listing_type == ListingType.rent
        else listing.asking_price
    )
    freshness = freshness_service.listing_freshness_payload(listing)
    return PublicListingCard(
        id=listing.id,
        property_id=listing.property_id,
        listing_type=_enum_value(listing.listing_type),
        property_type=_enum_value(prop.property_type) if prop else None,
        room_number=prop.room_number if prop else None,
        address=(prop.address if prop else None) or (project.address if project else None),
        district=project.district if project else None,
        city=project.city if project else None,
        project_id=project.id if project else None,
        project_name=project.name if project else None,
        price=price,
        currency=listing.currency or "THB",
        size_sqm=prop.size_sqm if prop else None,
        bedrooms=prop.bedrooms if prop else None,
        bathrooms=prop.bathrooms if prop else None,
        floor=prop.floor if prop else None,
        building=prop.building if prop else None,
        orientation=_enum_value(prop.orientation) if prop else None,
        decoration=_enum_value(prop.decoration) if prop else None,
        amenities=prop.amenities if prop else None,
        furnished=bool(prop.furnished) if prop else False,
        cover=_cover(prop.photos) if prop else None,
        video_url=prop.video_url if prop else None,
        listing_no=prop.listing_no if prop else None,
        updated_at=listing.updated_at,
        monthly_rent=listing.monthly_rent,
        asking_price=listing.asking_price,
        sale_price=listing.asking_price,
        photos=prop.photos if prop else None,
        status=_enum_value(prop.status) if prop else None,
        created_at=listing.created_at,
        verification_status=freshness["verification_status"],
        last_verified_at=listing.last_verified_at,
        verified_days_ago=(
            (datetime.utcnow() - listing.last_verified_at).days
            if listing.last_verified_at
            else None
        ),
    )


def _project_brief(
    project: Optional[Project], developer: Optional[Developer]
) -> Optional[PublicProjectBrief]:
    """楼盘 → 详情页的小区信息块。"""
    if not project:
        return None
    return PublicProjectBrief(
        id=project.id,
        name=project.name,
        address=project.address,
        district=project.district,
        city=project.city,
        lat=project.lat,
        lng=project.lng,
        total_units=project.total_units,
        total_buildings=project.total_buildings,
        total_floors=project.total_floors,
        parking_spaces=project.parking_spaces,
        completion_year=project.completion_year,
        open_date=project.open_date,
        management_fee_per_sqm=project.management_fee_per_sqm,
        avg_price=project.avg_price,
        tenure=_enum_value(project.tenure),
        foreign_quota_pct=project.foreign_quota_pct,
        developer_id=project.developer_id,
        developer_name=(developer.name if developer else None) or project.developer,
        amenities=project.amenities,
        payment_plan=project.payment_plan,
        nearest_subway=project.nearest_subway,
    )


def _listings_base_stmt():
    """公开可见的上架单基础查询：仅 active、未删除、未保鲜过期，带房源与楼盘。

    **保鲜过期不对外可见**：这是「真房源」的硬约束。除了 `Listing.status`
    被 Celery 置为 `expired`，这里还按 `next_revalidate_at` 做一次时间过滤——
    即使定时任务挂了，到期房源也会立刻从 C 端消失，不依赖 worker 是否存活。
    `next_revalidate_at` 为空（历史数据/尚未纳入保鲜）视为不过期。
    """
    cutoff = datetime.utcnow()
    return (
        select(Listing, Property, Project)
        .join(Property, Listing.property_id == Property.id)
        .outerjoin(Project, Property.project_id == Project.id)
        .where(
            Listing.deleted_at.is_(None),
            Listing.status == ListingStatus.active,
            or_(
                Listing.next_revalidate_at.is_(None),
                Listing.next_revalidate_at > cutoff,
            ),
            Property.deleted_at.is_(None),
        )
    )


def _nearby_schools(
    session: Session, lat: Optional[float], lng: Optional[float], limit: int = 6
) -> List[PublicNearbySchool]:
    """按距离取最近的若干所学校。

    房源坐标取自所属楼盘（Property 本身没有经纬度，这是既有数据模型的口径）。
    没有楼盘或楼盘没坐标时返回空——不猜、不糊。
    """
    if lat is None or lng is None:
        return []
    schools = session.exec(
        select(School).where(School.deleted_at.is_(None), School.lat.is_not(None), School.lng.is_not(None))
    ).all()
    scored: List[Tuple[float, School]] = []
    for school in schools:
        distance = haversine_km(lat, lng, school.lat, school.lng)
        scored.append((distance, school))
    scored.sort(key=lambda pair: pair[0])
    return [
        PublicNearbySchool(
            id=school.id,
            name=school.name,
            name_en=school.name_en,
            stage=_enum_value(school.stage),
            curriculum=_enum_value(school.curriculum),
            district=school.district,
            distance_km=round(distance, 2),
        )
        for distance, school in scored[:limit]
    ]


# ==================== 房源 ====================


class PublicMapPoint(BaseModel):
    """地图找房的房源点位（匿名可见）。

    房源表没有经纬度，坐标只能取自所属楼盘；楼盘未维护坐标的房源不上图——
    前端据此提示「未定位房源数」，不伪造位置。
    """

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    room_number: Optional[str] = None
    address: Optional[str] = None
    monthly_rent: float = 0
    currency: str = "THB"
    video_url: Optional[str] = None
    project_id: Optional[uuid.UUID] = None
    project_name: Optional[str] = None
    lat: float
    lng: float


@router.get("/map-points", response_model=List[PublicMapPoint])
def list_public_map_points(
    limit: int = Query(300, ge=1, le=1000),
    q: Optional[str] = Query(None, max_length=100, description="关键词：房号 / 地址 / 楼盘"),
    keywords: Optional[List[str]] = Query(None, description="同义词组，任一命中"),
    price_min: Optional[float] = Query(None, ge=0),
    price_max: Optional[float] = Query(None, ge=0),
    has_video: Optional[bool] = Query(None),
    session: Session = Depends(get_session),
):
    """公开地图点位：匿名可访问。

    站内 `/properties/map-points` 强制鉴权，未登录访客点「地图找房」必然 401——
    这是「浏览不需注册」在接口层漏掉的一处（前端路由放开了，数据仍被拦住）。
    可见性口径与 `/public/listings` 完全一致：只看 active 上架单。
    """
    base = _listings_base_stmt().where(
        Listing.listing_type == ListingType.rent,
        Project.lat.is_not(None),
        Project.lng.is_not(None),
    )
    conditions = []

    terms = [q.strip()] if q and q.strip() else []
    terms += [k.strip() for k in (keywords or []) if k and k.strip()]
    terms = list(dict.fromkeys(terms))[:20]
    for term in terms:
        pattern = f"%{term}%"
        conditions.append(
            Property.room_number.ilike(pattern)
            | Property.address.ilike(pattern)
            | Property.building.ilike(pattern)
            | Project.name.ilike(pattern)
            | Project.district.ilike(pattern)
            | Project.city.ilike(pattern)
        )
    if price_min is not None:
        conditions.append(Listing.monthly_rent >= price_min)
    if price_max is not None:
        conditions.append(Listing.monthly_rent <= price_max)
    if has_video:
        conditions.append(Property.video_url.is_not(None))
        conditions.append(Property.video_url != "")

    rows = session.exec(
        base.where(*conditions)
        .order_by(Listing.created_at.desc(), Listing.id)
        .limit(limit)
    ).all()
    return [
        PublicMapPoint(
            id=listing.id,
            room_number=prop.room_number,
            address=prop.address or (project.address if project else None),
            monthly_rent=listing.monthly_rent or 0,
            currency=prop.currency or "THB",
            video_url=prop.video_url,
            project_id=prop.project_id,
            project_name=project.name if project else None,
            lat=project.lat,
            lng=project.lng,
        )
        for listing, prop, project in rows
    ]


@router.get("/listings", response_model=Page[PublicListingCard])
def list_public_listings(
    pagination: PaginationParams = Depends(),
    listing_type: Optional[ListingType] = Query(None, description="rent / sell，不传=全部"),
    q: Optional[str] = Query(None, max_length=100, description="关键词"),
    keywords: Optional[List[str]] = Query(None, description="同义词组，任一命中"),
    district: Optional[str] = None,
    city: Optional[str] = None,
    project_id: Optional[uuid.UUID] = None,
    price_min: Optional[float] = Query(None, ge=0),
    price_max: Optional[float] = Query(None, ge=0),
    area_min: Optional[float] = Query(None, ge=0),
    area_max: Optional[float] = Query(None, ge=0),
    bedrooms_min: Optional[int] = Query(None, ge=0, le=20),
    bedrooms_max: Optional[int] = Query(None, ge=0, le=20),
    orientation: Optional[str] = None,
    decoration: Optional[str] = None,
    floor_level: Optional[str] = Query(
        None, pattern="^(low|mid|high)$",
        description="楼层段：low=1-5层 / mid=6-15层 / high=16层及以上",
    ),
    amenity: Optional[List[str]] = Query(
        None, description="配套设施（多选任一命中，如 aircon/pool/gym/parking/elevator/balcony）"
    ),
    status: Optional[str] = Query(
        None, description="房源状态（vacant/rented/renewing/maintenance）。卡片上本就展示，非敏感字段"
    ),
    has_video: Optional[bool] = Query(None),
    school_id: Optional[uuid.UUID] = Query(
        None, description="按学校找房：该校半径内房源（空间筛选，非标签筛选）"
    ),
    school_radius_km: float = Query(3.0, gt=0, le=20, description="学校半径，默认 3km"),
    sort: Optional[str] = Query(
        None,
        pattern="^(latest|price_asc|price_desc|area_desc|distance|relevance)$",
        description="排序。不传时：有关键词按相关性，否则按最新",
    ),
    session: Session = Depends(get_session),
):
    """公开房源列表。

    服务端分页 + 筛选（不再把全量数据拉到前端过滤——那是数据量上万后必崩的做法）。

    「按学校找房」走的是**空间筛选**：选一所学校 + 半径，返回该半径内的房源并附
    最近学校与距离。不做「学区房」布尔标签——泰国没有划片入学，国际学校是
    「付费 + 距离」逻辑，硬做一个标签无据可依。

    排序：显式传 `sort` 时按传入值；不传时，有关键词按**相关性**（命中房号/楼盘名
    权重更高，见 `services.search`），无关键词按最新。前端筛选栏默认会显式传
    `latest`，因此不会被这条默认口径意外改变行为。
    """
    base = _listings_base_stmt()
    conditions = []

    if listing_type:
        conditions.append(Listing.listing_type == listing_type)
    if project_id:
        conditions.append(Property.project_id == project_id)
    if district:
        conditions.append(Project.district == district)
    if city:
        conditions.append(Project.city == city)
    if orientation:
        conditions.append(Property.orientation == orientation)
    if decoration:
        conditions.append(Property.decoration == decoration)
    if floor_level == "low":
        conditions.append(Property.floor.between(1, 5))
    elif floor_level == "mid":
        conditions.append(Property.floor.between(6, 15))
    elif floor_level == "high":
        conditions.append(Property.floor >= 16)
    # 配套多选：任一命中即算（JSON 数组按文本模糊匹配，与「区域同义词」口径一致）
    if amenity:
        amenity_terms = [a.strip() for a in amenity if a and a.strip()]
        if amenity_terms:
            from sqlalchemy import cast, String
            conditions.append(
                or_(
                    *[
                        Property.amenities.cast(String).ilike(f"%{a}%")
                        for a in amenity_terms
                    ]
                )
            )
    if status:
        # 用枚举比对而非原样透传字符串：SQLAlchemy 的 Enum 列不接受非法取值，
        # 直接比较会抛 500；这里转成明确的 422。
        try:
            conditions.append(Property.status == PropertyStatus(status))
        except ValueError:
            raise HTTPException(status_code=422, detail="未知的房源状态")
    if has_video:
        conditions.append(Property.video_url.is_not(None))
        conditions.append(Property.video_url != "")

    # 价格口径随业务类型变化：租比月租、售比挂牌价
    price_column = (
        Listing.monthly_rent
        if listing_type == ListingType.rent
        else Listing.asking_price
    )
    if price_min is not None:
        conditions.append(price_column >= price_min)
    if price_max is not None:
        conditions.append(price_column <= price_max)
    if area_min is not None:
        conditions.append(Property.size_sqm >= area_min)
    if area_max is not None:
        conditions.append(Property.size_sqm <= area_max)
    if bedrooms_min is not None:
        conditions.append(Property.bedrooms >= bedrooms_min)
    if bedrooms_max is not None:
        conditions.append(Property.bedrooms <= bedrooms_max)

    # 关键词：房源自身字段或所属楼盘字段任一命中
    terms = [q.strip()] if q and q.strip() else []
    terms += [k.strip() for k in (keywords or []) if k and k.strip()]
    terms = list(dict.fromkeys(terms))[:20]
    for term in terms:
        pattern = f"%{term}%"
        conditions.append(
            Property.room_number.ilike(pattern)
            | Property.address.ilike(pattern)
            | Property.building.ilike(pattern)
            | Project.name.ilike(pattern)
            | Project.address.ilike(pattern)
            | Project.district.ilike(pattern)
            | Project.city.ilike(pattern)
        )

    # 排序
    sort = resolve_sort(sort, terms, allowed=_LISTING_SORTS)
    if sort == "price_asc":
        order_by = [price_column.asc()]
    elif sort == "price_desc":
        order_by = [price_column.desc()]
    elif sort == "area_desc":
        order_by = [Property.size_sqm.desc()]
    elif sort == "relevance":
        # 相关性只在「有关键词」时才有意义；terms 为空时退化为最新
        score = relevance_score(terms)
        order_by = [score.desc()] if score is not None else []
        order_by.append(Listing.created_at.desc())
    else:
        order_by = [Listing.created_at.desc()]
    order_by.append(Listing.id)

    # ---- 路径一：按学校找房（空间筛选）----
    if school_id:
        school = session.get(School, school_id)
        if not school or school.deleted_at:
            raise HTTPException(status_code=404, detail="School not found")
        if school.lat is None or school.lng is None:
            # 没有坐标就算不出距离，不能拿全量冒充满足条件的结果
            raise HTTPException(
                status_code=400, detail="该学校缺少经纬度，无法按距离筛选"
            )

        lat_min, lat_max, lng_min, lng_max = lat_lng_bounds(
            school.lat, school.lng, school_radius_km
        )
        stmt = (
            base.where(
                *conditions,
                Project.lat.is_not(None),
                Project.lng.is_not(None),
                Project.lat >= lat_min,
                Project.lat <= lat_max,
                Project.lng >= lng_min,
                Project.lng <= lng_max,
            )
            .limit(_SCHOOL_CANDIDATE_LIMIT)
        )
        rows = session.exec(stmt).all()

        # 精算距离并过滤（SQL 里没有 haversine，这一步必须在应用层做）
        within: List[Tuple[float, Listing, Property, Project]] = []
        for listing, prop, project in rows:
            distance = haversine_km(school.lat, school.lng, project.lat, project.lng)
            if distance <= school_radius_km:
                within.append((distance, listing, prop, project))

        # 学区场景下「相关性」无意义（用户的心智是「离学校多近」），
        # 因此 relevance 与 distance 一并走距离升序。
        if sort == "distance" or sort not in {"price_asc", "price_desc", "area_desc"}:
            within.sort(key=lambda row: row[0])
        elif sort == "area_desc":
            within.sort(key=lambda row: -(row[2].size_sqm or 0))
        else:
            reverse = sort == "price_desc"
            within.sort(key=lambda row: _sort_key_price(row[1]), reverse=reverse)

        total = len(within)
        start = pagination.offset
        page_rows = within[start : start + pagination.page_size]
        cards = []
        for distance, listing, prop, project in page_rows:
            card = _build_card(listing, prop, project)
            card.nearest_school_name = school.name
            card.nearest_school_km = round(distance, 2)
            cards.append(card)
        return paginate(cards, total, pagination)

    # ---- 路径二：常规筛选（SQL 分页）----
    stmt = base.where(*conditions).order_by(*order_by)
    count_stmt = select(func.count()).select_from(
        base.where(*conditions).order_by(None).subquery()
    )
    total = session.exec(count_stmt).one()
    rows = session.exec(stmt.offset(pagination.offset).limit(pagination.limit)).all()
    cards = [_build_card(listing, prop, project) for listing, prop, project in rows]
    return paginate(cards, total, pagination)


@router.get("/listings/{listing_id}", response_model=PublicListingDetail)
def get_public_listing(
    listing_id: uuid.UUID,
    request: Request,
    session: Session = Depends(get_session),
):
    """公开房源详情：含楼盘信息块、周边学校距离、经纪人卡片、留资所需的编号。

    **联系方式脱敏（贝壳口径）**：浏览可免登录，但经纪人电话 / WeChat / LINE /
    WhatsApp 属敏感联系方式，未登录（无有效 Authorization 头）时返回打码版——
    只有留资或登录后才能看到完整号码。接口本身不强制鉴权，真正做到「浏览免费、
    显联系需留资」。
    """
    # permissive auth：读 Authorization 头，有有效 token 才算已登录；缺失/无效都不报错
    is_authenticated = False
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()
        if token:
            try:
                user_from_token(token, session)
                is_authenticated = True
            except HTTPException:
                is_authenticated = False

    row = session.exec(
        _listings_base_stmt().where(Listing.id == listing_id)
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Listing not found")

    listing, prop, project = row
    developer = session.get(Developer, project.developer_id) if (project and project.developer_id) else None
    card = _build_card(listing, prop, project)

    lat = project.lat if project else None
    lng = project.lng if project else None

    # 未登录取打码版联系方式，登录后给完整版
    def _mask(v):
        return v if is_authenticated else _mask_contact(v)

    broker = None
    if any(
        [
            listing.broker_company,
            listing.broker_real_name,
            listing.broker_phone,
            listing.broker_wechat,
            listing.broker_line,
            listing.broker_whatsapp,
        ]
    ):
        broker = PublicBrokerCard(
            company=listing.broker_company,
            real_name=listing.broker_real_name,
            phone=_mask(listing.broker_phone),
            wechat=_mask(listing.broker_wechat),
            line=_mask(listing.broker_line),
            whatsapp=_mask(listing.broker_whatsapp),
        )

    # 注意：card 里已经有 photos（列表页的封面口径），详情页要的是完整相册。
    # 必须先在 dict 上覆盖，不能作为第二个关键字再传一次——
    # 那会直接 `TypeError: got multiple values for keyword argument 'photos'`，
    # 把整个详情接口打成 500，而前端只看得到「房源不存在」。
    data = card.model_dump()
    data["photos"] = (prop.photos or []) if prop else []

    return PublicListingDetail(
        **data,
        description=prop.description if prop else None,
        deposit_amount=prop.deposit_amount if prop else None,
        deposit_months=prop.deposit_months if prop else None,
        lat=lat,
        lng=lng,
        project=_project_brief(project, developer),
        nearby_schools=_nearby_schools(session, lat, lng),
        broker=broker,
        mandate_type=_enum_value(listing.mandate_type),
    )


# ==================== 相似房源推荐 ====================


def _similar_score(
    base: Tuple[Listing, Property, Project],
    cand: Tuple[Listing, Property, Project],
) -> float:
    """相似度打分（仅用于排序，无业务含义）。

    权重取「同源不同量级」的加分：同楼盘最像，其次是同楼盘形态 / 同区 /
    户型一致 / 面积与租金贴近。不加分项一律 0——不做惩罚，避免负分干扰排序。
    """
    _, base_prop, base_proj = base
    _, cand_prop, cand_proj = cand

    score = 0.0
    # 同楼盘：最优先（同一栋、同一个物业标准，租客常整栋对比）
    if base_proj and cand_proj and base_proj.id == cand_proj.id:
        score += 5
    if base_prop and cand_prop:
        # 户型一致 +4
        if base_prop.property_type == cand_prop.property_type:
            score += 4
        # 卧室数一致 +2，差 1 间 +1
        if base_prop.bedrooms is not None and cand_prop.bedrooms is not None:
            diff = abs(base_prop.bedrooms - cand_prop.bedrooms)
            score += 2 if diff == 0 else (1 if diff == 1 else 0)
        # 面积贴近：误差 ≤20% +1.5，≤40% +0.75
        if base_prop.size_sqm and cand_prop.size_sqm:
            ratio = abs(base_prop.size_sqm - cand_prop.size_sqm) / base_prop.size_sqm
            if ratio <= 0.2:
                score += 1.5
            elif ratio <= 0.4:
                score += 0.75
    # 同区（楼盘层级不同：退到区 +1.5，再退到城市 +0.5）
    if base_proj and cand_proj:
        if base_proj.district and base_proj.district == cand_proj.district:
            score += 1.5
        elif base_proj.city and base_proj.city == cand_proj.city:
            score += 0.5
    return score


@router.get("/listings/{listing_id}/similar", response_model=List[PublicListingCard])
def get_similar_listings(
    listing_id: uuid.UUID,
    limit: int = Query(6, ge=1, le=20),
    session: Session = Depends(get_session),
):
    """相似房源推荐（详情页「猜你喜欢 / 相似房源」）。

    **为什么做同源同区**：对「看过这套房」的用户，最自然的下一跳是在同一楼盘
    或同区里找「差不多」的替代（户型/面积/租金贴近）。跨城市、跨公寓 vs 别墅
    的推荐在找房场景没有体感，所以这里**不**做。

    打分逻辑见 `_similar_score`：同楼盘 / 同户型 / 卧室数贴近 / 面积贴近 /
    同区同城，几项累加后取前 N。为控制候选规模，先用 SQL 把候选收敛到
    「同楼盘 或 同区 或 同户型」三选一，再在应用层打分——房子多起来后，
    「全区全户型全楼盘」的无差别遍历每进一次详情页就来一次，扛不住。
    """
    row = session.exec(_listings_base_stmt().where(Listing.id == listing_id)).first()
    if not row:
        raise HTTPException(status_code=404, detail="Listing not found")
    _, base_prop, base_proj = row

    # 候选收敛：至少与当前房源「同楼盘 / 同区 / 同户型」沾边，并排除自身。
    #
    # 这三个条件是**或**关系（见上方 docstring）：现实里「同户型但不同楼盘」
    # 「同区但不同户型」都算可选替代。此前写成 `where(*prefilters)`（SQLAlchemy
    # 的 where(*args) 是 AND 语义），候选被压成「同楼盘 且 同户型」，
    # 绝大多数房源因此返回空列表，相似推荐形同失效。
    affinity = []
    if base_prop and base_prop.project_id:
        affinity.append(Property.project_id == base_prop.project_id)
    if base_prop and base_prop.property_type:
        affinity.append(Property.property_type == base_prop.property_type)
    if base_proj and base_proj.district:
        affinity.append(Project.district == base_proj.district)
    elif base_proj and base_proj.city:
        affinity.append(Project.city == base_proj.city)

    stmt = _listings_base_stmt().where(Listing.id != listing_id)
    if affinity:
        stmt = stmt.where(or_(*affinity))
    rows = session.exec(
        stmt.order_by(Listing.created_at.desc()).limit(300)
    ).all()

    scored = [
        (_similar_score(row, cand), cand)
        for cand in rows
        if cand[1].id != row[1].id
    ]
    scored.sort(key=lambda pair: pair[0], reverse=True)
    return [_build_card(cand[0], cand[1], cand[2]) for score, cand in scored[:limit]]


# ==================== 学校（学区找房）====================


@router.get("/schools", response_model=Page[PublicSchoolCard])
def list_public_schools(
    pagination: PaginationParams = Depends(),
    q: Optional[str] = Query(None, max_length=100),
    stage: Optional[str] = None,
    curriculum: Optional[str] = None,
    district: Optional[str] = None,
    city: Optional[str] = None,
    session: Session = Depends(get_session),
):
    """学校列表：学区找房的一级入口。"""
    conditions = [School.deleted_at.is_(None)]
    if stage:
        conditions.append(School.stage == stage)
    if curriculum:
        conditions.append(School.curriculum == curriculum)
    if district:
        conditions.append(School.district == district)
    if city:
        conditions.append(School.city == city)
    if q and q.strip():
        pattern = f"%{q.strip()}%"
        conditions.append(
            School.name.ilike(pattern)
            | School.name_en.ilike(pattern)
            | School.address.ilike(pattern)
            | School.district.ilike(pattern)
        )

    stmt = (
        select(School)
        .where(*conditions)
        .order_by(School.sort_weight.desc(), School.name)
    )
    count_stmt = select(func.count()).select_from(
        select(School).where(*conditions).subquery()
    )
    total = session.exec(count_stmt).one()
    schools = session.exec(
        stmt.offset(pagination.offset).limit(pagination.limit)
    ).all()
    cards = [
        PublicSchoolCard(
            id=school.id,
            name=school.name,
            name_en=school.name_en,
            stage=_enum_value(school.stage),
            curriculum=_enum_value(school.curriculum),
            district=school.district,
            city=school.city,
            address=school.address,
            lat=school.lat,
            lng=school.lng,
            student_count=school.student_count,
            age_range=school.age_range,
            tuition_range=school.tuition_range,
            phone=school.phone,
            website=school.website,
            cover_url=school.cover_url,
        )
        for school in schools
    ]
    return paginate(cards, total, pagination)


@router.get("/schools/{school_id}", response_model=PublicSchoolDetail)
def get_public_school(
    school_id: uuid.UUID,
    radius_km: float = Query(5.0, gt=0, le=20),
    limit: int = Query(12, ge=1, le=50),
    session: Session = Depends(get_session),
):
    """学校详情 + **该校周边在售/在租房源**。

    这一页是学区找房的真正入口：用户从「想让孩子上这所学校」出发反查房子，
    而不是从「筛一套房」出发。老站的学校页正是这么做的。
    """
    school = session.get(School, school_id)
    if not school or school.deleted_at:
        raise HTTPException(status_code=404, detail="School not found")

    nearby: List[PublicListingCard] = []
    if school.lat is not None and school.lng is not None:
        lat_min, lat_max, lng_min, lng_max = lat_lng_bounds(
            school.lat, school.lng, radius_km
        )
        rows = session.exec(
            _listings_base_stmt()
            .where(
                Project.lat.is_not(None),
                Project.lng.is_not(None),
                Project.lat >= lat_min,
                Project.lat <= lat_max,
                Project.lng >= lng_min,
                Project.lng <= lng_max,
            )
            .limit(_SCHOOL_CANDIDATE_LIMIT)
        ).all()
        scored: List[Tuple[float, Listing, Property, Project]] = []
        for listing, prop, project in rows:
            distance = haversine_km(school.lat, school.lng, project.lat, project.lng)
            if distance <= radius_km:
                scored.append((distance, listing, prop, project))
        scored.sort(key=lambda row: row[0])
        for distance, listing, prop, project in scored[:limit]:
            card = _build_card(listing, prop, project)
            card.nearest_school_name = school.name
            card.nearest_school_km = round(distance, 2)
            nearby.append(card)

    return PublicSchoolDetail(
        id=school.id,
        name=school.name,
        name_en=school.name_en,
        stage=_enum_value(school.stage),
        curriculum=_enum_value(school.curriculum),
        district=school.district,
        city=school.city,
        address=school.address,
        lat=school.lat,
        lng=school.lng,
        student_count=school.student_count,
        age_range=school.age_range,
        tuition_range=school.tuition_range,
        phone=school.phone,
        website=school.website,
        cover_url=school.cover_url,
        description=school.description,
        photos=school.photos,
        nearby_listings=nearby,
    )


# ==================== 小区 ====================


def _project_aggregates(
    session: Session, project_ids: List[uuid.UUID]
) -> Dict[uuid.UUID, Dict[str, Any]]:
    """批量统计各小区的「售 N 间 / 租 N 间 + 最低最高价」。

    用两条 group by 查询一次算完，避免在循环里按项目逐个查（N+1 放大）。
    """
    if not project_ids:
        return {}
    result: Dict[uuid.UUID, Dict[str, Any]] = {}

    def _aggregate(listing_type: ListingType, price_column) -> None:
        rows = session.exec(
            select(
                Property.project_id,
                func.count(Listing.id),
                func.min(price_column),
                func.max(price_column),
            )
            .join(Property, Listing.property_id == Property.id)
            .where(
                Listing.deleted_at.is_(None),
                Listing.status == ListingStatus.active,
                Listing.listing_type == listing_type,
                Property.deleted_at.is_(None),
                Property.project_id.in_(project_ids),
            )
            .group_by(Property.project_id)
        ).all()
        for project_id, count, price_min, price_max in rows:
            bucket = result.setdefault(project_id, {})
            prefix = "sale" if listing_type == ListingType.sell else "rent"
            bucket[f"{prefix}_count"] = count
            bucket[f"{prefix}_price_min"] = price_min
            bucket[f"{prefix}_price_max"] = price_max

    _aggregate(ListingType.sell, Listing.asking_price)
    _aggregate(ListingType.rent, Listing.monthly_rent)
    return result


def _project_covers(
    session: Session, project_ids: List[uuid.UUID]
) -> Dict[uuid.UUID, str]:
    """取每个小区的一张房源图作封面（Project 自身没有图片字段）。"""
    if not project_ids:
        return {}
    rows = session.exec(
        select(Property.project_id, Property.photos)
        .where(
            Property.deleted_at.is_(None),
            Property.project_id.in_(project_ids),
            Property.photos.is_not(None),
        )
        .limit(max(len(project_ids) * 5, 50))
    ).all()
    covers: Dict[uuid.UUID, str] = {}
    for project_id, photos in rows:
        if project_id in covers:
            continue
        cover = _cover(photos)
        if cover:
            covers[project_id] = cover
    return covers


@router.get("/projects", response_model=Page[PublicProjectCard])
def list_public_projects(
    pagination: PaginationParams = Depends(),
    q: Optional[str] = Query(None, max_length=100),
    district: Optional[str] = None,
    city: Optional[str] = None,
    tenure: Optional[str] = None,
    developer_id: Optional[uuid.UUID] = None,
    session: Session = Depends(get_session),
):
    """小区（楼盘）列表：楼盘字典的对外展示面。"""
    conditions = [Project.deleted_at.is_(None)]
    if district:
        conditions.append(Project.district == district)
    if city:
        conditions.append(Project.city == city)
    if tenure:
        conditions.append(Project.tenure == tenure)
    if developer_id:
        conditions.append(Project.developer_id == developer_id)
    if q and q.strip():
        pattern = f"%{q.strip()}%"
        conditions.append(
            Project.name.ilike(pattern)
            | Project.address.ilike(pattern)
            | Project.district.ilike(pattern)
            | Project.city.ilike(pattern)
        )

    stmt = select(Project).where(*conditions).order_by(Project.name)
    count_stmt = select(func.count()).select_from(
        select(Project).where(*conditions).subquery()
    )
    total = session.exec(count_stmt).one()
    projects = session.exec(
        stmt.offset(pagination.offset).limit(pagination.limit)
    ).all()

    project_ids = [project.id for project in projects]
    aggregates = _project_aggregates(session, project_ids)
    covers = _project_covers(session, project_ids)

    developer_ids = [p.developer_id for p in projects if p.developer_id]
    developers: Dict[uuid.UUID, Developer] = {}
    if developer_ids:
        for developer in session.exec(
            select(Developer).where(Developer.id.in_(developer_ids))
        ).all():
            developers[developer.id] = developer

    cards: List[PublicProjectCard] = []
    for project in projects:
        stats = aggregates.get(project.id, {})
        developer = developers.get(project.developer_id) if project.developer_id else None
        cards.append(
            PublicProjectCard(
                id=project.id,
                name=project.name,
                address=project.address,
                district=project.district,
                city=project.city,
                lat=project.lat,
                lng=project.lng,
                cover=covers.get(project.id),
                total_units=project.total_units,
                completion_year=project.completion_year,
                tenure=_enum_value(project.tenure),
                developer_name=(developer.name if developer else None) or project.developer,
                sale_count=stats.get("sale_count", 0) or 0,
                rent_count=stats.get("rent_count", 0) or 0,
                sale_price_min=stats.get("sale_price_min"),
                sale_price_max=stats.get("sale_price_max"),
                rent_price_min=stats.get("rent_price_min"),
                rent_price_max=stats.get("rent_price_max"),
            )
        )
    return paginate(cards, total, pagination)


@router.get("/projects/{project_id}", response_model=PublicProjectDetail)
def get_public_project(
    project_id: uuid.UUID,
    listing_limit: int = Query(20, ge=1, le=100),
    session: Session = Depends(get_session),
):
    """小区详情 + 该小区在售/在租列表。"""
    project = session.get(Project, project_id)
    if not project or project.deleted_at:
        raise HTTPException(status_code=404, detail="Project not found")

    developer = (
        session.get(Developer, project.developer_id) if project.developer_id else None
    )
    aggregates = _project_aggregates(session, [project.id])
    stats = aggregates.get(project.id, {})

    rows = session.exec(
        _listings_base_stmt()
        .where(Property.project_id == project.id)
        .order_by(Listing.created_at.desc())
        .limit(listing_limit)
    ).all()
    listings = [_build_card(listing, prop, proj) for listing, prop, proj in rows]

    return PublicProjectDetail(
        id=project.id,
        name=project.name,
        address=project.address,
        district=project.district,
        city=project.city,
        lat=project.lat,
        lng=project.lng,
        cover=_project_covers(session, [project.id]).get(project.id),
        total_units=project.total_units,
        completion_year=project.completion_year,
        tenure=_enum_value(project.tenure),
        developer_name=(developer.name if developer else None) or project.developer,
        sale_count=stats.get("sale_count", 0) or 0,
        rent_count=stats.get("rent_count", 0) or 0,
        sale_price_min=stats.get("sale_price_min"),
        sale_price_max=stats.get("sale_price_max"),
        rent_price_min=stats.get("rent_price_min"),
        rent_price_max=stats.get("rent_price_max"),
        total_buildings=project.total_buildings,
        total_floors=project.total_floors,
        parking_spaces=project.parking_spaces,
        management_fee_per_sqm=project.management_fee_per_sqm,
        avg_price=project.avg_price,
        foreign_quota_pct=project.foreign_quota_pct,
        amenities=project.amenities,
        payment_plan=project.payment_plan,
        listings=listings,
    )


# ==================== 开发商 ====================


@router.get("/developers", response_model=Page[PublicProjectCard])
def list_public_developers(
    pagination: PaginationParams = Depends(),
    q: Optional[str] = Query(None, max_length=100),
    session: Session = Depends(get_session),
):
    """开发商列表。返回结构复用项目卡片：`name` 为开发商名，附旗下项目数。"""
    conditions = [Developer.deleted_at.is_(None)]
    if q and q.strip():
        pattern = f"%{q.strip()}%"
        conditions.append(
            Developer.name.ilike(pattern) | Developer.name_en.ilike(pattern)
        )

    stmt = (
        select(Developer)
        .where(*conditions)
        .order_by(Developer.sort_weight.desc(), Developer.name)
    )
    count_stmt = select(func.count()).select_from(
        select(Developer).where(*conditions).subquery()
    )
    total = session.exec(count_stmt).one()
    developers = session.exec(
        stmt.offset(pagination.offset).limit(pagination.limit)
    ).all()

    developer_ids = [developer.id for developer in developers]
    project_counts: Dict[uuid.UUID, int] = {}
    if developer_ids:
        rows = session.exec(
            select(Project.developer_id, func.count(Project.id))
            .where(
                Project.deleted_at.is_(None),
                Project.developer_id.in_(developer_ids),
            )
            .group_by(Project.developer_id)
        ).all()
        project_counts = {developer_id: count for developer_id, count in rows}

    cards = [
        PublicProjectCard(
            id=developer.id,
            name=developer.name,
            address=developer.address,
            district=developer.district,
            city=developer.city,
            lat=developer.lat,
            lng=developer.lng,
            cover=developer.logo_url,
            # 复用字段承载「旗下项目数」，避免为开发商单开一套 schema
            total_units=project_counts.get(developer.id, 0),
        )
        for developer in developers
    ]
    return paginate(cards, total, pagination)


@router.get("/developers/{developer_id}")
def get_public_developer(
    developer_id: uuid.UUID, session: Session = Depends(get_session)
):
    """开发商详情 + 旗下项目列表。

    三端暂无调用方（见 tests/tools_contract_check.py --orphans）：同 /public/developers，
    接口已就绪、C 端页面待建。
    """
    developer = session.get(Developer, developer_id)
    if not developer or developer.deleted_at:
        raise HTTPException(status_code=404, detail="Developer not found")

    projects = session.exec(
        select(Project)
        .where(Project.deleted_at.is_(None), Project.developer_id == developer.id)
        .order_by(Project.name)
    ).all()

    return {
        "id": developer.id,
        "name": developer.name,
        "name_en": developer.name_en,
        "name_th": developer.name_th,
        "phone": developer.phone,
        "fax": developer.fax,
        "email": developer.email,
        "website": developer.website,
        "address": developer.address,
        "district": developer.district,
        "city": developer.city,
        "lat": developer.lat,
        "lng": developer.lng,
        "logo_url": developer.logo_url,
        "stock_code": developer.stock_code,
        "description_zh": developer.description_zh,
        "description_en": developer.description_en,
        "projects": [
            {
                "id": project.id,
                "name": project.name,
                "address": project.address,
                "district": project.district,
                "city": project.city,
                "completion_year": project.completion_year,
                "total_units": project.total_units,
                "tenure": _enum_value(project.tenure),
            }
            for project in projects
        ],
    }


# ==================== 留资（匿名）====================


@router.post("/inquiries", response_model=InquiryOut)
@limiter.limit(AUTH_LIMIT)
def create_public_inquiry(
    request: Request,
    payload: InquiryCreate,
    session: Session = Depends(get_session),
):
    """匿名留资：把 C 端流量接进现有 CRM（`Lead`）。

    **这是之前完全断掉的一环**：`leads` 的写入原本要求 `require_agent`，
    而 C 端没有任何入口能触达，于是整套 CRM 是空转的。

    安全与合规：
    - 限流，防批量灌水（与登录同级限额）；
    - 只写入 Lead，不返回内部字段；
    - 手机号/微信等属个人信息，落库后由 PDPA 流程统一管理（项目已有三件套）。
    """
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")
    # 至少要留一个可回联方式，否则这条线索是废的
    if not any(
        [
            (payload.phone or "").strip(),
            (payload.wechat_id or "").strip(),
            (payload.line_id or "").strip(),
            (payload.email or "").strip(),
        ]
    ):
        raise HTTPException(
            status_code=400, detail="请至少留下一种联系方式（电话 / 微信 / LINE / 邮箱）"
        )

    # 把来源上下文（房源/楼盘/学校）结构化存进感兴趣的标的，便于运营判断意图
    targets: List[Dict[str, Any]] = []
    if payload.listing_id:
        listing = session.get(Listing, payload.listing_id)
        if listing and not listing.deleted_at:
            prop = session.get(Property, listing.property_id)
            project = session.get(Project, prop.project_id) if (prop and prop.project_id) else None
            targets.append(
                {
                    "type": "listing",
                    "listing_id": str(listing.id),
                    "property_id": str(listing.property_id),
                    "listing_type": _enum_value(listing.listing_type),
                    "project_id": str(project.id) if project else None,
                    "project_name": project.name if project else None,
                }
            )
    if payload.school_id:
        school = session.get(School, payload.school_id)
        if school:
            targets.append(
                {"type": "school", "school_id": str(school.id), "school_name": school.name}
            )
    if payload.project_id and not any(t.get("type") == "listing" for t in targets):
        project = session.get(Project, payload.project_id)
        if project:
            targets.append(
                {"type": "project", "project_id": str(project.id), "project_name": project.name}
            )

    lead = Lead(
        name=name,
        phone=(payload.phone or "").strip() or None,
        wechat_id=(payload.wechat_id or "").strip() or None,
        line_id=(payload.line_id or "").strip() or None,
        email=(payload.email or "").strip() or None,
        notes=(payload.message or "").strip() or None,
        interested_projects=targets or None,
        stage=LeadStage.inquiring,
        source=payload.source or "listing_detail",
    )
    session.add(lead)
    publish_event(
        session,
        "lead.created",
        "lead",
        lead.id,
        {
            "name": lead.name,
            "stage": lead.stage.value,
            "source": lead.source,
            "channel": "public_inquiry",
        },
    )
    session.commit()
    session.refresh(lead)
    logger.info("public.inquiry.created", lead_id=str(lead.id), source=lead.source)
    return InquiryOut(ok=True, id=lead.id)


# ==================== 汇率（双币展示的数据源）====================


@router.get("/exchange-rates")
def get_public_exchange_rates():
    """公开汇率。

    C 端列表与详情页要做「泰铢 + 人民币」双币并排（中国客户对泰铢没有价格体感），
    而汇率数据必须在**服务端统一**：此前前端 `lib/money.ts` 各自硬编码
    `CNY = 5.2`，与市场实际约 4.97 偏离 4.6%，等于把报价算错。

    汇率口径：`rates_to_thb[XXX]` 表示「1 单位 XXX 折合多少泰铢」，与
    `app.services.pricing.CURRENCY_TO_THB` 及前端 `convertCurrency` 的分母一致。
    """
    from app.services.pricing import CURRENCY_TO_THB

    return {
        "base": "THB",
        "rates_to_thb": CURRENCY_TO_THB,
        "supported": list(CURRENCY_TO_THB.keys()),
    }
