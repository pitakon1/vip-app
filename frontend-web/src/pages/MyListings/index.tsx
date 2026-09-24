import { useState } from 'react'
import { message, Spin, Empty, Modal } from 'antd'
import { useNavigate } from 'react-router-dom'
import { listingsApi } from '@/services/api'
import { formatMoney } from '@/lib/money'
import { useAuthStore } from '@/stores/auth'
import { useCachedQuery } from '@/lib/queryCache'
import RegionPicker, { type RegionSelection } from '@/components/RegionPicker'
import { useTranslation } from 'react-i18next'

interface Listing {
  id: string
  listing_type: string
  status: string
  property_id: string
  publisher: string
  owner_id: string
  asking_price: number | null
  monthly_rent: number | null
  currency: string
  sale_commission_rate: number | null
  rental_commission_months: number | null
  mandate_type: string
  split_option: string | null
  buyer_side_rate: number | null
  listing_side_rate: number | null
  dedupe_state: string | null
  reject_reason: string | null
  owner_contact_name?: string | null
  owner_contact_phone?: string | null
  created_at?: string | null
  broker_company?: string | null
  broker_real_name?: string | null
  // C 端口径的房源展示字段（后端 /listings 已对齐 /public/listings）
  property_type?: string | null
  room_number?: string | null
  property_address?: string | null
  district?: string | null
  city?: string | null
  project_name?: string | null
  size_sqm?: number | null
  bedrooms?: number | null
  bathrooms?: number | null
  floor?: number | null
  building?: string | null
  orientation?: string | null
  decoration?: string | null
  cover?: string | null
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'myListings.stPending',
  active: 'myListings.stActive',
  rejected: 'myListings.stRejected',
  closed: 'myListings.stClosed',
  sold: 'myListings.stSold',
  rented: 'myListings.stRented',
}
const STATUS_BADGE: Record<string, string> = {
  pending: 'rent-badge--warning',
  active: 'rent-badge--success',
  rejected: 'rent-badge--error',
  closed: 'rent-badge--neutral',
  sold: 'rent-badge--success',
  rented: 'rent-badge--success',
}
const DEDUPE_LABEL: Record<string, string> = {
  new: 'myListings.ddNew',
  suspect: 'myListings.ddSuspect',
  blocked: 'myListings.ddBlocked',
  merged: 'myListings.ddMerged',
}
const CURRENCY: Record<string, string> = { THB: '฿', CNY: '¥', USD: '$', RM: 'RM ' }

