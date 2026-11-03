type Translate = (key: string, options?: any) => string

export const photoUrl = (item: any): string | null => {
  if (!item) return null
  if (typeof item === 'string') return item
  return item.url || item.src || null
}

export const toItems = (res: any): any[] => {
  const payload = res?.data?.data ?? res?.data
  return payload?.items ?? []
}

export const toBody = (res: any): any => {
  const payload = res?.data?.data ?? res?.data
  return payload?.data ?? payload
}

/** 房源类型 → 当前语言文案（缺失时返回 undefined，调用方回退） */
export const makePropertyTypeLabel = (t: Translate): Record<string, string> => ({
  apartment: t('propertyType.apartment'),
  condo: t('propertyType.condo'),
  villa: t('propertyType.villa'),
  house: t('propertyType.house'),
  shop: t('propertyType.shop'),
  commercial: t('propertyType.commercial'),
  office: t('propertyType.office'),
})
