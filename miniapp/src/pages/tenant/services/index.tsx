import { useState } from 'react'
import { View, Text, Button, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { serviceOrdersApi } from '@/services/api'
import { useSwrCache } from '@/hooks/useSwrCache'
import type { ServiceItem } from '@/types'
import { iconStyle } from '@/utils/icons'
import './index.scss'

const PAYMENT_METHODS: Array<{ key: string; label: string }> = [
  { key: 'wechat', label: '微信支付' },
  { key: 'alipay', label: '支付宝' },
  { key: 'bank', label: '银行卡' }
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
  cleaning: '日常保洁',
  ac_cleaning: '空调清洗',
  wifi_install: '宽带安装',
  utility_payment: '水电代缴',
  insurance: '保险代办',
  tax_payment: '税务代办',
  annual_management: '年度托管'
}

const ORDER_STATUS_MAP: Record<string, { text: string; color: string }> = {
  pending: { text: '待受理', color: 'var(--warning)' },
  assigned: { text: '已派单', color: 'var(--info)' },
  in_progress: { text: '服务中', color: 'var(--primary)' },
  completed: { text: '已完成', color: 'var(--success)' },
  cancelled: { text: '已取消', color: 'var(--ink-3)' }
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
      itemList: PAYMENT_METHODS.map((m) => m.label),
      success: (res) => {
        const method = PAYMENT_METHODS[res.tapIndex]
        createOrder(service, method.key, method.label)
      }
    })
  }

  const createOrder = async (
    service: ServiceItem,
    methodKey: string,
    methodLabel: string
  ) => {
    setOrdering(service.id)
    Taro.showLoading({ title: '下单中...', mask: true })
    try {
      await serviceOrdersApi.create({
        serviceId: service.id,
        serviceName: service.name,
        amount: service.price,
        paymentMethod: methodKey
      })
      Taro.hideLoading()
      Taro.showModal({
        title: '下单成功',
        content: `「${service.name}」下单成功，付款方式：${methodLabel}`,
        showCancel: false
      })
      refresh(true)
    } catch (error) {
      console.error('[TenantServices] 下单失败', error)
      Taro.hideLoading()
      Taro.showToast({ title: '下单失败，请重试', icon: 'none' })
    } finally {
      setOrdering(null)
    }
  }

  return (
    <View className='tenant-services-page'>
      <View className='page-container'>
        <View className='svc-hero'>
          <Text className='svc-hero-label'>推荐服务</Text>
          <Text className='svc-hero-title'>一站式家居服务</Text>
          <View className='pay-tip'>
            <Text className='pay-tip-label'>支持付款方式</Text>
            <View className='pay-icons'>
              {PAYMENT_METHODS.map((m) => (
                <Text key={m.key} className='pay-icon'>{m.label}</Text>
              ))}
            </View>
          </View>
        </View>

        <View className='service-list'>
          {services.length === 0 && (
            <View className='empty-tip'>
              <Text>暂无推荐服务</Text>
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
                  预约
                </Button>
              </View>
            </View>
          ))}
        </View>

        <View className='section-title'>
          <Text>我的订单</Text>
        </View>

        <ScrollView scrollY className='order-list'>
          {ordersLoading && orders.length === 0 && (
            <View className='empty-tip'>
              <Text>加载中...</Text>
            </View>
          )}
          {!ordersLoading && orders.length === 0 && (
            <View className='empty-tip'>
              <Text>暂无服务订单</Text>
            </View>
          )}
          {orders.map((order) => {
            const status = ORDER_STATUS_MAP[order.status || 'pending'] || ORDER_STATUS_MAP.pending
            return (
              <View key={order.id} className='order-card'>
                <View className='order-icon icon-svg' style={iconStyle('clipboard', 40)} />
                <View className='order-info'>
                  <Text className='order-name'>
                    {SERVICE_TYPE_MAP[order.service_type || ''] || order.service_type || '增值服务'}
                  </Text>
                  <Text className='order-time'>{formatTime(order.scheduled_at || order.created_at)}</Text>
                </View>
                <Text className='order-status' style={{ color: status.color }}>{status.text}</Text>
              </View>
            )
          })}
        </ScrollView>
      </View>
    </View>
  )
}