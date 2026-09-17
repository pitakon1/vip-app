import { useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { ownerApi } from '@/services/api'
import { fmtMoney as money } from '@/utils/format'
import './index.scss'
import { iconStyle } from '@/utils/icons'
import BottomNav from '@/components/BottomNav'

interface IncomeRecord {
  id: string
  property?: string
  month: string
  amount: number
  status: string
}

interface IncomeData {
  total_income: number
  receivable_total: number
  overdue_total: number
  currency: string
  property_count: number
  rented_count: number
  vacant_count: number
  records: IncomeRecord[]
}

interface AnnualMonth {
  month: string
  received: number
  pending: number
  overdue: number
  count: number
}

const EMPTY_INCOME: IncomeData = {
  total_income: 0,
  receivable_total: 0,
  overdue_total: 0,
  currency: 'THB',
  property_count: 0,
  rented_count: 0,
  vacant_count: 0,
  records: []
}

const shortMoney = (v: number) =>
  v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v))

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'received', label: '已到账' },
  { key: 'pending', label: '待收' },
  { key: 'overdue', label: '逾期' }
]

// 状态元信息：颜色语义交由 SCSS 徽章/图标类实现
const STATUS_META: Record<string, { label: string; cls: string; icon: 'money' | 'calendar' | 'close' }> = {
  received: { label: '已到账', cls: 'success', icon: 'money' },
  pending: { label: '待收', cls: 'warning', icon: 'calendar' },
  overdue: { label: '逾期', cls: 'error', icon: 'close' }
}

const metaOf = (status: string) => STATUS_META[status] || STATUS_META.pending

