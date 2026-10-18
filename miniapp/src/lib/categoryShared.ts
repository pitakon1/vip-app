/**
 * 分类页共用工具（小程序）：聚合摘要 hook、筛选项构造器、跳转助手。
 *
 * 与 App 端 `mobile-app/src/screens/category/categoryShared.ts` 同一口径，抽到一处
 * 单点维护，避免 5 个分类页各写一份导致同一筛选在不同页行为不同。
 */
import { useEffect, useState } from 'react'
import Taro from '@tarojs/taro'
import { publicApi, type PublicCategorySummary, type PublicDistrict } from '@/services/publicApi'
import { findCityByKey } from '@/stores/location'
import { fmtMoney } from '@/utils/format'
import { useI18n } from '@/i18n'
import type { FilterGroup, FilterOption } from '@/components/CategoryKit'

type TFn = (key: string, params?: Record<string, string | number>) => string

/**
 * 分类页聚合摘要。
 *
 * 不传 `city`：定位城市名为中文（如「曼谷」），与库内英文 city 不匹配，
 * 带上反而会把聚合过滤成 0，故用全国口径。失败不影响列表主流程。
 */
export function useCategorySummary(): PublicCategorySummary | null {
  const [data, setData] = useState<PublicCategorySummary | null>(null)
  useEffect(() => {
    let alive = true
    publicApi
      .listingCategorySummary()
      .then((res: any) => {
        if (alive) setData((res?.data?.data ?? res?.data ?? res ?? null) as PublicCategorySummary | null)
      })
      .catch(() => {
        /* 摘要拉取失败不影响列表主流程 */
      })
    return () => {
      alive = false
    }
  }, [])
  return data
}

/** 区域筛选节点：key=落库地区名/静态 key，label=展示文案，kws=客户端关键词匹配用。 */
export interface DistrictOptionNode {
  key: string
  label: string
  kws: string[]
}

/**
 * 区域筛选真实数据。
 *
 * 请求 `GET /public/districts`（带当前城市 cityKey + 当前业务 listing_type/property_type）；
 * 后端返回非空 → 用真实区域（含套数回显）；为空（如 dev 库该城无数据）→
 * 回退定位城市的静态区域清单（`data/locationArea.ts`），避免筛选器变成死界面。
 */
export function useDistrictNodes(opts: {
  city?: string
  listingType?: 'rent' | 'sell'
  propertyType?: string[]
}): DistrictOptionNode[] {
  const { t } = useI18n()
  const [apiDistricts, setApiDistricts] = useState<PublicDistrict[]>([])
  const propertyKey = (opts.propertyType ?? []).join(',')
  useEffect(() => {
    let alive = true
    publicApi
      .districts({ city: opts.city, listing_type: opts.listingType, property_type: opts.propertyType })
      .then((res: any) => {
        const raw = res?.data ?? res
        const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.items) ? raw.items : []
        if (alive) setApiDistricts(arr as PublicDistrict[])
      })
      .catch(() => {
        if (alive) setApiDistricts([])
      })
    return () => {
      alive = false
    }
  }, [opts.city, opts.listingType, propertyKey])

  const fromApi = (apiDistricts ?? []).filter((p) => !!p?.district)
  if (fromApi.length) {
    return fromApi.map((p) => {
      const name = String(p.district)
      const n = Number(p.listing_count ?? 0)
      return {
        key: name,
        label: n > 0 ? t('category.districtCount', { name, n }) : name,
        kws: [name.toLowerCase()]
      }
    })
  }
  // 回退静态区域清单
  const group = opts.city ? findCityByKey(opts.city) : undefined
  return (group?.children ?? []).map((d) => ({ key: d.key, label: d.label, kws: d.kws }))
}

/** 区域筛选项：由 `useDistrictNodes` 产出的区域节点映射成下拉选项。 */
export function districtOptions(nodes: DistrictOptionNode[]): FilterOption[] {
  return nodes.map((n) => ({ value: n.key, label: n.label }))
}

/** 范围型筛选项 → {min,max} 解析。 */
export function parseRange(value?: string): { min?: number; max?: number } {
  if (!value) return {}
  const [min, max] = value.split('-')
  return { min: min ? Number(min) : undefined, max: max ? Number(max) : undefined }
}

