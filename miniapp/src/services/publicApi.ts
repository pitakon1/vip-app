/**
 * C 端公开接口层（匿名可访问）。
 *
 * 为什么要单独一层：站内 B 端接口（`/properties`、`/listings`、`/sale-listings`）
 * 全部强制鉴权，匿名请求直接 401；而本端此前**入口页在无 token 时直接
 * `redirectTo` 登录页**，C 端内容在小程序里根本进不来。本模块对接后端
 * `app/api/v1/public.py` 的匿名层，是「浏览不需注册、只在需要登录的动作上才
 * 要求注册」这条产品原则在小程序端的落点。
 *
 * 安全边界由后端保证，前端只需注意：
 * - 响应体里**不含**业主联系方式、佣金配置（`*_rate` / `split_option`）、
 *   去重键、审核痕迹 —— 后端已裁剪，前端不要再自行拼装；
 * - 只返回 `status=active` 的上架单；
 * - 除留资（`inquiry`）外全部是只读接口。
 */
import { request } from '@/lib/api'

// 全局注入的 API 地址（构建期由 Taro 注入，同 lib/api.ts 的 use）
declare const API_BASE: string

/** 公开房源卡片。价格已由后端统一成 `price`（租=月租、售=挂牌价）。 */
export interface PublicListing {
  id: string
  property_id?: string | null
  listing_type?: string | null
  room_number?: string | null
  address?: string | null
  district?: string | null
  city?: string | null
  project_id?: string | null
  project_name?: string | null
  price?: number | null
  currency?: string | null
  size_sqm?: number | null
  bedrooms?: number | null
  bathrooms?: number | null
  floor?: number | null
  building?: string | null
  orientation?: string | null
  decoration?: string | null
  furnished?: boolean
  cover?: string | null
  video_url?: string | null
  /** VR 看房链接（有值即展示「VR 看房」标签，并可新增 has_vr 筛选） */
  vr_url?: string | null
  /** 优选房源（平台甄选标记） */
  is_featured?: boolean | null
  /** 房东直租（业主直租，无中介） */
  owner_direct?: boolean | null
  listing_no?: string | null
  monthly_rent?: number | null
  asking_price?: number | null
  photos?: unknown[] | null
  nearest_school_name?: string | null
  nearest_school_km?: number | null
  /** 房源类型（公寓/别墅/写字楼/商铺/厂房）：商业卡片角标与「更多」筛选用 */
  property_type?: string | null
  /** 购房业务口径：新房/二手房（仅 sell 有意义） */
  is_new_development?: boolean | null
  /** 竣工年份（来自所属楼盘）→ 二手房卡片据此算楼龄 */
  completion_year?: number | null
  /** 日租金/㎡（派生值，仅商业/工业类目返回） */
  rent_per_sqm_day?: number | null
  /* ===== 商业/工业专项字段（写字楼/商铺/厂房卡片与筛选消费） ===== */
  ceiling_height_m?: number | null
  land_area_sqm?: number | null
  floor_loading_kg_sqm?: number | null
  column_spacing?: string | null
  power_capacity_kva?: number | null
  environmental_permit?: boolean | null
  whole_floor_only?: boolean | null
  whole_building_only?: boolean | null
  company_registrable?: boolean | null
  /* ===== 真房源保鲜（C 端信任信号，免登录可见） ===== */
  last_verified_at?: string | null
  verified_days_ago?: number | null
}

export interface PublicListingDetail extends PublicListing {
  description?: string | null
  deposit_amount?: number | null
  deposit_months?: number | null
  lat?: number | null
  lng?: number | null
  project?: PublicProjectBrief | null
  nearby_schools?: PublicNearbySchool[]
  broker?: PublicBroker | null
}

export interface PublicProjectBrief {
  id?: string | null
  name?: string | null
  address?: string | null
  district?: string | null
  city?: string | null
  total_units?: number | null
  total_buildings?: number | null
  total_floors?: number | null
  parking_spaces?: number | null
  completion_year?: number | null
  management_fee_per_sqm?: number | null
  avg_price?: number | null
  tenure?: string | null
  foreign_quota_pct?: number | null
  developer_name?: string | null
}

export interface PublicNearbySchool {
  id?: string | null
  name?: string | null
  name_en?: string | null
  stage?: string | null
  curriculum?: string | null
  district?: string | null
  distance_km?: number | null
}

