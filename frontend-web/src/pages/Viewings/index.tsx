import { useCallback, useEffect, useMemo, useState } from 'react'
import { message, Spin, Empty } from 'antd'
import { viewingsApi } from '@/services/api'
import { useTranslation } from 'react-i18next'
import './viewings.css'

type ViewingStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'

interface Viewing {
  id: string
  property_title: string
  property_address: string
  scheduled_at: string
  visitor_name: string
  visitor_phone: string
  visitor_email: string
  status: ViewingStatus
  assigned_to: string
  notes: string
  created_at: string
}

const STATUS_META: Record<ViewingStatus, { label: string; badge: string; dot: string }> = {
  pending: { label: 'viewings.stPending', badge: 'rent-badge--warning', dot: 'var(--state-warning)' },
  confirmed: { label: 'viewings.stConfirmed', badge: 'rent-badge--info', dot: 'var(--state-info)' },
  completed: { label: 'viewings.stCompleted', badge: 'rent-badge--success', dot: 'var(--state-success)' },
  cancelled: { label: 'viewings.stCancelled', badge: 'rent-badge--neutral', dot: 'var(--rent-ink-3)' },
  no_show: { label: 'viewings.stNoShow', badge: 'rent-badge--error', dot: 'var(--state-error)' },
}

interface QueryParams {
  page: number
  pageSize: number
  status?: ViewingStatus
  property_id?: string
}