type Range = [number | null, number | null]

function rangeLabel(t: TFn, r: Range): string {
  const [min, max] = r
  if (min == null) return `${t('category.priceUnder')} ${fmtMoney(max ?? 0)}`
  if (max == null) return `${t('category.priceOver')} ${fmtMoney(min)}`
  return `${fmtMoney(min)}-${fmtMoney(max)}`
}

export function rangeOptions(t: TFn, ranges: Range[]): FilterOption[] {
  return ranges.map((r) => ({ value: `${r[0] ?? ''}-${r[1] ?? ''}`, label: rangeLabel(t, r) }))
}

/** 租房价格区间（泰铢/月）。 */
export const RENT_PRICE_RANGES: Range[] = [
  [null, 15000],
  [15000, 30000],
  [30000, 60000],
  [60000, null]
]
/** 二手/商铺价格区间（泰铢）。 */
export const SELL_PRICE_RANGES: Range[] = [
  [null, 3000000],
  [3000000, 6000000],
  [6000000, 12000000],
  [12000000, null]
]
/** 楼盘均价区间（泰铢/㎡）。 */
export const AVG_PRICE_RANGES: Range[] = [
  [null, 80000],
  [80000, 150000],
  [150000, 250000],
  [250000, null]
]
/** 面积区间（㎡）。 */
export const AREA_RANGES: Range[] = [
  [null, 30],
  [30, 60],
  [60, 100],
  [100, 200],
  [200, null]
]

/** 排序组（房源口径）：筛选必须含排序项。 */
export function listingSortGroup(t: TFn): FilterGroup {
  return {
    key: 'sort',
    label: t('category.sortLabel'),
    options: [
      { value: 'latest', label: t('category.sortLatest') },
      { value: 'price_asc', label: t('category.sortPriceAsc') },
      { value: 'price_desc', label: t('category.sortPriceDesc') },
      { value: 'area_desc', label: t('category.sortAreaDesc') }
    ]
  }
}

/** 排序组（楼盘口径）。 */
export function projectSortGroup(t: TFn): FilterGroup {
  return {
    key: 'sort',
    label: t('category.sortLabel'),
    options: [
      { value: 'hot', label: t('category.sortHot') },
      { value: 'price_asc', label: t('category.sortPriceAsc') },
      { value: 'price_desc', label: t('category.sortPriceDesc') },
      { value: 'open_date_desc', label: t('category.sortOpenDate') }
    ]
  }
}

/** 区域组。 */
export function districtGroup(options: FilterOption[], t: TFn): FilterGroup {
  return { key: 'district', label: t('category.filterDistrict'), options }
}

/** 房型（卧室数）组。 */
export function bedroomGroup(t: TFn): FilterGroup {
  return {
    key: 'bedrooms_min',
    label: t('category.filterBedrooms'),
    options: [
      { value: '1', label: `1${t('category.bedroomUnit')}` },
      { value: '2', label: `2${t('category.bedroomUnit')}` },
      { value: '3', label: `3${t('category.bedroomUnit')}+` },
      { value: '4', label: `4${t('category.bedroomUnit')}+` }
    ]
  }
}

/** 装修组（取值与后端 Decoration 枚举一致）。 */
export function decorationGroup(t: TFn): FilterGroup {
  return {
    key: 'decoration',
    label: t('category.filterDecoration'),
    options: [
      { value: 'luxury', label: t('pub.decoration.luxury') },
      { value: 'standard', label: t('pub.decoration.standard') },
      { value: 'simple', label: t('pub.decoration.simple') },
      { value: 'bare', label: t('pub.decoration.bare') }
    ]
  }
}

/** 布尔型筛选项（「是」才收敛；未选=不限）。 */
export function boolGroup(key: string, label: string, t: TFn): FilterGroup {
  return { key, label, options: [{ value: '1', label: t('category.onlyYes') }] }
}

/** 未实现的入口统一 toast 提示「暂未开放」，不伪造内容。 */
export function notAvailable(feature: string) {
  Taro.showToast({ title: useI18n.getState().t('home.comingSoon', { label: feature }), icon: 'none' })
}
