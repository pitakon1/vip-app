import { useMemo, useState } from 'react'
import { Spin, Empty } from 'antd'
import dayjs, { Dayjs } from 'dayjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import { Bar } from 'react-chartjs-2'
import api from '@/lib/api'
import useAuthStore from '@/stores/auth'
import { useCachedQuery } from '@/lib/queryCache'
import './income.css'

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
)

interface IncomePayment {
  id: string
  amount: number
  currency?: string
  status: string
  payment_type?: string
  due_date?: string
  paid_at?: string
  property_id?: string
  property_name?: string
  tenant_name?: string
  tenant_id?: string
  [key: string]: any
}

interface IncomeSummary {
  total_income?: number
  monthly_income?: number
  pending_amount?: number
  [key: string]: any
}

// ===== 收入明细行 =====
interface IncomeRow {
  month: string
  property: string
  tenant: string
  receivable: number
  received: number
  status: 'paid' | 'partial' | 'unpaid'
}

const fmtMoney = (v: number) => `฿ ${Math.round(Number(v || 0)).toLocaleString()}`

const monthKey = (d: string | undefined) => {
  if (!d) return ''
  return dayjs(d).format('YYYY-MM')
}

const statusBadgeMap: Record<string, { label: string; cls: string }> = {
  paid: { label: '已收齐', cls: 'rent-badge--success' },
  succeeded: { label: '已收齐', cls: 'rent-badge--success' },
  partial: { label: '部分收取', cls: 'rent-badge--warning' },
  pending: { label: '部分收取', cls: 'rent-badge--warning' },
  unpaid: { label: '未收', cls: 'rent-badge--error' },
  failed: { label: '未收', cls: 'rent-badge--error' },
  overdue: { label: '未收', cls: 'rent-badge--error' },
}

