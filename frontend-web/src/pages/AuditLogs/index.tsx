import { useCallback, useEffect, useState } from 'react'
import { message } from 'antd'
import { auditLogsApi } from '@/services/api'
import './audit-logs.css'

interface AuditLog {
  id: string
  action: string
  resource_type: string
  resource_id: string
  actor_name: string
  actor_email: string
  pii_fields_accessed: string[]
  ip_address: string
  occurred_at: string
}

interface Summary {
  total_logs?: number
  actions_24h?: number
  sensitive_access?: number
  distinct_actors?: number
  [key: string]: any
}

// 操作类型元数据（徽章颜色与展示文案）
const ACTION_META: Record<string, { label: string; badge: string }> = {
  create: { label: '创建', badge: 'rent-badge--primary' },
  created: { label: '创建', badge: 'rent-badge--primary' },
  update: { label: '更新', badge: 'rent-badge--info' },
  updated: { label: '更新', badge: 'rent-badge--info' },
  delete: { label: '删除', badge: 'rent-badge--error' },
  deleted: { label: '删除', badge: 'rent-badge--error' },
  login: { label: '登录', badge: 'rent-badge--neutral' },
  logout: { label: '登出', badge: 'rent-badge--neutral' },
  export: { label: '导出', badge: 'rent-badge--warning' },
  read: { label: '查看', badge: 'rent-badge--neutral' },
}

const actionMeta = (action: string) =>
  ACTION_META[action] ?? { label: action || '—', badge: 'rent-badge--neutral' }

// 资源类型中文映射
const RESOURCE_TEXT: Record<string, string> = {
  property: '房源',
  lease: '合同',
  payment: '付款',
  employee: '员工',
  user: '用户',
  contract: '合同',
  commission_rule: '佣金规则',
  viewing: '预约看房',
}

const resourceText = (t: string) => RESOURCE_TEXT[t] || t || '—'

interface QueryParams {
  page: number
  pageSize: number
  action?: string
  resource_type?: string
  actor_user_id?: string
  start_at?: string
  end_at?: string
}

