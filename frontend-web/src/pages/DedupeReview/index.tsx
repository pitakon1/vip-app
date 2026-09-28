import { useCallback, useEffect, useMemo, useState } from 'react'
import { message, Spin, Empty, Modal, Input } from 'antd'
import { useTranslation } from 'react-i18next'
import { dedupeApi } from '@/services/api'

interface DedupeReview {
  id: string
  candidate_listing_id: string | null
  candidate_property_id: string | null
  matched_property_id: string | null
  matched_listing_id: string | null
  match_type: string | null
  match_key: string | null
  score: number | null
  status: string | null
  note: string | null
  created_at: string | null
}

const DedupeReview = () => {
  const { t } = useTranslation()
  const [items, setItems] = useState<DedupeReview[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('pending')
  const [current, setCurrent] = useState<DedupeReview | null>(null)
  const [note, setNote] = useState('')
  const [modalMode, setModalMode] = useState<'merge' | 'dismiss' | null>(null)
  const pageSize = 10

  // 命中类型 / 状态文案（依赖 i18n，故放在组件内）
  const matchTypeLabel = useMemo<Record<string, string>>(
    () => ({ exact: t('dedupeReview.matchExact'), fuzzy: t('dedupeReview.matchFuzzy') }),
    [t],
  )
  const statusLabel = useMemo<Record<string, string>>(
    () => ({ pending: t('dedupeReview.stPending'), merged: t('dedupeReview.stMerged'), dismissed: t('dedupeReview.stDismissed') }),
    [t],
  )

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await dedupeApi.list({ page, page_size: pageSize, status: status || undefined })
      const payload = res.data?.data ?? res.data
      setItems(payload?.items ?? [])
      setTotal(payload?.total ?? 0)
    } catch (err: any) {
      message.error(err?.response?.data?.detail || t('dedupeReview.loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [page, status])

  useEffect(() => { fetchData() }, [fetchData])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const openAction = (r: DedupeReview, mode: 'merge' | 'dismiss') => {
    setCurrent(r)
    setNote(r.note || '')
    setModalMode(mode)
  }

  const handleAction = async () => {
    if (!current) return
    try {
      if (modalMode === 'merge') {
        await dedupeApi.merge(current.id, note || undefined)
        message.success(t('dedupeReview.mergeOk'))
      } else {
        await dedupeApi.dismiss(current.id, note || undefined)
        message.success(t('dedupeReview.dismissOk'))
      }
      setModalMode(null)
      fetchData()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || t('dedupeReview.actionFailed'))
    }
  }

  return (
    <div className="rent-main">
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title">{t('menu.dedupeReview')}</h2>
          <p className="rent-page-header__subtitle">{t('dedupeReview.subtitle')}</p>
        </div>
      </div>

      <div className="rent-filter-bar">
        <select className="rent-form-select" style={{ width: 'auto', minWidth: 130 }} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
          <option value="">{t('dedupeReview.allStatus')}</option>
          {Object.entries(statusLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="rent-empty"><Spin size="small" style={{ marginRight: 8 }} /><span className="rent-text-muted">{t('common.loading')}</span></div>
      ) : (
        <div className="rent-table-wrap">
          <table className="rent-table">
            <thead>
              <tr>
                <th>{t('dedupeReview.colCandidate')}</th>
                <th>{t('dedupeReview.colMatched')}</th>
                <th>{t('dedupeReview.colMatchKey')}</th>
                <th>{t('dedupeReview.colMatchType')}</th>
                <th>{t('dedupeReview.colScore')}</th>
                <th>{t('common.status')}</th>
                <th>{t('common.action')}</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && <tr><td colSpan={7}><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('dedupeReview.empty')} /></td></tr>}
              {items.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div className="rent-text-bold">{t('dedupeReview.listingShort')} {r.candidate_listing_id?.slice(0, 8) ?? '-'}</div>
                    <div className="rent-text-sm rent-text-muted">{t('dedupeReview.fileShort')} {r.candidate_property_id?.slice(0, 8) ?? '-'}</div>
                  </td>
                  <td>
                    <div className="rent-text-bold">{t('dedupeReview.fileShort')} {r.matched_property_id?.slice(0, 8) ?? '-'}</div>
                    {r.matched_listing_id && <div className="rent-text-sm rent-text-muted">{t('dedupeReview.listingShort')} {r.matched_listing_id.slice(0, 8)}</div>}
                  </td>
                  <td><code className="rent-text-sm">{r.match_key || '-'}</code></td>
                  <td><span className="rent-badge rent-badge--warning">{matchTypeLabel[r.match_type || ''] || r.match_type || '-'}</span></td>
                  <td>
                    <span className="rent-text-bold" style={{ color: Number(r.score) >= 0.8 ? 'var(--state-error)' : Number(r.score) >= 0.6 ? 'var(--state-warning)' : undefined }}>
                      {Math.round(Number(r.score || 0) * 100)}%
                    </span>
                  </td>
                  <td><span className="rent-badge rent-badge--neutral">{statusLabel[r.status || ''] || r.status}</span></td>
                  <td>
                    {r.status === 'pending' ? (
                      <div className="rent-flex rent-gap-2">
                        <button className="rent-btn rent-btn--primary rent-btn--sm" onClick={() => openAction(r, 'merge')}>{t('dedupeReview.btnMerge')}</button>
                        <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => openAction(r, 'dismiss')}>{t('dedupeReview.btnDismiss')}</button>
                      </div>
                    ) : <span className="rent-text-muted">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="rent-pagination">
        <span className="rent-pagination__info">{t('common.total')} {total.toLocaleString()} {t('common.items')}</span>
        <button className="rent-pagination__btn" aria-label={t('dedupeReview.prevPage')} disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</button>
        <span className="rent-pagination__info">{page} / {totalPages}</span>
        <button className="rent-pagination__btn" aria-label={t('dedupeReview.nextPage')} disabled={page >= totalPages} onClick={() => setPage(page + 1)}>›</button>
      </div>

      <Modal
        open={!!modalMode}
        onCancel={() => setModalMode(null)}
        onOk={handleAction}
        okText={modalMode === 'merge' ? t('dedupeReview.btnMerge') : t('dedupeReview.btnReject')}
        cancelText={t('common.cancel')}
        title={modalMode === 'merge' ? t('dedupeReview.titleMerge') : t('dedupeReview.titleDismiss')}
      >
        {current && (
          <div>
            <p>{t('dedupeReview.compareLine', { cand: current.candidate_listing_id?.slice(0, 8), matched: current.matched_property_id?.slice(0, 8), score: Math.round(Number(current.score || 0) * 100) })}</p>
            <p>{t('dedupeReview.matchKeyLabel')}<code>{current.match_key || '-'}</code></p>
            <div className="rent-form-group" style={{ marginTop: 12 }}>
              <label className="rent-form-label">{t('dedupeReview.noteLabel')}</label>
              <Input.TextArea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('dedupeReview.notePlaceholder')} />
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

export default DedupeReview