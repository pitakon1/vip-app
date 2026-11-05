import { LIST_PAGE_SIZE } from '@/lib/pagination'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal, message } from 'antd'
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
import DataState from '@/components/DataState'
import { downloadReport, saveTextFile } from '@/lib/download'
import { formatMoney } from '@/lib/money'
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

// 业主收入的唯一账单模型：GET /owners/me/income 的 records。
// 汇总、趋势、明细表全部从这一份数据派生，不再同时读 /payments/me。
interface IncomeRecord {
  id: string
  property_id?: string
  property?: string
  month: string
  amount: number
  currency?: string
  payment_type?: string
  status: string
}

interface IncomePayload {
  total_income?: number
  receivable_total?: number
  overdue_total?: number
  currency?: string
  property_count?: number
  rented_count?: number
  vacant_count?: number
  records?: IncomeRecord[]
  by_property?: { property_id: string; income: number; receivable: number; monthly_rent: number }[]
}

// ===== 收入明细行（只保留账单本身的 4 个字段，不再有 5 个同义金额列） =====
interface IncomeRow {
  month: string
  property: string
  amount: number
  currency: string
  status: 'paid' | 'partial' | 'unpaid'
}

// 表格每页条数（接口一次返回全部逐笔记录，分页在前端做）
const PAGE_SIZE = LIST_PAGE_SIZE

// 后端 record.status：received / pending / overdue
const STATUS_BADGE_META: Record<string, { key: string; cls: string }> = {
  paid: { key: 'ownerIncome.stPaid', cls: 'rent-badge--success' },
  partial: { key: 'ownerIncome.stPending', cls: 'rent-badge--warning' },
  unpaid: { key: 'ownerIncome.stExpired', cls: 'rent-badge--error' },
}

// 筛选面板的状态选项（与明细行状态一致，文案在组件内解析）
const STATUS_FILTER_META: { value: IncomeRow['status'] | 'all'; key: string }[] = [
  { value: 'all', key: 'ownerIncome.optAllStatus' },
  { value: 'paid', key: 'ownerIncome.stPaid' },
  { value: 'partial', key: 'ownerIncome.stPending' },
  { value: 'unpaid', key: 'ownerIncome.stExpired' },
]

