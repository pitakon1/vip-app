import { useCallback, useEffect, useState } from 'react'
import { Empty, message } from 'antd'
import { saleListingApi, propertyDealApi } from '@/services/api'

/* ===== 看板列定义（覆盖全部挂牌状态） ===== */
const LISTING_KANBAN_COLUMNS: { key: string; title: string; statuses: string[] }[] = [
  { key: 'active', title: '在售', statuses: ['active'] },
  { key: 'pending', title: '待审', statuses: ['pending'] },
  { key: 'contracted', title: '已签约', statuses: ['contracted'] },
  { key: 'closed', title: '已成交', statuses: ['closed'] },
  { key: 'ended', title: '已取消 / 已过期', statuses: ['cancelled', 'expired'] },
]

/* ===== 常量与翻译 ===== */
const LISTING_STATUS: Record<string, { label: string; badge: string }> = {
  active: { label: '在售', badge: 'rent-badge--success' },
  pending: { label: '待审', badge: 'rent-badge--info' },
  contracted: { label: '已签约', badge: 'rent-badge--primary' },
  closed: { label: '已成交', badge: 'rent-badge--success' },
  cancelled: { label: '已取消', badge: 'rent-badge--neutral' },
  expired: { label: '已过期', badge: 'rent-badge--neutral' },
}

const SALE_TYPE: Record<string, string> = { buy: '挂买', sell: '挂卖' }

const DEAL_STATUS: Record<string, { label: string; badge: string }> = {
  drafted: { label: '草稿', badge: 'rent-badge--neutral' },
  escrow_pending: { label: '托管中', badge: 'rent-badge--info' },
  signed: { label: '已签署', badge: 'rent-badge--primary' },
  transferring: { label: '过户中', badge: 'rent-badge--warning' },
  completed: { label: '已完成', badge: 'rent-badge--success' },
  failed: { label: '失败', badge: 'rent-badge--error' },
  cancelled: { label: '已取消', badge: 'rent-badge--neutral' },
}

const ESCROW_STATUS: Record<string, { label: string; badge: string }> = {
  deposited: { label: '已托管', badge: 'rent-badge--info' },
  held: { label: '冻结中', badge: 'rent-badge--warning' },
  released_seller: { label: '已放款·卖方', badge: 'rent-badge--success' },
  refunded_buyer: { label: '已退款·买方', badge: 'rent-badge--neutral' },
}

const MORTGAGE_STATUS: Record<string, { label: string; badge: string }> = {
  applied: { label: '已申请', badge: 'rent-badge--info' },
  under_review: { label: '审核中', badge: 'rent-badge--warning' },
  pre_approved: { label: '预审批', badge: 'rent-badge--info' },
  approved: { label: '已审批', badge: 'rent-badge--success' },
  disbursed: { label: '已放款', badge: 'rent-badge--success' },
  rejected: { label: '已拒绝', badge: 'rent-badge--error' },
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
  { key: 'listing', label: '售房挂牌' },
  { key: 'deal', label: '产权成交' },
  { key: 'escrow', label: '定金托管' },
  { key: 'mortgage', label: '按揭' },
]

const SaleDeals = () => {
  const [activeTab, setActiveTab] = useState('listing')
  const [loading, setLoading] = useState(false)
  const [listingCreateOpen, setListingCreateOpen] = useState(false)

  return (
    <div className="rent-main">
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title">买卖交易闭环</h2>
          <p className="rent-page-header__subtitle">
            从挂牌、估价、产权成交到定金托管与按揭审批的全流程管理
          </p>
        </div>
        {activeTab === 'listing' && (
          <div className="rent-page-header__actions">
            <button className="rent-btn rent-btn--primary rent-btn--sm" onClick={() => setListingCreateOpen(true)}>+ 发布挂牌</button>
          </div>
        )}
      </div>

      <div className="rent-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className="rent-tab"
            data-active={activeTab === t.key}
            onClick={() => { setActiveTab(t.key); setListingCreateOpen(false) }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'listing' && <ListingTab loading={loading} setLoading={setLoading} createOpen={listingCreateOpen} onOpenChange={setListingCreateOpen} />}
      {activeTab === 'deal' && <DealTab loading={loading} setLoading={setLoading} />}
      {activeTab === 'escrow' && <EscrowTab loading={loading} setLoading={setLoading} />}
      {activeTab === 'mortgage' && <MortgageTab loading={loading} setLoading={setLoading} />}
    </div>
  )
}