export interface PublicBroker {
  company?: string | null
  real_name?: string | null
  phone?: string | null
  wechat?: string | null
  line?: string | null
  whatsapp?: string | null
}

export interface PublicSchool {
  id: string
  name?: string | null
  name_en?: string | null
  stage?: string | null
  curriculum?: string | null
  district?: string | null
  city?: string | null
  address?: string | null
  student_count?: number | null
  age_range?: string | null
  tuition_range?: string | null
  phone?: string | null
  website?: string | null
  cover_url?: string | null
  description?: string | null
  photos?: unknown[] | null
}

export interface PublicSchoolDetail extends PublicSchool {
  nearby_listings?: PublicListing[]
}

export interface PublicProject {
  id: string
  name?: string | null
  address?: string | null
  district?: string | null
  city?: string | null
  cover?: string | null
  total_units?: number | null
  completion_year?: number | null
  tenure?: string | null
  developer_name?: string | null
  sale_count?: number
  rent_count?: number
  sale_price_min?: number | null
  sale_price_max?: number | null
  rent_price_min?: number | null
  rent_price_max?: number | null
  /** 销售状态：pre_sale / on_sale / sold_out */
  sale_status?: string | null
  /** 最近地铁站（新房卡片「近地铁」标签） */
  nearest_subway?: string | null
  /** 在售套数（由该项目下在售上架单实时聚合） */
  listing_count?: number
  /** 近 7 日成交套数 */
  recent_deal_count?: number
  /** 建面区间（㎡） */
  size_min?: number | null
  size_max?: number | null
  /** 户型集合（如 [2,3]） */
  bedroom_options?: number[] | null
}

/** 分类页聚合摘要（数据胶囊 + 行情对比 + 分类计数）。 */
export interface PublicCategorySummary {
  city?: string | null
  on_sale_projects: number
  opened_this_month: number
  new_projects_7d: number
  unsold_projects: number
  rent_count: number
  sell_count: number
  new_count: number
  resale_count: number
  office_shop_count: number
  factory_count: number
  /** 区域均价两两对比（仅返回均价非空的区域，最多 2 条） */
  district_price_pairs: { district?: string | null; avg_price?: number | null }[]
}

export interface PublicProjectDetail extends PublicProject {
  total_buildings?: number | null
  total_floors?: number | null
  parking_spaces?: number | null
  management_fee_per_sqm?: number | null
  avg_price?: number | null
  foreign_quota_pct?: number | null
  listings?: PublicListing[]
}

/** 后端统一分页信封（`app/core/pagination.py` 的 Page）。 */
export interface PublicPage<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  pages?: number
}

/** 区域聚合（`GET /public/districts`）：按数据量降序，含套数/楼盘数/均价。 */
export interface PublicDistrict {
  district?: string | null
  listing_count?: number
  project_count?: number
  avg_price?: number | null
}

/**
 * 城市聚合（`GET /public/cities`）。
 * 注意 `key` 是全小写无连字符形态（如 `chiangmai`），与定位 Store 的 `cityKey`
 * （如 `chiangMai`）不等值，匹配时须先 slug 化（见 `slugCity`）。
 */
export interface PublicCity {
  key: string
  name?: string | null
  listing_count?: number
  project_count?: number
}

/** 地图点位（`GET /public/map-points`）：仅返回所属楼盘有经纬度的房源。 */
export interface PublicMapPoint {
  id: string
  listing_type?: string | null
  property_type?: string | null
  is_new_development?: boolean | null
  room_number?: string | null
  address?: string | null
  price?: number | null
  monthly_rent?: number | null
  currency?: string | null
  size_sqm?: number | null
  bedrooms?: number | null
  cover?: string | null
  video_url?: string | null
  vr_url?: string | null
  project_id?: string | null
  project_name?: string | null
  lat?: number | null
  lng?: number | null
}

/** 地图点位查询参数。 */
export interface PublicMapPointQuery {
  limit?: number
  listing_type?: 'rent' | 'sell'
  property_type?: string
  is_new_development?: boolean
  district?: string
  city?: string
  min_lat?: number
  max_lat?: number
  min_lng?: number
  max_lng?: number
  q?: string
  price_min?: number
  price_max?: number
  has_video?: boolean
  has_vr?: boolean
  is_featured?: boolean
  owner_direct?: boolean
}