const Viewings = () => {
  const { t } = useTranslation()
  const [items, setItems] = useState<Viewing[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [submittingId, setSubmittingId] = useState<string | null>(null)
  const [queryParams, setQueryParams] = useState<QueryParams>({
    page: 1,
    pageSize: 10,
  })

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await viewingsApi.list({
        page: queryParams.page,
        limit: queryParams.pageSize,
        status: queryParams.status || undefined,
        property_id: queryParams.property_id || undefined,
      })
      const payload = res.data?.data ?? res.data
      setItems(payload?.items ?? [])
      setTotal(payload?.total ?? 0)
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('viewings.errLoad'))
    } finally {
      setLoading(false)
    }
  }, [queryParams])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const changeStatus = async (id: string, status: ViewingStatus) => {
    try {
      setSubmittingId(id)
      await viewingsApi.updateStatus(id, status)
      message.success(t('viewings.msgStatusUpdated'))
      fetchData()
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('viewings.errUpdate'))
    } finally {
      setSubmittingId(null)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / queryParams.pageSize))

  const counts = useMemo(() => {
    const nextStatus = (s: ViewingStatus) => ({
      pending: { confirmed: t('viewings.stConfirmed'), no_show: t('viewings.stNoShow') },
      confirmed: { completed: t('viewings.stCompleted'), cancelled: t('viewings.stCancelled'), no_show: t('viewings.stNoShow') },
      completed: {},
      cancelled: {},
      no_show: {},
    })[s] as Record<string, string>
    return { nextStatus }
  }, [t])

  return (
    <div className="rent-main">
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title">{t('viewings.title')}</h2>
          <p className="rent-page-header__subtitle">{t('viewings.subtitle')}</p>
        </div>
        <div className="rent-page-header__actions">
          <span className="rent-badge rent-badge--neutral">{t('viewings.totalCount', { total: total.toLocaleString() })}</span>
        </div>
      </div>

      {/* Filter */}
      <div className="rent-filter-bar">
        <select
          className="rent-form-select"
          style={{ width: 'auto', minWidth: 130 }}
          aria-label={t('viewings.thStatus')}
          value={queryParams.status || ''}
          onChange={(e) =>
            setQueryParams((p) => ({
              ...p,
              status: (e.target.value || undefined) as ViewingStatus | undefined,
              page: 1,
            }))
          }
        >
          <option value="">{t('viewings.optAllStatus')}</option>
          <option value="pending">{t('viewings.stPending')}</option>
          <option value="confirmed">{t('viewings.stConfirmed')}</option>
          <option value="completed">{t('viewings.stCompleted')}</option>
          <option value="cancelled">{t('viewings.stCancelled')}</option>
          <option value="no_show">{t('viewings.stNoShow')}</option>
        </select>
        <div className="rent-search" style={{ width: 'auto', minWidth: 200 }}>
          <input
            type="text"
            placeholder={t('viewings.phPropertyId')}
            value={queryParams.property_id || ''}
            onChange={(e) => {
              const v = e.target.value
              setQueryParams((p) => ({ ...p, property_id: v || undefined, page: 1 }))
            }}
          />
        </div>
        <button className="rent-btn rent-btn--primary rent-btn--sm" onClick={() => setQueryParams((p) => ({ ...p, page: 1 }))}>{t('viewings.filter')}</button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="rent-empty"><Spin size="small" style={{ marginRight: 8 }} /><span className="rent-text-muted">{t('common.loading')}</span></div>
      ) : (
        <div className="rent-table-wrap">
          <table className="rent-table">
            <thead>
              <tr>
                <th>{t('viewings.thProperty')}</th>
                <th>{t('viewings.thScheduledAt')}</th>
                <th>{t('viewings.thVisitor')}</th>
                <th>{t('viewings.thContact')}</th>
                <th>{t('viewings.thAssignee')}</th>
                <th>{t('viewings.thStatus')}</th>
                <th>{t('viewings.thNotes')}</th>
                <th>{t('viewings.thAction')}</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr><td colSpan={8}><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('viewings.empty')} /></td></tr>
              )}
              {items.map((v) => {
                const meta = STATUS_META[v.status] || STATUS_META.pending
                const next = counts.nextStatus(v.status)
                const entries = Object.entries(next)
                return (
                  <tr key={v.id}>
                    <td>
                      <div>{v.property_title || '—'}</div>
                      <div className="rent-text-sm rent-text-muted">{v.property_address}</div>
                    </td>
                    <td className="rent-table__mono">{v.scheduled_at ? new Date(v.scheduled_at).toLocaleString() : '—'}</td>
                    <td>{v.visitor_name || '—'}</td>
                    <td>
                      <div className="rent-text-sm">{v.visitor_phone || '—'}</div>
                      <div className="rent-text-sm rent-text-muted">{v.visitor_email || ''}</div>
                    </td>
                    <td>{v.assigned_to || '—'}</td>
                    <td>
                      <span className={`rent-badge ${meta.badge}`}>
                        <span className="rent-badge--dot" style={{ background: meta.dot }} />
                        {t(meta.label)}
                      </span>
                    </td>
                    <td className="rent-text-muted" style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {v.notes || '—'}
                    </td>
                    <td>
                      <div className="rent-flex rent-gap-2">
                        {entries.length === 0 && <span className="rent-text-muted">—</span>}
                        {entries.map(([st, label]) => (
                          <button
                            key={st}
                            className="rent-btn rent-btn--ghost rent-btn--sm"
                            disabled={submittingId === v.id}
                            onClick={() => changeStatus(v.id, st as ViewingStatus)}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </td>
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
          <span className="rent-pagination__info">{t('viewings.totalRecords', { total: total.toLocaleString() })}</span>
          <button
            className="rent-pagination__btn"
            aria-label={t('viewings.prevPage')}
            disabled={queryParams.page <= 1}
            onClick={() => setQueryParams((p) => ({ ...p, page: Math.max(1, p.page - 1) }))}
          >‹</button>
          <span className="rent-pagination__info">{queryParams.page} / {totalPages}</span>
          <button
            className="rent-pagination__btn"
            aria-label={t('viewings.nextPage')}
            disabled={queryParams.page >= totalPages}
            onClick={() => setQueryParams((p) => ({ ...p, page: Math.min(totalPages, p.page + 1) }))}
          >›</button>
        </div>
      )}
    </div>
  )
}

export default Viewings