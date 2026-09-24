import { useEffect, useState } from 'react'
import { Empty, message } from 'antd'
import { useTranslation } from 'react-i18next'
import { saleListingApi, propertyDealApi, propertiesApi } from '@/services/api'
import { useCachedQuery } from '@/lib/queryCache'

/* ===== 看板列定义（覆盖全部挂牌状态） ===== */
const LISTING_KANBAN_COLUMNS: { key: string; title: string; statuses: string[] }[] = [
  { key: 'active', title: 'saleDeals.stActive', statuses: ['active'] },
  { key: 'pending', title: 'saleDeals.stPending', statuses: ['pending'] },
  { key: 'contracted', title: 'saleDeals.stContracted', statuses: ['contracted'] },
  { key: 'closed', title: 'saleDeals.stClosed', statuses: ['closed'] },
  { key: 'ended', title: 'saleDeals.stCancelledExpired', statuses: ['cancelled', 'expired'] },
]

/* ===== 常量与翻译 ===== */
const LISTING_STATUS: Record<string, { label: string; badge: string }> = {
  active: { label: 'saleDeals.stActive', badge: 'rent-badge--success' },
  pending: { label: 'saleDeals.stPending', badge: 'rent-badge--info' },
  contracted: { label: 'saleDeals.stContracted', badge: 'rent-badge--primary' },
  closed: { label: 'saleDeals.stClosed', badge: 'rent-badge--success' },
  cancelled: { label: 'saleDeals.stCancelled', badge: 'rent-badge--neutral' },
  expired: { label: 'saleDeals.stExpired', badge: 'rent-badge--neutral' },
}

const SALE_TYPE: Record<string, string> = { buy: 'saleDeals.typeBuy', sell: 'saleDeals.typeSell' }

const DEAL_STATUS: Record<string, { label: string; badge: string }> = {
  drafted: { label: 'saleDeals.dealDrafted', badge: 'rent-badge--neutral' },
  escrow_pending: { label: 'saleDeals.dealEscrowPending', badge: 'rent-badge--info' },
  signed: { label: 'saleDeals.dealSigned', badge: 'rent-badge--primary' },
  transferring: { label: 'saleDeals.dealTransferring', badge: 'rent-badge--warning' },
  completed: { label: 'saleDeals.dealCompleted', badge: 'rent-badge--success' },
  failed: { label: 'saleDeals.dealFailed', badge: 'rent-badge--error' },
  cancelled: { label: 'saleDeals.dealCancelled', badge: 'rent-badge--neutral' },
}

const ESCROW_STATUS: Record<string, { label: string; badge: string }> = {
  deposited: { label: 'saleDeals.escrowDeposited', badge: 'rent-badge--info' },
  held: { label: 'saleDeals.escrowHeld', badge: 'rent-badge--warning' },
  released_seller: { label: 'saleDeals.escrowReleasedSeller', badge: 'rent-badge--success' },
  refunded_buyer: { label: 'saleDeals.escrowRefundedBuyer', badge: 'rent-badge--neutral' },
}

const MORTGAGE_STATUS: Record<string, { label: string; badge: string }> = {
  applied: { label: 'saleDeals.mortApplied', badge: 'rent-badge--info' },
  under_review: { label: 'saleDeals.mortUnderReview', badge: 'rent-badge--warning' },
  pre_approved: { label: 'saleDeals.mortPreApproved', badge: 'rent-badge--info' },
  approved: { label: 'saleDeals.mortApproved', badge: 'rent-badge--success' },
  disbursed: { label: 'saleDeals.mortDisbursed', badge: 'rent-badge--success' },
  rejected: { label: 'saleDeals.mortRejected', badge: 'rent-badge--error' },
}

