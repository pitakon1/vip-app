import { useCallback, useEffect, useState } from 'react'
import { message } from 'antd'
import { brokerApi, propertyDealApi } from '@/services/api'

const BROKER_TYPE: Record<string, string> = {
  individual: '独立经纪人',
  agency: '中介机构',
  franchise: '加盟商',
  affiliate: '转介绍影响者',
}

const BROKER_LEVEL: Record<string, string> = {
  silver: '白银',
  gold: '黄金',
  platinum: '铂金',
  franchisor: '加盟总代',
}

const BROKER_STATUS: Record<string, { label: string; badge: string }> = {
  pending: { label: '待审批', badge: 'rent-badge--warning' },
  active: { label: '已激活', badge: 'rent-badge--success' },
  suspended: { label: '已暂停', badge: 'rent-badge--error' },
  terminated: { label: '已终止', badge: 'rent-badge--neutral' },
}

interface Broker {
  id: string
  partner_name?: string
  broker_type?: string
  level?: string
  status?: string
  invite_code?: string
  contact_name?: string
  contact_phone?: string
  contact_email?: string
  country?: string
  base_rate?: number
}

interface Referral {
  id: string
  invite_code?: string
  referred_name?: string
  referred_phone?: string
  source?: string
  status?: string
  created_at?: string
}

const TABS = [
  { key: 'brokers', label: '渠道商' },
  { key: 'referrals', label: '转介绍记录' },
  { key: 'split', label: '联合单分成' },
]

const shortId = (id?: string) => (id ? String(id).slice(0, 8) : '—')

const Distribution = () => {
  const [activeTab, setActiveTab] = useState('brokers')
  return (
    <div className="rent-main">
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title">分销体系</h2>
          <p className="rent-page-header__subtitle">
            渠道商登记、定级审批、转介绍裂变与联合单佣金分成
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

      {activeTab === 'brokers' && <BrokersTab />}
      {activeTab === 'referrals' && <ReferralsTab />}
      {activeTab === 'split' && <SplitTab />}
    </div>
  )
}

