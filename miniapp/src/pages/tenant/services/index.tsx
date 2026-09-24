import { useState } from 'react'
import { View, Text, Button, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { serviceOrdersApi } from '@/services/api'
import { useSwrCache } from '@/hooks/useSwrCache'
import type { ServiceItem } from '@/types'
import { iconStyle } from '@/utils/icons'
import StateBlock from '@/components/StateBlock'
import { useI18n } from '@/i18n'
import './index.scss'

const PAYMENT_METHODS: Array<{ key: string; label: string }> = [
  { key: 'wechat', label: 'svc.payWechat' },
  { key: 'alipay', label: 'svc.payAlipay' },
  { key: 'bank', label: 'svc.payBank' }
]

interface ServiceOrderRow {
  id: string | number
  service_type?: string
  amount?: number
  currency?: string
  status?: string
  scheduled_at?: string
  created_at?: string
}

const SERVICE_TYPE_MAP: Record<string, string> = {
  cleaning: 'svc.typeCleaning',
  ac_cleaning: 'svc.typeAcCleaning',
  wifi_install: 'svc.typeWifiInstall',
  utility_payment: 'svc.typeUtilityPayment',
  insurance: 'svc.typeInsurance',
  tax_payment: 'svc.typeTaxPayment',
  annual_management: 'svc.typeAnnualManagement'
}

const ORDER_STATUS_MAP: Record<string, { text: string; color: string }> = {
  pending: { text: 'svc.stPending', color: 'var(--warning)' },
  assigned: { text: 'svc.stAssigned', color: 'var(--info)' },
  in_progress: { text: 'svc.stInProgress', color: 'var(--primary)' },
  completed: { text: 'svc.stCompleted', color: 'var(--success)' },
  cancelled: { text: 'svc.stCancelled', color: 'var(--ink-3)' }
}

/** 订单状态对应的徽标配色 */
const ORDER_STATUS_BADGE: Record<string, string> = {
  pending: 'badge--warning',
  assigned: 'badge--info',
  in_progress: 'badge--info',
  completed: 'badge--success',
  cancelled: 'badge--neutral'
}

function pickList<T>(res: any): T[] {
  if (Array.isArray(res)) return res
  if (Array.isArray(res?.data)) return res.data
  if (Array.isArray(res?.items)) return res.items
  if (Array.isArray(res?.list)) return res.list
  if (Array.isArray(res?.data?.items)) return res.data.items
  if (Array.isArray(res?.data?.list)) return res.data.list
  return []
}

const formatTime = (x?: string) =>
  x ? x.replace('T', ' ').slice(0, 16) : '—'

export default function TenantServicesPage() {
  const { t } = useI18n()
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)
  // 服务目录由后端配置驱动；接口未返回前不注入任何占位数据
  const [services] = useState<ServiceItem[]>([])
  const [ordering, setOrdering] = useState<number | null>(null)

  const uid = useAuthStore((state) => state.user?.id) ?? 'anon'
  const { data: orders, loading: ordersLoading, refresh } = useSwrCache<ServiceOrderRow[]>({
    key: `tenant:services:${uid}`,
    fetcher: async () => {
      const res = await serviceOrdersApi.list()
      return pickList<ServiceOrderRow>(res)
    },
  })

  useDidShow(() => {
    loadFromStorage()
    if (!useAuthStore.getState().token) {
      Taro.redirectTo({ url: '/pages/login/index' })
      return
    }
    refresh()
  })

  const handlePay = (service: ServiceItem) => {
    Taro.showActionSheet({
      itemList: PAYMENT_METHODS.map((m) => t(m.label)),
      success: (res) => {
        const method = PAYMENT_METHODS[res.tapIndex]
        createOrder(service, method.key, t(method.label))
      }
    })
  }

  const createOrder = async (
    service: ServiceItem,
    methodKey: string,
    methodLabel: string
  ) => {
    setOrdering(service.id)
    Taro.showLoading({ title: t('svc.ordering'), mask: true })
    try {
      await serviceOrdersApi.create({
        serviceId: service.id,
        serviceName: service.name,
        amount: service.price,
        paymentMethod: methodKey
      })
      Taro.hideLoading()
      Taro.showModal({
        title: t('svc.orderSuccessTitle'),
        content: t('svc.orderSuccessContent', { name: service.name, method: methodLabel }),
        showCancel: false
      })
      refresh(true)
    } catch (error) {
      console.error('[TenantServices] 下单失败', error)
      Taro.hideLoading()
      Taro.showToast({ title: t('svc.orderFailed'), icon: 'none' })
    } finally {
      setOrdering(null)
    }
  }

  return (
    <View className='tenant-services-page'>
      <View className='page-container'>
        <View className='svc-hero'>
          <Text className='svc-hero-label'>{t('svc.heroLabel')}</Text>
          <Text className='svc-hero-title'>{t('svc.heroTitle')}</Text>
          <View className='pay-tip'>
            <Text className='pay-tip-label'>{t('svc.payMethods')}</Text>
            <View className='pay-icons'>
              {PAYMENT_METHODS.map((m) => (
                <Text key={m.key} className='pay-icon'>{t(m.label)}</Text>
              ))}
            </View>
          </View>
        </View>

        <View className='service-list'>
          {services.length === 0 && (
            <View className='empty-tip'>
              <Text>{t('svc.noServices')}</Text>
            </View>
          )}
          {services.map((service) => (
            <View key={service.id} className='service-card'>
              <View className='service-info'>
                <Text className='service-name'>{service.name}</Text>
                <Text className='service-desc'>{service.description}</Text>
                <Text className='service-price'>฿{service.price}</Text>
              </View>
              <View className='service-pay'>
                <Button
                  className='pay-btn'
                  type='primary'
                  loading={ordering === service.id}
                  disabled={ordering === service.id}
                  onClick={() => handlePay(service)}
                >
                  {t('svc.book')}
                </Button>
              </View>
            </View>
          ))}
        </View>

        <View className='section-title'>
          <Text>{t('svc.myOrders')}</Text>
        </View>

        <ScrollView scrollY className='order-list'>
          {ordersLoading && orders.length === 0 && (
            <StateBlock loading text={t('pub.loading')} />
          )}
          {!ordersLoading && orders.length === 0 && (
            <View className='empty-tip'>
              <Text>{t('svc.noOrders')}</Text>
            </View>
          )}
          {orders.map((order) => {
            const status = ORDER_STATUS_MAP[order.status || 'pending'] || ORDER_STATUS_MAP.pending
            return (
              <View key={order.id} className='order-card'>
                <View className='order-icon icon-svg' style={iconStyle('clipboard', 40)} />
                <View className='order-info'>
                  <Text className='order-name'>
                    {SERVICE_TYPE_MAP[order.service_type || '']
                      ? t(SERVICE_TYPE_MAP[order.service_type || ''])
                      : order.service_type || t('svc.fallbackService')}
                  </Text>
                  <Text className='order-time'>{formatTime(order.scheduled_at || order.created_at)}</Text>
                </View>
                <Text className='order-status' style={{ color: status.color }}>{t(status.text)}</Text>
              </View>
            )
          })}
        </ScrollView>
      </View>
    </View>
  )
}