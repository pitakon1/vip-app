import { useCallback, useEffect, useState } from 'react'
import { Button, message, Popconfirm, Empty, Spin } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import api from '@/lib/api'
import { useTranslation } from 'react-i18next'

interface ReviewItem {
  type: string
  id: string
  title: string
  applicant: string
  reason: string
  status: string
  created_at?: string
}

interface ReviewData {
  summary: Record<string, number>
  items: ReviewItem[]
}

const TYPE_META: Record<string, { label: string; badge: string; icon: string[]; style: { background: string; color: string } }> = {
  trip: {
    label: 'reviewCenter.typeTrip',
    badge: 'rent-badge--warning',
    icon: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', 'M9 12l2 2 4-4'],
    style: { background: 'rgba(217,119,6,0.12)', color: 'var(--state-warning)' },
  },
  maintenance: {
    label: 'reviewCenter.typeMaintenance',
    badge: 'rent-badge--info',
    icon: ['M14.7 6.3a4 4 0 0 0 5 5l-8.5 8.5a2.1 2.1 0 0 1-3-3z', 'M6 18l1 1'],
    style: { background: 'rgba(14,165,233,0.1)', color: 'var(--state-info)' },
  },
  service: {
    label: 'reviewCenter.typeService',
    badge: 'rent-badge--success',
    icon: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M9 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8z'],
    style: { background: 'rgba(22,163,74,0.1)', color: 'var(--state-success)' },
  },
  contract: {
    label: 'reviewCenter.typeContract',
    badge: 'rent-badge--neutral',
    icon: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6'],
    style: { background: 'rgba(20,184,166,0.1)', color: 'var(--rent-primary)' },
  },
}
const STATUS_LABEL: Record<string, string> = {
  pending: 'reviewCenter.stPending',
  open: 'reviewCenter.stOpen',
  assigned: 'reviewCenter.stAssigned',
  in_progress: 'reviewCenter.stInProgress',
  draft: 'reviewCenter.stDraft',
  sent: 'reviewCenter.stSent',
  partially_signed: 'reviewCenter.stPartiallySigned',
}
const STATUS_BADGE: Record<string, string> = {
  pending: 'rent-badge--warning',
  open: 'rent-badge--warning',
  assigned: 'rent-badge--info',
  in_progress: 'rent-badge--info',
  draft: 'rent-badge--neutral',
  sent: 'rent-badge--info',
  partially_signed: 'rent-badge--warning',
}

const PAGE_SIZE = 20

