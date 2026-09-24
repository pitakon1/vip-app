import { useCallback, useEffect, useMemo, useState } from 'react'
import { message, Spin, Empty } from 'antd'
import dayjs, { Dayjs } from 'dayjs'
import api from '@/lib/api'
import { formatMoney } from '@/lib/money'
import { downloadReport } from '@/lib/download'
import { useTranslation } from 'react-i18next'
import './performance.css'

// 成交明细（系统按佣金结算自动核算）
interface CommissionRow {
  id: string
  deal_type?: string
  commission_base?: number
  commission_amount?: number
  status?: string
  created_at?: string
  [key: string]: any
}

// 系统核算的业绩汇总
interface PerfBreakdown {
  deal_type: string
  label: string
  amount: number
  count: number
  percent: number
}

interface PerfSummary {
  year: number
  month: number
  year_total: number
  month_total: number
  deals_total: number
  month_deals: number
  commission_total: number
  month_commission: number
  new_rentals: number
  renewals: number
  management: number
  breakdown: PerfBreakdown[]
}

interface MonthPerf {
  year: number
  month: number
  revenue: number
  commission: number
  deals: number
}

// 业绩/佣金一律泰铢口径（后端 base currency 为 THB）。
// 此前写死 'RM'：`formatMoney` 只加币种符号、不做汇率换算，所以显示出来的
// "RM 28,400" 其实是 28,400 泰铢——符号错了、数字也没换。
const fmtMoney = (v: number) => formatMoney(v, 'THB')

// 柱图值紧凑展示：28400 -> 28.4k
const fmtCompact = (v: number) => {
  const n = Number(v || 0)
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}

// 业绩类型文案与佣金构成配色
const DEAL_LABELS: Record<string, string> = {
  new_rental: 'employeePerformance.dealNewRental',
  renewal: 'employeePerformance.dealRenewal',
  management: 'employeePerformance.dealManagement',
}
const BREAKDOWN_COLORS = ['var(--rent-primary)', 'var(--state-info)', 'var(--state-warning)']
const STATUS_LABELS: Record<string, { text: string; tone: string }> = {
  pending: { text: 'employeePerformance.stPending', tone: 'warning' },
  approved: { text: 'employeePerformance.stApproved', tone: 'info' },
  paid: { text: 'employeePerformance.stPaid', tone: 'success' },
}