const fmtMoney = (v?: number) =>
  Number(v || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

const shortId = (id?: string) => (id ? String(id).slice(0, 8) : '—')

interface Listing {
  id: string
  sale_type?: string
  title?: string
  address?: string
  asking_price?: number
  currency?: string
  size_sqm?: number
  bedrooms?: number
  bathrooms?: number
  status?: string
}

interface Deal {
  id: string
  sale_listing_id?: string
  sale_price?: number
  currency?: string
  status?: string
  notes?: string
}

interface Escrow { id: string; deal_id?: string; amount?: number; currency?: string; status?: string; deposited_at?: string }
interface Mortgage { id: string; bank?: string; loan_amount?: number; currency?: string; term_months?: number; status?: string; status_at?: string }

const TABS = [
  { key: 'listing', label: 'saleDeals.tabListing' },
  { key: 'deal', label: 'saleDeals.tabDeal' },
  { key: 'escrow', label: 'saleDeals.tabEscrow' },
  { key: 'mortgage', label: 'saleDeals.tabMortgage' },
]

const SaleDeals = () => {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState('listing')
  const [listingCreateOpen, setListingCreateOpen] = useState(false)

  return (
    <div className="rent-main">
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title">{t('saleDeals.title')}</h2>
          <p className="rent-page-header__subtitle">
            {t('saleDeals.subtitle')}
          </p>
        </div>
        {activeTab === 'listing' && (
          <div className="rent-page-header__actions">
            <button className="rent-btn rent-btn--primary rent-btn--sm" onClick={() => setListingCreateOpen(true)}>{t('saleDeals.btnPublishListing')}</button>
          </div>
        )}
      </div>

      <div className="rent-tabs">
        {TABS.map((t2) => (
          <button
            key={t2.key}
            type="button"
            className="rent-tab"
            data-active={activeTab === t2.key}
            onClick={() => { setActiveTab(t2.key); setListingCreateOpen(false) }}
          >
            {t(t2.label)}
          </button>
        ))}
      </div>

      {activeTab === 'listing' && <ListingTab createOpen={listingCreateOpen} onOpenChange={setListingCreateOpen} />}
      {activeTab === 'deal' && <DealTab />}
      {activeTab === 'escrow' && <EscrowTab />}
      {activeTab === 'mortgage' && <MortgageTab />}
    </div>
  )
}

/* ===== 售房挂牌 Tab ===== */
const ListingTab = ({ createOpen, onOpenChange }: { createOpen: boolean; onOpenChange: (v: boolean) => void }) => {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const [saleType, setSaleType] = useState('')
  const [status, setStatus] = useState('')
  const [view, setView] = useState<'kanban' | 'list'>('kanban')
  const [valOpen, setValOpen] = useState<{ listing: Listing; items: any[] } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState<any>({ title: '', sale_type: 'sell', property_id: '', asking_price: '', currency: 'THB', address: '', size_sqm: '', bedrooms: '', bathrooms: '', description: '' })
  // 挂牌创建弹层的「选择房源」下拉（挂卖单后端必须带 property_id）
  const [propertyOptions, setPropertyOptions] = useState<any[]>([])

  const loadPropertyOptions = async () => {
    try {
      const res = await propertiesApi.list({ page: 1, pageSize: 100 })
      const payload = res.data?.data ?? res.data
      setPropertyOptions(payload?.items ?? [])
    } catch {
      setPropertyOptions([])
    }
  }

  useEffect(() => {
    if (createOpen) void loadPropertyOptions()
  }, [createOpen])

  // 挂牌列表：按筛选/页码缓存
  const listingsQ = useCachedQuery<{ items: Listing[]; total: number }>({
    queryKey: ['sale-listings', String(page), saleType, status],
    cacheKey: `sale-listings:${page}:${saleType}:${status}`,
    queryFn: async () => {
      const res = await saleListingApi.list({ page, pageSize: 10, sale_type: saleType || undefined, status: status || undefined })
      const payload = res.data?.data ?? res.data
      return { items: payload?.items ?? [], total: payload?.total ?? 0 }
    },
  })
  const items = listingsQ.data?.items ?? []
  const total = listingsQ.data?.total ?? 0
  const loading = listingsQ.isPending && !listingsQ.data
  const refresh = () => { void listingsQ.refetch({ cancelRefetch: false }) }

  useEffect(() => {
    if (listingsQ.isError) message.error((listingsQ.error as any)?.response?.data?.message || t('saleDeals.errFetchListings'))
  }, [listingsQ.isError, listingsQ.error])

  const setField = (k: string) => (e: any) => setForm((f: any) => ({ ...f, [k]: e.target.value }))

  const handleCreate = async () => {
    if (!form.title || !form.asking_price) {
      message.error(t('saleDeals.errTitlePriceRequired'))
      return
    }
    // 挂卖单后端必须带 property_id（缺失 404），挂买单不需要
    if (form.sale_type === 'sell' && !form.property_id) {
      message.error(t('saleDeals.errPropertyRequired'))
      return
    }
    setSubmitting(true)
    try {
      await saleListingApi.create({
        sale_type: form.sale_type,
        title: form.title,
        property_id: form.property_id || undefined,
        asking_price: Number(form.asking_price),
        currency: form.currency || 'THB',
        address: form.address || undefined,
        size_sqm: form.size_sqm ? Number(form.size_sqm) : undefined,
        bedrooms: form.bedrooms ? Number(form.bedrooms) : undefined,
        bathrooms: form.bathrooms ? Number(form.bathrooms) : undefined,
        description: form.description || undefined,
      })
      message.success(t('saleDeals.msgListingPublished'))
      onOpenChange(false)
      setForm({ title: '', sale_type: 'sell', property_id: '', asking_price: '', currency: 'THB', address: '', size_sqm: '', bedrooms: '', bathrooms: '', description: '' })
      refresh()
    } catch (e: any) {
      message.error(e?.response?.data?.message || t('saleDeals.errPublishFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  const changeStatus = async (id: string, s: string) => {
    try {
      await saleListingApi.updateStatus(id, s)
      message.success(t('saleDeals.msgStatusUpdated'))
      refresh()
    } catch (e: any) {
      message.error(e?.response?.data?.message || t('saleDeals.errUpdateFailed'))
    }
  }

  const openValuation = async (listing: Listing) => {
    try {
      const res = await saleListingApi.valuations(listing.id)
      setValOpen({ listing, items: res.data ?? [] })
    } catch (e: any) {
      message.error(e?.response?.data?.message || t('saleDeals.errFetchValuations'))
    }
  }

  const valForm = { market_value: '', low: '', high: '', confidence: '50' }

  return (
    <>
      <div className="rent-filter-bar">
        <select className="rent-form-select rent-filter-select" style={{ width: 'auto', minWidth: 120 }} aria-label={t('saleDeals.colType')} value={saleType} onChange={(e) => { setSaleType(e.target.value); setPage(1) }}>
          <option value="">{t('saleDeals.allTypes')}</option>
          <option value="sell">{t('saleDeals.typeSell')}</option>
          <option value="buy">{t('saleDeals.typeBuy')}</option>
        </select>
        <select className="rent-form-select rent-filter-select" style={{ width: 'auto', minWidth: 130 }} aria-label={t('saleDeals.colStatus')} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
          <option value="">{t('saleDeals.allStatuses')}</option>
          {Object.keys(LISTING_STATUS).map((k) => (
            <option key={k} value={k}>{t(LISTING_STATUS[k].label)}</option>
          ))}
        </select>
        <div style={{ flex: 1 }} />
        <div className="rent-chart-range-group">
          <button type="button" className={`rent-chart-range${view === 'kanban' ? ' rent-chart-range--active' : ''}`} onClick={() => setView('kanban')}>{t('saleDeals.viewKanban')}</button>
          <button type="button" className={`rent-chart-range${view === 'list' ? ' rent-chart-range--active' : ''}`} onClick={() => setView('list')}>{t('saleDeals.viewList')}</button>
        </div>
      </div>

      <div className="rent-card">
        <div className="rent-card__header">
          <h3 className="rent-card__title">{t('saleDeals.cardListings')}</h3>
          <span className="rent-badge rent-badge--neutral">{t('saleDeals.totalCount', { count: total })}</span>
        </div>
        <div className="rent-card__body" style={{ padding: 0 }}>
          {loading ? (
            <div className="rent-empty rent-text-muted">{t('common.loading')}</div>
          ) : view === 'kanban' ? (
            items.length === 0 ? (
              <div className="rent-empty"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('saleDeals.emptyListings')} /></div>
            ) : (
              <div className="rent-kanban" style={{ padding: '18px 22px' }}>
                {LISTING_KANBAN_COLUMNS.map((col) => {
                  const colItems = items.filter((it) => col.statuses.includes(it.status || 'active'))
                  return (
                    <div className="rent-kanban__column" key={col.key}>
                      <div className="rent-kanban__column-header">
                        <span className="rent-kanban__column-title">{t(col.title)}</span>
                        <span className="rent-kanban__column-count">{colItems.length}</span>
                      </div>
                      {colItems.length === 0 ? (
                        <div className="rent-text-muted" style={{ fontSize: 12, padding: '8px 2px' }}>—</div>
                      ) : colItems.map((it) => (
                        <div className="rent-kanban__card" key={it.id}>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{it.title || it.address || '—'}</div>
                          <div className="rent-num" style={{ color: 'var(--rent-primary)', fontWeight: 700, margin: '4px 0 6px' }}>
                            {it.currency ? `${it.currency} ` : ''}{fmtMoney(it.asking_price)}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--rent-ink-3)' }}>
                            {SALE_TYPE[it.sale_type || ''] ? t(SALE_TYPE[it.sale_type || '']) : '—'}
                            {it.size_sqm != null ? ` · ${it.size_sqm}㎡` : ''}
                            {it.bedrooms != null ? ` · ${it.bedrooms}${t('saleDeals.unitRoomSuffix')}` : ''}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            )
          ) : items.length === 0 ? (
            <div className="rent-empty rent-text-muted">{t('saleDeals.emptyListings')}</div>
          ) : (
            <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
              <table className="rent-table">
                <thead>
                  <tr>
                    <th>{t('saleDeals.colTitle')}</th><th>{t('saleDeals.colType')}</th><th>{t('saleDeals.colAskingPrice')}</th><th>{t('saleDeals.colCurrency')}</th><th>{t('saleDeals.colSize')}</th><th>{t('saleDeals.colStatus')}</th><th>{t('saleDeals.colAction')}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => {
                    const st = LISTING_STATUS[it.status || 'active'] || LISTING_STATUS.active
                    return (
                      <tr key={it.id}>
                        <td>{it.title || it.address || '—'}</td>
                        <td>{SALE_TYPE[it.sale_type || ''] ? t(SALE_TYPE[it.sale_type || '']) : '—'}</td>
                        <td className="rent-num">{fmtMoney(it.asking_price)}</td>
                        <td>{it.currency || '—'}</td>
                        <td className="rent-num">{it.size_sqm ?? '—'}</td>
                        <td><span className={`rent-badge ${st.badge}`}>{t(st.label)}</span></td>
                        <td>
                          <div className="rent-flex rent-gap-2">
                            <select className="rent-form-select" style={{ width: 96, minWidth: 96 }} aria-label={t('saleDeals.labelAdvanceStatus')} value="" onChange={(e) => e.target.value && changeStatus(it.id, e.target.value)}>
                              <option value="">{t('saleDeals.optChangeStatus')}</option>
                              {Object.keys(LISTING_STATUS).map((k) => (
                                <option key={k} value={k}>{t(LISTING_STATUS[k].label)}</option>
                              ))}
                            </select>
                            <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => openValuation(it)}>
                              {t('saleDeals.btnValuation', { id: shortId(it.id) })}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="rent-pagination" style={{ marginTop: 14, padding: '0 22px 16px' }}>
            <span className="rent-pagination__info">{t('saleDeals.totalPerPage', { count: total })}</span>
            <button className="rent-pagination__btn" onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1}>{t('saleDeals.prevPage')}</button>
            <span className="rent-pagination__info">{page}</span>
            <button className="rent-pagination__btn" onClick={() => setPage(page + 1)} disabled={page * 10 >= total}>{t('saleDeals.nextPage')}</button>
          </div>
        </div>
      </div>

      {createOpen && (
        <div className="rent-modal-backdrop" onClick={() => onOpenChange(false)}>
          <div className="rent-modal" style={{ width: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="rent-modal__header"><h3 className="rent-card__title">{t('saleDeals.modalPublishListing')}</h3></div>
            <div className="rent-modal__body">
              <div className="rent-form-row">
                <div className="rent-form-group">
                  <label className="rent-form-label">{t('saleDeals.labelTitle')}</label>
                  <input className="rent-form-input" value={form.title} onChange={setField('title')} placeholder={t('saleDeals.phTitle')} />
                </div>
              </div>
              <div className="rent-form-row">
                <div className="rent-form-group" style={{ flex: 1 }}>
                  <label className="rent-form-label">{t('saleDeals.labelProperty')}</label>
                  <select className="rent-form-select" value={form.property_id} onChange={setField('property_id')}>
                    <option value="">{t('saleDeals.phSelectProperty')}</option>
                    {propertyOptions.map((p) => (
                      <option key={p.id} value={p.id}>{p.room_number || p.address || shortId(p.id)}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="rent-form-row">
                <div className="rent-form-group">
                  <label className="rent-form-label">{t('saleDeals.colType')}</label>
                  <select className="rent-form-select" value={form.sale_type} onChange={setField('sale_type')}>
                    <option value="sell">{t('saleDeals.typeSell')}</option><option value="buy">{t('saleDeals.typeBuy')}</option>
                  </select>
                </div>
                <div className="rent-form-group">
                  <label className="rent-form-label">{t('saleDeals.colCurrency')}</label>
                  <input className="rent-form-input" value={form.currency} onChange={setField('currency')} />
                </div>
              </div>
              <div className="rent-form-row">
                <div className="rent-form-group">
                  <label className="rent-form-label">{t('saleDeals.labelAskingPrice')}</label>
                  <input className="rent-form-input" type="number" value={form.asking_price} onChange={setField('asking_price')} />
                </div>
                <div className="rent-form-group">
                  <label className="rent-form-label">{t('saleDeals.colSize')}</label>
                  <input className="rent-form-input" type="number" value={form.size_sqm} onChange={setField('size_sqm')} />
                </div>
              </div>
              <div className="rent-form-row">
                <div className="rent-form-group">
                  <label className="rent-form-label">{t('saleDeals.labelBedrooms')}</label>
                  <input className="rent-form-input" type="number" value={form.bedrooms} onChange={setField('bedrooms')} />
                </div>
                <div className="rent-form-group">
                  <label className="rent-form-label">{t('saleDeals.labelBathrooms')}</label>
                  <input className="rent-form-input" type="number" value={form.bathrooms} onChange={setField('bathrooms')} />
                </div>
              </div>
              <div className="rent-form-row">
                <div className="rent-form-group">
                  <label className="rent-form-label">{t('saleDeals.labelAddress')}</label>
                  <input className="rent-form-input" value={form.address} onChange={setField('address')} />
                </div>
              </div>
            </div>
            <div className="rent-modal__footer">
              <button className="rent-btn rent-btn--secondary" onClick={() => onOpenChange(false)}>{t('common.cancel')}</button>
              <button className="rent-btn rent-btn--primary" onClick={handleCreate} disabled={submitting}>{submitting ? t('saleDeals.btnPublishing') : t('saleDeals.btnPublish')}</button>
            </div>
          </div>
        </div>
      )}

      {valOpen && (
        <div className="rent-modal-backdrop" onClick={() => setValOpen(null)}>
          <div className="rent-modal" style={{ width: 520 }} onClick={(e) => e.stopPropagation()}>
            <div className="rent-modal__header">
              <h3 className="rent-card__title">{t('saleDeals.modalAvmTitle', { name: valOpen.listing.title || shortId(valOpen.listing.id) })}</h3>
            </div>
            <div className="rent-modal__body">
              <label className="rent-form-label">{t('saleDeals.labelValuationRecords')}</label>
              <div className="rent-table-wrap" style={{ marginBottom: 16 }}>
                <table className="rent-table">
                  <thead><tr><th>{t('saleDeals.colMethod')}</th><th style={{ textAlign: 'right' }}>{t('saleDeals.colValuation')}</th><th style={{ textAlign: 'right' }}>{t('saleDeals.colLowHigh')}</th><th>{t('saleDeals.colConfidence')}</th></tr></thead>
                  <tbody>
                    {valOpen.items.length === 0 ? (
                      <tr><td colSpan={4} className="rent-text-muted rent-text-center">{t('saleDeals.emptyValuations')}</td></tr>
                    ) : valOpen.items.map((v: any) => (
                      <tr key={v.id}>
                        <td>{v.method || 'blended'}</td>
                        <td className="rent-num">{fmtMoney(v.market_value)}</td>
                        <td className="rent-num">{v.low_estimate != null ? fmtMoney(v.low_estimate) : '—'} / {v.high_estimate != null ? fmtMoney(v.high_estimate) : '—'}</td>
                        <td>{v.confidence ?? 50}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ValuationForm listingId={valOpen.listing.id} defaultForm={valForm} onDone={() => { setValOpen(null) }} />
            </div>
          </div>
        </div>
      )}
    </>
  )
}

const ValuationForm = ({ listingId, defaultForm, onDone }: { listingId: string; defaultForm: any; onDone: () => void }) => {
  const { t } = useTranslation()
  const [form, setForm] = useState<any>({ ...defaultForm })
  const [submitting, setSubmitting] = useState(false)
  const setField = (k: string) => (e: any) => setForm((f: any) => ({ ...f, [k]: e.target.value }))

  const handleAdd = async () => {
    if (!form.market_value) {
      message.error(t('saleDeals.errValuationRequired'))
      return
    }
    setSubmitting(true)
    try {
      await saleListingApi.addValuation(listingId, {
        method: 'blended',
        market_value: Number(form.market_value),
        low_estimate: form.low ? Number(form.low) : undefined,
        high_estimate: form.high ? Number(form.high) : undefined,
        confidence: Number(form.confidence || 50),
      })
      message.success(t('saleDeals.msgValuationSubmitted'))
      onDone()
    } catch (e: any) {
      message.error(e?.response?.data?.message || t('saleDeals.errValuationFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <label className="rent-form-label">{t('saleDeals.labelAddValuation')}</label>
      <div className="rent-form-row">
        <div className="rent-form-group"><input className="rent-form-input" type="number" placeholder={t('saleDeals.phValuation')} value={form.market_value} onChange={setField('market_value')} /></div>
        <div className="rent-form-group"><input className="rent-form-input" type="number" placeholder={t('saleDeals.phLow')} value={form.low} onChange={setField('low')} /></div>
      </div>
      <div className="rent-form-row">
        <div className="rent-form-group"><input className="rent-form-input" type="number" placeholder={t('saleDeals.phHigh')} value={form.high} onChange={setField('high')} /></div>
        <div className="rent-form-group"><input className="rent-form-input" type="number" placeholder={t('saleDeals.phConfidence')} value={form.confidence} onChange={setField('confidence')} /></div>
      </div>
      <div className="rent-flex rent-gap-2" style={{ marginTop: 12 }}>
        <button className="rent-btn rent-btn--primary rent-btn--sm" onClick={handleAdd} disabled={submitting}>{submitting ? t('common.submitting') : t('saleDeals.btnSubmitValuation')}</button>
      </div>
    </div>
  )
}

/* ===== 产权成交 Tab ===== */
const DealTab = () => {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [listings, setListings] = useState<Listing[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState<any>({ sale_listing_id: '', sale_price: '', currency: 'THB', buyer_user_id: '', sales_user_id: '', notes: '' })

  // 成交列表：按筛选/页码缓存
  const dealsQ = useCachedQuery<{ items: Deal[]; total: number }>({
    queryKey: ['property-deals', String(page), status],
    cacheKey: `property-deals:${page}:${status}`,
    queryFn: async () => {
      const res = await propertyDealApi.list({ page, pageSize: 10, status: status || undefined })
      const payload = res.data?.data ?? res.data
      return { items: payload?.items ?? [], total: payload?.total ?? 0 }
    },
  })
  const items = dealsQ.data?.items ?? []
  const total = dealsQ.data?.total ?? 0
  const loading = dealsQ.isPending && !dealsQ.data
  const refresh = () => { void dealsQ.refetch({ cancelRefetch: false }) }

  useEffect(() => {
    if (dealsQ.isError) message.error((dealsQ.error as any)?.response?.data?.message || t('saleDeals.errFetchDeals'))
  }, [dealsQ.isError, dealsQ.error])

  const loadListings = async () => {
    try {
      const res = await saleListingApi.list({ pageSize: 100, status: 'active' })
      const payload = res.data?.data ?? res.data
      setListings(payload?.items ?? [])
    } catch { /* 忽略 */ }
  }

  const handleCreate = async () => {
    if (!form.sale_listing_id || !form.sale_price) {
      message.error(t('saleDeals.errDealRequired'))
      return
    }
    setSubmitting(true)
    try {
      await propertyDealApi.create({
        sale_listing_id: form.sale_listing_id,
        sale_price: Number(form.sale_price),
        currency: form.currency || 'THB',
        buyer_user_id: form.buyer_user_id || undefined,
        sales_user_id: form.sales_user_id || undefined,
        notes: form.notes || undefined,
      })
      message.success(t('saleDeals.msgDealCreated'))
      setCreateOpen(false)
      refresh()
    } catch (e: any) {
      message.error(e?.response?.data?.message || t('saleDeals.errCreateFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  const setField = (k: string) => (e: any) => setForm((f: any) => ({ ...f, [k]: e.target.value }))

  const changeStatus = async (id: string, s: string) => {
    try {
      await propertyDealApi.updateStatus(id, s)
      message.success(t('saleDeals.msgStatusAdvanced'))
      refresh()
    } catch (e: any) {
      message.error(e?.response?.data?.message || t('saleDeals.errAdvanceFailed'))
    }
  }

  return (
    <>
      <div className="rent-filter-bar">
        <select className="rent-form-select" style={{ width: 'auto', minWidth: 130 }} aria-label={t('saleDeals.colStatus')} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
          <option value="">{t('saleDeals.allStatuses')}</option>
          {Object.keys(DEAL_STATUS).map((k) => <option key={k} value={k}>{t(DEAL_STATUS[k].label)}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <button className="rent-btn rent-btn--primary rent-btn--sm" onClick={() => { loadListings(); setCreateOpen(true) }}>{t('saleDeals.btnNewDeal')}</button>
      </div>

      <div className="rent-card">
        <div className="rent-card__header"><h3 className="rent-card__title">{t('saleDeals.cardDeals')}</h3><span className="rent-badge rent-badge--neutral">{t('saleDeals.totalCount', { count: total })}</span></div>
        <div className="rent-card__body" style={{ padding: 0 }}>
          {loading ? (
            <div className="rent-empty rent-text-muted">{t('common.loading')}</div>
          ) : items.length === 0 ? (
            <div className="rent-empty rent-text-muted">{t('saleDeals.emptyDeals')}</div>
          ) : (
            <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
              <table className="rent-table">
                <thead><tr><th>{t('saleDeals.colDealId')}</th><th>{t('saleDeals.colListingId')}</th><th style={{ textAlign: 'right' }}>{t('saleDeals.colSalePrice')}</th><th>{t('saleDeals.colCurrency')}</th><th>{t('saleDeals.colStatus')}</th><th>{t('saleDeals.colNotes')}</th><th>{t('saleDeals.colAction')}</th></tr></thead>
                <tbody>
                  {items.map((d) => {
                    const st = DEAL_STATUS[d.status || 'drafted'] || DEAL_STATUS.drafted
                    return (
                      <tr key={d.id}>
                        <td><span className="rent-mono">{shortId(d.id)}</span></td>
                        <td><span className="rent-mono">{shortId(d.sale_listing_id)}</span></td>
                        <td className="rent-num">{fmtMoney(d.sale_price)}</td>
                        <td>{d.currency || '—'}</td>
                        <td><span className={`rent-badge ${st.badge}`}>{t(st.label)}</span></td>
                        <td>{d.notes || '—'}</td>
                        <td>
                          <select className="rent-form-select" style={{ width: 110, minWidth: 110 }} aria-label={t('saleDeals.labelAdvanceStatus')} value="" onChange={(e) => e.target.value && changeStatus(d.id, e.target.value)}>
                            <option value="">{t('saleDeals.labelAdvanceStatus')}</option>
                            {Object.keys(DEAL_STATUS).map((k) => <option key={k} value={k}>{t(DEAL_STATUS[k].label)}</option>)}
                          </select>
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

      <div className="rent-pagination">
        <span className="rent-pagination__info">{t('saleDeals.totalCount', { count: total })}</span>
        <button className="rent-pagination__btn" onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1}>{t('saleDeals.prevPage')}</button>
        <span className="rent-pagination__info">{page}</span>
        <button className="rent-pagination__btn" onClick={() => setPage(page + 1)} disabled={page * 10 >= total}>{t('saleDeals.nextPage')}</button>
      </div>

      {createOpen && (
        <div className="rent-modal-backdrop" onClick={() => setCreateOpen(false)}>
          <div className="rent-modal" style={{ width: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="rent-modal__header"><h3 className="rent-card__title">{t('saleDeals.modalNewDeal')}</h3></div>
            <div className="rent-modal__body">
              <div className="rent-form-row">
                <div className="rent-form-group" style={{ flex: 1 }}>
                  <label className="rent-form-label">{t('saleDeals.labelListing')}</label>
                  <select className="rent-form-select" value={form.sale_listing_id} onChange={setField('sale_listing_id')}>
                    <option value="">{t('saleDeals.phSelectListing')}</option>
                    {listings.map((l) => <option key={l.id} value={l.id}>{l.title || shortId(l.id)}</option>)}
                  </select>
                </div>
              </div>
              <div className="rent-form-row">
                <div className="rent-form-group"><label className="rent-form-label">{t('saleDeals.labelSalePrice')}</label><input className="rent-form-input" type="number" value={form.sale_price} onChange={setField('sale_price')} /></div>
                <div className="rent-form-group"><label className="rent-form-label">{t('saleDeals.colCurrency')}</label><input className="rent-form-input" value={form.currency} onChange={setField('currency')} /></div>
              </div>
              <div className="rent-form-row">
                <div className="rent-form-group"><label className="rent-form-label">{t('saleDeals.labelBuyerId')}</label><input className="rent-form-input" value={form.buyer_user_id} onChange={setField('buyer_user_id')} /></div>
                <div className="rent-form-group"><label className="rent-form-label">{t('saleDeals.labelSalesId')}</label><input className="rent-form-input" value={form.sales_user_id} onChange={setField('sales_user_id')} /></div>
              </div>
              <div className="rent-form-row">
                <div className="rent-form-group"><label className="rent-form-label">{t('saleDeals.colNotes')}</label><textarea className="rent-form-textarea" rows={2} value={form.notes} onChange={setField('notes')} /></div>
              </div>
            </div>
            <div className="rent-modal__footer">
              <button className="rent-btn rent-btn--secondary" onClick={() => setCreateOpen(false)}>{t('common.cancel')}</button>
              <button className="rent-btn rent-btn--primary" onClick={handleCreate} disabled={submitting}>{submitting ? t('saleDeals.btnCreating') : t('saleDeals.btnCreate')}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/* ===== 定金托管 Tab ===== */
const EscrowTab = () => {
  const { t } = useTranslation()
  const [dealId, setDealId] = useState('')
  const [registerOpen, setRegisterOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState<any>({ amount: '', currency: 'THB' })

  // 成交下拉：缓存优先；首次加载后自动选中第一条（与原行为一致）
  const dealsQ = useCachedQuery<Deal[]>({
    queryKey: ['property-deals', 'options'],
    cacheKey: 'property-deals:options',
    queryFn: async () => {
      const res = await propertyDealApi.list({ page: 1, pageSize: 100 })
      const payload = res.data?.data ?? res.data
      return payload?.items ?? []
    },
  })
  const deals = dealsQ.data ?? []

  useEffect(() => {
    if (!dealId && deals.length > 0) setDealId(deals[0].id)
  }, [dealId, deals])

  useEffect(() => {
    if (dealsQ.isError) message.error((dealsQ.error as any)?.response?.data?.message || t('saleDeals.errFetchDeals'))
  }, [dealsQ.isError, dealsQ.error])

  // 托管记录：按所选成交缓存
  const escrowsQ = useCachedQuery<Escrow[]>({
    queryKey: ['deal-escrows', dealId],
    cacheKey: `deal-escrows:${dealId}`,
    enabled: !!dealId,
    queryFn: async () => {
      const res = await propertyDealApi.listEscrows(dealId)
      return res.data ?? []
    },
  })
  const escrows = escrowsQ.data ?? []
  const refreshEscrows = () => { void escrowsQ.refetch({ cancelRefetch: false }) }

  useEffect(() => {
    if (escrowsQ.isError) message.error((escrowsQ.error as any)?.response?.data?.message || t('saleDeals.errFetchEscrows'))
  }, [escrowsQ.isError, escrowsQ.error])

  const handleRegister = async () => {
    if (!form.amount) {
      message.error(t('saleDeals.errEscrowAmountRequired'))
      return
    }
    setSubmitting(true)
    try {
      await propertyDealApi.createEscrow({ deal_id: dealId, amount: Number(form.amount), currency: form.currency || 'THB' })
      message.success(t('saleDeals.msgEscrowRegistered'))
      setRegisterOpen(false)
      setForm({ amount: '', currency: 'THB' })
      refreshEscrows()
    } catch (e: any) {
      message.error(e?.response?.data?.message || t('saleDeals.errRegisterFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  const act = async (id: string, type: 'release' | 'refund') => {
    try {
      if (type === 'release') await propertyDealApi.releaseEscrow(id)
      else await propertyDealApi.refundEscrow(id)
      message.success(type === 'release' ? t('saleDeals.msgReleasedSeller') : t('saleDeals.msgRefundedBuyer'))
      refreshEscrows()
    } catch (e: any) {
      message.error(e?.response?.data?.message || t('saleDeals.errOpFailed'))
    }
  }

  const setField = (k: string) => (e: any) => setForm((f: any) => ({ ...f, [k]: e.target.value }))

  return (
    <>
      <div className="rent-filter-bar">
        <select className="rent-form-select" aria-label={t('saleDeals.labelDeal')} style={{ width: 'auto', minWidth: 220 }} value={dealId} onChange={(e) => setDealId(e.target.value)}>
          <option value="" disabled>{t('saleDeals.phSelectDeal')}</option>
          {deals.map((d) => <option key={d.id} value={d.id}>{t('saleDeals.dealOption', { id: shortId(d.id) })} · {d.currency || '-'}{fmtMoney(d.sale_price)}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <button className="rent-btn rent-btn--primary rent-btn--sm" onClick={() => setRegisterOpen(true)} disabled={!dealId}>{t('saleDeals.btnRegisterEscrow')}</button>
      </div>

      <div className="rent-card">
        <div className="rent-card__header"><h3 className="rent-card__title">{t('saleDeals.cardEscrows')}</h3><span className="rent-badge rent-badge--neutral">{t('saleDeals.countUnit', { count: escrows.length })}</span></div>
        <div className="rent-card__body" style={{ padding: 0 }}>
          {escrows.length === 0 ? (
            <div className="rent-empty rent-text-muted">{t('saleDeals.emptyEscrows')}</div>
          ) : (
            <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
              <table className="rent-table">
                <thead><tr><th>{t('saleDeals.colEscrowId')}</th><th style={{ textAlign: 'right' }}>{t('saleDeals.colAmount')}</th><th>{t('saleDeals.colCurrency')}</th><th>{t('saleDeals.colStatus')}</th><th>{t('saleDeals.colDepositedAt')}</th><th>{t('saleDeals.colAction')}</th></tr></thead>
                <tbody>
                  {escrows.map((e) => {
                    const st = ESCROW_STATUS[e.status || 'deposited'] || ESCROW_STATUS.deposited
                    const actionable = e.status === 'deposited' || e.status === 'held'
                    return (
                      <tr key={e.id}>
                        <td><span className="rent-mono">{shortId(e.id)}</span></td>
                        <td className="rent-num">{fmtMoney(e.amount)}</td>
                        <td>{e.currency || '—'}</td>
                        <td><span className={`rent-badge ${st.badge}`}>{t(st.label)}</span></td>
                        <td className="rent-table__mono">{e.deposited_at ? String(e.deposited_at).slice(0, 10) : '—'}</td>
                        <td>
                          <div className="rent-flex rent-gap-2">
                            {actionable && (
                              <>
                                <button className="rent-btn rent-btn--primary rent-btn--sm" onClick={() => act(e.id, 'release')}>{t('saleDeals.btnRelease')}</button>
                                <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => act(e.id, 'refund')}>{t('saleDeals.btnRefund')}</button>
                              </>
                            )}
                          </div>
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

      {registerOpen && (
        <div className="rent-modal-backdrop" onClick={() => setRegisterOpen(false)}>
          <div className="rent-modal" style={{ width: 400 }} onClick={(e) => e.stopPropagation()}>
            <div className="rent-modal__header"><h3 className="rent-card__title">{t('saleDeals.modalRegisterEscrow')}</h3></div>
            <div className="rent-modal__body">
              <div className="rent-form-row">
                <div className="rent-form-group"><label className="rent-form-label">{t('saleDeals.labelEscrowAmount')}</label><input className="rent-form-input" type="number" value={form.amount} onChange={setField('amount')} /></div>
                <div className="rent-form-group"><label className="rent-form-label">{t('saleDeals.colCurrency')}</label><input className="rent-form-input" value={form.currency} onChange={setField('currency')} /></div>
              </div>
            </div>
            <div className="rent-modal__footer">
              <button className="rent-btn rent-btn--secondary" onClick={() => setRegisterOpen(false)}>{t('common.cancel')}</button>
              <button className="rent-btn rent-btn--primary" onClick={handleRegister} disabled={submitting}>{submitting ? t('saleDeals.btnRegistering') : t('saleDeals.btnRegister')}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/* ===== 按揭 Tab ===== */
const MortgageTab = () => {
  const { t } = useTranslation()
  const [deals, setDeals] = useState<Deal[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState<any>({ bank: '', loan_amount: '', currency: 'THB', term_months: '360', deal_id: '', buyer_user_id: '' })

  // 按揭列表：缓存优先渲染 + 后台刷新
  const mortgagesQ = useCachedQuery<Mortgage[]>({
    queryKey: ['my-mortgages'],
    cacheKey: 'my-mortgages',
    queryFn: async () => {
      const res = await propertyDealApi.myMortgages()
      return res.data ?? []
    },
  })
  const items = mortgagesQ.data ?? []
  const loading = mortgagesQ.isPending && !mortgagesQ.data
  const refresh = () => { void mortgagesQ.refetch({ cancelRefetch: false }) }

  useEffect(() => {
    if (mortgagesQ.isError) message.error((mortgagesQ.error as any)?.response?.data?.message || t('saleDeals.errFetchMortgages'))
  }, [mortgagesQ.isError, mortgagesQ.error])

  const loadDeals = async () => {
    try {
      const res = await propertyDealApi.list({ page: 1, pageSize: 100 })
      const payload = res.data?.data ?? res.data
      setDeals(payload?.items ?? [])
    } catch { /* 忽略 */ }
  }

  const setField = (k: string) => (e: any) => setForm((f: any) => ({ ...f, [k]: e.target.value }))

  const handleCreate = async () => {
    if (!form.bank || !form.loan_amount) {
      message.error(t('saleDeals.errBankAmountRequired'))
      return
    }
    setSubmitting(true)
    try {
      await propertyDealApi.createMortgage({
        bank: form.bank,
        loan_amount: Number(form.loan_amount),
        currency: form.currency || 'THB',
        term_months: Number(form.term_months || 360),
        deal_id: form.deal_id || undefined,
        buyer_user_id: form.buyer_user_id || undefined,
      })
      message.success(t('saleDeals.msgMortgageSubmitted'))
      setCreateOpen(false)
      setForm({ bank: '', loan_amount: '', currency: 'THB', term_months: '360', deal_id: '', buyer_user_id: '' })
      refresh()
    } catch (e: any) {
      message.error(e?.response?.data?.message || t('saleDeals.errSubmitFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  const approve = async (id: string, status: string) => {
    try {
      await propertyDealApi.updateMortgageStatus(id, status)
      message.success(t('saleDeals.msgMortgageUpdated'))
      refresh()
    } catch (e: any) {
      message.error(e?.response?.data?.message || t('saleDeals.errApproveFailed'))
    }
  }

  return (
    <>
      <div className="rent-filter-bar">
        <span className="rent-text-muted">{t('saleDeals.mortgagesOwned')}</span>
        <div style={{ flex: 1 }} />
        <button className="rent-btn rent-btn--primary rent-btn--sm" onClick={() => { loadDeals(); setCreateOpen(true) }}>{t('saleDeals.btnSubmitApplication')}</button>
      </div>

      <div className="rent-card">
        <div className="rent-card__header"><h3 className="rent-card__title">{t('saleDeals.cardMortgages')}</h3><span className="rent-badge rent-badge--neutral">{t('saleDeals.countUnit', { count: items.length })}</span></div>
        <div className="rent-card__body" style={{ padding: 0 }}>
          {loading ? (
            <div className="rent-empty rent-text-muted">{t('common.loading')}</div>
          ) : items.length === 0 ? (
            <div className="rent-empty rent-text-muted">{t('saleDeals.emptyMortgages')}</div>
          ) : (
            <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
              <table className="rent-table">
                <thead><tr><th>{t('saleDeals.colBank')}</th><th style={{ textAlign: 'right' }}>{t('saleDeals.colLoanAmount')}</th><th>{t('saleDeals.colCurrency')}</th><th>{t('saleDeals.colTerm')}</th><th>{t('saleDeals.colStatus')}</th><th>{t('saleDeals.colAction')}</th></tr></thead>
                <tbody>
                  {items.map((m) => {
                    const st = MORTGAGE_STATUS[m.status || 'applied'] || MORTGAGE_STATUS.applied
                    const pending = m.status === 'applied' || m.status === 'under_review' || m.status === 'pre_approved'
                    return (
                      <tr key={m.id}>
                        <td>{m.bank || '—'}</td>
                        <td className="rent-num">{fmtMoney(m.loan_amount)}</td>
                        <td>{m.currency || '—'}</td>
                        <td>{m.term_months ?? '—'}</td>
                        <td><span className={`rent-badge ${st.badge}`}>{t(st.label)}</span></td>
                        <td>
                          {pending && (
                            <div className="rent-flex rent-gap-2">
                              <button className="rent-btn rent-btn--primary rent-btn--sm" onClick={() => approve(m.id, 'approved')}>{t('saleDeals.btnApprove')}</button>
                              <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => approve(m.id, 'rejected')}>{t('saleDeals.btnReject')}</button>
                            </div>
                          )}
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

      {createOpen && (
        <div className="rent-modal-backdrop" onClick={() => setCreateOpen(false)}>
          <div className="rent-modal" style={{ width: 460 }} onClick={(e) => e.stopPropagation()}>
            <div className="rent-modal__header"><h3 className="rent-card__title">{t('saleDeals.modalMortgage')}</h3></div>
            <div className="rent-modal__body">
              <div className="rent-form-row">
                <div className="rent-form-group"><label className="rent-form-label">{t('saleDeals.labelBank')}</label><input className="rent-form-input" value={form.bank} onChange={setField('bank')} /></div>
                <div className="rent-form-group"><label className="rent-form-label">{t('saleDeals.labelLoanAmount')}</label><input className="rent-form-input" type="number" value={form.loan_amount} onChange={setField('loan_amount')} /></div>
              </div>
              <div className="rent-form-row">
                <div className="rent-form-group"><label className="rent-form-label">{t('saleDeals.colCurrency')}</label><input className="rent-form-input" value={form.currency} onChange={setField('currency')} /></div>
                <div className="rent-form-group"><label className="rent-form-label">{t('saleDeals.colTerm')}</label><input className="rent-form-input" type="number" value={form.term_months} onChange={setField('term_months')} /></div>
              </div>
              <div className="rent-form-row">
                <div className="rent-form-group" style={{ flex: 1 }}>
                  <label className="rent-form-label">{t('saleDeals.labelLinkedDeal')}</label>
                  <select className="rent-form-select" value={form.deal_id} onChange={setField('deal_id')}>
                    <option value="">{t('saleDeals.optNoLink')}</option>
                    {deals.map((d) => <option key={d.id} value={d.id}>{t('saleDeals.dealOption', { id: shortId(d.id) })}</option>)}
                  </select>
                </div>
                <div className="rent-form-group" style={{ flex: 1 }}>
                  <label className="rent-form-label">{t('saleDeals.labelBuyerId')}</label>
                  <input className="rent-form-input" value={form.buyer_user_id} onChange={setField('buyer_user_id')} />
                </div>
              </div>
            </div>
            <div className="rent-modal__footer">
              <button className="rent-btn rent-btn--secondary" onClick={() => setCreateOpen(false)}>{t('common.cancel')}</button>
              <button className="rent-btn rent-btn--primary" onClick={handleCreate} disabled={submitting}>{submitting ? t('common.submitting') : t('saleDeals.btnSubmit')}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default SaleDeals
