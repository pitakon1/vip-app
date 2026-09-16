import { useState } from 'react'
import { View, Text, Button } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { serviceOrdersApi, ownerApi } from '@/services/api'
import type { ServiceItem } from '@/types'
import './index.scss'
import { iconStyle, type IconKey } from '@/utils/icons'
import BottomNav from '@/components/BottomNav'

interface ServiceOrder {
  id: string
  orderer_id?: string
  orderer_type?: string
  property_id?: string
  service_type?: string
  status?: string
  scheduled_at?: string
  completed_at?: string
  amount?: number
  currency?: string
  notes?: string
  rating?: number
  created_at?: string
}

interface OwnerProp {
  id?: string | number
  room_number?: string
  display_name?: string
  address?: string
}

interface PayMethod {
  key: string
  label: string
  icon: IconKey
}

const PAYMENT_METHODS: PayMethod[] = [
  { key: 'wechat', label: '微信支付', icon: 'wechat' },
  { key: 'alipay', label: '支付宝', icon: 'alipay' },
  { key: 'bank', label: '银行卡', icon: 'bank' }
]

// 推荐服务列表（无后端列表接口时使用本地推荐）
const RECOMMEND_SERVICES: ServiceItem[] = [
  { id: 1, name: '房屋保洁服务', description: '专业保洁团队上门服务，2小时深度清洁', price: 199 },
  { id: 2, name: '管道维修服务', description: '专业管道维修，解决漏水、堵塞等问题', price: 150 },
  { id: 3, name: '家电维修服务', description: '各类家电维修，空调、洗衣机、冰箱等', price: 128 },
  { id: 4, name: '搬家服务', description: '专业搬家团队，提供包装、搬运一站式服务', price: 500 },
  { id: 5, name: '甲醛检测治理', description: '专业甲醛检测与治理，保障居住健康', price: 399 }
]

// 服务类型（对齐后端 ServiceType 枚举）
const SERVICE_TYPE_META: Record<string, { label: string; icon: IconKey }> = {
  cleaning: { label: '房屋保洁', icon: 'gear' },
  ac_cleaning: { label: '空调清洗', icon: 'gear' },
  wifi_install: { label: '网络安装', icon: 'card' },
  utility_payment: { label: '代缴水电', icon: 'money' },
  insurance: { label: '保险服务', icon: 'doc' },
  tax_payment: { label: '税务代办', icon: 'doc' },
  annual_management: { label: '年度托管', icon: 'clipboard' }
}

// 工单状态（对齐后端 ServiceOrderStatus 枚举），进度由状态推导
const STATUS_META: Record<string, { label: string; cls: string; pct: number }> = {
  pending: { label: '待响应', cls: 'warning', pct: 20 },
  assigned: { label: '已派单', cls: 'info', pct: 40 },
  in_progress: { label: '处理中', cls: 'primary', pct: 60 },
  completed: { label: '已完成', cls: 'success', pct: 100 },
  cancelled: { label: '已取消', cls: 'neutral', pct: 0 }
}

const metaOfType = (t?: string) => SERVICE_TYPE_META[t || ''] || { label: '增值服务', icon: 'clipboard' as IconKey }
const metaOfStatus = (s?: string) => STATUS_META[s || ''] || { label: '待响应', cls: 'warning', pct: 20 }

const FILTERS: Array<{ key: string; label: string; statuses?: string[] }> = [
  { key: 'all', label: '全部' },
  { key: 'active', label: '处理中', statuses: ['assigned', 'in_progress'] },
  { key: 'completed', label: '已完成', statuses: ['completed'] },
  { key: 'pending', label: '待响应', statuses: ['pending'] }
]

const pickList = (res: any): any[] => {
  if (Array.isArray(res)) return res
  const d = res?.data ?? res ?? {}
  if (Array.isArray(d)) return d
  if (Array.isArray(d?.items)) return d.items
  if (Array.isArray(d?.list)) return d.list
  return []
}

const fmtDate = (x?: string) => (x ? String(x).replace('T', ' ').slice(0, 10) : '—')

const shortId = (id?: string) =>
  id ? `#SR-${String(id).replace(/-/g, '').slice(0, 6).toUpperCase()}` : '#SR-'

