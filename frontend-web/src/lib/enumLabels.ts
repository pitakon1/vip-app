/**
 * 通用枚举文案映射（房源状态 / 房源类型）。
 *
 * 同一份「枚举值 → 本地化文案」此前在 Properties / PropertyDetail / PublicListings
 * 三个页面各写一份，后端新增枚举值时容易只改一处、另外两处继续回落成裸英文值。
 * 统一收敛到这里。
 *
 * 返回完整映射表而不是 `label(value)` 单值函数：调用方既要做行内查表
 * （`map[item.status] || item.status`），也要用它渲染下拉选项
 * （`Object.entries(map).map(...)`），两种用法共用一个对象最省事。
 * 放在组件内经 useMemo 计算，语言切换时才会跟着刷新。
 */
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

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
  return useMemo(
    () => ({
      apartment: t('propertyType.apartment'),
      condo: t('propertyType.condo'),
      villa: t('propertyType.villa'),
      house: t('propertyType.house'),
      shop: t('propertyType.shop'),
      commercial: t('propertyType.commercial'),
      office: t('propertyType.office'),
    }),
    [t],
  )
}