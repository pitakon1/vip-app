import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Spin, Empty, Modal, message } from 'antd'
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
import { downloadReport, saveTextFile } from '@/lib/download'
import useAuthStore from '@/stores/auth'
import { useCachedQuery } from '@/lib/queryCache'
import { chartTheme } from '@/lib/chartTheme'
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
  status: 'paid' | 'partial' | 'unpaid' | 'refunded'
}

// 表格每页条数（/payments/me 一次取回明细，分页在前端做）
const PAGE_SIZE = 10

const fmtMoney = (v: number) => `฿ ${Math.round(Number(v || 0)).toLocaleString()}`

const monthKey = (d: string | undefined) => {
  if (!d) return ''
  return dayjs(d).format('YYYY-MM')
}

// 后端 PaymentStatus：pending/processing/succeeded/failed/refunded/disputed/expired
// 状态 -> 徽章样式（文案在组件内按语言解析为 ownerIncome.*）
const STATUS_BADGE_META: Record<string, { key: string; cls: string }> = {
  paid: { key: 'ownerIncome.stPaid', cls: 'rent-badge--success' },
  succeeded: { key: 'ownerIncome.stPaid', cls: 'rent-badge--success' },
  partial: { key: 'ownerIncome.stPartial', cls: 'rent-badge--warning' },
  pending: { key: 'ownerIncome.stPending', cls: 'rent-badge--warning' },
  processing: { key: 'ownerIncome.stProcessing', cls: 'rent-badge--info' },
  unpaid: { key: 'ownerIncome.stUnpaid', cls: 'rent-badge--error' },
  failed: { key: 'ownerIncome.stUnpaid', cls: 'rent-badge--error' },
  expired: { key: 'ownerIncome.stExpired', cls: 'rent-badge--error' },
  overdue: { key: 'ownerIncome.stExpired', cls: 'rent-badge--error' },
  refunded: { key: 'ownerIncome.stRefunded', cls: 'rent-badge--neutral' },
  disputed: { key: 'ownerIncome.stDisputed', cls: 'rent-badge--warning' },
}

// 筛选面板的状态选项（与明细行状态一致，文案在组件内解析）
const STATUS_FILTER_META: { value: IncomeRow['status'] | 'all'; key: string }[] = [
  { value: 'all', key: 'ownerIncome.optAllStatus' },
  { value: 'paid', key: 'ownerIncome.stPaid' },
  { value: 'partial', key: 'ownerIncome.stPartial' },
  { value: 'unpaid', key: 'ownerIncome.stUnpaid' },
  { value: 'refunded', key: 'ownerIncome.stRefunded' },
]

// 付款状态 -> 明细行状态
const rowStatusOf = (status: string): IncomeRow['status'] => {
  const s = String(status || '').toLowerCase()
  if (s === 'paid' || s === 'succeeded') return 'paid'
  if (s === 'pending' || s === 'processing' || s === 'partial') return 'partial'
  if (s === 'refunded') return 'refunded'
  return 'unpaid'
}

