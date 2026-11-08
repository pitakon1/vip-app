import { useCallback, useEffect, useMemo, useState } from 'react'
import { message } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { useTranslation } from 'react-i18next'
import { downloadReport } from '@/lib/download'
import { MAX_PAGE_SIZE } from '@/lib/api'
import { performanceApi, commissionsApi } from '@/services/api'
import { chartTheme } from '@/lib/chartTheme'
import { DEAL_LABELS, STATUS_LABELS } from '../constants'
import type {
  BarItem,
  CommissionRow,
  DealRow,
  MonthPerf,
  MonthlyRecord,
  PerfRow,
  PerfSummary,
} from '../types'
import { fmtCompact, fmtMoney } from '../utils'

/** 员工业绩页：汇总 / 趋势 / 月度记录 / 全员业绩 / 合作公司（全部只读） */
export const useEmployeePerformance = () => {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<CommissionRow[]>([])
  const [summary, setSummary] = useState<PerfSummary | null>(null)
  const [monthly, setMonthly] = useState<MonthPerf[]>([])
  const [month, setMonth] = useState<Dayjs>(dayjs())
  const [agents, setAgents] = useState<PerfRow[]>([])
  const [partners, setPartners] = useState<PerfRow[]>([])
  const [agentsLoading, setAgentsLoading] = useState(false)
  const [partnersLoading, setPartnersLoading] = useState(false)
  // 员工业绩追踪排序：'total_commission' | 'total_revenue' | 'deals' | 'deal_type'
  const [agentSort, setAgentSort] = useState('total_commission')
  // 员工业绩追踪排序方向
  const [agentOrder, setAgentOrder] = useState<'asc' | 'desc'>('desc')

  const fetchData = useCallback(async () => {
    setLoading(true)
    // 业绩汇总：系统按佣金结算自动核算
    try {
      const pRes = await performanceApi.me()
      setSummary(pRes.data?.summary ?? null)
      setMonthly(Array.isArray(pRes.data?.monthly) ? pRes.data.monthly : [])
    } catch {
      setSummary(null)
      setMonthly([])
    }
    // 成交明细：我的佣金结算。
    // 后端 `page_size` 上限 100 且超限是静默截断，只取第 1 页会丢掉 100 条之后的
    // 佣金（月度状态、成交明细都因此偏少）。这里按上限逐页拉全，直到取满 total。
    try {
      const all: CommissionRow[] = []
      // 防御性上限：分页游标异常（total 持续变大）时不至于无限循环
      const MAX_PAGES = 100
      for (let page = 1; page <= MAX_PAGES; page++) {
        const res = await commissionsApi.me({ page, pageSize: MAX_PAGE_SIZE })
        const payload = res.data?.data ?? res.data
        const items = (payload?.items ?? []) as CommissionRow[]
        all.push(...items)
        const total = Number(payload?.total)
        if (
          items.length === 0 ||
          items.length < MAX_PAGE_SIZE ||
          (Number.isFinite(total) && all.length >= total)
        ) {
          break
        }
      }
      setData(all)
    } catch {
      setData([])
    } finally {
      setLoading(false)
    }
  }, [])

  // 员工业绩追踪（全员），本地排序
  const fetchAgents = useCallback(async () => {
    setAgentsLoading(true)
    try {
      const res = await performanceApi.agents()
      const payload = res.data?.data ?? res.data
      setAgents(Array.isArray(payload) ? payload : payload?.items ?? [])
    } catch {
      setAgents([])
    } finally {
      setAgentsLoading(false)
    }
  }, [])

  // 合作公司业绩 / 分佣汇总
  const fetchPartners = useCallback(async () => {
    setPartnersLoading(true)
    try {
      const res = await performanceApi.partners()
      const payload = res.data?.data ?? res.data
      setPartners(Array.isArray(payload) ? payload : payload?.items ?? [])
    } catch {
      setPartners([])
    } finally {
      setPartnersLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    fetchAgents()
    fetchPartners()
  }, [fetchData, fetchAgents, fetchPartners])

  const s = summary

  // 月份选项卡：当前月往前 3 个月（含当前）
  const monthTabs = useMemo(() => {
    const tabs: Dayjs[] = []
    for (let i = 3; i >= 0; i--) tabs.push(dayjs().subtract(i, 'month'))
    return tabs
  }, [])
  const activeMonthIdx = monthTabs.findIndex(
    (t) => t.format('YYYY-MM') === month.format('YYYY-MM'),
  )

  // 柱图数据：取最近 6 个月的业绩序列（与设计稿 6 根柱一致）
  const barData = useMemo<BarItem[]>(() => {
    const six = monthly.slice(-6)
    const max = Math.max(1, ...six.map((m) => m.revenue))
    return six.map((m) => ({
      label: t('employeePerformance.monthNum', { m: m.month }),
      value: fmtCompact(m.revenue),
      height: `${Math.max(4, Math.round((m.revenue / max) * 100))}%`,
      active: m.year === (s?.year ?? dayjs().year()) && m.month === (s?.month ?? dayjs().month() + 1),
    }))
  }, [monthly, s, t])

  // 成交明细行
  const rows = useMemo<DealRow[]>(
    () =>
      data.map((r) => ({
        id: String(r.id).slice(0, 10),
        type: r.deal_type ? (DEAL_LABELS[r.deal_type] ? t(DEAL_LABELS[r.deal_type]) : r.deal_type) : '-',
        base: r.commission_base,
        amount: r.commission_amount,
        status: r.status
          ? (STATUS_LABELS[r.status]
            ? { text: t(STATUS_LABELS[r.status].text), tone: STATUS_LABELS[r.status].tone }
            : { text: r.status, tone: 'warning' })
          : { text: '-', tone: 'warning' },
        date: r.created_at ? dayjs(r.created_at).format('YYYY-MM-DD') : '-',
      })),
    [data, t],
  )

  // 最近12个月业绩趋势（营收 / 佣金 双指标）
  const trendChartData = useMemo(() => {
    const m = monthly.length ? monthly : []
    const labels = m.map((r) => t('employeePerformance.monthNum', { m: r.month }))
    return {
      labels,
      datasets: [
        {
          label: t('employeePerformance.trendRevenue'),
          data: m.map((r) => r.revenue),
          borderColor: chartTheme.primary,
          backgroundColor: 'rgba(20, 184, 166, 0.08)',
          fill: true,
          tension: 0.3,
          borderWidth: 2,
          pointBackgroundColor: chartTheme.primary,
          pointBorderColor: chartTheme.surface,
          pointBorderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 5,
        },
        {
          label: t('employeePerformance.trendCommission'),
          data: m.map((r) => r.commission),
          borderColor: 'var(--state-warning)',
          backgroundColor: 'transparent',
          fill: false,
          tension: 0.3,
          borderWidth: 2,
          pointBackgroundColor: 'var(--state-warning)',
          pointBorderColor: chartTheme.surface,
          pointBorderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 5,
        },
      ],
    }
  }, [monthly, t])

  const trendChartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' as const },
      plugins: {
        legend: {
          position: 'top' as const,
          labels: { usePointStyle: true, boxWidth: 8, color: chartTheme.ink3, font: { size: 12 } },
        },
        tooltip: {
          backgroundColor: chartTheme.tooltipBg,
          titleColor: chartTheme.tooltipInk,
          bodyColor: chartTheme.tooltipInk,
          borderColor: chartTheme.tooltipBorder,
          borderWidth: 1,
          padding: 12,
          cornerRadius: 8,
          callbacks: {
            label: (ctx: any) => `${ctx.dataset.label}: ${fmtMoney(Number(ctx.parsed.y))}`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: chartTheme.ink3, font: { size: 12 } },
          border: { display: false },
        },
        y: {
          grid: { color: chartTheme.line },
          ticks: { color: chartTheme.ink3, font: { size: 12 } },
          border: { display: false },
        },
      },
    }),
    [t],
  )

  // 员工业绩追踪（全员）：点击表头排序
  const sortedAgents = useMemo(() => {
    const list = agents.map((a) => ({ ...a }))
    list.sort((x, y) => {
      let dx = Number(x[agentSort]) || 0
      let dy = Number(y[agentSort]) || 0
      // 名称类降序按字母序
      if (agentSort === 'employee_name') {
        dx = String(x.employee_name || '').localeCompare(String(y.employee_name || ''))
        dy = String(y.employee_name || '').localeCompare(String(x.employee_name || ''))
      }
      return agentOrder === 'asc' ? dx - dy : dy - dx
    })
    return list
  }, [agents, agentSort, agentOrder])

  const sortBy = (key: string) => {
    if (agentSort === key) {
      setAgentOrder((o) => (o === 'desc' ? 'asc' : 'desc'))
    } else {
      setAgentSort(key)
      setAgentOrder('desc')
    }
  }

  // 各月结算状态：取该月佣金结算中最「未完成」的状态（待结算 > 已审核 > 已发放）
  const monthStatus = useMemo(() => {
    const map: Record<string, string> = {}
    data.forEach((r) => {
      if (!r.created_at) return
      const key = dayjs(r.created_at).format('YYYY-MM')
      const st = String(r.status || '')
      const prev = map[key]
      if (st === 'pending' || prev === 'pending') map[key] = 'pending'
      else if (st === 'approved' || prev === 'approved') map[key] = 'approved'
      else map[key] = 'paid'
    })
    return map
  }, [data])

  // 系统核算的月度业绩记录（有业绩的月份，倒序），状态取自真实佣金结算
  const monthlyRecords = useMemo<MonthlyRecord[]>(
    () =>
      monthly
        .filter((m) => m.deals > 0)
        .slice()
        .reverse()
        .map((m) => {
          const key = `${m.year}-${String(m.month).padStart(2, '0')}`
          const st = monthStatus[key]
          const tone = st === 'pending' ? 'warning' : st === 'approved' ? 'info' : 'success'
          const statusText =
            st === 'pending' ? t('employeePerformance.stPending') : st === 'approved' ? t('employeePerformance.stApproved') : st === 'paid' ? t('employeePerformance.stPaid') : t('employeePerformance.stSystemCalc')
          return {
            month: t('employeePerformance.monthPerf', { m: m.month }),
            date: key,
            desc: t('employeePerformance.recordDesc', { revenue: fmtMoney(m.revenue), commission: fmtMoney(m.commission), deals: m.deals }),
            tone,
            statusText,
          }
        }),
    [monthly, monthStatus, t],
  )

  const handleExport = async () => {
    try {
      // 导出后端佣金结算明细（员工只能导出自己的，范围由后端按角色校验）
      await downloadReport('/exports/commissions', {}, 'commissions.csv')
      message.success(t('employeePerformance.msgExported'))
    } catch {
      message.error(t('employeePerformance.errExport'))
    }
  }

  const handleSubmitReport = () => {
    message.success(t('employeePerformance.msgReportSubmitted'))
  }

  return {
    loading,
    data,
    summary: s,
    monthly,
    month,
    setMonth,
    monthTabs,
    activeMonthIdx,
    barData,
    rows,
    trendChartData,
    trendChartOptions,
    agents,
    partners,
    agentsLoading,
    partnersLoading,
    agentSort,
    agentOrder,
    sortedAgents,
    sortBy,
    monthlyRecords,
    fetchData,
    handleExport,
    handleSubmitReport,
  }
}
