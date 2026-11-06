/**
 * C 端展示用的「可缺失数值」工具。
 *
 * 后端楼盘/房源档案有很多可空字段（bedrooms、size_sqm、district、city 等），
 * 直接 `?? 0` / `|| 0` 会把「没录入」渲染成「0 室」「0㎡」，用户看到的是错数据。
 * 这里统一：缺失 → null，展示层直接隐藏该段，而不是补 0。
 */

/** 宽松数值解析：null / undefined / '' / NaN 一律返回 null（区别于 0）。 */
export function optionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : null;
}

/** 把若干段文案拼起来，缺失段（null/undefined/空串）直接省略；全空返回 null。 */
export function joinFacts(
  parts: (string | null | undefined)[],
  separator = ' · ',
): string | null {
  const kept = parts.filter((part): part is string => !!part && part.trim() !== '');
  return kept.length ? kept.join(separator) : null;
}