const Income = () => {
  const { t } = useTranslation()
  const [selectedMonth, setSelectedMonth] = useState<Dayjs>(dayjs())
  const [page, setPage] = useState(1)
  const [filterOpen, setFilterOpen] = useState(false)
  const [draftStatus, setDraftStatus] = useState<IncomeRow['status'] | 'all'>('all')
  const [draftProperty, setDraftProperty] = useState('all')
  const [statusFilter, setStatusFilter] = useState<IncomeRow['status'] | 'all'>('all')
  const [propertyFilter, setPropertyFilter] = useState('all')
  const [exporting, setExporting] = useState(false)

  // 状态徽章文案：按语言解析，未知状态仍回落到原始值（见下方渲染/导出）
  const statusBadgeMap = useMemo(() => {
    const map: Record<string, { label: string; cls: string }> = {}
    Object.entries(STATUS_BADGE_META).forEach(([key, meta]) => {
      map[key] = { label: t(meta.key), cls: meta.cls }
    })
    return map
  }, [t])

  const statusFilterOptions = useMemo(
    () => STATUS_FILTER_META.map((o) => ({ value: o.value, label: t(o.key) })),
    [t],
  )

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

  // 表格展示数据：按所选月份 + 状态/房产筛选（月份选择器此前只影响汇总卡片，表格不受控）
  const tableRows: IncomeRow[] = useMemo(() => {
    return payments
      .filter((p) => monthKey(p.paid_at || p.due_date) === monthStr)
      .map((p) => {
        const status = rowStatusOf(p.status)
        const received = status === 'paid' ? Number(p.amount || 0) : 0
        return {
          month: monthKey(p.paid_at || p.due_date) || monthStr,
          property: p.property_name || (p.property_id ? String(p.property_id).slice(0, 8) + '...' : '-'),
          tenant: p.tenant_name || p.tenant_id || '-',
          receivable: Number(p.amount || 0),
          received,
          status,
        }
      })
      .filter((r) => statusFilter === 'all' || r.status === statusFilter)
      .filter((r) => propertyFilter === 'all' || r.property === propertyFilter)
  }, [payments, monthStr, statusFilter, propertyFilter])

  // 筛选面板用的房产下拉（来自真实明细）
  const propertyOptions = useMemo(() => {
    const set = new Set<string>()
    payments.forEach((p) => {
      const name = p.property_name || (p.property_id ? String(p.property_id).slice(0, 8) + '...' : '-')
      if (name) set.add(name)
    })
    return Array.from(set)
  }, [payments])

  // 分页（筛选/月份变化时回到第 1 页，见各控件的 onChange）
  const pageCount = Math.max(1, Math.ceil(tableRows.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const pagedRows = tableRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  // 导出报表：年度租金流水（CSV）
  const handleExportReport = async () => {
    try {
      setExporting(true)
      const year = selectedMonth.format('YYYY')
      await downloadReport(
        '/exports/payments',
        {
          payment_type: 'rent',
          date_from: `${year}-01-01`,
          date_to: `${year}-12-31`,
        },
        `rent-income-${year}.csv`,
      )
    } catch {
      message.error(t('ownerIncome.exportFailed'))
    } finally {
      setExporting(false)
    }
  }

  // 下载账单：所选月份明细生成 CSV。
  // 不走 /exports/payments：该接口按 Payment.created_at 过滤，
  // 而账单口径是「收入归属月份」（paid_at / due_date），两者对不上。
  const handleDownloadBill = () => {
    if (!tableRows.length) {
      message.warning(t('ownerIncome.noBillRecords'))
      return
    }
    const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = [
      [
        t('ownerIncome.thMonth'),
        t('ownerIncome.thProperty'),
        t('ownerIncome.thTenant'),
        t('ownerIncome.csvReceivable'),
        t('ownerIncome.csvReceived'),
        t('ownerIncome.csvDiff'),
        t('common.status'),
      ]
        .map(escape)
        .join(','),
      ...tableRows.map((r) =>
        [
          r.month,
          r.property,
          r.tenant,
          r.receivable,
          r.received,
          r.receivable - r.received,
          statusBadgeMap[r.status]?.label || r.status,
        ]
          .map(escape)
          .join(','),
      ),
    ]
    saveTextFile(`\ufeff${lines.join('\n')}`, `rent-bill-${monthStr}.csv`)
  }

  const openFilter = () => {
    setDraftStatus(statusFilter)
    setDraftProperty(propertyFilter)
    setFilterOpen(true)
  }

  const applyFilter = () => {
    setStatusFilter(draftStatus)
    setPropertyFilter(draftProperty)
    setPage(1)
    setFilterOpen(false)
  }

  const resetFilter = () => {
    setDraftStatus('all')
    setDraftProperty('all')
    setStatusFilter('all')
    setPropertyFilter('all')
    setPage(1)
  }

  // 趋势图表数据（仅使用真实已收租金，无兜底）
  const trendData = useMemo(() => {
    const labels = Array.from({ length: 12 }, (_, i) => t('ownerIncome.monthShort', { n: i + 1 }))
    const data = monthlyTrend.map((b) => b.total)
    return {
      labels,
      datasets: [
        {
          label: t('ownerIncome.trendDataset'),
          data,
          backgroundColor: 'rgba(20, 184, 166, 0.85)',
          hoverBackgroundColor: 'rgba(20, 184, 166, 1)',
          borderRadius: 6,
          maxBarThickness: 42,
        },
      ],
    }
  }, [monthlyTrend, t])

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
        x: { grid: { display: false }, ticks: { color: chartTheme.ink3, font: { size: 12 } } },
        y: {
          beginAtZero: true,
          grid: { color: chartTheme.line },
          ticks: {
            color: chartTheme.ink3,
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
      const key = p.property_name || (p.property_id ? String(p.property_id).slice(0, 8) : t('ownerIncome.unknownProperty'))
      map.set(key, (map.get(key) || 0) + Number(p.amount || 0))
    })
    const entries = Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
    return {
      labels: entries.map((e) => e[0]),
      datasets: [
        {
          label: t('ownerIncome.propertyDataset'),
          data: entries.map((e) => e[1]),
          backgroundColor: 'rgba(20, 184, 166, 0.85)',
          hoverBackgroundColor: 'rgba(20, 184, 166, 1)',
          borderRadius: 6,
          maxBarThickness: 26,
        },
      ],
    }
  }, [payments, t])

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
          grid: { color: chartTheme.line },
          ticks: {
            color: chartTheme.ink3,
            font: { size: 12 },
            callback: (v: any) => `฿ ${Math.round(Number(v || 0) / 1000)}k`,
          },
        },
        y: { grid: { display: false }, ticks: { color: chartTheme.ink2, font: { size: 12 } } },
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
          {t('ownerIncome.loadingData')}
        </div>
      )}

      {/* Page header */}
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title">{t('ownerIncome.title')}</h2>
          <p className="rent-page-header__subtitle">{t('ownerIncome.subtitle')}</p>
        </div>
        <div className="rent-page-header__actions">
          <button
            type="button"
            className="rent-btn rent-btn--secondary"
            onClick={handleExportReport}
            disabled={exporting}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            {exporting ? t('ownerIncome.exporting') : t('ownerIncome.exportReport')}
          </button>
          <button
            type="button"
            className="rent-btn rent-btn--primary"
            onClick={handleDownloadBill}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="18" x2="12" y2="12" />
              <line x1="9" y1="15" x2="15" y2="15" />
            </svg>
            {t('ownerIncome.downloadBill')}
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="rent-grid rent-grid--4 rent-mb-5">
        <div className="rent-stat-card">
          <div className="rent-stat-card__label">{t('ownerIncome.statMonthly')}</div>
          <div className="rent-stat-card__value">{fmtMoney(monthlyIncomeVal)}</div>
          <div className="rent-stat-card__delta rent-stat-card__delta--up">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="19" x2="12" y2="5" />
              <polyline points="5 12 12 5 19 12" />
            </svg>
            <span>{t('ownerIncome.deltaVsLastMonth')}</span>
          </div>
        </div>
        <div className="rent-stat-card">
          <div className="rent-stat-card__label">{t('ownerIncome.statYearly')}</div>
          <div className="rent-stat-card__value">{fmtMoney(yearlyIncomeVal)}</div>
          <div className="rent-stat-card__delta rent-stat-card__delta--up">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="19" x2="12" y2="5" />
              <polyline points="5 12 12 5 19 12" />
            </svg>
            <span>{t('ownerIncome.deltaVsLastYear')}</span>
          </div>
        </div>
        <div className="rent-stat-card">
          <div className="rent-stat-card__label">{t('ownerIncome.statAvgRent')}</div>
          <div className="rent-stat-card__value">{fmtMoney(avgRentVal)}</div>
          <div className="rent-stat-card__delta" style={{ color: 'var(--rent-ink-3)' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            <span>{t('ownerIncome.propertiesCount', { count: propertyCount })}</span>
          </div>
        </div>
        <div className="rent-stat-card">
          <div className="rent-stat-card__label">{t('ownerIncome.statCollectionRate')}</div>
          <div className="rent-stat-card__value">{collectionRate}%</div>
          <div className="rent-stat-card__delta rent-stat-card__delta--up">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>{t('ownerIncome.targetRate')}</span>
          </div>
        </div>
      </div>

      {/* Monthly income trend chart */}
      <div className="rent-card rent-mb-5">
        <div className="rent-card__header">
          <h3 className="rent-card__title">{t('ownerIncome.monthlyTrendTitle')}</h3>
          <select
            className="rent-form-select income-year-select"
            value={selectedMonth.format('YYYY')}
            onChange={(e) => setSelectedMonth((prev) => prev.year(Number(e.target.value)))}
          >
            {[dayjs().format('YYYY'), String(Number(dayjs().format('YYYY')) - 1)].map((y) => (
              <option key={y} value={y}>{t('ownerIncome.yearLabel', { y })}</option>
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
          <h3 className="rent-card__title">{t('ownerIncome.incomeDetail')}</h3>
          <div className="rent-flex rent-gap-2">
            <select
              className="rent-form-select income-month-select"
              value={selectedMonth.format('YYYY-MM')}
              onChange={(e) => {
                if (!e.target.value) return
                setSelectedMonth(dayjs(e.target.value))
                setPage(1)
              }}
            >
              {[selectedMonth.format('YYYY-MM'), selectedMonth.subtract(1, 'month').format('YYYY-MM')].map((m) => (
                <option key={m} value={m}>{t('ownerIncome.yearMonthLabel', { y: dayjs(m).format('YYYY'), m: dayjs(m).format('M') })}</option>
              ))}
            </select>
            <button type="button" className="rent-btn rent-btn--secondary rent-btn--sm" onClick={openFilter}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
              {t('ownerIncome.filterBtn')}
            </button>
          </div>
        </div>
        <div className="rent-table-wrap income-table-wrap">
          <table className="rent-table">
            <thead>
              <tr>
                <th>{t('ownerIncome.thMonth')}</th>
                <th>{t('ownerIncome.thProperty')}</th>
                <th>{t('ownerIncome.thTenant')}</th>
                <th>{t('ownerIncome.thReceivable')}</th>
                <th>{t('ownerIncome.thReceived')}</th>
                <th>{t('ownerIncome.thDiff')}</th>
                <th>{t('ownerIncome.statCollectionRate')}</th>
                <th>{t('common.status')}</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('ownerIncome.emptyIncome')} />
                  </td>
                </tr>
              ) : (
                pagedRows.map((r, i) => {
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
            <span className="rent-text-sm rent-text-muted">
              {t('ownerIncome.recordsInfo', { total: tableRows.length, size: PAGE_SIZE })}
            </span>
            <div className="rent-pagination income-pagination">
              <button
                type="button"
                className="rent-pagination__btn"
                aria-label={t('ownerIncome.ariaPrev')}
                disabled={safePage <= 1}
                onClick={() => setPage(Math.max(1, safePage - 1))}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <span className="rent-pagination__info">
                {safePage} / {pageCount}
              </span>
              <button
                type="button"
                className="rent-pagination__btn"
                aria-label={t('ownerIncome.ariaNext')}
                disabled={safePage >= pageCount}
                onClick={() => setPage(Math.min(pageCount, safePage + 1))}
              >
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
          <h3 className="rent-card__title">{t('ownerIncome.byPropertyTitle')}</h3>
          <span className="rent-badge rent-badge--neutral">{t('ownerIncome.yearCumulative', { year: selectedMonth.format('YYYY') })}</span>
        </div>
        <div className="rent-card__body">
          <div className="income-chart-box income-chart-box--tall">
            <Bar data={propertyIncomeData} options={propertyIncomeOptions} />
          </div>
        </div>
      </div>

      {/* 筛选：状态 / 房产（月份由明细表头的选择器控制） */}
      <Modal
        open={filterOpen}
        title={t('ownerIncome.filterModalTitle')}
        okText={t('ownerIncome.apply')}
        cancelText={t('common.cancel')}
        onOk={applyFilter}
        onCancel={() => setFilterOpen(false)}
        footer={[
          <button key="reset" type="button" className="rent-btn rent-btn--ghost" onClick={resetFilter}>
            {t('ownerIncome.reset')}
          </button>,
          <button key="cancel" type="button" className="rent-btn rent-btn--secondary" onClick={() => setFilterOpen(false)}>
            {t('common.cancel')}
          </button>,
          <button key="ok" type="button" className="rent-btn rent-btn--primary" onClick={applyFilter}>
            {t('ownerIncome.apply')}
          </button>,
        ]}
      >
        <div className="rent-form-group">
          <label className="rent-form-label" htmlFor="income-filter-status">{t('ownerIncome.labelPayStatus')}</label>
          <select
            id="income-filter-status"
            className="rent-form-select"
            value={draftStatus}
            onChange={(e) => setDraftStatus(e.target.value as IncomeRow['status'] | 'all')}
          >
            {statusFilterOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="rent-form-group">
          <label className="rent-form-label" htmlFor="income-filter-property">{t('ownerIncome.thProperty')}</label>
          <select
            id="income-filter-property"
            className="rent-form-select"
            value={draftProperty}
            onChange={(e) => setDraftProperty(e.target.value)}
          >
            <option value="all">{t('ownerIncome.optAllProperties')}</option>
            {propertyOptions.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
      </Modal>
    </div>
  )
}

export default Income
