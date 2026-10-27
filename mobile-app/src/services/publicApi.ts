/**
 * C 端公开接口层（匿名可访问）。
 *
 * 为什么要单独一层：站内 B 端接口（`/properties`、`/listings`、`/sale-listings`）
 * 全部强制鉴权，匿名请求直接 401；而本端此前**整站都挂在登录墙后面**
 * （`RootNavigator` 未登录时只挂 Login/Register），C 端内容在 App 里根本进不来。
 * 本模块对接后端 `app/api/v1/public.py` 的匿名层，是「浏览不需注册、只在需要
 * 登录的动作上才要求注册」这条产品原则在移动端的落点。
 *
 * 安全边界由后端保证，前端只需注意：
 * - 响应体里**不含**业主联系方式、佣金配置（`*_rate` / `split_option`）、
 *   去重键、审核痕迹 —— 这些字段后端已裁剪，前端**不要再自行拼装或推断了**；
 * - 只返回 `status=active` 的上架单；
 * - 除留资（`inquiry`）外全部是只读接口。
 */
import api from '@/lib/api';

/** 公开房源卡片。价格已由后端统一成 `price` 字段（租=月租、售=挂牌价）。 */
export interface PublicListing {
  id: string;
  property_id?: string | null;
  listing_type?: 'rent' | 'sell' | string | null;
  /** 房源类型：apartment/condo/villa/house/office/shop/factory…（分类页卡片徽标） */
  property_type?: string | null;
  room_number?: string | null;
  address?: string | null;
  district?: string | null;
  city?: string | null;
  project_id?: string | null;
  project_name?: string | null;
  price?: number | null;
  currency?: string | null;
  size_sqm?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  floor?: number | null;
  building?: string | null;
  orientation?: string | null;
  decoration?: string | null;
  amenities?: unknown[] | null;
  furnished?: boolean;
  cover?: string | null;
  video_url?: string | null;
  listing_no?: string | null;
  monthly_rent?: number | null;
  asking_price?: number | null;
  photos?: unknown[] | null;
  /** 竣工年份（来自所属楼盘）：二手房卡片据此算楼龄 */
  completion_year?: number | null;
  /** 日租金/㎡（仅商业/工业类目的租单有值，派生 = 月租/面积/30） */
  rent_per_sqm_day?: number | null;
  // 商业/工业专项字段
  ceiling_height_m?: number | null;
  land_area_sqm?: number | null;
  floor_loading_kg_sqm?: number | null;
  column_spacing?: string | null;
  power_capacity_kva?: number | null;
  environmental_permit?: boolean | null;
  whole_floor_only?: boolean | null;
  whole_building_only?: boolean | null;
  company_registrable?: boolean | null;
  /** 全景看房 / 视频 */
  vr_url?: string | null;
  /** 优选（平台严选） */
  is_featured?: boolean;
  /** 房东直租 / 业主直售 */
  owner_direct?: boolean;
  /** 真房源保鲜：已核验标签 */
  verification_status?: string | null;
  last_verified_at?: string | null;
  verified_days_ago?: number | null;
  /** 带学校筛选时后端回填的最近学校与距离 */
  nearest_school_name?: string | null;
  nearest_school_km?: number | null;
}

/** 房源详情：卡片 + 相册 / 楼盘 / 周边学校 / 经纪人 / 押金。 */
export interface PublicListingDetail extends PublicListing {
  description?: string | null;
  deposit_amount?: number | null;
  deposit_months?: number | null;
  lat?: number | null;
  lng?: number | null;
  project?: PublicProjectBrief | null;
  nearby_schools?: PublicNearbySchool[];
  broker?: PublicBroker | null;
}

export interface PublicProjectBrief {
  id?: string | null;
  name?: string | null;
  address?: string | null;
  district?: string | null;
  city?: string | null;
  total_units?: number | null;
  total_buildings?: number | null;
  total_floors?: number | null;
  parking_spaces?: number | null;
  completion_year?: number | null;
  management_fee_per_sqm?: number | null;
  avg_price?: number | null;
  tenure?: string | null;
  foreign_quota_pct?: number | null;
  developer_name?: string | null;
  nearest_subway?: string | null;
}

export interface PublicNearbySchool {
  id?: string | null;
  name?: string | null;
  name_en?: string | null;
  stage?: string | null;
  curriculum?: string | null;
  district?: string | null;
  distance_km?: number | null;
}

export interface PublicBroker {
  company?: string | null;
  real_name?: string | null;
  phone?: string | null;
  wechat?: string | null;
  line?: string | null;
  whatsapp?: string | null;
}

export interface PublicSchool {
  id: string;
  name?: string | null;
  name_en?: string | null;
  stage?: string | null;
  curriculum?: string | null;
  district?: string | null;
  city?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  student_count?: number | null;
  age_range?: string | null;
  tuition_range?: string | null;
  phone?: string | null;
  website?: string | null;
  cover_url?: string | null;
  description?: string | null;
  photos?: unknown[] | null;
}