export default function OwnerServicesPage() {
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)
  const [services] = useState<ServiceItem[]>(RECOMMEND_SERVICES)
  const [ordering, setOrdering] = useState<number | null>(null)
  const [orders, setOrders] = useState<ServiceOrder[]>([])
  const [properties, setProperties] = useState<OwnerProp[]>([])
  const [activeFilter, setActiveFilter] = useState('all')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  const fetchOrders = async () => {
    setLoading(true)
    setError(false)
    try {
      const [orderRes, propRes]: [any, any] = await Promise.all([
        serviceOrdersApi.list(),
        ownerApi.properties().catch(() => null)
      ])
      setOrders(pickList(orderRes) as ServiceOrder[])
      setProperties(pickList(propRes) as OwnerProp[])
    } catch (e) {
      console.error('[OwnerServices] 获取工单失败', e)
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  useDidShow(() => {
    loadFromStorage()
    if (!useAuthStore.getState().token) {
      Taro.redirectTo({ url: '/pages/login/index' })
      return
    }
    fetchOrders()
  })

  const propertyName = (id?: string) => {
    if (!id) return ''
    const p = properties.find((x) => String(x.id) === String(id))
    return p?.display_name || p?.room_number || p?.address || ''
  }

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
        content: `「${service.name}」下单成功，付款方式：${methodLabel}，金额 ฿${service.price}`,
        showCancel: false
      })
      fetchOrders()
    } catch (error) {
      console.error('[OwnerServices] 下单失败', error)
      Taro.hideLoading()
      Taro.showToast({ title: '下单失败，请重试', icon: 'none' })
    } finally {
      setOrdering(null)
    }
  }

  const thisMonth = new Date().toISOString().slice(0, 7)
  const activeOrders = orders.filter((o) => ['pending', 'assigned', 'in_progress'].includes(String(o.status || '')))
  const monthOrders = orders.filter((o) => String(o.created_at || '').slice(0, 7) === thisMonth)
  const monthDone = monthOrders.filter((o) => String(o.status || '') === 'completed').length

  const activeStatuses = FILTERS.find((f) => f.key === activeFilter)?.statuses
  const filtered = activeStatuses ? orders.filter((o) => activeStatuses.includes(String(o.status || ''))) : orders

  return (
    <View className='owner-services-page'>
      <View className='page-container'>
        {/* 概览 stat row */}
        <View className='stat-row'>
          <View className='stat'>
            <Text className='stat__label'>处理中工单</Text>
            <Text className='stat__value'>{activeOrders.length}</Text>
            <Text className='stat__badge stat__badge--info'>跟进中</Text>
          </View>
          <View className='stat'>
            <Text className='stat__label'>本月工单</Text>
            <Text className='stat__value'>{monthOrders.length}</Text>
            <Text className='stat__badge stat__badge--success'>{monthDone} 已完成</Text>
          </View>
        </View>

        {/* 筛选 */}
        <View className='chips'>
          {FILTERS.map((f) => (
            <View
              key={f.key}
              className={`chips__item ${activeFilter === f.key ? 'chips__item--active' : ''}`}
              onClick={() => setActiveFilter(f.key)}
            >
              <Text>{f.label}</Text>
            </View>
          ))}
        </View>

        <View className='section-title'>
          <Text>我的工单</Text>
          <Text className='section-hint'>{filtered.length} 单</Text>
        </View>

        {loading && orders.length === 0 && (
          <View className='empty-tip'>
            <Text>加载中...</Text>
          </View>
        )}

        {!loading && error && orders.length === 0 && (
          <View className='empty-tip'>
            <Text>加载失败，请重试</Text>
            <View className='retry-btn' onClick={fetchOrders} hoverClass='retry-btn--hover'>
              <Text>重新加载</Text>
            </View>
          </View>
        )}

        {!loading && !error && filtered.length === 0 && (
          <View className='empty-tip'>
            <View className='empty-tip__icon icon-svg' style={iconStyle('gear', 48)} />
            <Text>{orders.length === 0 ? '暂无工单' : '该状态下暂无工单'}</Text>
          </View>
        )}

        {!loading && filtered.length > 0 && (
          <View className='order-list'>
            {filtered.map((order) => {
              const typeMeta = metaOfType(order.service_type)
              const statusMeta = metaOfStatus(order.status)
              const prop = propertyName(order.property_id)
              return (
                <View key={order.id} className='order'>
                  <View className='order__head'>
                    <View className={`order__icon order__icon--${statusMeta.cls}`}>
                      <View className='icon-svg' style={iconStyle(typeMeta.icon, 40)} />
                    </View>
                    <View className='order__body'>
                      <View className='order__title-row'>
                        <Text className='order__title'>{typeMeta.label}</Text>
                        <Text className={`order__badge order__badge--${statusMeta.cls}`}>{statusMeta.label}</Text>
                      </View>
                      <View className='order__meta'>
                        <Text className='order__no'>{shortId(order.id)}</Text>
                        {!!prop && <Text className='order__dot'>·</Text>}
                        {!!prop && <Text className='order__prop'>{prop}</Text>}
                        <Text className='order__dot'>·</Text>
                        <Text>{fmtDate(order.created_at)}</Text>
                      </View>
                      {!!order.notes && <Text className='order__notes'>{order.notes}</Text>}
                    </View>
                  </View>
                  <View className='order__progress'>
                    <View className='progress'>
                      <View
                        className={`progress__bar progress__bar--${statusMeta.cls}`}
                        style={{ width: `${statusMeta.pct}%` }}
                      />
                    </View>
                    <Text className={`order__pct order__pct--${statusMeta.cls}`}>{statusMeta.pct}%</Text>
                  </View>
                </View>
              )
            })}
          </View>
        )}

        {/* 推荐服务 */}
        <View className='section-title section-title--gap'>
          <Text>推荐服务</Text>
        </View>

        <View className='pay-tip'>
          <Text className='pay-tip-label'>支持付款方式：</Text>
          <View className='pay-icons'>
            {PAYMENT_METHODS.map((m) => (
              <View key={m.key} className='pay-icon'>
                <View className='icon-svg' style={iconStyle(m.icon, 28)} />
                <Text>{m.label}</Text>
              </View>
            ))}
          </View>
        </View>

        <View className='service-list'>
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
                  立即购买
                </Button>
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* 悬浮入口：委托挂牌 */}
      <View
        className='owner-fab'
        hoverClass='owner-fab--hover'
        onClick={() => Taro.navigateTo({ url: '/pages/owner/marketing/index' })}
      >
        <View className='icon-svg' style={iconStyle('edit', 44)} />
      </View>

      <BottomNav role='owner' active='services' />
    </View>
  )
}