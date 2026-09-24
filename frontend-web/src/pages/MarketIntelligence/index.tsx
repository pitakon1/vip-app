import { useEffect, useState } from 'react'
import { message } from 'antd'
import { marketDataApi, leadsApi, marketApi, employeesApi } from '@/services/api'
import { useCachedQuery } from '@/lib/queryCache'
import { useTranslation } from 'react-i18next'

const SIGNAL_LEVEL: Record<string, { label: string; badge: string }> = {
  info: { label: 'marketIntelligence.lvInfo', badge: 'rent-badge--info' },
  warning: { label: 'marketIntelligence.lvWarning', badge: 'rent-badge--warning' },
  high: { label: 'marketIntelligence.lvHigh', badge: 'rent-badge--error' },
}

interface Index {
  id: string
  market_code?: string
  index_type?: string
  period?: string
  value?: number
  delta_pct?: number
  sample_count?: number
  avg_price_sqm?: number
  avg_rent?: number
  currency?: string
}

interface Report { id: string; market_code?: string; report_type?: string; area?: string; property_type?: string; period?: string; summary?: string; published_at?: string }

interface Signal {
  id: string
  signal_type?: string
  level?: string
  detail?: string
  suggested_action?: string
  triggered_at?: string
  is_resolved?: boolean
  assigned_to?: string | null
  assigned_to_name?: string | null
  assigned_at?: string | null
}

interface Match {
  id: string
  property_id?: string
  room_number?: string | null
  address?: string | null
  monthly_rent?: number | null
  currency?: string | null
  score?: number
  seen?: boolean
  notified_at?: string | null
}

const TABS = [
  { key: 'indices', label: 'marketIntelligence.tabIndices' },
  { key: 'reports', label: 'marketIntelligence.tabReports' },
  { key: 'matches', label: 'marketIntelligence.tabMatches' },
  { key: 'churn', label: 'marketIntelligence.tabChurn' },
]

// 页头主操作：按 Tab 对应各自的创建动作（智能匹配无创建入口）
const PRIMARY_ACTION: Record<string, string> = {
  indices: 'marketIntelligence.actPublishIndex',
  reports: 'marketIntelligence.actPublishReport',
  churn: 'marketIntelligence.actGenerateSignal',
}

