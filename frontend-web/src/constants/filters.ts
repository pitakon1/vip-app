/**
 * 筛选档位常量（Web）。
 *
 * 价格 / 面积 / 学校半径的档位边界都收在这里，页面只负责把 key 映射成文案，
 * 不再各写一份数字。`max = null` 表示该档位无上限。
 */
export interface RangeTier {
  key: string
  min: number
  max: number | null
}

/** 面积档位（㎡）：≤50 / 50-100 / 100-200 / ≥200。 */
export const AREA_TIERS: RangeTier[] = [
  { key: '0-50', min: 0, max: 50 },
  { key: '50-100', min: 50, max: 100 },
  { key: '100-200', min: 100, max: 200 },
  { key: '200+', min: 200, max: null },
]

/** 价格档位（THB）：≤5000 / 5000-10000 / 10000-20000 / 20000-50000 / ≥50000。 */
export const PRICE_TIERS: RangeTier[] = [
  { key: '0-5000', min: 0, max: 5000 },
  { key: '5000-10000', min: 5000, max: 10000 },
  { key: '10000-20000', min: 10000, max: 20000 },
  { key: '20000-50000', min: 20000, max: 50000 },
  { key: '50000+', min: 50000, max: null },
]

/** 按学校找房的半径档位（km）。 */
export const SCHOOL_RADIUS_OPTIONS = [1, 3, 5, 10] as const

/** 学校详情页默认展示的周边房源半径（km）。 */
export const DEFAULT_SCHOOL_RADIUS_KM = 5
