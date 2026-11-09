/**
 * C 端展示用的「可缺失数值」工具。
 *
 * 后端房源/楼盘档案有大量可空字段（bedrooms、bathrooms、size_sqm、price…），
 * 直接 `|| 0` 会把「没录入」渲染成「0 室 / 0㎡ / ₿0」，是错数据而不是空数据。
 * 统一约定：缺失 → null，展示层隐藏该段。
 */

/** 宽松数值解析：null / undefined / '' / NaN 一律返回 null（区别于 0）。 */
export function optionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const num = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(num) ? num : null
}

/** 拼接若干段文案，缺失段（null/undefined/空串）省略；全空返回 null。 */
export function joinFacts(
  parts: (string | null | undefined)[],
  separator = ' · ',
): string | null {
  const kept = parts.filter((part): part is string => !!part && part.trim() !== '')
  return kept.length ? kept.join(separator) : null
}

export interface RoomFacts {
  bedrooms: number | null
  bathrooms: number | null
  sizeSqm: number | null
}

/**
 * 房源户型三件套（室/卫/面积）的统一入口。
 *
 * 三处卡片（租客首页、业主我的房源、管理端房源列表）共用它，保证缺失字段
 * 一律是 null，由调用方「不渲染该段」，绝不补 0 变成「0卧0浴」的假数据。
 */
export function roomFacts(item: {
  bedrooms?: unknown
  bathrooms?: unknown
  size_sqm?: unknown
}): RoomFacts {
  return {
    bedrooms: optionalNumber(item.bedrooms),
    bathrooms: optionalNumber(item.bathrooms),
    sizeSqm: optionalNumber(item.size_sqm),
  }
}

/** 把 roomFacts 结果拼成一行（如「2卧2浴 · 88㎡」）；全部缺失返回 null。 */
export function formatRoomFacts(
  facts: RoomFacts,
  labels: {
    bed: (n: number) => string
    bath: (n: number) => string
    size: (n: number) => string
  },
): string | null {
  return joinFacts([
    facts.bedrooms == null ? null : labels.bed(facts.bedrooms),
    facts.bathrooms == null ? null : labels.bath(facts.bathrooms),
    facts.sizeSqm == null ? null : labels.size(facts.sizeSqm),
  ])
}