// 后端账单状态 -> 明细行状态
const rowStatusOf = (status: string): IncomeRow['status'] => {
  const s = String(status || '').toLowerCase()
  if (s === 'received') return 'paid'
  if (s === 'overdue') return 'unpaid'
  return 'partial'
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

  const qIncome = useCachedQuery<IncomePayload>({
    queryKey: ['owner-income', 'summary', uid, monthStr],
    cacheKey: `owner-income:summary:${uid}:${monthStr}`,
    queryFn: async () => {
      const res = await api.get('/owners/me/income', { params: { month: monthStr } })
      return (res.data?.data ?? res.data) as IncomePayload
    },
  })
  const income = qIncome.data ?? {}
  const records = income.records ?? []
  const propertyCount = Number(income.property_count ?? 0)
  const baseCurrency = income.currency || 'THB'

  const loading = qIncome.isPending && !qIncome.data
  const error = qIncome.isError ? t('common.loadFailed') : null
  const retryAll = () => {
    void qIncome.refetch({ cancelRefetch: false })
  }

  // 平均月租：直接来自后端按房源的 monthly_rent，不用付款流水反推
  const avgRent = useMemo(() => {
    const values = (income.by_property ?? []).map((p) => Number(p.monthly_rent || 0)).filter((v) => v > 0)
    if (!values.length) return 0
    return Math.round(values.reduce((s, v) => s + v, 0) / values.length)
  }, [income.by_property])

  // 趋势只算已到账（received）；pending/overdue 不能画进「已收」
  const monthlyTrend = useMemo(() => {
    const start = selectedMonth.subtract(11, 'month')
    const buckets: { month: string; total: number }[] = []
    for (let i = 0; i < 12; i += 1) {
      buckets.push({ month: start.add(i, 'month').format('YYYY-MM'), total: 0 })
    }
    const map = new Map(buckets.map((b) => [b.month, b]))
    records.forEach((r) => {
      if (String(r.status).toLowerCase() !== 'received') return
      const bucket = map.get(r.month)
      if (bucket) bucket.total += Number(r.amount || 0)
    })
    return buckets
  }, [records, selectedMonth])

  const monthlyIncome = monthlyTrend[11]?.total ?? 0
  const lastMonthIncome = monthlyTrend[10]?.total ?? 0
  const monthlyDelta = lastMonthIncome > 0
    ? ((monthlyIncome - lastMonthIncome) / lastMonthIncome) * 100
    : null

  // 年度已收：本年 vs 上年，用于真实涨跌箭头
  const yearStr = selectedMonth.format('YYYY')
  const prevYearStr = String(Number(yearStr) - 1)
  const yearIncome = useMemo(
    () => records
      .filter((r) => String(r.status).toLowerCase() === 'received' && r.month.startsWith(yearStr))
      .reduce((s, r) => s + Number(r.amount || 0), 0),
    [records, yearStr],
  )
  const prevYearIncome = useMemo(
    () => records
      .filter((r) => String(r.status).toLowerCase() === 'received' && r.month.startsWith(prevYearStr))
      .reduce((s, r) => s + Number(r.amount || 0), 0),
    [records, prevYearStr],
  )
  const yearlyDelta = prevYearIncome > 0
    ? ((yearIncome - prevYearIncome) / prevYearIncome) * 100
    : null

  // 表格展示数据：按所选月份 + 状态/房产筛选（与汇总同一份 records）
  const tableRows: IncomeRow[] = useMemo(() => {
    return records
      .filter((r) => r.month === monthStr)
      .map((r) => ({
        month: r.month,
        property: r.property || (r.property_id ? `${String(r.property_id).slice(0, 8)}...` : '-'),
        amount: Number(r.amount || 0),
        currency: r.currency || baseCurrency,
        status: rowStatusOf(r.status),
      }))
      .filter((r) => statusFilter === 'all' || r.status === statusFilter)
      .filter((r) => propertyFilter === 'all' || r.property === propertyFilter)
  }, [records, monthStr, statusFilter, propertyFilter, baseCurrency])

  // 筛选面板用的房产下拉（来自同一份 records）
  const propertyOptions = useMemo(() => {
    const set = new Set<string>()
    records.forEach((r) => {
      const name = r.property || (r.property_id ? `${String(r.property_id).slice(0, 8)}...` : '-')
      if (name) set.add(name)
    })
    return Array.from(set)
  }, [records])

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
        t('ownerIncome.thAmount'),
        t('common.status'),
      ]
        .map(escape)
        .join(','),
      ...tableRows.map((r) =>
        [
          r.month,
          r.property,
          `${r.amount} ${r.currency}`,
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
          backgroundColor: chartTheme.tooltipBg,
          padding: 12,
          cornerRadius: 8,
          callbacks: {
            label: (c: any) => formatMoney(Number(c.parsed.y || 0), baseCurrency),
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
            callback: (v: any) => formatMoney(Number(v || 0), baseCurrency),
          },
        },
      },
    }),
    [baseCurrency],
  )

  // 各房产收入分布（只算已到账，仍来自同一份 records）
  const propertyIncomeData = useMemo(() => {
    const map = new Map<string, number>()
    records.forEach((r) => {
      if (String(r.status).toLowerCase() !== 'received') return
      const key = r.property || (r.property_id ? String(r.property_id).slice(0, 8) : t('ownerIncome.unknownProperty'))
      map.set(key, (map.get(key) || 0) + Number(r.amount || 0))
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
  }, [records, t])

  const propertyIncomeOptions = useMemo(
    () => ({
      indexAxis: 'y' as const,
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: chartTheme.tooltipBg,
          padding: 12,
          cornerRadius: 8,
          callbacks: {
            label: (c: any) => formatMoney(Number(c.parsed.x || 0), baseCurrency),
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
            callback: (v: any) => formatMoney(Number(v || 0), baseCurrency),
          },
        },
        y: { grid: { display: false }, ticks: { color: chartTheme.ink2, font: { size: 12 } } },
      },
    }),
    [baseCurrency],
  )

  // 汇总卡片数值：全部来自后端同一份账单模型
  const monthlyIncomeVal = monthlyIncome
  const yearlyIncomeVal = yearIncome
  const avgRentVal = avgRent
  const totalBillAmount = records.reduce((s, r) => s + Number(r.amount || 0), 0)
  const receivedBillAmount = records
    .filter((r) => String(r.status).toLowerCase() === 'received')
    .reduce((s, r) => s + Number(r.amount || 0), 0)
  const collectionRate = totalBillAmount > 0
    ? Math.round((receivedBillAmount / totalBillAmount) * 1000) / 10
    : 0

  // 涨跌由数据计算：没有可比的去年同期就明确显示「暂无对比」，不再恒向上
  const renderDelta = (delta: number | null, compareKey: string) => {
    if (delta === null) {
      return (
        <div className="rent-stat-card__delta" style={{ color: 'var(--rent-ink-2)' }}>
          <span>{t('ownerIncome.noCompare')}</span>
        </div>
      )
    }
    const up = delta >= 0
    return (
      <div className={`rent-stat-card__delta ${up ? 'rent-stat-card__delta--up' : 'rent-stat-card__delta--down'}`}>
        <span>{up ? '↑' : '↓'} {Math.abs(delta).toFixed(1)}% · {t(compareKey)}</span>
      </div>
    )
  }

  return (
    <div className="rent-main">
      {loading ? (
        <DataState loading loadingText={t('ownerIncome.loadingData')} skeletonRows={2} />
      ) : error ? (
        <DataState
          error={error}
          retryText={t('common.retry')}
          onRetry={retryAll}
        />
      ) : null}

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
          <div className="rent-stat-card__value">{formatMoney(monthlyIncomeVal, baseCurrency)}</div>
          {renderDelta(monthlyDelta, 'ownerIncome.deltaVsLastMonth')}
        </div>
        <div className="rent-stat-card">
          <div className="rent-stat-card__label">{t('ownerIncome.statYearly')}</div>
          <div className="rent-stat-card__value">{formatMoney(yearlyIncomeVal, baseCurrency)}</div>
          {renderDelta(yearlyDelta, 'ownerIncome.deltaVsLastYear')}
        </div>
        <div className="rent-stat-card">
          <div className="rent-stat-card__label">{t('ownerIncome.statAvgRent')}</div>
          <div className="rent-stat-card__value">{formatMoney(avgRentVal, baseCurrency)}</div>
          <div className="rent-stat-card__delta" style={{ color: 'var(--rent-ink-2)' }}>
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
          <div className="rent-stat-card__delta" style={{ color: 'var(--rent-ink-2)' }}>
            <span>{t('ownerIncome.collectionFormula')}</span>
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
                <th>{t('ownerIncome.thAmount')}</th>
                <th>{t('common.status')}</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.length === 0 && !loading && !error ? (
                <tr>
                  <td colSpan={4}>
                    <DataState empty emptyTitle={t('ownerIncome.emptyIncome')} />
                  </td>
                </tr>
              ) : tableRows.length === 0 ? null : (
                pagedRows.map((r, i) => {
                const badge = statusBadgeMap[r.status] || statusBadgeMap.unpaid
                return (
                  <tr key={`${r.month}-${r.property}-${i}`}>
                    <td className="rent-mono">{r.month}</td>
                    <td>{r.property}</td>
                    <td className="rent-mono">{formatMoney(r.amount, r.currency)}</td>
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