/* ===== 售房挂牌 Tab ===== */
const ListingTab = ({ loading, setLoading, createOpen, onOpenChange }: { loading: boolean; setLoading: (v: boolean) => void; createOpen: boolean; onOpenChange: (v: boolean) => void }) => {
  const [items, setItems] = useState<Listing[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [saleType, setSaleType] = useState('')
  const [status, setStatus] = useState('')
  const [view, setView] = useState<'kanban' | 'list'>('kanban')
  const [valOpen, setValOpen] = useState<{ listing: Listing; items: any[] } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState<any>({ title: '', sale_type: 'sell', asking_price: '', currency: 'THB', address: '', size_sqm: '', bedrooms: '', bathrooms: '', description: '' })

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await saleListingApi.list({ page, pageSize: 10, sale_type: saleType || undefined, status: status || undefined })
      const payload = res.data?.data ?? res.data
      setItems(payload?.items ?? [])
      setTotal(payload?.total ?? 0)
    } catch (e: any) {
      message.error(e?.response?.data?.message || '获取挂牌列表失败')
    } finally {
      setLoading(false)
    }
  }, [page, saleType, status, setLoading])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const setField = (k: string) => (e: any) => setForm((f: any) => ({ ...f, [k]: e.target.value }))

  const handleCreate = async () => {
    if (!form.title || !form.asking_price) {
      message.error('请填写标题与挂牌价')
      return
    }
    setSubmitting(true)
    try {
      await saleListingApi.create({
        sale_type: form.sale_type,
        title: form.title,
        asking_price: Number(form.asking_price),
        currency: form.currency || 'THB',
        address: form.address || undefined,
        size_sqm: form.size_sqm ? Number(form.size_sqm) : undefined,
        bedrooms: form.bedrooms ? Number(form.bedrooms) : undefined,
        bathrooms: form.bathrooms ? Number(form.bathrooms) : undefined,
        description: form.description || undefined,
      })
      message.success('挂牌已发布')
      onOpenChange(false)
      setForm({ title: '', sale_type: 'sell', asking_price: '', currency: 'THB', address: '', size_sqm: '', bedrooms: '', bathrooms: '', description: '' })
      fetchData()
    } catch (e: any) {
      message.error(e?.response?.data?.message || '发布失败')
    } finally {
      setSubmitting(false)
    }
  }

  const changeStatus = async (id: string, s: string) => {
    try {
      await saleListingApi.updateStatus(id, s)
      message.success('状态已更新')
      fetchData()
    } catch (e: any) {
      message.error(e?.response?.data?.message || '更新失败')
    }
  }

  const openValuation = async (listing: Listing) => {
    try {
      const res = await saleListingApi.valuations(listing.id)
      setValOpen({ listing, items: res.data ?? [] })
    } catch (e: any) {
      message.error(e?.response?.data?.message || '获取估价失败')
    }
  }

  const valForm = { market_value: '', low: '', high: '', confidence: '50' }

  return (
    <>
      <div className="rent-filter-bar">
        <select className="rent-form-select rent-filter-select" style={{ width: 'auto', minWidth: 120 }} aria-label="类型" value={saleType} onChange={(e) => { setSaleType(e.target.value); setPage(1) }}>
          <option value="">全部类型</option>
          <option value="sell">挂卖</option>
          <option value="buy">挂买</option>
        </select>
        <select className="rent-form-select rent-filter-select" style={{ width: 'auto', minWidth: 130 }} aria-label="状态" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
          <option value="">全部状态</option>
          {Object.keys(LISTING_STATUS).map((k) => (
            <option key={k} value={k}>{LISTING_STATUS[k].label}</option>
          ))}
        </select>
        <div style={{ flex: 1 }} />
        <div className="rent-chart-range-group">
          <button type="button" className={`rent-chart-range${view === 'kanban' ? ' rent-chart-range--active' : ''}`} onClick={() => setView('kanban')}>看板视图</button>
          <button type="button" className={`rent-chart-range${view === 'list' ? ' rent-chart-range--active' : ''}`} onClick={() => setView('list')}>列表视图</button>
        </div>
      </div>

      <div className="rent-card">
        <div className="rent-card__header">
          <h3 className="rent-card__title">挂牌列表</h3>
          <span className="rent-badge rent-badge--neutral">共 {total} 条</span>
        </div>
        <div className="rent-card__body" style={{ padding: 0 }}>
          {loading ? (
            <div className="rent-empty rent-text-muted">加载中...</div>
          ) : view === 'kanban' ? (
            items.length === 0 ? (
              <div className="rent-empty"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无挂牌数据" /></div>
            ) : (
              <div className="rent-kanban" style={{ padding: '18px 22px' }}>
                {LISTING_KANBAN_COLUMNS.map((col) => {
                  const colItems = items.filter((it) => col.statuses.includes(it.status || 'active'))
                  return (
                    <div className="rent-kanban__column" key={col.key}>
                      <div className="rent-kanban__column-header">
                        <span className="rent-kanban__column-title">{col.title}</span>
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
                            {SALE_TYPE[it.sale_type || ''] || '—'}
                            {it.size_sqm != null ? ` · ${it.size_sqm}㎡` : ''}
                            {it.bedrooms != null ? ` · ${it.bedrooms}室` : ''}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            )
          ) : items.length === 0 ? (
            <div className="rent-empty rent-text-muted">暂无挂牌数据</div>
          ) : (
            <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
              <table className="rent-table">
                <thead>
                  <tr>
                    <th>标题</th><th>类型</th><th>挂牌价</th><th>币种</th><th>面积(㎡)</th><th>状态</th><th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => {
                    const st = LISTING_STATUS[it.status || 'active'] || LISTING_STATUS.active
                    return (
                      <tr key={it.id}>
                        <td>{it.title || it.address || '—'}</td>
                        <td>{SALE_TYPE[it.sale_type || ''] || '—'}</td>
                        <td className="rent-num">{fmtMoney(it.asking_price)}</td>
                        <td>{it.currency || '—'}</td>
                        <td className="rent-num">{it.size_sqm ?? '—'}</td>
                        <td><span className={`rent-badge ${st.badge}`}>{st.label}</span></td>
                        <td>
                          <div className="rent-flex rent-gap-2">
                            <select className="rent-form-select" style={{ width: 96, minWidth: 96 }} aria-label="推进状态" value="" onChange={(e) => e.target.value && changeStatus(it.id, e.target.value)}>
                              <option value="">改状态</option>
                              {Object.keys(LISTING_STATUS).map((k) => (
                                <option key={k} value={k}>{LISTING_STATUS[k].label}</option>
                              ))}
                            </select>
                            <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => openValuation(it)}>
                              估价 {shortId(it.id)}
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
            <span className="rent-pagination__info">共 {total} 条 · 每页 10 条</span>
            <button className="rent-pagination__btn" onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1}>上一页</button>
            <span className="rent-pagination__info">{page}</span>
            <button className="rent-pagination__btn" onClick={() => setPage(page + 1)} disabled={page * 10 >= total}>下一页</button>
          </div>
        </div>
      </div>

      {createOpen && (
        <div className="rent-modal-backdrop" onClick={() => onOpenChange(false)}>
          <div className="rent-modal" style={{ width: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="rent-modal__header"><h3 className="rent-card__title">发布挂牌</h3></div>
            <div className="rent-modal__body">
              <div className="rent-form-row">
                <div className="rent-form-group">
                  <label className="rent-form-label">标题 *</label>
                  <input className="rent-form-input" value={form.title} onChange={setField('title')} placeholder="例如：曼谷素坤逸 2 房公寓" />
                </div>
              </div>
              <div className="rent-form-row">
                <div className="rent-form-group">
                  <label className="rent-form-label">类型</label>
                  <select className="rent-form-select" value={form.sale_type} onChange={setField('sale_type')}>
                    <option value="sell">挂卖</option><option value="buy">挂买</option>
                  </select>
                </div>
                <div className="rent-form-group">
                  <label className="rent-form-label">币种</label>
                  <input className="rent-form-input" value={form.currency} onChange={setField('currency')} />
                </div>
              </div>
              <div className="rent-form-row">
                <div className="rent-form-group">
                  <label className="rent-form-label">挂牌价 *</label>
                  <input className="rent-form-input" type="number" value={form.asking_price} onChange={setField('asking_price')} />
                </div>
                <div className="rent-form-group">
                  <label className="rent-form-label">面积(㎡)</label>
                  <input className="rent-form-input" type="number" value={form.size_sqm} onChange={setField('size_sqm')} />
                </div>
              </div>
              <div className="rent-form-row">
                <div className="rent-form-group">
                  <label className="rent-form-label">卧室</label>
                  <input className="rent-form-input" type="number" value={form.bedrooms} onChange={setField('bedrooms')} />
                </div>
                <div className="rent-form-group">
                  <label className="rent-form-label">卫生间</label>
                  <input className="rent-form-input" type="number" value={form.bathrooms} onChange={setField('bathrooms')} />
                </div>
              </div>
              <div className="rent-form-row">
                <div className="rent-form-group">
                  <label className="rent-form-label">地址</label>
                  <input className="rent-form-input" value={form.address} onChange={setField('address')} />
                </div>
              </div>
            </div>
            <div className="rent-modal__footer">
              <button className="rent-btn rent-btn--secondary" onClick={() => onOpenChange(false)}>取消</button>
              <button className="rent-btn rent-btn--primary" onClick={handleCreate} disabled={submitting}>{submitting ? '发布中...' : '发布'}</button>
            </div>
          </div>
        </div>
      )}

      {valOpen && (
        <div className="rent-modal-backdrop" onClick={() => setValOpen(null)}>
          <div className="rent-modal" style={{ width: 520 }} onClick={(e) => e.stopPropagation()}>
            <div className="rent-modal__header">
              <h3 className="rent-card__title">AVM 估价 · {valOpen.listing.title || shortId(valOpen.listing.id)}</h3>
            </div>
            <div className="rent-modal__body">
              <label className="rent-form-label">估价记录</label>
              <div className="rent-table-wrap" style={{ marginBottom: 16 }}>
                <table className="rent-table">
                  <thead><tr><th>方法</th><th style={{ textAlign: 'right' }}>估值</th><th style={{ textAlign: 'right' }}>低/高</th><th>置信度</th></tr></thead>
                  <tbody>
                    {valOpen.items.length === 0 ? (
                      <tr><td colSpan={4} className="rent-text-muted rent-text-center">暂无估价</td></tr>
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
  const [form, setForm] = useState<any>({ ...defaultForm })
  const [submitting, setSubmitting] = useState(false)
  const setField = (k: string) => (e: any) => setForm((f: any) => ({ ...f, [k]: e.target.value }))

  const handleAdd = async () => {
    if (!form.market_value) {
      message.error('请填写估值')
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
      message.success('估价已提交')
      onDone()
    } catch (e: any) {
      message.error(e?.response?.data?.message || '估价失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <label className="rent-form-label">新增估价</label>
      <div className="rent-form-row">
        <div className="rent-form-group"><input className="rent-form-input" type="number" placeholder="估值 *" value={form.market_value} onChange={setField('market_value')} /></div>
        <div className="rent-form-group"><input className="rent-form-input" type="number" placeholder="低估值" value={form.low} onChange={setField('low')} /></div>
      </div>
      <div className="rent-form-row">
        <div className="rent-form-group"><input className="rent-form-input" type="number" placeholder="高估值" value={form.high} onChange={setField('high')} /></div>
        <div className="rent-form-group"><input className="rent-form-input" type="number" placeholder="置信度(0-100)" value={form.confidence} onChange={setField('confidence')} /></div>
      </div>
      <div className="rent-flex rent-gap-2" style={{ marginTop: 12 }}>
        <button className="rent-btn rent-btn--primary rent-btn--sm" onClick={handleAdd} disabled={submitting}>{submitting ? '提交中...' : '提交估价'}</button>
      </div>
    </div>
  )
}

/* ===== 产权成交 Tab ===== */
const DealTab = ({ loading, setLoading }: { loading: boolean; setLoading: (v: boolean) => void }) => {
  const [items, setItems] = useState<Deal[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [listings, setListings] = useState<Listing[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState<any>({ sale_listing_id: '', sale_price: '', currency: 'THB', buyer_user_id: '', sales_user_id: '', notes: '' })

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await propertyDealApi.list({ page, pageSize: 10, status: status || undefined })
      const payload = res.data?.data ?? res.data
      setItems(payload?.items ?? [])
      setTotal(payload?.total ?? 0)
    } catch (e: any) {
      message.error(e?.response?.data?.message || '获取成交列表失败')
    } finally {
      setLoading(false)
    }
  }, [page, status, setLoading])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const loadListings = async () => {
    try {
      const res = await saleListingApi.list({ pageSize: 100, status: 'active' })
      const payload = res.data?.data ?? res.data
      setListings(payload?.items ?? [])
    } catch { /* 忽略 */ }
  }

  const handleCreate = async () => {
    if (!form.sale_listing_id || !form.sale_price) {
      message.error('请选择挂牌并填写成交价')
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
      message.success('成交已创建（挂牌自动联动为已签约）')
      setCreateOpen(false)
      fetchData()
    } catch (e: any) {
      message.error(e?.response?.data?.message || '创建失败')
    } finally {
      setSubmitting(false)
    }
  }

  const setField = (k: string) => (e: any) => setForm((f: any) => ({ ...f, [k]: e.target.value }))

  const changeStatus = async (id: string, s: string) => {
    try {
      await propertyDealApi.updateStatus(id, s)
      message.success('状态已推进')
      fetchData()
    } catch (e: any) {
      message.error(e?.response?.data?.message || '推进失败')
    }
  }

  return (
    <>
      <div className="rent-filter-bar">
        <select className="rent-form-select" style={{ width: 'auto', minWidth: 130 }} aria-label="状态" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
          <option value="">全部状态</option>
          {Object.keys(DEAL_STATUS).map((k) => <option key={k} value={k}>{DEAL_STATUS[k].label}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <button className="rent-btn rent-btn--primary rent-btn--sm" onClick={() => { loadListings(); setCreateOpen(true) }}>+ 新建成交</button>
      </div>

      <div className="rent-card">
        <div className="rent-card__header"><h3 className="rent-card__title">成交列表</h3><span className="rent-badge rent-badge--neutral">共 {total} 条</span></div>
        <div className="rent-card__body" style={{ padding: 0 }}>
          {loading ? (
            <div className="rent-empty rent-text-muted">加载中...</div>
          ) : items.length === 0 ? (
            <div className="rent-empty rent-text-muted">暂无成交数据</div>
          ) : (
            <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
              <table className="rent-table">
                <thead><tr><th>成交ID</th><th>挂牌ID</th><th style={{ textAlign: 'right' }}>成交价</th><th>币种</th><th>状态</th><th>备注</th><th>操作</th></tr></thead>
                <tbody>
                  {items.map((d) => {
                    const st = DEAL_STATUS[d.status || 'drafted'] || DEAL_STATUS.drafted
                    return (
                      <tr key={d.id}>
                        <td><span className="rent-mono">{shortId(d.id)}</span></td>
                        <td><span className="rent-mono">{shortId(d.sale_listing_id)}</span></td>
                        <td className="rent-num">{fmtMoney(d.sale_price)}</td>
                        <td>{d.currency || '—'}</td>
                        <td><span className={`rent-badge ${st.badge}`}>{st.label}</span></td>
                        <td>{d.notes || '—'}</td>
                        <td>
                          <select className="rent-form-select" style={{ width: 110, minWidth: 110 }} aria-label="推进状态" value="" onChange={(e) => e.target.value && changeStatus(d.id, e.target.value)}>
                            <option value="">推进状态</option>
                            {Object.keys(DEAL_STATUS).map((k) => <option key={k} value={k}>{DEAL_STATUS[k].label}</option>)}
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
        <span className="rent-pagination__info">共 {total} 条</span>
        <button className="rent-pagination__btn" onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1}>上一页</button>
        <span className="rent-pagination__info">{page}</span>
        <button className="rent-pagination__btn" onClick={() => setPage(page + 1)} disabled={page * 10 >= total}>下一页</button>
      </div>

      {createOpen && (
        <div className="rent-modal-backdrop" onClick={() => setCreateOpen(false)}>
          <div className="rent-modal" style={{ width: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="rent-modal__header"><h3 className="rent-card__title">新建产权成交</h3></div>
            <div className="rent-modal__body">
              <div className="rent-form-row">
                <div className="rent-form-group" style={{ flex: 1 }}>
                  <label className="rent-form-label">挂牌 *</label>
                  <select className="rent-form-select" value={form.sale_listing_id} onChange={setField('sale_listing_id')}>
                    <option value="">请选择在售挂牌</option>
                    {listings.map((l) => <option key={l.id} value={l.id}>{l.title || shortId(l.id)}</option>)}
                  </select>
                </div>
              </div>
              <div className="rent-form-row">
                <div className="rent-form-group"><label className="rent-form-label">成交价 *</label><input className="rent-form-input" type="number" value={form.sale_price} onChange={setField('sale_price')} /></div>
                <div className="rent-form-group"><label className="rent-form-label">币种</label><input className="rent-form-input" value={form.currency} onChange={setField('currency')} /></div>
              </div>
              <div className="rent-form-row">
                <div className="rent-form-group"><label className="rent-form-label">买方用户ID</label><input className="rent-form-input" value={form.buyer_user_id} onChange={setField('buyer_user_id')} /></div>
                <div className="rent-form-group"><label className="rent-form-label">卖方/经纪人用户ID</label><input className="rent-form-input" value={form.sales_user_id} onChange={setField('sales_user_id')} /></div>
              </div>
              <div className="rent-form-row">
                <div className="rent-form-group"><label className="rent-form-label">备注</label><textarea className="rent-form-textarea" rows={2} value={form.notes} onChange={setField('notes')} /></div>
              </div>
            </div>
            <div className="rent-modal__footer">
              <button className="rent-btn rent-btn--secondary" onClick={() => setCreateOpen(false)}>取消</button>
              <button className="rent-btn rent-btn--primary" onClick={handleCreate} disabled={submitting}>{submitting ? '创建中...' : '创建'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/* ===== 定金托管 Tab ===== */
const EscrowTab = ({ loading, setLoading }: { loading: boolean; setLoading: (v: boolean) => void }) => {
  const [deals, setDeals] = useState<Deal[]>([])
  const [dealId, setDealId] = useState('')
  const [escrows, setEscrows] = useState<Escrow[]>([])
  const [registerOpen, setRegisterOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState<any>({ amount: '', currency: 'THB' })

  const loadDeals = useCallback(async () => {
    setLoading(true)
    try {
      const res = await propertyDealApi.list({ page: 1, pageSize: 100 })
      const payload = res.data?.data ?? res.data
      const list = payload?.items ?? []
      setDeals(list)
      if (list.length > 0) setDealId(list[0].id)
    } catch (e: any) {
      message.error(e?.response?.data?.message || '获取成交列表失败')
    } finally {
      setLoading(false)
    }
  }, [setLoading])

  useEffect(() => {
    loadDeals()
  }, [loadDeals])

  const loadEscrows = useCallback(async (did: string) => {
    if (!did) return
    try {
      const res = await propertyDealApi.listEscrows(did)
      setEscrows(res.data ?? [])
    } catch (e: any) {
      message.error(e?.response?.data?.message || '获取托管失败')
    }
  }, [])

  useEffect(() => {
    if (dealId) loadEscrows(dealId)
  }, [dealId, loadEscrows])

  const handleRegister = async () => {
    if (!form.amount) {
      message.error('请填写托管金额')
      return
    }
    setSubmitting(true)
    try {
      await propertyDealApi.createEscrow({ deal_id: dealId, amount: Number(form.amount), currency: form.currency || 'THB' })
      message.success('定金托管已登记')
      setRegisterOpen(false)
      setForm({ amount: '', currency: 'THB' })
      if (dealId) loadEscrows(dealId)
    } catch (e: any) {
      message.error(e?.response?.data?.message || '登记失败')
    } finally {
      setSubmitting(false)
    }
  }

  const act = async (id: string, type: 'release' | 'refund', refresh: (id: string) => void) => {
    try {
      if (type === 'release') await propertyDealApi.releaseEscrow(id)
      else await propertyDealApi.refundEscrow(id)
      message.success(type === 'release' ? '已放款给卖方' : '已退款给买方')
      refresh(dealId)
    } catch (e: any) {
      message.error(e?.response?.data?.message || '操作失败')
    }
  }

  const setField = (k: string) => (e: any) => setForm((f: any) => ({ ...f, [k]: e.target.value }))

  return (
    <>
      <div className="rent-filter-bar">
        <select className="rent-form-select" aria-label="成交" style={{ width: 'auto', minWidth: 220 }} value={dealId} onChange={(e) => setDealId(e.target.value)}>
          <option value="" disabled>请选择成交</option>
          {deals.map((d) => <option key={d.id} value={d.id}>成交 {shortId(d.id)} · {d.currency || '-'}{fmtMoney(d.sale_price)}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <button className="rent-btn rent-btn--primary rent-btn--sm" onClick={() => setRegisterOpen(true)} disabled={!dealId}>+ 登记托管</button>
      </div>

      <div className="rent-card">
        <div className="rent-card__header"><h3 className="rent-card__title">定金托管记录</h3><span className="rent-badge rent-badge--neutral">{escrows.length} 笔</span></div>
        <div className="rent-card__body" style={{ padding: 0 }}>
          {escrows.length === 0 ? (
            <div className="rent-empty rent-text-muted">请选择成交查看托管，或登记新托管</div>
          ) : (
            <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
              <table className="rent-table">
                <thead><tr><th>托管ID</th><th style={{ textAlign: 'right' }}>金额</th><th>币种</th><th>状态</th><th>托管日期</th><th>操作</th></tr></thead>
                <tbody>
                  {escrows.map((e) => {
                    const st = ESCROW_STATUS[e.status || 'deposited'] || ESCROW_STATUS.deposited
                    const actionable = e.status === 'deposited' || e.status === 'held'
                    return (
                      <tr key={e.id}>
                        <td><span className="rent-mono">{shortId(e.id)}</span></td>
                        <td className="rent-num">{fmtMoney(e.amount)}</td>
                        <td>{e.currency || '—'}</td>
                        <td><span className={`rent-badge ${st.badge}`}>{st.label}</span></td>
                        <td className="rent-table__mono">{e.deposited_at ? String(e.deposited_at).slice(0, 10) : '—'}</td>
                        <td>
                          <div className="rent-flex rent-gap-2">
                            {actionable && (
                              <>
                                <button className="rent-btn rent-btn--primary rent-btn--sm" onClick={() => act(e.id, 'release', loadEscrows)}>放款</button>
                                <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => act(e.id, 'refund', loadEscrows)}>退款</button>
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
            <div className="rent-modal__header"><h3 className="rent-card__title">登记定金托管</h3></div>
            <div className="rent-modal__body">
              <div className="rent-form-row">
                <div className="rent-form-group"><label className="rent-form-label">托管金额 *</label><input className="rent-form-input" type="number" value={form.amount} onChange={setField('amount')} /></div>
                <div className="rent-form-group"><label className="rent-form-label">币种</label><input className="rent-form-input" value={form.currency} onChange={setField('currency')} /></div>
              </div>
            </div>
            <div className="rent-modal__footer">
              <button className="rent-btn rent-btn--secondary" onClick={() => setRegisterOpen(false)}>取消</button>
              <button className="rent-btn rent-btn--primary" onClick={handleRegister} disabled={submitting}>{submitting ? '登记中...' : '登记'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/* ===== 按揭 Tab ===== */
const MortgageTab = ({ loading, setLoading }: { loading: boolean; setLoading: (v: boolean) => void }) => {
  const [items, setItems] = useState<Mortgage[]>([])
  const [deals, setDeals] = useState<Deal[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState<any>({ bank: '', loan_amount: '', currency: 'THB', term_months: '360', deal_id: '', buyer_user_id: '' })

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await propertyDealApi.myMortgages()
      setItems(res.data ?? [])
    } catch (e: any) {
      message.error(e?.response?.data?.message || '获取按揭列表失败')
    } finally {
      setLoading(false)
    }
  }, [setLoading])

  useEffect(() => {
    fetchData()
  }, [fetchData])

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
      message.error('请填写银行与贷款金额')
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
      message.success('按揭申请已提交')
      setCreateOpen(false)
      setForm({ bank: '', loan_amount: '', currency: 'THB', term_months: '360', deal_id: '', buyer_user_id: '' })
      fetchData()
    } catch (e: any) {
      message.error(e?.response?.data?.message || '提交失败')
    } finally {
      setSubmitting(false)
    }
  }

  const approve = async (id: string, status: string) => {
    try {
      await propertyDealApi.updateMortgageStatus(id, status)
      message.success('按揭状态已更新')
      fetchData()
    } catch (e: any) {
      message.error(e?.response?.data?.message || '审批失败')
    }
  }

  return (
    <>
      <div className="rent-filter-bar">
        <span className="rent-text-muted">按揭申请（当前账号名下）</span>
        <div style={{ flex: 1 }} />
        <button className="rent-btn rent-btn--primary rent-btn--sm" onClick={() => { loadDeals(); setCreateOpen(true) }}>+ 提交申请</button>
      </div>

      <div className="rent-card">
        <div className="rent-card__header"><h3 className="rent-card__title">按揭列表</h3><span className="rent-badge rent-badge--neutral">{items.length} 笔</span></div>
        <div className="rent-card__body" style={{ padding: 0 }}>
          {loading ? (
            <div className="rent-empty rent-text-muted">加载中...</div>
          ) : items.length === 0 ? (
            <div className="rent-empty rent-text-muted">暂无按揭申请，可提交新申请</div>
          ) : (
            <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
              <table className="rent-table">
                <thead><tr><th>银行</th><th style={{ textAlign: 'right' }}>贷款金额</th><th>币种</th><th>期限(月)</th><th>状态</th><th>操作</th></tr></thead>
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
                        <td><span className={`rent-badge ${st.badge}`}>{st.label}</span></td>
                        <td>
                          {pending && (
                            <div className="rent-flex rent-gap-2">
                              <button className="rent-btn rent-btn--primary rent-btn--sm" onClick={() => approve(m.id, 'approved')}>通过</button>
                              <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => approve(m.id, 'rejected')}>拒绝</button>
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
            <div className="rent-modal__header"><h3 className="rent-card__title">提交按揭申请</h3></div>
            <div className="rent-modal__body">
              <div className="rent-form-row">
                <div className="rent-form-group"><label className="rent-form-label">银行 *</label><input className="rent-form-input" value={form.bank} onChange={setField('bank')} /></div>
                <div className="rent-form-group"><label className="rent-form-label">贷款金额 *</label><input className="rent-form-input" type="number" value={form.loan_amount} onChange={setField('loan_amount')} /></div>
              </div>
              <div className="rent-form-row">
                <div className="rent-form-group"><label className="rent-form-label">币种</label><input className="rent-form-input" value={form.currency} onChange={setField('currency')} /></div>
                <div className="rent-form-group"><label className="rent-form-label">期限(月)</label><input className="rent-form-input" type="number" value={form.term_months} onChange={setField('term_months')} /></div>
              </div>
              <div className="rent-form-row">
                <div className="rent-form-group" style={{ flex: 1 }}>
                  <label className="rent-form-label">关联成交</label>
                  <select className="rent-form-select" value={form.deal_id} onChange={setField('deal_id')}>
                    <option value="">不关联</option>
                    {deals.map((d) => <option key={d.id} value={d.id}>成交 {shortId(d.id)}</option>)}
                  </select>
                </div>
                <div className="rent-form-group" style={{ flex: 1 }}>
                  <label className="rent-form-label">买方用户ID</label>
                  <input className="rent-form-input" value={form.buyer_user_id} onChange={setField('buyer_user_id')} />
                </div>
              </div>
            </div>
            <div className="rent-modal__footer">
              <button className="rent-btn rent-btn--secondary" onClick={() => setCreateOpen(false)}>取消</button>
              <button className="rent-btn rent-btn--primary" onClick={handleCreate} disabled={submitting}>{submitting ? '提交中...' : '提交'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default SaleDeals