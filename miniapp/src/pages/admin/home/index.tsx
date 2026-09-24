import { useMemo, useState } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { dashboardApi, leasesApi, employeesApi } from '@/services/api'
import { request } from '@/lib/api'
import { iconStyle, type IconKey } from '@/utils/icons'
import BottomNav from '@/components/BottomNav'
import StateBlock from '@/components/StateBlock'
import { useI18n } from '@/i18n'
import './index.scss'

const CURRENCY_SYMBOL: Record<string, string> = {
  CNY: '¥',
  THB: '฿',
  EUR: '€',
  USD: '$'
}

const fmtMoney = (v?: number, currency = 'THB') =>
  `${CURRENCY_SYMBOL[currency] ?? ''}${Math.round(Number(v || 0)).toLocaleString()}`

const fmtDate = (v?: string) => (v ? String(v).slice(5, 10) : '-')

const monthLabel = (key: string, suffix: string) => {
  const m = Number(String(key).split('-')[1])
  return m ? `${m}${suffix}` : key
}

export default function AdminHomePage() {
  const { t: tr } = useI18n()
  const [summary, setSummary] = useState<any>(null)
  const [trend, setTrend] = useState<any[]>([])
  const [recent, setRecent] = useState<any[]>([])
  const [counts, setCounts] = useState({ leases: 0, employees: 0, todos: 0, reconDiff: 0, overdue: 0 })
  // 对账合计（received/receivable/overdue），用于欠租占比条（对齐 App 口径）
  const [reconTotals, setReconTotals] = useState<any>({})
  const [loading, setLoading] = useState(true)

  const fetchAll = async () => {
    setLoading(true)
    // 各区块互不阻塞：任一接口失败只影响对应卡片
    const tasks = [
      dashboardApi.summary().then((r: any) => setSummary(r?.data ?? r)).catch(() => {}),
      dashboardApi
        .trend({ months: 7 })
        .then((r: any) => {
          const d = r?.data ?? r
          setTrend(d?.series || [])
        })
        .catch(() => {}),
      dashboardApi
        .recentPayments()
        .then((r: any) => {
          const d = r?.data ?? r
          setRecent(d?.items || [])
        })
        .catch(() => {}),
      leasesApi
        .list({ page: 1, page_size: 1, status: 'active' })
        .then((r: any) => {
          const d = r?.data ?? r
          setCounts((c) => ({ ...c, leases: Number(d?.total || 0) }))
        })
        .catch(() => {}),
      employeesApi
        .list({ page: 1, page_size: 1 })
        .then((r: any) => {
          const d = r?.data ?? r
          setCounts((c) => ({ ...c, employees: Number(d?.total || 0) }))
        })
        .catch(() => {}),
      request({ url: '/review-center/todos', method: 'GET' })
        .then((r: any) => {
          const d = r?.data ?? r
          setCounts((c) => ({ ...c, todos: Number(d?.total || 0) }))
        })
        .catch(() => {}),
      dashboardApi
        .financialReconciliation()
        .then((r: any) => {
          const d = r?.data ?? r
          // 对账合计（对齐 App：totals.received/receivable/overdue），用于欠租占比可视化条
          setReconTotals(d?.totals || {})
          // 后端无「差异条数」口径，取逐笔对账记录总数（records_total）
          const count = d?.records_total ?? (d?.records || []).length
          setCounts((c) => ({ ...c, reconDiff: Number(count || 0) }))
        })
        .catch(() => {}),
      // 欠租：待收且已过缴费截止日
      request({ url: '/payments', method: 'GET', data: { page: 1, page_size: 100, status: 'pending' } })
        .then((r: any) => {
          const d = r?.data ?? r
          const items: any[] = Array.isArray(d) ? d : d?.items || []
          const overdue = items.filter(
            (p) => p.due_date && new Date(p.due_date).getTime() < Date.now()
          ).length
          setCounts((c) => ({ ...c, overdue }))
        })
        .catch(() => {})
    ]
    await Promise.all(tasks)
    setLoading(false)
  }

  useDidShow(() => {
    fetchAll()
  })

  // 风险预警（对齐 App：给每个风险项补彩色占比可视化条；欠租/空置口径与 App 一致，
  // 「合同到期」为小程序保留项，占比用到期份数 / 房源总数近似，说明见 report）
  const ratio = (n: number, d: number) => (d > 0 ? Math.max(0, Math.min(n / d, 1)) : 0)
  const num = (v: any) => Number(v ?? 0)
  const risks = useMemo(() => {
    const total = Number(summary?.total_properties || 0)
    const vacant = Number(summary?.vacant || 0)
    const vacancyRate = total > 0 ? Math.round((vacant / total) * 100) : 0

    // 欠租：对齐 App 按对账金额口径（totals.overdue）计算逾期占比
    const overdueAmt = num(reconTotals?.overdue)
    const totalBilling = num(reconTotals?.received) + num(reconTotals?.receivable) + overdueAmt

    return [
      {
        key: 'expiring',
        tone: 'warning',
        icon: 'calendar' as IconKey,
        title: tr('home.expiringTitle'),
        desc: tr('home.expiringDesc'),
        value: tr('home.countUnit', { n: num(summary?.expiring_leases ?? 0) }),
        url: '/pages/admin/leases/index',
        bar: ratio(num(summary?.expiring_leases ?? 0), total)
      },
      {
        key: 'overdue',
        tone: 'danger',
        icon: 'money' as IconKey,
        title: tr('home.overdueTitle'),
        desc: tr('home.overdueDesc', {
          p: Math.round(ratio(overdueAmt, totalBilling) * 100),
          n: num(summary?.upcoming_payments)
        }),
        value: fmtMoney(overdueAmt),
        url: '/pages/admin/payments/index',
        bar: ratio(overdueAmt, totalBilling)
      },
      {
        key: 'vacancy',
        tone: 'info',
        icon: 'home' as IconKey,
        title: tr('home.vacancyTitle'),
        desc: tr('home.vacancyDesc', { v: vacant, t: total }),
        value: `${vacancyRate}%`,
        url: '/pages/admin/properties/index',
        bar: ratio(vacant, total)
      }
    ]
  }, [summary, reconTotals])

  // 经营指标（原型四卡）
  const metrics = [
    {
      key: 'revenue',
      label: 'home.metricRevenue',
      value: fmtMoney(summary?.monthly_revenue),
      tone: 'primary'
    },
    {
      key: 'occupancy',
      label: 'home.metricOccupancy',
      value: `${Number(summary?.occupancy_rate || 0)}%`,
      tone: 'success'
    },
    {
      key: 'leases',
      label: 'home.metricLeases',
      value: String(counts.leases),
      tone: 'info'
    },
    {
      key: 'employees',
      label: 'home.metricEmployees',
      value: String(counts.employees),
      tone: 'primary'
    }
  ]

  // 待办汇总（与风险预警口径区分：这里只放「待处理动作」）
  const todos: Array<{ key: string; label: string; value: number; url?: string }> = [
    {
      key: 'review',
      label: 'home.todoReview',
      value: counts.todos,
      url: '/pages/admin/review-center/index'
    },
    {
      key: 'recon',
      label: 'home.todoRecon',
      value: counts.reconDiff,
      // 与 App 管理端一致：对账差异去收款管理页逐笔核对
      url: '/pages/admin/payments/index'
    },
    {
      key: 'upcoming',
      label: 'home.todoUpcoming',
      value: Number(summary?.upcoming_payments || 0),
      url: '/pages/admin/payments/index'
    }
  ]

  // 快捷入口（对齐原型 5 格）
  const shortcuts: { key: string; label: string; icon: IconKey; url: string }[] = [
    { key: 'properties', label: 'home.scProperties', icon: 'home', url: '/pages/admin/properties/index' },
    { key: 'crm', label: 'home.scCrm', icon: 'user', url: '/pages/admin/crm/index' },
    { key: 'leases', label: 'home.scLeases', icon: 'doc', url: '/pages/admin/leases/index' },
    { key: 'payments', label: 'home.scPayments', icon: 'money', url: '/pages/admin/payments/index' },
    { key: 'listings', label: 'home.scListings', icon: 'clipboard', url: '/pages/staff/listing-edit/index' }
  ]

  const go = (url: string) => Taro.navigateTo({ url })

  const maxRevenue = Math.max(1, ...trend.map((t: any) => Number(t.revenue || 0)))

  return (
    <View className='adm-home'>
      <ScrollView scrollY className='adm-scroll'>
        {/* ===== 1. 风险预警 ===== */}
        <View className='adm-risks'>
          {risks.map((r) => (
            <View key={r.key} className={`adm-risk adm-risk--${r.tone}`} onClick={() => go(r.url)}>
              <View className='adm-risk__icon'>
                <View className='icon-svg' style={iconStyle(r.icon, 40)} />
              </View>
              <View className='adm-risk__body'>
                <Text className='adm-risk__title'>{r.title}</Text>
                <Text className='adm-risk__desc'>{r.desc}</Text>
                <View className='adm-risk__track'>
                  <View
                    className='adm-risk__bar'
                    style={{ width: `${Math.max(Math.round((r.bar ?? 0) * 100), 2)}%` }}
                  />
                </View>
              </View>
              <View className='adm-risk__right'>
                <Text className='adm-risk__value'>{r.value}</Text>
                <Text className='adm-risk__link'>{tr('home.handle')}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* ===== 2. 经营指标 ===== */}
        <View className='adm-metrics'>
          {metrics.map((m) => (
            <View key={m.key} className='adm-metric'>
              <Text className='adm-metric__label'>{tr(m.label)}</Text>
              <Text className={`adm-metric__value adm-metric__value--${m.tone}`}>{m.value}</Text>
            </View>
          ))}
        </View>

        {/* ===== 3. 经营趋势 · 收入 ===== */}
        <View className='adm-card'>
          <View className='adm-card__head'>
            <Text className='adm-card__title'>{tr('home.trendTitle')}</Text>
            <Text className='adm-card__extra'>{tr('home.trendRange')}</Text>
          </View>
          {trend.length === 0 ? (
            <View className='adm-state'>
              <Text className='adm-state__text'>{tr('home.trendEmpty')}</Text>
            </View>
          ) : (
            <View className='adm-chart'>
              {trend.map((t: any, i: number) => {
                const revenue = Number(t.revenue || 0)
                const height = Math.max(8, Math.round((revenue / maxRevenue) * 160))
                const isLast = i === trend.length - 1
                return (
                  <View key={t.month || i} className='adm-chart__col'>
                    <Text className='adm-chart__value'>{Math.round(revenue / 1000)}k</Text>
                    <View
                      className={`adm-chart__bar ${isLast ? 'adm-chart__bar--active' : ''}`}
                      style={{ height: `${height}rpx` }}
                    />
                    <Text className='adm-chart__label'>{monthLabel(t.month, tr('home.monthSuffix'))}</Text>
                  </View>
                )
              })}
            </View>
          )}
        </View>

        {/* ===== 4. 待办汇总 ===== */}
        <View className='adm-todos'>
          {todos.map((todo) => (
            <View
              key={todo.key}
              className='adm-todo'
              onClick={() =>
                todo.url
                  ? go(todo.url)
                  : Taro.showToast({
                      title: tr('home.comingSoon', { label: tr(todo.label) }),
                      icon: 'none'
                    })
              }
            >
              <Text className='adm-todo__value'>{todo.value}</Text>
              <Text className='adm-todo__label'>{tr(todo.label)}</Text>
            </View>
          ))}
        </View>

        {/* ===== 5. 快捷入口 ===== */}
        <View className='adm-quick'>
          {shortcuts.map((s) => (
            <View key={s.key} className='adm-quick__item' onClick={() => go(s.url)}>
              <View className='adm-quick__icon'>
                <View className='icon-svg' style={iconStyle(s.icon, 44)} />
              </View>
              <Text className='adm-quick__label'>{tr(s.label)}</Text>
            </View>
          ))}
        </View>

        {/* ===== 6. 最近动态（来源：/dashboard/recent-payments） ===== */}
        <View className='adm-card'>
          <View className='adm-card__head'>
            <Text className='adm-card__title'>{tr('home.recentTitle')}</Text>
            <Text className='adm-card__extra' onClick={() => go('/pages/admin/payments/index')}>
              {tr('home.allMore')}
            </Text>
          </View>
          {recent.length === 0 && (
            <StateBlock
              loading={loading}
              empty={!loading}
              text={loading ? tr('pub.loading') : tr('home.noActivity')}
            />
          )}
          {recent.slice(0, 4).map((p, i) => (
            <View key={p.id || i} className='adm-activity'>
              <View className='adm-activity__dot' />
              <View className='adm-activity__body'>
                <Text className='adm-activity__title'>
                  {tr('home.receipt')}
                  {p.status === 'succeeded' ? tr('home.receiptArrived') : tr('home.receiptUpdated')} ·{' '}
                  {p.payer_name || tr('home.payer')}
                </Text>
                <Text className='adm-activity__desc'>
                  {fmtMoney(p.amount, p.currency)} · {fmtDate(p.paid_at || p.created_at)}
                </Text>
              </View>
              <Text
                className={`badge ${p.status === 'succeeded' ? 'badge--success' : 'badge--warning'}`}
              >
                {p.status === 'succeeded' ? tr('pay.received') : tr('pay.pendingShort')}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* 底部导航：首页 */}
      <BottomNav role='admin' active='dashboard' />
    </View>
  )
}