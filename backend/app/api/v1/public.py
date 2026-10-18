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
from datetime import datetime, timedelta
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
    PropertyDeal,
    PropertyDealStatus,
    PropertyStatus,
    School,
    ViewingAppointment,
    ViewingStatus,
)
from app.providers.geo import haversine_km, lat_lng_bounds
from app.services import freshness_service
from app.services.search import relevance_score, resolve_sort

logger = get_logger(__name__)

router = APIRouter(prefix="/public", tags=["public"])

# /public/listings 支持的排序取值。relevance 不在前端筛选栏里也允许传：
# 关键词搜索时它是「不显式指定排序」的默认口径。
_LISTING_SORTS = ["latest", "price_asc", "price_desc", "area_desc", "distance", "relevance"]

# 商业/工业物业类型：C 端「商铺办公」（office/shop/commercial）与「厂房」（factory）。
# 这些类目的卡片展示日租金/㎡ 与层高/荷载等工业口径字段（住宅类目不展示）。
_COMMERCIAL_TYPES = {"office", "shop", "commercial", "factory"}

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
    # 购房业务口径：新房/二手房（仅 sell 有意义）
    is_new_development: Optional[bool] = None
    room_number: Optional[str] = None
    address: Optional[str] = None
    district: Optional[str] = None
    city: Optional[str] = None
    project_id: Optional[uuid.UUID] = None
    project_name: Optional[str] = None
    # 坐标取自所属楼盘（Property 本身没有经纬度）——C 端「附近/离我最近」排序需要
    lat: Optional[float] = None
    lng: Optional[float] = None
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
    # VR 看房外链（对标贝壳「VR 看房」标签）：非空即 C 端可展示入口
    vr_url: Optional[str] = None
    # 运营标记：C 端「优选/严选」「房东直租」标签与筛选口径
    is_featured: bool = False
    owner_direct: bool = False
    listing_no: Optional[str] = None
    updated_at: Optional[datetime] = None
    # 竣工年份（来自所属楼盘）——C 端「二手房」卡片据此算楼龄
    completion_year: Optional[int] = None
    # 日租金/㎡：商业类目（写字楼/商铺/厂房）卡片展示，派生值 = 月租 / 面积 / 30。
    # 住宅类目返回 None（前端不展示该口径）。
    rent_per_sqm_day: Optional[float] = None
    # 商业/工业专项字段（写字楼/商铺/厂房卡片与筛选用，非敏感属性）
    ceiling_height_m: Optional[float] = None
    land_area_sqm: Optional[float] = None
    floor_loading_kg_sqm: Optional[float] = None
    column_spacing: Optional[str] = None
    power_capacity_kva: Optional[float] = None
    environmental_permit: Optional[bool] = None
    whole_floor_only: Optional[bool] = None
    whole_building_only: Optional[bool] = None
    company_registrable: Optional[bool] = None
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
    # 销售状态：pre_sale/on_sale/sold_out（新房页「在售/待售」口径）
    sale_status: Optional[str] = None
    # 最近地铁站（新房卡片展示「近地铁」标签）
    nearest_subway: Optional[str] = None
    sale_count: int = 0
    rent_count: int = 0
    sale_price_min: Optional[float] = None
    sale_price_max: Optional[float] = None
    rent_price_min: Optional[float] = None
    rent_price_max: Optional[float] = None
    # 新房页聚合（由该项目下的在售上架单实时算，非冗余列）
    listing_count: int = 0  # 在售套数
    recent_deal_count: int = 0  # 近 30 日成交套数
    size_min: Optional[float] = None  # 建面下限（㎡）
    size_max: Optional[float] = None  # 建面上限（㎡）
    bedroom_options: Optional[List[int]] = None  # 户型集合（如 [2,3]）


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


class PublicViewingCreate(BaseModel):
    """匿名预约看房请求（对标贝壳详情页「预约看房」）。

    `viewings` 表本就支持未注册访客（`requester_user_id` 可空 + `visitor_*`），
    但原接口 `POST /viewings` 强制 `get_current_user`，未登录访客必然 401——
    详情页的「预约看房」对未注册用户实际上是断的。本端点补上这条通路。
    """

    # 房源定位：二选一。`listing_id` 为首选（详情页拿到的是上架单 id），
    # 服务端据此解析出 active 上架单的 property_id；也可直接给 property_id。
    listing_id: Optional[uuid.UUID] = None
    property_id: Optional[uuid.UUID] = None
    name: str
    phone: str
    email: Optional[str] = None
    scheduled_at: datetime
    notes: Optional[str] = None


