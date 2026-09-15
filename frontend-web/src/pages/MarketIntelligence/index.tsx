import { useCallback, useEffect, useState } from 'react'
import { message } from 'antd'
import { marketDataApi, leadsApi, marketApi, employeesApi } from '@/services/api'

const SIGNAL_LEVEL: Record<string, { label: string; badge: string }> = {
  info: { label: '提示', badge: 'rent-badge--info' },
  warning: { label: '警告', badge: 'rent-badge--warning' },
  high: { label: '高危', badge: 'rent-badge--error' },
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
  { key: 'indices', label: '市场指数' },
  { key: 'reports', label: '市场报告' },
  { key: 'matches', label: '智能匹配' },
  { key: 'churn', label: '流失预警' },
]

const fmtNum = (v?: number) => Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const MarketIntelligence = () => {
  const [activeTab, setActiveTab] = useState('indices')
  return (
    <div className="rent-main">
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title">数据与决策</h2>
          <p className="rent-page-header__subtitle">市场指数、研究报告与租客流失预警信号</p>
        </div>
      </div>

      <div className="rent-tabs">
        {TABS.map((t) => (
          <button key={t.key} type="button" className="rent-tab" data-active={activeTab === t.key} onClick={() => setActiveTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'indices' && <IndicesTab />}
      {activeTab === 'reports' && <ReportsTab />}
      {activeTab === 'matches' && <MatchesTab />}
      {activeTab === 'churn' && <ChurnTab />}
    </div>
  )
}

/* ===== 市场指数 ===== */
const IndicesTab = () => {
  const [items, setItems] = useState<Index[]>([])
  const [loading, setLoading] = useState(false)
  const [marketCode, setMarketCode] = useState('')
  const [indexType, setIndexType] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState<any>({ market_code: '', index_type: 'sale', period: '', value: '', delta_pct: '', sample_count: '0', avg_price_sqm: '', avg_rent: '', currency: 'THB' })

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await marketDataApi.indices({ market_code: marketCode || undefined, index_type: indexType || undefined })
      setItems(res.data ?? [])
    } catch (e: any) {
      message.error(e?.response?.data?.message || '获取市场指数失败')
    } finally {
      setLoading(false)
    }
  }, [marketCode, indexType])

  useEffect(() => { fetchData() }, [fetchData])

  const setField = (k: string) => (e: any) => setForm((f: any) => ({ ...f, [k]: e.target.value }))

  const handleCreate = async () => {
    if (!form.market_code || !form.period || !form.value) {
      message.error('请填写市场代码、周期与指数值')
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
      message.success('指数已发布')
      setCreateOpen(false)
      setForm({ market_code: '', index_type: 'sale', period: '', value: '', delta_pct: '', sample_count: '0', avg_price_sqm: '', avg_rent: '', currency: 'THB' })
      fetchData()
    } catch (e: any) {
      message.error(e?.response?.data?.message || '发布失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div className="rent-filter-bar">
        <input className="rent-form-input" style={{ width: 120 }} placeholder="市场代码" aria-label="市场代码" value={marketCode} onChange={(e) => setMarketCode(e.target.value.toUpperCase())} />
        <select className="rent-form-select" style={{ width: 'auto', minWidth: 120 }} aria-label="类型" value={indexType} onChange={(e) => setIndexType(e.target.value)}>
          <option value="">全部类型</option>
          <option value="sale">售价指数</option>
          <option value="rent">租金指数</option>
        </select>
        <div style={{ flex: 1 }} />
        <button className="rent-btn rent-btn--primary rent-btn--sm" onClick={() => setCreateOpen(true)}>+ 发布指数</button>
      </div>

      <div className="rent-card">
        <div className="rent-card__header"><h3 className="rent-card__title">市场指数</h3><span className="rent-badge rent-badge--neutral">{items.length} 条</span></div>
        <div className="rent-card__body" style={{ padding: 0 }}>
          {loading ? (
            <div className="rent-empty rent-text-muted">加载中...</div>
          ) : items.length === 0 ? (
            <div className="rent-empty rent-text-muted">暂无市场指数数据</div>
          ) : (
            <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
              <table className="rent-table">
                <thead><tr><th>市场</th><th>类型</th><th>周期</th><th style={{ textAlign: 'right' }}>指数值</th><th style={{ textAlign: 'right' }}>环比%</th><th style={{ textAlign: 'right' }}>采样</th><th style={{ textAlign: 'right' }}>均价/㎡</th></tr></thead>
                <tbody>
                  {items.map((i) => (
                    <tr key={i.id}>
                      <td><span className="rent-mono">{i.market_code || '—'}</span></td>
                      <td>{i.index_type === 'sale' ? '售价指数' : i.index_type === 'rent' ? '租金指数' : i.index_type || '—'}</td>
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
        <div className="rent-modal-backdrop" onClick={() => setCreateOpen(false)}>
          <div className="rent-modal" style={{ width: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="rent-modal__header"><h3 className="rent-card__title">发布市场指数</h3></div>
            <div className="rent-modal__body">
              <div className="rent-form-row">
                <div className="rent-form-group"><label className="rent-form-label">市场代码 *</label><input className="rent-form-input" value={form.market_code} onChange={setField('market_code')} /></div>
                <div className="rent-form-group"><label className="rent-form-label">周期(YYYY-MM) *</label><input className="rent-form-input" value={form.period} onChange={setField('period')} placeholder="2026-09" /></div>
              </div>
              <div className="rent-form-row">
                <div className="rent-form-group"><label className="rent-form-label">类型</label>
                  <select className="rent-form-select" value={form.index_type} onChange={setField('index_type')}>
                    <option value="sale">售价指数</option><option value="rent">租金指数</option>
                  </select>
                </div>
                <div className="rent-form-group"><label className="rent-form-label">币种</label><input className="rent-form-input" value={form.currency} onChange={setField('currency')} /></div>
              </div>
              <div className="rent-form-row">
                <div className="rent-form-group"><label className="rent-form-label">指数值 *</label><input className="rent-form-input" type="number" value={form.value} onChange={setField('value')} /></div>
                <div className="rent-form-group"><label className="rent-form-label">环比%</label><input className="rent-form-input" type="number" value={form.delta_pct} onChange={setField('delta_pct')} /></div>
              </div>
              <div className="rent-form-row">
                <div className="rent-form-group"><label className="rent-form-label">均价/㎡</label><input className="rent-form-input" type="number" value={form.avg_price_sqm} onChange={setField('avg_price_sqm')} /></div>
                <div className="rent-form-group"><label className="rent-form-label">采样数</label><input className="rent-form-input" type="number" value={form.sample_count} onChange={setField('sample_count')} /></div>
              </div>
            </div>
            <div className="rent-modal__footer">
              <button className="rent-btn rent-btn--secondary" onClick={() => setCreateOpen(false)}>取消</button>
              <button className="rent-btn rent-btn--primary" onClick={handleCreate} disabled={submitting}>{submitting ? '发布中...' : '发布'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/* ===== 市场报告 ===== */
const ReportsTab = () => {
  const [items, setItems] = useState<Report[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [markets, setMarkets] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState<any>({ market_code: '', report_type: 'district', area: '', property_type: '', period: '', summary: '', metrics_json: '' })

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await marketDataApi.reports({ page, pageSize: 10 })
      const payload = res.data?.data ?? res.data
      setItems(payload?.items ?? [])
      setTotal(payload?.total ?? 0)
    } catch (e: any) {
      message.error(e?.response?.data?.message || '获取报告失败')
    } finally {
      setLoading(false)
    }
  }, [page])

  useEffect(() => { fetchData() }, [fetchData])

  const loadMarkets = async () => {
    try {
      const res = await marketApi.list({ page: 1, pageSize: 100 })
      const payload = res.data?.data ?? res.data
      setMarkets(payload?.items ?? [])
    } catch { /* 忽略 */ }
  }

  const setField = (k: string) => (e: any) => setForm((f: any) => ({ ...f, [k]: e.target.value }))

  const handleCreate = async () => {
    if (!form.market_code || !form.period) {
      message.error('请选择市场并填写报告周期')
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
      message.success('报告已发布')
      setCreateOpen(false)
      setForm({ market_code: '', report_type: 'district', area: '', property_type: '', period: '', summary: '', metrics_json: '' })
      fetchData()
    } catch (e: any) {
      message.error(e?.response?.data?.message || '发布失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div className="rent-filter-bar">
        <span className="rent-text-muted">已发布的区域/类型市场研究报告</span>
        <div style={{ flex: 1 }} />
        <button className="rent-btn rent-btn--primary rent-btn--sm" onClick={() => { loadMarkets(); setCreateOpen(true) }}>+ 发布报告</button>
      </div>

      <div className="rent-card">
        <div className="rent-card__header"><h3 className="rent-card__title">市场报告</h3><span className="rent-badge rent-badge--neutral">共 {total} 份</span></div>
        <div className="rent-card__body" style={{ padding: 0 }}>
          {loading ? (
            <div className="rent-empty rent-text-muted">加载中...</div>
          ) : items.length === 0 ? (
            <div className="rent-empty rent-text-muted">暂无市场报告</div>
          ) : (
            <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
              <table className="rent-table">
                <thead><tr><th>市场</th><th>类型</th><th>区域</th><th>物业类型</th><th>周期</th><th>摘要</th><th>发布日期</th></tr></thead>
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
        <span className="rent-pagination__info">共 {total} 条</span>
        <button className="rent-pagination__btn" onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1}>上一页</button>
        <span className="rent-pagination__info">{page}</span>
        <button className="rent-pagination__btn" onClick={() => setPage(page + 1)} disabled={page * 10 >= total}>下一页</button>
      </div>

      {createOpen && (
        <div className="rent-modal-backdrop" onClick={() => setCreateOpen(false)}>
          <div className="rent-modal" style={{ width: 500 }} onClick={(e) => e.stopPropagation()}>
            <div className="rent-modal__header"><h3 className="rent-card__title">发布市场报告</h3></div>
            <div className="rent-modal__body">
              <div className="rent-form-row">
                <div className="rent-form-group" style={{ flex: 1 }}>
                  <label className="rent-form-label">市场 *</label>
                  <select className="rent-form-select" value={form.market_code} onChange={setField('market_code')}>
                    <option value="">请选择市场</option>
                    {markets.map((m) => <option key={m.id} value={m.market_code}>{m.market_code} · {m.country_name}</option>)}
                  </select>
                </div>
                <div className="rent-form-group"><label className="rent-form-label">周期(YYYY-MM) *</label><input className="rent-form-input" value={form.period} onChange={setField('period')} placeholder="2026-09" /></div>
              </div>
              <div className="rent-form-row">
                <div className="rent-form-group"><label className="rent-form-label">报告类型</label>
                  <select className="rent-form-select" value={form.report_type} onChange={setField('report_type')}>
                    <option value="district">区域报告</option><option value="city">城市报告</option><option value="type">物业类型</option>
                  </select>
                </div>
                <div className="rent-form-group"><label className="rent-form-label">物业类型</label><input className="rent-form-input" value={form.property_type} onChange={setField('property_type')} /></div>
              </div>
              <div className="rent-form-row">
                <div className="rent-form-group" style={{ flex: 1 }}><label className="rent-form-label">区域</label><input className="rent-form-input" value={form.area} onChange={setField('area')} /></div>
              </div>
              <div className="rent-form-row">
                <div className="rent-form-group" style={{ flex: 1 }}><label className="rent-form-label">摘要</label><textarea className="rent-form-textarea" rows={3} value={form.summary} onChange={setField('summary')} /></div>
              </div>
            </div>
            <div className="rent-modal__footer">
              <button className="rent-btn rent-btn--secondary" onClick={() => setCreateOpen(false)}>取消</button>
              <button className="rent-btn rent-btn--primary" onClick={handleCreate} disabled={submitting}>{submitting ? '发布中...' : '发布'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/* ===== 智能匹配（线索 → 房源推荐 → 推送租客） ===== */
const MatchesTab = () => {
  const [leads, setLeads] = useState<any[]>([])
  const [leadId, setLeadId] = useState('')
  const [items, setItems] = useState<Match[]>([])
  const [loading, setLoading] = useState(false)
  const [computing, setComputing] = useState(false)
  const [pushingId, setPushingId] = useState('')

  useEffect(() => {
    const loadLeads = async () => {
      try {
        const res = await leadsApi.list({ page: 1, pageSize: 100 })
        const payload = res.data?.data ?? res.data
        setLeads(payload?.items ?? [])
      } catch { /* 忽略：无权限时线索下拉为空 */ }
    }
    loadLeads()
  }, [])

  const fetchData = useCallback(async () => {
    if (!leadId) {
      setItems([])
      return
    }
    setLoading(true)
    try {
      const res = await marketDataApi.listMatches({ lead_id: leadId })
      setItems(res.data ?? [])
    } catch (e: any) {
      message.error(e?.response?.data?.detail || e?.response?.data?.message || '获取匹配结果失败')
    } finally {
      setLoading(false)
    }
  }, [leadId])

  useEffect(() => { fetchData() }, [fetchData])

  const handleCompute = async () => {
    if (!leadId) {
      message.error('请先选择客户线索')
      return
    }
    setComputing(true)
    try {
      const res = await marketDataApi.computeMatches({ lead_id: leadId, limit: 10 })
      message.success(`已生成 ${res.data?.total ?? 0} 条房源推荐`)
      await fetchData()
    } catch (e: any) {
      message.error(e?.response?.data?.detail || e?.response?.data?.message || '计算匹配失败')
    } finally {
      setComputing(false)
    }
  }

  const handleNotify = async (row: Match) => {
    setPushingId(row.id)
    try {
      const res = await marketDataApi.notifyMatch(row.id)
      if (res.data?.already_notified) {
        message.info('该推荐此前已推送给租客，未重复发送')
      } else {
        message.success('已推送给租客')
      }
      fetchData()
    } catch (e: any) {
      message.error(e?.response?.data?.detail || e?.response?.data?.message || '推送失败')
    } finally {
      setPushingId('')
    }
  }

  return (
    <>
      <div className="rent-filter-bar">
        <select className="rent-form-select" style={{ width: 'auto', minWidth: 200 }} aria-label="客户线索" value={leadId} onChange={(e) => setLeadId(e.target.value)}>
          <option value="">选择客户线索</option>
          {leads.map((l) => <option key={l.id} value={l.id}>{l.name || l.id}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <button className="rent-btn rent-btn--primary rent-btn--sm" onClick={handleCompute} disabled={computing || !leadId}>
          {computing ? '计算中...' : '计算匹配'}
        </button>
      </div>

      <div className="rent-card">
        <div className="rent-card__header">
          <h3 className="rent-card__title">房源推荐</h3>
          <span className="rent-badge rent-badge--neutral">{items.length} 条</span>
        </div>
        <div className="rent-card__body" style={{ padding: 0 }}>
          {!leadId ? (
            <div className="rent-empty rent-text-muted">请选择客户线索后点击「计算匹配」</div>
          ) : loading ? (
            <div className="rent-empty rent-text-muted">加载中...</div>
          ) : items.length === 0 ? (
            <div className="rent-empty rent-text-muted">该线索暂无匹配结果</div>
          ) : (
            <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
              <table className="rent-table">
                <thead><tr><th>房号</th><th>地址</th><th style={{ textAlign: 'right' }}>月租</th><th style={{ textAlign: 'right' }}>匹配度</th><th>推送状态</th><th>操作</th></tr></thead>
                <tbody>
                  {items.map((m) => (
                    <tr key={m.id}>
                      <td><span className="rent-mono">{m.room_number || '—'}</span></td>
                      <td style={{ maxWidth: 260 }} className="rent-text-sm">{m.address || '—'}</td>
                      <td className="rent-num">{m.monthly_rent != null ? `${fmtNum(m.monthly_rent)} ${m.currency || 'THB'}` : '—'}</td>
                      <td className="rent-num">{m.score ?? 0}</td>
                      <td>
                        {m.notified_at
                          ? <span className="rent-badge rent-badge--success">已推送 {String(m.notified_at).slice(0, 10)}</span>
                          : <span className="rent-badge rent-badge--neutral">未推送</span>}
                      </td>
                      <td>
                        <button
                          className="rent-btn rent-btn--secondary rent-btn--sm"
                          onClick={() => handleNotify(m)}
                          disabled={pushingId === m.id}
                        >
                          {pushingId === m.id ? '推送中...' : '推送租客'}
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
const ChurnTab = () => {
  const [items, setItems] = useState<Signal[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [level, setLevel] = useState('')
  const [resolved, setResolved] = useState('')
  const [leads, setLeads] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState<any>({ signal_type: 'lease_expiring', level: 'warning', detail: '', suggested_action: '', lead_id: '' })
  // 派发跟进
  const [employees, setEmployees] = useState<any[]>([])
  const [assignOpen, setAssignOpen] = useState(false)
  const [assignSignal, setAssignSignal] = useState<Signal | null>(null)
  const [assignForm, setAssignForm] = useState({ assignee_id: '', note: '' })
  const [assigning, setAssigning] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await marketDataApi.churnSignals({
        page, pageSize: 10,
        level: level || undefined,
        is_resolved: resolved === '' ? undefined : resolved === '1',
      })
      const payload = res.data?.data ?? res.data
      setItems(payload?.items ?? [])
      setTotal(payload?.total ?? 0)
    } catch (e: any) {
      message.error(e?.response?.data?.message || '获取预警信号失败')
    } finally {
      setLoading(false)
    }
  }, [page, level, resolved])

  useEffect(() => { fetchData() }, [fetchData])

  const loadLeads = async () => {
    try {
      const res = await leadsApi.list({ page: 1, pageSize: 100 })
      const payload = res.data?.data ?? res.data
      setLeads(payload?.items ?? [])
    } catch { /* 忽略 */ }
  }

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
      message.success('预警信号已生成')
      setCreateOpen(false)
      setForm({ signal_type: 'lease_expiring', level: 'warning', detail: '', suggested_action: '', lead_id: '' })
      fetchData()
    } catch (e: any) {
      message.error(e?.response?.data?.message || '生成失败')
    } finally {
      setSubmitting(false)
    }
  }

  const resolve = async (id: string) => {
    try {
      await marketDataApi.resolveChurnSignal(id)
      message.success('已标记为处理完成')
      fetchData()
    } catch (e: any) {
      message.error(e?.response?.data?.message || '处理失败')
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
      message.success(res.data?.reassigned ? '已重新派发跟进人' : '已派发跟进')
      setAssignOpen(false)
      fetchData()
    } catch (e: any) {
      message.error(e?.response?.data?.detail || e?.response?.data?.message || '派发失败')
    } finally {
      setAssigning(false)
    }
  }

  const summary = items.filter((s) => !s.is_resolved).length

  return (
    <>
      <div className="rent-filter-bar">
        <select className="rent-form-select" style={{ width: 'auto', minWidth: 120 }} aria-label="级别" value={level} onChange={(e) => { setLevel(e.target.value); setPage(1) }}>
          <option value="">全部级别</option>
          <option value="info">提示</option><option value="warning">警告</option><option value="high">高危</option>
        </select>
        <select className="rent-form-select" style={{ width: 'auto', minWidth: 130 }} aria-label="处理状态" value={resolved} onChange={(e) => { setResolved(e.target.value); setPage(1) }}>
          <option value="">全部</option><option value="0">未处理</option><option value="1">已处理</option>
        </select>
        <div style={{ flex: 1 }} />
        <span className="rent-badge rent-badge--warning">待处理 {summary} 条</span>
        <button className="rent-btn rent-btn--primary rent-btn--sm" onClick={() => { loadLeads(); setCreateOpen(true) }}>+ 生成信号</button>
      </div>

      <div className="rent-card">
        <div className="rent-card__header"><h3 className="rent-card__title">流失预警信号</h3><span className="rent-badge rent-badge--neutral">共 {total} 条</span></div>
        <div className="rent-card__body" style={{ padding: 0 }}>
          {loading ? (
            <div className="rent-empty rent-text-muted">加载中...</div>
          ) : items.length === 0 ? (
            <div className="rent-empty rent-text-muted">暂无流失预警信号</div>
          ) : (
            <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
              <table className="rent-table">
                <thead><tr><th>类型</th><th>级别</th><th>详情</th><th>建议动作</th><th>触发时间</th><th>跟进人</th><th>状态</th><th>操作</th></tr></thead>
                <tbody>
                  {items.map((s) => {
                    const lv = SIGNAL_LEVEL[s.level || 'info'] || SIGNAL_LEVEL.info
                    const typeLabel = s.signal_type === 'lease_expiring' ? '租约到期' : s.signal_type === 'payment_delay' ? '付款延迟' : s.signal_type === 'low_engagement' ? '低活跃' : s.signal_type || '—'
                    return (
                      <tr key={s.id}>
                        <td><span className="rent-badge rent-badge--info">{typeLabel}</span></td>
                        <td><span className={`rent-badge ${lv.badge}`}>{lv.label}</span></td>
                        <td style={{ maxWidth: 260 }} className="rent-text-sm">{s.detail || '—'}</td>
                        <td className="rent-text-sm">{s.suggested_action || '—'}</td>
                        <td className="rent-table__mono">{s.triggered_at ? String(s.triggered_at).slice(0, 16) : '—'}</td>
                        <td className="rent-text-sm">
                          {s.assigned_to_name || (s.assigned_to ? String(s.assigned_to).slice(0, 8) : '未派发')}
                        </td>
                        <td>
                          {s.is_resolved
                            ? <span className="rent-badge rent-badge--success">已处理</span>
                            : <span className="rent-badge rent-badge--error">未处理</span>}
                        </td>
                        <td>
                          {!s.is_resolved && (
                            <div className="rent-flex rent-gap-2">
                              <button className="rent-btn rent-btn--secondary rent-btn--sm" onClick={() => openAssign(s)}>派发跟进</button>
                              <button className="rent-btn rent-btn--primary rent-btn--sm" onClick={() => resolve(s.id)}>标记处理</button>
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
        <span className="rent-pagination__info">共 {total} 条</span>
        <button className="rent-pagination__btn" onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1}>上一页</button>
        <span className="rent-pagination__info">{page}</span>
        <button className="rent-pagination__btn" onClick={() => setPage(page + 1)} disabled={page * 10 >= total}>下一页</button>
      </div>

      {createOpen && (
        <div className="rent-modal-backdrop" onClick={() => setCreateOpen(false)}>
          <div className="rent-modal" style={{ width: 460 }} onClick={(e) => e.stopPropagation()}>
            <div className="rent-modal__header"><h3 className="rent-card__title">生成流失预警信号</h3></div>
            <div className="rent-modal__body">
              <div className="rent-form-row">
                <div className="rent-form-group"><label className="rent-form-label">类型</label>
                  <select className="rent-form-select" value={form.signal_type} onChange={setField('signal_type')}>
                    <option value="lease_expiring">租约到期</option><option value="payment_delay">付款延迟</option><option value="low_engagement">低活跃</option>
                  </select>
                </div>
                <div className="rent-form-group"><label className="rent-form-label">级别</label>
                  <select className="rent-form-select" value={form.level} onChange={setField('level')}>
                    <option value="info">提示</option><option value="warning">警告</option><option value="high">高危</option>
                  </select>
                </div>
              </div>
              <div className="rent-form-row">
                <div className="rent-form-group" style={{ flex: 1 }}><label className="rent-form-label">关联线索</label>
                  <select className="rent-form-select" value={form.lead_id} onChange={setField('lead_id')}>
                    <option value="">不关联</option>
                    {leads.map((l) => <option key={l.id} value={l.id}>{l.name || l.id}</option>)}
                  </select>
                </div>
              </div>
              <div className="rent-form-row">
                <div className="rent-form-group" style={{ flex: 1 }}><label className="rent-form-label">详情</label><textarea className="rent-form-textarea" rows={3} value={form.detail} onChange={setField('detail')} /></div>
              </div>
              <div className="rent-form-row">
                <div className="rent-form-group" style={{ flex: 1 }}><label className="rent-form-label">建议动作</label><input className="rent-form-input" value={form.suggested_action} onChange={setField('suggested_action')} /></div>
              </div>
            </div>
            <div className="rent-modal__footer">
              <button className="rent-btn rent-btn--secondary" onClick={() => setCreateOpen(false)}>取消</button>
              <button className="rent-btn rent-btn--primary" onClick={handleCreate} disabled={submitting}>{submitting ? '生成中...' : '生成'}</button>
            </div>
          </div>
        </div>
      )}

      {assignOpen && assignSignal && (
        <div className="rent-modal-backdrop" onClick={() => setAssignOpen(false)}>
          <div className="rent-modal" style={{ width: 460 }} onClick={(e) => e.stopPropagation()}>
            <div className="rent-modal__header"><h3 className="rent-card__title">派发跟进</h3></div>
            <div className="rent-modal__body">
              <p className="rent-text-sm rent-text-muted" style={{ marginBottom: 12 }}>
                {assignSignal.detail || '该租客存在流失风险'}
                {assignSignal.suggested_action ? ` · 建议动作：${assignSignal.suggested_action}` : ''}
              </p>
              <div className="rent-form-row">
                <div className="rent-form-group" style={{ flex: 1 }}>
                  <label className="rent-form-label">跟进员工</label>
                  <select
                    className="rent-form-select"
                    aria-label="跟进员工"
                    value={assignForm.assignee_id}
                    onChange={(e) => setAssignForm((f) => ({ ...f, assignee_id: e.target.value }))}
                  >
                    <option value="">按租约负责员工自动派发</option>
                    {employees.map((e) => (
                      <option key={e.id} value={e.id}>{e.full_name || e.employee_no || e.id}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="rent-form-row">
                <div className="rent-form-group" style={{ flex: 1 }}>
                  <label className="rent-form-label">跟进备注</label>
                  <textarea
                    className="rent-form-textarea"
                    rows={3}
                    aria-label="跟进备注"
                    value={assignForm.note}
                    onChange={(e) => setAssignForm((f) => ({ ...f, note: e.target.value }))}
                  />
                </div>
              </div>
              <p className="rent-text-sm rent-text-muted">派发后会给该员工发送站内待办通知，处理完成请回到本页标记为已处理。</p>
            </div>
            <div className="rent-modal__footer">
              <button className="rent-btn rent-btn--secondary" onClick={() => setAssignOpen(false)}>取消</button>
              <button className="rent-btn rent-btn--primary" onClick={handleAssign} disabled={assigning}>{assigning ? '派发中...' : '确认派发'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default MarketIntelligence