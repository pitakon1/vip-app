/**
 * C 端公开站点的共用工具：枚举文案映射、相册取值、双币换算。
 *
 * 与 Web 端 `lib/publicLabels.ts` + `lib/money.ts`、以及 RN 端
 * `mobile-app/src/lib/publicSite.ts` 保持同一口径。
 *
 * 枚举文案按 i18n key 映射（见 `src/i18n/index.ts` 的 pub.* 字典），运行时通过
 * `useI18n.getState().t(...)` 取当前语言的文案；未知取值原样返回，比显示空白更可读。
 */
import { request } from '@/lib/api'
import { useI18n } from '@/i18n'

const ORIENTATION: Record<string, string> = {
  north: 'pub.orientation.north',
  south: 'pub.orientation.south',
  east: 'pub.orientation.east',
  west: 'pub.orientation.west',
  northeast: 'pub.orientation.northeast',
  northwest: 'pub.orientation.northwest',
  southeast: 'pub.orientation.southeast',
  southwest: 'pub.orientation.southwest'
}

const DECORATION: Record<string, string> = {
  bare: 'pub.decoration.bare',
  simple: 'pub.decoration.simple',
  standard: 'pub.decoration.standard',
  luxury: 'pub.decoration.luxury',
  fully_furnished: 'pub.decoration.fully_furnished'
}

const STAGE: Record<string, string> = {
  kindergarten: 'pub.stage.kindergarten',
  primary: 'pub.stage.primary',
  secondary: 'pub.stage.secondary',
  high_school: 'pub.stage.high_school',
  university: 'pub.stage.university',
  k12: 'pub.stage.k12'
}

const CURRICULUM: Record<string, string> = {
  ib: 'pub.curriculum.ib',
  american: 'pub.curriculum.american',
  british: 'pub.curriculum.british',
  french: 'pub.curriculum.french',
  german: 'pub.curriculum.german',
  japanese: 'pub.curriculum.japanese',
  thai: 'pub.curriculum.thai',
  bilingual: 'pub.curriculum.bilingual',
  other: 'pub.curriculum.other'
}

const TENURE: Record<string, string> = {
  freehold: 'pub.tenure.freehold',
  leasehold: 'pub.tenure.leasehold',
  mixed: 'pub.tenure.mixed'
}

export const LISTING_TYPE: Record<string, string> = {
  rent: 'pub.listingType.rent',
  sell: 'pub.listingType.sell'
}

/** 未知取值原样返回（后端新增枚举时不至于丢信息）。 */
const pick = (map: Record<string, string>, value?: string | null): string =>
  value ? useI18n.getState().t(map[value] ?? value) : ''

// ==================== 数据字典（非破坏式接入） ====================
// 后端 `/options/bundle` 提供后台可维护的枚举文案；这里「字典命中优先、缺失回落硬编码
// i18n」，保证字典未接入 / 缺项时 C 端照常渲染。与 Web / RN 端保持同一口径。
const OPTION_BUNDLE_CACHE: Record<string, Record<string, Record<string, string>>> = {}
const optionInflight: Record<string, Promise<void>> = {}

const normLang = (lang?: string): string => {
  const short = (lang || '').slice(0, 2)
  return ['zh', 'en', 'th'].includes(short) ? short : 'zh'
}

/** 拉取某语言字典（缓存 + 请求去重；失败静默降级）。 */
export async function loadOptions(lang?: string): Promise<void> {
  const key = normLang(lang ?? useI18n.getState().lang)
  if (OPTION_BUNDLE_CACHE[key]) return
  if (!optionInflight[key]) {
    optionInflight[key] = (async () => {
      try {
        OPTION_BUNDLE_CACHE[key] = await request<Record<string, Record<string, string>>>({
          url: '/options/bundle',
          data: { lang: key }
        })
      } catch {
        /* 静默降级，回落硬编码 */
      } finally {
        delete optionInflight[key]
      }
    })()
  }
  await optionInflight[key]
}

/** 同步读取字典文案：未加载 / 缺项返回 undefined（调用方回落硬编码）。 */
const dictLabel = (type: string, value?: string | null): string | undefined => {
  if (!value) return undefined
  return OPTION_BUNDLE_CACHE[normLang(useI18n.getState().lang)]?.[type]?.[value]
}

export const orientationLabel = (value?: string | null) =>
  dictLabel('orientation', value) ?? pick(ORIENTATION, value)
export const decorationLabel = (value?: string | null) =>
  dictLabel('decoration', value) ?? pick(DECORATION, value)
export const schoolStageLabel = (value?: string | null) => pick(STAGE, value)
export const curriculumLabel = (value?: string | null) => pick(CURRICULUM, value)
export const tenureLabel = (value?: string | null) => pick(TENURE, value)
export const listingTypeLabel = (value?: string | null) => pick(LISTING_TYPE, value)

/** 供筛选器渲染的枚举 key 表（顺序即展示顺序，与后端枚举一致）；渲染时自行 t() 翻译。 */
export const STAGE_OPTIONS = [
  ['', 'pub.all'],
  ['kindergarten', 'pub.stage.kindergarten'],
  ['primary', 'pub.stage.primary'],
  ['secondary', 'pub.stage.secondary'],
  ['high_school', 'pub.stage.high_school'],
  ['university', 'pub.stage.university'],
  ['k12', 'pub.stage.k12']
] as const

export const CURRICULUM_OPTIONS = [
  ['', 'pub.all'],
  ['ib', 'pub.curriculum.ib'],
  ['american', 'pub.curriculum.american'],
  ['british', 'pub.curriculum.british'],
  ['french', 'pub.curriculum.french'],
  ['german', 'pub.curriculum.german'],
  ['japanese', 'pub.curriculum.japanese'],
  ['thai', 'pub.curriculum.thai'],
  ['bilingual', 'pub.curriculum.bilingual'],
  ['other', 'pub.curriculum.other']
] as const

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
  // 顺带预取数据字典：所有公开站页面都会调 loadRates()，借此让标签函数也命中字典
  void loadOptions()
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