export interface PublicSchoolDetail extends PublicSchool {
  nearby_listings?: PublicListing[];
}

export interface PublicProject {
  id: string;
  name?: string | null;
  address?: string | null;
  district?: string | null;
  city?: string | null;
  cover?: string | null;
  total_units?: number | null;
  completion_year?: number | null;
  tenure?: string | null;
  developer_name?: string | null;
  /** 销售状态：pre_sale / on_sale / sold_out（新房页「在售/待售」口径） */
  sale_status?: string | null;
  /** 最近地铁站（新房卡片「近地铁」标签） */
  nearest_subway?: string | null;
  sale_count?: number;
  rent_count?: number;
  sale_price_min?: number | null;
  sale_price_max?: number | null;
  rent_price_min?: number | null;
  rent_price_max?: number | null;
  /** 在售套数（该项目下在售上架单实时聚合） */
  listing_count?: number;
  /** 近 7 日成交套数 */
  recent_deal_count?: number;
  /** 建面下限/上限（㎡） */
  size_min?: number | null;
  size_max?: number | null;
  /** 户型集合（如 [2,3]） */
  bedroom_options?: number[] | null;
}

/** 新房页（楼盘视角）的查询参数，与后端 /public/projects 一一对应。 */
export interface PublicProjectQuery {
  page?: number;
  page_size?: number;
  q?: string;
  district?: string;
  city?: string;
  tenure?: string;
  sale_status?: 'pre_sale' | 'on_sale' | 'sold_out';
  has_listings?: boolean;
  price_min?: number;
  price_max?: number;
  sort?: 'hot' | 'price_asc' | 'price_desc' | 'open_date_desc';
}

/** 分类页顶部「数据胶囊 + 行情对比」的聚合摘要。 */
export interface PublicCategorySummary {
  city?: string | null;
  on_sale_projects: number;
  opened_this_month: number;
  new_projects_7d: number;
  unsold_projects: number;
  rent_count: number;
  sell_count: number;
  new_count: number;
  resale_count: number;
  office_shop_count: number;
  factory_count: number;
  district_price_pairs: { district: string; avg_price: number }[];
}

export interface PublicProjectDetail extends PublicProject {
  total_buildings?: number | null;
  total_floors?: number | null;
  parking_spaces?: number | null;
  management_fee_per_sqm?: number | null;
  avg_price?: number | null;
  foreign_quota_pct?: number | null;
  listings?: PublicListing[];
}

/** 后端统一分页信封（`app/core/pagination.py` 的 Page）。 */
export interface PublicPage<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages?: number;
}

/** 公开房源列表的筛选参数。字段名与后端 query 参数一一对应。 */
export interface PublicListingQuery {
  page?: number;
  page_size?: number;
  listing_type?: 'rent' | 'sell';
  /** 房源类型（多值，任一命中）：商铺办公=office+shop、厂房=factory */
  property_type?: string[];
  /** 新房/二手房：true=新房，false=二手房；不传=全部 */
  is_new_development?: boolean;
  q?: string;
  price_min?: number;
  price_max?: number;
  area_min?: number;
  area_max?: number;
  bedrooms_min?: number;
  bedrooms_max?: number;
  /** 学区找房：学校 ID + 半径（空间筛选，非「学区房」标签） */
  school_id?: string;
  school_radius_km?: number;
  sort?: 'latest' | 'price_asc' | 'price_desc' | 'area_desc' | 'distance';
  // ---- 分类页补充筛选 ----
  district?: string;
  city?: string;
  decoration?: string;
  /** 配套设施（多值，任一命中） */
  amenity?: string[];
  has_video?: boolean;
  /** 全景看房（vr_url 非空） */
  has_vr?: boolean;
  /** 平台优选 */
  is_featured?: boolean;
  /** 房东直租 / 业主直售 */
  owner_direct?: boolean;
  /** 商业/工业专项：只在 true 时收敛（未录入 != 否） */
  whole_floor_only?: boolean;
  whole_building_only?: boolean;
  company_registrable?: boolean;
  environmental_permit?: boolean;
}

export interface PublicInquiryPayload {
  name: string;
  phone?: string;
  wechat_id?: string;
  line_id?: string;
  email?: string;
  message?: string;
  listing_id?: string;
  property_id?: string;
  project_id?: string;
  school_id?: string;
  source?: string;
}

/** 区域（区域下拉 / 行情对比的数据面，含套数与均价）。 */
export interface PublicDistrict {
  district: string;
  listing_count: number;
  project_count: number;
  avg_price: number | null;
}

/** 有数据的城市（`key` 为库内城市名 slug 形态，与定位 Store 的 cityKey 需 slug 后比对）。 */
export interface PublicCity {
  key: string;
  name: string;
  listing_count: number;
  project_count: number;
}

