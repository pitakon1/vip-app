import { useCallback, useEffect, useState } from 'react'
import { message, Empty } from 'antd'
import { useTranslation } from 'react-i18next'
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

// 操作类型元数据（徽章颜色与展示文案 key）
const ACTION_META: Record<string, { labelKey: string; badge: string }> = {
  create: { labelKey: 'auditLogs.actionCreate', badge: 'rent-badge--primary' },
  created: { labelKey: 'auditLogs.actionCreate', badge: 'rent-badge--primary' },
  update: { labelKey: 'auditLogs.actionUpdate', badge: 'rent-badge--info' },
  updated: { labelKey: 'auditLogs.actionUpdate', badge: 'rent-badge--info' },
  delete: { labelKey: 'auditLogs.actionDelete', badge: 'rent-badge--error' },
  deleted: { labelKey: 'auditLogs.actionDelete', badge: 'rent-badge--error' },
  login: { labelKey: 'auditLogs.actionLogin', badge: 'rent-badge--neutral' },
  logout: { labelKey: 'auditLogs.actionLogout', badge: 'rent-badge--neutral' },
  export: { labelKey: 'auditLogs.actionExport', badge: 'rent-badge--warning' },
  read: { labelKey: 'auditLogs.actionRead', badge: 'rent-badge--neutral' },
}

const actionMeta = (action: string, t: (key: string) => string) => {
  const meta = ACTION_META[action]
  return meta
    ? { label: t(meta.labelKey), badge: meta.badge }
    : { label: action || '—', badge: 'rent-badge--neutral' }
}

// 资源类型展示文案 key
const RESOURCE_TEXT: Record<string, string> = {
  property: 'auditLogs.resourceProperty',
  lease: 'auditLogs.resourceLease',
  payment: 'auditLogs.resourcePayment',
  employee: 'auditLogs.resourceEmployee',
  user: 'auditLogs.resourceUser',
  contract: 'auditLogs.resourceContract',
  commission_rule: 'auditLogs.resourceCommissionRule',
  viewing: 'auditLogs.resourceViewing',
}

