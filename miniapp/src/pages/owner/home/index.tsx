import { useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { ownerApi, paymentsApi, leasesApi, maintenanceApi, saleListingApi } from '@/services/api'
import { iconStyle, type IconKey } from '@/utils/icons'
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
}

interface OwnerPayment {
  id: string
  amount?: number
  currency?: string
  status?: string
  paid_at?: string
  due_date?: string
  created_at?: string
  property_id?: string
}

interface OwnerLease {
  id: string
  property_id?: string
  end_date?: string
  monthly_rent?: number
  currency?: string
  status?: string
}

interface OwnerTicket {
  id: number | string
  title?: string
  status?: string
  created_at?: string
  createdAt?: string
  property_id?: string
}

interface OwnerSaleListing {
  id: string
  title?: string
  address?: string
  asking_price?: number
  currency?: string
  size_sqm?: number
  bedrooms?: number
  bathrooms?: number
  status?: string
  owner_user_id?: string
}

// 从接口返回中提取列表，兼容多种结构
function pickList(res: any, key = 'items'): any[] {
  if (Array.isArray(res)) return res
  const d = res?.data ?? res ?? {}
  if (Array.isArray(d)) return d
  if (Array.isArray(d?.[key])) return d[key]
  if (Array.isArray(d?.data)) return d.data
  if (Array.isArray(d?.items)) return d.items
  if (Array.isArray(d?.list)) return d.list
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

const shortDate = (x?: string) => (x ? String(x).replace('T', ' ').slice(0, 10) : '-')

const daysUntil = (x?: string) => {
  if (!x) return 0
  const t = new Date(String(x).replace(' ', 'T')).getTime()
  if (Number.isNaN(t)) return 0
  return Math.max(Math.round((t - Date.now()) / 86400000), 0)
}

// 快捷入口（icon 为 src/utils/icons.ts 的图标 key，禁止 emoji）
const QUICK_ENTRIES: { icon: IconKey; label: string; url: string }[] = [
  { icon: 'money', label: '收益报表', url: '/pages/owner/income/index' },
  { icon: 'doc', label: '租房文档', url: '/pages/owner/documents/index' },
  { icon: 'gear', label: '物业服务', url: '/pages/owner/services/index' },
  { icon: 'card', label: '账单缴费', url: '/pages/owner/payments/index' }
]

const PROPERTY_STATUS_TEXT: Record<string, string> = {
  rented: '在租',
  vacant: '空置',
  renewing: '续租中',
  maintenance: '维护中',
  reserved: '已预订'
}

const propertyTitle = (p: OwnerProp) =>
  p.display_name || p.name || p.project_name || p.projectName || p.room_number || p.code || p.address || '未命名房源'

const propertyMeta = (p: OwnerProp) => {
  const room = p.bedrooms ? `${p.bedrooms}室${p.bathrooms || 0}厅` : p.layout || ''
  const size = p.size_sqm ?? p.area
  return [room, size ? `${size}㎡` : ''].filter(Boolean).join(' ') || '—'
}

// 售房挂牌状态（对齐后端 ListingStatus 枚举）
const LISTING_STATUS_TEXT: Record<string, string> = {
  active: '在售',
  pending: '待确认',
  contracted: '已签约',
  closed: '已成交',
  cancelled: '已取消',
  expired: '已过期'
}

const listingMeta = (l: OwnerSaleListing) => {
  const room = l.bedrooms ? `${l.bedrooms}室${l.bathrooms || 0}厅` : ''
  const size = l.size_sqm ? `${l.size_sqm}㎡` : ''
  return [room, size].filter(Boolean).join(' ')
}

export default function OwnerHomePage() {
  const user = useAuthStore((state) => state.user)
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)
  const [properties, setProperties] = useState<OwnerProp[]>([])
  const [payments, setPayments] = useState<OwnerPayment[]>([])
  const [leases, setLeases] = useState<OwnerLease[]>([])
  const [tickets, setTickets] = useState<OwnerTicket[]>([])
  const [saleListings, setSaleListings] = useState<OwnerSaleListing[]>([])
  const [income, setIncome] = useState({ received: 0, receivable: 0, overdue: 0, currency: 'THB' })

  const fetchAll = async () => {
    const [propRes, incomeRes, payRes, leaseRes, ticketRes, saleRes] = await Promise.all([
      ownerApi.properties().catch(() => null),
      ownerApi.income().catch(() => null),
      paymentsApi.mine().catch(() => null),
      leasesApi.list().catch(() => null),
      maintenanceApi.list().catch(() => null),
      saleListingApi.list().catch(() => null)
    ])

    setProperties(pickList(propRes) as OwnerProp[])

    const inc: any = (incomeRes as any)?.data ?? incomeRes ?? {}
    setIncome({
      received: Number(inc.total_income ?? inc.totalIncome ?? 0),
      receivable: Number(inc.receivable_total ?? inc.pendingIncome ?? 0),
      overdue: Number(inc.overdue_total ?? inc.overdueIncome ?? 0),
      currency: inc.currency || 'THB'
    })

    setPayments(pickList(payRes) as OwnerPayment[])
    setLeases(pickList(leaseRes) as OwnerLease[])
    setTickets(pickList(ticketRes) as OwnerTicket[])
    setSaleListings(pickList(saleRes) as OwnerSaleListing[])
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
    vacant: properties.filter((p) => p.status === 'vacant').length
  }

  // 预警卡：待收租金（pending/overdue），有真实数据才渲染
  const pendingPayments = payments.filter((p) =>
    ['pending', 'overdue', 'processing'].includes(String(p.status || '').toLowerCase())
  )
  const propertyNameById = (id?: string) => {
    if (!id) return ''
    const p = properties.find((x) => String(x.id) === String(id))
    return p?.display_name || p?.room_number || ''
  }

  // 收益总览：本月应收 / 已收 / 待收，进度由真实金额算得
  const receivable = income.receivable
  const collected = Math.max(receivable - income.overdue, 0)
  const monthTotal = collected + income.overdue
  const collectedRate = monthTotal > 0 ? Math.round((collected / monthTotal) * 100) : 0

  // 待处理事项：合同即将到期（60 天内）
  const expiringLease = leases
    .filter((l) => l.end_date)
    .filter((l) => {
      const d = daysUntil(l.end_date)
      return d >= 0 && d <= 60
    })
    .sort((a, b) => String(a.end_date).localeCompare(String(b.end_date)))[0]

  // 待处理事项：租客报修待审批（后端业主角色不过滤，按名下房源收窄）
  const ownedIds = new Set(properties.map((p) => String(p.id)))
  const pendingTickets = tickets.filter(
    (t) => String(t.status || '') === 'pending' && (!t.property_id || ownedIds.has(String(t.property_id)))
  )

  // 我的售房挂牌：接口按角色返回可见挂牌，再按 owner_user_id 收窄到本人
  const mySaleListings = saleListings.filter(
    (l) => !l.owner_user_id || String(l.owner_user_id) === String(user?.id)
  )
  // 待处理事项：卖房委托 · 估价待确认
  const pendingSale = mySaleListings.find((l) => l.status === 'pending')
  // 在售房源卡优先取已挂牌的委托
  const saleCard = mySaleListings.find((l) => l.status === 'active') ?? pendingSale
  const todoCount = (expiringLease ? 1 : 0) + pendingTickets.length + (pendingSale ? 1 : 0)

  // 资产概览：在租房源卡（→ 房源详情）与在售房源卡（→ 委托挂牌）
  const rentCard = properties.find((p) => p.status === 'rented')

  // 最近入账：已到账记录
  const recentIncomes = payments
    .filter((p) => String(p.status || '').toLowerCase() === 'succeeded')
    .sort((a, b) => String(b.paid_at || b.created_at || '').localeCompare(String(a.paid_at || a.created_at || '')))
    .slice(0, 4)

  return (
    <View className='owner-home-page'>
      <View className='page-container'>
        <View className='welcome-section'>
          <Text className='welcome-text'>欢迎回来，{user?.name || '业主'}</Text>
          <Text className='welcome-sub'>您名下共有 {statusCount.total} 套房产</Text>
        </View>

        {/* 双业务入口：委托出租 / 委托出售 */}
        <View className='dual-entry'>
          <View
            className='dual-entry__item dual-entry__item--rent'
            hoverClass='dual-entry__item--hover'
            onClick={() => Taro.navigateTo({ url: '/pages/owner/marketing/index' })}
          >
            <View className='dual-entry__icon icon-svg' style={iconStyle('home', 40)} />
            <View className='dual-entry__body'>
              <Text className='dual-entry__title'>委托出租</Text>
              <Text className='dual-entry__sub'>托管出租 · 省心收租</Text>
            </View>
            <Text className='dual-entry__arrow'>›</Text>
          </View>
          <View
            className='dual-entry__item dual-entry__item--sale'
            hoverClass='dual-entry__item--hover'
            onClick={() => Taro.navigateTo({ url: '/pages/owner/marketing/index' })}
          >
            <View className='dual-entry__icon icon-svg' style={iconStyle('money', 40)} />
            <View className='dual-entry__body'>
              <Text className='dual-entry__title'>委托出售</Text>
              <Text className='dual-entry__sub'>在线估价 · 挂牌成交</Text>
            </View>
            <Text className='dual-entry__arrow'>›</Text>
          </View>
        </View>

        {/* 预警卡：租金待确认（置顶，有数据才展示） */}
        {pendingPayments.length > 0 && (
          <View className='warn-card'>
            <View className='warn-card__head'>
              <View className='warn-card__badge icon-svg' style={iconStyle('card', 40)} />
              <View className='warn-card__body'>
                <Text className='warn-card__title'>{pendingPayments.length} 笔租金待确认</Text>
                <Text className='warn-card__desc'>
                  {pendingPayments
                    .slice(0, 2)
                    .map((p) => `${propertyNameById(p.property_id) || '关联房源'} ${money(p.amount, p.currency)}`)
                    .join(' · ')}
                </Text>
              </View>
            </View>
            <View
              className='warn-card__btn'
              hoverClass='warn-card__btn--hover'
              onClick={() => Taro.navigateTo({ url: '/pages/owner/income/index' })}
            >
              <Text>去确认</Text>
            </View>
          </View>
        )}

        {/* 收益总览 */}
        <View className='section-title'>
          <Text>收益总览</Text>
          <Text className='section-hint'>租金 + 售房款</Text>
        </View>
        <View className='overview-card'>
          <View className='overview-card__row'>
            <Text className='overview-card__label'>本月应收</Text>
            <Text className='overview-card__main'>{money(receivable, income.currency)}</Text>
          </View>
          <View className='overview-card__grid'>
            <View className='overview-cell'>
              <Text className='overview-cell__label'>已收</Text>
              <Text className='overview-cell__value overview-cell__value--success'>
                {money(collected, income.currency)}
              </Text>
            </View>
            <View className='overview-cell overview-cell--warning'>
              <Text className='overview-cell__label'>待收</Text>
              <Text className='overview-cell__value overview-cell__value--warning'>
                {money(income.overdue, income.currency)}
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

        {/* 待处理事项 */}
        <View className='section-title'>
          <Text>待处理事项</Text>
          <Text className='section-hint'>{todoCount} 项</Text>
        </View>
        <View className='todo-card'>
          {todoCount === 0 && (
            <View className='todo-empty'>
              <Text className='todo-empty__text'>暂无待处理事项</Text>
            </View>
          )}

          {expiringLease && (
            <View className='todo-row todo-row--lease'>
              <View className='todo-row__badge icon-svg' style={iconStyle('calendar', 36)} />
              <View className='todo-row__body'>
                <Text className='todo-row__title'>
                  {propertyNameById(expiringLease.property_id) || '在租租约'} 租约 {daysUntil(expiringLease.end_date)} 天后到期
                </Text>
                <Text className='todo-row__desc'>到期 {shortDate(expiringLease.end_date)}</Text>
              </View>
              <View className='todo-row__btn'>
                <Text>续约</Text>
              </View>
            </View>
          )}

          {pendingTickets.length > 0 && (
            <View className='todo-row'>
              <View className='todo-row__badge icon-svg' style={iconStyle('gear', 36)} />
              <View className='todo-row__body'>
                <Text className='todo-row__title'>租客报修待审批 · {pendingTickets.length} 条</Text>
                <Text className='todo-row__desc'>
                  {pendingTickets
                    .slice(0, 2)
                    .map((t) => t.title || propertyNameById(String(t.property_id || '')) || '报修工单')
                    .join(' · ')}
                </Text>
              </View>
              <View
                className='todo-row__btn todo-row__btn--primary'
                hoverClass='todo-row__btn--hover'
                onClick={() => Taro.navigateTo({ url: '/pages/owner/services/index' })}
              >
                <Text>审批</Text>
              </View>
            </View>
          )}

          {/* 卖房委托：估价待确认（有挂牌数据才展示） */}
          {pendingSale && (
            <View className='todo-row'>
              <View className='todo-row__badge icon-svg' style={iconStyle('money', 36)} />
              <View className='todo-row__body'>
                <Text className='todo-row__title'>卖房委托 · 估价待确认</Text>
                <Text className='todo-row__desc'>
                  {[
                    pendingSale.title || '未命名房源',
                    pendingSale.asking_price ? money(pendingSale.asking_price, pendingSale.currency) : ''
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
              <View
                className='todo-row__btn todo-row__btn--primary'
                hoverClass='todo-row__btn--hover'
                onClick={() => Taro.navigateTo({ url: '/pages/owner/marketing/index' })}
              >
                <Text>去确认</Text>
              </View>
            </View>
          )}
        </View>

        {/* 资产概览 */}
        <View className='section-title'>
          <Text>资产概览</Text>
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

          {!rentCard && !saleCard ? (
            <View className='todo-empty'>
              <Text className='todo-empty__text'>暂无房源数据</Text>
            </View>
          ) : (
            <View className='asset-props'>
              {/* 在租房源卡 → 房源详情 */}
              {rentCard && (
                <View
                  key={String(rentCard.id)}
                  className='asset-prop'
                  hoverClass='asset-prop--hover'
                  onClick={() =>
                    Taro.navigateTo({ url: `/pages/owner/property-detail/index?id=${rentCard.id}` })
                  }
                >
                  <View className='asset-prop__thumb icon-svg' style={iconStyle('home', 48)} />
                  <View className='asset-prop__body'>
                    <View className='asset-prop__head'>
                      <Text className='asset-prop__name'>{propertyTitle(rentCard)}</Text>
                      <Text
                        className={`asset-prop__status asset-prop__status--${String(rentCard.status || 'rented')}`}
                      >
                        {PROPERTY_STATUS_TEXT[String(rentCard.status || 'rented')] || '在租'}
                      </Text>
                    </View>
                    <Text className='asset-prop__meta'>{propertyMeta(rentCard)}</Text>
                    <Text className='asset-prop__price'>
                      {money(rentCard.monthly_rent ?? rentCard.rentPrice, rentCard.currency)}
                      <Text className='asset-prop__unit'>/月</Text>
                    </Text>
                  </View>
                </View>
              )}

              {/* 在售房源卡 → 委托挂牌 */}
              {saleCard && (
                <View
                  key={saleCard.id}
                  className='asset-prop'
                  hoverClass='asset-prop--hover'
                  onClick={() => Taro.navigateTo({ url: '/pages/owner/marketing/index' })}
                >
                  <View className='asset-prop__thumb icon-svg' style={iconStyle('money', 48)} />
                  <View className='asset-prop__body'>
                    <View className='asset-prop__head'>
                      <Text className='asset-prop__name'>
                        {saleCard.title || saleCard.address || '未命名房源'}
                      </Text>
                      <Text className='asset-prop__status asset-prop__status--sale'>
                        {LISTING_STATUS_TEXT[String(saleCard.status || '')] || '在售'}
                      </Text>
                    </View>
                    <Text className='asset-prop__meta'>
                      {listingMeta(saleCard) || saleCard.address || '—'}
                    </Text>
                    <Text className='asset-prop__price'>
                      {money(saleCard.asking_price, saleCard.currency)}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          )}
        </View>

        {/* 快捷入口 */}
        <View className='quick-grid'>
          {QUICK_ENTRIES.map((q) => (
            <View
              key={q.label}
              className='quick-grid__cell'
              hoverClass='quick-grid__cell--hover'
              onClick={() => Taro.navigateTo({ url: q.url })}
            >
              <View className='quick-grid__badge'>
                <View className='quick-grid__icon icon-svg' style={iconStyle(q.icon, 40)} />
              </View>
              <Text className='quick-grid__title'>{q.label}</Text>
            </View>
          ))}
        </View>

        {/* 最近入账 */}
        <View className='section-title'>
          <Text>最近入账</Text>
        </View>
        <View className='recent-card'>
          {recentIncomes.length === 0 ? (
            <View className='todo-empty'>
              <Text className='todo-empty__text'>暂无入账记录</Text>
            </View>
          ) : (
            recentIncomes.map((p) => (
              <View key={p.id} className='recent-row'>
                <View className='recent-row__badge icon-svg' style={iconStyle('money', 36)} />
                <View className='recent-row__body'>
                  <Text className='recent-row__title'>
                    {propertyNameById(p.property_id) || p.property_id?.slice(0, 8) || '关联房源'}
                  </Text>
                  <Text className='recent-row__desc'>{shortDate(p.paid_at || p.created_at)}</Text>
                </View>
                <View className='recent-row__right'>
                  <Text className='recent-row__amount'>+{money(p.amount, p.currency)}</Text>
                  <Text className='recent-row__badge-text'>已到账</Text>
                </View>
              </View>
            ))
          )}
        </View>
      </View>

      <BottomNav role='owner' active='dashboard' />
    </View>
  )
}