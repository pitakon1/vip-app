import { useCallback, useEffect, useMemo, useState } from 'react'
import { message } from 'antd'
import { financialApi } from '@/services/api'
import './reconciliation.css'

interface Totals {
  received: number
  receivable: number
  overdue: number
  count: number
}

interface ByProperty {
  property_id: string
  property: string
  received: number
  receivable: number
  overdue: number
  count: number
}

interface RecordItem {
  property: string
  amount: number
  currency: string
  payment_type: string
  bucket: 'received' | 'pending' | 'overdue'
  channel: string
  due_date: string
  paid_at: string
  created_at: string
}

interface ReconData {
  totals: Totals
  by_property: ByProperty[]
  records: RecordItem[]
  records_total: number
}

const BUCKET_META: Record<RecordItem['bucket'], { label: string; badge: string; dot: string }> = {
  received: { label: '已收', badge: 'rent-badge--success', dot: 'var(--state-success)' },
  pending: { label: '应收未付', badge: 'rent-badge--warning', dot: 'var(--state-warning)' },
  overdue: { label: '逾期', badge: 'rent-badge--error', dot: 'var(--state-error)' },
}

const PAY_TYPE_TEXT: Record<string, string> = {
  rent: '租金',
  deposit: '押金',
  commission: '佣金',
  service_fee: '服务费',
  utility: '水电费',
  tax: '税费',
}

const payTypeText = (t: string) => PAY_TYPE_TEXT[t] || t || '—'

