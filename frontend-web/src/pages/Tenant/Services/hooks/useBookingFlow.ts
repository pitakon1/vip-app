/**
 * 下单确认弹窗流程：打开 → 选择可服务房源 → POST /service-orders。
 * 纯结构拆分自 pages/Tenant/Services.tsx，请求字段与原逻辑保持不变。
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { message } from 'antd'
import api from '@/lib/api'
import { errorText } from '@/lib/errorText'
import { PROMO_PRICE } from '../constants'
import type { CatalogItem, PropertyOption } from '../types'

export function useBookingFlow({
  userId,
  isOwner,
  propertyOptions,
  onChanged,
}: {
  userId?: string
  isOwner: boolean
  propertyOptions: PropertyOption[]
  onChanged: () => void
}) {
  const { t } = useTranslation()
  const [bookItem, setBookItem] = useState<CatalogItem | null>(null)
  const [bookPropertyId, setBookPropertyId] = useState<string | undefined>(undefined)
  const [submitting, setSubmitting] = useState(false)

  // 真实下单：POST /service-orders（必须关联房源，失败即失败，不伪造本地记录）
  const openBooking = (item: CatalogItem) => {
    if (!userId) {
      message.warning(t('tenantServices.loginWarn'))
      return
    }
    if (!propertyOptions.length) {
      message.warning(t('tenantServices.noLeaseWarn'))
      return
    }
    setBookPropertyId(propertyOptions[0]?.id)
    setBookItem(item)
  }

  const submitBooking = async () => {
    if (!bookItem) return
    if (!userId) {
      message.warning(t('tenantServices.loginWarn'))
      return
    }
    if (!bookPropertyId) {
      message.warning(t('tenantServices.noLeaseWarn'))
      return
    }
    setSubmitting(true)
    try {
      await api.post('/service-orders', {
        orderer_id: userId,
        orderer_type: isOwner ? 'owner' : 'tenant',
        property_id: bookPropertyId,
        service_type: bookItem.code,
        amount: Number(bookItem.base_price || 0),
        currency: 'THB',
        notes: t('tenantServices.bookNotes'),
        billing_model: 'per_use',
        billing_amount: Number(bookItem.base_price || 0),
      })
      message.success(t('tenantServices.bookedSuccess'))
      setBookItem(null)
      onChanged()
    } catch (err) {
      message.error(errorText(err, t('tenantServices.bookFailed')))
    } finally {
      setSubmitting(false)
    }
  }

  // 年度服务套餐：同样落到真实服务订单（annual_management），不再只弹「购买成功」
  const buyPromo = async () => {
    if (!userId) {
      message.warning(t('tenantServices.loginWarn'))
      return
    }
    if (!propertyOptions.length) {
      message.warning(t('tenantServices.noLeaseWarn'))
      return
    }
    try {
      await api.post('/service-orders', {
        orderer_id: userId,
        orderer_type: isOwner ? 'owner' : 'tenant',
        property_id: propertyOptions[0].id,
        service_type: 'annual_management',
        amount: PROMO_PRICE,
        currency: 'THB',
        notes: t('tenantServices.promoTitle'),
      })
      message.success(t('tenantServices.purchaseSuccess'))
      onChanged()
    } catch (err) {
      message.error(errorText(err, t('tenantServices.bookFailed')))
    }
  }

  return {
    bookItem,
    setBookItem,
    bookPropertyId,
    setBookPropertyId,
    submitting,
    openBooking,
    submitBooking,
    buyPromo,
  }
}
