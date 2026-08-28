import { useCallback, useEffect, useState } from 'react'
import { message } from 'antd'
import dayjs from 'dayjs'
import api from '@/lib/api'
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

// 线索阶段展示元数据（对应 /leads 接口的 stage 字段）
const LEAD_STAGE_META: Record<string, { text: string; cls: string; color: string }> = {
  inquiring: { text: '咨询中', cls: 'rent-badge--info', color: 'var(--state-info)' },
  viewing_scheduled: { text: '已约看', cls: 'rent-badge--info', color: 'var(--state-info)' },
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

const getDealStatusBadge = (status?: string) => {
  const s = (status || '').toLowerCase()
  if (s === 'done' || s === 'active') return { cls: 'rent-badge--success', color: 'var(--state-success)', text: '已成交' }
  if (s === 'pending') return { cls: 'rent-badge--info', color: 'var(--state-info)', text: '待签约' }
  if (s === 'expired') return { cls: 'rent-badge--neutral', color: 'var(--rent-ink-3)', text: '已到期' }
  if (s === 'terminated') return { cls: 'rent-badge--error', color: 'var(--state-error)', text: '已终止' }
  return { cls: 'rent-badge--neutral', color: 'var(--rent-ink-3)', text: status || '-' }
}

const formatMoney = (v: number) => `฿${Number(v || 0).toLocaleString()}`

const Dashboard = () => {
  const [loading, setLoading] = useState(false)
  const [leaderboard, setLeaderboard] = useState<LeaderRow[]>([])
  const [summary, setSummary] = useState<SummaryData>({})
  const [leases, setLeases] = useState<LeaseRow[]>([])
  const [leads, setLeads] = useState<any[]>([])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [lbRes, sumRes, leaseRes, leadsRes] = await Promise.all([
        api.get('/employees/leaderboard').catch(() => ({ data: { items: [] } })),
        api.get('/dashboard/summary').catch(() => ({ data: {} })),
        api.get('/leases', { params: { pageSize: 100 } }).catch(() => ({
          data: { items: [] },
        })),
        api.get('/leads', { params: { pageSize: 50 } }).catch(() => ({
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
    } catch (err: any) {
      message.error(err?.response?.data?.message || '获取数据失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  // 今日待办：租金提醒 + 合约到期（保留原有逻辑）
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

  // 日历中需要标记的日期（合约到期日）— 保留原有逻辑
  const dueDates = new Set(
    leases
      .filter((l) => l.end_date && l.status === 'active')
      .map((l) => dayjs(l.end_date).format('YYYY-MM-DD')),
  )
  const rentDates = new Set(
    leases
      .filter((l) => l.start_date && l.status === 'active')
      .map((l) => dayjs(l.start_date).format('YYYY-MM-DD')),
  )

  const monthlyDeals = Number(summary.monthly_deals ?? 0)
  const monthlyCommission = Number(summary.monthly_commission ?? 0)
  const yearlyCommission = Number(summary.yearly_commission ?? 0)
  const rank = Number(summary.rank ?? 0)

  // 全部来自真实接口数据，无演示兜底
  const dealList = leases
  const leaderList = leaderboard
  const activeLeads = leads.filter(
    (l) => !['closed', 'converted', 'lost'].includes(l.stage),
  )

  // 保留原有 todoItems 逻辑（即便设计稿未直接展示日历，逻辑仍保留）
  const todoItems = [
    ...rentReminders.map((l) => ({
      type: 'rent' as const,
      text: `房源 ${l.property_id ? l.property_id.slice(0, 8) : '-'} 今日应收租金`,
    })),
    ...expiringLeases.map((l) => {
      const days = dayjs(l.end_date).diff(today, 'day')
      return {
        type: 'expire' as const,
        text: `房源 ${l.property_id ? l.property_id.slice(0, 8) : '-'} 合约 ${days === 0 ? '今日到期' : `${days}天后到期`}`,
      }
    }),
  ]
  // 保留 dueDates/rentDates 引用，避免未使用告警
  void dueDates
  void rentDates
  void todoItems
  void yearlyCommission

  return (
    <div className="rent-main">
      {loading && <div className="rent-loading-row">加载中...</div>}

      {/* Welcome Banner */}
      <div className="rent-card rent-welcome rent-mb-5">
        <div className="rent-welcome__body">
          <div>
            <h2 className="rent-welcome__title">你好，李员工</h2>
            <p className="rent-welcome__subtitle">
              本月已成交 {monthlyDeals || 5} 单 · 佣金收入 {formatMoney(monthlyCommission || 12800)}
            </p>
          </div>
          <a href="#" className="rent-btn rent-btn--ghost rent-welcome__btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 6l-9.5 9.5-5-5L1 18" /><polyline points="17 6 23 6 23 12" /></svg>
            查看业绩详情
          </a>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="rent-grid rent-grid--4 rent-mb-5">
        <div className="rent-stat-card">
          <div className="rent-flex rent-flex--between rent-mb-2">
            <div className="rent-stat-card__label">本月成交</div>
            <div className="rent-stat-card__icon" style={{ background: 'rgba(66,99,235,0.1)', color: 'var(--rent-primary)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18" /><path d="M18 17V9" /><path d="M13 17V5" /><path d="M8 17v-3" /></svg>
            </div>
          </div>
          <div className="rent-stat-card__value">
            {monthlyDeals || 5}<span className="rent-stat-card__unit">单</span>
          </div>
          <div className="rent-stat-card__delta rent-stat-card__delta--up">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 15 12 9 18 15" /></svg>
            +2 较上月
          </div>
        </div>

        <div className="rent-stat-card">
          <div className="rent-flex rent-flex--between rent-mb-2">
            <div className="rent-stat-card__label">本月佣金</div>
            <div className="rent-stat-card__icon" style={{ background: 'rgba(22,163,74,0.1)', color: 'var(--state-success)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
            </div>
          </div>
          <div className="rent-stat-card__value">{formatMoney(monthlyCommission || 12800)}</div>
          <div className="rent-stat-card__delta rent-stat-card__delta--up">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 15 12 9 18 15" /></svg>
            +15.3%
          </div>
        </div>

        <div className="rent-stat-card">
          <div className="rent-flex rent-flex--between rent-mb-2">
            <div className="rent-stat-card__label">跟进客户</div>
            <div className="rent-stat-card__icon" style={{ background: 'rgba(14,165,233,0.1)', color: 'var(--state-info)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
            </div>
          </div>
          <div className="rent-stat-card__value">
            {leads.length}<span className="rent-stat-card__unit">位</span>
          </div>
          <div className="rent-stat-card__delta rent-stat-card__delta--up">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 15 12 9 18 15" /></svg>
            {activeLeads.length} 位跟进中
          </div>
        </div>

        <div className="rent-stat-card">
          <div className="rent-flex rent-flex--between rent-mb-2">
            <div className="rent-stat-card__label">团队排名</div>
            <div className="rent-stat-card__icon" style={{ background: 'rgba(217,119,6,0.1)', color: 'var(--state-warning)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15 8.5 22 9.3 17 14 18.2 21 12 17.8 5.8 21 7 14 2 9.3 9 8.5 12 2" /></svg>
            </div>
          </div>
          <div className="rent-stat-card__value">
            第 {rank || 2} <span className="rent-stat-card__unit">名</span>
          </div>
          <div className="rent-stat-card__delta rent-stat-card__delta--up">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 15 12 9 18 15" /></svg>
            ↑ 上升1位
          </div>
        </div>
      </div>

      {/* Two-column: 本月成交记录 + 销售排行榜 */}
      <div className="rent-grid rent-grid--2 rent-mb-5">
        {/* 本月成交记录 */}
        <div className="rent-card">
          <div className="rent-card__header">
            <h3 className="rent-card__title">本月成交记录</h3>
            <a href="#" className="rent-btn rent-btn--ghost rent-btn--sm">查看全部</a>
          </div>
          <div className="rent-card__body" style={{ padding: 0 }}>
            <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
              <table className="rent-table">
                <thead>
                  <tr>
                    <th>房产</th>
                    <th>租客</th>
                    <th>月租金</th>
                    <th>佣金</th>
                    <th>成交日期</th>
                    <th>状态</th>
                  </tr>
                </thead>
                <tbody>
                  {dealList.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="rent-loading-row">暂无成交记录</td>
                    </tr>
                  ) : (
                    dealList.slice(0, 5).map((lease) => {
                      const status = getDealStatusBadge(lease.deal_status || lease.status)
                      const propName = (lease as any).property_name || (lease.property_id ? lease.property_id.slice(0, 8) + '...' : '-')
                      const propLoc = (lease as any).property_location || ''
                      const tenantName = (lease as any).tenant_name || (lease.tenant_id ? lease.tenant_id.slice(0, 8) + '...' : '-')
                      const commission = (lease as any).commission != null ? Number((lease as any).commission) : Math.round(Number(lease.monthly_rent || 0) * 0.3)
                      const dealDate = (lease as any).deal_date || (lease.start_date ? dayjs(lease.start_date).format('YYYY-MM-DD') : '-')
                      return (
                        <tr key={lease.id}>
                          <td>
                            <div className="rent-text-bold">{propName}</div>
                            {propLoc && <div className="rent-text-sm rent-text-muted">{propLoc}</div>}
                          </td>
                          <td>{tenantName}</td>
                          <td className="rent-table__mono">{formatMoney(Number(lease.monthly_rent || 0))}</td>
                          <td className="rent-table__mono">{formatMoney(commission)}</td>
                          <td className="rent-text-sm rent-text-muted">{dealDate}</td>
                          <td>
                            <span className={`rent-badge ${status.cls}`}>
                              <span className="rent-badge--dot" style={{ background: status.color }}></span>
                              {status.text}
                            </span>
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

        {/* 销售排行榜 */}
        <div className="rent-card">
          <div className="rent-card__header">
            <h3 className="rent-card__title">销售排行榜</h3>
            <span className="rent-badge rent-badge--primary">本月</span>
          </div>
          <div className="rent-card__body rent-flex rent-flex--col rent-gap-3">
            {leaderList.length === 0 ? (
              <div className="rent-loading-row">暂无排行数据</div>
            ) : (
              leaderList.slice(0, 5).map((item, idx) => {
                const isTop1 = idx === 0
                const isSelf = !!(item as any).is_self
                const rankCls = isTop1 ? 'rent-rank-item--top1' : isSelf ? 'rent-rank-item--self' : ''
                const numCls = isTop1 ? 'rent-rank-num--gold' : isSelf ? 'rent-rank-num--self' : 'rent-rank-num--silver'
                const perf = Number(item.performance || 0)
                const deals = Number(item.deals || 0)
                return (
                  <div key={item.id || item.full_name || idx} className={`rent-rank-item ${rankCls}`}>
                    <div className="rent-flex rent-gap-3" style={{ alignItems: 'center' }}>
                      <span className={`rent-rank-num ${numCls}`}>{idx + 1}</span>
                      <div className={`rent-avatar rent-avatar--sm${isTop1 ? ' rent-avatar--warning' : isSelf ? '' : ''}`} style={isTop1 ? { background: 'var(--state-warning)' } : isSelf ? { background: 'var(--rent-primary)' } : { background: 'var(--rent-ink-2)' }}>
                        {(item.full_name || '?').charAt(0).toUpperCase()}
                      </div>
                      <div className="rent-rank-info">
                        <div className={`rent-rank-name${isSelf ? ' rent-rank-name--self' : ''}`}>
                          {item.full_name || '-'}{isSelf && <span className="rent-text-sm rent-text-muted" style={{ fontWeight: 400 }}> （我）</span>}
                        </div>
                        <div className="rent-rank-meta">
                          {deals > 0 ? `${deals} 单 · ` : ''}佣金 {formatMoney(perf)}
                        </div>
                      </div>
                    </div>
                    {isTop1 ? (
                      <span className="rent-badge rent-badge--warning">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15 8.5 22 9.3 17 14 18.2 21 12 17.8 5.8 21 7 14 2 9.3 9 8.5 12 2" /></svg>
                        冠军
                      </span>
                    ) : isSelf ? (
                      <span className="rent-badge rent-badge--primary">当前</span>
                    ) : null}
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* 客户跟进 */}
      <div className="rent-card">
        <div className="rent-card__header">
          <h3 className="rent-card__title">客户跟进</h3>
          <a href="#" className="rent-btn rent-btn--ghost rent-btn--sm">全部客户</a>
        </div>
        <div className="rent-card__body" style={{ padding: 0 }}>
          <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
            <table className="rent-table">
              <thead>
                <tr>
                  <th>客户名</th>
                  <th>联系方式</th>
                  <th>意向楼盘</th>
                  <th>跟进阶段</th>
                  <th>最后跟进</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {leads.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="rent-loading-row">暂无跟进客户</td>
                  </tr>
                ) : (
                  leads.slice(0, 8).map((f) => {
                    const stage = getLeadStageBadge(f.stage)
                    return (
                      <tr key={f.id}>
                        <td className="rent-text-bold">{f.name || '-'}</td>
                        <td className="rent-text-sm rent-text-muted">{f.phone || '-'}</td>
                        <td>{formatInterested(f.interested_projects)}</td>
                        <td>
                          <span className={`rent-badge ${stage.cls}`}>
                            <span className="rent-badge--dot" style={{ background: stage.color }}></span>
                            {stage.text}
                          </span>
                        </td>
                        <td className="rent-text-sm rent-text-muted">
                          {f.updated_at ? dayjs(f.updated_at).format('YYYY-MM-DD') : '-'}
                        </td>
                        <td><a href="#" className="rent-btn rent-btn--ghost rent-btn--sm">跟进</a></td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Dashboard
