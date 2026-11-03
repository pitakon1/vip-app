/**
 * 「上架」一键提交载荷：完全由该房源档案派生（后端按 property_id 定位档案，仅校验归属）。
 *
 * 三端（Web / App / 小程序）统一口径，后端契约见
 * backend/app/api/v1/listings.py::ListingCreate：float/int 只接受 null 或数字（空串 422），
 * bool 只接受布尔，str 不接受数字。因此提交前统一归一：空串/纯符号按「未填」→ undefined，
 * 带单位/千分位的数值提取数字。
 */

/** 数值归一：null、""、非数字（含单位/千分位）→ undefined，避免 "" 或 NaN 触发 422。 */
const toNum = (v: unknown): number | undefined => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined
  if (v === null || v === undefined) return undefined
  const s = String(v).trim()
  if (!s) return undefined
  const n = Number(s.replace(/,/g, '').replace(/[^0-9.+-]/g, ''))
  return Number.isFinite(n) ? n : undefined
}

/** 布尔归一：表单里可能出现 "false"/"0"/"否"，!!"false" 会误判为 true。 */
const toBool = (v: unknown, fallback = false): boolean => {
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase()
    if (!s) return fallback
    return !['false', '0', 'no', 'off', '否'].includes(s)
  }
  if (v === null || v === undefined) return fallback
  return !!v
}

/** 可选字符串归一：空串按「未填」处理，不把 "" 塞给后端 Optional[str]。 */
const toStr = (v: unknown): string | undefined => {
  if (v === null || v === undefined) return undefined
  const s = String(v).trim()
  return s || undefined
}

/** 可选布尔：未填保持 undefined，不覆盖后端存量数据。 */
const toOptBool = (v: unknown): boolean | undefined =>
  v === null || v === undefined || (typeof v === 'string' && !v.trim())
    ? undefined
    : toBool(v)

/**
 * 房源档案 → 上架 payload 的输入形状。
 * 字段来自「房源档案」详情（表单 + 后端 GET /properties/:id），
 * 本文件不 import 档案类型以免循环依赖，用接口就地声明。
 */
interface ListingSource {
  id: string | number
  room_number?: string | number | null
  address?: string | null
  property_type?: string | null
  size_sqm?: number | string | null
  area?: number | string | null
  bedrooms?: number | string | null
  bathrooms?: number | string | null
  description?: string | null
  photos?: unknown[] | null
  furnished?: boolean | string | number | null
  video_url?: string | null
  vr_url?: string | null
  ceiling_height_m?: number | string | null
  land_area_sqm?: number | string | null
  floor_loading_kg_sqm?: number | string | null
  column_spacing?: string | null
  power_capacity_kva?: number | string | null
  environmental_permit?: boolean | string | null
  whole_floor_only?: boolean | string | null
  whole_building_only?: boolean | string | null
  company_registrable?: boolean | string | null
  monthly_rent?: number | string | null
  rentPrice?: number | string | null
  currency?: string | null
  owner_id?: string | number | null
  [key: string]: unknown
}

export const buildListingPayload = (p: ListingSource) => ({
  property_id: p.id,
  room_number: p.room_number || p.address || '-',
  address: p.address || p.room_number || '-',
  property_type: p.property_type || 'apartment',
  size_sqm: toNum(p.size_sqm) ?? toNum(p.area),
  bedrooms: toNum(p.bedrooms),
  bathrooms: toNum(p.bathrooms),
  description: toStr(p.description),
  photos: Array.isArray(p.photos) && p.photos.length ? p.photos : undefined,
  furnished: toBool(p.furnished),
  video_url: toStr(p.video_url),
  vr_url: toStr(p.vr_url),
  ceiling_height_m: toNum(p.ceiling_height_m),
  land_area_sqm: toNum(p.land_area_sqm),
  floor_loading_kg_sqm: toNum(p.floor_loading_kg_sqm),
  column_spacing: toStr(p.column_spacing),
  power_capacity_kva: toNum(p.power_capacity_kva),
  environmental_permit: toOptBool(p.environmental_permit),
  whole_floor_only: toOptBool(p.whole_floor_only),
  whole_building_only: toOptBool(p.whole_building_only),
  company_registrable: toOptBool(p.company_registrable),
  listing_type: 'rent' as const,
  monthly_rent: toNum(p.monthly_rent) ?? toNum(p.rentPrice),
  currency: p.currency || 'THB',
  owner_id: p.owner_id ?? undefined,
})
