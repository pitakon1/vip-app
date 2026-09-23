"""房源路由：房源 CRUD、照片上传及关联租约查询。"""
import uuid
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from pydantic import BaseModel, ConfigDict
from sqlalchemy import exists, false, or_
from sqlalchemy.orm import aliased
from sqlmodel import Session, select

from app.db import get_session
from app.core.auth import (
    can_view_property,
    get_current_user,
    lease_visibility_conditions,
    property_visibility_conditions,
    require_admin,
)
from app.core.cache import (
    delete_cache_pattern,
    get_cache,
    invalidate_aggregate_caches,
    set_cache,
)
from app.core.concurrency import ensure_version
from app.core.pagination import Page, PaginationParams, paginate_query
from app.core.uploads import detect_image_mime, save_upload
from app.models import (
    Property,
    PropertyStatus,
    Lease,
    Owner,
    Project,
    School,
    Tenant,
    User,
    UserRole,
)
from app.core.logging import get_logger
from app.providers.geo import haversine_km, lat_lng_bounds
from app.services.price_alert import notify_if_price_dropped
from app.services.search import relevance_score, resolve_sort

router = APIRouter(prefix="/properties", tags=["properties"])

logger = get_logger(__name__)

# 支持的排序取值。relevance 仅在后端生效（关键词搜索时的默认口径），
# 前端筛选栏不展示它，但仍允许显式传入。
_PROPERTY_SORTS = ["latest", "price_asc", "price_desc", "area_desc", "relevance"]

# 照片上传目录（backend/uploads/properties），由 /uploads 静态服务暴露
UPLOAD_DIR = Path(__file__).resolve().parents[3] / "uploads" / "properties"
ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"}
MAX_PHOTO_SIZE = 10 * 1024 * 1024  # 单张 10MB
MAX_PHOTOS = 20


def _notify_price_drop(
    session: Session, prop: Property, old_rent: Optional[float]
) -> None:
    """房源月租下调后，触发该房源订阅者的降价通知。

    调用方必须在覆盖 `monthly_rent` **之前**把旧值传进来，否则改完就比不出来了。

    通知失败不能影响房源更新本身（价格已经落库），所以这里吞异常——
    但**必须记日志**：静默会让「降价提醒不工作」变成查不出来的问题。
    """
    new_rent = prop.monthly_rent
    if old_rent is None or new_rent is None or float(new_rent) >= float(old_rent):
        return
    try:
        notify_if_price_dropped(session, float(new_rent), property_id=prop.id)
        session.commit()
    except Exception:
        session.rollback()
        logger.warning(
            "price_alert.notify_failed",
            property_id=str(prop.id),
            old_rent=old_rent,
            new_rent=new_rent,
            exc_info=True,
        )


class PropertyCreate(BaseModel):
    project_id: Optional[uuid.UUID] = None
    owner_id: Optional[uuid.UUID] = None
    room_number: str
    floor: Optional[int] = None
    building: Optional[str] = None
    address: str
    property_type: str = "apartment"
    monthly_rent: float
    currency: str = "THB"
    deposit_amount: float = 0
    deposit_months: int = 2
    size_sqm: Optional[float] = None
    bedrooms: Optional[int] = None
    bathrooms: Optional[int] = None
    status: PropertyStatus = PropertyStatus.vacant
    description: Optional[str] = None
    photos: Optional[List[str]] = None
    furnished: bool = False
    orientation: Optional[str] = None
    decoration: Optional[str] = None
    amenities: Optional[List[str]] = None
    available_from: Optional[datetime] = None
    video_url: Optional[str] = None


class PropertyUpdate(BaseModel):
    project_id: Optional[uuid.UUID] = None
    owner_id: Optional[uuid.UUID] = None
    room_number: Optional[str] = None
    floor: Optional[int] = None
    building: Optional[str] = None
    address: Optional[str] = None
    property_type: Optional[str] = None
    monthly_rent: Optional[float] = None
    currency: Optional[str] = None
    deposit_amount: Optional[float] = None
    deposit_months: Optional[int] = None
    size_sqm: Optional[float] = None
    bedrooms: Optional[int] = None
    bathrooms: Optional[int] = None
    status: Optional[PropertyStatus] = None
    description: Optional[str] = None
    photos: Optional[List[str]] = None
    furnished: Optional[bool] = None
    orientation: Optional[str] = None
    decoration: Optional[str] = None
    amenities: Optional[List[str]] = None
    available_from: Optional[datetime] = None
    video_url: Optional[str] = None
    # 可选乐观锁：客户端传回读到的 version，服务端不一致则 409 拒绝覆盖
    version: Optional[int] = None


