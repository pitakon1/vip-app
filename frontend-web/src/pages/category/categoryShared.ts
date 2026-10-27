/**
 * 贝壳式分类页共用工具（Web）。
 *
 * 与 App 端 `src/screens/category/categoryShared.ts` 同口径：聚合摘要 hook、
 * 筛选项构造器、区间解析、价格分组。5 个分类页的筛选语义必须一致，
 * 抽到这里单点维护，避免各页各写一份导致同一筛选在不同页行为不同。
 */
import { useEffect, useState } from 'react'
import type { TFunction } from 'i18next'
import { message } from 'antd'
import api from '@/lib/api'
import { formatMoney } from '@/lib/money'

/** 尚未接入的入口统一提示「即将上线」，避免出现可点但无反应的死链。 */
export function notAvailable(t: TFunction, label?: string): void {
  message.info(label ? `${label} · ${t('category.comingSoon')}` : t('category.comingSoon'))
}

/** 分类页聚合摘要（按定位城市 cityKey 收敛，后端会做 slug 归一化后统计当地口径）。 */
export interface CategorySummary {
  on_sale_projects: number
  opened_this_month: number
  new_projects_7d: number
  unsold_projects: number
  rent_count: number
  sell_count: number
  new_count: number
  resale_count: number
  office_shop_count: number
  factory_count: number
  district_price_pairs: { district: string; avg_price: number }[]
}

export function useCategorySummary(city?: string): CategorySummary | null {
  const [data, setData] = useState<CategorySummary | null>(null)
  useEffect(() => {
    let alive = true
    api
      .get('/public/listing-categories/summary', { params: { city } })
      .then((res) => {
        const payload = res.data?.data ?? res.data
        if (alive) setData((payload ?? null) as CategorySummary | null)
      })
      .catch(() => {
        /* 摘要拉取失败不影响列表主流程 */
      })
    return () => {
      alive = false
    }
  }, [city])
  return data
}

export interface FilterOption {
  value: string
  label: string
}

export interface FilterGroup {
  key: string
  label: string
  options?: FilterOption[]
  /** 「更多」面板：一次性铺开多组子筛选。 */
  children?: FilterGroup[]
}

export interface QuickTag {
  key: string
  label: string
  /** 绑定的筛选组 key；点击即在「该值 ↔ 不限」间切换。 */
  group?: string
  value?: string
  /** 置 true 时点击清空全部筛选（仅保留排序），对应「全部」标签。 */
  reset?: boolean
}

export type FilterValues = Record<string, string>

/** 区域筛选项：取聚合摘要里房源量最大的区域（真实数据，不编造区域名）。 */
export const districtOptions = (summary: CategorySummary | null): FilterOption[] =>
  (summary?.district_price_pairs ?? []).map((p) => ({ value: p.district, label: p.district }))

/** 范围型筛选项 → {min,max} 解析。 */
export function parseRange(value?: string): { min?: number; max?: number } {
  if (!value) return {}
  const [min, max] = value.split('-')
  return { min: min ? Number(min) : undefined, max: max ? Number(max) : undefined }
}

type Range = [number | null, number | null]

function rangeLabel(t: TFunction, r: Range): string {
  const [min, max] = r
  if (min == null) return `${t('category.priceUnder')} ${formatMoney(max ?? 0)}`
  if (max == null) return `${t('category.priceOver')} ${formatMoney(min)}`
  return `${formatMoney(min)}-${formatMoney(max)}`
}

export function rangeOptions(t: TFunction, ranges: Range[]): FilterOption[] {
  return ranges.map((r) => ({ value: `${r[0] ?? ''}-${r[1] ?? ''}`, label: rangeLabel(t, r) }))
}

/** 租房价格区间（泰铢/月）。 */
export const RENT_PRICE_RANGES: Range[] = [
  [null, 15000],
  [15000, 30000],
  [30000, 60000],
  [60000, null],
]
/** 二手/商铺价格区间（泰铢）。 */
export const SELL_PRICE_RANGES: Range[] = [
  [null, 3000000],
  [3000000, 6000000],
  [6000000, 12000000],
  [12000000, null],
]
/** 楼盘均价区间（泰铢/㎡）。 */
export const AVG_PRICE_RANGES: Range[] = [
  [null, 80000],
  [80000, 150000],
  [150000, 250000],
  [250000, null],
]
/** 面积区间（㎡）。 */
export const AREA_RANGES: Range[] = [
  [null, 30],
  [30, 60],
  [60, 100],
  [100, 200],
  [200, null],
]

