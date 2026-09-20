import { useCallback, useEffect, useMemo, useState } from 'react'
import { message, Spin, Empty, Alert, Button } from 'antd'
import { Link } from 'react-router-dom'
import dayjs from 'dayjs'
import api from '@/lib/api'
import { formatMoney } from '@/lib/money'
import useAuthStore from '@/stores/auth'
import './dashboard.css'

interface SummaryData {
  monthly_deals?: number
  monthly_commission?: number
  yearly_commission?: number
  rank?: number
  [key: string]: any
}

// 月度业绩行（/performance/mine 返回的 monthly 序列）
interface MonthPerf {
  year: number
  month: number
  revenue?: number
  commission?: number
  deals?: number
}

interface FollowUpLease {
  lease_id: string
  property_title?: string
  monthly_rent?: number
  currency?: string
  end_date?: string
  days_to_expire?: number
}

// 线索阶段展示元数据（对应 /leads 接口的 stage 字段）
const LEAD_STAGE_META: Record<string, { text: string; cls: string; color: string }> = {
  inquiring: { text: '咨询中', cls: 'rent-badge--info', color: 'var(--state-info)' },
  viewing_scheduled: { text: '看房中', cls: 'rent-badge--info', color: 'var(--state-info)' },
  negotiating: { text: '谈判中', cls: 'rent-badge--warning', color: 'var(--state-warning)' },
  pending_contract: { text: '待签约', cls: 'rent-badge--primary', color: 'var(--rent-primary)' },
  closed: { text: '已成交', cls: 'rent-badge--success', color: 'var(--state-success)' },
}

const getLeadStageBadge = (stage: string) =>
  LEAD_STAGE_META[stage] || {
    cls: 'rent-badge--neutral',
    color: 'var(--rent-ink-3)',
    text: stage || '-',
  }

// 线索意向楼盘展示：interested_projects 可能是字符串或对象数组
const formatInterested = (value: any): string => {
  if (!value) return '-'
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    const parts = value
      .map((v) => (typeof v === 'string' ? v : v?.name || v?.id || ''))
      .filter(Boolean)
    return parts.length ? parts.join(' / ') : '-'
  }
  return String(value)
}

// 柱图值紧凑展示：28400 -> 28.4k
const fmtCompact = (v: number) => {
  const n = Number(v || 0)
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}

// 带看状态标签
const VIEWING_STATUS_META: Record<string, { text: string; badge: string }> = {
  pending: { text: '待确认', badge: 'rent-badge--neutral' },
  confirmed: { text: '已确认', badge: 'rent-badge--primary' },
  completed: { text: '已完成', badge: 'rent-badge--success' },
  cancelled: { text: '已取消', badge: 'rent-badge--neutral' },
  no_show: { text: '爽约', badge: 'rent-badge--error' },
}

const getViewingStatus = (status?: string | null) =>
  VIEWING_STATUS_META[status ?? ''] ?? { text: status || '待确认', badge: 'rent-badge--neutral' }

