/**
 * C 端公开站点的枚举文案映射。
 *
 * 后端枚举（朝向 / 装修 / 办学阶段 / 课程体系 / 产权 / 租售类型）在前端要显示成
 * 本地化文案，各页面都要用，集中在这里避免重复实现。
 */
import type { TFunction } from 'i18next'

const translate = (
  group: string,
  value: string | null | undefined,
  t: TFunction,
): string => {
  if (!value) return ''
  const key = `publicSite.${group}.${value}`
  const text = t(key)
  // i18next 缺 key 时会回显 key 本身，此时直接展示原值反而更可读
  return text === key ? value : text
}

export const orientationLabel = (value: string | null | undefined, t: TFunction) =>
  translate('orientation', value, t)

export const decorationLabel = (value: string | null | undefined, t: TFunction) =>
  translate('decoration', value, t)

export const schoolStageLabel = (value: string | null | undefined, t: TFunction) =>
  translate('stage', value, t)

export const curriculumLabel = (value: string | null | undefined, t: TFunction) =>
  translate('curriculum', value, t)

export const tenureLabel = (value: string | null | undefined, t: TFunction) =>
  translate('tenure', value, t)

export const listingTypeLabel = (value: string | null | undefined, t: TFunction) =>
  translate('listingType', value, t)

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