class PropertyDetail(BaseModel):
    """房源详情响应（含项目名称与业主名称，覆盖 model_dump 全字段）。"""

    model_config = ConfigDict(extra="allow")

    id: Optional[uuid.UUID] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    deleted_at: Optional[datetime] = None
    metadata_: Optional[dict] = None
    version: Optional[int] = None
    project_id: Optional[uuid.UUID] = None
    owner_id: Optional[uuid.UUID] = None
    room_number: Optional[str] = None
    floor: Optional[int] = None
    building: Optional[str] = None
    address: Optional[str] = None
    property_type: Optional[str] = None
    monthly_rent: Optional[float] = None
    currency: Optional[str] = None
    deposit_amount: Optional[float] = None
    deposit_months: Optional[int] = None
    size_sqm: Optional[float] = None
    bedrooms: Optional[int] = None
    bathrooms: Optional[int] = None
    status: Optional[PropertyStatus] = None
    description: Optional[str] = None
    photos: Optional[list] = None
    furnished: Optional[bool] = None
    orientation: Optional[str] = None
    decoration: Optional[str] = None
    amenities: Optional[list] = None
    available_from: Optional[datetime] = None
    video_url: Optional[str] = None
    project_name: Optional[str] = None
    owner_name: Optional[str] = None
    # 创建人（房源归属人）：销售/经纪的数据隔离依据；NULL = 历史房源，仅管理员可见
    created_by: Optional[uuid.UUID] = None
    creator_name: Optional[str] = None


class PropertyLeaseItem(BaseModel):
    """房源租约列表项（附带租客名称）。"""

    model_config = ConfigDict(extra="allow")

    id: Optional[str] = None
    status: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    monthly_rent: Optional[float] = None
    currency: Optional[str] = None
    tenant_id: Optional[str] = None
    tenant_name: Optional[str] = None


class PropertyLeaseList(BaseModel):
    """房源租约列表响应。"""

    model_config = ConfigDict(extra="allow")

    items: List[PropertyLeaseItem] = []


def _role_value(user: User) -> str:
    """把 user.role 规整为字符串值（兼容已修复的 .value/hasattr 防御）。"""
    return user.role.value if hasattr(user.role, "value") else str(user.role)


def _tenant_name(tenant: Optional[Tenant], users: dict) -> Optional[str]:
    """租客档案 → 展示名（档案或账号缺失时返回 None，不抛异常）。"""
    if not tenant or not tenant.user_id:
        return None
    account = users.get(tenant.user_id)
    return account.full_name if account else None


def _ensure_owner_access(user: User, prop: Property, session: Session) -> None:
    """单条房源的写权限。

    - 管理员：可操作任意房源；
    - 销售 / 经纪（agent / employee）：仅可操作**自己录入**的房源（`created_by`
      为空的历史房源归管理员，员工不可操作）；
    - 业主：仅可操作名下房源；
    - 其余角色：拒绝。

    这里传进来的是 ORM 对象，`created_by` 与 `user.id` 都是 UUID，直接比较即可。
    """
    role = _role_value(user)
    if role == UserRole.admin.value:
        return
    if role in {UserRole.agent.value, UserRole.employee.value}:
        if prop.created_by is None or prop.created_by != user.id:
            raise HTTPException(status_code=403, detail="只能操作自己添加的房源")
        return
    if role != UserRole.owner.value:
        raise HTTPException(status_code=403, detail="Access denied")
    owner = session.exec(
        select(Owner).where(
            Owner.user_id == user.id,
            Owner.deleted_at.is_(None),
        )
    ).first()
    if not owner or prop.owner_id != owner.id:
        raise HTTPException(status_code=403, detail="只能操作自己名下的房源")