const toHHmm = (iso?: string | null) => {
  if (!iso) return '--:--'
  const d = dayjs(iso)
  return d.isValid() ? d.format('HH:mm') : '--:--'
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

// 最近联系展示：今天 / 昨天 / MM-DD
const formatRelativeTime = (iso?: string, today?: dayjs.Dayjs) => {
  if (!iso) return '-'
  const d = dayjs(iso)
  if (today && d.isSame(today, 'day')) return `今天 ${d.format('HH:mm')}`
  if (today && d.isSame(today.subtract(1, 'day'), 'day')) return `昨天 ${d.format('HH:mm')}`
  return d.format('MM-DD')
}

const Dashboard = () => {
  const user = useAuthStore((s) => s.user)
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState<SummaryData>({})
  const [monthly, setMonthly] = useState<MonthPerf[]>([])
  const [leads, setLeads] = useState<any[]>([])
  const [followUpLeases, setFollowUpLeases] = useState<FollowUpLease[]>([])
  const [viewings, setViewings] = useState<any[]>([])
  const [pendingReceivable, setPendingReceivable] = useState(0)
  const [loadFailed, setLoadFailed] = useState(false)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      let anyFailed = false
      const markFailed = () => {
        anyFailed = true
        return { data: {} }
      }
      const [sumRes, leadsRes, wbRes, vwRes, pfRes] = await Promise.all([
        api.get('/dashboard/summary').catch(markFailed),
        api.get('/leads', { params: { pageSize: 50 } }).catch(() => {
          anyFailed = true
          return { data: { items: [] } }
        }),
        api.get('/employees/workbench').catch(markFailed),
        api.get('/viewings', { params: { pageSize: 100 } }).catch(() => {
          anyFailed = true
          return { data: { items: [] } }
        }),
        api.get('/performance/mine').catch(markFailed),
      ])

      const sumPayload = sumRes.data?.data ?? sumRes.data
      setSummary(sumPayload ?? {})

      const pfPayload = pfRes.data?.data ?? pfRes.data
      setMonthly(Array.isArray(pfPayload?.monthly) ? pfPayload.monthly : [])

      const leadsPayload = leadsRes.data?.data ?? leadsRes.data
      setLeads(leadsPayload?.items ?? [])

      const wbPayload = wbRes.data?.data ?? wbRes.data
      setFollowUpLeases(wbPayload?.follow_up_leases ?? [])
      setPendingReceivable(Number(wbPayload?.summary?.pending_receivable ?? 0))

      const vwPayload = vwRes.data?.data ?? vwRes.data
      setViewings(vwPayload?.items ?? [])
      setLoadFailed(anyFailed)
    } catch (err: any) {
      setLoadFailed(true)
      message.error(err?.response?.data?.message || '获取数据失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const today = dayjs()
  const monthlyDeals = Number(summary.monthly_deals ?? 0)
  const monthlyCommission = Number(summary.monthly_commission ?? 0)
  const rank = Number(summary.rank ?? 0)

  // 柱图数据：近 6 个月佣金走势（与 App 首页图表一致）
  const barData = useMemo(() => {
    const six = monthly.slice(-6)
    const max = Math.max(1, ...six.map((m) => Number(m.commission ?? 0)))
    const cur = dayjs()
    return six.map((m) => ({
      label: `${m.month}月`,
      value: fmtCompact(Number(m.commission ?? 0)),
      height: `${Math.max(4, Math.round((Number(m.commission ?? 0) / max) * 100))}%`,
      active: m.year === cur.year() && m.month === cur.month() + 1,
    }))
  }, [monthly])

  // 全部来自真实接口数据，无演示兜底
  // 今日工作台时间线：当天真实带看，按时间升序
  const todayViewings = viewings
    .filter((v) => v.scheduled_at && dayjs(v.scheduled_at).isSame(today, 'day'))
    .sort((a, b) => String(a.scheduled_at).localeCompare(String(b.scheduled_at)))

  const hotLeads = leads.filter((l) => ['negotiating', 'pending_contract'].includes(l.stage))

  return (
    <div className="rent-main">
      {loading && <div className="rent-loading-row"><Spin size="small" style={{ marginRight: 8 }} />加载中...</div>}

      {loadFailed && !loading && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="部分数据加载失败"
          description="工作台部分接口暂时不可用，已显示其他可用栏目，请稍后重试。"
          action={
            <Button size="small" onClick={() => fetchAll()}>
              重试
            </Button>
          }
        />
      )}

      {/* 问候行 */} 
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title" style={{ margin: '0 0 4px' }}>早上好，{user?.full_name || '同事'}</h2>
          <p className="rent-page-header__subtitle" style={{ margin: 0 }}>
            {today.format('M月D日')} 星期{WEEKDAYS[today.day()]} · 今日 {todayViewings.length} 场带看 · 高意向客户 {hotLeads.length} 位 · 待收款 {pendingReceivable} 笔
          </p>
        </div>
        <div className="rent-page-header__actions">
          <Link to="/viewings" className="rent-btn rent-btn--primary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /><line x1="12" y1="14" x2="12" y2="18" /><line x1="10" y1="16" x2="14" y2="16" /></svg>
            新建带看
          </Link>
        </div>
      </div>

      {/* 两栏：左 = 今日工作台 + 待跟进客户；右 = 租约临期 + 快捷操作 */}
      <div className="rent-grid" style={{ gridTemplateColumns: 'minmax(0, 1.55fr) minmax(0, 1fr)', alignItems: 'start' }}>

        {/* 左栏 */}
        <div className="rent-flex rent-flex--col" style={{ gap: 16 }}>

          {/* 今日工作台：真实带看时间线 */}
          <div className="rent-card">
            <div className="rent-card__header">
              <div className="rent-flex rent-gap-2" style={{ alignItems: 'center' }}>
                <h3 className="rent-card__title">今日工作台</h3>
                <span className="rent-badge rent-badge--primary">{todayViewings.length} 场带看</span>
              </div>
              <Link to="/viewings" className="rent-btn rent-btn--ghost rent-btn--sm">全部预约</Link>
            </div>
            <div className="rent-card__body">
              {todayViewings.length === 0 ? (
                <div className="rent-empty">
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="今日暂无带看安排" />
                </div>
              ) : (
                todayViewings.map((item) => {
                  const st = getViewingStatus(item.status)
                  return (
                    <div key={item.id} className="rent-wb-timeline-item">
                      <div className="rent-wb-time">
                        <div className="rent-wb-time__range" style={{ color: 'var(--rent-primary)' }}>
                          {toHHmm(item.scheduled_at)}
                        </div>
                        <div className="rent-wb-time__status">{st.text}</div>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="rent-text-bold">{item.property_title || '房源'}</div>
                        <div className="rent-text-sm rent-text-muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.property_address || ''} {item.visitor_name ? `· ${item.visitor_name}` : ''}
                        </div>
                      </div>
                      <span className={`rent-badge ${st.badge}`}>{st.text}</span>
                    </div>
                  )
                })
              )}
            </div>
            <div className="rent-card__footer" style={{ display: 'flex', gap: 8 }}>
              <Link to="/crm" className="rent-btn rent-btn--secondary rent-btn--sm" style={{ flex: 1 }}>联系客户</Link>
              <Link to="/viewings" className="rent-btn rent-btn--primary rent-btn--sm" style={{ flex: 1 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                新建带看
              </Link>
            </div>
          </div>

          {/* 待跟进客户 */}
          <div className="rent-card">
            <div className="rent-card__header">
              <div className="rent-flex rent-gap-2" style={{ alignItems: 'center' }}>
                <h3 className="rent-card__title">待跟进客户</h3>
                <span className="rent-badge rent-badge--warning">{hotLeads.length} 位高意向</span>
              </div>
              <Link to="/crm" className="rent-btn rent-btn--ghost rent-btn--sm">全部客户</Link>
            </div>
            <div className="rent-card__body" style={{ padding: 0 }}>
              <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
                <table className="rent-table">
                  <thead>
                    <tr>
                      <th>客户</th>
                      <th>意向房源</th>
                      <th>最近联系</th>
                      <th>阶段</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.length === 0 ? (
                      <tr>
                        <td colSpan={5}>
                          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无跟进客户" />
                        </td>
                      </tr>
                    ) : (
                      leads.slice(0, 8).map((f) => {
                        const stage = getLeadStageBadge(f.stage)
                        const closed = ['closed', 'converted'].includes(f.stage)
                        return (
                          <tr key={f.id}>
                            <td>
                              <div className="rent-flex rent-gap-2" style={{ alignItems: 'center' }}>
                                <div className="rent-avatar rent-avatar--sm">{(f.name || '?').charAt(0)}</div>
                                <span className="rent-text-bold">{f.name || '-'}</span>
                              </div>
                            </td>
                            <td>{formatInterested(f.interested_projects)}</td>
                            <td className="rent-text-sm rent-text-muted">{formatRelativeTime(f.updated_at, today)}</td>
                            <td>
                              <span className={`rent-badge ${stage.cls}`}>
                                <span className="rent-badge--dot" style={{ background: stage.color }}></span>
                                {stage.text}
                              </span>
                            </td>
                            <td>
                              <Link to="/crm" className={`rent-btn rent-btn--sm ${closed ? 'rent-btn--ghost' : 'rent-btn--primary'}`}>
                                {closed ? '查看' : '去跟进'}
                              </Link>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* 临期租约 SLA 跟进 */}
          <div className="rent-card">
            <div className="rent-card__header">
              <div className="rent-flex rent-gap-2" style={{ alignItems: 'center' }}>
                <h3 className="rent-card__title">租约临期跟进</h3>
                <span className="rent-badge rent-badge--warning">{followUpLeases.length} 份待跟进</span>
              </div>
              <span className="rent-text-sm rent-text-muted">续约 SLA</span>
            </div>
            <div className="rent-card__body" style={{ padding: 0 }}>
              {followUpLeases.length === 0 ? (
                <div className="rent-empty rent-text-muted">暂无临期租约，自动跟进任务已清空</div>
              ) : (
                <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
                  <table className="rent-table">
                    <thead>
                      <tr>
                        <th>房源</th>
                        <th style={{ textAlign: 'right' }}>月租</th>
                        <th>到期日</th>
                        <th>剩余天数</th>
                        <th>跟进状态</th>
                      </tr>
                    </thead>
                    <tbody>
                      {followUpLeases.map((fl) => {
                        const days = Number(fl.days_to_expire ?? 0)
                        const urgent = days <= 15
                        const due = days < 0 ? '已到期' : `${days} 天`
                        return (
                          <tr key={fl.lease_id}>
                            <td>
                              <div>{fl.property_title || '—'}</div>
                              <div className="rent-text-sm rent-text-muted">续约续接</div>
                            </td>
                            <td className="rent-table__mono" style={{ textAlign: 'right' }}>
                              {fl.currency || 'THB'} {Number(fl.monthly_rent ?? 0).toLocaleString()}
                            </td>
                            <td className="rent-table__mono">{fl.end_date ? String(fl.end_date).slice(0, 10) : '—'}</td>
                            <td>
                              <span className={`rent-badge ${urgent ? 'rent-badge--error' : 'rent-badge--warning'}`}>{due}</span>
                            </td>
                            <td>
                              <span className={`rent-badge ${urgent ? 'rent-badge--error' : 'rent-badge--neutral'}`}>
                                {urgent ? '需立即续约' : '跟踪中'}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 右栏 */}
        <div className="rent-flex rent-flex--col" style={{ gap: 16 }}>

          {/* 业绩摘要：本月三格 + 近 6 个月佣金柱图 */}
          <div className="rent-card">
            <div className="rent-card__header">
              <h3 className="rent-card__title">业绩摘要</h3>
              <span className="rent-badge rent-badge--primary">本月</span>
            </div>
            <div className="rent-wb-strip">
              <div className="rent-wb-strip__cell">
                <div className="rent-wb-strip__value">{summary.monthly_deals === undefined ? '-' : monthlyDeals} <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--rent-ink-3)' }}>单</span></div>
                <div className="rent-wb-strip__label">本月成交</div>
              </div>
              <div className="rent-wb-strip__cell">
                <div className="rent-wb-strip__value rent-wb-strip__value--md">{summary.monthly_commission === undefined ? '-' : formatMoney(monthlyCommission, 'RM')}</div>
                <div className="rent-wb-strip__label">佣金收入</div>
              </div>
              <div className="rent-wb-strip__cell">
                <div className="rent-wb-strip__value">{rank || '-'}</div>
                <div className="rent-wb-strip__label">团队排名</div>
              </div>
            </div>
            <div className="rent-card__body" style={{ paddingTop: 4 }}>
              <div className="rent-bar-chart" style={{ height: 150 }}>
                {barData.map((b) => (
                  <div key={b.label} className="rent-bar-chart__col">
                    <div className={`rent-bar-chart__val${b.active ? ' rent-bar-chart__val--active' : ''}`}>{b.value}</div>
                    <div
                      className={`rent-bar-chart__bar${b.active ? ' rent-bar-chart__bar--active' : ''}`}
                      style={{ height: b.height }}
                    />
                  </div>
                ))}
              </div>
              <div className="rent-bar-chart__labels">
                {barData.map((b) => (
                  <div key={b.label} className={`rent-bar-chart__label${b.active ? ' rent-bar-chart__label--active' : ''}`}>{b.label}</div>
                ))}
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}

export default Dashboard
