/**
 * C 端公开站点的共用工具：枚举文案映射、相册取值、双币换算。
 *
 * 与 Web 端 `lib/publicLabels.ts` + `lib/money.ts`、以及 RN 端
 * `mobile-app/src/lib/publicSite.ts` 保持同一口径。
 *
 * 小程序端没有 i18n（全站中文硬编码），因此这里直接返回中文字面量，不接 t()。
 */
import { request } from '@/lib/api'

const ORIENTATION: Record<string, string> = {
  north: '朝北',
  south: '朝南',
  east: '朝东',
  west: '朝西',
  northeast: '朝东北',
  northwest: '朝西北',
  southeast: '朝东南',
  southwest: '朝西南'
}

const DECORATION: Record<string, string> = {
  bare: '毛坯',
  simple: '简装',
  standard: '精装',
  luxury: '豪装',
  fully_furnished: '带家具家电'
}

const STAGE: Record<string, string> = {
  kindergarten: '幼儿园',
  primary: '小学',
  secondary: '中学',
  high_school: '高中',
  university: '大学',
  k12: '一贯制（K12）'
}

const CURRICULUM: Record<string, string> = {
  ib: 'IB 国际文凭',
  american: '美制',
  british: '英制',
  french: '法式',
  german: '德式',
  japanese: '日式',
  thai: '泰制',
  bilingual: '双语',
  other: '其他'
}

const TENURE: Record<string, string> = {
  freehold: '永久产权',
  leasehold: '租赁产权',
  mixed: '混合产权'
}

const LISTING_TYPE: Record<string, string> = {
  rent: '出租',
  sell: '出售'
}

/** 未知取值原样返回，比显示空白更可读（后端新增枚举时不至于丢信息）。 */
const pick = (map: Record<string, string>, value?: string | null): string =>
  value ? map[value] ?? value : ''

export const orientationLabel = (value?: string | null) => pick(ORIENTATION, value)
export const decorationLabel = (value?: string | null) => pick(DECORATION, value)
export const schoolStageLabel = (value?: string | null) => pick(STAGE, value)
export const curriculumLabel = (value?: string | null) => pick(CURRICULUM, value)
export const tenureLabel = (value?: string | null) => pick(TENURE, value)
export const listingTypeLabel = (value?: string | null) => pick(LISTING_TYPE, value)

/** 供筛选器渲染的枚举取值表（顺序即展示顺序，与后端枚举一致）。 */
export const STAGE_OPTIONS = [
  ['', '全部'],
  ['kindergarten', STAGE.kindergarten],
  ['primary', STAGE.primary],
  ['secondary', STAGE.secondary],
  ['high_school', STAGE.high_school],
  ['university', STAGE.university],
  ['k12', STAGE.k12]
] as const

export const CURRICULUM_OPTIONS = [
  ['', '全部'],
  ['ib', CURRICULUM.ib],
  ['american', CURRICULUM.american],
  ['british', CURRICULUM.british],
  ['french', CURRICULUM.french],
  ['german', CURRICULUM.german],
  ['japanese', CURRICULUM.japanese],
  ['thai', CURRICULUM.thai],
  ['bilingual', CURRICULUM.bilingual],
  ['other', CURRICULUM.other]
] as const

export const SCHOOL_RADIUS_OPTIONS = [1, 3, 5, 10] as const

/** 照片字段历史上出现过 `string[]` 与 `{url|path}[]` 两种形态，统一取 URL。 */
export const photoUrl = (item: unknown): string | null => {
  if (typeof item === 'string') return item
  if (item && typeof item === 'object') {
    const record = item as Record<string, unknown>
    const value = record.url ?? record.path
    if (typeof value === 'string') return value
  }
  return null
}

export const photoUrls = (photos: unknown): string[] => {
  if (!Array.isArray(photos)) return []
  return photos.map(photoUrl).filter((url): url is string => !!url)
}

/** 卡片封面：优先用后端裁好的 `cover`，没有再从相册取第一张。 */
export const coverOf = (item: { cover?: string | null; photos?: unknown[] | null }): string =>
  item.cover || photoUrls(item.photos)[0] || ''

// ==================== 双币展示 ====================

/**
 * 换算率兜底值（1 单位外币 = 多少泰铢）。
 *
 * 只是**兜底**：真实汇率由 `loadRates()` 从 `GET /public/exchange-rates` 拉取覆盖。
 * 此前各端硬编码 `CNY = 5.2`，与市场实际（约 4.97）偏离 4.6%，双币并排展示时
 * 会把人民币报价算错。汇率一律以服务端为准。
 */
const RATES: Record<string, number> = { THB: 1, CNY: 4.97, USD: 36, EUR: 39, RM: 10 }

let ratesLoaded = false

/** 拉取服务端汇率覆盖兜底值；失败静默降级（汇率是展示增强，不该让页面挂掉）。 */
export async function loadRates(): Promise<void> {
  if (ratesLoaded) return
  try {
    const res: any = await request<any>({ url: '/public/exchange-rates' })
    const rates = res?.rates_to_thb
    if (rates && typeof rates === 'object') {
      Object.assign(RATES, rates)
      RATES.THB = 1
      ratesLoaded = true
    }
  } catch {
    /* 静默降级 */
  }
}

/** 泰铢 → 人民币（供「≈ ¥N」副价使用）。 */
export const convertFromThb = (amountThb: number, to = 'CNY'): number => {
  const rate = RATES[to.toUpperCase()] || 1
  return Number((Number(amountThb || 0) / rate).toFixed(0))
}
