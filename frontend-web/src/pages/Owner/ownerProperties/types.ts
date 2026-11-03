export interface OwnerProperty {
  id: string
  room_number?: string
  project_id?: string
  project_name?: string
  name?: string
  status: string
  monthly_rent?: number
  sale_price?: number
  currency?: string
  address?: string
  city?: string
  size_sqm?: number
  bedrooms?: number
  bathrooms?: number
  building?: string
  floor?: number
  property_type?: string
  furnished?: boolean
  available_from?: string
  description?: string
  photos?: string[]
  video_url?: string
  deposit_amount?: number
  deposit_months?: number
  [key: string]: any
}

/** 本地筛选条件（全部为客户端过滤，保持原有行为） */
export interface OwnerPropertyFilters {
  keyword: string
  status: string
  /** ''=不限, '0'=单间, '1'/'2'/'3'=精确居室, '4'=4室及以上 */
  bedrooms: string
  /** ''=不限, 预设区间 key（如 '5000-10000'/'50000+'）, 'custom'=自定义 */
  priceRange: string
  priceCustomMin: string
  priceCustomMax: string
  /** ''=不限, 预设区间 key（如 '50-100'/'200+'）, 'custom'=自定义 */
  areaRange: string
  areaCustomMin: string
  areaCustomMax: string
  sort: string
}

export interface OwnerPropertyStatusCounts {
  vacant: number
  rented: number
  for_sale: number
}
