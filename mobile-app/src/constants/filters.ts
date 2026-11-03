/**
 * 筛选档位常量（App）。
 *
 * 价格 / 面积 / 学校半径的档位边界都收在这里，页面只负责把 key 映射成文案，
 * 不再各写一份数字。`max = Infinity` 表示该档位无上限。
 */
export interface RangePreset {
  key: string;
  min: number;
  max: number;
}

/** 价格区间（月租，THB）：≤3 万 / 3-5 万 / 5-8 万 / ≥8 万。 */
export const PRICE_PRESETS: RangePreset[] = [
  { key: '', min: 0, max: Infinity },
  { key: 'u3', min: 0, max: 30000 },
  { key: '3-5', min: 30000, max: 50000 },
  { key: '5-8', min: 50000, max: 80000 },
  { key: 'g8', min: 80000, max: Infinity },
];

/** 面积区间（㎡）：≤50 / 50-100 / 100-150 / 150-200 / ≥200。 */
export const AREA_PRESETS: RangePreset[] = [
  { key: '', min: 0, max: Infinity },
  { key: 'u50', min: 0, max: 50 },
  { key: '50-100', min: 50, max: 100 },
  { key: '100-150', min: 100, max: 150 },
  { key: '150-200', min: 150, max: 200 },
  { key: 'g200', min: 200, max: Infinity },
];

/** 按学校找房的半径档位（km）。 */
export const SCHOOL_RADIUS_OPTIONS = [1, 3, 5, 10] as const;

/** 学校详情页默认展示的周边房源半径（km）。 */
export const DEFAULT_SCHOOL_RADIUS_KM = 5;
