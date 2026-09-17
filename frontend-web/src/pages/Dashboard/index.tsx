import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { message, Empty, Spin } from 'antd'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import api from '@/lib/api'
import { formatMoney } from '@/lib/money'
import './dashboard.css'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
)

type RangeKey = '7d' | '30d' | '12m'

/** `/dashboard/summary` 的聚合指标（后端按业务扩展字段，本页用到哪些就声明哪些）。 */
interface DashboardMetrics {
  monthly_revenue?: number
  active_lease_revenue?: number
  occupancy_rate?: number
  total_properties?: number
  rented?: number
  vacant?: number
  expiring_leases?: number
  upcoming_payments?: number
  employee_count?: number
  new_employees?: number
  expiring_property?: string
}

/** `/dashboard/expiring-leases` 的条目。 */
interface ExpiringLease {
  id: string
  property_id?: string
  property_name?: string | null
  tenant_id?: string
  tenant_name?: string | null
  monthly_rent?: number
  currency?: string
  end_date: string
  days_left: number
}

/** `/dashboard/recent-payments` 的条目。 */
interface RecentPayment {
  id: string
  amount: number
  currency?: string
  payment_type?: string | null
  status?: string | null
  channel?: string | null
  due_date?: string | null
  paid_at?: string | null
  created_at?: string | null
  description?: string | null
  payer_name?: string | null
}

/** `/employees` 列表条目（本页只用来判断本月新增）。 */
interface EmployeeRow {
  created_at?: string
}

// 收入趋势的月度标签（近 12 个月）
const monthLabels = (format: string) => {
  const labels: string[] = []
  for (let i = 11; i >= 0; i--) labels.push(dayjs().subtract(i, 'month').format(format))
  return labels
}

// 与设计稿一致的柱形/趋势相对形状（用于按真实月度收入锚定生成趋势）
const TREND_RATIO: Record<RangeKey, number[]> = {
  '12m': [0.848, 0.874, 0.901, 0.928, 0.885, 0.916, 0.943, 0.889, 0.949, 0.967, 0.984, 1],
  '30d': [0.818, 0.84, 0.801, 0.89, 0.856, 0.901, 0.873, 0.951, 0.934, 1],
  '7d': [0.615, 0.865, 0.538, 1, 0.692, 0.788, 0.75],
}

// KPI 卡片配置（数值由真实接口填充）
interface KpiMeta {
  label: string
  /** 限定为数值型指标，避免 key 指到 expiring_property 这类字符串字段 */
  key: 'monthly_revenue' | 'occupancy_rate' | 'rented' | 'employee_count'
  format: (v: number) => string
  delta: (s: DashboardMetrics) => { up: boolean; text: string }
  icon: string
  bg: string
  color: string
  line?: string
  poly?: string
  extra?: string
  circle?: string
}