export default function OwnerIncomePage() {
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)
  const [income, setIncome] = useState<IncomeData>(EMPTY_INCOME)
  const [byMonth, setByMonth] = useState<AnnualMonth[]>([])
  const [activeFilter, setActiveFilter] = useState('all')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  const fetchIncome = async () => {
    setLoading(true)
    setError(false)
    try {
      const [inc, ann]: [any, any] = await Promise.all([
        ownerApi.income(),
        ownerApi.annualFinancialSummary(new Date().getFullYear()).catch(() => null)
      ])
      const d: any = inc?.data ?? inc ?? {}
      setIncome({
        total_income: Number(d.total_income ?? 0),
        receivable_total: Number(d.receivable_total ?? 0),
        overdue_total: Number(d.overdue_total ?? 0),
        currency: d.currency || 'THB',
        property_count: Number(d.property_count ?? 0),
        rented_count: Number(d.rented_count ?? 0),
        vacant_count: Number(d.vacant_count ?? 0),
        records: Array.isArray(d.records) ? d.records : []
      })
      const annD: any = ann?.data ?? ann ?? {}
      setByMonth(Array.isArray(annD.by_month) ? annD.by_month : [])
    } catch (e) {
      console.error('[OwnerIncome] 获取收入失败', e)
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
    fetchIncome()
  })

  // 本月 / 本年累计收入均由逐笔记录真实汇总
  const thisMonth = new Date().toISOString().slice(0, 7)
  const thisYear = String(new Date().getFullYear())
  const receivedRecords = income.records.filter((r) => r.status === 'received')
  const monthReceived = receivedRecords
    .filter((r) => r.month === thisMonth)
    .reduce((sum, r) => sum + Number(r.amount || 0), 0)
  const yearReceived = receivedRecords
    .filter((r) => String(r.month || '').startsWith(thisYear))
    .reduce((sum, r) => sum + Number(r.amount || 0), 0)
  const pendingTotal = income.records
    .filter((r) => r.status === 'pending')
    .reduce((sum, r) => sum + Number(r.amount || 0), 0)
  const overdueTotal = income.records
    .filter((r) => r.status === 'overdue')
    .reduce((sum, r) => sum + Number(r.amount || 0), 0)
  const receivable = income.receivable_total || pendingTotal + overdueTotal

  // 月度趋势：取年度汇总最近 6 个月，柱高由当月已收 / 峰值算得
  const trend = byMonth.slice(-6)
  const trendMax = Math.max(...trend.map((m) => Number(m.received || 0)), 1)

  const filtered =
    activeFilter === 'all'
      ? income.records
      : income.records.filter((r) => r.status === activeFilter)

  return (
    <View className='owner-income-page'>
      <View className='page-container'>
        {/* 收入摘要（渐变卡） */}
        <View className='hero'>
          <View className='hero__top'>
            <View className='hero__left'>
              <Text className='hero__label'>本月收入</Text>
              <Text className='hero__amount'>{money(monthReceived, income.currency)}</Text>
            </View>
            <View className='hero__tag'>
              <Text>{income.rented_count} 套在租</Text>
            </View>
          </View>
          <View className='hero__stats'>
            <View className='hero__stat'>
              <Text className='hero__stat-label'>年累计收入</Text>
              <Text className='hero__stat-value'>{money(yearReceived, income.currency)}</Text>
            </View>
            <View className='hero__stat hero__stat--right'>
              <Text className='hero__stat-label'>待收金额</Text>
              <Text className='hero__stat-value'>{money(receivable, income.currency)}</Text>
            </View>
          </View>
        </View>

        {/* 月度收入趋势 */}
        <View className='section-title'>
          <Text>月度收入趋势</Text>
          <Text className='section-hint'>{thisYear} 年</Text>
        </View>
        <View className='card'>
          {trend.length === 0 ? (
            <View className='empty-tip'>
              <Text>暂无月度收入数据</Text>
            </View>
          ) : (
            <View className='chart'>
              {trend.map((m) => {
                const h = Math.round((Number(m.received || 0) / trendMax) * 100)
                const isCurrent = m.month === thisMonth
                return (
                  <View key={m.month} className='chart__col'>
                    <View className='chart__track'>
                      <Text className={`chart__value ${isCurrent ? 'chart__value--current' : ''}`}>
                        {shortMoney(Number(m.received || 0))}
                      </Text>
                      <View
                        className={`chart__bar ${isCurrent ? 'chart__bar--current' : ''}`}
                        style={{ height: `${h}%` }}
                      />
                    </View>
                    <Text className={`chart__label ${isCurrent ? 'chart__label--current' : ''}`}>
                      {m.month.slice(5)}月
                    </Text>
                  </View>
                )
              })}
            </View>
          )}
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

        {/* 收入明细 */}
        <View className='section-title'>
          <Text>收入明细</Text>
          <Text className='section-hint'>{filtered.length} 笔</Text>
        </View>
        <View className='card card--list'>
          {loading && income.records.length === 0 && (
            <View className='empty-tip'>
              <Text>加载中...</Text>
            </View>
          )}
          {!loading && !error && filtered.length === 0 && (
            <View className='empty-tip'>
              <Text>{income.records.length === 0 ? '暂无收入明细' : '该筛选下暂无记录'}</Text>
            </View>
          )}
          {!loading && error && income.records.length === 0 && (
            <View className='empty-tip'>
              <Text>加载失败，请下拉重试</Text>
            </View>
          )}
          {filtered.map((r) => {
            const meta = metaOf(r.status)
            return (
              <View key={r.id} className='row'>
                <View className={`row__badge row__badge--${meta.cls}`}>
                  <View className='icon-svg' style={iconStyle(meta.icon, 36)} />
                </View>
                <View className='row__body'>
                  <Text className='row__title'>{r.property || '关联房源'}</Text>
                  <Text className='row__desc'>{r.month || '—'}</Text>
                </View>
                <View className='row__right'>
                  <Text className={`row__amount row__amount--${meta.cls}`}>
                    {r.status === 'received' ? '+' : ''}
                    {money(r.amount, income.currency)}
                  </Text>
                  <Text className={`row__tag row__tag--${meta.cls}`}>{meta.label}</Text>
                </View>
              </View>
            )
          })}
        </View>
      </View>

      <BottomNav role='owner' active='income' />
    </View>
  )
}