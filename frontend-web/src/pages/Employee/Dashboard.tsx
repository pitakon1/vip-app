import { useCallback, useEffect, useState } from 'react'
import { message, Spin, Empty } from 'antd'
import { Link } from 'react-router-dom'
import dayjs from 'dayjs'
import api from '@/lib/api'
import useAuthStore from '@/stores/auth'
import './dashboard.css'

interface LeaderRow {
  id: string
  full_name: string
  department?: string
  position?: string
  performance?: number
  deals?: number
  target?: number
  is_self?: boolean
  [key: string]: any
}

interface LeaseRow {
  id: string
  property_id: string
  tenant_id: string
  end_date: string
  start_date: string
  monthly_rent: number
  currency: string
  status: string
  [key: string]: any
}

interface SummaryData {
  monthly_deals?: number
  monthly_commission?: number
  yearly_commission?: number
  rank?: number
  [key: string]: any
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

const formatMoney = (v: number) => `RM ${Number(v || 0).toLocaleString()}`

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
  const [leaderboard, setLeaderboard] = useState<LeaderRow[]>([])
  const [summary, setSummary] = useState<SummaryData>({})
  const [leases, setLeases] = useState<LeaseRow[]>([])
  const [leads, setLeads] = useState<any[]>([])
  const [followUpLeases, setFollowUpLeases] = useState<FollowUpLease[]>([])
  const [viewings, setViewings] = useState<any[]>([])
  const [pendingReceivable, setPendingReceivable] = useState(0)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [lbRes, sumRes, leaseRes, leadsRes, wbRes, vwRes] = await Promise.all([
        api.get('/employees/leaderboard').catch(() => ({ data: { items: [] } })),
        api.get('/dashboard/summary').catch(() => ({ data: {} })),
        api.get('/leases', { params: { pageSize: 100 } }).catch(() => ({
          data: { items: [] },
        })),
        api.get('/leads', { params: { pageSize: 50 } }).catch(() => ({
          data: { items: [] },
        })),
        api.get('/employees/workbench').catch(() => ({ data: {} })),
        api.get('/viewings', { params: { pageSize: 100 } }).catch(() => ({
          data: { items: [] },
        })),
      ])

      const lbPayload = lbRes.data?.data ?? lbRes.data
      setLeaderboard(lbPayload?.items ?? lbPayload ?? [])

      const sumPayload = sumRes.data?.data ?? sumRes.data
      setSummary(sumPayload ?? {})

      const leasePayload = leaseRes.data?.data ?? leaseRes.data
      setLeases(leasePayload?.items ?? [])

      const leadsPayload = leadsRes.data?.data ?? leadsRes.data
      setLeads(leadsPayload?.items ?? [])

      const wbPayload = wbRes.data?.data ?? wbRes.data
      setFollowUpLeases(wbPayload?.follow_up_leases ?? [])
      setPendingReceivable(Number(wbPayload?.summary?.pending_receivable ?? 0))

      const vwPayload = vwRes.data?.data ?? vwRes.data
      setViewings(vwPayload?.items ?? [])
    } catch (err: any) {
      message.error(err?.response?.data?.message || '获取数据失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  // 今日待办：租金提醒 + 合约到期
  const today = dayjs()
  const rentReminders = leases.filter((l) => {
    if (!l.start_date) return false
    const start = dayjs(l.start_date)
    return start.date() === today.date() && l.status === 'active'
  })

  const expiringLeases = leases.filter((l) => {
    if (!l.end_date) return false
    const days = dayjs(l.end_date).diff(today, 'day')
    return days >= 0 && days <= 30 && l.status === 'active'
  })

  const monthlyDeals = Number(summary.monthly_deals ?? 0)
  const monthlyCommission = Number(summary.monthly_commission ?? 0)
  const rank = Number(summary.rank ?? 0)

  // 全部来自真实接口数据，无演示兜底
  // 今日工作台时间线：当天真实带看，按时间升序
  const todayViewings = viewings
    .filter((v) => v.scheduled_at && dayjs(v.scheduled_at).isSame(today, 'day'))
    .sort((a, b) => String(a.scheduled_at).localeCompare(String(b.scheduled_at)))

  const hotLeads = leads.filter((l) => ['negotiating', 'pending_contract'].includes(l.stage))

  return (
    <div className="rent-main">
      {loading && <div className="rent-loading-row"><Spin size="small" style={{ marginRight: 8 }} />加载中...</div>}

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

          {/* 业绩摘要（一行三格，真实数据无兜底） */}
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
                <div className="rent-wb-strip__value rent-wb-strip__value--md">{summary.monthly_commission === undefined ? '-' : formatMoney(monthlyCommission)}</div>
                <div className="rent-wb-strip__label">佣金收入</div>
              </div>
              <div className="rent-wb-strip__cell">
                <div className="rent-wb-strip__value">{rank || '-'}</div>
                <div className="rent-wb-strip__label">团队排名</div>
              </div>
            </div>
          </div>

          {/* 快捷操作 */}
          <div className="rent-card">
            <div className="rent-card__header">
              <h3 className="rent-card__title">快捷操作</h3>
            </div>
            <div className="rent-card__body">
              <div className="rent-wb-actions">
                <Link to="/viewings" className="rent-wb-action">
                  <div className="rent-wb-action__icon" style={{ background: 'rgba(20,184,166,0.1)', color: 'var(--rent-primary)' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /><line x1="12" y1="14" x2="12" y2="18" /><line x1="10" y1="16" x2="14" y2="16" /></svg>
                  </div>
                  <span className="rent-wb-action__label">新建带看</span>
                </Link>
                <Link to="/crm" className="rent-wb-action">
                  <div className="rent-wb-action__icon" style={{ background: 'rgba(14,165,233,0.1)', color: 'var(--state-info)' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                  </div>
                  <span className="rent-wb-action__label">联系客户</span>
                </Link>
                <Link to="/properties" className="rent-wb-action">
                  <div className="rent-wb-action__icon" style={{ background: 'rgba(22,163,74,0.1)', color: 'var(--state-success)' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
                  </div>
                  <span className="rent-wb-action__label">房源管理</span>
                </Link>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}

export default Dashboard