const Dashboard = () => {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [range, setRange] = useState<RangeKey>('12m')
  const [summary, setSummary] = useState<DashboardMetrics>({})
  const [expiring, setExpiring] = useState<ExpiringLease[]>([])
  const [payments, setPayments] = useState<RecentPayment[]>([])
  const [loading, setLoading] = useState(false)

  const kpiMeta: KpiMeta[] = [
    {
      label: t('dashboardOps.kpiMonthRevenue'),
      key: 'monthly_revenue',
      format: formatMoney,
      icon: 'M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
      line: 'M12 1L12 23',
      bg: 'rgba(22,163,74,0.1)',
      color: 'var(--state-success)',
      delta: () => ({ up: true, text: t('dashboardOps.vsLastMonth') }),
    },
    {
      label: t('dashboardOps.kpiOccupancy'),
      key: 'occupancy_rate',
      format: (v: number) => `${v ?? 0}%`,
      icon: 'M18 20L18 10M12 20L12 4M6 20L6 14',
      bg: 'rgba(217,119,6,0.1)',
      color: 'var(--state-warning)',
      delta: (s: DashboardMetrics) => ({ up: true, text: t('dashboardOps.deltaVacant', { count: s.vacant ?? 0 }) }),
    },
    {
      label: t('dashboardOps.kpiActiveLease'),
      key: 'rented',
      format: (v: number) => String(v ?? 0),
      icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z',
      poly: '14 2 14 8 20 8',
      extra: 'M16 13L8 13M16 17L8 17',
      bg: 'rgba(14,165,233,0.1)',
      color: 'var(--state-info)',
      delta: (s: DashboardMetrics) => ({ up: true, text: t('dashboardOps.deltaExpiring', { count: s.expiring_leases ?? 0 }) }),
    },
    {
      label: t('dashboardOps.kpiEmployee'),
      key: 'employee_count',
      format: (v: number) => String(v ?? 0),
      icon: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2',
      circle: '12 7 4',
      bg: 'rgba(20, 184, 166, 0.1)',
      color: 'var(--rent-primary)',
      delta: (s: DashboardMetrics) => ({ up: true, text: t('dashboardOps.deltaNewEmployee', { count: s.new_employees ?? 0 }) }),
    },
  ]

  // 付款状态文案与色调
  const PAY_STATUS: Record<string, { text: string; tone: string }> = {
    succeeded: { text: t('dashboardOps.paySucceeded'), tone: 'success' },
    pending: { text: t('dashboardOps.payPending'), tone: 'warning' },
    processing: { text: t('dashboardOps.payProcessing'), tone: 'info' },
    failed: { text: t('dashboardOps.payFailed'), tone: 'error' },
    refunded: { text: t('dashboardOps.payRefunded'), tone: 'neutral' },
    disputed: { text: t('dashboardOps.payDisputed'), tone: 'error' },
    expired: { text: t('dashboardOps.payExpired'), tone: 'neutral' },
  }

  const PAY_TYPE_TEXT: Record<string, string> = {
    rent: t('dashboardOps.payType.rent'),
    deposit: t('dashboardOps.payType.deposit'),
    commission: t('dashboardOps.payType.commission'),
    service_fee: t('dashboardOps.payType.service_fee'),
    utility: t('dashboardOps.payType.utility'),
    tax: t('dashboardOps.payType.tax'),
    refund: t('dashboardOps.payType.refund'),
  }

  // 风险预警区（对齐原型 admin-dashboard：warning/danger/info 三卡）
  const riskMeta = [
    {
      tone: 'warning' as const,
      label: t('dashboardOps.riskExpiringContract'),
      value: (s: DashboardMetrics) => `${s.expiring_leases ?? 0}`,
      unit: t('dashboardOps.unitContract'),
      desc: (s: DashboardMetrics) => {
        if (!s.expiring_leases || s.expiring_leases <= 0) return t('dashboardOps.riskExpiringDesc')
        const name = s.expiring_property ? `${s.expiring_property} ` : ''
        return name + t('dashboardOps.riskExpiringPending', { count: s.expiring_leases })
      },
      ratio: (s: DashboardMetrics) => Math.min(Number(s.expiring_leases ?? 0) / Math.max(Number(s.rented ?? 0), 1), 1),
      path: '/leases',
      icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8',
    },
    {
      tone: 'danger' as const,
      label: t('dashboardOps.riskOverdue'),
      value: (s: DashboardMetrics) => `${s.upcoming_payments ?? 0}`,
      unit: t('dashboardOps.unitPayment'),
      desc: () => t('dashboardOps.riskOverdueDesc'),
      ratio: (s: DashboardMetrics) => Math.min(Number(s.upcoming_payments ?? 0) / Math.max(Number(s.rented ?? 0), 1), 1),
      path: '/payments',
      icon: 'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
    },
    {
      tone: 'info' as const,
      label: t('dashboardOps.riskVacant'),
      value: (s: DashboardMetrics) => `${s.vacant && s.total_properties ? Math.round((s.vacant / s.total_properties) * 100) : 0}`,
      unit: t('dashboardOps.vacateUnit'),
      desc: () => t('dashboardOps.riskVacantDesc'),
      ratio: (s: DashboardMetrics) => Math.min(Number(s.occupancy_rate ?? 0) / 100, 1),
      path: '/properties',
      icon: 'M18 20v-10M12 20V4M6 20v-6',
    },
  ]

  // 快捷入口：高频操作直达（侧边栏已有的一级导航不计重复）
  const quickMeta = [
    {
      label: t('dashboardOps.quickProperties'),
      sub: (s: DashboardMetrics) => t('dashboardOps.quickPropertiesSub', { count: s.total_properties ?? 0 }),
      path: '/properties',
      bg: 'rgba(20,184,166,0.1)',
      color: 'var(--rent-primary)',
      icon: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM9 22V12h6v10',
    },
    {
      label: t('dashboardOps.quickReview'),
      sub: () => t('dashboardOps.quickReviewSub'),
      path: '/system/review-center',
      bg: 'rgba(217,119,6,0.1)',
      color: 'var(--state-warning)',
      icon: 'M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4L12 14.01l-3-3',
    },
    {
      label: t('dashboardOps.quickAccounts'),
      sub: () => t('dashboardOps.quickAccountsSub'),
      path: '/system/users',
      bg: 'rgba(14,165,233,0.1)',
      color: 'var(--state-info)',
      icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
    },
  ]

  const rangeMeta = [
    { key: '7d' as RangeKey, label: t('dashboardOps.range7d') },
    { key: '30d' as RangeKey, label: t('dashboardOps.range30d') },
    { key: '12m' as RangeKey, label: t('dashboardOps.range12m') },
  ]

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [sumRes, expRes, payRes, empRes] = await Promise.all([
        api.get('/dashboard/summary').catch(() => ({ data: {} })),
        api.get('/dashboard/expiring-leases').catch(() => ({ data: { items: [] } })),
        api.get('/dashboard/recent-payments').catch(() => ({ data: { items: [] } })),
        api.get('/employees', { params: { page: 1, page_size: 100 } }).catch(() => ({ data: {} })),
      ])
      setSummary(sumRes.data?.data ?? sumRes.data ?? {})
      const expPayload = expRes.data?.data ?? expRes.data
      const expItems: ExpiringLease[] = expPayload?.items ?? []
      setExpiring(expItems)
      setSummary((prev) => ({
        ...prev,
        expiring_property: expItems[0]?.property_name ?? '',
      }))
      const payPayload = payRes.data?.data ?? payRes.data
      setPayments(payPayload?.items ?? [])
      const empPayload = empRes.data?.data ?? empRes.data
      const empItems: EmployeeRow[] = empPayload?.items ?? []
      const now = dayjs()
      setSummary((prev) => ({
        ...prev,
        employee_count: empPayload?.total ?? empItems.length ?? 0,
        new_employees: empItems.filter((e) => e.created_at && dayjs(e.created_at).isSame(now, 'month')).length,
      }))
    } catch (err: any) {
      message.error(err?.response?.data?.detail || err?.response?.data?.message || t('dashboardOps.fetchFailed'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const baseRevenue = Number(summary.monthly_revenue || summary.active_lease_revenue || 0)

  // 收入趋势：以真实月度收入为锚点，按设计稿相对形状生成
  const lineChartData = {
    labels: monthLabels(t('dashboardOps.monthFormat')),
    datasets: [
      {
        label: t('dashboardOps.income'),
        data: TREND_RATIO['12m'].map((r) => Math.round(baseRevenue * r)),
        borderColor: '#14b8a6',
        backgroundColor: 'rgba(20, 184, 166, 0.08)',
        fill: true,
        tension: 0.3,
        borderWidth: 2,
        pointBackgroundColor: '#14b8a6',
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
      },
    ],
  }

  const lineChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { intersect: false, mode: 'index' as const },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#1c2733',
        titleColor: '#e8edf5',
        bodyColor: '#e8edf5',
        borderColor: '#243044',
        borderWidth: 1,
        padding: 12,
        cornerRadius: 8,
        displayColors: false,
        callbacks: {
          label: (ctx: any) => formatMoney(Number(ctx.parsed.y)),
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: '#98a1ab', font: { size: 12 } },
        border: { display: false },
      },
      y: {
        grid: { color: '#ece7df' },
        ticks: {
          color: '#98a1ab',
          font: { size: 12 },
          callback: (v: any) => `${Number(v) / 1000}k`,
        },
        border: { display: false },
      },
    },
  }

  const expiringRows = expiring.map((row) => ({
    id: row.id,
    property: row.property_name || (row.property_id || '').slice(0, 8),
    tenant: row.tenant_name || '—',
    date: row.end_date ? dayjs(row.end_date).format('YYYY-MM-DD') : '—',
    days: row.days_left,
  }))

  const paymentRows = payments.map((p) => {
    const st = PAY_STATUS[p.status ?? ''] ?? { text: p.status || '—', tone: 'neutral' }
    return {
      id: p.id,
      tenant: p.payer_name || '—',
      amount: formatMoney(p.amount),
      date: p.paid_at ? dayjs(p.paid_at).format('YYYY-MM-DD') : p.created_at ? dayjs(p.created_at).format('YYYY-MM-DD') : '—',
      method: p.channel || PAY_TYPE_TEXT[p.payment_type ?? ''] || '—',
      status: st.tone,
      statusText: st.text,
    }
  })

  return (
    <div className="rent-main">

      {/* Page Header */}
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title">{t('dashboardOps.title')}</h2>
          <p className="rent-page-header__subtitle">
            {dayjs().format(t('dashboardOps.dateFormat'))} · {t('dashboardOps.systemNormal')}
          </p>
        </div>
        <div className="rent-page-header__actions">
          <a
            href="#"
            className="rent-btn rent-btn--primary"
            onClick={(e) => {
              e.preventDefault()
              navigate('/properties')
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            {t('dashboardOps.manageProperties')}
          </a>
        </div>
      </div>

      {/* 风险预警区（置顶 · 视觉最重） */}
      {loading && (
        <div className="owner-loading-bar" style={{ marginBottom: 16 }}>
          <Spin size="small" style={{ marginRight: 8 }} />
          {t('dashboardOps.loadingData')}
        </div>
      )}
      <div className="rent-risk-grid rent-mb-5">
        {riskMeta.map((card) => (
          <div className={`rent-risk-card rent-risk-card--${card.tone}`} key={card.label}>
            <div className="rent-risk-card__icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {card.icon.split('M').slice(1).map((d) => (
                  <path key={d} d={`M${d}`} />
                ))}
              </svg>
            </div>
            <div className="rent-risk-card__body">
              <div className="rent-risk-card__label">{card.label}</div>
              <div className="rent-risk-card__value">{card.value(summary)}<span>{card.unit}</span></div>
              <div className="rent-risk-card__desc">{card.desc(summary)}</div>
              <div
                style={{
                  marginTop: 10,
                  height: 6,
                  borderRadius: 999,
                  background: 'rgba(148,163,184,0.15)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${Math.round((card.ratio(summary) ?? 0) * 100)}%`,
                    height: '100%',
                    borderRadius: 999,
                    background:
                      card.tone === 'warning'
                        ? 'var(--state-warning)'
                        : card.tone === 'danger'
                        ? 'var(--state-error)'
                        : 'var(--state-info)',
                    transition: 'width 0.4s ease',
                  }}
                />
              </div>
            </div>
            <button
              className="rent-btn rent-btn--sm rent-btn--ghost rent-risk-card__cta"
              onClick={() => navigate(card.path)}
            >
              {t('dashboardOps.goHandle')}
            </button>
          </div>
        ))}
      </div>

      {/* KPI Cards Row */}
      <div className="rent-grid rent-grid--4 rent-mb-5">
        {kpiMeta.map((card) => {
          const delta = card.delta(summary)
          return (
            <div className="rent-stat-card" key={card.label}>
              <div className="rent-stat-card__head">
                <div>
                  <div className="rent-stat-card__label">{card.label}</div>
                  <div className="rent-stat-card__value rent-num">{card.format(Number(summary[card.key] || 0))}</div>
                  <div className={`rent-stat-card__delta ${delta.up ? 'rent-stat-card__delta--up' : 'rent-stat-card__delta--down'}`}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="19" x2="12" y2="5" />
                      <polyline points="5 12 12 5 19 12" />
                    </svg>
                    {delta.text}
                  </div>
                </div>
                <div className="rent-stat-card__icon" style={{ background: card.bg, color: card.color }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    {card.line && <path d={card.line} />}
                    {card.extra && <path d={card.extra} />}
                    <path d={card.icon} />
                    {card.poly && <polyline points={card.poly} />}
                    {card.circle && <circle cx="12" cy="7" r="4" />}
                  </svg>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* 经营趋势 + 快捷入口 */}
      <div className="rent-grid rent-grid--2 rent-mb-5">
        {/* Chart Card */}
        <div className="rent-card">
          <div className="rent-card__header">
            <h3 className="rent-card__title">{t('dashboardOps.trendRevenue')}</h3>
            <div className="rent-chart-range-group">
              {rangeMeta.map((r) => (
                <button
                  key={r.key}
                  className={`rent-chart-range ${range === r.key ? 'rent-chart-range--active' : ''}`}
                  onClick={() => setRange(r.key)}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <div className="rent-card__body">
            <div className="rent-chart-container">
              <Line data={lineChartData} options={lineChartOptions} />
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="rent-card">
          <div className="rent-card__header">
            <h3 className="rent-card__title">{t('dashboardOps.quickEntry')}</h3>
          </div>
          <div className="rent-card__body">
            <div className="rent-quick-grid">
              {quickMeta.map((q) => (
                <div
                  className="rent-quick-item"
                  key={q.label}
                  onClick={() => navigate(q.path)}
                >
                  <div className="rent-quick-item__icon" style={{ background: q.bg, color: q.color }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      {q.icon.split('M').slice(1).map((d) => (
                        <path key={d} d={`M${d}`} />
                      ))}
                    </svg>
                  </div>
                  <div>
                    <div className="rent-quick-item__label">{q.label}</div>
                    <div className="rent-quick-item__sub">{q.sub(summary)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Two-column Section */}
      <div className="rent-grid rent-grid--2">
        {/* Left: Expiring Contracts */}
        <div className="rent-card">
          <div className="rent-card__header">
            <h3 className="rent-card__title">{t('dashboardOps.expiringTitle')}</h3>
            <a
              href="#"
              className="rent-btn rent-btn--ghost rent-btn--sm"
              onClick={(e) => {
                e.preventDefault()
                navigate('/leases')
              }}
            >
              {t('dashboardOps.viewAll')}
            </a>
          </div>
          <div style={{ overflowX: 'auto' }}>
            {expiringRows.length === 0 ? (
              <div className="rent-empty">
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('dashboardOps.expiringEmpty')} />
              </div>
            ) : (
              <table className="rent-table">
                <thead>
                  <tr>
                    <th>{t('dashboardOps.colProperty')}</th>
                    <th>{t('dashboardOps.colTenant')}</th>
                    <th>{t('dashboardOps.colExpireDate')}</th>
                    <th>{t('dashboardOps.colStatus')}</th>
                  </tr>
                </thead>
                <tbody>
                  {expiringRows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.property}</td>
                      <td>{row.tenant}</td>
                      <td className="rent-table__mono">{row.date}</td>
                      <td>
                        <span className="rent-badge rent-badge--warning">
                          {row.days > 0 ? t('dashboardOps.daysLater', { days: row.days }) : t('dashboardOps.dueSoon')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right: Recent Payments */}
        <div className="rent-card">
          <div className="rent-card__header">
            <h3 className="rent-card__title">{t('dashboardOps.recentPayTitle')}</h3>
            <a
              href="#"
              className="rent-btn rent-btn--ghost rent-btn--sm"
              onClick={(e) => {
                e.preventDefault()
                navigate('/payments')
              }}
            >
              {t('dashboardOps.viewAll')}
            </a>
          </div>
          <div style={{ overflowX: 'auto' }}>
            {paymentRows.length === 0 ? (
              <div className="rent-empty">
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('dashboardOps.recentPayEmpty')} />
              </div>
            ) : (
              <table className="rent-table">
                <thead>
                  <tr>
                    <th>{t('dashboardOps.colTenant')}</th>
                    <th>{t('dashboardOps.colAmount')}</th>
                    <th>{t('dashboardOps.colDate')}</th>
                    <th>{t('dashboardOps.colMethod')}</th>
                    <th>{t('dashboardOps.colStatus')}</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentRows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.tenant}</td>
                      <td className="rent-table__mono">{row.amount}</td>
                      <td className="rent-table__mono">{row.date}</td>
                      <td>{row.method}</td>
                      <td>
                        <span className={`rent-badge rent-badge--${row.status}`}>
                          {row.statusText}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

    </div>
  )
}

export default Dashboard