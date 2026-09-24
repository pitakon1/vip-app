import { useCallback, useEffect, useMemo, useState } from 'react'
import { message } from 'antd'
import { marketApi } from '@/services/api'
import { useTranslation } from 'react-i18next'

const MARKET_STATUS: Record<string, { label: string; badge: string }> = {
  active: { label: 'markets.stActive', badge: 'rent-badge--success' },
  launching: { label: 'markets.stLaunching', badge: 'rent-badge--warning' },
  paused: { label: 'markets.stPaused', badge: 'rent-badge--neutral' },
}

interface Market {
  id: string
  market_code?: string
  country_name?: string
  currency?: string
  default_language?: string
  timezone?: string
  status?: string
  published?: boolean
  license_required?: boolean
  vat_rate?: number
  transfer_fee_rate?: number
}

interface Channel {
  id: string
  market_code?: string
  channel_code?: string
  channel_name?: string
  channel_type?: string
  status?: string
  supported_currency?: string
}

interface ComplianceDoc {
  id: string
  market_code?: string
  doc_type?: string
  title?: string
  language?: string
  version?: string
  effective_date?: string
}

const TABS = [
  { key: 'markets', label: 'markets.tabMarkets' },
  { key: 'channels', label: 'markets.tabChannels' },
  { key: 'compliance', label: 'markets.tabCompliance' },
]

const fmtMoney = (v?: number) => Number(v || 0).toFixed(2)

const Markets = () => {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState('markets')
  const [createOpen, setCreateOpen] = useState(false)
  return (
    <div className="rent-main">
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title">{t('markets.title')}</h2>
          <p className="rent-page-header__subtitle">
            {t('markets.subtitle')}
          </p>
        </div>
        {activeTab === 'markets' && (
          <div className="rent-page-header__actions">
            <button className="rent-btn rent-btn--primary rent-btn--sm" onClick={() => setCreateOpen(true)}>+ {t('markets.addMarket')}</button>
          </div>
        )}
      </div>

      <div className="rent-tabs">
        {TABS.map((tab) => (
          <button key={tab.key} type="button" className="rent-tab" data-active={activeTab === tab.key} onClick={() => { setActiveTab(tab.key); setCreateOpen(false) }}>
            {t(tab.label)}
          </button>
        ))}
      </div>

      {activeTab === 'markets' && <MarketsTab createOpen={createOpen} onOpenChange={setCreateOpen} />}
      {activeTab === 'channels' && <ChannelsTab />}
      {activeTab === 'compliance' && <ComplianceTab />}
    </div>
  )
}