const fmtNum = (v?: number) => Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const MarketIntelligence = () => {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState('indices')
  const [createOpen, setCreateOpen] = useState(false)
  return (
    <div className="rent-main">
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title">{t('marketIntelligence.title')}</h2>
          <p className="rent-page-header__subtitle">{t('marketIntelligence.subtitle')}</p>
        </div>
        {PRIMARY_ACTION[activeTab] && (
          <div className="rent-page-header__actions">
            <button className="rent-btn rent-btn--primary rent-btn--sm" onClick={() => setCreateOpen(true)}>+ {t(PRIMARY_ACTION[activeTab])}</button>
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

      {activeTab === 'indices' && <IndicesTab createOpen={createOpen} onOpenChange={setCreateOpen} />}
      {activeTab === 'reports' && <ReportsTab createOpen={createOpen} onOpenChange={setCreateOpen} />}
      {activeTab === 'matches' && <MatchesTab />}
      {activeTab === 'churn' && <ChurnTab createOpen={createOpen} onOpenChange={setCreateOpen} />}
    </div>
  )
}

/* ===== 市场指数 ===== */
const IndicesTab = ({ createOpen, onOpenChange }: { createOpen: boolean; onOpenChange: (v: boolean) => void }) => {
  const { t } = useTranslation()
  const [marketCode, setMarketCode] = useState('')
  const [debouncedMarketCode, setDebouncedMarketCode] = useState('')
  const [indexType, setIndexType] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState<any>({ market_code: '', index_type: 'sale', period: '', value: '', delta_pct: '', sample_count: '0', avg_price_sqm: '', avg_rent: '', currency: 'THB' })

  // 市场代码输入 300ms 防抖，仅在停顿后触发后端查询
  useEffect(() => {
    const t = setTimeout(() => setDebouncedMarketCode(marketCode), 300)
    return () => clearTimeout(t)
  }, [marketCode])

  // 指数列表：按筛选条件缓存（缓存优先渲染 + 后台刷新）
  const indicesQ = useCachedQuery<Index[]>({
    queryKey: ['market-indices', debouncedMarketCode, indexType],
    cacheKey: `market-indices:${debouncedMarketCode}:${indexType}`,
    queryFn: async () => {
      const res = await marketDataApi.indices({ market_code: debouncedMarketCode || undefined, index_type: indexType || undefined })
      return res.data ?? []
    },
  })
  const items = indicesQ.data ?? []
  const loading = indicesQ.isPending && !indicesQ.data
  const refresh = () => { void indicesQ.refetch({ cancelRefetch: false }) }

  useEffect(() => {
    if (indicesQ.isError) {
      message.error((indicesQ.error as any)?.response?.data?.message || t('marketIntelligence.errIndices'))
    }
  }, [indicesQ.isError, indicesQ.error])

  const setField = (k: string) => (e: any) => setForm((f: any) => ({ ...f, [k]: e.target.value }))

  const handleCreate = async () => {
    if (!form.market_code || !form.period || !form.value) {
      message.error(t('marketIntelligence.msgFillIndex'))
      return
    }
    setSubmitting(true)
    try {
      await marketDataApi.createIndex({
        market_code: form.market_code,
        index_type: form.index_type || 'sale',
        period: form.period,
        value: Number(form.value),
        delta_pct: form.delta_pct !== '' && form.delta_pct != null ? Number(form.delta_pct) : undefined,
        sample_count: form.sample_count ? Number(form.sample_count) : 0,
        avg_price_sqm: form.avg_price_sqm ? Number(form.avg_price_sqm) : undefined,
        avg_rent: form.avg_rent ? Number(form.avg_rent) : undefined,
        currency: form.currency || 'THB',
      })
      message.success(t('marketIntelligence.msgIndexPublished'))
      onOpenChange(false)
      setForm({ market_code: '', index_type: 'sale', period: '', value: '', delta_pct: '', sample_count: '0', avg_price_sqm: '', avg_rent: '', currency: 'THB' })
      refresh()
    } catch (e: any) {
      message.error(e?.response?.data?.message || t('marketIntelligence.errPublish'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div className="rent-filter-bar">
        <input className="rent-form-input" style={{ width: 120 }} placeholder={t('marketIntelligence.phMarketCode')} aria-label={t('marketIntelligence.phMarketCode')} value={marketCode} onChange={(e) => setMarketCode(e.target.value.toUpperCase())} />
        <select className="rent-form-select" style={{ width: 'auto', minWidth: 120 }} aria-label={t('marketIntelligence.labelType')} value={indexType} onChange={(e) => setIndexType(e.target.value)}>
          <option value="">{t('marketIntelligence.optAllTypes')}</option>
          <option value="sale">{t('marketIntelligence.optSaleIndex')}</option>
          <option value="rent">{t('marketIntelligence.optRentIndex')}</option>
        </select>
        <div style={{ flex: 1 }} />
      </div>

      <div className="rent-card">
        <div className="rent-card__header"><h3 className="rent-card__title">{t('marketIntelligence.tabIndices')}</h3><span className="rent-badge rent-badge--neutral">{items.length} {t('common.items')}</span></div>
        <div className="rent-card__body" style={{ padding: 0 }}>
          {loading ? (
            <div className="rent-empty rent-text-muted">{t('common.loading')}</div>
          ) : items.length === 0 ? (
            <div className="rent-empty rent-text-muted">{t('marketIntelligence.emptyIndices')}</div>
          ) : (
            <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
              <table className="rent-table">
                <thead><tr><th>{t('marketIntelligence.thMarket')}</th><th>{t('marketIntelligence.labelType')}</th><th>{t('marketIntelligence.thPeriod')}</th><th style={{ textAlign: 'right' }}>{t('marketIntelligence.thIndexValue')}</th><th style={{ textAlign: 'right' }}>{t('marketIntelligence.thDeltaPct')}</th><th style={{ textAlign: 'right' }}>{t('marketIntelligence.thSample')}</th><th style={{ textAlign: 'right' }}>{t('marketIntelligence.thAvgPriceSqm')}</th></tr></thead>
                <tbody>
                  {items.map((i) => (
                    <tr key={i.id}>
                      <td><span className="rent-mono">{i.market_code || '—'}</span></td>
                      <td>{i.index_type === 'sale' ? t('marketIntelligence.optSaleIndex') : i.index_type === 'rent' ? t('marketIntelligence.optRentIndex') : i.index_type || '—'}</td>
                      <td className="rent-table__mono">{i.period || '—'}</td>
                      <td className="rent-num">{fmtNum(i.value)}</td>
                      <td className="rent-num">{i.delta_pct != null ? `${i.delta_pct}%` : '—'}</td>
                      <td className="rent-num">{i.sample_count ?? 0}</td>
                      <td className="rent-num">{i.avg_price_sqm != null ? fmtNum(i.avg_price_sqm) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {createOpen && (
        <div className="rent-modal-backdrop" onClick={() => onOpenChange(false)}>
          <div className="rent-modal" style={{ width: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="rent-modal__header"><h3 className="rent-card__title">{t('marketIntelligence.modalPublishIndex')}</h3></div>
            <div className="rent-modal__body">
              <div className="rent-form-row">
                <div className="rent-form-group"><label className="rent-form-label">{t('marketIntelligence.labelMarketCodeReq')}</label><input className="rent-form-input" value={form.market_code} onChange={setField('market_code')} /></div>
                <div className="rent-form-group"><label className="rent-form-label">{t('marketIntelligence.labelPeriodReq')}</label><input className="rent-form-input" value={form.period} onChange={setField('period')} placeholder="2026-09" /></div>
              </div>
              <div className="rent-form-row">
                <div className="rent-form-group"><label className="rent-form-label">{t('marketIntelligence.labelType')}</label>
                  <select className="rent-form-select" value={form.index_type} onChange={setField('index_type')}>
                    <option value="sale">{t('marketIntelligence.optSaleIndex')}</option><option value="rent">{t('marketIntelligence.optRentIndex')}</option>
                  </select>
                </div>
                <div className="rent-form-group"><label className="rent-form-label">{t('marketIntelligence.labelCurrency')}</label><input className="rent-form-input" value={form.currency} onChange={setField('currency')} /></div>
              </div>
              <div className="rent-form-row">
                <div className="rent-form-group"><label className="rent-form-label">{t('marketIntelligence.labelIndexValueReq')}</label><input className="rent-form-input" type="number" value={form.value} onChange={setField('value')} /></div>
                <div className="rent-form-group"><label className="rent-form-label">{t('marketIntelligence.thDeltaPct')}</label><input className="rent-form-input" type="number" value={form.delta_pct} onChange={setField('delta_pct')} /></div>
              </div>
              <div className="rent-form-row">
                <div className="rent-form-group"><label className="rent-form-label">{t('marketIntelligence.thAvgPriceSqm')}</label><input className="rent-form-input" type="number" value={form.avg_price_sqm} onChange={setField('avg_price_sqm')} /></div>
                <div className="rent-form-group"><label className="rent-form-label">{t('marketIntelligence.labelSampleCount')}</label><input className="rent-form-input" type="number" value={form.sample_count} onChange={setField('sample_count')} /></div>
              </div>
            </div>
            <div className="rent-modal__footer">
              <button className="rent-btn rent-btn--secondary" onClick={() => onOpenChange(false)}>{t('common.cancel')}</button>
              <button className="rent-btn rent-btn--primary" onClick={handleCreate} disabled={submitting}>{submitting ? t('marketIntelligence.publishing') : t('marketIntelligence.publish')}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/* ===== 市场报告 ===== */
const ReportsTab = ({ createOpen, onOpenChange }: { createOpen: boolean; onOpenChange: (v: boolean) => void }) => {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState<any>({ market_code: '', report_type: 'district', area: '', property_type: '', period: '', summary: '', metrics_json: '' })

  // 报告列表：按页码缓存
  const reportsQ = useCachedQuery<{ items: Report[]; total: number }>({
    queryKey: ['market-reports', String(page)],
    cacheKey: `market-reports:${page}`,
    queryFn: async () => {
      const res = await marketDataApi.reports({ page, pageSize: 10 })
      const payload = res.data?.data ?? res.data
      return { items: payload?.items ?? [], total: payload?.total ?? 0 }
    },
  })
  const items = reportsQ.data?.items ?? []
  const total = reportsQ.data?.total ?? 0
  const loading = reportsQ.isPending && !reportsQ.data
  const refresh = () => { void reportsQ.refetch({ cancelRefetch: false }) }

  useEffect(() => {
    if (reportsQ.isError) {
      message.error((reportsQ.error as any)?.response?.data?.message || t('marketIntelligence.errReports'))
    }
  }, [reportsQ.isError, reportsQ.error])

  // 市场下拉：仅弹窗打开时按需加载
  const marketsQ = useCachedQuery<any[]>({
    queryKey: ['markets', 'options'],
    cacheKey: 'markets:options',
    enabled: createOpen,
    queryFn: async () => {
      try {
        const res = await marketApi.list({ page: 1, pageSize: 100 })
        const payload = res.data?.data ?? res.data
        return payload?.items ?? []
      } catch {
        return []
      }
    },
  })
  const markets = marketsQ.data ?? []

  const setField = (k: string) => (e: any) => setForm((f: any) => ({ ...f, [k]: e.target.value }))

  const handleCreate = async () => {
    if (!form.market_code || !form.period) {
      message.error(t('marketIntelligence.msgSelectMarketPeriod'))
      return
    }
    setSubmitting(true)
    try {
      await marketDataApi.createReport({
        market_code: form.market_code,
        report_type: form.report_type,
        area: form.area || undefined,
        property_type: form.property_type || undefined,
        period: form.period,
        summary: form.summary || undefined,
        metrics_json: form.metrics_json || undefined,
      })
      message.success(t('marketIntelligence.msgReportPublished'))
      onOpenChange(false)
      setForm({ market_code: '', report_type: 'district', area: '', property_type: '', period: '', summary: '', metrics_json: '' })
      refresh()
    } catch (e: any) {
      message.error(e?.response?.data?.message || t('marketIntelligence.errPublish'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div className="rent-filter-bar">
        <span className="rent-text-muted">{t('marketIntelligence.reportsHint')}</span>
        <div style={{ flex: 1 }} />
      </div>

      <div className="rent-card">
        <div className="rent-card__header"><h3 className="rent-card__title">{t('marketIntelligence.tabReports')}</h3><span className="rent-badge rent-badge--neutral">{t('marketIntelligence.totalReports', { total })}</span></div>
        <div className="rent-card__body" style={{ padding: 0 }}>
          {loading ? (
            <div className="rent-empty rent-text-muted">{t('common.loading')}</div>
          ) : items.length === 0 ? (
            <div className="rent-empty rent-text-muted">{t('marketIntelligence.emptyReports')}</div>
          ) : (
            <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
              <table className="rent-table">
                <thead><tr><th>{t('marketIntelligence.thMarket')}</th><th>{t('marketIntelligence.labelType')}</th><th>{t('marketIntelligence.thArea')}</th><th>{t('marketIntelligence.thPropertyType')}</th><th>{t('marketIntelligence.thPeriod')}</th><th>{t('marketIntelligence.thSummary')}</th><th>{t('marketIntelligence.thPublishedAt')}</th></tr></thead>
                <tbody>
                  {items.map((r) => (
                    <tr key={r.id}>
                      <td><span className="rent-mono">{r.market_code || '—'}</span></td>
                      <td>{r.report_type || '—'}</td>
                      <td>{r.area || '—'}</td>
                      <td>{r.property_type || '—'}</td>
                      <td className="rent-table__mono">{r.period || '—'}</td>
                      <td style={{ maxWidth: 240 }} className="rent-text-sm">{r.summary || '—'}</td>
                      <td className="rent-table__mono">{r.published_at ? String(r.published_at).slice(0, 10) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="rent-pagination">
        <span className="rent-pagination__info">{t('common.total')} {total} {t('common.items')}</span>
        <button className="rent-pagination__btn" onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1}>{t('marketIntelligence.ariaPrev')}</button>
        <span className="rent-pagination__info">{page}</span>
        <button className="rent-pagination__btn" onClick={() => setPage(page + 1)} disabled={page * 10 >= total}>{t('marketIntelligence.ariaNext')}</button>
      </div>

      {createOpen && (
        <div className="rent-modal-backdrop" onClick={() => onOpenChange(false)}>
          <div className="rent-modal" style={{ width: 500 }} onClick={(e) => e.stopPropagation()}>
            <div className="rent-modal__header"><h3 className="rent-card__title">{t('marketIntelligence.modalPublishReport')}</h3></div>
            <div className="rent-modal__body">
              <div className="rent-form-row">
                <div className="rent-form-group" style={{ flex: 1 }}>
                  <label className="rent-form-label">{t('marketIntelligence.labelMarketReq')}</label>
                  <select className="rent-form-select" value={form.market_code} onChange={setField('market_code')}>
                    <option value="">{t('marketIntelligence.optSelectMarket')}</option>
                    {markets.map((m) => <option key={m.id} value={m.market_code}>{m.market_code} · {m.country_name}</option>)}
                  </select>
                </div>
                <div className="rent-form-group"><label className="rent-form-label">{t('marketIntelligence.labelPeriodReq')}</label><input className="rent-form-input" value={form.period} onChange={setField('period')} placeholder="2026-09" /></div>
              </div>
              <div className="rent-form-row">
                <div className="rent-form-group"><label className="rent-form-label">{t('marketIntelligence.labelReportType')}</label>
                  <select className="rent-form-select" value={form.report_type} onChange={setField('report_type')}>
                    <option value="district">{t('marketIntelligence.optDistrictReport')}</option><option value="city">{t('marketIntelligence.optCityReport')}</option><option value="type">{t('marketIntelligence.thPropertyType')}</option>
                  </select>
                </div>
                <div className="rent-form-group"><label className="rent-form-label">{t('marketIntelligence.thPropertyType')}</label><input className="rent-form-input" value={form.property_type} onChange={setField('property_type')} /></div>
              </div>
              <div className="rent-form-row">
                <div className="rent-form-group" style={{ flex: 1 }}><label className="rent-form-label">{t('marketIntelligence.thArea')}</label><input className="rent-form-input" value={form.area} onChange={setField('area')} /></div>
              </div>
              <div className="rent-form-row">
                <div className="rent-form-group" style={{ flex: 1 }}><label className="rent-form-label">{t('marketIntelligence.thSummary')}</label><textarea className="rent-form-textarea" rows={3} value={form.summary} onChange={setField('summary')} /></div>
              </div>
            </div>
            <div className="rent-modal__footer">
              <button className="rent-btn rent-btn--secondary" onClick={() => onOpenChange(false)}>{t('common.cancel')}</button>
              <button className="rent-btn rent-btn--primary" onClick={handleCreate} disabled={submitting}>{submitting ? t('marketIntelligence.publishing') : t('marketIntelligence.publish')}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/* ===== 智能匹配（线索 → 房源推荐 → 推送租客） ===== */
const MatchesTab = () => {
  const { t } = useTranslation()
  const [leadId, setLeadId] = useState('')
  const [computing, setComputing] = useState(false)
  const [pushingId, setPushingId] = useState('')

  // 线索下拉：缓存优先（无权限时降级为空）
  const leadsQ = useCachedQuery<any[]>({
    queryKey: ['leads', 'options'],
    cacheKey: 'leads:options',
    queryFn: async () => {
      try {
        const res = await leadsApi.list({ page: 1, pageSize: 100 })
        const payload = res.data?.data ?? res.data
        return payload?.items ?? []
      } catch {
        return []
      }
    },
  })
  const leads = leadsQ.data ?? []

  // 匹配结果：仅在选中线索后查询，按线索缓存
  const matchesQ = useCachedQuery<Match[]>({
    queryKey: ['market-matches', leadId],
    cacheKey: `market-matches:${leadId}`,
    enabled: !!leadId,
    queryFn: async () => {
      const res = await marketDataApi.listMatches({ lead_id: leadId })
      return res.data ?? []
    },
  })
  const items = matchesQ.data ?? []
  const loading = matchesQ.isPending && !matchesQ.data
  const refresh = () => { void matchesQ.refetch({ cancelRefetch: false }) }

  useEffect(() => {
    if (matchesQ.isError) {
      message.error((matchesQ.error as any)?.response?.data?.detail || (matchesQ.error as any)?.response?.data?.message || t('marketIntelligence.errMatches'))
    }
  }, [matchesQ.isError, matchesQ.error])

  const handleCompute = async () => {
    if (!leadId) {
      message.error(t('marketIntelligence.msgSelectLead'))
      return
    }
    setComputing(true)
    try {
      const res = await marketDataApi.computeMatches({ lead_id: leadId, limit: 10 })
      message.success(t('marketIntelligence.msgMatchesGenerated', { count: res.data?.total ?? 0 }))
      await matchesQ.refetch({ cancelRefetch: false })
    } catch (e: any) {
      message.error(e?.response?.data?.detail || e?.response?.data?.message || t('marketIntelligence.errCompute'))
    } finally {
      setComputing(false)
    }
  }

  const handleNotify = async (row: Match) => {
    setPushingId(row.id)
    try {
      const res = await marketDataApi.notifyMatch(row.id)
      if (res.data?.already_notified) {
        message.info(t('marketIntelligence.msgAlreadyNotified'))
      } else {
        message.success(t('marketIntelligence.msgNotified'))
      }
      refresh()
    } catch (e: any) {
      message.error(e?.response?.data?.detail || e?.response?.data?.message || t('marketIntelligence.errPush'))
    } finally {
      setPushingId('')
    }
  }

  return (
    <>
      <div className="rent-filter-bar">
        <select className="rent-form-select" style={{ width: 'auto', minWidth: 200 }} aria-label={t('marketIntelligence.ariaLead')} value={leadId} onChange={(e) => setLeadId(e.target.value)}>
          <option value="">{t('marketIntelligence.optSelectLead')}</option>
          {leads.map((l) => <option key={l.id} value={l.id}>{l.name || l.id}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <button className="rent-btn rent-btn--primary rent-btn--sm" onClick={handleCompute} disabled={computing || !leadId}>
          {computing ? t('marketIntelligence.computing') : t('marketIntelligence.actCompute')}
        </button>
      </div>

      <div className="rent-card">
        <div className="rent-card__header">
          <h3 className="rent-card__title">{t('marketIntelligence.titleRecommend')}</h3>
          <span className="rent-badge rent-badge--neutral">{items.length} {t('common.items')}</span>
        </div>
        <div className="rent-card__body" style={{ padding: 0 }}>
          {!leadId ? (
            <div className="rent-empty rent-text-muted">{t('marketIntelligence.emptySelectLead')}</div>
          ) : loading ? (
            <div className="rent-empty rent-text-muted">{t('common.loading')}</div>
          ) : items.length === 0 ? (
            <div className="rent-empty rent-text-muted">{t('marketIntelligence.emptyNoMatches')}</div>
          ) : (
            <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
              <table className="rent-table">
                <thead><tr><th>{t('marketIntelligence.thRoomNo')}</th><th>{t('marketIntelligence.thAddress')}</th><th style={{ textAlign: 'right' }}>{t('marketIntelligence.thMonthlyRent')}</th><th style={{ textAlign: 'right' }}>{t('marketIntelligence.thScore')}</th><th>{t('marketIntelligence.thPushStatus')}</th><th>{t('common.action')}</th></tr></thead>
                <tbody>
                  {items.map((m) => (
                    <tr key={m.id}>
                      <td><span className="rent-mono">{m.room_number || '—'}</span></td>
                      <td style={{ maxWidth: 260 }} className="rent-text-sm">{m.address || '—'}</td>
                      <td className="rent-num">{m.monthly_rent != null ? `${fmtNum(m.monthly_rent)} ${m.currency || 'THB'}` : '—'}</td>
                      <td className="rent-num">{m.score ?? 0}</td>
                      <td>
                        {m.notified_at
                          ? <span className="rent-badge rent-badge--success">{t('marketIntelligence.pushedAt', { date: String(m.notified_at).slice(0, 10) })}</span>
                          : <span className="rent-badge rent-badge--neutral">{t('marketIntelligence.notPushed')}</span>}
                      </td>
                      <td>
                        <button
                          className="rent-btn rent-btn--secondary rent-btn--sm"
                          onClick={() => handleNotify(m)}
                          disabled={pushingId === m.id}
                        >
                          {pushingId === m.id ? t('marketIntelligence.pushing') : t('marketIntelligence.actPushTenant')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

/* ===== 流失预警 ===== */
const ChurnTab = ({ createOpen, onOpenChange }: { createOpen: boolean; onOpenChange: (v: boolean) => void }) => {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const [level, setLevel] = useState('')
  const [resolved, setResolved] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState<any>({ signal_type: 'lease_expiring', level: 'warning', detail: '', suggested_action: '', lead_id: '' })
  // 派发跟进
  const [employees, setEmployees] = useState<any[]>([])
  const [assignOpen, setAssignOpen] = useState(false)
  const [assignSignal, setAssignSignal] = useState<Signal | null>(null)
  const [assignForm, setAssignForm] = useState({ assignee_id: '', note: '' })
  const [assigning, setAssigning] = useState(false)

  // 流失预警信号：按筛选/页码缓存
  const signalsQ = useCachedQuery<{ items: Signal[]; total: number }>({
    queryKey: ['market-churn', String(page), level, resolved],
    cacheKey: `market-churn:${page}:${level}:${resolved}`,
    queryFn: async () => {
      const res = await marketDataApi.churnSignals({
        page, pageSize: 10,
        level: level || undefined,
        is_resolved: resolved === '' ? undefined : resolved === '1',
      })
      const payload = res.data?.data ?? res.data
      return { items: payload?.items ?? [], total: payload?.total ?? 0 }
    },
  })
  const items = signalsQ.data?.items ?? []
  const total = signalsQ.data?.total ?? 0
  const loading = signalsQ.isPending && !signalsQ.data
  const refresh = () => { void signalsQ.refetch({ cancelRefetch: false }) }

  useEffect(() => {
    if (signalsQ.isError) {
      message.error((signalsQ.error as any)?.response?.data?.message || t('marketIntelligence.errSignals'))
    }
  }, [signalsQ.isError, signalsQ.error])

  // 线索下拉：页头「生成信号」打开时按需加载（与匹配 Tab 共用缓存）
  const leadsQ = useCachedQuery<any[]>({
    queryKey: ['leads', 'options'],
    cacheKey: 'leads:options',
    enabled: createOpen,
    queryFn: async () => {
      try {
        const res = await leadsApi.list({ page: 1, pageSize: 100 })
        const payload = res.data?.data ?? res.data
        return payload?.items ?? []
      } catch {
        return []
      }
    },
  })
  const leads = leadsQ.data ?? []

  const setField = (k: string) => (e: any) => setForm((f: any) => ({ ...f, [k]: e.target.value }))

  const handleCreate = async () => {
    setSubmitting(true)
    try {
      await marketDataApi.createChurnSignal({
        signal_type: form.signal_type,
        level: form.level,
        detail: form.detail || undefined,
        suggested_action: form.suggested_action || undefined,
        user_id: form.lead_id || undefined,
      })
      message.success(t('marketIntelligence.msgSignalGenerated'))
      onOpenChange(false)
      setForm({ signal_type: 'lease_expiring', level: 'warning', detail: '', suggested_action: '', lead_id: '' })
      refresh()
    } catch (e: any) {
      message.error(e?.response?.data?.message || t('marketIntelligence.errGenerate'))
    } finally {
      setSubmitting(false)
    }
  }

  const resolve = async (id: string) => {
    try {
      await marketDataApi.resolveChurnSignal(id)
      message.success(t('marketIntelligence.msgResolved'))
      refresh()
    } catch (e: any) {
      message.error(e?.response?.data?.message || t('marketIntelligence.errResolve'))
    }
  }

  // 员工列表仅管理员可读；无权限时退化为「按租约负责员工派发」
  const openAssign = async (signal: Signal) => {
    setAssignSignal(signal)
    setAssignForm({ assignee_id: '', note: '' })
    setAssignOpen(true)
    try {
      const res = await employeesApi.list({ page: 1, pageSize: 100 })
      const payload = res.data?.data ?? res.data
      setEmployees(payload?.items ?? [])
    } catch {
      setEmployees([])
    }
  }

  const handleAssign = async () => {
    if (!assignSignal) return
    setAssigning(true)
    try {
      const res = await marketDataApi.assignChurnSignal(assignSignal.id, {
        assignee_id: assignForm.assignee_id || undefined,
        note: assignForm.note || undefined,
      })
      message.success(res.data?.reassigned ? t('marketIntelligence.msgReassigned') : t('marketIntelligence.msgAssigned'))
      setAssignOpen(false)
      refresh()
    } catch (e: any) {
      message.error(e?.response?.data?.detail || e?.response?.data?.message || t('marketIntelligence.errAssign'))
    } finally {
      setAssigning(false)
    }
  }

  const summary = items.filter((s) => !s.is_resolved).length

  return (
    <>
      <div className="rent-filter-bar">
        <select className="rent-form-select" style={{ width: 'auto', minWidth: 120 }} aria-label={t('marketIntelligence.ariaLevel')} value={level} onChange={(e) => { setLevel(e.target.value); setPage(1) }}>
          <option value="">{t('marketIntelligence.optAllLevels')}</option>
          <option value="info">{t('marketIntelligence.lvInfo')}</option><option value="warning">{t('marketIntelligence.lvWarning')}</option><option value="high">{t('marketIntelligence.lvHigh')}</option>
        </select>
        <select className="rent-form-select" style={{ width: 'auto', minWidth: 130 }} aria-label={t('marketIntelligence.ariaResolveStatus')} value={resolved} onChange={(e) => { setResolved(e.target.value); setPage(1) }}>
          <option value="">{t('common.all')}</option><option value="0">{t('marketIntelligence.optUnresolved')}</option><option value="1">{t('marketIntelligence.optResolved')}</option>
        </select>
        <div style={{ flex: 1 }} />
        <span className="rent-badge rent-badge--warning">{t('marketIntelligence.pendingCount', { count: summary })}</span>
      </div>

      <div className="rent-card">
        <div className="rent-card__header"><h3 className="rent-card__title">{t('marketIntelligence.titleChurn')}</h3><span className="rent-badge rent-badge--neutral">{t('common.total')} {total} {t('common.items')}</span></div>
        <div className="rent-card__body" style={{ padding: 0 }}>
          {loading ? (
            <div className="rent-empty rent-text-muted">{t('common.loading')}</div>
          ) : items.length === 0 ? (
            <div className="rent-empty rent-text-muted">{t('marketIntelligence.emptyChurn')}</div>
          ) : (
            <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
              <table className="rent-table">
                <thead><tr><th>{t('marketIntelligence.labelType')}</th><th>{t('marketIntelligence.ariaLevel')}</th><th>{t('marketIntelligence.thDetail')}</th><th>{t('marketIntelligence.thSuggestedAction')}</th><th>{t('marketIntelligence.thTriggeredAt')}</th><th>{t('marketIntelligence.thAssignee')}</th><th>{t('common.status')}</th><th>{t('common.action')}</th></tr></thead>
                <tbody>
                  {items.map((s) => {
                    const lv = SIGNAL_LEVEL[s.level || 'info'] || SIGNAL_LEVEL.info
                    const typeLabel = s.signal_type === 'lease_expiring' ? t('marketIntelligence.optLeaseExpiring') : s.signal_type === 'payment_delay' ? t('marketIntelligence.optPaymentDelay') : s.signal_type === 'low_engagement' ? t('marketIntelligence.optLowEngagement') : s.signal_type || '—'
                    return (
                      <tr key={s.id}>
                        <td><span className="rent-badge rent-badge--info">{typeLabel}</span></td>
                        <td><span className={`rent-badge ${lv.badge}`}>{t(lv.label)}</span></td>
                        <td style={{ maxWidth: 260 }} className="rent-text-sm">{s.detail || '—'}</td>
                        <td className="rent-text-sm">{s.suggested_action || '—'}</td>
                        <td className="rent-table__mono">{s.triggered_at ? String(s.triggered_at).slice(0, 16) : '—'}</td>
                        <td className="rent-text-sm">
                          {s.assigned_to_name || (s.assigned_to ? String(s.assigned_to).slice(0, 8) : t('marketIntelligence.unassigned'))}
                        </td>
                        <td>
                          {s.is_resolved
                            ? <span className="rent-badge rent-badge--success">{t('marketIntelligence.optResolved')}</span>
                            : <span className="rent-badge rent-badge--error">{t('marketIntelligence.optUnresolved')}</span>}
                        </td>
                        <td>
                          {!s.is_resolved && (
                            <div className="rent-flex rent-gap-2">
                              <button className="rent-btn rent-btn--secondary rent-btn--sm" onClick={() => openAssign(s)}>{t('marketIntelligence.actAssign')}</button>
                              <button className="rent-btn rent-btn--primary rent-btn--sm" onClick={() => resolve(s.id)}>{t('marketIntelligence.actMarkResolved')}</button>
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

      <div className="rent-pagination">
        <span className="rent-pagination__info">{t('common.total')} {total} {t('common.items')}</span>
        <button className="rent-pagination__btn" onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1}>{t('marketIntelligence.ariaPrev')}</button>
        <span className="rent-pagination__info">{page}</span>
        <button className="rent-pagination__btn" onClick={() => setPage(page + 1)} disabled={page * 10 >= total}>{t('marketIntelligence.ariaNext')}</button>
      </div>

      {createOpen && (
        <div className="rent-modal-backdrop" onClick={() => onOpenChange(false)}>
          <div className="rent-modal" style={{ width: 460 }} onClick={(e) => e.stopPropagation()}>
            <div className="rent-modal__header"><h3 className="rent-card__title">{t('marketIntelligence.modalGenerateSignal')}</h3></div>
            <div className="rent-modal__body">
              <div className="rent-form-row">
                <div className="rent-form-group"><label className="rent-form-label">{t('marketIntelligence.labelType')}</label>
                  <select className="rent-form-select" value={form.signal_type} onChange={setField('signal_type')}>
                    <option value="lease_expiring">{t('marketIntelligence.optLeaseExpiring')}</option><option value="payment_delay">{t('marketIntelligence.optPaymentDelay')}</option><option value="low_engagement">{t('marketIntelligence.optLowEngagement')}</option>
                  </select>
                </div>
                <div className="rent-form-group"><label className="rent-form-label">{t('marketIntelligence.ariaLevel')}</label>
                  <select className="rent-form-select" value={form.level} onChange={setField('level')}>
                    <option value="info">{t('marketIntelligence.lvInfo')}</option><option value="warning">{t('marketIntelligence.lvWarning')}</option><option value="high">{t('marketIntelligence.lvHigh')}</option>
                  </select>
                </div>
              </div>
              <div className="rent-form-row">
                <div className="rent-form-group" style={{ flex: 1 }}><label className="rent-form-label">{t('marketIntelligence.labelRelatedLead')}</label>
                  <select className="rent-form-select" value={form.lead_id} onChange={setField('lead_id')}>
                    <option value="">{t('marketIntelligence.optNotRelated')}</option>
                    {leads.map((l) => <option key={l.id} value={l.id}>{l.name || l.id}</option>)}
                  </select>
                </div>
              </div>
              <div className="rent-form-row">
                <div className="rent-form-group" style={{ flex: 1 }}><label className="rent-form-label">{t('marketIntelligence.thDetail')}</label><textarea className="rent-form-textarea" rows={3} value={form.detail} onChange={setField('detail')} /></div>
              </div>
              <div className="rent-form-row">
                <div className="rent-form-group" style={{ flex: 1 }}><label className="rent-form-label">{t('marketIntelligence.thSuggestedAction')}</label><input className="rent-form-input" value={form.suggested_action} onChange={setField('suggested_action')} /></div>
              </div>
            </div>
            <div className="rent-modal__footer">
              <button className="rent-btn rent-btn--secondary" onClick={() => onOpenChange(false)}>{t('common.cancel')}</button>
              <button className="rent-btn rent-btn--primary" onClick={handleCreate} disabled={submitting}>{submitting ? t('marketIntelligence.generating') : t('marketIntelligence.generate')}</button>
            </div>
          </div>
        </div>
      )}

      {assignOpen && assignSignal && (
        <div className="rent-modal-backdrop" onClick={() => setAssignOpen(false)}>
          <div className="rent-modal" style={{ width: 460 }} onClick={(e) => e.stopPropagation()}>
            <div className="rent-modal__header"><h3 className="rent-card__title">{t('marketIntelligence.actAssign')}</h3></div>
            <div className="rent-modal__body">
              <p className="rent-text-sm rent-text-muted" style={{ marginBottom: 12 }}>
                {assignSignal.detail || t('marketIntelligence.defaultRiskDetail')}
                {assignSignal.suggested_action ? t('marketIntelligence.suggestedActionSuffix', { action: assignSignal.suggested_action }) : ''}
              </p>
              <div className="rent-form-row">
                <div className="rent-form-group" style={{ flex: 1 }}>
                  <label className="rent-form-label">{t('marketIntelligence.labelAssignee')}</label>
                  <select
                    className="rent-form-select"
                    aria-label={t('marketIntelligence.labelAssignee')}
                    value={assignForm.assignee_id}
                    onChange={(e) => setAssignForm((f) => ({ ...f, assignee_id: e.target.value }))}
                  >
                    <option value="">{t('marketIntelligence.optAutoAssign')}</option>
                    {employees.map((e) => (
                      <option key={e.id} value={e.id}>{e.full_name || e.employee_no || e.id}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="rent-form-row">
                <div className="rent-form-group" style={{ flex: 1 }}>
                  <label className="rent-form-label">{t('marketIntelligence.labelAssignNote')}</label>
                  <textarea
                    className="rent-form-textarea"
                    rows={3}
                    aria-label={t('marketIntelligence.labelAssignNote')}
                    value={assignForm.note}
                    onChange={(e) => setAssignForm((f) => ({ ...f, note: e.target.value }))}
                  />
                </div>
              </div>
              <p className="rent-text-sm rent-text-muted">{t('marketIntelligence.assignHint')}</p>
            </div>
            <div className="rent-modal__footer">
              <button className="rent-btn rent-btn--secondary" onClick={() => setAssignOpen(false)}>{t('common.cancel')}</button>
              <button className="rent-btn rent-btn--primary" onClick={handleAssign} disabled={assigning}>{assigning ? t('marketIntelligence.assigning') : t('marketIntelligence.confirmAssign')}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default MarketIntelligence