/** 匿名预约看房（`POST /public/viewings`）。 */
export interface PublicViewingPayload {
  listing_id?: string
  property_id?: string
  name: string
  phone: string
  email?: string
  /** ISO 字符串，必填且须为未来时间（不含时区，如 `2026-10-18T10:00:00`） */
  scheduled_at: string
  notes?: string
}

/** 城市/业务 key slug 化：小写 + 去掉空格/连字符/点/撇号/下划线。 */
export function slugCity(key?: string | null): string {
  return String(key ?? '')
    .toLowerCase()
    .replace(/[\s\-._']/g, '')
}

export interface PublicListingQuery {
  page?: number
  page_size?: number
  listing_type?: 'rent' | 'sell'
  q?: string
  /** 房源类型（多值，任一命中）：apartment/condo/villa/house/office/shop/factory */
  property_type?: string[]
  /** 新房/二手房（仅 sell 有意义） */
  is_new_development?: boolean
  district?: string
  city?: string
  price_min?: number
  price_max?: number
  area_min?: number
  area_max?: number
  bedrooms_min?: number
  bedrooms_max?: number
  decoration?: string
  /** 配套设施（多选任一命中）：aircon/pool/gym/parking/elevator/balcony */
  amenity?: string[]
  has_video?: boolean
  /** 有 VR 看房链接 */
  has_vr?: boolean
  /** 优选房源 */
  is_featured?: boolean
  /** 房东直租 */
  owner_direct?: boolean
  /* 商业/工业专项筛选（仅传 true 生效） */
  whole_floor_only?: boolean
  whole_building_only?: boolean
  company_registrable?: boolean
  environmental_permit?: boolean
  /** 房源状态（vacant/rented/reserved/maintenance） */
  status?: string
  /** 小区筛选：直接落 project_id */
  project_id?: string
  /** 区域/地铁的同义词组，后端任一命中即算匹配 */
  keywords?: string[]
  /** 学区找房：学校 ID + 半径（空间筛选，非「学区房」标签） */
  school_id?: string
  school_radius_km?: number
  sort?: 'latest' | 'price_asc' | 'price_desc' | 'area_desc' | 'distance'
}

/** 楼盘（项目）列表筛选：新房分类页的数据面。 */
export interface PublicProjectQuery {
  page?: number
  page_size?: number
  q?: string
  district?: string
  city?: string
  tenure?: string
  /** pre_sale / on_sale / sold_out */
  sale_status?: string
  /** true=有在售上架单；false=无在售上架单 */
  has_listings?: boolean
  price_min?: number
  price_max?: number
  sort?: 'hot' | 'price_asc' | 'price_desc' | 'open_date_desc'
}

export interface PublicInquiryPayload {
  name: string
  phone?: string
  wechat_id?: string
  line_id?: string
  email?: string
  message?: string
  listing_id?: string
  property_id?: string
  project_id?: string
  school_id?: string
  source?: string
}

/**
 * 分页响应统一解包。
 *
 * Taro 的 `request` 已经把 `res.data` 解出来了，所以这里的入参就是后端响应体本身；
 * 但仍做一次数组/信封的兼容判断：后端历史上有接口直接返回数组。
 */
export function unwrapPage<T>(payload: unknown): PublicPage<T> {
  const body = payload as
    | { items?: T[]; total?: number; page?: number; page_size?: number; pages?: number }
    | T[]
    | null
  if (Array.isArray(body)) {
    return { items: body, total: body.length, page: 1, page_size: body.length }
  }
  return {
    items: body?.items ?? [],
    total: body?.total ?? 0,
    page: body?.page ?? 1,
    page_size: body?.page_size ?? 20,
    pages: body?.pages
  }
}

/** 公开接口地址前缀。集中一处，避免各页面硬编码 `/public/...`。 */
const PUBLIC = '/public'

export const publicApi = {
  /**
   * 公开房源列表（服务端分页 + 筛选；school_id 走空间筛选并按距离排序）。
   *
   * `keywords` / `property_type` / `amenity` 单独拼到 URL 上：Taro 的 GET 序列化对数组
   * 用下标格式（`property_type[0]=office`），而 FastAPI 的 `List[str] = Query(...)` 只认重复键
   * （`property_type=office&property_type=shop`），混在一起传会被后端**静默忽略**——
   * 表现为「商铺办公/厂房入口勾选了类型、列表却完全没变」，且无任何报错。
   */
  listings: (params?: PublicListingQuery) => {
    const { keywords, property_type, amenity, ...rest } = params ?? {}
    const query = (
      [
        ['keywords', keywords],
        ['property_type', property_type],
        ['amenity', amenity]
      ] as const
    )
      .flatMap(([key, list]) =>
        Array.isArray(list)
          ? list.filter(Boolean).map((v) => `${key}=${encodeURIComponent(String(v))}`)
          : []
      )
      .join('&')
    return request<any>({
      url: `${PUBLIC}/listings${query ? `?${query}` : ''}`,
      method: 'GET',
      data: rest
    })
  },
  /** 公开房源详情 */
  listing: (id: string) => request<any>({ url: `${PUBLIC}/listings/${id}` }),
  /**
   * 区域聚合（找房/分类页「区域」筛选的真实数据面）。
   *
   * `property_type` 与 listings 同理单独拼重复键：Taro 的 GET 序列化对数组用下标
   * 格式，FastAPI 的 `List[str] = Query(...)` 只认重复键，混在 data 里传会被静默忽略。
   */
  districts: (params?: { city?: string; listing_type?: 'rent' | 'sell'; property_type?: string[] }) => {
    const { property_type, ...rest } = params ?? {}
    const query = Array.isArray(property_type)
      ? property_type.filter(Boolean).map((v) => `property_type=${encodeURIComponent(String(v))}`).join('&')
      : ''
    return request<any>({ url: `${PUBLIC}/districts${query ? `?${query}` : ''}`, method: 'GET', data: rest })
  },
  /** 城市聚合（key 为 slug 化形态，匹配 cityKey 前须 slugCity） */
  cities: () => request<any>({ url: `${PUBLIC}/cities`, method: 'GET' }),
  /** 地图找房点位（默认只返回所属楼盘有经纬度的房源） */
  mapPoints: (params?: PublicMapPointQuery) =>
    request<any>({ url: `${PUBLIC}/map-points`, method: 'GET', data: params }),
  /** 匿名预约看房（无需登录；scheduled_at 必填且须为未来时间） */
  viewings: (data: PublicViewingPayload) =>
    request<any>({ url: `${PUBLIC}/viewings`, method: 'POST', data }),
  /** 学校列表 */
  schools: (params?: {
    page?: number
    page_size?: number
    q?: string
    stage?: string
    curriculum?: string
  }) => request<any>({ url: `${PUBLIC}/schools`, method: 'GET', data: params }),
  /** 学校详情（含周边在租在售房源） */
  school: (id: string, params?: { radius_km?: number; limit?: number }) =>
    request<any>({ url: `${PUBLIC}/schools/${id}`, method: 'GET', data: params }),
  /** 小区（楼盘）列表（新房分类页数据面：含销售状态/在售筛选/均价区间/热度排序） */
  projects: (params?: PublicProjectQuery) =>
    request<any>({ url: `${PUBLIC}/projects`, method: 'GET', data: params }),
  /** 小区详情（含该小区房源） */
  project: (id: string, params?: { listing_limit?: number }) =>
    request<any>({ url: `${PUBLIC}/projects/${id}`, method: 'GET', data: params }),
  /**
   * 分类页聚合摘要（数据胶囊 + 行情对比 + 分类计数）。
   * `city` 不传=全国口径：定位城市名为中文，与库内英文 city 不匹配，故默认不限定城市。
   */
  listingCategorySummary: (params?: { city?: string }) =>
    request<any>({ url: `${PUBLIC}/listing-categories/summary`, method: 'GET', data: params }),
  /** 匿名留资（后端限流；至少留一种联系方式） */
  inquiry: (data: PublicInquiryPayload) =>
    request<any>({ url: `${PUBLIC}/inquiries`, method: 'POST', data })
}

/**
 * 免登录电子合同签署：PDF 页图地址（无鉴权，直接给 <Image src> 使用）。
 * 对应后端 `GET /public/contract-sign/{token}/pdf-pages/{page}`。
 */
export function publicContractSignPdfUrl(signToken: string, page: number): string {
  const baseURL = typeof API_BASE !== 'undefined' ? API_BASE : ''
  return `${baseURL}${PUBLIC}/contract-sign/${encodeURIComponent(signToken)}/pdf-pages/${page}`
}