const AuditLogs = () => {
  const [items, setItems] = useState<AuditLog[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState<Summary>({})

  const [queryParams, setQueryParams] = useState<QueryParams>({
    page: 1,
    pageSize: 20,
  })
  const [draft, setDraft] = useState<QueryParams>({ page: 1, pageSize: 20 })

  const fetchSummary = useCallback(async () => {
    try {
      const res = await auditLogsApi.summary()
      const payload = res.data?.data ?? res.data
      setSummary(payload ?? {})
    } catch {
      /* 摘要接口失败时静默 */
    }
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await auditLogsApi.list({
        page: queryParams.page,
        limit: queryParams.pageSize,
        action: queryParams.action || undefined,
        resource_type: queryParams.resource_type || undefined,
        actor_user_id: queryParams.actor_user_id || undefined,
        start_at: queryParams.start_at || undefined,
        end_at: queryParams.end_at || undefined,
      })
      const payload = res.data?.data ?? res.data
      setItems(payload?.items ?? [])
      setTotal(payload?.total ?? 0)
    } catch (err: any) {
      message.error(err?.response?.data?.message || '获取审计日志失败')
    } finally {
      setLoading(false)
    }
  }, [queryParams])

  useEffect(() => {
    fetchData()
  }, [fetchData])
  useEffect(() => {
    fetchSummary()
  }, [fetchSummary])

  const totalPages = Math.max(1, Math.ceil(total / queryParams.pageSize))

  const applySearch = () => {
    const cleaned = { ...draft }
    ;(Object.keys(cleaned) as (keyof QueryParams)[]).forEach((k) => {
      if (cleaned[k] === '') (cleaned as any)[k] = undefined
    })
    setQueryParams({ ...cleaned, page: 1 })
  }

  const resetFilters = () => {
    const empty = { page: 1, pageSize: queryParams.pageSize }
    setDraft(empty)
    setQueryParams(empty)
  }

  const summaryCards = [
    {
      label: '累计审计日志',
      value: summary.total_logs ?? '—',
      icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z',
      sub: '系统安全审计',
    },
    {
      label: '近24小时行为',
      value: summary.actions_24h ?? '—',
      icon: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z',
      sub: '新产生的操作记录',
    },
    {
      label: '敏感数据访问',
      value: summary.sensitive_access ?? '—',
      icon: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 8v4 M12 16h.01',
      sub: '涉及 PII 字段的操作',
    },
    {
      label: '活跃操作员',
      value: summary.distinct_actors ?? '—',
      icon: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2',
      sub: '不同账号的操作数',
    },
  ]

  return (
    <div className="rent-main">
      {/* Page Header */}
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title">审计日志</h2>
          <p className="rent-page-header__subtitle">追踪系统内所有敏感操作与数据访问记录</p>
        </div>
        <div className="rent-page-header__actions">
          <span className="rent-badge rent-badge--neutral">仅管理员可见</span>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="rent-grid rent-grid--4 rent-mb-5">
        {summaryCards.map((s) => (
          <div className="rent-stat-card" key={s.label}>
            <div className="rent-stat-card__head">
              <div>
                <div className="rent-stat-card__label">{s.label}</div>
                <div className="rent-stat-card__value rent-num">{s.value}</div>
                <div className="audit-pii">{s.sub}</div>
              </div>
              <div className="rent-stat-card__icon" style={{ background: 'rgba(20,184,166,0.1)', color: 'var(--rent-primary)' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {s.icon.split('M').slice(1).map((d, i) => (
                    <path key={i} d={`M${d}`} />
                  ))}
                </svg>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Filter Bar */}
      <div className="rent-filter-bar">
        <select
          className="rent-form-select"
          style={{ width: 'auto', minWidth: 120 }}
          aria-label="操作类型"
          value={draft.action || ''}
          onChange={(e) => setDraft((p) => ({ ...p, action: e.target.value || undefined }))}
        >
          <option value="">全部操作</option>
          <option value="create">创建</option>
          <option value="update">更新</option>
          <option value="delete">删除</option>
          <option value="login">登录</option>
          <option value="export">导出</option>
          <option value="read">查看</option>
        </select>
        <select
          className="rent-form-select"
          style={{ width: 'auto', minWidth: 120 }}
          aria-label="资源类型"
          value={draft.resource_type || ''}
          onChange={(e) => setDraft((p) => ({ ...p, resource_type: e.target.value || undefined }))}
        >
          <option value="">全部资源</option>
          <option value="property">房源</option>
          <option value="lease">合同</option>
          <option value="payment">付款</option>
          <option value="employee">员工</option>
          <option value="user">用户</option>
          <option value="commission_rule">佣金规则</option>
          <option value="viewing">预约看房</option>
        </select>
        <div className="rent-search" style={{ width: 'auto', minWidth: 200 }}>
          <input
            type="text"
            placeholder="操作员ID / 账号"
            value={draft.actor_user_id || ''}
            onChange={(e) => setDraft((p) => ({ ...p, actor_user_id: e.target.value || undefined }))}
            onKeyDown={(e) => e.key === 'Enter' && applySearch()}
          />
        </div>
        <div className="rent-flex rent-gap-2" style={{ alignItems: 'center' }}>
          <input
            type="date"
            className="rent-form-input"
            style={{ width: 'auto' }}
            aria-label="开始时间"
            value={draft.start_at || ''}
            onChange={(e) => setDraft((p) => ({ ...p, start_at: e.target.value || undefined }))}
          />
          <span className="rent-text-muted rent-text-sm">至</span>
          <input
            type="date"
            className="rent-form-input"
            style={{ width: 'auto' }}
            aria-label="结束时间"
            value={draft.end_at || ''}
            onChange={(e) => setDraft((p) => ({ ...p, end_at: e.target.value || undefined }))}
          />
        </div>
        <button className="rent-btn rent-btn--primary rent-btn--sm" onClick={applySearch}>查询</button>
        <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={resetFilters}>重置</button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="rent-empty"><div className="rent-text-muted">加载中...</div></div>
      ) : (
        <div className="rent-table-wrap">
          <table className="rent-table">
            <thead>
              <tr>
                <th>操作</th>
                <th>资源</th>
                <th>资源ID</th>
                <th>操作员</th>
                <th>访问的敏感字段</th>
                <th>IP</th>
                <th>时间</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr><td colSpan={7} className="rent-text-muted">暂无匹配的审计记录</td></tr>
              )}
              {items.map((log) => {
                const meta = actionMeta(log.action)
                const pii = Array.isArray(log.pii_fields_accessed)
                  ? log.pii_fields_accessed.join(', ')
                  : log.pii_fields_accessed || '—'
                return (
                  <tr key={log.id}>
                    <td><span className={`rent-badge ${meta.badge}`}>{meta.label}</span></td>
                    <td>{resourceText(log.resource_type)}</td>
                    <td><span className="rent-mono">{log.resource_id ? String(log.resource_id).slice(0, 8) : '—'}</span></td>
                    <td>
                      <div className="audit-cell">{log.actor_name || '—'}</div>
                      <div className="audit-pii">{log.actor_email}</div>
                    </td>
                    <td className="audit-cell"><span className="audit-pii">{pii}</span></td>
                    <td><span className="rent-mono">{log.ip_address || '—'}</span></td>
                    <td className="rent-table__mono">{log.occurred_at ? new Date(log.occurred_at).toLocaleString() : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {!loading && (
        <div className="rent-pagination">
          <span className="rent-pagination__info">共 {total.toLocaleString()} 条记录</span>
          <button
            className="rent-pagination__btn"
            aria-label="上一页"
            disabled={queryParams.page <= 1}
            onClick={() => setQueryParams((p) => ({ ...p, page: Math.max(1, p.page - 1) }))}
          >‹</button>
          <span className="rent-pagination__info">{queryParams.page} / {totalPages}</span>
          <button
            className="rent-pagination__btn"
            aria-label="下一页"
            disabled={queryParams.page >= totalPages}
            onClick={() => setQueryParams((p) => ({ ...p, page: Math.min(totalPages, p.page + 1) }))}
          >›</button>
        </div>
      )}
    </div>
  )
}

export default AuditLogs