const Performance = () => {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<CommissionRow[]>([])
  const [summary, setSummary] = useState<PerfSummary | null>(null)
  const [monthly, setMonthly] = useState<MonthPerf[]>([])
  const [month, setMonth] = useState<Dayjs>(dayjs())

  const fetchData = useCallback(async () => {
    setLoading(true)
    // 业绩汇总：系统按佣金结算自动核算
    try {
      const pRes = await api.get('/performance/me')
      setSummary(pRes.data?.summary ?? null)
      setMonthly(Array.isArray(pRes.data?.monthly) ? pRes.data.monthly : [])
    } catch {
      setSummary(null)
      setMonthly([])
    }
    // 成交明细：我的佣金结算
    try {
      const res = await api.get('/commissions/me', { params: { pageSize: 100 } })
      const payload = res.data?.data ?? res.data
      setData(payload?.items ?? [])
    } catch {
      setData([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

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
  const barData = useMemo(() => {
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
  const rows = useMemo(
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
  const monthlyRecords = useMemo(
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

  return (
    <div className="rent-main">
      {/* Page Header */}
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title">{t('employeePerformance.title')}</h2>
          <p className="rent-page-header__subtitle">{t('employeePerformance.subtitle')}</p>
        </div>
        <div className="rent-page-header__actions">
          <button className="rent-btn rent-btn--secondary" onClick={handleExport}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            {t('employeePerformance.exportReport')}
          </button>
          <button className="rent-btn rent-btn--primary" onClick={handleSubmitReport}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
            {t('employeePerformance.submitReport')}
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="rent-grid rent-grid--4 rent-mb-5">
        <div className="rent-stat-card">
          <div className="rent-flex rent-flex--between rent-mb-2">
            <div className="rent-stat-card__label">{t('employeePerformance.yearTotal')}</div>
            <div className="rent-stat-card__icon" style={{ background: 'rgba(20, 184, 166, 0.1)', color: 'var(--rent-primary)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="1" x2="12" y2="23" />
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            </div>
          </div>
          <div className="rent-stat-card__value">{fmtMoney(s?.year_total ?? 0)}</div>
          <div className="rent-stat-card__delta rent-stat-card__delta--up">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 15 12 9 18 15" />
            </svg>
            {t('employeePerformance.yearCumulative', { y: s?.year ?? dayjs().year() })}
          </div>
        </div>

        <div className="rent-stat-card">
          <div className="rent-flex rent-flex--between rent-mb-2">
            <div className="rent-stat-card__label">{t('employeePerformance.monthTotal')}</div>
            <div className="rent-stat-card__icon" style={{ background: 'rgba(22,163,74,0.1)', color: 'var(--state-success)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </div>
          </div>
          <div className="rent-stat-card__value">{fmtMoney(s?.month_total ?? 0)}</div>
          <div className="rent-stat-card__delta rent-stat-card__delta--up">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 15 12 9 18 15" />
            </svg>
            {t('employeePerformance.monthDealsNote', { n: s?.month_deals ?? 0 })}
          </div>
        </div>

        <div className="rent-stat-card">
          <div className="rent-flex rent-flex--between rent-mb-2">
            <div className="rent-stat-card__label">{t('employeePerformance.dealsTotal')}</div>
            <div className="rent-stat-card__icon" style={{ background: 'rgba(14,165,233,0.1)', color: 'var(--state-info)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
            </div>
          </div>
          <div className="rent-stat-card__value">
            {s?.deals_total ?? 0} <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--rent-ink-3)' }}>{t('employeePerformance.unitDeal')}</span>
          </div>
          <div className="rent-stat-card__delta rent-stat-card__delta--up">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 15 12 9 18 15" />
            </svg>
            {t('employeePerformance.newRenewNote', { nr: s?.new_rentals ?? 0, rn: s?.renewals ?? 0 })}
          </div>
        </div>

        <div className="rent-stat-card">
          <div className="rent-flex rent-flex--between rent-mb-2">
            <div className="rent-stat-card__label">{t('employeePerformance.commissionTotal')}</div>
            <div className="rent-stat-card__icon" style={{ background: 'rgba(217,119,6,0.1)', color: 'var(--state-warning)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
                <path d="M12 6v2" />
                <path d="M12 16v2" />
              </svg>
            </div>
          </div>
          <div className="rent-stat-card__value">{fmtMoney(s?.commission_total ?? 0)}</div>
          <div className="rent-stat-card__delta rent-stat-card__delta--up">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 15 12 9 18 15" />
            </svg>
            {t('employeePerformance.monthCommissionNote', { amount: fmtMoney(s?.month_commission ?? 0) })}
          </div>
        </div>
      </div>

      {/* Monthly Performance Summary */}
      <div className="rent-card rent-mb-5">
        <div className="rent-card__header">
          <h3 className="rent-card__title">{t('employeePerformance.monthOverview')}</h3>
          <span className="rent-text-sm rent-text-muted">{t('employeePerformance.unitLabel')}</span>
        </div>
        <div className="rent-card__body">
          {/* Month Tabs */}
          <div className="rent-tabs">
            {monthTabs.map((mo, idx) => (
              <div
                key={mo.format('YYYY-MM')}
                className="rent-tab"
                data-active={idx === activeMonthIdx}
                onClick={() => setMonth(mo)}
                style={{ cursor: 'pointer' }}
              >
                {t('employeePerformance.monthNum', { m: mo.format('M') })}
              </div>
            ))}
          </div>

          {/* CSS Bar Chart */}
          <div style={{ marginBottom: 24 }}>
            <div className="rent-bar-chart">
              {barData.map((b) => (
                <div key={b.label} className="rent-bar-chart__col">
                  <div className={`rent-bar-chart__val${b.active ? ' rent-bar-chart__val--active' : ''}`}>
                    {b.value}
                  </div>
                  <div
                    className={`rent-bar-chart__bar${b.active ? ' rent-bar-chart__bar--active' : ''}`}
                    style={{ height: b.height }}
                  />
                </div>
              ))}
            </div>
            <div className="rent-bar-chart__labels">
              {barData.map((b) => (
                <div
                  key={b.label}
                  className={`rent-bar-chart__label${b.active ? ' rent-bar-chart__label--active' : ''}`}
                >
                  {b.label}
                </div>
              ))}
            </div>
          </div>

          {/* Monthly Breakdown */}
          <div className="rent-grid rent-grid--4">
            <div className="rent-mini-stat">
              <div className="rent-text-sm rent-text-muted rent-mb-2">{t('employeePerformance.miniDeals')}</div>
              <div className="rent-mini-stat__value">
                {s?.month_deals ?? 0} <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--rent-ink-3)' }}>{t('employeePerformance.unitDeal')}</span>
              </div>
            </div>
            <div className="rent-mini-stat">
              <div className="rent-text-sm rent-text-muted rent-mb-2">{t('employeePerformance.miniRentIncome')}</div>
              <div className="rent-mini-stat__value">{fmtMoney(s?.month_total ?? 0)}</div>
            </div>
            <div className="rent-mini-stat">
              <div className="rent-text-sm rent-text-muted rent-mb-2">{t('employeePerformance.miniCommissionIncome')}</div>
              <div className="rent-mini-stat__value">{fmtMoney(s?.month_commission ?? 0)}</div>
            </div>
            <div className="rent-mini-stat">
              <div className="rent-text-sm rent-text-muted rent-mb-2">{t('employeePerformance.miniNewRenew')}</div>
              <div className="rent-mini-stat__value">
                {s?.new_rentals ?? 0} <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--rent-ink-3)' }}>/</span> {s?.renewals ?? 0}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Two-column: Transaction Details + Commission Breakdown */}
      <div className="rent-grid rent-grid--2 rent-mb-5">
        {/* Transaction Details */}
        <div className="rent-card">
          <div className="rent-card__header">
            <h3 className="rent-card__title">{t('employeePerformance.dealDetail')}</h3>
            <span className="rent-badge rent-badge--primary">{t('employeePerformance.monthDealsBadge', { n: rows.length })}</span>
          </div>
          <div className="rent-card__body" style={{ padding: 0 }}>
            <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
              <table className="rent-table">
                <thead>
                  <tr>
                    <th>{t('employeePerformance.thSettlementNo')}</th>
                    <th>{t('employeePerformance.thType')}</th>
                    <th>{t('employeePerformance.thAmount')}</th>
                    <th>{t('employeePerformance.thCommission')}</th>
                    <th>{t('common.status')}</th>
                    <th>{t('employeePerformance.thSettlementDate')}</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={6}>
                        <div className="rent-empty">
                          <Spin size="small" style={{ marginRight: 8 }} />
                          {t('common.loading')}
                        </div>
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={6}>
                        <div className="rent-empty">
                          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('employeePerformance.emptyDeals')} />
                        </div>
                      </td>
                    </tr>
                  ) : (
                    rows.map((r) => (
                      <tr key={r.id}>
                        <td className="rent-table__mono">{r.id}</td>
                        <td>
                          <div className="rent-text-bold">{r.type}</div>
                        </td>
                        <td className="rent-table__mono">
                          {r.base != null ? fmtMoney(Number(r.base)) : '-'}
                        </td>
                        <td className="rent-table__mono rent-text-bold" style={{ color: 'var(--state-success)' }}>
                          {r.amount != null ? fmtMoney(Number(r.amount)) : '-'}
                        </td>
                        <td>
                          <span className={`rent-badge rent-badge--${r.status.tone}`}>{r.status.text}</span>
                        </td>
                        <td className="rent-text-sm rent-text-muted">{r.date}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Commission Breakdown */}
        <div className="rent-card">
          <div className="rent-card__header">
            <h3 className="rent-card__title">{t('employeePerformance.breakdownTitle')}</h3>
            <span className="rent-text-sm rent-text-muted">{t('employeePerformance.thisMonth')}</span>
          </div>
          <div className="rent-card__body rent-flex rent-flex--col rent-gap-4">
            {(s?.breakdown ?? []).length === 0 ? (
              <div className="rent-empty" style={{ padding: '32px 0' }}>
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('employeePerformance.emptyBreakdown')} />
              </div>
            ) : (
              (s?.breakdown ?? []).map((c, i) => (
                <div key={c.deal_type}>
                  <div className="rent-flex rent-flex--between rent-mb-2">
                    <div className="rent-flex rent-gap-2" style={{ alignItems: 'center' }}>
                      <span className="rent-leg-dot" style={{ background: BREAKDOWN_COLORS[i % BREAKDOWN_COLORS.length] }} />
                      <span className="rent-text-bold">{c.label}</span>
                      <span className="rent-text-sm rent-text-muted">{t('employeePerformance.countDeals', { n: c.count })}</span>
                    </div>
                    <span className="rent-table__mono rent-text-bold">{fmtMoney(c.amount)}</span>
                  </div>
                  <div className="rent-progress">
                    <div
                      className="rent-progress__bar"
                      style={{ width: `${Math.max(2, c.percent)}%`, background: BREAKDOWN_COLORS[i % BREAKDOWN_COLORS.length] }}
                    />
                  </div>
                  <div className="rent-caption rent-text-muted rent-mt-2">{t('employeePerformance.ratioLabel', { p: c.percent })}</div>
                </div>
              ))
            )}

            <hr className="rent-divider" />

            <div
              className="rent-flex rent-flex--between"
              style={{ padding: '12px 16px', background: 'var(--rent-surface-2)', borderRadius: 'var(--rent-radius-md)' }}
            >
              <span className="rent-text-bold">{t('employeePerformance.monthCommissionTotal')}</span>
              <span className="rent-stat-card__value" style={{ fontSize: 20, color: 'var(--rent-primary)' }}>
                {fmtMoney(s?.month_commission ?? 0)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Monthly Performance Records (system-calculated) */}
      <div className="rent-card">
        <div className="rent-card__header">
          <h3 className="rent-card__title">{t('employeePerformance.recordsTitle')}</h3>
          <a href="#" className="rent-btn rent-btn--ghost rent-btn--sm">{t('employeePerformance.viewAll')}</a>
        </div>
        <div className="rent-card__body">
          {monthlyRecords.length === 0 ? (
            <div className="rent-empty" style={{ padding: '32px 0' }}>
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('employeePerformance.emptyRecords')} />
            </div>
          ) : (
            <div className="rent-timeline">
              {monthlyRecords.map((item) => (
                <div key={item.month} className="rent-timeline__item">
                  <div className={`rent-timeline__dot rent-timeline__dot--${item.tone}`} />
                  <div className="rent-flex rent-flex--between">
                    <div>
                      <div className="rent-mb-2">
                        <span className="rent-text-bold">{item.month}</span>
                        <span className={`rent-badge rent-badge--${item.tone}`} style={{ marginLeft: 8 }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            {item.tone === 'warning' ? (
                              <>
                                <circle cx="12" cy="12" r="10" />
                                <polyline points="12 6 12 12 16 14" />
                              </>
                            ) : (
                              <path d="M20 6L9 17l-5-5" />
                            )}
                          </svg>
                          {item.statusText}
                        </span>
                      </div>
                      <div className="rent-text-sm rent-text-muted">{item.desc}</div>
                    </div>
                    <span className="rent-text-sm rent-text-muted">{item.date}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Performance
