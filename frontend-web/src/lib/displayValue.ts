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