def _keyword_conditions(terms: List[str]) -> list:
    """关键词之间是「或」：任一关键词命中房源自身字段或所属项目任一字段即算命中。"""
    project_search = aliased(Project)
    conditions: list = []
    for term in terms:
        pattern = f"%{term}%"
        # 项目（楼盘）的名称/地址/城市/城区也参与匹配，否则「苏坤逸」这类按区域搜会漏掉
        # 只在 project 上命中、房源地址里没写区域的房源；用独立别名的 EXISTS，
        # 与地区筛选的 JOIN 互不干扰，也不会造成行膨胀。
        project_hit = exists(
            select(project_search.id).where(
                project_search.id == Property.project_id,
                or_(
                    project_search.name.ilike(pattern),
                    project_search.address.ilike(pattern),
                    project_search.city.ilike(pattern),
                    project_search.district.ilike(pattern),
                    project_search.nearest_subway.ilike(pattern),
                ),
            )
        )
        conditions.extend(
            [
                Property.room_number.ilike(pattern),
                Property.address.ilike(pattern),
                Property.building.ilike(pattern),
                Property.description.ilike(pattern),
                project_hit,
            ]
        )
    return conditions


@router.get("", response_model=Page[PropertyDetail])
def list_properties(
    pagination: PaginationParams = Depends(),
    status: Optional[PropertyStatus] = None,
    project_id: Optional[uuid.UUID] = None,
    school_id: Optional[uuid.UUID] = Query(
        None, description="按学校找房：学校 ID（按半径反查其覆盖的小区）"
    ),
    school_radius_km: float = Query(
        3.0, gt=0, le=50, description="按学校找房：以学校为圆心的半径（km）"
    ),
    owner_id: Optional[uuid.UUID] = None,
    country: Optional[str] = None,
    province: Optional[str] = None,
    city: Optional[str] = None,
    district: Optional[str] = None,
    subway: Optional[str] = None,
    q: Optional[str] = Query(
        None, max_length=100, description="关键词：房号 / 地址 / 楼栋 / 描述"
    ),
    keywords: Optional[List[str]] = Query(
        None,
        description="多关键词（任一命中即算，用于「区域 / 地铁」等一组同义词搜索），最多 20 个",
    ),
    price_min: Optional[float] = Query(None, ge=0),
    price_max: Optional[float] = Query(None, ge=0),
    area_min: Optional[float] = Query(None, ge=0),
    area_max: Optional[float] = Query(None, ge=0),
    bedrooms_min: Optional[int] = Query(None, ge=0, le=20),
    bedrooms_max: Optional[int] = Query(None, ge=0, le=20),
    orientation: Optional[str] = Query(
        None, description="朝向（north/south/east/west/northeast/northwest/southeast/southwest）"
    ),
    decoration: Optional[str] = Query(
        None, description="装修（bare/simple/standard/luxury/fully_furnished）"
    ),
    floor_level: Optional[str] = Query(
        None, pattern="^(low|mid|high)$",
        description="楼层段：low=1-5层 / mid=6-15层 / high=16层及以上",
    ),
    amenity: Optional[List[str]] = Query(
        None, description="配套设施（多选任一命中，如 aircon/pool/gym/parking/elevator/balcony）"
    ),
    has_video: Optional[bool] = Query(None, description="只看有视频看房的房源"),
    sort: Optional[str] = Query(
        None,
        pattern="^(latest|price_asc|price_desc|area_desc|relevance)$",
        description="排序。不传时：有关键词按相关性，否则按最新",
    ),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """房源列表（分页；支持关键词 / 区域同义词 / 价格区间 / 面积 / 房型 / 排序 / 小区 / 学校半径）。"""
    keyword = (q or "").strip()
    # 区域/地铁这类「一组同义词命中任一即可」的搜索走 keywords，并与 q 合并去重
    terms = [keyword] if keyword else []
    terms += [k.strip() for k in (keywords or []) if k and k.strip()]
    terms = list(dict.fromkeys(terms))[:20]
    # 先定下「实际生效的排序」再拼缓存键，否则 sort 缺省与 sort=relevance
    # 会各自缓存一份完全相同的结果
    sort = resolve_sort(sort, terms, allowed=_PROPERTY_SORTS)
    cache_key = (
        f"cache:properties:list:{pagination.page}:{pagination.page_size}:"
        f"{status.value if status else ''}:{project_id or ''}:{owner_id or ''}:"
        f"{school_id or ''}:{school_radius_km}:"
        f"{country or ''}:{province or ''}:{city or ''}:{district or ''}:{subway or ''}:"
        f"{'|'.join(terms)}:{price_min}:{price_max}:{area_min}:{area_max}:"
        f"{bedrooms_min}:{bedrooms_max}:{orientation or ''}:{decoration or ''}:{floor_level or ''}:"
        f"{'|'.join(amenity or [])}:{has_video}:{sort}"
    )
    # 列表缓存只在管理员请求时启用。缓存键不含用户身份，若非 admin 也走缓存，
    # 管理员的全量结果会被串给销售/经纪（越权泄露）。非 admin 的可见集本就很小，
    # 直接查库即可；这样 admin 的 key 只会被 admin 读写，从根上消除串号。
    use_cache = _role_value(user) == UserRole.admin.value
    cached = get_cache(cache_key) if use_cache else None
    if cached is not None:
        return cached

    conditions = [
        Property.deleted_at.is_(None),
        # 数据隔离由 token 决定（不由调用方传参决定）：管理员全量、销售/经纪仅自己
        # 录入的、业主仅名下、租客维持 C 端公开浏览口径。
        *property_visibility_conditions(session, user),
    ]
    term_conditions = _keyword_conditions(terms)
    if term_conditions:
        conditions.append(or_(*term_conditions))
    if status:
        conditions.append(Property.status == status)
    if project_id:
        conditions.append(Property.project_id == project_id)
    # 按学校找房：先用经纬度包围盒粗筛小区，再在应用层用 haversine 精算半径，
    # 最后收敛成「半径内的小区 ID 集合」——比 public.py 的 Listing 三表 join 轻得多，
    # 且返回结构仍是 Property，不改变前端已有的数据形状。
    if school_id:
        school = session.get(School, school_id)
        if not school or school.deleted_at:
            raise HTTPException(status_code=404, detail="School not found")
        if school.lat is None or school.lng is None:
            # 没有坐标就算不出距离，不能拿全量冒充满足条件的结果
            raise HTTPException(status_code=400, detail="该学校缺少经纬度，无法按距离筛选")
        lat_min, lat_max, lng_min, lng_max = lat_lng_bounds(
            school.lat, school.lng, school_radius_km
        )
        candidates = session.exec(
            select(Project.id, Project.lat, Project.lng).where(
                Project.deleted_at.is_(None),
                Project.lat.is_not(None),
                Project.lng.is_not(None),
                Project.lat >= lat_min,
                Project.lat <= lat_max,
                Project.lng >= lng_min,
                Project.lng <= lng_max,
            )
        ).all()
        near_ids = [
            pid
            for pid, plat, plng in candidates
            if haversine_km(school.lat, school.lng, plat, plng) <= school_radius_km
        ]
        # 半径内无小区时必须显式置空，否则该条件会被整个跳过而返回全量
        conditions.append(Property.project_id.in_(near_ids) if near_ids else false())
    if owner_id:
        conditions.append(Property.owner_id == owner_id)
    if price_min is not None:
        conditions.append(Property.monthly_rent >= price_min)
    if price_max is not None:
        conditions.append(Property.monthly_rent <= price_max)
    if area_min is not None:
        conditions.append(Property.size_sqm >= area_min)
    if area_max is not None:
        conditions.append(Property.size_sqm <= area_max)
    if bedrooms_min is not None:
        conditions.append(Property.bedrooms >= bedrooms_min)
    if bedrooms_max is not None:
        conditions.append(Property.bedrooms <= bedrooms_max)
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
    # 配套多选：任一命中即算（与区域同义词一致的口径）
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
    if has_video:
        conditions.append(Property.video_url.is_not(None))
        conditions.append(Property.video_url != "")

    # 项目地区筛选：仅在有地区条件时 LEFT JOIN projects
    geo_join = None
    if country or province or city or district or subway:
        geo_join = Property.project_id == Project.id
        if country:
            conditions.append(Project.country == country)
        if province:
            conditions.append(Project.province == province)
        if city:
            conditions.append(Project.city == city)
        if district:
            conditions.append(Project.district == district)
        if subway:
            conditions.append(Project.nearest_subway == subway)

    # 排序：默认最新；价格/面积排序时把空值排到最后，避免 NULL 干扰浏览
    score = relevance_score(terms) if sort == "relevance" else None
    if sort == "price_asc":
        order_by = [Property.monthly_rent.asc()]
    elif sort == "price_desc":
        order_by = [Property.monthly_rent.desc()]
    elif sort == "area_desc":
        order_by = [Property.size_sqm.desc()]
    elif score is not None:
        order_by = [score.desc(), Property.created_at.desc()]
    else:
        order_by = [Property.created_at.desc()]
    order_by.append(Property.id)  # 兜底稳定排序，避免同值分页时记录漂移
    stmt = select(Property)
    if geo_join is not None:
        stmt = stmt.join(Project, geo_join)
    elif score is not None:
        # 这里 join 只为让楼盘名参与打分，必须用 LEFT JOIN：
        # 内连接会把没有关联楼盘的房源整行丢掉，等于「一搜索就少了一批房源」。
        stmt = stmt.outerjoin(Project, Property.project_id == Project.id)
    stmt = stmt.where(*conditions).order_by(*order_by)
    result = paginate_query(session, stmt, pagination)
    # 给本页每条房源补上项目名（小区名 + 房号 的展示对齐 C 端口径）。
    # 一次批量取项目映射，避免逐条 session.get 造成 N+1；保持 Page 结构不变，
    # 只是把 items 从 SQLModel 换成带 project_name 的 dict。
    items = result.items
    project_ids = list({p.project_id for p in items if p.project_id})
    project_names = (
        {pr.id: pr.name for pr in session.exec(select(Project).where(Project.id.in_(project_ids))).all()}
        if project_ids
        else {}
    )
    # 归属人姓名同样批量取（管理端列表要展示「归属人」），照 project_names 的
    # `in_` 做法，避免逐条 session.get 造成 N+1。
    creator_ids = list({p.created_by for p in items if p.created_by})
    creator_names = (
        {
            u.id: u.full_name
            for u in session.exec(select(User).where(User.id.in_(creator_ids))).all()
        }
        if creator_ids
        else {}
    )
    result.items = [
        {
            **p.model_dump(),
            "project_name": project_names.get(p.project_id),
            "creator_name": creator_names.get(p.created_by),
        }
        for p in result.items
    ]
    # 与读取同源：只有 admin 的请求才写缓存，否则销售/经纪的小结果集会覆盖
    # 管理员的全量缓存，后续管理员就读到残缺数据。
    if use_cache:
        set_cache(cache_key, result, ttl=60)
    return result


@router.post("")
def create_property(
    req: PropertyCreate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """创建房源。

    业主端「新增房源」：业主角色时自动按当前用户绑定 owner_id（忽略客户端传入）；
    员工/经纪人/管理员等内部角色仍需显式指定 owner_id；其余角色（如租客）禁止创建。
    """
    payload = req.model_dump()
    role = _role_value(user)
    if role == UserRole.owner.value:
        owner = session.exec(
            select(Owner).where(
                Owner.user_id == user.id,
                Owner.deleted_at.is_(None),
            )
        ).first()
        if not owner:
            raise HTTPException(status_code=404, detail="Owner profile not found")
        payload["owner_id"] = owner.id
    else:
        if role not in {UserRole.admin.value, UserRole.agent.value, UserRole.employee.value}:
            raise HTTPException(status_code=403, detail="Access denied")
        if not payload.get("owner_id"):
            raise HTTPException(status_code=400, detail="owner_id is required")
        # 内部角色可以代客录房，但 owner_id 必须是**真实存在且未软删除**的业主。
        # 此前只校验了「非空」，客户端塞一个任意 UUID（或一个已删除业主的 id）就能落库：
        # 这条房源在业主端永远不会出现（join 不到 owner），却照常出现在列表、地图和
        # 统计聚合里——是纯粹制造脏数据的入口。
        owner_ok = session.exec(
            select(Owner.id).where(
                Owner.id == payload["owner_id"],
                Owner.deleted_at.is_(None),
            )
        ).first()
        if not owner_ok:
            raise HTTPException(status_code=400, detail="owner_id 指向的业主不存在或已删除")
    # 记录创建人（房源归属人）。写权限与列表可见性都以它为准：管理员全量，
    # 销售/经纪只能看到并操作自己录入的房源。此处由服务端写入，不接受客户端传参。
    payload["created_by"] = user.id
    prop = Property(**payload)
    session.add(prop)
    session.commit()
    session.refresh(prop)
    delete_cache_pattern("cache:properties:*")
    invalidate_aggregate_caches()  # 新建房源会改变总数/空置数
    return prop


class PropertyAssign(BaseModel):
    """指派房源归属人（管理员专用）。传 null 表示收回归属，房源回到管理员池。"""

    created_by: Optional[uuid.UUID] = None


@router.post("/{property_id}/assign", response_model=PropertyDetail)
def assign_property(
    property_id: uuid.UUID,
    req: PropertyAssign,
    session: Session = Depends(get_session),
    user: User = Depends(require_admin),
):
    """把房源指派给某位内部员工（管理员专用）。

    历史房源（`created_by` 为 NULL）按设计只有管理员可见，员工看不到也就无从
    接手；这里给管理员一个把存量房源「分发」给销售/经纪的入口，否则那些房源会
    永久卡在管理员池里。

    只能指派给内部员工角色：`created_by` 的语义是「谁负责这套房源」，
    指派给业主/租客没有意义（业主关系走 `owner_id`）。
    """
    prop = session.get(Property, property_id)
    if not prop or prop.deleted_at:
        raise HTTPException(status_code=404, detail="Property not found")

    if req.created_by is not None:
        assignee = session.get(User, req.created_by)
        if not assignee or not assignee.is_active:
            raise HTTPException(status_code=400, detail="归属人不存在或已停用")
        if assignee.role not in (UserRole.admin, UserRole.agent, UserRole.employee):
            raise HTTPException(status_code=400, detail="只能指派给内部员工（管理员/销售/经纪）")

    prop.created_by = req.created_by
    session.add(prop)
    session.commit()
    session.refresh(prop)
    # 归属人变了，列表缓存必须整片失效：旧结果会继续按旧归属返回给员工
    delete_cache_pattern("cache:properties:*")

    project = session.get(Project, prop.project_id) if prop.project_id else None
    owner_user = None
    if prop.owner_id:
        owner = session.get(Owner, prop.owner_id)
        owner_user = session.get(User, owner.user_id) if owner and owner.user_id else None
    creator_user = session.get(User, prop.created_by) if prop.created_by else None
    data = prop.model_dump()
    data["project_name"] = project.name if project else None
    data["owner_name"] = owner_user.full_name if owner_user else None
    data["creator_name"] = creator_user.full_name if creator_user else None
    return data


class PropertyMapPoint(BaseModel):
    """地图找房的房源点位（经纬度取自所属项目）。"""

    id: uuid.UUID
    room_number: str
    address: Optional[str] = None
    monthly_rent: float
    currency: str
    status: PropertyStatus
    video_url: Optional[str] = None
    project_id: Optional[uuid.UUID] = None
    project_name: Optional[str] = None
    lat: float
    lng: float


@router.get("/map-points", response_model=List[PropertyMapPoint])
def list_property_map_points(
    limit: int = Query(300, ge=1, le=1000),
    status: Optional[PropertyStatus] = None,
    city: Optional[str] = None,
    district: Optional[str] = None,
    q: Optional[str] = Query(None, max_length=100, description="关键词：房号 / 地址 / 项目"),
    keywords: Optional[List[str]] = Query(None, description="多关键词（任一命中即算）"),
    price_min: Optional[float] = Query(None, ge=0),
    price_max: Optional[float] = Query(None, ge=0),
    has_video: Optional[bool] = Query(None, description="只看有视频看房的房源"),

    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """地图找房：返回带经纬度的房源点位。

    房源表本身没有坐标，坐标一律取所属项目（projects.lat/lng）；
    项目未维护坐标的房源不会出现在地图上，前端据此提示「未定位房源数」。

    [刻意保留] 三端暂无调用方：C 端匿名地图已改走 /public/map-points（浏览免登录），
    这个鉴权版本留给后台/内部场景，不删。已在契约工具 INTENTIONAL_ORPHANS 登记。
    """
    keyword = (q or "").strip()
    terms = [keyword] if keyword else []
    terms += [k.strip() for k in (keywords or []) if k and k.strip()]
    terms = list(dict.fromkeys(terms))[:20]

    conditions = [
        Property.deleted_at.is_(None),
        Property.project_id.is_not(None),
        Project.lat.is_not(None),
        Project.lng.is_not(None),
    ]
    term_conditions = _keyword_conditions(terms)
    if term_conditions:
        conditions.append(or_(*term_conditions))
    if status:
        conditions.append(Property.status == status)
    if city:
        conditions.append(Project.city == city)
    if district:
        conditions.append(Project.district == district)
    if price_min is not None:
        conditions.append(Property.monthly_rent >= price_min)
    if price_max is not None:
        conditions.append(Property.monthly_rent <= price_max)
    if has_video:
        conditions.append(Property.video_url.is_not(None))
        conditions.append(Property.video_url != "")

    rows = session.exec(
        select(Property, Project)
        .join(Project, Property.project_id == Project.id)
        .where(*conditions)
        .order_by(Property.created_at.desc(), Property.id)
        .limit(limit)
    ).all()
    return [
        {
            "id": prop.id,
            "room_number": prop.room_number,
            "address": prop.address,
            "monthly_rent": prop.monthly_rent,
            "currency": prop.currency,
            "status": prop.status,
            "video_url": prop.video_url,
            "project_id": prop.project_id,
            "project_name": project.name,
            "lat": project.lat,
            "lng": project.lng,
        }
        for prop, project in rows
    ]


@router.get("/{property_id}", response_model=PropertyDetail)
def get_property(
    property_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """获取房源详情（附带项目名称、业主名称与归属人姓名）。

    一次联表查询取齐 房源 / 楼盘 / 业主账号 / 创建人 四份数据：此前是 4 次
    `session.get` 串行往返（房源→楼盘→业主→账号），详情页首屏被数据库
    往返次数拖住；这里合并成一条带 outer join 的语句，缺关联时字段为 None。

    越权一律返回 404 而不是 403：403 等于告诉对方「这个 id 确实存在」，
    会变成枚举房源 id 的探针。缓存里存的是房源本身（不含用户身份），
    故权限判定必须放在取缓存**之后**，否则销售/经纪能靠缓存命中绕过隔离。
    """
    cache_key = f"cache:properties:detail:{property_id}"
    cached = get_cache(cache_key)
    if cached is not None:
        if not can_view_property(session, user, cached):
            raise HTTPException(status_code=404, detail="Property not found")
        return cached

    creator = aliased(User)
    row = session.exec(
        select(Property, Project, User, creator)
        .outerjoin(Project, Property.project_id == Project.id)
        .outerjoin(Owner, Property.owner_id == Owner.id)
        .outerjoin(User, Owner.user_id == User.id)
        .outerjoin(creator, Property.created_by == creator.id)
        .where(Property.id == property_id)
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Property not found")
    prop, project, owner_user, creator_user = row
    if prop.deleted_at:
        raise HTTPException(status_code=404, detail="Property not found")
    if not can_view_property(session, user, prop):
        raise HTTPException(status_code=404, detail="Property not found")

    data = prop.model_dump()
    data["project_name"] = project.name if project else None
    data["owner_name"] = owner_user.full_name if owner_user else None
    data["creator_name"] = creator_user.full_name if creator_user else None
    set_cache(cache_key, data, ttl=60)
    return data


@router.patch("/{property_id}")
def update_property(
    property_id: uuid.UUID,
    req: PropertyUpdate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """更新房源信息（业主仅可编辑名下房源；经纪人/管理员可编辑任意）。"""
    prop = session.get(Property, property_id)
    if not prop or prop.deleted_at:
        raise HTTPException(status_code=404, detail="Property not found")
    _ensure_owner_access(user, prop, session)
    update_data = req.model_dump(exclude_unset=True)
    role = _role_value(user)
    if role == UserRole.owner.value:
        # 业主不可通过 PATCH 转移房源归属
        update_data.pop("owner_id", None)
    ensure_version(prop, update_data.pop("version", None), "房源")
    # 必须在覆盖之前抓旧月租：改完就再也拿不到「原价」，降价判定依赖它
    old_rent = prop.monthly_rent
    for key, value in update_data.items():
        setattr(prop, key, value)
    session.add(prop)
    session.commit()
    session.refresh(prop)
    delete_cache_pattern("cache:properties:*")
    invalidate_aggregate_caches()
    _notify_price_drop(session, prop, old_rent)
    return prop


@router.delete("/{property_id}")
def delete_property(
    property_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """软删除房源（业主仅可删除名下房源；经纪人/管理员可删任意）。"""
    prop = session.get(Property, property_id)
    if not prop or prop.deleted_at:
        raise HTTPException(status_code=404, detail="Property not found")
    _ensure_owner_access(user, prop, session)
    prop.deleted_at = datetime.utcnow()
    session.add(prop)
    session.commit()
    delete_cache_pattern("cache:properties:*")
    invalidate_aggregate_caches()  # 删除会改变总数/空置数
    return {"detail": "Property deleted"}


@router.get("/{property_id}/leases", response_model=PropertyLeaseList)
def list_property_leases(
    property_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """获取该房源的租约列表（附带租客名称）。

    可见范围与 `/leases` 同一口径（员工全量 / 业主限本人名下 / 租客限本人），
    此前任何登录用户都能按房源 id 读到他人租约与租客姓名。

    租客姓名按需批量取：原来是 `select(Tenant).all()` + `select(User).all()`
    两次全表拉取，租户表一涨就是每请求一次全表扫描。
    """
    prop = session.get(Property, property_id)
    if not prop or prop.deleted_at:
        raise HTTPException(status_code=404, detail="Property not found")

    conditions = [Lease.property_id == property_id, Lease.deleted_at.is_(None)]
    conditions.extend(lease_visibility_conditions(session, user))
    leases = session.exec(
        select(Lease).where(*conditions).order_by(Lease.created_at.desc())
    ).all()

    tenant_ids = {lease.tenant_id for lease in leases if lease.tenant_id}
    tenants = (
        {
            tenant.id: tenant
            for tenant in session.exec(
                select(Tenant).where(Tenant.id.in_(tenant_ids))
            ).all()
        }
        if tenant_ids
        else {}
    )
    user_ids = {tenant.user_id for tenant in tenants.values() if tenant.user_id}
    users = (
        {
            u.id: u
            for u in session.exec(select(User).where(User.id.in_(user_ids))).all()
        }
        if user_ids
        else {}
    )
    return {
        "items": [
            {
                "id": str(lease.id),
                "status": lease.status.value if lease.status else None,
                "start_date": lease.start_date.isoformat() if lease.start_date else None,
                "end_date": lease.end_date.isoformat() if lease.end_date else None,
                "monthly_rent": lease.monthly_rent,
                "currency": lease.currency,
                "tenant_id": str(lease.tenant_id),
                "tenant_name": _tenant_name(tenants.get(lease.tenant_id), users),
            }
            for lease in leases
        ]
    }


@router.post("/{property_id}/photos")
def upload_property_photos(
    property_id: uuid.UUID,
    files: List[UploadFile] = File(...),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """上传房源照片（multipart，支持多张）。文件保存到本地 uploads 目录并追加到 photos 列表。

    业主仅可上传名下房源照片；经纪人/管理员可上传任意。
    """
    prop = session.get(Property, property_id)
    if not prop or prop.deleted_at:
        raise HTTPException(status_code=404, detail="Property not found")
    _ensure_owner_access(user, prop, session)
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")
    if len(files) > MAX_PHOTOS:
        raise HTTPException(status_code=400, detail=f"Too many files (max {MAX_PHOTOS})")

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    saved_urls: List[str] = []
    for file in files:
        saved_urls.append(
            save_upload(
                file,
                UPLOAD_DIR,
                MAX_PHOTO_SIZE,
                ALLOWED_IMAGE_EXTENSIONS,
                None,
                detector=detect_image_mime,
                name_prefix=str(property_id),
                url_prefix="/uploads/properties/",
                label="image",
                invalid_content_message=(
                    f"File content is not a valid image: {file.filename or 'photo'}"
                    "（仅支持 JPG/PNG/GIF/BMP/WEBP，且内容需与扩展名一致）"
                ),
            )
        )

    # 追加到 photos 列表
    existing = list(prop.photos or [])
    existing.extend(saved_urls)
    prop.photos = existing
    session.add(prop)
    session.commit()
    session.refresh(prop)
    delete_cache_pattern("cache:properties:*")
    invalidate_aggregate_caches()  # 照片变更会影响看板里的「待补图」口径
    return {"photos": prop.photos, "added": saved_urls}


@router.delete("/{property_id}/photos")
def delete_property_photo(
    property_id: uuid.UUID,
    url: str,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """删除房源照片（按 URL 从 photos 列表移除，并删除本地文件）。业主仅可操作名下房源。"""
    prop = session.get(Property, property_id)
    if not prop or prop.deleted_at:
        raise HTTPException(status_code=404, detail="Property not found")
    _ensure_owner_access(user, prop, session)

    photos = list(prop.photos or [])
    if url not in photos:
        raise HTTPException(status_code=404, detail="Photo not found")
    photos.remove(url)
    prop.photos = photos or None
    session.add(prop)
    session.commit()
    session.refresh(prop)
    delete_cache_pattern("cache:properties:*")
    invalidate_aggregate_caches()  # 照片变更会影响看板里的「待补图」口径

    # 仅删除本站点 uploads 目录下的文件（防止误删外部 URL）
    if url.startswith("/uploads/properties/"):
        filename = Path(url).name
        (UPLOAD_DIR / filename).unlink(missing_ok=True)
    return {"photos": prop.photos}