/** 地图点位（仅含所属楼盘带经纬度的在架单）。 */
export interface PublicMapPoint {
  id: string;
  listing_type?: string | null;
  property_type?: string | null;
  is_new_development?: boolean | null;
  room_number?: string | null;
  address?: string | null;
  price?: number | null;
  monthly_rent?: number | null;
  currency?: string | null;
  size_sqm?: number | null;
  bedrooms?: number | null;
  cover?: string | null;
  video_url?: string | null;
  vr_url?: string | null;
  project_id?: string | null;
  project_name?: string | null;
  lat?: number | null;
  lng?: number | null;
}

/** 地图点位查询参数（字段名与后端 query 一一对应）。 */
export interface PublicMapPointQuery {
  limit?: number;
  listing_type?: 'rent' | 'sell';
  property_type?: string[];
  is_new_development?: boolean;
  district?: string;
  city?: string;
  min_lat?: number;
  max_lat?: number;
  min_lng?: number;
  max_lng?: number;
  q?: string;
  keywords?: string[];
  price_min?: number;
  price_max?: number;
  has_video?: boolean;
  has_vr?: boolean;
  is_featured?: boolean;
  owner_direct?: boolean;
}

/** 匿名预约看房入参（scheduled_at 必填且须为未来时间）。 */
export interface PublicViewingPayload {
  listing_id?: string;
  property_id?: string;
  name: string;
  phone: string;
  email?: string;
  scheduled_at: string;
  notes?: string;
}

/** 分页响应的统一解包：后端可能返回 `{items}` 信封，也可能直接返回数组。 */
export function unwrapPage<T>(payload: unknown): PublicPage<T> {
  const body = payload as { items?: T[]; total?: number; page?: number; page_size?: number; pages?: number } | T[] | null;
  if (Array.isArray(body)) {
    return { items: body, total: body.length, page: 1, page_size: body.length };
  }
  return {
    items: body?.items ?? [],
    total: body?.total ?? 0,
    page: body?.page ?? 1,
    page_size: body?.page_size ?? 20,
    pages: body?.pages,
  };
}

export const publicApi = {
  /** App 首页聚合：8 个 rail 一次取回（后端口径与各分类页一致，只取第 1 页） */
  home: () => api.get('/public/home'),
  /** 公开房源列表（服务端分页 + 筛选；school_id 走空间筛选并按距离排序） */
  listings: (params?: PublicListingQuery) => api.get('/public/listings', { params }),
  /** 公开房源详情 */
  listing: (id: string) => api.get(`/public/listings/${id}`),
  /** 相似房源推荐（详情页「猜你喜欢」） */
  similar: (id: string) => api.get(`/public/listings/${id}/similar`),
  /** 学校列表 */
  schools: (params?: { page?: number; page_size?: number; q?: string; stage?: string; curriculum?: string }) =>
    api.get('/public/schools', { params }),
  /** 学校详情（含周边在租在售房源） */
  school: (id: string, params?: { radius_km?: number; limit?: number }) =>
    api.get(`/public/schools/${id}`, { params }),
  /** 楼盘（新房分类页）列表：支持销售状态/是否在售/均价区间/排序 */
  projects: (params?: PublicProjectQuery) => api.get('/public/projects', { params }),
  /** 小区详情（含该小区房源） */
  project: (id: string, params?: { listing_limit?: number }) =>
    api.get(`/public/projects/${id}`, { params }),
  /** 分类页聚合摘要（数据胶囊 + 行情对比 + 分类计数） */
  listingCategorySummary: (params?: { city?: string }) =>
    api.get('/public/listing-categories/summary', { params }),
  /** 区域列表（分类页「区域」下拉；`city` 传定位 cityKey，后端 slug 归一化） */
  districts: (params?: { city?: string; listing_type?: 'rent' | 'sell'; property_type?: string[] }) =>
    api.get('/public/districts', { params }),
  /** 有数据的城市（key 为 slug 形态，需与 cityKey slug 后比对） */
  cities: () => api.get('/public/cities'),
  /** 地图点位（覆盖租/售/新房/二手房/商办/厂房；仅返回楼盘带经纬度的房源） */
  mapPoints: (params?: PublicMapPointQuery) => api.get('/public/map-points', { params }),
  /** 匿名预约看房（未登录可提交，scheduled_at 须为未来时间） */
  createViewing: (data: PublicViewingPayload) => api.post('/public/viewings', data),
  /** 匿名留资（后端限流；至少留一种联系方式） */
  inquiry: (data: PublicInquiryPayload) => api.post('/public/inquiries', data),
  /** 公开汇率（C 端双币展示的数据源，避免前端各自硬编码） */
  exchangeRates: () => api.get('/public/exchange-rates'),
};