class PublicViewingOut(BaseModel):
    """匿名预约看房响应。只回执预约概要，不暴露内部字段。"""

    model_config = ConfigDict(extra="allow")

    ok: bool = True
    id: uuid.UUID
    property_id: uuid.UUID
    status: str
    scheduled_at: str


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
    # 日租金/㎡：仅商业类目（写字楼/商铺/厂房）且租单、面积>0 时才有口径
    rent_per_sqm_day: Optional[float] = None
    prop_type = _enum_value(prop.property_type) if prop else None
    if (
        prop_type in _COMMERCIAL_TYPES
        and listing.listing_type == ListingType.rent
        and listing.monthly_rent
        and prop
        and prop.size_sqm
        and prop.size_sqm > 0
    ):
        rent_per_sqm_day = round(listing.monthly_rent / prop.size_sqm / 30, 2)
    return PublicListingCard(
        id=listing.id,
        property_id=listing.property_id,
        listing_type=_enum_value(listing.listing_type),
        is_new_development=bool(listing.is_new_development),
        property_type=prop_type,
        room_number=prop.room_number if prop else None,
        address=(prop.address if prop else None) or (project.address if project else None),
        district=project.district if project else None,
        city=project.city if project else None,
        project_id=project.id if project else None,
        project_name=project.name if project else None,
        lat=project.lat if project else None,
        lng=project.lng if project else None,
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
        completion_year=project.completion_year if project else None,
        rent_per_sqm_day=rent_per_sqm_day,
        ceiling_height_m=prop.ceiling_height_m if prop else None,
        land_area_sqm=prop.land_area_sqm if prop else None,
        floor_loading_kg_sqm=prop.floor_loading_kg_sqm if prop else None,
        column_spacing=prop.column_spacing if prop else None,
        power_capacity_kva=prop.power_capacity_kva if prop else None,
        environmental_permit=prop.environmental_permit if prop else None,
        whole_floor_only=prop.whole_floor_only if prop else None,
        whole_building_only=prop.whole_building_only if prop else None,
        company_registrable=prop.company_registrable if prop else None,
        is_featured=bool(listing.is_featured),
        owner_direct=bool(listing.owner_direct),
        vr_url=prop.vr_url if prop else None,
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


_SLUG_STRIP = (" ", "-", ".", "'", "’", "_")


def slug_text(value: str) -> str:
    """城市名归一化：小写并去掉空格/连字符/点/撇号/下划线。

    为什么需要：客户端定位 Store 的城市标识是 `cityKey`（camelCase，如
    `chiangMai` / `hoChiMinh`），而库内的英文城市名是 `Chiang Mai` /
    `Ho Chi Minh`。两边归一化后都得到 `chiangmai` / `hochiminh`，因此
    C 端可以直接把 `cityKey` 当 `city` 参数传下来，不必再维护一张
    「35 个城市的别名映射表」——那张表迟早会和数据/客户端两头脱节。
    """
    return value.strip().lower().translate({ord(ch): None for ch in _SLUG_STRIP})


def slug_expr(column):
    """SQL 侧的同款归一化。

    只用 `lower` + `replace`，SQLite 与 PostgreSQL 行为一致；
    不用正则/`translate`，避免方言差异（项目里已经踩过 `func.date()` 的坑）。
    """
    expr = func.lower(column)
    for ch in _SLUG_STRIP:
        expr = func.replace(expr, ch, "")
    return expr


def _listing_visibility_conditions() -> List[Any]:
    """C 端可见性条件（单一来源，勿在各查询里各写一份）。

    **保鲜过期不对外可见**：这是「真房源」的硬约束。除了 `Listing.status`
    被 Celery 置为 `expired`，这里还按 `next_revalidate_at` 做一次时间过滤——
    即使定时任务挂了，到期房源也会立刻从 C 端消失，不依赖 worker 是否存活。
    `next_revalidate_at` 为空（历史数据/尚未纳入保鲜）视为不过期。
    """
    cutoff = datetime.utcnow()
    return [
        Listing.deleted_at.is_(None),
        Listing.status == ListingStatus.active,
        or_(
            Listing.next_revalidate_at.is_(None),
            Listing.next_revalidate_at > cutoff,
        ),
        Property.deleted_at.is_(None),
    ]


def _listings_base_stmt():
    """公开可见的上架单基础查询：仅 active、未删除、未保鲜过期，带房源与楼盘。"""
    return (
        select(Listing, Property, Project)
        .join(Property, Listing.property_id == Property.id)
        .outerjoin(Project, Property.project_id == Project.id)
        .where(*_listing_visibility_conditions())
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
    # 业务/类型：地图页要按租/售分别格式化价格，也要按类型区分图标
    listing_type: Optional[str] = None
    property_type: Optional[str] = None
    is_new_development: bool = False
    room_number: Optional[str] = None
    address: Optional[str] = None
    # 统一价格口径（租=月租、售=挂牌价），与列表卡片一致；monthly_rent 保留给既有地图页
    price: float = 0
    monthly_rent: float = 0
    currency: str = "THB"
    size_sqm: Optional[float] = None
    bedrooms: Optional[int] = None
    cover: Optional[str] = None
    video_url: Optional[str] = None
    vr_url: Optional[str] = None
    project_id: Optional[uuid.UUID] = None
    project_name: Optional[str] = None
    lat: float
    lng: float


@router.get("/map-points", response_model=List[PublicMapPoint])
def list_public_map_points(
    limit: int = Query(300, ge=1, le=1000),
    listing_type: Optional[ListingType] = Query(None, description="rent / sell，不传=全部"),
    property_type: Optional[List[str]] = Query(
        None, description="房源类型（多值，任一命中）：「商铺办公」传 office+shop，「厂房」传 factory"
    ),
    is_new_development: Optional[bool] = Query(None, description="新房/二手房标记"),
    district: Optional[str] = None,
    city: Optional[str] = Query(None, description="城市（按 slug 归一化比对，可传定位 cityKey）"),
    min_lat: Optional[float] = Query(None, ge=-90, le=90, description="视野框南界"),
    max_lat: Optional[float] = Query(None, ge=-90, le=90, description="视野框北界"),
    min_lng: Optional[float] = Query(None, ge=-180, le=180, description="视野框西界"),
    max_lng: Optional[float] = Query(None, ge=-180, le=180, description="视野框东界"),
    q: Optional[str] = Query(None, max_length=100, description="关键词：房号 / 地址 / 楼盘"),
    keywords: Optional[List[str]] = Query(None, description="同义词组，任一命中"),
    price_min: Optional[float] = Query(None, ge=0),
    price_max: Optional[float] = Query(None, ge=0),
    has_video: Optional[bool] = Query(None),
    has_vr: Optional[bool] = Query(None),
    is_featured: Optional[bool] = Query(None),
    owner_direct: Optional[bool] = Query(None),
    session: Session = Depends(get_session),
):
    """公开地图点位：匿名可访问，覆盖全部 C 端业务（租 / 售 / 新房 / 二手房 / 商办 / 厂房）。

    站内 `/properties/map-points` 强制鉴权，未登录访客点「地图找房」必然 401——
    这是「浏览不需注册」在接口层漏掉的一处（前端路由放开了，数据仍被拦住）。
    可见性口径与 `/public/listings` 完全一致（`_listing_visibility_conditions`）。

    此前这里写死了 `listing_type == rent`，导致二手房/商铺办公/厂房的地图找房
    根本没有数据面。现在按业务透传，并支持**视野框**（min/max lat/lng）——
    地图拖动/缩放后只拉当前视野内的点，不再一次性把全城点位拉回前端。
    """
    base = _listings_base_stmt().where(
        Project.lat.is_not(None),
        Project.lng.is_not(None),
    )
    conditions = []

    if listing_type:
        conditions.append(Listing.listing_type == listing_type)
    if property_type:
        types = [t.strip() for t in property_type if t and t.strip()]
        if types:
            conditions.append(Property.property_type.in_(types))
    if is_new_development is not None:
        conditions.append(Listing.is_new_development == is_new_development)
    if district:
        conditions.append(Project.district == district)
    if city:
        conditions.append(slug_expr(Project.city) == slug_text(city))
    # 视野框：只给全的四个边界才生效（缺边界会切掉整屏点位，不如不筛）
    if None not in (min_lat, max_lat, min_lng, max_lng):
        conditions.append(Project.lat.between(min_lat, max_lat))
        conditions.append(Project.lng.between(min_lng, max_lng))

    terms = [q.strip()] if q and q.strip() else []
    terms += [k.strip() for k in (keywords or []) if k and k.strip()]
    # 单字符关键词（如 "a"）近乎全量命中，丢弃；全部丢弃则按无关键词处理
    terms = [t for t in terms if len(t) >= 2]
    terms = list(dict.fromkeys(terms))[:20]
    # 同义词组「任一命中」：所有关键词合并为一个 OR 组（与 /properties 口径一致）
    if terms:
        conditions.append(
            or_(
                *[
                    Property.room_number.ilike(f"%{term}%")
                    | Property.address.ilike(f"%{term}%")
                    | Property.building.ilike(f"%{term}%")
                    | Project.name.ilike(f"%{term}%")
                    | Project.district.ilike(f"%{term}%")
                    | Project.city.ilike(f"%{term}%")
                    for term in terms
                ]
            )
        )
    # 价格口径与列表一致：租比月租、售比挂牌价
    price_column = (
        Listing.monthly_rent
        if listing_type == ListingType.rent
        else (Listing.asking_price if listing_type == ListingType.sell
              else func.coalesce(Listing.monthly_rent, Listing.asking_price))
    )
    if price_min is not None:
        conditions.append(price_column >= price_min)
    if price_max is not None:
        conditions.append(price_column <= price_max)
    if has_video:
        conditions.append(Property.video_url.is_not(None))
        conditions.append(Property.video_url != "")
    if has_vr:
        conditions.append(Property.vr_url.is_not(None))
        conditions.append(Property.vr_url != "")
    if is_featured:
        conditions.append(Listing.is_featured.is_(True))
    if owner_direct:
        conditions.append(Listing.owner_direct.is_(True))

    rows = session.exec(
        base.where(*conditions)
        .order_by(Listing.created_at.desc(), Listing.id)
        .limit(limit)
    ).all()
    return [
        PublicMapPoint(
            id=listing.id,
            listing_type=_enum_value(listing.listing_type),
            property_type=_enum_value(prop.property_type),
            is_new_development=bool(listing.is_new_development),
            room_number=prop.room_number,
            address=prop.address or (project.address if project else None),
            price=(
                listing.monthly_rent
                if listing.listing_type == ListingType.rent
                else listing.asking_price
            ) or 0,
            monthly_rent=listing.monthly_rent or 0,
            currency=listing.currency or prop.currency or "THB",
            size_sqm=prop.size_sqm,
            bedrooms=prop.bedrooms,
            cover=_cover(prop.photos),
            video_url=prop.video_url,
            vr_url=prop.vr_url,
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
    property_type: Optional[List[str]] = Query(
        None,
        description=(
            "房源类型（多值，任一命中）：apartment/condo/villa/house/office/shop/factory。"
            "「商铺办公」传 office+shop，「厂房」传 factory；不传=全部"
        ),
    ),
    is_new_development: Optional[bool] = Query(
        None, description="新房/二手房：true=新房（一手房），false=二手房，不传=全部"
    ),
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
    has_vr: Optional[bool] = Query(None, description="有 VR 看房（vr_url 非空）"),
    # C 端运营标记筛选（租房「房东直租」、商办/厂房「优选/严选」入口消费）
    is_featured: Optional[bool] = Query(None, description="优选/严选"),
    owner_direct: Optional[bool] = Query(None, description="房东直租"),
    # 商业/工业专项筛选（写字楼/商铺/厂房分类页的快捷标签消费）
    whole_floor_only: Optional[bool] = Query(None, description="仅整层出租"),
    whole_building_only: Optional[bool] = Query(None, description="仅整栋出租"),
    company_registrable: Optional[bool] = Query(None, description="可注册公司"),
    environmental_permit: Optional[bool] = Query(None, description="可办理环评"),
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
    # 房源类型：多值「任一命中」。「商铺办公」=office+shop 这类跨类型入口一次传入，
    # 避免前端为同一语义发多次请求再自行合并。
    if property_type:
        types = [t.strip() for t in property_type if t and t.strip()]
        if types:
            conditions.append(Property.property_type.in_(types))
    # 新房/二手房：按上架单标记过滤（资金/业务口径见 models/listing.py 注释）
    if is_new_development is not None:
        conditions.append(Listing.is_new_development == is_new_development)
    if project_id:
        conditions.append(Property.project_id == project_id)
    if district:
        conditions.append(Project.district == district)
    if city:
        # 城市按 slug 归一化比对：C 端传定位 Store 的 cityKey（chiangMai），
        # 库内存英文名（Chiang Mai），归一化后两边一致（见 slug_text 说明）。
        conditions.append(slug_expr(Project.city) == slug_text(city))
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
    if has_vr:
        conditions.append(Property.vr_url.is_not(None))
        conditions.append(Property.vr_url != "")
    # 运营标记：同样只在显式 True 时收敛（False/NULL 不参与过滤）
    if is_featured:
        conditions.append(Listing.is_featured.is_(True))
    if owner_direct:
        conditions.append(Listing.owner_direct.is_(True))
    # 商业/工业专项筛选：只在显式 True 时收敛（NULL=未录入，不等于「否」，
    # 避免把未录入的数据当成 false 筛掉）
    if whole_floor_only:
        conditions.append(Property.whole_floor_only.is_(True))
    if whole_building_only:
        conditions.append(Property.whole_building_only.is_(True))
    if company_registrable:
        conditions.append(Property.company_registrable.is_(True))
    if environmental_permit:
        conditions.append(Property.environmental_permit.is_(True))

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

    # 关键词：房源自身字段或所属楼盘字段任一命中；同义词组「任一命中」——
    # 所有关键词合并为一个 OR 组（与 /properties 口径一致）。
    # 单字符关键词（如 "a"）近乎全量命中，丢弃；全部丢弃则按无关键词处理
    terms = [q.strip()] if q and q.strip() else []
    terms += [k.strip() for k in (keywords or []) if k and k.strip()]
    terms = [t for t in terms if len(t) >= 2]
    terms = list(dict.fromkeys(terms))[:20]
    if terms:
        conditions.append(
            or_(
                *[
                    Property.room_number.ilike(f"%{term}%")
                    | Property.address.ilike(f"%{term}%")
                    | Property.building.ilike(f"%{term}%")
                    | Project.name.ilike(f"%{term}%")
                    | Project.address.ilike(f"%{term}%")
                    | Project.district.ilike(f"%{term}%")
                    | Project.city.ilike(f"%{term}%")
                    for term in terms
                ]
            )
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
    # lat/lng 同理：`_build_card` 已经写了这两个字段，重复作为关键字传入同样会
    # `TypeError: got multiple values for keyword argument 'lat'`，必须在 dict 上覆盖。
    data["lat"] = lat
    data["lng"] = lng

    return PublicListingDetail(
        **data,
        description=prop.description if prop else None,
        deposit_amount=prop.deposit_amount if prop else None,
        deposit_months=prop.deposit_months if prop else None,
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


def _project_listing_stats(
    session: Session, project_ids: List[uuid.UUID]
) -> Dict[uuid.UUID, Dict[str, Any]]:
    """在售上架单聚合：在售套数 / 建面区间 / 户型集合。

    新房页的楼盘卡片要展示「在售套数、建面 101-139㎡、3/4 居」。这些都由该项目下
    的在售上架单实时算出（不加冗余列，避免冗余数据不一致）。
    """
    if not project_ids:
        return {}
    result: Dict[uuid.UUID, Dict[str, Any]] = {}
    rows = session.exec(
        select(
            Property.project_id,
            func.count(Listing.id),
            func.min(Property.size_sqm),
            func.max(Property.size_sqm),
        )
        .join(Listing, Listing.property_id == Property.id)
        .where(
            Listing.deleted_at.is_(None),
            Listing.status == ListingStatus.active,
            Listing.listing_type == ListingType.sell,
            Property.deleted_at.is_(None),
            Property.project_id.in_(project_ids),
        )
        .group_by(Property.project_id)
    ).all()
    for project_id, count, size_min, size_max in rows:
        result[project_id] = {
            "listing_count": count or 0,
            "size_min": size_min,
            "size_max": size_max,
        }
    # 户型集合：group_concat 在各方言行为不一致，改为取 distinct 对再在应用层归并
    bedroom_rows = session.exec(
        select(Property.project_id, Property.bedrooms)
        .join(Listing, Listing.property_id == Property.id)
        .where(
            Listing.deleted_at.is_(None),
            Listing.status == ListingStatus.active,
            Listing.listing_type == ListingType.sell,
            Property.deleted_at.is_(None),
            Property.bedrooms.is_not(None),
            Property.project_id.in_(project_ids),
        )
        .distinct()
    ).all()
    for project_id, bedrooms in bedroom_rows:
        bucket = result.setdefault(project_id, {})
        bucket.setdefault("bedroom_options", set()).add(bedrooms)
    for bucket in result.values():
        options = bucket.get("bedroom_options")
        if options:
            bucket["bedroom_options"] = sorted(options)
    return result


def _project_recent_deals(
    session: Session, project_ids: List[uuid.UUID], days: int = 30
) -> Dict[uuid.UUID, int]:
    """近 N 日成交套数（按项目聚合），默认 30 天。

    「成交」以产权成交单（`property_deals`）为准：completed 状态且最近更新落在窗口内。
    无成交的项目返回 0 —— 不编造热度。
    """
    if not project_ids:
        return {}
    cutoff = datetime.utcnow() - timedelta(days=days)
    rows = session.exec(
        select(Property.project_id, func.count(PropertyDeal.id))
        .join(Property, PropertyDeal.property_id == Property.id)
        .where(
            PropertyDeal.deleted_at.is_(None),
            PropertyDeal.status == PropertyDealStatus.completed,
            PropertyDeal.updated_at >= cutoff,
            Property.deleted_at.is_(None),
            Property.project_id.in_(project_ids),
        )
        .group_by(Property.project_id)
    ).all()
    return {project_id: count or 0 for project_id, count in rows}


@router.get("/projects", response_model=Page[PublicProjectCard])
def list_public_projects(
    pagination: PaginationParams = Depends(),
    q: Optional[str] = Query(None, max_length=100),
    district: Optional[str] = None,
    city: Optional[str] = None,
    tenure: Optional[str] = None,
    developer_id: Optional[uuid.UUID] = None,
    sale_status: Optional[str] = Query(
        None, pattern="^(pre_sale|on_sale|sold_out)$",
        description="销售状态：pre_sale 待售 / on_sale 在售 / sold_out 售罄",
    ),
    has_listings: Optional[bool] = Query(
        None, description="是否有在售上架单：true=在售楼盘，false=无在售上架单的楼盘"
    ),
    price_min: Optional[float] = Query(None, ge=0, description="均价下限（泰铢/㎡）"),
    price_max: Optional[float] = Query(None, ge=0, description="均价上限（泰铢/㎡）"),
    sort: Optional[str] = Query(
        None, pattern="^(hot|price_asc|price_desc|open_date_desc)$",
        description="排序：hot 近30天成交热度 / price_asc / price_desc / open_date_desc；不传=按名称",
    ),
    session: Session = Depends(get_session),
):
    """楼盘列表（新房分类页的数据面）。

    在原有小区列表基础上补齐新房页所需：销售状态 / 是否在售筛选、均价区间、
    热度与价格排序，以及卡片上的**实时聚合**（在售套数、建面区间、户型集合、
    近 7 日成交套数）。筛选与排序全部在服务端完成，前端不做二次过滤。
    """
    conditions = [Project.deleted_at.is_(None)]
    if district:
        conditions.append(Project.district == district)
    if city:
        # 城市按 slug 归一化比对：C 端传定位 Store 的 cityKey（chiangMai），
        # 库内存英文名（Chiang Mai），归一化后两边一致（见 slug_text 说明）。
        conditions.append(slug_expr(Project.city) == slug_text(city))
    if tenure:
        conditions.append(Project.tenure == tenure)
    if developer_id:
        conditions.append(Project.developer_id == developer_id)
    if sale_status:
        conditions.append(Project.sale_status == sale_status)
    if price_min is not None:
        conditions.append(Project.avg_price >= price_min)
    if price_max is not None:
        conditions.append(Project.avg_price <= price_max)
    if q and q.strip():
        pattern = f"%{q.strip()}%"
        conditions.append(
            Project.name.ilike(pattern)
            | Project.address.ilike(pattern)
            | Project.district.ilike(pattern)
            | Project.city.ilike(pattern)
        )

    # 「有在售上架单的项目 id」子查询：供 has_listings 过滤（不改变总行数口径）
    active_sell_sub = (
        select(Property.project_id)
        .join(Listing, Listing.property_id == Property.id)
        .where(
            Listing.deleted_at.is_(None),
            Listing.status == ListingStatus.active,
            Listing.listing_type == ListingType.sell,
            Property.deleted_at.is_(None),
            Property.project_id.is_not(None),
        )
        .distinct()
        .subquery()
    )
    if has_listings is True:
        conditions.append(Project.id.in_(select(active_sell_sub.c.project_id)))
    elif has_listings is False:
        conditions.append(Project.id.not_in(select(active_sell_sub.c.project_id)))

    stmt = select(Project).where(*conditions)
    if sort == "hot":
        deal_sub = (
            select(
                Property.project_id.label("pid"),
                func.count(PropertyDeal.id).label("cnt"),
            )
            .join(Property, PropertyDeal.property_id == Property.id)
            .where(
                PropertyDeal.deleted_at.is_(None),
                PropertyDeal.status == PropertyDealStatus.completed,
                PropertyDeal.updated_at >= datetime.utcnow() - timedelta(days=30),
                Property.deleted_at.is_(None),
                Property.project_id.is_not(None),
            )
            .group_by(Property.project_id)
            .subquery()
        )
        stmt = stmt.outerjoin(deal_sub, deal_sub.c.pid == Project.id).order_by(
            func.coalesce(deal_sub.c.cnt, 0).desc(), Project.name
        )
    elif sort == "price_asc":
        stmt = stmt.order_by(
            Project.avg_price.is_(None), Project.avg_price.asc(), Project.name
        )
    elif sort == "price_desc":
        stmt = stmt.order_by(
            Project.avg_price.is_(None), Project.avg_price.desc(), Project.name
        )
    elif sort == "open_date_desc":
        stmt = stmt.order_by(
            Project.open_date.is_(None), Project.open_date.desc(), Project.name
        )
    else:
        stmt = stmt.order_by(Project.name)

    count_stmt = select(func.count()).select_from(
        select(Project).where(*conditions).subquery()
    )
    total = session.exec(count_stmt).one()
    projects = session.exec(
        stmt.offset(pagination.offset).limit(pagination.limit)
    ).all()

    project_ids = [project.id for project in projects]
    aggregates = _project_aggregates(session, project_ids)
    listing_stats = _project_listing_stats(session, project_ids)
    recent_deals = _project_recent_deals(session, project_ids)
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
        lstats = listing_stats.get(project.id, {})
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
                sale_status=project.sale_status,
                nearest_subway=project.nearest_subway,
                sale_count=stats.get("sale_count", 0) or 0,
                rent_count=stats.get("rent_count", 0) or 0,
                sale_price_min=stats.get("sale_price_min"),
                sale_price_max=stats.get("sale_price_max"),
                rent_price_min=stats.get("rent_price_min"),
                rent_price_max=stats.get("rent_price_max"),
                listing_count=lstats.get("listing_count", 0) or 0,
                recent_deal_count=recent_deals.get(project.id, 0),
                size_min=lstats.get("size_min"),
                size_max=lstats.get("size_max"),
                bedroom_options=lstats.get("bedroom_options") or None,
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
    lstats = _project_listing_stats(session, [project.id]).get(project.id, {})
    recent_deals = _project_recent_deals(session, [project.id])

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
        sale_status=project.sale_status,
        nearest_subway=project.nearest_subway,
        sale_count=stats.get("sale_count", 0) or 0,
        rent_count=stats.get("rent_count", 0) or 0,
        sale_price_min=stats.get("sale_price_min"),
        sale_price_max=stats.get("sale_price_max"),
        rent_price_min=stats.get("rent_price_min"),
        rent_price_max=stats.get("rent_price_max"),
        listing_count=lstats.get("listing_count", 0) or 0,
        recent_deal_count=recent_deals.get(project.id, 0),
        size_min=lstats.get("size_min"),
        size_max=lstats.get("size_max"),
        bedroom_options=lstats.get("bedroom_options") or None,
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


class PublicDistrictItem(BaseModel):
    """区域（区/商圈）筛选项 + 该区域的真实数据量。

    C 端分类页的「区域」下拉此前只能拿到 summary 里的前二区域，等于没法选。
    这里返回**当前筛选条件下全部有数据的区域**，并附房源量/楼盘量/均价，
    让前端能按热度排序、并按均价做行情对比。
    """

    model_config = ConfigDict(extra="allow")

    district: str
    listing_count: int = 0  # 在租/在售上架单数
    project_count: int = 0  # 楼盘数
    avg_price: Optional[float] = None  # 楼盘均价均值（泰铢/㎡），无均价楼盘不计入


class PublicCityItem(BaseModel):
    """有数据的城市项。

    `key` 是按 slug 归一化后的城市标识（`Chiang Mai` → `chiangmai`），
    与客户端定位 Store 的 `cityKey.toLowerCase()` 对齐，前端可直接做映射。
    """

    model_config = ConfigDict(extra="allow")

    key: str
    name: str
    listing_count: int = 0
    project_count: int = 0


@router.get("/districts", response_model=List[PublicDistrictItem])
def list_public_districts(
    city: Optional[str] = Query(None, description="城市（slug 归一化比对，可传定位 cityKey）"),
    listing_type: Optional[ListingType] = Query(None, description="rent / sell，不传=全部"),
    property_type: Optional[List[str]] = Query(None, description="房源类型（多值，任一命中）"),
    session: Session = Depends(get_session),
):
    """区域列表（分类页「区域」下拉 / 行情对比的数据面）。

    同时聚合「上架单」与「楼盘」两侧：新房页（楼盘视角）与二手房/租房页
    （上架单视角）都能用它填下拉；只有楼盘没有上架单的区域也会出现。
    """
    # 上架单侧：region 只能取自楼盘（房源无区域字段），故这里 inner join Project
    listing_conditions = _listing_visibility_conditions()
    listing_conditions.append(Project.district.is_not(None))
    if city:
        listing_conditions.append(slug_expr(Project.city) == slug_text(city))
    if listing_type:
        listing_conditions.append(Listing.listing_type == listing_type)
    if property_type:
        types = [t.strip() for t in property_type if t and t.strip()]
        if types:
            listing_conditions.append(Property.property_type.in_(types))

    listing_rows = session.exec(
        select(Project.district, func.count(Listing.id))
        .join(Property, Listing.property_id == Property.id)
        .join(Project, Property.project_id == Project.id)
        .where(*listing_conditions)
        .group_by(Project.district)
    ).all()

    project_conditions = [Project.deleted_at.is_(None), Project.district.is_not(None)]
    if city:
        project_conditions.append(slug_expr(Project.city) == slug_text(city))
    project_rows = session.exec(
        select(Project.district, func.count(Project.id), func.avg(Project.avg_price))
        .where(*project_conditions)
        .group_by(Project.district)
    ).all()

    merged: Dict[str, Dict[str, Any]] = {}
    for district, cnt in listing_rows:
        merged.setdefault(district, {"listing_count": 0, "project_count": 0, "prices": []})
        merged[district]["listing_count"] += int(cnt or 0)
    for district, cnt, avg_price in project_rows:
        bucket = merged.setdefault(
            district, {"listing_count": 0, "project_count": 0, "prices": []}
        )
        bucket["project_count"] += int(cnt or 0)
        if avg_price:
            bucket["prices"].append(float(avg_price))

    items = [
        PublicDistrictItem(
            district=district,
            listing_count=bucket["listing_count"],
            project_count=bucket["project_count"],
            avg_price=(
                round(sum(bucket["prices"]) / len(bucket["prices"]), 2)
                if bucket["prices"]
                else None
            ),
        )
        for district, bucket in merged.items()
    ]
    # 按数据量降序：下拉里先出现「房源多」的区域，符合用户的直觉
    items.sort(key=lambda it: (-(it.listing_count + it.project_count), it.district))
    return items


@router.get("/cities", response_model=List[PublicCityItem])
def list_public_cities(session: Session = Depends(get_session)):
    """有数据的城市列表（当前库里真实出现的城市，非全量城市字典）。

    用途：客户端定位 Store 选中的城市若要落到筛选上，必须先把中文城市名
    （「曼谷」）映射成库内的城市标识。这里返回 `key = slug(库内城市名)`，
    前端用 `cityKey.toLowerCase()` 即可命中；命中不了的说明该城市暂无房源，
    前端应如实提示「该城市暂无房源」，而不是发起一次注定为空的查询。
    """
    listing_rows = session.exec(
        select(Project.city, func.count(Listing.id))
        .join(Property, Listing.property_id == Property.id)
        .join(Project, Property.project_id == Project.id)
        .where(
            *_listing_visibility_conditions(),
            Project.city.is_not(None),
        )
        .group_by(Project.city)
    ).all()

    project_rows = session.exec(
        select(Project.city, func.count(Project.id))
        .where(Project.deleted_at.is_(None), Project.city.is_not(None))
        .group_by(Project.city)
    ).all()

    merged: Dict[str, Dict[str, Any]] = {}
    for city_name, cnt in listing_rows:
        bucket = merged.setdefault(
            slug_text(city_name), {"name": city_name, "listing_count": 0, "project_count": 0}
        )
        bucket["listing_count"] += int(cnt or 0)
    for city_name, cnt in project_rows:
        bucket = merged.setdefault(
            slug_text(city_name), {"name": city_name, "listing_count": 0, "project_count": 0}
        )
        bucket["project_count"] += int(cnt or 0)

    items = [
        PublicCityItem(
            key=key,
            name=bucket["name"],
            listing_count=bucket["listing_count"],
            project_count=bucket["project_count"],
        )
        for key, bucket in merged.items()
    ]
    items.sort(key=lambda it: (-(it.listing_count + it.project_count), it.name))
    return items


class CategorySummaryOut(BaseModel):
    """C 端分类页顶部「数据胶囊 + 行情对比」的聚合结果。

    所有计数由在售/在租上架单与楼盘实时算出；缺失数据一律计 0，不编造热度。
    贝壳的「最新取证」是中国预售证口径，本项目没有，改以在售套数
    （`sell_count`）替代（见前端映射）。
    """

    model_config = ConfigDict(extra="allow")

    city: Optional[str] = None
    on_sale_projects: int = 0  # 有在售上架单的楼盘数
    opened_this_month: int = 0  # 本月开盘楼盘数（open_date 落在当月）
    new_projects_7d: int = 0  # 近 7 日新增楼盘数
    unsold_projects: int = 0  # 无在售上架单的楼盘数
    rent_count: int = 0  # 在租上架单数
    sell_count: int = 0  # 在售上架单数
    new_count: int = 0  # 新房（一手）在售上架单数
    resale_count: int = 0  # 二手房在售上架单数
    office_shop_count: int = 0  # 商铺办公（office/shop/commercial）在售上架单数
    factory_count: int = 0  # 厂房在售上架单数
    # 行情对比：区域均价列表（当前条件下全部有均价的区域，不再固定前二）
    district_price_pairs: List[Dict[str, Any]] = []


@router.get("/listing-categories/summary", response_model=CategorySummaryOut)
def listing_categories_summary(
    city: Optional[str] = Query(None, description="限定城市；不传=全国"),
    session: Session = Depends(get_session),
):
    """C 端分类页聚合摘要（数据胶囊 + 行情对比 + 分类计数）。

    全部由「在售/在租上架单 + 楼盘」实时聚合，不含内容运营数据（无则计 0）。
    """
    now = datetime.utcnow()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    week_ago = now - timedelta(days=7)

    project_conditions = [Project.deleted_at.is_(None)]
    if city:
        # 与 /public/listings、/public/projects 同口径：城市名 slug 比对，
        # 使客户端传 cityKey（如 chiangMai）也能命中库内英文名（Chiang Mai）
        project_conditions.append(slug_expr(Project.city) == slug_text(city))
    project_rows = session.exec(
        select(Project.id, Project.district, Project.avg_price,
               Project.open_date, Project.created_at)
        .where(*project_conditions)
    ).all()

    listing_conditions = [
        Listing.deleted_at.is_(None),
        Listing.status == ListingStatus.active,
        Property.deleted_at.is_(None),
    ]
    if city:
        listing_conditions.append(slug_expr(Project.city) == slug_text(city))
    listing_rows = session.exec(
        select(
            Listing.listing_type,
            Listing.is_new_development,
            Property.property_type,
            Property.project_id,
        )
        .join(Property, Listing.property_id == Property.id)
        .outerjoin(Project, Property.project_id == Project.id)
        .where(*listing_conditions)
    ).all()

    rent_count = sell_count = new_count = resale_count = 0
    office_shop_count = factory_count = 0
    on_sale_project_ids: set = set()
    for listing_type, is_new, prop_type, project_id in listing_rows:
        if _enum_value(listing_type) == ListingType.rent.value:
            rent_count += 1
            continue
        sell_count += 1
        if is_new:
            new_count += 1
        else:
            resale_count += 1
        if prop_type in _COMMERCIAL_TYPES:
            if prop_type == "factory":
                factory_count += 1
            else:
                office_shop_count += 1
        if project_id:
            on_sale_project_ids.add(project_id)

    project_ids = {row[0] for row in project_rows}
    opened_this_month = sum(
        1 for _pid, _d, _p, open_date, _c in project_rows
        if open_date and open_date >= month_start
    )
    new_projects_7d = sum(
        1 for _pid, _d, _p, _o, created_at in project_rows
        if created_at and created_at >= week_ago
    )
    on_sale_projects = len(project_ids & on_sale_project_ids)
    unsold_projects = len(project_ids - on_sale_project_ids)

    # 行情对比：按区域聚合均价（仅取均价非空的楼盘），返回当前条件下全部区域，
    # 交由前端按需展示/截断（后端不再固定「前二」）
    district_agg: Dict[str, Dict[str, Any]] = {}
    for _pid, district, avg_price, _o, _c in project_rows:
        if not district:
            continue
        bucket = district_agg.setdefault(district, {"count": 0, "prices": []})
        bucket["count"] += 1
        if avg_price:
            bucket["prices"].append(avg_price)
    ranked = sorted(district_agg.items(), key=lambda kv: -kv[1]["count"])
    district_price_pairs: List[Dict[str, Any]] = []
    for district, bucket in ranked:
        if not bucket["prices"]:
            continue
        district_price_pairs.append(
            {"district": district, "avg_price": round(sum(bucket["prices"]) / len(bucket["prices"]), 2)}
        )

    return CategorySummaryOut(
        city=city,
        on_sale_projects=on_sale_projects,
        opened_this_month=opened_this_month,
        new_projects_7d=new_projects_7d,
        unsold_projects=unsold_projects,
        rent_count=rent_count,
        sell_count=sell_count,
        new_count=new_count,
        resale_count=resale_count,
        office_shop_count=office_shop_count,
        factory_count=factory_count,
        district_price_pairs=district_price_pairs,
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


# ==================== 预约看房（匿名）====================


@router.post("/viewings", response_model=PublicViewingOut)
@limiter.limit(AUTH_LIMIT)
def create_public_viewing(
    request: Request,
    payload: PublicViewingCreate,
    session: Session = Depends(get_session),
):
    """匿名预约看房：未登录访客也能发起（贝壳详情页「预约看房」的等价能力）。

    **这是详情页转化链断掉的一环**：`POST /viewings` 要求登录，未注册用户点了
    必然 401。这里补齐匿名通路，可见性口径与 `/public/listings` 一致——只有
    active 上架单才可被预约，已下架/驳回/过期单直接 404，避免给下架房源带客。

    安全与合规：
    - 限流，防批量灌水（与留资同级限额）；
    - 姓名 + 手机号必填（回联必需，与匿名留资同口径）；
    - 同一房源同一时段已有 pending/confirmed 预约时返回 409；
    - 只回执预约概要，不返回内部字段。
    """
    name = (payload.name or "").strip()
    phone = (payload.phone or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")
    if not phone:
        raise HTTPException(status_code=400, detail="phone is required")

    # 解析房源：listing_id 优先（详情页拿到的是上架单 id），也支持直接给 property_id
    property_id = payload.property_id
    if payload.listing_id:
        listing = session.get(Listing, payload.listing_id)
        if (
            not listing
            or listing.deleted_at
            or listing.status != ListingStatus.active
        ):
            raise HTTPException(status_code=404, detail="Listing not found")
        property_id = listing.property_id
    if not property_id:
        raise HTTPException(
            status_code=400, detail="listing_id or property_id is required"
        )
    prop = session.get(Property, property_id)
    if not prop or prop.deleted_at:
        raise HTTPException(status_code=404, detail="Property not found")

    # 未来时间校验：仅对 naive 时间比较，避免带时区的入参与 utcnow 比较报错
    sched = payload.scheduled_at
    if sched.tzinfo is None and sched <= datetime.utcnow():
        raise HTTPException(status_code=400, detail="scheduled_at must be in the future")

    # 同一房源同一时段已有待确认/已确认的预约时拒绝堆积（与 /viewings 同规则）
    conflicting = session.exec(
        select(ViewingAppointment).where(
            ViewingAppointment.property_id == property_id,
            ViewingAppointment.scheduled_at == sched,
            ViewingAppointment.status.in_(
                (ViewingStatus.pending, ViewingStatus.confirmed)
            ),
            ViewingAppointment.deleted_at.is_(None),
        )
    ).first()
    if conflicting:
        raise HTTPException(
            status_code=409,
            detail="This time slot is already booked for the property",
        )

    appointment = ViewingAppointment(
        property_id=property_id,
        scheduled_at=sched,
        notes=(payload.notes or "").strip() or None,
        requester_user_id=None,  # 匿名访客：不关联系统账号
        visitor_name=name,
        visitor_phone=phone,
        visitor_email=(payload.email or "").strip() or None,
        status=ViewingStatus.pending,
    )
    session.add(appointment)
    session.commit()
    session.refresh(appointment)
    logger.info(
        "public.viewing.created",
        viewing_id=str(appointment.id),
        property_id=str(property_id),
    )
    return PublicViewingOut(
        ok=True,
        id=appointment.id,
        property_id=appointment.property_id,
        status=appointment.status.value,
        scheduled_at=appointment.scheduled_at.isoformat(),
    )


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