/* ===== 渠道商 Tab ===== */
const BrokersTab = () => {
  const [items, setItems] = useState<Broker[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [level, setLevel] = useState('')
  const [loading, setLoading] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [approveBroker, setApproveBroker] = useState<Broker | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState<any>({ partner_name: '', broker_type: 'individual', contact_name: '', contact_phone: '', contact_email: '', country: 'TH', base_rate: '' })
  const [approveForm, setApproveForm] = useState<any>({ level: 'silver', base_rate: '' })

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await brokerApi.list({ page, pageSize: 10, status: status || undefined, level: level || undefined })
      const payload = res.data?.data ?? res.data
      setItems(payload?.items ?? [])
      setTotal(payload?.total ?? 0)
    } catch (e: any) {
      message.error(e?.response?.data?.message || '获取渠道商列表失败')
    } finally {
      setLoading(false)
    }
  }, [page, status, level])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const setField = (k: string) => (e: any) => setForm((f: any) => ({ ...f, [k]: e.target.value }))
  const setApproveField = (k: string) => (e: any) => setApproveForm((f: any) => ({ ...f, [k]: e.target.value }))

  const handleCreate = async () => {
    if (!form.partner_name) {
      message.error('请填写渠道商名称')
      return
    }
    setSubmitting(true)
    try {
      await brokerApi.create({
        partner_name: form.partner_name,
        broker_type: form.broker_type,
        contact_name: form.contact_name || undefined,
        contact_phone: form.contact_phone || undefined,
        contact_email: form.contact_email || undefined,
        country: form.country || 'TH',
        base_rate: form.base_rate ? Number(form.base_rate) : 0,
      })
      message.success('渠道商已登记（待审批）')
      setCreateOpen(false)
      fetchData()
    } catch (e: any) {
      message.error(e?.response?.data?.message || '登记失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleApprove = async () => {
    if (!approveBroker) return
    setSubmitting(true)
    try {
      await brokerApi.approve(approveBroker.id, {
        level: approveForm.level,
        base_rate: approveForm.base_rate ? Number(approveForm.base_rate) : 0,
      })
      message.success('已审批并定级')
      setApproveBroker(null)
      fetchData()
    } catch (e: any) {
      message.error(e?.response?.data?.message || '审批失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleSuspend = async (b: Broker) => {
    try {
      await brokerApi.suspend(b.id)
      message.success('渠道商已暂停')
      fetchData()
    } catch (e: any) {
      message.error(e?.response?.data?.message || '暂停失败')
    }
  }

  const openApprove = (b: Broker) => {
    setApproveForm({ level: b.level || 'silver', base_rate: b.base_rate != null ? String(b.base_rate) : '' })
    setApproveBroker(b)
  }

  return (
    <>
      <div className="rent-filter-bar">
        <select className="rent-form-select" style={{ width: 'auto', minWidth: 130 }} aria-label="状态" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
          <option value="">全部状态</option>
          {Object.keys(BROKER_STATUS).map((k) => <option key={k} value={k}>{BROKER_STATUS[k].label}</option>)}
        </select>
        <select className="rent-form-select" style={{ width: 'auto', minWidth: 120 }} aria-label="等级" value={level} onChange={(e) => { setLevel(e.target.value); setPage(1) }}>
          <option value="">全部等级</option>
          {Object.keys(BROKER_LEVEL).map((k) => <option key={k} value={k}>{BROKER_LEVEL[k]}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <button className="rent-btn rent-btn--primary rent-btn--sm" onClick={() => setCreateOpen(true)}>+ 登记渠道商</button>
      </div>

      <div className="rent-card">
        <div className="rent-card__header"><h3 className="rent-card__title">渠道商列表</h3><span className="rent-badge rent-badge--neutral">共 {total} 条</span></div>
        <div className="rent-card__body" style={{ padding: 0 }}>
          {loading ? (
            <div className="rent-empty rent-text-muted">加载中...</div>
          ) : items.length === 0 ? (
            <div className="rent-empty rent-text-muted">暂无渠道商</div>
          ) : (
            <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
              <table className="rent-table">
                <thead><tr><th>名称</th><th>类型</th><th>等级</th><th>状态</th><th>邀请码</th><th>地区</th><th style={{ textAlign: 'right' }}>费率%</th><th>操作</th></tr></thead>
                <tbody>
                  {items.map((b) => {
                    const st = BROKER_STATUS[b.status || 'pending'] || BROKER_STATUS.pending
                    return (
                      <tr key={b.id}>
                        <td>{b.partner_name}</td>
                        <td>{BROKER_TYPE[b.broker_type || ''] || '—'}</td>
                        <td>{b.level ? BROKER_LEVEL[b.level] : '—'}</td>
                        <td><span className={`rent-badge ${st.badge}`}>{st.label}</span></td>
                        <td><span className="rent-mono">{b.invite_code || '—'}</span></td>
                        <td>{b.country || '—'}</td>
                        <td className="rent-num">{b.base_rate ?? 0}</td>
                        <td>
                          <div className="rent-flex rent-gap-2">
                            {b.status === 'pending' && (
                              <button className="rent-btn rent-btn--primary rent-btn--sm" onClick={() => openApprove(b)}>审批定级</button>
                            )}
                            {(b.status === 'active' || b.status === 'terminated') && (
                              <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => handleSuspend(b)}>暂停</button>
                            )}
                            <span className="rent-text-muted rent-text-sm">#{shortId(b.id)}</span>
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

      <div className="rent-pagination">
        <span className="rent-pagination__info">共 {total} 条</span>
        <button className="rent-pagination__btn" onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1}>上一页</button>
        <span className="rent-pagination__info">{page}</span>
        <button className="rent-pagination__btn" onClick={() => setPage(page + 1)} disabled={page * 10 >= total}>下一页</button>
      </div>

      {createOpen && (
        <div className="rent-modal-backdrop" onClick={() => setCreateOpen(false)}>
          <div className="rent-modal" style={{ width: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="rent-modal__header"><h3 className="rent-card__title">登记渠道商</h3></div>
            <div className="rent-modal__body">
              <div className="rent-form-row">
                <div className="rent-form-group" style={{ flex: 1 }}><label className="rent-form-label">渠道商名称 *</label><input className="rent-form-input" value={form.partner_name} onChange={setField('partner_name')} /></div>
              </div>
              <div className="rent-form-row">
                <div className="rent-form-group"><label className="rent-form-label">类型</label>
                  <select className="rent-form-select" value={form.broker_type} onChange={setField('broker_type')}>
                    {Object.keys(BROKER_TYPE).map((k) => <option key={k} value={k}>{BROKER_TYPE[k]}</option>)}
                  </select>
                </div>
                <div className="rent-form-group"><label className="rent-form-label">国家/地区</label><input className="rent-form-input" value={form.country} onChange={setField('country')} /></div>
              </div>
              <div className="rent-form-row">
                <div className="rent-form-group"><label className="rent-form-label">联系人</label><input className="rent-form-input" value={form.contact_name} onChange={setField('contact_name')} /></div>
                <div className="rent-form-group"><label className="rent-form-label">电话</label><input className="rent-form-input" value={form.contact_phone} onChange={setField('contact_phone')} /></div>
              </div>
              <div className="rent-form-row">
                <div className="rent-form-group"><label className="rent-form-label">邮箱</label><input className="rent-form-input" value={form.contact_email} onChange={setField('contact_email')} /></div>
                <div className="rent-form-group"><label className="rent-form-label">默认费率%</label><input className="rent-form-input" type="number" value={form.base_rate} onChange={setField('base_rate')} /></div>
              </div>
            </div>
            <div className="rent-modal__footer">
              <button className="rent-btn rent-btn--secondary" onClick={() => setCreateOpen(false)}>取消</button>
              <button className="rent-btn rent-btn--primary" onClick={handleCreate} disabled={submitting}>{submitting ? '登记中...' : '登记'}</button>
            </div>
          </div>
        </div>
      )}

      {approveBroker && (
        <div className="rent-modal-backdrop" onClick={() => setApproveBroker(null)}>
          <div className="rent-modal" style={{ width: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className="rent-modal__header"><h3 className="rent-card__title">审批定级 · {approveBroker.partner_name}</h3></div>
            <div className="rent-modal__body">
              <div className="rent-form-row">
                <div className="rent-form-group"><label className="rent-form-label">等级</label>
                  <select className="rent-form-select" value={approveForm.level} onChange={setApproveField('level')}>
                    {Object.keys(BROKER_LEVEL).map((k) => <option key={k} value={k}>{BROKER_LEVEL[k]}</option>)}
                  </select>
                </div>
                <div className="rent-form-group"><label className="rent-form-label">费率%</label><input className="rent-form-input" type="number" value={approveForm.base_rate} onChange={setApproveField('base_rate')} /></div>
              </div>
              <div className="rent-form-hint">审批后将激活该渠道商并生成邀请码。</div>
            </div>
            <div className="rent-modal__footer">
              <button className="rent-btn rent-btn--secondary" onClick={() => setApproveBroker(null)}>取消</button>
              <button className="rent-btn rent-btn--primary" onClick={handleApprove} disabled={submitting}>{submitting ? '审批中...' : '确认审批'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/* ===== 转介绍记录 Tab ===== */
const ReferralsTab = () => {
  const [items, setItems] = useState<Referral[]>([])
  const [loading, setLoading] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState<any>({ invite_code: '', referred_name: '', referred_phone: '' })

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await brokerApi.myReferrals()
      setItems(res.data ?? [])
    } catch (e: any) {
      message.error(e?.response?.data?.message || '获取转介绍记录失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const setField = (k: string) => (e: any) => setForm((f: any) => ({ ...f, [k]: e.target.value }))

  const handleCreate = async () => {
    if (!form.invite_code) {
      message.error('请填写邀请码')
      return
    }
    setSubmitting(true)
    try {
      await brokerApi.createReferral({
        invite_code: form.invite_code,
        referred_name: form.referred_name || undefined,
        referred_phone: form.referred_phone || undefined,
        source: 'link',
      })
      message.success('转介绍已记录')
      setCreateOpen(false)
      setForm({ invite_code: '', referred_name: '', referred_phone: '' })
      fetchData()
    } catch (e: any) {
      message.error(e?.response?.data?.message || '记录失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div className="rent-filter-bar">
        <span className="rent-text-muted">当前用户作为推荐人的转介绍记录</span>
        <div style={{ flex: 1 }} />
        <button className="rent-btn rent-btn--primary rent-btn--sm" onClick={() => setCreateOpen(true)}>+ 记录转介绍</button>
      </div>

      <div className="rent-card">
        <div className="rent-card__header"><h3 className="rent-card__title">转介绍记录</h3><span className="rent-badge rent-badge--neutral">{items.length} 条</span></div>
        <div className="rent-card__body" style={{ padding: 0 }}>
          {loading ? (
            <div className="rent-empty rent-text-muted">加载中...</div>
          ) : items.length === 0 ? (
            <div className="rent-empty rent-text-muted">暂无转介绍记录</div>
          ) : (
            <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
              <table className="rent-table">
                <thead><tr><th>邀请码</th><th>被推荐人</th><th>电话</th><th>渠道</th><th>状态</th><th>日期</th></tr></thead>
                <tbody>
                  {items.map((r) => (
                    <tr key={r.id}>
                      <td><span className="rent-mono">{r.invite_code || '—'}</span></td>
                      <td>{r.referred_name || '—'}</td>
                      <td>{r.referred_phone || '—'}</td>
                      <td>{r.source || '—'}</td>
                      <td><span className="rent-badge rent-badge--info">{r.status || 'referred'}</span></td>
                      <td className="rent-table__mono">{r.created_at ? String(r.created_at).slice(0, 10) : '—'}</td>
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
          <div className="rent-modal" style={{ width: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className="rent-modal__header"><h3 className="rent-card__title">记录转介绍</h3></div>
            <div className="rent-modal__body">
              <div className="rent-form-row">
                <div className="rent-form-group" style={{ flex: 1 }}><label className="rent-form-label">邀请码 *</label><input className="rent-form-input" value={form.invite_code} onChange={setField('invite_code')} /></div>
              </div>
              <div className="rent-form-row">
                <div className="rent-form-group"><label className="rent-form-label">被推荐人</label><input className="rent-form-input" value={form.referred_name} onChange={setField('referred_name')} /></div>
                <div className="rent-form-group"><label className="rent-form-label">电话</label><input className="rent-form-input" value={form.referred_phone} onChange={setField('referred_phone')} /></div>
              </div>
            </div>
            <div className="rent-modal__footer">
              <button className="rent-btn rent-btn--secondary" onClick={() => setCreateOpen(false)}>取消</button>
              <button className="rent-btn rent-btn--primary" onClick={handleCreate} disabled={submitting}>{submitting ? '记录中...' : '记录'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/* ===== 联合单分成 Tab ===== */
const SplitTab = () => {
  const [deals, setDeals] = useState<any[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<string>('')
  const [form, setForm] = useState<any>({ deal_id: '', commission_total: '', currency: 'THB', participants: [{ role: 'agent', rate: '100', kind: 'user_id', subject: '' }] })

  useEffect(() => {
    propertyDealApi.list({ page: 1, pageSize: 100 })
      .then((res) => {
        const payload = res.data?.data ?? res.data
        setDeals(payload?.items ?? [])
      })
      .catch(() => { /* 忽略 */ })
  }, [])

  const setField = (k: string) => (e: any) => setForm((f: any) => ({ ...f, [k]: e.target.value }))

  const updateParticipant = (idx: number, k: string, v: string) => {
    setForm((f: any) => ({
      ...f,
      participants: f.participants.map((p: any, i: number) => (i === idx ? { ...p, [k]: v } : p)),
    }))
  }

  const addParticipant = () => setForm((f: any) => ({ ...f, participants: [...f.participants, { role: 'agent', rate: '0', kind: 'user_id', subject: '' }] }))
  const removeParticipant = (idx: number) => setForm((f: any) => ({ ...f, participants: f.participants.filter((_: any, i: number) => i !== idx) }))

  const buildPayload = () => {
    return form.participants.map((p: any) => {
      const row: any = { role: p.role, rate: Number(p.rate || 0) }
      if (p.subject) {
        if (p.kind === 'employee_id') row.employee_id = p.subject
        else if (p.kind === 'partner_id') row.partner_id = p.subject
        else row.user_id = p.subject
      }
      return row
    })
  }

  const handleSubmit = async () => {
    if (!form.deal_id || !form.commission_total) {
      message.error('请选择成交并填写佣金总额')
      return
    }
    setSubmitting(true)
    try {
      const res = await brokerApi.createSplitDeal({
        deal_id: form.deal_id,
        commission_total: Number(form.commission_total),
        currency: form.currency || 'THB',
        participants: buildPayload(),
      })
      const payload = res.data ?? {}
      const splits = payload.splits ?? []
      const sum = splits.reduce((acc: number, s: any) => acc + Number(s.rate || 0), 0)
      if (sum > 100) message.warning('提醒：分成比例合计超过 100%')
      setResult(JSON.stringify(payload, null, 2))
      message.success('联合单分成已登记')
    } catch (e: any) {
      message.error(e?.response?.data?.message || '分成登记失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="rent-card">
      <div className="rent-card__header"><h3 className="rent-card__title">联合单分成登记</h3></div>
      <div className="rent-card__body">
        <div className="rent-form-row">
          <div className="rent-form-group" style={{ flex: 1 }}>
            <label className="rent-form-label">关联成交 *</label>
            <select className="rent-form-select" value={form.deal_id} onChange={setField('deal_id')}>
              <option value="">请选择成交</option>
              {deals.map((d) => <option key={d.id} value={d.id}>成交 {shortId(d.id)} · {d.currency || '-'}{Number(d.sale_price || 0).toLocaleString()}</option>)}
            </select>
          </div>
        </div>
        <div className="rent-form-row">
          <div className="rent-form-group"><label className="rent-form-label">佣金总额 *</label><input className="rent-form-input" type="number" value={form.commission_total} onChange={setField('commission_total')} /></div>
          <div className="rent-form-group"><label className="rent-form-label">币种</label><input className="rent-form-input" value={form.currency} onChange={setField('currency')} /></div>
        </div>

        <label className="rent-form-label">参与分成（rate 为 0-100 的百分比）</label>
        {form.participants.map((p: any, idx: number) => (
          <div className="rent-form-row" key={idx} style={{ marginBottom: 8 }}>
            <select className="rent-form-select" style={{ width: 120, minWidth: 120 }} aria-label="角色" value={p.role} onChange={(e) => updateParticipant(idx, 'role', e.target.value)}>
              <option value="agent">经纪人</option>
              <option value="employee">员工</option>
              <option value="broker">渠道商</option>
              <option value="referral">转介绍</option>
            </select>
            <select className="rent-form-select" style={{ width: 130, minWidth: 130 }} aria-label="类型" value={p.kind} onChange={(e) => updateParticipant(idx, 'kind', e.target.value)}>
              <option value="user_id">用户ID</option>
              <option value="employee_id">员工ID</option>
              <option value="partner_id">渠道商ID</option>
            </select>
            <input className="rent-form-input" style={{ flex: 1 }} placeholder="参与人 ID" value={p.subject} onChange={(e) => updateParticipant(idx, 'subject', e.target.value)} />
            <input className="rent-form-input" style={{ width: 90, minWidth: 90 }} type="number" placeholder="rate%" value={p.rate} onChange={(e) => updateParticipant(idx, 'rate', e.target.value)} />
            <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => removeParticipant(idx)}>移除</button>
          </div>
        ))}
        <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={addParticipant}>+ 添加参与人</button>

        <div className="rent-flex rent-gap-2" style={{ marginTop: 16 }}>
          <button className="rent-btn rent-btn--primary" onClick={handleSubmit} disabled={submitting}>{submitting ? '提交中...' : '提交分成'}</button>
        </div>

        {result && (
          <div className="rent-card" style={{ marginTop: 16 }}>
            <div className="rent-card__header"><h3 className="rent-card__title">登记结果</h3></div>
            <div className="rent-card__body"><pre className="rent-text-sm" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{result}</pre></div>
          </div>
        )}
      </div>
    </div>
  )
}

export default Distribution