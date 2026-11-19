/**
 * 下单确认弹窗流程：打开 → 选择可服务房源 → POST /service-orders。
 * 纯结构拆分自 pages/Tenant/Services.tsx，请求字段与原逻辑保持不变。
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { message } from 'antd'
import { errorText } from '@/lib/errorText'
import { serviceOrdersApi } from '@/services/api'
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

  // 调起连连支付：与租金/账单共用 /service-orders/{id}/pay 支付单链路。
  // 有收银台链接就新窗口打开；失败必须明确提示，不能静默当作已支付。
  const payOrder = async (orderId: string) => {
    try {
      const res = await serviceOrdersApi.pay(orderId)
      const data = res.data as
        | {
            ok?: boolean
            status?: string
            already_paid?: boolean
            checkout_url?: string
            error?: string
          }
        | undefined
      if (data?.already_paid) {
        message.info(t('tenantServices.alreadyPaid'))
        return
      }
      // 渠道发起失败时后端仍返回 200，但 ok=false：必须按失败处理
      if (data?.ok === false) {
        if (data?.status === 'processing') {
          message.warning(t('tenantServices.payProcessing'))
        } else {
          message.error(t('tenantServices.payFailed', { error: data?.error || '' }))
        }
        return
      }
      if (data?.checkout_url) {
        window.open(String(data.checkout_url), '_blank', 'noopener,noreferrer')
        message.success(t('tenantServices.payOpened'))
        return
      }
      message.warning(t('tenantServices.payLinkMissing'))
    } catch (err) {
      message.error(errorText(err, t('tenantServices.payFailed', { error: '' })))
    }
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
      const res = await serviceOrdersApi.create({
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
      message.success(t('tenantServices.orderCreated'))
      setBookItem(null)
      onChanged()
      // 下单成功即进入支付，不再只提示「预约成功」而不发生付款
      const order = res.data as { id?: string } | undefined
      if (order?.id) {
        await payOrder(order.id)
      } else {
        message.warning(t('tenantServices.payLinkMissing'))
      }
    } catch (err) {
      message.error(errorText(err, t('tenantServices.bookFailed')))
    } finally {
      setSubmitting(false)
    }
  }

  // 年度服务套餐：同样落到真实服务订单（annual_management），并立即调起连连支付
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
      const res = await serviceOrdersApi.create({
        orderer_id: userId,
        orderer_type: isOwner ? 'owner' : 'tenant',
        property_id: propertyOptions[0].id,
        service_type: 'annual_management',
        amount: PROMO_PRICE,
        currency: 'THB',
        notes: t('tenantServices.promoTitle'),
      })
      message.success(t('tenantServices.orderCreated'))
      onChanged()
      const order = res.data as { id?: string } | undefined
      if (order?.id) {
        await payOrder(order.id)
      } else {
        message.warning(t('tenantServices.payLinkMissing'))
      }
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
    payOrder,
  }
}