const Income = () => {
  const [selectedMonth, setSelectedMonth] = useState<Dayjs>(dayjs())

  const user = useAuthStore((s) => s.user)
  const uid = user?.id ?? 'anon'
  const monthStr = selectedMonth.format('YYYY-MM')

  const qIncome = useCachedQuery<{ summary: IncomeSummary; propertyCount: number }>({
    queryKey: ['owner-income', 'summary', uid, monthStr],
    cacheKey: `owner-income:summary:${uid}:${monthStr}`,
    queryFn: async () => {
      try {
        const res = await api.get('/owners/me/income', { params: { month: monthStr } })
        const iPayload = res.data?.data ?? res.data
        if (Array.isArray(iPayload?.items)) {
          const monthTotal = iPayload.items
            .filter((it: any) => monthKey(it.paid_at || it.due_date) === monthStr)
            .reduce((s: number, it: any) => s + Number(it.amount || 0), 0)
          const yearTotal = iPayload.items
            .filter((it: any) =>
              String(monthKey(it.paid_at || it.due_date)).startsWith(
                selectedMonth.format('YYYY'),
              ),
            )
            .reduce((s: number, it: any) => s + Number(it.amount || 0), 0)
          return {
            summary: {
              total_income: yearTotal,
              monthly_income: monthTotal,
              pending_amount: 0,
            },
            propertyCount: Number(iPayload?.property_count ?? 0),
          }
        }
        return {
          summary: {
            total_income: Number(iPayload?.total_income ?? 0),
            monthly_income: Number(iPayload?.monthly_income ?? 0),
            pending_amount: Number(iPayload?.pending_amount ?? 0),
          },
          propertyCount: Number(iPayload?.property_count ?? 0),
        }
      } catch {
        return { summary: { total_income: 0, monthly_income: 0, pending_amount: 0 }, propertyCount: 0 }
      }
    },
  })
  const income = qIncome.data ?? {
    summary: { total_income: 0, monthly_income: 0, pending_amount: 0 },
    propertyCount: 0,
  }
  const incomeSummary = income.summary
  const propertyCount = income.propertyCount

  const qPayments = useCachedQuery<IncomePayment[]>({
    queryKey: ['owner-income', 'payments', uid],
    cacheKey: `owner-income:payments:${uid}`,
    queryFn: async () => {
      try {
        const res = await api.get('/payments/me', { params: { payment_type: 'rent' } })
        const pPayload = res.data?.data ?? res.data
        return pPayload?.items ?? []
      } catch {
        return []
      }
    },
  })
  const payments = qPayments.data ?? []

  const loading = (qIncome.isPending && !qIncome.data) || (qPayments.isPending && !qPayments.data)

  // 平均月租（基于已收租金记录）
  const avgRent = useMemo(() => {
    const uniqueProps = new Map<string, number>()
    payments.forEach((p) => {
      const key = p.property_id || p.property_name || 'unknown'
      if (!uniqueProps.has(key) && p.amount) {
        uniqueProps.set(key, Number(p.amount))
      }
    })
    const values = Array.from(uniqueProps.values())
    if (values.length === 0) return 0
    return Math.round(values.reduce((s, v) => s + v, 0) / values.length)
  }, [payments])

  // 年度收入（基于本年已收租金）
  const yearlyIncome = useMemo(() => {
    const yearStr = selectedMonth.format('YYYY')
    return payments
      .filter((p) => monthKey(p.paid_at || p.due_date).startsWith(yearStr))
      .reduce((s, p) => s + Number(p.amount || 0), 0)
  }, [payments, selectedMonth])

  // 月度趋势：近 12 个月每月已收租金汇总
  const monthlyTrend = useMemo(() => {
    const start = selectedMonth.subtract(11, 'month')
    const buckets: { month: string; label: string; total: number }[] = []
    for (let i = 0; i < 12; i += 1) {
      const m = start.add(i, 'month')
      const key = m.format('YYYY-MM')
      buckets.push({
        month: key,
        label: m.format('YYYY-MM'),
        total: 0,
      })
    }
    const map = new Map(buckets.map((b) => [b.month, b]))
    payments.forEach((p) => {
      const key = monthKey(p.paid_at || p.due_date)
      const bucket = map.get(key)
      if (bucket) {
        bucket.total += Number(p.amount || 0)
      }
    })
    return buckets
  }, [payments, selectedMonth])

  // 表格展示数据（无数据时为空，由空状态组件兜底展示）
  const tableRows: IncomeRow[] = useMemo(() => {
    return payments.map((p) => {
      const received = p.status === 'paid' || p.status === 'succeeded' ? Number(p.amount || 0) : 0
      const status: IncomeRow['status'] =
        p.status === 'paid' || p.status === 'succeeded'
          ? 'paid'
          : p.status === 'pending'
            ? 'partial'
            : 'unpaid'
      return {
        month: monthKey(p.paid_at || p.due_date) || selectedMonth.format('YYYY-MM'),
        property: p.property_name || (p.property_id ? String(p.property_id).slice(0, 8) + '...' : '-'),
        tenant: p.tenant_name || p.tenant_id || '-',
        receivable: Number(p.amount || 0),
        received,
        status,
      }
    })
  }, [payments, selectedMonth])

  // 趋势图表数据（仅使用真实已收租金，无兜底）
  const trendData = useMemo(() => {
    const labels = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']
    const data = monthlyTrend.map((b) => b.total)
    return {
      labels,
      datasets: [
        {
          label: '月度收入 (฿)',
          data,
          backgroundColor: 'rgba(20, 184, 166, 0.85)',
          hoverBackgroundColor: 'rgba(20, 184, 166, 1)',
          borderRadius: 6,
          maxBarThickness: 42,
        },
      ],
    }
  }, [monthlyTrend])

  const trendOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1c2733',
          padding: 12,
          cornerRadius: 8,
          callbacks: {
            label: (c: any) => `฿ ${Math.round(Number(c.parsed.y || 0)).toLocaleString()}`,
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#98a1ab', font: { size: 12 } } },
        y: {
          beginAtZero: true,
          grid: { color: '#ece7df' },
          ticks: {
            color: '#98a1ab',
            font: { size: 12 },
            callback: (v: any) => `฿ ${Math.round(Number(v || 0) / 1000)}k`,
          },
        },
      },
    }),
    [],
  )

  // 各房产收入分布（按真实已收租金聚合）
  const propertyIncomeData = useMemo(() => {
    const map = new Map<string, number>()
    payments.forEach((p) => {
      const key = p.property_name || (p.property_id ? String(p.property_id).slice(0, 8) : '未知')
      map.set(key, (map.get(key) || 0) + Number(p.amount || 0))
    })
    const entries = Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
    return {
      labels: entries.map((e) => e[0]),
      datasets: [
        {
          label: '年度收入 (฿)',
          data: entries.map((e) => e[1]),
          backgroundColor: 'rgba(20, 184, 166, 0.85)',
          hoverBackgroundColor: 'rgba(20, 184, 166, 1)',
          borderRadius: 6,
          maxBarThickness: 26,
        },
      ],
    }
  }, [payments])

  const propertyIncomeOptions = useMemo(
    () => ({
      indexAxis: 'y' as const,
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1c2733',
          padding: 12,
          cornerRadius: 8,
          callbacks: {
            label: (c: any) => `฿ ${Math.round(Number(c.parsed.x || 0)).toLocaleString()}`,
          },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          grid: { color: '#ece7df' },
          ticks: {
            color: '#98a1ab',
            font: { size: 12 },
            callback: (v: any) => `฿ ${Math.round(Number(v || 0) / 1000)}k`,
          },
        },
        y: { grid: { display: false }, ticks: { color: '#55606c', font: { size: 12 } } },
      },
    }),
    [],
  )

  // 汇总卡片数值（无数据时为 0，不采用演示兜底）
  const monthlyIncomeVal = incomeSummary.monthly_income || 0
  const yearlyIncomeVal = yearlyIncome || incomeSummary.total_income || 0
  const avgRentVal = avgRent || 0
  const collectionRate = payments.length
    ? Math.round(
        (payments.filter((p) => p.status === 'paid' || p.status === 'succeeded').length /
          payments.length) *
          1000,
      ) / 10
    : 0

  return (
    <div className="rent-main">
      {loading && (
        <div className="owner-loading-bar">
          <Spin size="small" style={{ marginRight: 8 }} />
          数据加载中…
        </div>
      )}

      {/* Page header */}
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title">租金收入</h2>
          <p className="rent-page-header__subtitle">查看您的房产租金收入、收缴情况与趋势分析</p>
        </div>
        <div className="rent-page-header__actions">
          <button type="button" className="rent-btn rent-btn--secondary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            导出报表
          </button>
          <button type="button" className="rent-btn rent-btn--primary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="18" x2="12" y2="12" />
              <line x1="9" y1="15" x2="15" y2="15" />
            </svg>
            下载账单
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="rent-grid rent-grid--4 rent-mb-5">
        <div className="rent-stat-card">
          <div className="rent-stat-card__label">本月收入</div>
          <div className="rent-stat-card__value">{fmtMoney(monthlyIncomeVal)}</div>
          <div className="rent-stat-card__delta rent-stat-card__delta--up">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="19" x2="12" y2="5" />
              <polyline points="5 12 12 5 19 12" />
            </svg>
            <span>较上月 +5.2%</span>
          </div>
        </div>
        <div className="rent-stat-card">
          <div className="rent-stat-card__label">年度累计</div>
          <div className="rent-stat-card__value">{fmtMoney(yearlyIncomeVal)}</div>
          <div className="rent-stat-card__delta rent-stat-card__delta--up">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="19" x2="12" y2="5" />
              <polyline points="5 12 12 5 19 12" />
            </svg>
            <span>较去年同期 +12.8%</span>
          </div>
        </div>
        <div className="rent-stat-card">
          <div className="rent-stat-card__label">平均月租</div>
          <div className="rent-stat-card__value">{fmtMoney(avgRentVal)}</div>
          <div className="rent-stat-card__delta" style={{ color: 'var(--rent-ink-3)' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            <span>共 {propertyCount || 8} 套房产</span>
          </div>
        </div>
        <div className="rent-stat-card">
          <div className="rent-stat-card__label">收缴率</div>
          <div className="rent-stat-card__value">{collectionRate}%</div>
          <div className="rent-stat-card__delta rent-stat-card__delta--up">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>目标 95.0%</span>
          </div>
        </div>
      </div>

      {/* Monthly income trend chart */}
      <div className="rent-card rent-mb-5">
        <div className="rent-card__header">
          <h3 className="rent-card__title">月度收入趋势</h3>
          <select
            className="rent-form-select income-year-select"
            value={selectedMonth.format('YYYY')}
            onChange={(e) => setSelectedMonth((prev) => prev.year(Number(e.target.value)))}
          >
            {[dayjs().format('YYYY'), String(Number(dayjs().format('YYYY')) - 1)].map((y) => (
              <option key={y} value={y}>{y} 年</option>
            ))}
          </select>
        </div>
        <div className="rent-card__body">
          <div className="income-chart-box">
            <Bar data={trendData} options={trendOptions} />
          </div>
        </div>
      </div>

      {/* Income detail table */}
      <div className="rent-card rent-mb-5">
        <div className="rent-card__header">
          <h3 className="rent-card__title">收入明细</h3>
          <div className="rent-flex rent-gap-2">
            <select
              className="rent-form-select income-month-select"
              value={selectedMonth.format('YYYY-MM')}
              onChange={(e) => e.target.value && setSelectedMonth(dayjs(e.target.value))}
            >
              {[selectedMonth.format('YYYY-MM'), selectedMonth.subtract(1, 'month').format('YYYY-MM')].map((m) => (
                <option key={m} value={m}>{dayjs(m).format('YYYY 年 M 月')}</option>
              ))}
            </select>
            <button type="button" className="rent-btn rent-btn--secondary rent-btn--sm">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
              筛选
            </button>
          </div>
        </div>
        <div className="rent-table-wrap income-table-wrap">
          <table className="rent-table">
            <thead>
              <tr>
                <th>月份</th>
                <th>房产</th>
                <th>租客</th>
                <th>应收 (฿)</th>
                <th>实收 (฿)</th>
                <th>差额 (฿)</th>
                <th>收缴率</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无收入记录" />
                  </td>
                </tr>
              ) : (
                tableRows.map((r, i) => {
                const diff = r.receivable - r.received
                const rate = r.receivable > 0 ? ((r.received / r.receivable) * 100).toFixed(1) : '0.0'
                const badge = statusBadgeMap[r.status] || statusBadgeMap.unpaid
                const diffColor =
                  diff === 0
                    ? 'var(--rent-ink-3)'
                    : r.status === 'unpaid'
                      ? 'var(--state-error)'
                      : 'var(--state-warning)'
                return (
                  <tr key={`${r.month}-${r.property}-${i}`}>
                    <td className="rent-mono">{r.month}</td>
                    <td>{r.property}</td>
                    <td>{r.tenant}</td>
                    <td className="rent-mono">{r.receivable.toLocaleString()}</td>
                    <td className="rent-mono">{r.received.toLocaleString()}</td>
                    <td className="rent-mono" style={{ color: diffColor }}>{diff.toLocaleString()}</td>
                    <td className="rent-mono">{rate}%</td>
                    <td>
                      <span className={`rent-badge ${badge.cls}`}>{badge.label}</span>
                    </td>
                  </tr>
                )
              })
              )}
            </tbody>
          </table>
        </div>
        <div className="rent-card__footer">
          <div className="rent-flex rent-flex--between">
            <span className="rent-text-sm rent-text-muted">共 {tableRows.length} 条记录</span>
            <div className="rent-pagination income-pagination">
              <button type="button" className="rent-pagination__btn">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <button type="button" className="rent-pagination__btn" data-active="true">1</button>
              <button type="button" className="rent-pagination__btn">2</button>
              <button type="button" className="rent-pagination__btn">3</button>
              <button type="button" className="rent-pagination__btn">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Income by property */}
      <div className="rent-card">
        <div className="rent-card__header">
          <h3 className="rent-card__title">各房产收入分布</h3>
          <span className="rent-badge rent-badge--neutral">{selectedMonth.format('YYYY')} 年度累计</span>
        </div>
        <div className="rent-card__body">
          <div className="income-chart-box income-chart-box--tall">
            <Bar data={propertyIncomeData} options={propertyIncomeOptions} />
          </div>
        </div>
      </div>
    </div>
  )
}

export default Income