/* ===== 市场列表 ===== */
const MarketsTab = ({ createOpen, onOpenChange }: { createOpen: boolean; onOpenChange: (v: boolean) => void }) => {
  const { t } = useTranslation()
  const [items, setItems] = useState<Market[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [publishedOnly, setPublishedOnly] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState<any>({
    market_code: '', country_name: '', currency: 'THB', default_language: 'th',
    timezone: 'Asia/Bangkok', status: 'launching', published: false,
    license_required: false, vat_rate: '', transfer_fee_rate: '', sort_order: '100',
  })

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await marketApi.list({ page, pageSize: 10, published_only: publishedOnly || undefined })
      const payload = res.data?.data ?? res.data
      setItems(payload?.items ?? [])
      setTotal(payload?.total ?? 0)
    } catch (e: any) {
      message.error(e?.response?.data?.message || t('markets.errLoadMarkets'))
    } finally {
      setLoading(false)
    }
  }, [page, publishedOnly])

  useEffect(() => { fetchData() }, [fetchData])

  // 仅基于当前页数据统计，避免引入额外接口调用
  const statusCounts = useMemo(() => {
    const c = { active: 0, launching: 0, paused: 0, published: 0 }
    items.forEach((m) => {
      if (m.status === 'active') c.active += 1
      else if (m.status === 'paused') c.paused += 1
      else c.launching += 1
      if (m.published) c.published += 1
    })
    return c
  }, [items])

  const statCards = [
    {
      label: t('markets.statTotal'),
      value: String(total),
      iconBg: 'rgba(20,184,166,0.1)',
      iconColor: 'var(--rent-primary)',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      ),
    },
    {
      label: t('markets.statActive'),
      value: String(statusCounts.active),
      iconBg: 'rgba(22,163,74,0.1)',
      iconColor: 'var(--state-success)',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      ),
    },
    {
      label: t('markets.statLaunching'),
      value: String(statusCounts.launching),
      iconBg: 'rgba(217,119,6,0.12)',
      iconColor: 'var(--state-warning)',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
        </svg>
      ),
    },
    {
      label: t('markets.statPublished'),
      value: String(statusCounts.published),
      iconBg: 'rgba(14,165,233,0.1)',
      iconColor: 'var(--state-info)',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
        </svg>
      ),
    },
  ]

  const setField = (k: string) => (e: any) => setForm((f: any) => ({ ...f, [k]: e.target.value }))

  const handleCreate = async () => {
    if (!form.market_code || !form.country_name) {
      message.error(t('markets.msgFillCodeCountry'))
      return
    }
    setSubmitting(true)
    try {
      await marketApi.create({
        market_code: form.market_code,
        country_name: form.country_name,
        currency: form.currency || 'THB',
        default_language: form.default_language || 'th',
        timezone: form.timezone || 'Asia/Bangkok',
        status: form.status,
        published: !!form.published,
        license_required: !!form.license_required,
        vat_rate: form.vat_rate ? Number(form.vat_rate) : 0,
        transfer_fee_rate: form.transfer_fee_rate ? Number(form.transfer_fee_rate) : 0,
        sort_order: form.sort_order ? Number(form.sort_order) : 100,
      })
      message.success(t('markets.msgCreated'))
      onOpenChange(false)
      setForm({ market_code: '', country_name: '', currency: 'THB', default_language: 'th', timezone: 'Asia/Bangkok', status: 'launching', published: false, license_required: false, vat_rate: '', transfer_fee_rate: '', sort_order: '100' })
      fetchData()
    } catch (e: any) {
      message.error(e?.response?.data?.message || t('markets.errCreate'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div className="rent-grid rent-grid--4 rent-mb-5">
        {statCards.map((c) => (
          <div className="rent-stat-card" key={c.label}>
            <div className="rent-stat-card__head">
              <div>
                <div className="rent-stat-card__label">{c.label}</div>
                <div className="rent-stat-card__value rent-num">{c.value}</div>
              </div>
              <div className="rent-stat-card__icon" style={{ background: c.iconBg, color: c.iconColor }}>{c.icon}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="rent-filter-bar">
        <select className="rent-form-select rent-filter-select" style={{ width: 'auto', minWidth: 140 }} aria-label={t('markets.ariaShow')} value={publishedOnly ? 'pub' : 'all'} onChange={(e) => { setPublishedOnly(e.target.value === 'pub'); setPage(1) }}>
          <option value="all">{t('markets.optAllMarkets')}</option>
          <option value="pub">{t('markets.optPublishedOnly')}</option>
        </select>
      </div>

      <div className="rent-card">
        <div className="rent-card__header"><h3 className="rent-card__title">{t('markets.tabMarkets')}</h3><span className="rent-badge rent-badge--neutral">{t('common.total')} {total} {t('common.items')}</span></div>
        <div className="rent-card__body" style={{ padding: 0 }}>
          {loading ? (
            <div className="rent-empty rent-text-muted">{t('common.loading')}</div>
          ) : items.length === 0 ? (
            <div className="rent-empty rent-text-muted">{t('markets.emptyMarkets')}</div>
          ) : (
            <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
              <table className="rent-table">
                <thead><tr><th>{t('markets.thCode')}</th><th>{t('markets.thCountry')}</th><th>{t('markets.currency')}</th><th>{t('markets.thStatus')}</th><th>{t('markets.thPublish')}</th><th style={{ textAlign: 'right' }}>{t('markets.thVat')}</th><th style={{ textAlign: 'right' }}>{t('markets.thTransferFee')}</th><th>{t('markets.thLicense')}</th></tr></thead>
                <tbody>
                  {items.map((m) => {
                    const st = MARKET_STATUS[m.status || 'launching'] || MARKET_STATUS.launching
                    return (
                      <tr key={m.id}>
                        <td><span className="rent-mono">{m.market_code || '—'}</span></td>
                        <td>{m.country_name || '—'}</td>
                        <td>{m.currency || '—'}</td>
                        <td><span className={`rent-badge ${st.badge}`}>{t(st.label)}</span></td>
                        <td>
                          {m.published
                            ? <span className="rent-badge rent-badge--success">{t('markets.published')}</span>
                            : <span className="rent-badge rent-badge--neutral">{t('markets.unpublished')}</span>}
                        </td>
                        <td className="rent-num">{fmtMoney(m.vat_rate)}</td>
                        <td className="rent-num">{fmtMoney(m.transfer_fee_rate)}</td>
                        <td>{m.license_required ? <span className="rent-badge rent-badge--warning">{t('markets.needLicense')}</span> : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="rent-pagination" style={{ marginTop: 14, padding: '0 22px 16px' }}>
            <span className="rent-pagination__info">{t('markets.pagerInfo', { total })}</span>
            <button className="rent-pagination__btn" onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1}>{t('markets.prevPage')}</button>
            <span className="rent-pagination__info">{page}</span>
            <button className="rent-pagination__btn" onClick={() => setPage(page + 1)} disabled={page * 10 >= total}>{t('markets.nextPage')}</button>
          </div>
        </div>
      </div>

      {createOpen && (
        <div className="rent-modal-backdrop" onClick={() => onOpenChange(false)}>
          <div className="rent-modal" style={{ width: 520 }} onClick={(e) => e.stopPropagation()}>
            <div className="rent-modal__header"><h3 className="rent-card__title">{t('markets.addMarket')}</h3></div>
            <div className="rent-modal__body">
              <div className="rent-form-row">
                <div className="rent-form-group"><label className="rent-form-label">{t('markets.labelMarketCodeReq')}</label><input className="rent-form-input" value={form.market_code} onChange={setField('market_code')} placeholder="TH" /></div>
                <div className="rent-form-group"><label className="rent-form-label">{t('markets.labelCountryNameReq')}</label><input className="rent-form-input" value={form.country_name} onChange={setField('country_name')} /></div>
              </div>
              <div className="rent-form-row">
                <div className="rent-form-group"><label className="rent-form-label">{t('markets.currency')}</label><input className="rent-form-input" value={form.currency} onChange={setField('currency')} /></div>
                <div className="rent-form-group"><label className="rent-form-label">{t('markets.labelDefaultLanguage')}</label>
                  <select className="rent-form-select" value={form.default_language} onChange={setField('default_language')}>
                    <option value="th">{t('markets.optThai')}</option><option value="vi">{t('markets.optVietnamese')}</option><option value="id">{t('markets.optIndonesian')}</option><option value="ms">{t('markets.optMalay')}</option><option value="zh">{t('markets.optChinese')}</option><option value="en">{t('markets.optEnglish')}</option>
                  </select>
                </div>
              </div>
              <div className="rent-form-row">
                <div className="rent-form-group"><label className="rent-form-label">{t('markets.labelTimezone')}</label><input className="rent-form-input" value={form.timezone} onChange={setField('timezone')} /></div>
                <div className="rent-form-group"><label className="rent-form-label">{t('markets.thStatus')}</label>
                  <select className="rent-form-select" value={form.status} onChange={setField('status')}>
                    <option value="launching">{t('markets.stLaunching')}</option><option value="active">{t('markets.stActive')}</option><option value="paused">{t('markets.stPaused')}</option>
                  </select>
                </div>
              </div>
              <div className="rent-form-row">
                <div className="rent-form-group"><label className="rent-form-label">{t('markets.thVat')}</label><input className="rent-form-input" type="number" value={form.vat_rate} onChange={setField('vat_rate')} /></div>
                <div className="rent-form-group"><label className="rent-form-label">{t('markets.thTransferFee')}</label><input className="rent-form-input" type="number" value={form.transfer_fee_rate} onChange={setField('transfer_fee_rate')} /></div>
              </div>
              <div className="rent-form-row">
                <div className="rent-form-group"><label className="rent-form-label">{t('markets.labelSortWeight')}</label><input className="rent-form-input" type="number" value={form.sort_order} onChange={setField('sort_order')} /></div>
                <div className="rent-flex rent-gap-4" style={{ alignItems: 'flex-end', paddingBottom: 6 }}>
                  <label className="rent-form-label" style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                    <input type="checkbox" checked={!!form.published} onChange={(e) => setForm((f: any) => ({ ...f, published: e.target.checked }))} /> {t('markets.published')}
                  </label>
                  <label className="rent-form-label" style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                    <input type="checkbox" checked={!!form.license_required} onChange={(e) => setForm((f: any) => ({ ...f, license_required: e.target.checked }))} /> {t('markets.cbLicense')}
                  </label>
                </div>
              </div>
            </div>
            <div className="rent-modal__footer">
              <button className="rent-btn rent-btn--secondary" onClick={() => onOpenChange(false)}>{t('common.cancel')}</button>
              <button className="rent-btn rent-btn--primary" onClick={handleCreate} disabled={submitting}>{submitting ? t('markets.creating') : t('markets.create')}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/* ===== 支付渠道 ===== */
const ChannelsTab = () => {
  const { t } = useTranslation()
  const [markets, setMarkets] = useState<Market[]>([])
  const [marketCode, setMarketCode] = useState('')
  const [items, setItems] = useState<Channel[]>([])
  const [loading, setLoading] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState<any>({ channel_code: '', channel_name: '', channel_type: 'wallet', supported_currency: 'THB', merchant_id: '', sort_order: '100' })

  const loadMarkets = useCallback(async () => {
    try {
      const res = await marketApi.list({ page: 1, pageSize: 100 })
      const payload = res.data?.data ?? res.data
      const m = payload?.items ?? []
      setMarkets(m)
      if (m.length > 0) setMarketCode(m[0].market_code || '')
    } catch { /* 忽略 */ }
  }, [])

  useEffect(() => { loadMarkets() }, [loadMarkets])

  const loadChannels = useCallback(async (code: string) => {
    if (!code) { setItems([]); return }
    setLoading(true)
    try {
      const res = await marketApi.channels(code)
      setItems(res.data ?? [])
    } catch (e: any) {
      message.error(e?.response?.data?.message || t('markets.errLoadChannels'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (marketCode) loadChannels(marketCode)
  }, [marketCode, loadChannels])

  const setField = (k: string) => (e: any) => setForm((f: any) => ({ ...f, [k]: e.target.value }))

  const handleCreate = async () => {
    if (!marketCode || !form.channel_code || !form.channel_name) {
      message.error(t('markets.msgFillChannel'))
      return
    }
    setSubmitting(true)
    try {
      await marketApi.createChannel({
        market_code: marketCode,
        channel_code: form.channel_code,
        channel_name: form.channel_name,
        channel_type: form.channel_type,
        supported_currency: form.supported_currency || 'THB',
        merchant_id: form.merchant_id || undefined,
        sort_order: form.sort_order ? Number(form.sort_order) : 100,
      })
      message.success(t('markets.msgChannelSaved'))
      setCreateOpen(false)
      setForm({ channel_code: '', channel_name: '', channel_type: 'wallet', supported_currency: 'THB', merchant_id: '', sort_order: '100' })
      loadChannels(marketCode)
    } catch (e: any) {
      message.error(e?.response?.data?.message || t('markets.errConfig'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div className="rent-filter-bar">
        <select className="rent-form-select" aria-label={t('markets.ariaMarket')} style={{ width: 'auto', minWidth: 160 }} value={marketCode} onChange={(e) => setMarketCode(e.target.value)}>
          {markets.length === 0 && <option value="">{t('markets.noMarkets')}</option>}
          {markets.map((m) => <option key={m.id} value={m.market_code}>{m.market_code} · {m.country_name}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <button className="rent-btn rent-btn--primary rent-btn--sm" onClick={() => setCreateOpen(true)} disabled={!marketCode}>+ {t('markets.addChannel')}</button>
      </div>

      <div className="rent-card">
        <div className="rent-card__header"><h3 className="rent-card__title">{t('markets.cardLocalChannels')} · {marketCode || '—'}</h3><span className="rent-badge rent-badge--neutral">{items.length} {t('common.items')}</span></div>
        <div className="rent-card__body" style={{ padding: 0 }}>
          {loading ? (
            <div className="rent-empty rent-text-muted">{t('common.loading')}</div>
          ) : items.length === 0 ? (
            <div className="rent-empty rent-text-muted">{t('markets.emptyChannels')}</div>
          ) : (
            <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
              <table className="rent-table">
                <thead><tr><th>{t('markets.thChannelCode')}</th><th>{t('markets.thChannelName')}</th><th>{t('markets.thType')}</th><th>{t('markets.thStatus')}</th><th>{t('markets.thSupportedCurrency')}</th></tr></thead>
                <tbody>
                  {items.map((c) => (
                    <tr key={c.id}>
                      <td><span className="rent-mono">{c.channel_code || '—'}</span></td>
                      <td>{c.channel_name || '—'}</td>
                      <td>{c.channel_type || '—'}</td>
                      <td>{c.status === 'active' ? <span className="rent-badge rent-badge--success">{t('markets.enabled')}</span> : <span className="rent-badge rent-badge--neutral">{t('markets.disabled')}</span>}</td>
                      <td>{c.supported_currency || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {createOpen && (
        <div className="rent-modal-backdrop" onClick={() => setCreateOpen(false)}>
          <div className="rent-modal" style={{ width: 460 }} onClick={(e) => e.stopPropagation()}>
            <div className="rent-modal__header"><h3 className="rent-card__title">{t('markets.modalConfigChannel')} · {marketCode}</h3></div>
            <div className="rent-modal__body">
              <div className="rent-form-row">
                <div className="rent-form-group"><label className="rent-form-label">{t('markets.labelChannelCodeReq')}</label><input className="rent-form-input" value={form.channel_code} onChange={setField('channel_code')} placeholder="promptpay/paynow" /></div>
                <div className="rent-form-group"><label className="rent-form-label">{t('markets.labelChannelNameReq')}</label><input className="rent-form-input" value={form.channel_name} onChange={setField('channel_name')} /></div>
              </div>
              <div className="rent-form-row">
                <div className="rent-form-group"><label className="rent-form-label">{t('markets.thType')}</label>
                  <select className="rent-form-select" value={form.channel_type} onChange={setField('channel_type')}>
                    <option value="wallet">{t('markets.optWallet')}</option><option value="bank_transfer">{t('markets.optBankTransfer')}</option><option value="qr">{t('markets.optQr')}</option><option value="installment">{t('markets.optInstallment')}</option>
                  </select>
                </div>
                <div className="rent-form-group"><label className="rent-form-label">{t('markets.thSupportedCurrency')}</label><input className="rent-form-input" value={form.supported_currency} onChange={setField('supported_currency')} /></div>
              </div>
              <div className="rent-form-row">
                <div className="rent-form-group" style={{ flex: 1 }}><label className="rent-form-label">{t('markets.labelMerchantId')}</label><input className="rent-form-input" value={form.merchant_id} onChange={setField('merchant_id')} /></div>
                <div className="rent-form-group"><label className="rent-form-label">{t('markets.labelSort')}</label><input className="rent-form-input" type="number" value={form.sort_order} onChange={setField('sort_order')} /></div>
              </div>
            </div>
            <div className="rent-modal__footer">
              <button className="rent-btn rent-btn--secondary" onClick={() => setCreateOpen(false)}>{t('common.cancel')}</button>
              <button className="rent-btn rent-btn--primary" onClick={handleCreate} disabled={submitting}>{submitting ? t('markets.saving') : t('markets.save')}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/* ===== 合规文档 ===== */
const ComplianceTab = () => {
  const { t } = useTranslation()
  const [markets, setMarkets] = useState<Market[]>([])
  const [marketCode, setMarketCode] = useState('')
  const [items, setItems] = useState<ComplianceDoc[]>([])
  const [loading, setLoading] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState<any>({ doc_type: 'contract_template', title: '', language: 'en', version: '1.0', content: '' })

  const loadMarkets = useCallback(async () => {
    try {
      const res = await marketApi.list({ page: 1, pageSize: 100 })
      const payload = res.data?.data ?? res.data
      const m = payload?.items ?? []
      setMarkets(m)
      if (m.length > 0) setMarketCode(m[0].market_code || '')
    } catch { /* 忽略 */ }
  }, [])

  useEffect(() => { loadMarkets() }, [loadMarkets])

  const loadCompliance = useCallback(async (code: string) => {
    if (!code) { setItems([]); return }
    setLoading(true)
    try {
      const res = await marketApi.compliance(code)
      setItems(res.data ?? [])
    } catch (e: any) {
      message.error(e?.response?.data?.message || t('markets.errLoadCompliance'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (marketCode) loadCompliance(marketCode)
  }, [marketCode, loadCompliance])

  const setField = (k: string) => (e: any) => setForm((f: any) => ({ ...f, [k]: e.target.value }))

  const handleCreate = async () => {
    if (!marketCode || !form.title) {
      message.error(t('markets.msgFillDocTitle'))
      return
    }
    setSubmitting(true)
    try {
      await marketApi.createCompliance({
        market_code: marketCode,
        doc_type: form.doc_type,
        title: form.title,
        language: form.language || 'en',
        version: form.version || '1.0',
        content: form.content || undefined,
      })
      message.success(t('markets.msgDocArchived'))
      setCreateOpen(false)
      setForm({ doc_type: 'contract_template', title: '', language: 'en', version: '1.0', content: '' })
      loadCompliance(marketCode)
    } catch (e: any) {
      message.error(e?.response?.data?.message || t('markets.errArchive'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div className="rent-filter-bar">
        <select className="rent-form-select" aria-label={t('markets.ariaMarket')} style={{ width: 'auto', minWidth: 160 }} value={marketCode} onChange={(e) => setMarketCode(e.target.value)}>
          {markets.length === 0 && <option value="">{t('markets.noMarkets')}</option>}
          {markets.map((m) => <option key={m.id} value={m.market_code}>{m.market_code} · {m.country_name}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <button className="rent-btn rent-btn--primary rent-btn--sm" onClick={() => setCreateOpen(true)} disabled={!marketCode}>+ {t('markets.addDoc')}</button>
      </div>

      <div className="rent-card">
        <div className="rent-card__header"><h3 className="rent-card__title">{t('markets.cardComplianceDocs')} · {marketCode || '—'}</h3><span className="rent-badge rent-badge--neutral">{items.length} {t('common.items')}</span></div>
        <div className="rent-card__body" style={{ padding: 0 }}>
          {loading ? (
            <div className="rent-empty rent-text-muted">{t('common.loading')}</div>
          ) : items.length === 0 ? (
            <div className="rent-empty rent-text-muted">{t('markets.emptyCompliance')}</div>
          ) : (
            <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
              <table className="rent-table">
                <thead><tr><th>{t('markets.thType')}</th><th>{t('markets.thTitle')}</th><th>{t('markets.thLanguage')}</th><th>{t('markets.thVersion')}</th><th>{t('markets.thEffectiveDate')}</th></tr></thead>
                <tbody>
                  {items.map((d) => (
                    <tr key={d.id}>
                      <td><span className="rent-badge rent-badge--info">{d.doc_type || '—'}</span></td>
                      <td>{d.title || '—'}</td>
                      <td>{d.language || '—'}</td>
                      <td><span className="rent-mono">v{d.version || '—'}</span></td>
                      <td className="rent-table__mono">{d.effective_date ? String(d.effective_date).slice(0, 10) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {createOpen && (
        <div className="rent-modal-backdrop" onClick={() => setCreateOpen(false)}>
          <div className="rent-modal" style={{ width: 500 }} onClick={(e) => e.stopPropagation()}>
            <div className="rent-modal__header"><h3 className="rent-card__title">{t('markets.modalArchiveDoc')} · {marketCode}</h3></div>
            <div className="rent-modal__body">
              <div className="rent-form-row">
                <div className="rent-form-group" style={{ flex: 1 }}>
                  <label className="rent-form-label">{t('markets.thType')}</label>
                  <select className="rent-form-select" value={form.doc_type} onChange={setField('doc_type')}>
                    <option value="contract_template">{t('markets.optContractTemplate')}</option><option value="contract_terms">{t('markets.optContractTerms')}</option><option value="license">{t('markets.optLicense')}</option><option value="pdpa">{t('markets.optPdpa')}</option>
                  </select>
                </div>
                <div className="rent-form-group"><label className="rent-form-label">{t('markets.thLanguage')}</label><input className="rent-form-input" value={form.language} onChange={setField('language')} /></div>
              </div>
              <div className="rent-form-row">
                <div className="rent-form-group" style={{ flex: 1 }}><label className="rent-form-label">{t('markets.labelTitleReq')}</label><input className="rent-form-input" value={form.title} onChange={setField('title')} /></div>
                <div className="rent-form-group"><label className="rent-form-label">{t('markets.thVersion')}</label><input className="rent-form-input" value={form.version} onChange={setField('version')} /></div>
              </div>
              <div className="rent-form-row">
                <div className="rent-form-group" style={{ flex: 1 }}><label className="rent-form-label">{t('markets.labelContent')}</label><textarea className="rent-form-textarea" rows={3} value={form.content} onChange={setField('content')} /></div>
              </div>
            </div>
            <div className="rent-modal__footer">
              <button className="rent-btn rent-btn--secondary" onClick={() => setCreateOpen(false)}>{t('common.cancel')}</button>
              <button className="rent-btn rent-btn--primary" onClick={handleCreate} disabled={submitting}>{submitting ? t('markets.archiving') : t('markets.archive')}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default Markets