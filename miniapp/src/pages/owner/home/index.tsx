import { useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { ownerApi } from '@/services/api'
import { iconStyle } from '@/utils/icons'
import BottomNav from '@/components/BottomNav'
import './index.scss'

// ============ 接口字段（后端 snake_case）============
interface OwnerProp {
  id?: string | number
  code?: string
  room_number?: string
  display_name?: string
  name?: string
  project_name?: string
  projectName?: string
  address?: string
  property_type?: string
  monthly_rent?: number
  rentPrice?: number
  currency?: string
  size_sqm?: number
  area?: number
  bedrooms?: number
  bathrooms?: number
  layout?: string
  status?: string
  tenant_name?: string
}

// 从接口返回中提取列表，兼容多种结构
function pickList(res: any): any[] {
  if (Array.isArray(res)) return res
  const d = res?.data ?? res ?? {}
  if (Array.isArray(d)) return d
  if (Array.isArray(d?.items)) return d.items
  if (Array.isArray(d?.list)) return d.list
  if (Array.isArray(d?.data)) return d.data
  if (Array.isArray(d?.records)) return d.records
  return []
}

const CURRENCY_SYMBOL: Record<string, string> = {
  THB: '฿',
  CNY: '¥',
  MYR: 'RM',
  RM: 'RM',
  USD: '$',
  EUR: '€'
}

const money = (v?: number, currency?: string) => {
  const sym = CURRENCY_SYMBOL[String(currency || 'THB').toUpperCase()] || ''
  return `${sym}${Number(v || 0).toLocaleString()}`
}

const propertyTitle = (p: OwnerProp) =>
  p.display_name || p.name || p.project_name || p.projectName || p.room_number || p.code || p.address || '未命名房源'

const propertyMeta = (p: OwnerProp) => {
  const room = p.bedrooms ? `${p.bedrooms}室${p.bathrooms || 0}厅` : p.layout || ''
  const size = p.size_sqm ?? p.area
  return [room, size ? `${size}㎡` : ''].filter(Boolean).join(' ') || '—'
}

export default function OwnerHomePage() {
  const user = useAuthStore((state) => state.user)
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)
  const [properties, setProperties] = useState<OwnerProp[]>([])
  const [income, setIncome] = useState({ received: 0, receivable: 0, overdue: 0, currency: 'THB' })

  const fetchAll = async () => {
    const [propRes, incomeRes] = await Promise.all([
      ownerApi.properties().catch(() => null),
      ownerApi.income().catch(() => null)
    ])

    setProperties(pickList(propRes) as OwnerProp[])

    const inc: any = (incomeRes as any)?.data ?? incomeRes ?? {}
    setIncome({
      received: Number(inc.total_income ?? inc.totalIncome ?? 0),
      receivable: Number(inc.receivable_total ?? inc.pendingIncome ?? 0),
      overdue: Number(inc.overdue_total ?? inc.overdueIncome ?? 0),
      currency: inc.currency || 'THB'
    })
  }

  useDidShow(() => {
    loadFromStorage()
    if (!useAuthStore.getState().token) {
      Taro.redirectTo({ url: '/pages/login/index' })
      return
    }
    fetchAll()
  })

  const statusCount = {
    total: properties.length,
    rented: properties.filter((p) => p.status === 'rented').length,
    vacant: properties.filter((p) => ['vacant', 'available'].includes(String(p.status || ''))).length,
    forSale: properties.filter((p) => ['for_sale', 'on_sale', 'sale'].includes(String(p.status || ''))).length
  }

  const currency = properties[0]?.currency || income.currency || 'THB'

  // 收益总览：本月应收 / 已收 / 待收，进度由真实金额算得
  const receivable = income.receivable
  const collected = Math.max(receivable - income.overdue, 0)
  const monthTotal = collected + income.overdue
  const collectedRate = monthTotal > 0 ? Math.round((collected / monthTotal) * 100) : 0

  const propStatus = (p: OwnerProp) => {
    const s = String(p.status || '').toLowerCase()
    if (s === 'vacant' || s === 'available') return { text: '空置', cls: 'vacant' }
    if (s === 'for_sale' || s === 'on_sale' || s === 'sale') return { text: '在售', cls: 'sale' }
    return { text: '在租', cls: 'rented' }
  }

  const goIncome = () => Taro.navigateTo({ url: '/pages/owner/income/index' })
  const goProperties = () => Taro.navigateTo({ url: '/pages/owner/properties/index' })

  return (
    <View className='owner-home-page'>
      <View className='page-container'>
        <View className='welcome-section'>
          <Text className='welcome-text'>欢迎回来，{user?.name || '业主'}</Text>
          <Text className='welcome-sub'>您名下共有 {statusCount.total} 套房产</Text>
        </View>

        {/* 收益总览 → 收益中心 */}
        <View className='section-title'>
          <Text>收益总览</Text>
          <Text className='section-hint section-hint--link' onClick={goIncome}>
            查看明细 ›
          </Text>
        </View>
        <View className='overview-card' hoverClass='overview-card--hover' onClick={goIncome}>
          <View className='overview-card__row'>
            <Text className='overview-card__label'>本月应收</Text>
            <Text className='overview-card__main'>{money(receivable, currency)}</Text>
          </View>
          <View className='overview-card__grid'>
            <View className='overview-cell'>
              <Text className='overview-cell__label'>已收</Text>
              <Text className='overview-cell__value overview-cell__value--success'>
                {money(collected, currency)}
              </Text>
            </View>
            <View className='overview-cell overview-cell--warning'>
              <Text className='overview-cell__label'>待收</Text>
              <Text className='overview-cell__value overview-cell__value--warning'>
                {money(income.overdue, currency)}
              </Text>
            </View>
          </View>
          <View className='progress'>
            <View className='progress__bar' style={{ width: `${collectedRate}%` }} />
          </View>
          <View className='overview-card__row overview-card__row--foot'>
            <Text className='overview-card__label'>本月收款进度</Text>
            <Text className='overview-card__rate'>已收 {collectedRate}%</Text>
          </View>
        </View>

        {/* 房源管理 → 房源管理页 */}
        <View className='section-title'>
          <Text>房源管理</Text>
          <Text className='section-hint section-hint--link' onClick={goProperties}>
            全部 {statusCount.total} 套 ›
          </Text>
        </View>
        <View className='asset-card'>
          <View className='asset-stats'>
            <View className='asset-stat'>
              <Text className='asset-stat__num'>{statusCount.total}</Text>
              <Text className='asset-stat__label'>名下房源</Text>
            </View>
            <View className='asset-stat'>
              <Text className='asset-stat__num asset-stat__num--success'>{statusCount.rented}</Text>
              <Text className='asset-stat__label'>在租房源</Text>
            </View>
            <View className='asset-stat'>
              <Text className='asset-stat__num asset-stat__num--muted'>{statusCount.vacant}</Text>
              <Text className='asset-stat__label'>空置房源</Text>
            </View>
          </View>

          {properties.length === 0 ? (
            <View className='todo-empty'>
              <Text className='todo-empty__text'>暂无房源，去委托挂牌让平台帮你出租</Text>
            </View>
          ) : (
            <View className='asset-prop-list'>
              {properties.slice(0, 3).map((p, idx) => {
                const st = propStatus(p)
                const last = idx === Math.min(properties.length, 3) - 1
                return (
                  <View
                    key={String(p.id)}
                    className={`asset-prop-row${last ? ' asset-prop-row--last' : ''}`}
                    hoverClass='asset-prop-row--hover'
                    onClick={() =>
                      Taro.navigateTo({ url: `/pages/owner/property-detail/index?id=${p.id}` })
                    }
                  >
                    <View className='asset-prop-row__badge icon-svg' style={iconStyle('home', 36)} />
                    <View className='asset-prop-row__body'>
                      <View className='asset-prop-row__head'>
                        <Text className='asset-prop-row__name'>{propertyTitle(p)}</Text>
                        <Text className={`asset-prop-row__status asset-prop-row__status--${st.cls}`}>
                          {st.text}
                        </Text>
                      </View>
                      <Text className='asset-prop-row__meta'>
                        {propertyMeta(p)}
                        {p.tenant_name ? ` · 租客 ${p.tenant_name}` : ''}
                      </Text>
                      <Text className='asset-prop-row__price'>
                        {p.monthly_rent ?? p.rentPrice
                          ? `${money(p.monthly_rent ?? p.rentPrice, p.currency || currency)}/月`
                          : '暂无挂牌价'}
                      </Text>
                    </View>
                    <Text className='asset-prop-row__arrow'>›</Text>
                  </View>
                )
              })}
            </View>
          )}
        </View>
      </View>

      <BottomNav role='owner' active='dashboard' />
    </View>
  )
}
