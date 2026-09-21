/**
 * C 端公开站点的共用工具：枚举文案映射、相册取值、双币换算。
 *
 * 与 Web 端 `frontend-web/src/lib/publicLabels.ts` + `lib/money.ts` 保持同一口径，
 * 避免三个端各写一遍导致文案/汇率不一致。
 */
import api from '@/lib/api';

/** i18n 的取词函数签名（`useI18n().t`）。标签函数接收它而不是自己去取，
 * 这样组件内只订阅一次语言变化，也不需要把标签函数写进 hooks 依赖。 */
export type TFunction = (key: string, params?: Record<string, string | number>) => string;

const translate = (
  group: string,
  value: string | null | undefined,
  t: TFunction,
): string => {
  if (!value) return '';
  const key = `pub.${group}.${value}`;
  const text = t(key);
  // 缺 key 时 i18n 会回显 key 本身，此时直接展示后端原值反而更可读
  return text === key ? value : text;
};

export const orientationLabel = (v: string | null | undefined, t: TFunction) =>
  translate('orientation', v, t);
export const decorationLabel = (v: string | null | undefined, t: TFunction) =>
  translate('decoration', v, t);
export const schoolStageLabel = (v: string | null | undefined, t: TFunction) =>
  translate('stage', v, t);
export const curriculumLabel = (v: string | null | undefined, t: TFunction) =>
  translate('curriculum', v, t);
export const tenureLabel = (v: string | null | undefined, t: TFunction) =>
  translate('tenure', v, t);
export const listingTypeLabel = (v: string | null | undefined, t: TFunction) =>
  translate('listingType', v, t);

/** 供筛选器渲染的枚举取值表（顺序即展示顺序，与后端枚举一致）。 */
export const STAGE_OPTIONS = [
  'kindergarten',
  'primary',
  'secondary',
  'high_school',
  'university',
  'k12',
] as const;

export const CURRICULUM_OPTIONS = [
  'ib',
  'american',
  'british',
  'french',
  'german',
  'japanese',
  'thai',
  'bilingual',
  'other',
] as const;

export const SCHOOL_RADIUS_OPTIONS = [1, 3, 5, 10] as const;

/** 照片字段历史上出现过 `string[]` 与 `{url|path}[]` 两种形态，统一取 URL。 */
export const photoUrl = (item: unknown): string | null => {
  if (typeof item === 'string') return item;
  if (item && typeof item === 'object') {
    const record = item as Record<string, unknown>;
    const value = record.url ?? record.path;
    if (typeof value === 'string') return value;
  }
  return null;
};

export const photoUrls = (photos: unknown): string[] => {
  if (!Array.isArray(photos)) return [];
  return photos.map(photoUrl).filter((url): url is string => !!url);
};

/** 卡片封面：优先用后端裁好的 `cover`，没有再从相册里取第一张。 */
export const coverOf = (item: { cover?: string | null; photos?: unknown[] | null }): string | null =>
  item.cover || photoUrls(item.photos)[0] || null;

// ==================== 双币展示 ====================

/**
 * 换算率兜底值（1 单位外币 = 多少泰铢）。
 *
 * 这里的数字只是**兜底**：真实汇率由 `loadRates()` 从 `GET /public/exchange-rates`
 * 拉取覆盖。此前各端硬编码 `CNY = 5.2`，与市场实际（约 4.97）偏离 4.6%，
 * 双币并排展示时会直接把人民币报价算错——汇率必须在服务端统一。
 */
const RATES: Record<string, number> = { THB: 1, CNY: 4.97, USD: 36, EUR: 39, RM: 10 };

let ratesLoaded = false;

/**
 * 从服务端拉取最新汇率覆盖兜底值。
 * 失败时静默保持兜底值——汇率是展示增强，不该因它让页面挂掉。
 */
export async function loadRates(): Promise<void> {
  if (ratesLoaded) return;
  try {
    const res: any = await api.get('/public/exchange-rates');
    const rates = res?.data?.rates_to_thb;
    if (rates && typeof rates === 'object') {
      Object.assign(RATES, rates);
      RATES.THB = 1;
      ratesLoaded = true;
    }
  } catch {
    /* 静默降级 */
  }
}

/** 泰铢 → 目标币种（默认人民币，供「≈ ¥N」副价使用）。 */
export function convertFromThb(amountThb: number, to = 'CNY'): number {
  const rate = RATES[to.toUpperCase()] || 1;
  return Number((Number(amountThb || 0) / rate).toFixed(0));
}

/** 读取当前汇率表（调试/展示用）。 */
export const currentRates = (): Record<string, number> => ({ ...RATES });
