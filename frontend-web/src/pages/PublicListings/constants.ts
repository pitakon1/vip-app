import { LIST_PAGE_SIZE } from '@/lib/pagination'
import { formatMoney } from '@/lib/money'

// ==================== 常量（对齐原型 tenant-property-browse.html）====================

export const PAGE_SIZE = LIST_PAGE_SIZE

// 档位 key → 文案 key（档位边界见 constants/filters）
export const PRICE_LABEL_KEYS: Record<string, string> = {
  '0-5000': 'priceRange.below5k',
  '5000-10000': 'priceRange.r5k10k',
  '10000-20000': 'priceRange.r10k20k',
  '20000-50000': 'priceRange.r20k50k',
  '50000+': 'priceRange.above50k',
}

export const AREA_LABEL_KEYS: Record<string, string> = {
  '0-50': 'areaRange.below50',
  '50-100': 'areaRange.r50to100',
  '100-200': 'areaRange.r100to200',
  '200+': 'areaRange.above200',
}

// 后端 PropertyStatus 枚举取值（vacant / rented / renewing / maintenance）。
// 直接下发非法枚举会让接口 422，整个列表变空，故先做白名单校验。
export const BACKEND_STATUS = new Set(['vacant', 'rented', 'renewing', 'maintenance'])

// 卡片 banner 主题色（使用设计令牌 CSS 变量）
export const BANNER_COLORS = [
  'var(--rent-primary)',
  'var(--state-info)',
  'var(--state-success)',
  'var(--state-purple)',
  'var(--state-warning)',
  'var(--state-error)',
]
export const bannerColorFor = (seed: string) => {
  let h = 0
  for (let i = 0; i < (seed || 'x').length; i++) h = (h * 31 + (seed || 'x').charCodeAt(i)) >>> 0
  return BANNER_COLORS[h % BANNER_COLORS.length]
}

// 状态标签样式类（对应 CSS modifier 类）
export const STATUS_CLASS: Record<string, string> = {
  vacant: 'rent-status-tag--vacant',
  rented: 'rent-status-tag--rented',
  renewing: 'rent-status-tag--renewing',
  maintenance: 'rent-status-tag--maintenance',
}

// 户型类型图标（lucide 路径，对齐原型 type-badge）
export const TYPE_ICON_PATH = (pt: string): string => {
  switch (pt) {
    case 'villa':
    case 'house':
      return 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'
    case 'shop':
    case 'commercial':
      return 'M3 9l1-5h16l1 5M4 9v11a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9M9 21v-6h6v6'
    case 'office':
      return 'M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18M2 22h20'
    default: // apartment / condo
      return 'M3 21h18M5 21V7l8-4v18M19 21V11l-6-4'
  }
}

// 买卖挂牌总价（币种随挂牌；MYR 与公共模块 RM 键对齐）
export const formatTotal = (v: any, currency?: string) => formatMoney(Number(v || 0), currency === 'MYR' ? 'RM' : currency)
