import { useCallback, useEffect, useState } from 'react'
import { message, Spin, Empty, Modal, Input } from 'antd'
import { listingsApi } from '@/services/api'
import { formatMoney } from '@/lib/money'
import { useTranslation } from 'react-i18next'

interface Listing {
  id: string
  listing_type: string
  status: string
  property_id: string
  publisher: string
  asking_price: number | null
  monthly_rent: number | null
  currency: string
  sale_commission_rate: number | null
  rental_commission_months: number | null
  mandate_type: string
  buyer_side_rate: number | null
  listing_side_rate: number | null
  dedupe_state: string | null
  reject_reason: string | null
  broker_company?: string | null
  broker_real_name?: string | null
  created_at?: string | null
}

const STATUS_LABEL: Record<string, string> = { pending: 'listingReview.stPending', active: 'listingReview.stActive', rejected: 'listingReview.stRejected', closed: 'listingReview.stClosed', sold: 'listingReview.stSold', rented: 'listingReview.stRented' }
const CURRENCY: Record<string, string> = { THB: '฿', CNY: '¥', USD: '$', RM: 'RM ' }

const ListingReview = () => {
  const { t } = useTranslation()
  const [items, setItems] = useState<Listing[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('pending')
  const [current, setCurrent] = useState<Listing | null>(null)
  const [note, setNote] = useState('')
  const [modalMode, setModalMode] = useState<'approved' | 'rejected' | null>(null)
  const pageSize = 10

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await listingsApi.list({ page, page_size: pageSize, status: status || undefined })
      const payload = res.data?.data ?? res.data
      setItems(payload?.items ?? [])
      setTotal(payload?.total ?? 0)
    } catch (err: any) {
      message.error(err?.response?.data?.detail || t('listingReview.errLoad'))
    } finally {
      setLoading(false)
    }
  }, [page, status])

  useEffect(() => { fetchData() }, [fetchData])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const openReview = (li: Listing, mode: 'approved' | 'rejected') => {
    setCurrent(li)
    setNote('')
    setModalMode(mode)
  }
  const handleReview = async () => {
    if (!current) return
    if (modalMode === 'rejected' && !note.trim()) {
      message.warning(t('listingReview.warnReason'))
      return
    }
    try {
      await listingsApi.review(current.id, modalMode!, note)
      message.success(modalMode === 'approved' ? t('listingReview.msgApproved') : t('listingReview.msgRejected'))
      setModalMode(null)
      fetchData()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || t('listingReview.errReview'))
    }
  }

  const priceOf = (li: Listing) => {
    const cur = CURRENCY[li.currency] || li.currency
    const v = li.listing_type === 'sell' ? li.asking_price : li.monthly_rent
    return `${cur}${formatMoney(Number(v || 0), li.currency, false)}${li.listing_type === 'rent' ? t('listingReview.perMonth') : ''}`
  }

  return (
    <div className="rent-main">
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title">{t('listingReview.title')}</h2>
          <p className="rent-page-header__subtitle">{t('listingReview.subtitle')}</p>
        </div>
      </div>

      <div className="rent-filter-bar">
        <select className="rent-form-select" style={{ width: 'auto', minWidth: 130 }} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
          <option value="">{t('listingReview.allStatus')}</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="rent-empty"><Spin size="small" style={{ marginRight: 8 }} /><span className="rent-text-muted">{t('common.loading')}</span></div>
      ) : (
        <div className="rent-table-wrap">
          <table className="rent-table">
            <thead>
              <tr>
                <th>{t('listingReview.thProperty')}</th>
                <th>{t('listingReview.thPublisher')}</th>
                <th>{t('listingReview.thType')}</th>
                <th>{t('listingReview.thPrice')}</th>
                <th>{t('listingReview.thCommission')}</th>
                <th>{t('listingReview.thSplit')}</th>
                <th>{t('common.status')}</th>
                <th>{t('common.action')}</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && <tr><td colSpan={8}><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('listingReview.empty')} /></td></tr>}
              {items.map((li) => (
                <tr key={li.id}>
                  <td>
                    <div className="rent-text-bold">{t('listingReview.propertyLabel', { id: li.property_id.slice(0, 8) })}</div>
                    <div className="rent-text-sm rent-text-muted">{li.publisher}</div>
                  </td>
                  <td>{li.broker_company || li.broker_real_name || '—'}</td>
                  <td><span className="rent-badge rent-badge--info">{li.listing_type === 'sell' ? t('listingReview.typeSell') : t('listingReview.typeRent')}</span></td>
                  <td>{priceOf(li)}</td>
                  <td>{li.listing_type === 'rent' ? t('listingReview.commissionMonths', { n: li.rental_commission_months ?? '-' }) : `${li.sale_commission_rate ?? '-'}%`}</td>
                  <td>{li.buyer_side_rate != null ? t('listingReview.splitInfo', { buyer: li.buyer_side_rate, listing: li.listing_side_rate }) : '-'}</td>
                  <td>
                    <span className="rent-badge rent-badge--neutral">{STATUS_LABEL[li.status] ? t(STATUS_LABEL[li.status]) : li.status}</span>
                    {li.status === 'rejected' && li.reject_reason && <div className="rent-text-sm rent-text-muted" style={{ color: 'var(--state-error)' }}>{li.reject_reason}</div>}
                  </td>
                  <td>
                    <div className="rent-flex rent-gap-2">
                      <button className="rent-btn rent-btn--primary rent-btn--sm" onClick={() => openReview(li, 'approved')}>{t('listingReview.approve')}</button>
                      <button className="rent-btn rent-btn--ghost rent-btn--sm" style={{ color: 'var(--state-error)', borderColor: 'var(--state-error)' }} onClick={() => openReview(li, 'rejected')}>{t('listingReview.reject')}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="rent-pagination">
        <span className="rent-pagination__info">{t('listingReview.totalItems', { total: total.toLocaleString() })}</span>
        <button className="rent-pagination__btn" aria-label={t('listingReview.prevPage')} disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</button>
        <span className="rent-pagination__info">{page} / {totalPages}</span>
        <button className="rent-pagination__btn" aria-label={t('listingReview.nextPage')} disabled={page >= totalPages} onClick={() => setPage(page + 1)}>›</button>
      </div>

      <Modal
        open={!!modalMode}
        onCancel={() => setModalMode(null)}
        onOk={handleReview}
        okText={modalMode === 'approved' ? t('listingReview.okApprove') : t('listingReview.okReject')}
        cancelText={t('common.cancel')}
        title={modalMode === 'approved' ? t('listingReview.modalTitleApprove') : t('listingReview.modalTitleReject')}
      >
        {current && (
          <div>
            <p>{t('listingReview.propertyLabel', { id: current.property_id })} · {current.listing_type === 'sell' ? t('listingReview.typeSell') : t('listingReview.typeRent')} · {priceOf(current)}</p>
            {modalMode === 'rejected' && (
              <div className="rent-form-group" style={{ marginTop: 12 }}>
                <label className="rent-form-label">{t('listingReview.rejectReasonLabel')}</label>
                <Input.TextArea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('listingReview.phRejectReason')} />
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}

export default ListingReview