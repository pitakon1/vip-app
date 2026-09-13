import { useCallback, useEffect, useState } from 'react'
import { message } from 'antd'
import { marketApi } from '@/services/api'

const MARKET_STATUS: Record<string, { label: string; badge: string }> = {
  active: { label: '已上线', badge: 'rent-badge--success' },
  launching: { label: '筹备中', badge: 'rent-badge--warning' },
  paused: { label: '已暂停', badge: 'rent-badge--neutral' },
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
  { key: 'markets', label: '市场列表' },
  { key: 'channels', label: '支付渠道' },
  { key: 'compliance', label: '合规文档' },
]

const fmtMoney = (v?: number) => Number(v || 0).toFixed(2)

const Markets = () => {
  const [activeTab, setActiveTab] = useState('markets')
  return (
    <div className="rent-main">
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title">多国市场</h2>
          <p className="rent-page-header__subtitle">
            多市场配置、本地支付渠道与多国合规文档归档
          </p>
        </div>
      </div>

      <div className="rent-tabs">
        {TABS.map((t) => (
          <button key={t.key} type="button" className="rent-tab" data-active={activeTab === t.key} onClick={() => setActiveTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'markets' && <MarketsTab />}
      {activeTab === 'channels' && <ChannelsTab />}
      {activeTab === 'compliance' && <ComplianceTab />}
    </div>
  )
}

/* ===== 市场列表 ===== */
const MarketsTab = () => {
  const [items, setItems] = useState<Market[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [publishedOnly, setPublishedOnly] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
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
      message.error(e?.response?.data?.message || '获取市场列表失败')
    } finally {
      setLoading(false)
    }
  }, [page, publishedOnly])

  useEffect(() => { fetchData() }, [fetchData])

  const setField = (k: string) => (e: any) => setForm((f: any) => ({ ...f, [k]: e.target.value }))

  const handleCreate = async () => {
    if (!form.market_code || !form.country_name) {
      message.error('请填写市场代码与国家名称')
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
      message.success('市场已创建')
      setCreateOpen(false)
      setForm({ market_code: '', country_name: '', currency: 'THB', default_language: 'th', timezone: 'Asia/Bangkok', status: 'launching', published: false, license_required: false, vat_rate: '', transfer_fee_rate: '', sort_order: '100' })
      fetchData()
    } catch (e: any) {
      message.error(e?.response?.data?.message || '创建失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div className="rent-filter-bar">
        <select className="rent-form-select" style={{ width: 'auto', minWidth: 140 }} aria-label="显示" value={publishedOnly ? 'pub' : 'all'} onChange={(e) => { setPublishedOnly(e.target.value === 'pub'); setPage(1) }}>
          <option value="all">全部市场</option>
          <option value="pub">仅已发布</option>
        </select>
        <div style={{ flex: 1 }} />
        <button className="rent-btn rent-btn--primary rent-btn--sm" onClick={() => setCreateOpen(true)}>+ 新增市场</button>
      </div>

      <div className="rent-card">
        <div className="rent-card__header"><h3 className="rent-card__title">市场列表</h3><span className="rent-badge rent-badge--neutral">共 {total} 条</span></div>
        <div className="rent-card__body" style={{ padding: 0 }}>
          {loading ? (
            <div className="rent-empty rent-text-muted">加载中...</div>
          ) : items.length === 0 ? (
            <div className="rent-empty rent-text-muted">暂无市场配置</div>
          ) : (
            <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
              <table className="rent-table">
                <thead><tr><th>代码</th><th>国家</th><th>币种</th><th>状态</th><th>发布</th><th style={{ textAlign: 'right' }}>增值税%</th><th style={{ textAlign: 'right' }}>过户费率%</th><th>牌照</th></tr></thead>
                <tbody>
                  {items.map((m) => {
                    const st = MARKET_STATUS[m.status || 'launching'] || MARKET_STATUS.launching
                    return (
                      <tr key={m.id}>
                        <td><span className="rent-mono">{m.market_code || '—'}</span></td>
                        <td>{m.country_name || '—'}</td>
                        <td>{m.currency || '—'}</td>
                        <td><span className={`rent-badge ${st.badge}`}>{st.label}</span></td>
                        <td>
                          {m.published
                            ? <span className="rent-badge rent-badge--success">已发布</span>
                            : <span className="rent-badge rent-badge--neutral">未发布</span>}
                        </td>
                        <td className="rent-num">{fmtMoney(m.vat_rate)}</td>
                        <td className="rent-num">{fmtMoney(m.transfer_fee_rate)}</td>
                        <td>{m.license_required ? <span className="rent-badge rent-badge--warning">需牌照</span> : '—'}</td>
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
          <div className="rent-modal" style={{ width: 520 }} onClick={(e) => e.stopPropagation()}>
            <div className="rent-modal__header"><h3 className="rent-card__title">新增市场</h3></div>
            <div className="rent-modal__body">
              <div className="rent-form-row">
                <div className="rent-form-group"><label className="rent-form-label">市场代码 *</label><input className="rent-form-input" value={form.market_code} onChange={setField('market_code')} placeholder="TH" /></div>
                <div className="rent-form-group"><label className="rent-form-label">国家名称 *</label><input className="rent-form-input" value={form.country_name} onChange={setField('country_name')} /></div>
              </div>
              <div className="rent-form-row">
                <div className="rent-form-group"><label className="rent-form-label">币种</label><input className="rent-form-input" value={form.currency} onChange={setField('currency')} /></div>
                <div className="rent-form-group"><label className="rent-form-label">默认语言</label>
                  <select className="rent-form-select" value={form.default_language} onChange={setField('default_language')}>
                    <option value="th">泰语</option><option value="vi">越南语</option><option value="id">印尼语</option><option value="ms">马来语</option><option value="zh">中文</option><option value="en">英语</option>
                  </select>
                </div>
              </div>
              <div className="rent-form-row">
                <div className="rent-form-group"><label className="rent-form-label">时区</label><input className="rent-form-input" value={form.timezone} onChange={setField('timezone')} /></div>
                <div className="rent-form-group"><label className="rent-form-label">状态</label>
                  <select className="rent-form-select" value={form.status} onChange={setField('status')}>
                    <option value="launching">筹备中</option><option value="active">已上线</option><option value="paused">已暂停</option>
                  </select>
                </div>
              </div>
              <div className="rent-form-row">
                <div className="rent-form-group"><label className="rent-form-label">增值税%</label><input className="rent-form-input" type="number" value={form.vat_rate} onChange={setField('vat_rate')} /></div>
                <div className="rent-form-group"><label className="rent-form-label">过户费率%</label><input className="rent-form-input" type="number" value={form.transfer_fee_rate} onChange={setField('transfer_fee_rate')} /></div>
              </div>
              <div className="rent-form-row">
                <div className="rent-form-group"><label className="rent-form-label">排序权重</label><input className="rent-form-input" type="number" value={form.sort_order} onChange={setField('sort_order')} /></div>
                <div className="rent-flex rent-gap-4" style={{ alignItems: 'flex-end', paddingBottom: 6 }}>
                  <label className="rent-form-label" style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                    <input type="checkbox" checked={!!form.published} onChange={(e) => setForm((f: any) => ({ ...f, published: e.target.checked }))} /> 已发布
                  </label>
                  <label className="rent-form-label" style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                    <input type="checkbox" checked={!!form.license_required} onChange={(e) => setForm((f: any) => ({ ...f, license_required: e.target.checked }))} /> 需中介牌照
                  </label>
                </div>
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

/* ===== 支付渠道 ===== */
const ChannelsTab = () => {
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
      message.error(e?.response?.data?.message || '获取支付渠道失败')
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
      message.error('请选择市场并填写渠道代码与名称')
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
      message.success('支付渠道已配置')
      setCreateOpen(false)
      setForm({ channel_code: '', channel_name: '', channel_type: 'wallet', supported_currency: 'THB', merchant_id: '', sort_order: '100' })
      loadChannels(marketCode)
    } catch (e: any) {
      message.error(e?.response?.data?.message || '配置失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div className="rent-filter-bar">
        <select className="rent-form-select" aria-label="市场" style={{ width: 'auto', minWidth: 160 }} value={marketCode} onChange={(e) => setMarketCode(e.target.value)}>
          {markets.length === 0 && <option value="">暂无市场</option>}
          {markets.map((m) => <option key={m.id} value={m.market_code}>{m.market_code} · {m.country_name}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <button className="rent-btn rent-btn--primary rent-btn--sm" onClick={() => setCreateOpen(true)} disabled={!marketCode}>+ 配置渠道</button>
      </div>

      <div className="rent-card">
        <div className="rent-card__header"><h3 className="rent-card__title">本地支付渠道 · {marketCode || '—'}</h3><span className="rent-badge rent-badge--neutral">{items.length} 个</span></div>
        <div className="rent-card__body" style={{ padding: 0 }}>
          {loading ? (
            <div className="rent-empty rent-text-muted">加载中...</div>
          ) : items.length === 0 ? (
            <div className="rent-empty rent-text-muted">暂无支付渠道，请选择市场并新增</div>
          ) : (
            <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
              <table className="rent-table">
                <thead><tr><th>渠道代码</th><th>渠道名称</th><th>类型</th><th>状态</th><th>支持币种</th></tr></thead>
                <tbody>
                  {items.map((c) => (
                    <tr key={c.id}>
                      <td><span className="rent-mono">{c.channel_code || '—'}</span></td>
                      <td>{c.channel_name || '—'}</td>
                      <td>{c.channel_type || '—'}</td>
                      <td>{c.status === 'active' ? <span className="rent-badge rent-badge--success">启用</span> : <span className="rent-badge rent-badge--neutral">停用</span>}</td>
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
            <div className="rent-modal__header"><h3 className="rent-card__title">配置支付渠道 · {marketCode}</h3></div>
            <div className="rent-modal__body">
              <div className="rent-form-row">
                <div className="rent-form-group"><label className="rent-form-label">渠道代码 *</label><input className="rent-form-input" value={form.channel_code} onChange={setField('channel_code')} placeholder="promptpay/paynow" /></div>
                <div className="rent-form-group"><label className="rent-form-label">渠道名称 *</label><input className="rent-form-input" value={form.channel_name} onChange={setField('channel_name')} /></div>
              </div>
              <div className="rent-form-row">
                <div className="rent-form-group"><label className="rent-form-label">类型</label>
                  <select className="rent-form-select" value={form.channel_type} onChange={setField('channel_type')}>
                    <option value="wallet">电子钱包</option><option value="bank_transfer">银行转账</option><option value="qr">QR 扫码</option><option value="installment">分期</option>
                  </select>
                </div>
                <div className="rent-form-group"><label className="rent-form-label">支持币种</label><input className="rent-form-input" value={form.supported_currency} onChange={setField('supported_currency')} /></div>
              </div>
              <div className="rent-form-row">
                <div className="rent-form-group" style={{ flex: 1 }}><label className="rent-form-label">商户号</label><input className="rent-form-input" value={form.merchant_id} onChange={setField('merchant_id')} /></div>
                <div className="rent-form-group"><label className="rent-form-label">排序</label><input className="rent-form-input" type="number" value={form.sort_order} onChange={setField('sort_order')} /></div>
              </div>
            </div>
            <div className="rent-modal__footer">
              <button className="rent-btn rent-btn--secondary" onClick={() => setCreateOpen(false)}>取消</button>
              <button className="rent-btn rent-btn--primary" onClick={handleCreate} disabled={submitting}>{submitting ? '配置中...' : '配置'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/* ===== 合规文档 ===== */
const ComplianceTab = () => {
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
      message.error(e?.response?.data?.message || '获取合规文档失败')
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
      message.error('请选择市场并填写文档标题')
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
      message.success('合规文档已归档')
      setCreateOpen(false)
      setForm({ doc_type: 'contract_template', title: '', language: 'en', version: '1.0', content: '' })
      loadCompliance(marketCode)
    } catch (e: any) {
      message.error(e?.response?.data?.message || '归档失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div className="rent-filter-bar">
        <select className="rent-form-select" aria-label="市场" style={{ width: 'auto', minWidth: 160 }} value={marketCode} onChange={(e) => setMarketCode(e.target.value)}>
          {markets.length === 0 && <option value="">暂无市场</option>}
          {markets.map((m) => <option key={m.id} value={m.market_code}>{m.market_code} · {m.country_name}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <button className="rent-btn rent-btn--primary rent-btn--sm" onClick={() => setCreateOpen(true)} disabled={!marketCode}>+ 归档文档</button>
      </div>

      <div className="rent-card">
        <div className="rent-card__header"><h3 className="rent-card__title">合规文档 · {marketCode || '—'}</h3><span className="rent-badge rent-badge--neutral">{items.length} 份</span></div>
        <div className="rent-card__body" style={{ padding: 0 }}>
          {loading ? (
            <div className="rent-empty rent-text-muted">加载中...</div>
          ) : items.length === 0 ? (
            <div className="rent-empty rent-text-muted">暂无合规文档，请选择市场并归档</div>
          ) : (
            <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
              <table className="rent-table">
                <thead><tr><th>类型</th><th>标题</th><th>语言</th><th>版本</th><th>生效日期</th></tr></thead>
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
            <div className="rent-modal__header"><h3 className="rent-card__title">归档合规文档 · {marketCode}</h3></div>
            <div className="rent-modal__body">
              <div className="rent-form-row">
                <div className="rent-form-group" style={{ flex: 1 }}>
                  <label className="rent-form-label">类型</label>
                  <select className="rent-form-select" value={form.doc_type} onChange={setField('doc_type')}>
                    <option value="contract_template">合同模板</option><option value="contract_terms">合同条款</option><option value="license">中介牌照</option><option value="pdpa">PDPA 隐私</option>
                  </select>
                </div>
                <div className="rent-form-group"><label className="rent-form-label">语言</label><input className="rent-form-input" value={form.language} onChange={setField('language')} /></div>
              </div>
              <div className="rent-form-row">
                <div className="rent-form-group" style={{ flex: 1 }}><label className="rent-form-label">标题 *</label><input className="rent-form-input" value={form.title} onChange={setField('title')} /></div>
                <div className="rent-form-group"><label className="rent-form-label">版本</label><input className="rent-form-input" value={form.version} onChange={setField('version')} /></div>
              </div>
              <div className="rent-form-row">
                <div className="rent-form-group" style={{ flex: 1 }}><label className="rent-form-label">内容</label><textarea className="rent-form-textarea" rows={3} value={form.content} onChange={setField('content')} /></div>
              </div>
            </div>
            <div className="rent-modal__footer">
              <button className="rent-btn rent-btn--secondary" onClick={() => setCreateOpen(false)}>取消</button>
              <button className="rent-btn rent-btn--primary" onClick={handleCreate} disabled={submitting}>{submitting ? '归档中...' : '归档'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default Markets