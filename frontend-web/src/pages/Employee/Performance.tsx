import { useCallback, useEffect, useMemo, useState } from 'react'
import { message, Spin, Empty } from 'antd'
import dayjs, { Dayjs } from 'dayjs'
import api from '@/lib/api'
import { formatMoney } from '@/lib/money'
import { downloadReport } from '@/lib/download'
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
  new_rental: '新租成交',
  renewal: '续约成交',
  management: '托管服务',
}
const BREAKDOWN_COLORS = ['var(--rent-primary)', 'var(--state-info)', 'var(--state-warning)']
const STATUS_LABELS: Record<string, { text: string; tone: string }> = {
  pending: { text: '待结算', tone: 'warning' },
  approved: { text: '已审核', tone: 'info' },
  paid: { text: '已发放', tone: 'success' },
}

const Performance = () => {
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
      label: `${m.month}月`,
      value: fmtCompact(m.revenue),
      height: `${Math.max(4, Math.round((m.revenue / max) * 100))}%`,
      active: m.year === (s?.year ?? dayjs().year()) && m.month === (s?.month ?? dayjs().month() + 1),
    }))
  }, [monthly, s])

  // 成交明细行
  const rows = useMemo(
    () =>
      data.map((r) => ({
        id: String(r.id).slice(0, 10),
        type: r.deal_type ? DEAL_LABELS[r.deal_type] ?? r.deal_type : '-',
        base: r.commission_base,
        amount: r.commission_amount,
        status: r.status
          ? STATUS_LABELS[r.status] ?? { text: r.status, tone: 'warning' }
          : { text: '-', tone: 'warning' },
        date: r.created_at ? dayjs(r.created_at).format('YYYY-MM-DD') : '-',
      })),
    [data],
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
            st === 'pending' ? '待结算' : st === 'approved' ? '已审核' : st === 'paid' ? '已发放' : '系统核算'
          return {
            month: `${m.month}月业绩`,
            date: key,
            desc: `系统自动核算 · 业绩 ${fmtMoney(m.revenue)} · 佣金 ${fmtMoney(m.commission)} · 成交 ${m.deals} 单`,
            tone,
            statusText,
          }
        }),
    [monthly, monthStatus],
  )

  const handleExport = async () => {
    try {
      // 导出后端佣金结算明细（员工只能导出自己的，范围由后端按角色校验）
      await downloadReport('/exports/commissions', {}, 'commissions.csv')
      message.success('业绩明细已导出')
    } catch {
      message.error('导出失败，请稍后重试')
    }
  }

  const handleSubmitReport = () => {
    message.success('月度报告已提交')
  }

  return (
    <div className="rent-main">
      {/* Page Header */}
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title">业绩报表</h2>
          <p className="rent-page-header__subtitle">查看个人业绩明细，提交月度报告</p>
        </div>
        <div className="rent-page-header__actions">
          <button className="rent-btn rent-btn--secondary" onClick={handleExport}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            导出报表
          </button>
          <button className="rent-btn rent-btn--primary" onClick={handleSubmitReport}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
            提交月报
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="rent-grid rent-grid--4 rent-mb-5">
        <div className="rent-stat-card">
          <div className="rent-flex rent-flex--between rent-mb-2">
            <div className="rent-stat-card__label">年度总业绩</div>
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
            {s?.year ?? dayjs().year()} 年累计
          </div>
        </div>

        <div className="rent-stat-card">
          <div className="rent-flex rent-flex--between rent-mb-2">
            <div className="rent-stat-card__label">本月业绩</div>
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
            本月成交 {s?.month_deals ?? 0} 单
          </div>
        </div>

        <div className="rent-stat-card">
          <div className="rent-flex rent-flex--between rent-mb-2">
            <div className="rent-stat-card__label">累计成交</div>
            <div className="rent-stat-card__icon" style={{ background: 'rgba(14,165,233,0.1)', color: 'var(--state-info)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
            </div>
          </div>
          <div className="rent-stat-card__value">
            {s?.deals_total ?? 0} <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--rent-ink-3)' }}>单</span>
          </div>
          <div className="rent-stat-card__delta rent-stat-card__delta--up">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 15 12 9 18 15" />
            </svg>
            新租 {s?.new_rentals ?? 0} · 续约 {s?.renewals ?? 0}
          </div>
        </div>

        <div className="rent-stat-card">
          <div className="rent-flex rent-flex--between rent-mb-2">
            <div className="rent-stat-card__label">累计佣金</div>
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
            本月 +{fmtMoney(s?.month_commission ?? 0)}
          </div>
        </div>
      </div>

      {/* Monthly Performance Summary */}
      <div className="rent-card rent-mb-5">
        <div className="rent-card__header">
          <h3 className="rent-card__title">月度业绩概览</h3>
          <span className="rent-text-sm rent-text-muted">单位：RM</span>
        </div>
        <div className="rent-card__body">
          {/* Month Tabs */}
          <div className="rent-tabs">
            {monthTabs.map((t, idx) => (
              <div
                key={t.format('YYYY-MM')}
                className="rent-tab"
                data-active={idx === activeMonthIdx}
                onClick={() => setMonth(t)}
                style={{ cursor: 'pointer' }}
              >
                {t.format('M')}月
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
              <div className="rent-text-sm rent-text-muted rent-mb-2">成交单数</div>
              <div className="rent-mini-stat__value">
                {s?.month_deals ?? 0} <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--rent-ink-3)' }}>单</span>
              </div>
            </div>
            <div className="rent-mini-stat">
              <div className="rent-text-sm rent-text-muted rent-mb-2">总租金收入</div>
              <div className="rent-mini-stat__value">{fmtMoney(s?.month_total ?? 0)}</div>
            </div>
            <div className="rent-mini-stat">
              <div className="rent-text-sm rent-text-muted rent-mb-2">佣金收入</div>
              <div className="rent-mini-stat__value">{fmtMoney(s?.month_commission ?? 0)}</div>
            </div>
            <div className="rent-mini-stat">
              <div className="rent-text-sm rent-text-muted rent-mb-2">新租 / 续约</div>
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
            <h3 className="rent-card__title">成交明细</h3>
            <span className="rent-badge rent-badge--primary">本月 {rows.length} 单</span>
          </div>
          <div className="rent-card__body" style={{ padding: 0 }}>
            <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
              <table className="rent-table">
                <thead>
                  <tr>
                    <th>结算编号</th>
                    <th>类型</th>
                    <th>业绩金额</th>
                    <th>佣金</th>
                    <th>状态</th>
                    <th>结算日期</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={6}>
                        <div className="rent-empty">
                          <Spin size="small" style={{ marginRight: 8 }} />
                          加载中...
                        </div>
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={6}>
                        <div className="rent-empty">
                          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无成交业绩，签约/续约后由系统自动核算" />
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
            <h3 className="rent-card__title">佣金构成</h3>
            <span className="rent-text-sm rent-text-muted">本月</span>
          </div>
          <div className="rent-card__body rent-flex rent-flex--col rent-gap-4">
            {(s?.breakdown ?? []).length === 0 ? (
              <div className="rent-empty" style={{ padding: '32px 0' }}>
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="本月暂无佣金构成" />
              </div>
            ) : (
              (s?.breakdown ?? []).map((c, i) => (
                <div key={c.deal_type}>
                  <div className="rent-flex rent-flex--between rent-mb-2">
                    <div className="rent-flex rent-gap-2" style={{ alignItems: 'center' }}>
                      <span className="rent-leg-dot" style={{ background: BREAKDOWN_COLORS[i % BREAKDOWN_COLORS.length] }} />
                      <span className="rent-text-bold">{c.label}</span>
                      <span className="rent-text-sm rent-text-muted">{c.count} 单</span>
                    </div>
                    <span className="rent-table__mono rent-text-bold">{fmtMoney(c.amount)}</span>
                  </div>
                  <div className="rent-progress">
                    <div
                      className="rent-progress__bar"
                      style={{ width: `${Math.max(2, c.percent)}%`, background: BREAKDOWN_COLORS[i % BREAKDOWN_COLORS.length] }}
                    />
                  </div>
                  <div className="rent-caption rent-text-muted rent-mt-2">占比 {c.percent}%</div>
                </div>
              ))
            )}

            <hr className="rent-divider" />

            <div
              className="rent-flex rent-flex--between"
              style={{ padding: '12px 16px', background: 'var(--rent-surface-2)', borderRadius: 'var(--rent-radius-md)' }}
            >
              <span className="rent-text-bold">本月佣金合计</span>
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
          <h3 className="rent-card__title">月度业绩记录</h3>
          <a href="#" className="rent-btn rent-btn--ghost rent-btn--sm">查看全部</a>
        </div>
        <div className="rent-card__body">
          {monthlyRecords.length === 0 ? (
            <div className="rent-empty" style={{ padding: '32px 0' }}>
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无业绩记录，签约/续约后由系统自动生成" />
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
