import { useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { ownerApi } from '@/services/api'
import { useSwrCache } from '@/hooks/useSwrCache'
import { fmtMoney as money } from '@/utils/format'
import './index.scss'
import { iconStyle } from '@/utils/icons'
import BottomNav from '@/components/BottomNav'
import StateBlock from '@/components/StateBlock'
import { useI18n } from '@/i18n'

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

const buildFilters = (
  t: (k: string, p?: Record<string, string | number>) => string
): Array<{ key: string; label: string }> => [
  { key: 'all', label: t('common.all') },
  { key: 'received', label: t('ownerIncome.filterReceived') },
  { key: 'pending', label: t('ownerIncome.filterPending') },
  { key: 'overdue', label: t('ownerIncome.filterOverdue') }
]

// 状态元信息：颜色语义交由 SCSS 徽章/图标类实现
type IncomeStatusMeta = Record<string, { label: string; cls: string; icon: 'money' | 'calendar' | 'close' }>
const buildStatusMeta = (
  t: (k: string, p?: Record<string, string | number>) => string
): IncomeStatusMeta => ({
  received: { label: t('ownerIncome.filterReceived'), cls: 'success', icon: 'money' },
  pending: { label: t('ownerIncome.filterPending'), cls: 'warning', icon: 'calendar' },
  overdue: { label: t('ownerIncome.filterOverdue'), cls: 'error', icon: 'close' }
})

const metaOf = (status: string, map: IncomeStatusMeta) => map[status] || map.pending

export default function OwnerIncomePage() {
  const { t } = useI18n()
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)
  const uid = useAuthStore((state) => state.user?.id) ?? 'anon'
  const [activeFilter, setActiveFilter] = useState('all')
  const [error, setError] = useState(false)
  const FILTERS = buildFilters(t)
  const STATUS_META = buildStatusMeta(t)

  interface IncomePayload {
    income: IncomeData
    byMonth: AnnualMonth[]
  }

  const { data, loading, refresh } = useSwrCache<IncomePayload>({
    key: `owner:income:${uid}`,
    fetcher: async (): Promise<IncomePayload> => {
      const [inc, ann]: [any, any] = await Promise.all([
        ownerApi.income(),
        ownerApi.annualFinancialSummary(new Date().getFullYear()).catch(() => null)
      ])
      const d: any = inc?.data ?? inc ?? {}
      const annD: any = ann?.data ?? ann ?? {}
      return {
        income: {
          total_income: Number(d.total_income ?? 0),
          receivable_total: Number(d.receivable_total ?? 0),
          overdue_total: Number(d.overdue_total ?? 0),
          currency: d.currency || 'THB',
          property_count: Number(d.property_count ?? 0),
          rented_count: Number(d.rented_count ?? 0),
          vacant_count: Number(d.vacant_count ?? 0),
          records: Array.isArray(d.records) ? d.records : []
        },
        byMonth: Array.isArray(annD.by_month) ? annD.by_month : []
      }
    },
  })
  const income = data?.income ?? EMPTY_INCOME
  const byMonth = data?.byMonth ?? []

  useDidShow(() => {
    loadFromStorage()
    if (!useAuthStore.getState().token) {
      Taro.redirectTo({ url: '/pages/login/index' })
      return
    }
    void refresh()
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
              <Text className='hero__label'>{t('ownerIncome.monthIncome')}</Text>
              <Text className='hero__amount'>{money(monthReceived, income.currency)}</Text>
            </View>
            <View className='hero__tag'>
              <Text>{t('ownerIncome.rentedCount', { n: income.rented_count })}</Text>
            </View>
          </View>
          <View className='hero__stats'>
            <View className='hero__stat'>
              <Text className='hero__stat-label'>{t('ownerIncome.yearIncome')}</Text>
              <Text className='hero__stat-value'>{money(yearReceived, income.currency)}</Text>
            </View>
            <View className='hero__stat hero__stat--right'>
              <Text className='hero__stat-label'>{t('ownerIncome.receivable')}</Text>
              <Text className='hero__stat-value'>{money(receivable, income.currency)}</Text>
            </View>
          </View>
        </View>

        {/* 月度收入趋势 */}
        <View className='section-title'>
          <Text>{t('ownerIncome.trendTitle')}</Text>
          <Text className='section-hint'>{t('common.year', { y: thisYear })}</Text>
        </View>
        <View className='card'>
          {trend.length === 0 ? (
            <View className='empty-tip'>
              <Text>{t('ownerIncome.noTrend')}</Text>
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
                      {t('home.monthShort', { m: m.month.slice(5) })}
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
          <Text>{t('ownerIncome.details')}</Text>
          <Text className='section-hint'>{t('common.countBi', { n: filtered.length })}</Text>
        </View>
        <View className='card card--list'>
          {loading && income.records.length === 0 && (
            <StateBlock loading text={t('common.loading')} />
          )}
          {!loading && !error && filtered.length === 0 && (
            <View className='empty-tip'>
              <Text>{income.records.length === 0 ? t('ownerIncome.noRecords') : t('ownerIncome.noFiltered')}</Text>
            </View>
          )}
          {!loading && error && income.records.length === 0 && (
            <View className='empty-tip'>
              <Text>{t('tenantHome.loadFailedRetry')}</Text>
            </View>
          )}
          {filtered.map((r) => {
            const meta = metaOf(r.status, STATUS_META)
            return (
              <View key={r.id} className='row'>
                <View className={`row__badge row__badge--${meta.cls}`}>
                  <View className='icon-svg' style={iconStyle(meta.icon, 36)} />
                </View>
                <View className='row__body'>
                  <Text className='row__title'>{r.property || t('ownerIncome.linkedProperty')}</Text>
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