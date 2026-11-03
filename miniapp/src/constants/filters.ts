/**
 * 筛选档位常量（小程序）。
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

/** 面积档位（㎡，5 档）：≤50 / 50-100 / 100-150 / 150-200 / ≥200。 */
export const AREA_TIERS_5: RangeTier[] = [
  { key: '0-50', min: 0, max: 50 },
  { key: '50-100', min: 50, max: 100 },
  { key: '100-150', min: 100, max: 150 },
  { key: '150-200', min: 150, max: 200 },
  { key: '200+', min: 200, max: null },
]

/** 价格档位（THB/月）：≤30000 / 30000-50000 / 50000-80000 / ≥80000。 */
export const PRICE_TIERS: RangeTier[] = [
  { key: 'u3', min: 0, max: 30000 },
  { key: '3-5', min: 30000, max: 50000 },
  { key: '5-8', min: 50000, max: 80000 },
  { key: 'g8', min: 80000, max: null },
]

/** 按学校找房的半径档位（km）。 */
export const SCHOOL_RADIUS_OPTIONS = [1, 3, 5, 10] as const

/** 学校详情页默认展示的周边房源半径（km）。 */
export const DEFAULT_SCHOOL_RADIUS_KM = 5
