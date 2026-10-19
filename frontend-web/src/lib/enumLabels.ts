/**
 * 通用枚举文案映射（房源状态 / 房源类型 / 朝向 / 装修 / 配套设施）。
 *
 * 同一份「枚举值 → 本地化文案」此前在 Properties / PropertyDetail / PublicListings
 * 三个页面各写一份，后端新增枚举值时容易只改一处、另外两处继续回落成裸英文值。
 * 统一收敛到这里。
 *
 * **数据字典（非破坏式接入）**：后端 `/options/bundle` 提供可后台维护的字典，
 * 这里「字典命中优先、缺失回落硬编码 i18n」，保证字典未接入 / 缺项时页面照常渲染。
 * 返回完整映射表而不是 `label(value)` 单值函数：调用方既要做行内查表
 * （`map[item.status] || item.status`），也要用它渲染下拉选项
 * （`Object.entries(map).map(...)`），两种用法共用一个对象最省事。
 */
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import api from '@/lib/api'

/** {type: {value: 本地化文案}} */
export type OptionBundle = Record<string, Record<string, string>>

// 模块级缓存：纯函数调用点（publicLabels）可同步读取；也避免重复请求
const bundleCache: Record<string, OptionBundle> = {}
const inflight: Record<string, Promise<OptionBundle>> = {}

const normalizeLang = (lang?: string): string => {
  const short = (lang || '').slice(0, 2)
  return ['zh', 'en', 'th'].includes(short) ? short : 'zh'
}

/** 拉取某语言字典（缓存 + 请求去重；失败回落空表，不抛错）。 */
export const loadOptionBundle = (lang: string): Promise<OptionBundle> => {
  const key = normalizeLang(lang)
  if (bundleCache[key]) return Promise.resolve(bundleCache[key])
  if (!inflight[key]) {
    inflight[key] = api
      .get<OptionBundle>('/options/bundle', { params: { lang: key } })
      .then((res) => {
        bundleCache[key] = res.data || {}
        return bundleCache[key]
      })
      .catch(() => ({}))
      .finally(() => {
        delete inflight[key]
      })
  }
  return inflight[key]
}

/** 预取当前语言字典（启动 / 语言切换时调用，让纯函数调用点也命中）。 */
export const prefetchOptionBundle = (lang?: string): void => {
  void loadOptionBundle(normalizeLang(lang))
}

/** 同步读取字典文案：未加载 / 缺项返回 undefined（调用方回落硬编码）。 */
export const getOptionLabel = (
  type: string,
  value?: string | null,
  lang?: string,
): string | undefined => {
  if (!value) return undefined
  return bundleCache[normalizeLang(lang)]?.[type]?.[value]
}

/** 订阅当前语言字典（加载完成后触发重渲染）。 */
export const useOptionBundle = (): OptionBundle => {
  const { i18n } = useTranslation()
  const lang = normalizeLang(i18n.language)
  const [bundle, setBundle] = useState<OptionBundle>(() => bundleCache[lang] || {})
  useEffect(() => {
    let alive = true
    loadOptionBundle(lang).then((data) => {
      if (alive) setBundle(data)
    })
    return () => {
      alive = false
    }
  }, [lang])
  return bundle
}

/** 合并字典与硬编码回落：字典命中优先，缺失保留 fallback。 */
export const useOptionMap = (
  type: string,
  fallback: Record<string, string>,
): Record<string, string> => {
  const bundle = useOptionBundle()
  return useMemo(() => ({ ...fallback, ...(bundle[type] || {}) }), [bundle, type, fallback])
}

export const usePropertyStatusMap = (): Record<string, string> => {
  const { t } = useTranslation()
  return useMemo(
    () => ({
      vacant: t('propertyStatus.vacant'),
      rented: t('propertyStatus.rented'),
      reserved: t('propertyStatus.reserved'),
      maintenance: t('propertyStatus.maintenance'),
    }),
    [t],
  )
}

export const usePropertyTypeMap = (): Record<string, string> => {
  const { t } = useTranslation()
  const fallback = useMemo(
    () => ({
      apartment: t('propertyType.apartment'),
      condo: t('propertyType.condo'),
      villa: t('propertyType.villa'),
      house: t('propertyType.house'),
      shop: t('propertyType.shop'),
      commercial: t('propertyType.commercial'),
      office: t('propertyType.office'),
      factory: t('propertyType.factory'),
    }),
    [t],
  )
  return useOptionMap('property_type', fallback)
}

/** 朝向映射（C 端筛选 / 详情）：硬编码 i18n 兜底，字典优先。 */
export const useOrientationMap = (): Record<string, string> => {
  const { t } = useTranslation()
  const fallback = useMemo(
    () => ({
      north: t('publicSite.orientation.north'),
      south: t('publicSite.orientation.south'),
      east: t('publicSite.orientation.east'),
      west: t('publicSite.orientation.west'),
      northeast: t('publicSite.orientation.northeast'),
      northwest: t('publicSite.orientation.northwest'),
      southeast: t('publicSite.orientation.southeast'),
      southwest: t('publicSite.orientation.southwest'),
    }),
    [t],
  )
  return useOptionMap('orientation', fallback)
}

/** 装修映射：硬编码 i18n 兜底，字典优先。 */
export const useDecorationMap = (): Record<string, string> => {
  const { t } = useTranslation()
  const fallback = useMemo(
    () => ({
      bare: t('publicSite.decoration.bare'),
      simple: t('publicSite.decoration.simple'),
      standard: t('publicSite.decoration.standard'),
      luxury: t('publicSite.decoration.luxury'),
      fully_furnished: t('publicSite.decoration.fully_furnished'),
    }),
    [t],
  )
  return useOptionMap('decoration', fallback)
}

/** 配套设施映射：硬编码 i18n 兜底，字典优先。 */
export const useAmenityMap = (): Record<string, string> => {
  const { t } = useTranslation()
  const fallback = useMemo(
    () => ({
      aircon: t('publicSite.amenity.aircon'),
      pool: t('publicSite.amenity.pool'),
      gym: t('publicSite.amenity.gym'),
      parking: t('publicSite.amenity.parking'),
      elevator: t('publicSite.amenity.elevator'),
      balcony: t('publicSite.amenity.balcony'),
      garden: t('publicSite.amenity.garden'),
    }),
    [t],
  )
  return useOptionMap('amenity', fallback)
}