const ReviewCenter = () => {
  const { t } = useTranslation()
  const [data, setData] = useState<ReviewData | null>(null)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/review-center/todos')
      const d = res.data?.data ?? res.data
      setData(d)
    } catch (err: any) {
      message.error(err?.response?.data?.detail || t('reviewCenter.errLoad'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // 外勤审批
  const handleTrip = async (id: string, action: 'approved' | 'rejected') => {
    try {
      await api.post(`/attendance/external-trips/${id}/approve`, { action, reply_note: action === 'approved' ? t('reviewCenter.replyApproved') : t('reviewCenter.replyRejected') })
      message.success(action === 'approved' ? t('reviewCenter.msgApproved') : t('reviewCenter.msgRejected'))
      fetchData()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || t('reviewCenter.errOp'))
    }
  }

  // 报修工单受理 -> assigned；完结 -> resolved
  const handleTicket = async (id: string, status: string) => {
    try {
      await api.patch(`/maintenance-tickets/${id}`, { status })
      message.success(t('reviewCenter.msgTicketUpdated'))
      fetchData()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || t('reviewCenter.errOp'))
    }
  }

  // 服务订单受理 -> assigned
  const handleOrder = async (id: string, status: string) => {
    try {
      await api.patch(`/service-orders/${id}/status`, { status })
      message.success(t('reviewCenter.msgOrderUpdated'))
      fetchData()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || t('reviewCenter.errOp'))
    }
  }

  if (!data) return null

  const items = data.items ?? []
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pagedItems = items.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  return (
    <div className="rent-main">
      {/* Page Header */}
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title">{t('reviewCenter.title')}</h2>
          <p className="rent-page-header__subtitle">
            {t('reviewCenter.subtitle')}
          </p>
        </div>
        <div className="rent-page-header__actions">
          <Button icon={<ReloadOutlined />} onClick={fetchData}>
            {t('reviewCenter.refresh')}
          </Button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="rent-grid rent-grid--4 rent-mb-5">
        {Object.entries(TYPE_META).map(([k, m]) => (
          <div className="rent-stat-card" key={k}>
            <div className="rent-stat-card__head">
              <div>
                <div className="rent-stat-card__label">{t(m.label)}</div>
                <div className="rent-stat-card__value rent-num">{data.summary?.[k] ?? 0}</div>
                <div className="rent-stat-card__delta rent-text-muted">{t('reviewCenter.todoItem')}</div>
              </div>
              <div className="rent-stat-card__icon" style={m.style}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {m.icon.map((d) => (
                    <path key={d} d={d} />
                  ))}
                </svg>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Todo Table */}
      <div className="rent-card">
        <div className="rent-card__header">
          <h3 className="rent-card__title">{t('reviewCenter.todoList')}</h3>
        </div>
        <div className="rent-card__body" style={{ padding: 0 }}>
          <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
            <table className="rent-table">
              <thead>
                <tr>
                  <th>{t('reviewCenter.thType')}</th>
                  <th>{t('reviewCenter.thObject')}</th>
                  <th>{t('reviewCenter.thApplicant')}</th>
                  <th>{t('reviewCenter.thContent')}</th>
                  <th>{t('reviewCenter.thSubmittedAt')}</th>
                  <th>{t('reviewCenter.thStatus')}</th>
                  <th>{t('reviewCenter.thAction')}</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="rent-loading-row">
                      <Spin size="small" style={{ marginRight: 8 }} />
                      {t('common.loading')}
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <div className="rent-empty">
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('reviewCenter.empty')} />
                      </div>
                    </td>
                  </tr>
                ) : (
                  pagedItems.map((r) => {
                    const meta = TYPE_META[r.type] || { label: r.type, badge: 'rent-badge--neutral' }
                    return (
                      <tr key={`${r.type}-${r.id}`}>
                        <td>
                          <span className={`rent-badge ${meta.badge}`}>{TYPE_META[r.type] ? t(meta.label) : meta.label}</span>
                        </td>
                        <td style={{ fontWeight: 600 }}>{r.title || '—'}</td>
                        <td>{r.applicant || '—'}</td>
                        <td className="rent-text-muted">{r.reason || '—'}</td>
                        <td className="rent-table__mono">{r.created_at ? String(r.created_at).replace('T', ' ').slice(0, 16) : '—'}</td>
                        <td>
                          <span className={`rent-badge ${STATUS_BADGE[r.status] || 'rent-badge--neutral'}`}>
                            {STATUS_LABEL[r.status] ? t(STATUS_LABEL[r.status]) : r.status}
                          </span>
                        </td>
                        <td>
                          <div className="rent-flex rent-gap-2" style={{ flexWrap: 'wrap' }}>
                            {r.type === 'trip' && (
                              <>
                                <button className="rent-btn rent-btn--primary rent-btn--sm" type="button" onClick={() => handleTrip(r.id, 'approved')}>
                                  {t('reviewCenter.approve')}
                                </button>
                                <Popconfirm title={t('reviewCenter.confirmRejectTrip')} onConfirm={() => handleTrip(r.id, 'rejected')}>
                                  <button className="rent-btn rent-btn--ghost rent-btn--sm" type="button">
                                    {t('reviewCenter.reject')}
                                  </button>
                                </Popconfirm>
                              </>
                            )}
                            {r.type === 'maintenance' && (
                              <>
                                <button className="rent-btn rent-btn--primary rent-btn--sm" type="button" onClick={() => handleTicket(r.id, 'assigned')}>
                                  {t('reviewCenter.accept')}
                                </button>
                                <button className="rent-btn rent-btn--ghost rent-btn--sm" type="button" onClick={() => handleTicket(r.id, 'resolved')}>
                                  {t('reviewCenter.complete')}
                                </button>
                              </>
                            )}
                            {r.type === 'service' && (
                              <button className="rent-btn rent-btn--primary rent-btn--sm" type="button" onClick={() => handleOrder(r.id, 'assigned')}>
                                {t('reviewCenter.accept')}
                              </button>
                            )}
                            {r.type === 'contract' && <span className="rent-text-muted rent-text-sm">{t('reviewCenter.contractHint')}</span>}
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="rent-pagination" style={{ padding: '12px 20px' }}>
            <span className="rent-pagination__info">
              {t('reviewCenter.pagerInfo', { total: items.length, size: PAGE_SIZE })}
            </span>
            <button
              className="rent-pagination__btn"
              type="button"
              aria-label={t('reviewCenter.prevPage')}
              disabled={safePage <= 1}
              onClick={() => setPage(Math.max(1, safePage - 1))}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <span className="rent-pagination__info">
              {safePage} / {totalPages}
            </span>
            <button
              className="rent-pagination__btn"
              type="button"
              aria-label={t('reviewCenter.nextPage')}
              disabled={safePage >= totalPages}
              onClick={() => setPage(Math.min(totalPages, safePage + 1))}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ReviewCenter