/** 排序组（房源口径）。 */
export function listingSortGroup(t: TFunction): FilterGroup {
  return {
    key: 'sort',
    label: t('category.sortLabel'),
    options: [
      { value: 'latest', label: t('category.sortLatest') },
      { value: 'price_asc', label: t('category.sortPriceAsc') },
      { value: 'price_desc', label: t('category.sortPriceDesc') },
      { value: 'area_desc', label: t('category.sortAreaDesc') },
    ],
  }
}

/** 排序组（楼盘口径）。 */
export function projectSortGroup(t: TFunction): FilterGroup {
  return {
    key: 'sort',
    label: t('category.sortLabel'),
    options: [
      { value: 'hot', label: t('category.sortHot') },
      { value: 'price_asc', label: t('category.sortPriceAsc') },
      { value: 'price_desc', label: t('category.sortPriceDesc') },
      { value: 'open_date_desc', label: t('category.sortOpenDate') },
    ],
  }
}

/** 区域组。 */
export function districtGroup(options: FilterOption[], t: TFunction): FilterGroup {
  return { key: 'district', label: t('category.filterDistrict'), options }
}

/** 房型（卧室数）组。 */
export function bedroomGroup(t: TFunction): FilterGroup {
  return {
    key: 'bedrooms_min',
    label: t('category.filterBedrooms'),
    options: [
      { value: '1', label: `1${t('category.bedroomUnit')}` },
      { value: '2', label: `2${t('category.bedroomUnit')}` },
      { value: '3', label: `3${t('category.bedroomUnit')}+` },
      { value: '4', label: `4${t('category.bedroomUnit')}+` },
    ],
  }
}

/** 装修组（取值与后端 Decoration 枚举一致）。 */
export function decorationGroup(t: TFunction): FilterGroup {
  return {
    key: 'decoration',
    label: t('category.filterDecoration'),
    options: [
      { value: 'luxury', label: t('publicSite.decoration.luxury') },
      { value: 'standard', label: t('publicSite.decoration.standard') },
      { value: 'simple', label: t('publicSite.decoration.simple') },
      { value: 'bare', label: t('publicSite.decoration.bare') },
    ],
  }
}

/** 布尔型筛选项（「是」才收敛；未选=不限）。 */
export function boolGroup(key: string, label: string, t: TFunction): FilterGroup {
  return { key, label, options: [{ value: '1', label: t('category.onlyYes') }] }
}

/** 租期组（最短租期，单位月）。 */
export function leaseTermGroup(t: TFunction): FilterGroup {
  return {
    key: 'min_lease_months',
    label: t('category.filterLease'),
    options: [
      { value: '1', label: t('category.lease1') },
      { value: '3', label: t('category.lease3') },
      { value: '6', label: t('category.lease6') },
      { value: '12', label: t('category.lease12') },
    ],
  }
}

/** 楼层高低组（取值与后端 floor_level 一致）。 */
export function floorLevelGroup(t: TFunction): FilterGroup {
  return {
    key: 'floor_level',
    label: t('category.filterFloor'),
    options: [
      { value: 'low', label: t('category.floorLow') },
      { value: 'mid', label: t('category.floorMid') },
      { value: 'high', label: t('category.floorHigh') },
    ],
  }
}

/** 朝向组（复用 publicSite.orientation 枚举文案）。 */
export function orientationGroup(t: TFunction): FilterGroup {
  return {
    key: 'orientation',
    label: t('category.filterOrientation'),
    options: (['north', 'south', 'east', 'west', 'northeast', 'northwest', 'southeast', 'southwest'] as const).map(
      (v) => ({ value: v, label: t(`publicSite.orientation.${v}`) }),
    ),
  }
}
