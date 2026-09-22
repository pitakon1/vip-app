import { useMemo, useState } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { dashboardApi, leasesApi, employeesApi } from '@/services/api'
import { request } from '@/lib/api'
import { iconStyle, type IconKey } from '@/utils/icons'
import BottomNav from '@/components/BottomNav'
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

const monthLabel = (key: string) => {
  const m = Number(String(key).split('-')[1])
  return m ? `${m}月` : key
}

export default function AdminHomePage() {
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
        title: '合同 30 天内到期',
        desc: '需提前联系租客确认续约',
        value: `${num(summary?.expiring_leases ?? 0)} 份`,
        url: '/pages/admin/leases/index',
        bar: ratio(num(summary?.expiring_leases ?? 0), total)
      },
      {
        key: 'overdue',
        tone: 'danger',
        icon: 'money' as IconKey,
        title: '欠租与逾期',
        desc: `逾期占比 ${Math.round(ratio(overdueAmt, totalBilling) * 100)}% · 待收款 ${num(summary?.upcoming_payments)} 笔`,
        value: fmtMoney(overdueAmt),
        url: '/pages/admin/payments/index',
        bar: ratio(overdueAmt, totalBilling)
      },
      {
        key: 'vacancy',
        tone: 'info',
        icon: 'home' as IconKey,
        title: '空置率',
        desc: `空置 ${vacant} 套 / 共 ${total} 套 · 警戒线 10%`,
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
      label: '本月营收',
      value: fmtMoney(summary?.monthly_revenue),
      tone: 'primary'
    },
    {
      key: 'occupancy',
      label: '出租率',
      value: `${Number(summary?.occupancy_rate || 0)}%`,
      tone: 'success'
    },
    {
      key: 'leases',
      label: '在租合同',
      value: String(counts.leases),
      tone: 'info'
    },
    {
      key: 'employees',
      label: '员工数',
      value: String(counts.employees),
      tone: 'primary'
    }
  ]

  // 待办汇总（与风险预警口径区分：这里只放「待处理动作」）
  // 「待审核」「对账待核」对应的独立页面不在小程序原型范围内，此处仅保留真实数量展示，不做跳转
  const todos: Array<{ key: string; label: string; value: number; url?: string }> = [
    {
      key: 'review',
      label: '待审核',
      value: counts.todos
    },
    {
      key: 'recon',
      label: '对账待核',
      value: counts.reconDiff
    },
    {
      key: 'upcoming',
      label: '7天内待缴',
      value: Number(summary?.upcoming_payments || 0),
      url: '/pages/admin/payments/index'
    }
  ]

  // 快捷入口（对齐原型 5 格）
  const shortcuts: { key: string; label: string; icon: IconKey; url: string }[] = [
    { key: 'properties', label: '房源管理', icon: 'home', url: '/pages/admin/properties/index' },
    { key: 'crm', label: '客户管理', icon: 'user', url: '/pages/admin/crm/index' },
    { key: 'leases', label: '合同管理', icon: 'doc', url: '/pages/admin/leases/index' },
    { key: 'payments', label: '收款管理', icon: 'money', url: '/pages/admin/payments/index' },
    { key: 'listings', label: '上架房源', icon: 'clipboard', url: '/pages/staff/listing-edit/index' }
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
                <Text className='adm-risk__link'>去处理 ›</Text>
              </View>
            </View>
          ))}
        </View>

        {/* ===== 2. 经营指标 ===== */}
        <View className='adm-metrics'>
          {metrics.map((m) => (
            <View key={m.key} className='adm-metric'>
              <Text className='adm-metric__label'>{m.label}</Text>
              <Text className={`adm-metric__value adm-metric__value--${m.tone}`}>{m.value}</Text>
            </View>
          ))}
        </View>

        {/* ===== 3. 经营趋势 · 收入 ===== */}
        <View className='adm-card'>
          <View className='adm-card__head'>
            <Text className='adm-card__title'>经营趋势 · 收入</Text>
            <Text className='adm-card__extra'>近 7 个月</Text>
          </View>
          {trend.length === 0 ? (
            <View className='adm-state'>
              <Text className='adm-state__text'>暂无趋势数据</Text>
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
                    <Text className='adm-chart__label'>{monthLabel(t.month)}</Text>
                  </View>
                )
              })}
            </View>
          )}
        </View>

        {/* ===== 4. 待办汇总 ===== */}
        <View className='adm-todos'>
          {todos.map((t) => (
            <View
              key={t.key}
              className='adm-todo'
              onClick={() =>
                t.url
                  ? go(t.url)
                  : Taro.showToast({ title: `「${t.label}」暂未开放`, icon: 'none' })
              }
            >
              <Text className='adm-todo__value'>{t.value}</Text>
              <Text className='adm-todo__label'>{t.label}</Text>
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
              <Text className='adm-quick__label'>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* ===== 6. 最近动态（来源：/dashboard/recent-payments） ===== */}
        <View className='adm-card'>
          <View className='adm-card__head'>
            <Text className='adm-card__title'>最近动态</Text>
            <Text className='adm-card__extra' onClick={() => go('/pages/admin/payments/index')}>
              全部 ›
            </Text>
          </View>
          {recent.length === 0 && (
            <View className='adm-state'>
              <Text className='adm-state__text'>{loading ? '加载中...' : '暂无动态'}</Text>
            </View>
          )}
          {recent.slice(0, 4).map((p, i) => (
            <View key={p.id || i} className='adm-activity'>
              <View className='adm-activity__dot' />
              <View className='adm-activity__body'>
                <Text className='adm-activity__title'>
                  收款{p.status === 'succeeded' ? '到账' : '单更新'} · {p.payer_name || '付款方'}
                </Text>
                <Text className='adm-activity__desc'>
                  {fmtMoney(p.amount, p.currency)} · {fmtDate(p.paid_at || p.created_at)}
                </Text>
              </View>
              <Text
                className={`badge ${p.status === 'succeeded' ? 'badge--success' : 'badge--warning'}`}
              >
                {p.status === 'succeeded' ? '已收款' : '待收款'}
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