const MyListings = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const uid = useAuthStore((s) => s.user)?.id ?? 'anon'
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [region, setRegion] = useState<RegionSelection | null>(null)
  const [current, setCurrent] = useState<Listing | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const pageSize = 10

  // 用户私有数据：key 含 uid，缓存优先渲染 + 后台刷新
  const q = useCachedQuery<{ items: Listing[]; total: number }>({
    queryKey: ['my-listings', uid, status || 'all', String(page), region?.region || '', region?.city || '', region?.district || ''],
    cacheKey: `my-listings:${uid}:${status || 'all'}:${page}:${region?.region ?? ''}:${region?.city ?? ''}:${region?.district ?? ''}`,
    queryFn: async () => {
      try {
        const res = await listingsApi.list({
          page,
          page_size: pageSize,
          status: status || undefined,
          region: region?.region || undefined,
          city: region?.city || undefined,
          district: region?.district || undefined,
        })
        const payload = res.data?.data ?? res.data
        return { items: payload?.items ?? [], total: payload?.total ?? 0 }
      } catch {
        return { items: [], total: 0 }
      }
    },
  })
  const items = q.data?.items ?? []
  const total = q.data?.total ?? 0
  const loading = q.isPending && !q.data

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const priceOf = (li: Listing) =>
    li.listing_type === 'sell'
      ? `${CURRENCY[li.currency] || li.currency}${formatMoney(Number(li.asking_price || 0), li.currency, false)}`
      : `${CURRENCY[li.currency] || li.currency}${formatMoney(Number(li.monthly_rent || 0), li.currency, false)}${t('myListings.perMonth')}`

  const commissionOf = (li: Listing) =>
    li.listing_type === 'rent'
      ? t('myListings.commissionMonths', { n: li.rental_commission_months ?? '-' })
      : `${li.sale_commission_rate ?? '-'}%`

  const splitOf = (li: Listing) => {
    if (li.buyer_side_rate == null && li.listing_side_rate == null) return '-'
    return t('myListings.splitInfo', { buyer: li.buyer_side_rate ?? 0, listing: li.listing_side_rate ?? 0 })
  }

  const propTitle = (li: Listing) =>
    li.project_name || [li.room_number, li.building].filter(Boolean).join(' · ') || t('myListings.fProperty')

  const propAddress = (li: Listing) =>
    li.property_address || [li.district, li.city].filter(Boolean).join(' ') || '—'

  const propSpec = (li: Listing) => {
    const parts: string[] = []
    if (li.size_sqm != null) parts.push(`${li.size_sqm}㎡`)
    if (li.bedrooms != null) parts.push(t('myListings.bedroomsN', { n: li.bedrooms }))
    if (li.bathrooms != null) parts.push(t('myListings.bathroomsN', { n: li.bathrooms }))
    if (li.orientation) parts.push(li.orientation)
    if (li.decoration) parts.push(li.decoration)
    return parts.join(' · ') || '—'
  }

  const renderProperty = (li: Listing) => (
    <div className="rent-flex rent-gap-2" style={{ alignItems: 'center', minWidth: 240 }}>
      {li.cover ? (
        <img src={li.cover} alt="" style={{ width: 56, height: 42, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
      ) : (
        <div className="rent-badge" style={{ minWidth: 56, textAlign: 'center', flexShrink: 0 }}>{t('myListings.noImage')}</div>
      )}
      <div style={{ minWidth: 0 }}>
        <div className="rent-text-bold" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{propTitle(li)}</div>
        <div className="rent-text-sm rent-text-muted" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{propAddress(li)}</div>
        <div className="rent-text-sm" style={{ color: 'var(--state-success)' }}>{propSpec(li)}</div>
      </div>
    </div>
  )

  const openDetail = (li: Listing) => {
    setCurrent(li)
    setDetailOpen(true)
  }

  const handleClose = async (li: Listing) => {
    const opts = li.listing_type === 'sell' ? { sold: true } : { rented: true }
    Modal.confirm({
      title: t('myListings.confirmCloseTitle'),
      content: li.listing_type === 'sell' ? t('myListings.confirmSell') : t('myListings.confirmRent'),
      onOk: async () => {
        try {
          await listingsApi.close(li.id, opts)
          message.success(t('myListings.msgClosed'))
          void q.refetch({ cancelRefetch: false })
        } catch (err: any) {
          message.error(err?.response?.data?.detail || t('myListings.errClose'))
        }
      },
    })
  }

  return (
    <div className="rent-main">
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title">{t('myListings.title')}</h2>
          <p className="rent-page-header__subtitle">{t('myListings.subtitle')}</p>
        </div>
        <div className="rent-page-header__actions">
          <button className="rent-btn rent-btn--primary rent-btn--sm" onClick={() => navigate('/publish-listing')}>
            + {t('myListings.publish')}
          </button>
        </div>
      </div>

      <div className="rent-filter-bar">
        <select className="rent-form-select" style={{ width: 'auto', minWidth: 130 }} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
          <option value="">{t('myListings.allStatus')}</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}
        </select>
        <RegionPicker value={region} onChange={(sel) => { setRegion(sel); setPage(1) }} />
      </div>

      {loading ? (
        <div className="rent-empty"><Spin size="small" style={{ marginRight: 8 }} /><span className="rent-text-muted">{t('common.loading')}</span></div>
      ) : (
        <div className="rent-table-wrap">
          <table className="rent-table">
            <thead>
              <tr>
                <th>{t('myListings.thProperty')}</th>
                <th>{t('myListings.thType')}</th>
                <th>{t('myListings.thPrice')}</th>
                <th>{t('myListings.thCommission')}</th>
                <th>{t('myListings.thSplit')}</th>
                <th>{t('common.status')}</th>
                <th>{t('myListings.thDedupe')}</th>
                <th>{t('common.action')}</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr><td colSpan={8}><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('myListings.empty')} /></td></tr>
              )}
              {items.map((li) => (
                <tr key={li.id}>
                  <td>{renderProperty(li)}</td>
                  <td><span className="rent-badge rent-badge--info">{li.listing_type === 'sell' ? t('myListings.typeSell') : t('myListings.typeRent')}</span></td>
                  <td>{priceOf(li)}</td>
                  <td>{commissionOf(li)}</td>
                  <td>{splitOf(li)}</td>
                  <td><span className={`rent-badge ${STATUS_BADGE[li.status] || 'rent-badge--neutral'}`}>{STATUS_LABEL[li.status] ? t(STATUS_LABEL[li.status]) : li.status}</span></td>
                  <td>
                    {li.dedupe_state && li.dedupe_state !== 'new' ? (
                      <span className={`rent-badge ${li.dedupe_state === 'blocked' || li.dedupe_state === 'merged' ? 'rent-badge--error' : 'rent-badge--warning'}`}>
                        {DEDUPE_LABEL[li.dedupe_state] ? t(DEDUPE_LABEL[li.dedupe_state]) : li.dedupe_state}
                      </span>
                    ) : <span className="rent-text-muted">normal</span>}
                    {li.status === 'rejected' && li.reject_reason && (
                      <div className="rent-text-sm rent-text-muted" style={{ color: 'var(--state-error)' }}>{li.reject_reason}</div>
                    )}
                  </td>
                  <td>
                    <div className="rent-flex rent-gap-2">
                      <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => openDetail(li)}>{t('myListings.detail')}</button>
                      {(li.status === 'active' || li.status === 'pending') && (
                        <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => handleClose(li)}>
                          {li.listing_type === 'sell' ? t('myListings.deal') : t('myListings.closeRental')}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="rent-pagination">
        <span className="rent-pagination__info">{t('myListings.totalItems', { total: total.toLocaleString() })}</span>
        <button className="rent-pagination__btn" aria-label={t('myListings.prevPage')} disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</button>
        <span className="rent-pagination__info">{page} / {totalPages}</span>
        <button className="rent-pagination__btn" aria-label={t('myListings.nextPage')} disabled={page >= totalPages} onClick={() => setPage(page + 1)}>›</button>
      </div>

      <Modal open={detailOpen} onCancel={() => setDetailOpen(false)} footer={null} title={t('myListings.detailTitle')}>
        {current && (
          <div className="rent-form-group">
            <p>{t('myListings.labelProperty')}<b>{propTitle(current)}</b> · {propSpec(current)}</p>
            <p>{t('myListings.labelAddress')}{propAddress(current)}</p>
            <p>{t('myListings.labelStatus')}<b>{STATUS_LABEL[current.status] ? t(STATUS_LABEL[current.status]) : current.status}</b></p>
            <p>{t('myListings.labelType')}{current.listing_type === 'sell' ? t('myListings.typeSell') : t('myListings.typeRent')} · {t('myListings.labelPrice')}{priceOf(current)}</p>
            <p>{t('myListings.labelMandate')}{current.mandate_type === 'exclusive' ? t('myListings.mandateExclusive') : t('myListings.mandateOpen')}</p>
            <p>{t('myListings.labelSplit')}{splitOf(current)}</p>
            <p>{t('myListings.labelCommission')}{commissionOf(current)}</p>
            <p>{t('myListings.labelDedupe')}{DEDUPE_LABEL[current.dedupe_state || ''] ? t(DEDUPE_LABEL[current.dedupe_state || '']) : 'normal'}</p>
            {current.owner_contact_name && <p>{t('myListings.labelOwner')}{current.owner_contact_name}{t('myListings.phoneWrap', { phone: current.owner_contact_phone || '-' })}</p>}
          </div>
        )}
      </Modal>
    </div>
  )
}

export default MyListings