const resourceText = (resource: string, t: (key: string) => string) => {
  const key = RESOURCE_TEXT[resource]
  return key ? t(key) : resource || '—'
}

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
  const { t } = useTranslation()
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
      message.error(err?.response?.data?.message || t('auditLogs.loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [queryParams, t])

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
      label: t('auditLogs.summaryTotal'),
      value: summary.total_logs ?? '—',
      icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z',
      sub: t('auditLogs.summaryTotalSub'),
    },
    {
      label: t('auditLogs.summary24h'),
      value: summary.actions_24h ?? '—',
      icon: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z',
      sub: t('auditLogs.summary24hSub'),
    },
    {
      label: t('auditLogs.summarySensitive'),
      value: summary.sensitive_access ?? '—',
      icon: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 8v4 M12 16h.01',
      sub: t('auditLogs.summarySensitiveSub'),
    },
    {
      label: t('auditLogs.summaryActors'),
      value: summary.distinct_actors ?? '—',
      icon: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2',
      sub: t('auditLogs.summaryActorsSub'),
    },
  ]

  return (
    <div className="rent-main">
      {/* Page Header */}
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title">{t('auditLogs.title')}</h2>
          <p className="rent-page-header__subtitle">{t('auditLogs.subtitle')}</p>
        </div>
        <div className="rent-page-header__actions">
          <span className="rent-badge rent-badge--neutral">{t('auditLogs.adminOnly')}</span>
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
        <div className="rent-filter-bar__search">
          <div className="rent-search" style={{ width: '100%' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--rent-ink-3)" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder={t('auditLogs.actorPlaceholder')}
              value={draft.actor_user_id || ''}
              onChange={(e) => setDraft((p) => ({ ...p, actor_user_id: e.target.value || undefined }))}
              onKeyDown={(e) => e.key === 'Enter' && applySearch()}
            />
          </div>
        </div>
        <select
          className="rent-filter-select rent-form-select"
          style={{ width: 'auto', minWidth: 120 }}
          aria-label={t('auditLogs.actionType')}
          value={draft.action || ''}
          onChange={(e) => setDraft((p) => ({ ...p, action: e.target.value || undefined }))}
        >
          <option value="">{t('auditLogs.allActions')}</option>
          <option value="create">{t('auditLogs.actionCreate')}</option>
          <option value="update">{t('auditLogs.actionUpdate')}</option>
          <option value="delete">{t('auditLogs.actionDelete')}</option>
          <option value="login">{t('auditLogs.actionLogin')}</option>
          <option value="export">{t('auditLogs.actionExport')}</option>
          <option value="read">{t('auditLogs.actionRead')}</option>
        </select>
        <select
          className="rent-filter-select rent-form-select"
          style={{ width: 'auto', minWidth: 120 }}
          aria-label={t('auditLogs.resourceType')}
          value={draft.resource_type || ''}
          onChange={(e) => setDraft((p) => ({ ...p, resource_type: e.target.value || undefined }))}
        >
          <option value="">{t('auditLogs.allResources')}</option>
          <option value="property">{t('auditLogs.resourceProperty')}</option>
          <option value="lease">{t('auditLogs.resourceLease')}</option>
          <option value="payment">{t('auditLogs.resourcePayment')}</option>
          <option value="employee">{t('auditLogs.resourceEmployee')}</option>
          <option value="user">{t('auditLogs.resourceUser')}</option>
          <option value="commission_rule">{t('auditLogs.resourceCommissionRule')}</option>
          <option value="viewing">{t('auditLogs.resourceViewing')}</option>
        </select>
        <div className="rent-flex rent-gap-2" style={{ alignItems: 'center' }}>
          <input
            type="date"
            className="rent-form-input"
            style={{ width: 'auto' }}
            aria-label={t('auditLogs.startAt')}
            value={draft.start_at || ''}
            onChange={(e) => setDraft((p) => ({ ...p, start_at: e.target.value || undefined }))}
          />
          <span className="rent-text-muted rent-text-sm">{t('auditLogs.to')}</span>
          <input
            type="date"
            className="rent-form-input"
            style={{ width: 'auto' }}
            aria-label={t('auditLogs.endAt')}
            value={draft.end_at || ''}
            onChange={(e) => setDraft((p) => ({ ...p, end_at: e.target.value || undefined }))}
          />
        </div>
        <button className="rent-btn rent-btn--primary rent-btn--sm" onClick={applySearch}>{t('auditLogs.search')}</button>
        <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={resetFilters}>{t('auditLogs.reset')}</button>
      </div>

      {/* Table */}
      <div className="rent-card">
        <div className="rent-card__header">
          <h3 className="rent-card__title">{t('auditLogs.recordsTitle')}</h3>
        </div>
        <div className="rent-card__body" style={{ padding: 0 }}>
          {loading ? (
            <div className="rent-empty"><div className="rent-text-muted">{t('auditLogs.loading')}</div></div>
          ) : (
            <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
              <table className="rent-table">
                <thead>
                  <tr>
                    <th>{t('auditLogs.colAction')}</th>
                    <th>{t('auditLogs.colResource')}</th>
                    <th>{t('auditLogs.colResourceId')}</th>
                    <th>{t('auditLogs.colActor')}</th>
                    <th>{t('auditLogs.colPii')}</th>
                    <th>{t('auditLogs.colIp')}</th>
                    <th>{t('auditLogs.colTime')}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={7}>
                        <div className="rent-empty">
                          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('auditLogs.empty')} />
                        </div>
                      </td>
                    </tr>
                  )}
                  {items.map((log) => {
                    const meta = actionMeta(log.action, t)
                    const pii = Array.isArray(log.pii_fields_accessed)
                      ? log.pii_fields_accessed.join(', ')
                      : log.pii_fields_accessed || '—'
                    return (
                      <tr key={log.id}>
                        <td><span className={`rent-badge ${meta.badge}`}>{meta.label}</span></td>
                        <td>{resourceText(log.resource_type, t)}</td>
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
            <div className="rent-pagination" style={{ padding: '12px 20px' }}>
              <span className="rent-pagination__info">{t('auditLogs.paginationInfo', { total: total.toLocaleString() })}</span>
              <button
                className="rent-pagination__btn"
                aria-label={t('auditLogs.prevPage')}
                disabled={queryParams.page <= 1}
                onClick={() => setQueryParams((p) => ({ ...p, page: Math.max(1, p.page - 1) }))}
              >‹</button>
              <span className="rent-pagination__info">{queryParams.page} / {totalPages}</span>
              <button
                className="rent-pagination__btn"
                aria-label={t('auditLogs.nextPage')}
                disabled={queryParams.page >= totalPages}
                onClick={() => setQueryParams((p) => ({ ...p, page: Math.min(totalPages, p.page + 1) }))}
              >›</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default AuditLogs