const fmtMoney = (v: number, currency?: string) => {
  const symbol = currency === 'CNY' ? '¥' : currency === 'THB' ? '฿' : currency === 'EUR' ? '€' : '¥'
  return `${symbol}${Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const Reconciliation = () => {
  const [data, setData] = useState<ReconData>({ totals: { received: 0, receivable: 0, overdue: 0, count: 0 }, by_property: [], records: [], records_total: 0 })
  const [loading, setLoading] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [payType, setPayType] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await financialApi.reconciliation()
      const payload = res.data?.data ?? res.data
      const records = payload?.records ?? []
      setData({
        totals: payload?.totals ?? { received: 0, receivable: 0, overdue: 0, count: 0 },
        by_property: payload?.by_property ?? [],
        records,
        records_total: payload?.records_total ?? records.length,
      })
    } catch (err: any) {
      message.error(err?.response?.data?.message || '获取财务对账数据失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const t = data.totals
  const statCards = [
    { label: '已收款项', value: fmtMoney(t.received), sub: '资金已到账', badge: 'rent-badge--success', delta: 'rent-stat-card__delta--up' },
    { label: '应收款项', value: fmtMoney(t.receivable), sub: '待回款总额', badge: 'rent-badge--warning', delta: '' },
    { label: '逾期款项', value: fmtMoney(t.overdue), sub: '需尽快催收', badge: 'rent-badge--error', delta: '' },
    { label: '对账笔数', value: String(t.count ?? 0), sub: '累计明细记录', badge: 'rent-badge--neutral', delta: '' },
  ]

  const kw = keyword.trim().toLowerCase()
  const visibleRecords = useMemo(() => {
    return data.records.filter((r) => {
      if (payType && r.payment_type !== payType) return false
      if (!kw) return true
      return [r.property, r.channel, r.currency, r.due_date].some((v) => String(v || '').toLowerCase().includes(kw))
    })
  }, [data.records, kw, payType])

  return (
    <div className="rent-main">
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title">财务对账</h2>
          <p className="rent-page-header__subtitle">按房源汇总已收、应收与逾期款项，核对每笔明细</p>
        </div>
        <div className="rent-page-header__actions">
          <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={fetchData} disabled={loading}>
            刷新
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="rent-grid rent-grid--4 rent-mb-5">
        {statCards.map((c) => (
          <div className="rent-stat-card" key={c.label}>
            <div className="rent-stat-card__head">
              <div>
                <div className="rent-stat-card__label">{c.label}</div>
                <div className="rent-stat-card__value recon-table-num">{c.value}</div>
                <span className={`rent-badge ${c.badge}`}>{c.sub}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* By Property */}
      <div className="rent-card rent-mb-5">
        <div className="rent-card__header">
          <h3 className="rent-card__title">按房源汇总</h3>
          <span className="rent-badge rent-badge--neutral">{data.by_property.length} 套房源</span>
        </div>
        <div className="rent-card__body" style={{ padding: 0 }}>
          {data.by_property.length === 0 ? (
            <div className="rent-empty rent-text-muted">暂无房源对账数据</div>
          ) : (
            <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
              <table className="rent-table">
                <thead>
                  <tr>
                    <th>房源</th>
                    <th style={{ textAlign: 'right' }}>已收 (¥)</th>
                    <th style={{ textAlign: 'right' }}>应收 (¥)</th>
                    <th style={{ textAlign: 'right' }}>逾期 (¥)</th>
                    <th style={{ textAlign: 'right' }}>笔数</th>
                  </tr>
                </thead>
                <tbody>
                  {data.by_property.map((row) => (
                    <tr key={row.property_id}>
                      <td>{row.property || row.property_id || '—'}</td>
                      <td className="recon-table-num rent-badge--success">{fmtMoney(row.received)}</td>
                      <td className="recon-table-num">{fmtMoney(row.receivable)}</td>
                      <td className="recon-table-num rent-badge--error">{fmtMoney(row.overdue)}</td>
                      <td className="recon-table-num">{row.count ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Records detail */}
      <div className="rent-filter-bar">
        <div className="rent-filter-bar__search">
          <div className="rent-search" style={{ width: '100%' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--rent-ink-3)" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <input type="text" placeholder="搜索房源 / 渠道" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
          </div>
        </div>
        <select className="rent-form-select rent-filter-select" aria-label="类型" style={{ width: 'auto', minWidth: 140 }} value={payType} onChange={(e) => setPayType(e.target.value)}>
          <option value="">全部类型</option>
          {Object.entries(PAY_TYPE_TEXT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      <div className="rent-card">
        <div className="rent-card__header">
          <h3 className="rent-card__title">逐笔明细</h3>
          <span className="rent-badge rent-badge--neutral">{data.records_total} 笔</span>
        </div>
        <div className="rent-card__body" style={{ padding: 0 }}>
          {data.records.length === 0 ? (
            <div className="rent-empty rent-text-muted">暂无明细记录</div>
          ) : visibleRecords.length === 0 ? (
            <div className="rent-empty rent-text-muted">没有匹配的明细记录</div>
          ) : (
            <>
              <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
                <table className="rent-table">
                  <thead>
                    <tr>
                      <th>房源</th>
                      <th>类型</th>
                      <th style={{ textAlign: 'right' }}>金额</th>
                      <th>币种</th>
                      <th>渠道</th>
                      <th>到期日</th>
                      <th>实收日</th>
                      <th>状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRecords.map((r, idx) => {
                      const meta = BUCKET_META[r.bucket] || BUCKET_META.pending
                      const typeLabel = r.payment_type === 'rent'
                        ? '租金'
                        : r.payment_type === 'deposit'
                          ? '押金'
                          : r.payment_type === 'commission'
                            ? '佣金'
                            : payTypeText(r.payment_type)
                      return (
                        <tr key={idx}>
                          <td>{r.property || '—'}</td>
                          <td>{typeLabel}</td>
                          <td className="recon-table-num">{fmtMoney(r.amount)}</td>
                          <td>{r.currency || '—'}</td>
                          <td>{r.channel || '—'}</td>
                          <td className="rent-table__mono">{r.due_date ? String(r.due_date).slice(0, 10) : '—'}</td>
                          <td className="rent-table__mono">{r.paid_at ? String(r.paid_at).slice(0, 10) : '—'}</td>
                          <td>
                            <span className={`rent-badge ${meta.badge}`}>
                              <span className="rent-badge--dot" style={{ background: meta.dot }} />
                              {meta.label}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="rent-pagination" style={{ marginTop: 14, padding: '0 22px 16px' }}>
                <span className="rent-pagination__info">共 {data.records_total} 笔 · 当前显示 {visibleRecords.length} 笔</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default Reconciliation