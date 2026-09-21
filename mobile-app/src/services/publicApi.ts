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
  furnished?: boolean;
  cover?: string | null;
  video_url?: string | null;
  listing_no?: string | null;
  monthly_rent?: number | null;
  asking_price?: number | null;
  photos?: unknown[] | null;
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
  sale_count?: number;
  rent_count?: number;
  sale_price_min?: number | null;
  sale_price_max?: number | null;
  rent_price_min?: number | null;
  rent_price_max?: number | null;
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
  /** 公开房源列表（服务端分页 + 筛选；school_id 走空间筛选并按距离排序） */
  listings: (params?: PublicListingQuery) => api.get('/public/listings', { params }),
  /** 公开房源详情 */
  listing: (id: string) => api.get(`/public/listings/${id}`),
  /** 学校列表 */
  schools: (params?: { page?: number; page_size?: number; q?: string; stage?: string; curriculum?: string }) =>
    api.get('/public/schools', { params }),
  /** 学校详情（含周边在租在售房源） */
  school: (id: string, params?: { radius_km?: number; limit?: number }) =>
    api.get(`/public/schools/${id}`, { params }),
  /** 小区（楼盘）列表 */
  projects: (params?: { page?: number; page_size?: number; q?: string }) =>
    api.get('/public/projects', { params }),
  /** 小区详情（含该小区房源） */
  project: (id: string, params?: { listing_limit?: number }) =>
    api.get(`/public/projects/${id}`, { params }),
  /** 匿名留资（后端限流；至少留一种联系方式） */
  inquiry: (data: PublicInquiryPayload) => api.post('/public/inquiries', data),
  /** 公开汇率（C 端双币展示的数据源，避免前端各自硬编码） */
  exchangeRates: () => api.get('/public/exchange-rates'),
};
