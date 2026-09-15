import { useCallback, useEffect, useState } from 'react'
import { message } from 'antd'
import { ownersApi } from '@/services/api'
import './marketing.css'

interface VacantItem {
  id: string
  title: string
  address?: string
  monthly_rent?: number
  currency?: string
  property_type?: string
  share_url?: string
  status?: string
}

interface PricingItem {
  property_id: string
  title: string
  monthly_rent?: number
  currency?: string
  peer_count: number
  peer_avg?: number
  peer_range?: [number, number] | null
  suggestion?: {
    direction: string
    diff_pct: number
    suggested: number
  }
}

interface AnnualMonth {
  month: string
  received: number
  pending: number
  overdue: number
  count: number
}

const CUR_SYMBOL: Record<string, string> = {
  CNY: '¥',
  THB: '฿',
  EUR: '€',
  USD: '$',
}

const fmtMoney = (v: number | undefined, currency?: string) => {
  const sym = CUR_SYMBOL[currency as string] || '฿'
  return `${sym}${Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

const propertyTypeText = (t?: string) =>
  t === 'apartment' ? '公寓' : t === 'villa' ? '别墅' : t === 'condo' ? '公寓' : t || '房源'

const DIRECTION_META: Record<string, { label: string; cls: string }> = {
  raise: { label: '建议涨价', cls: 'rent-badge--success' },
  lower: { label: '建议降价', cls: 'rent-badge--error' },
  keep: { label: '维持现价', cls: 'rent-badge--info' },
}

const Marketing = () => {
  const [loading, setLoading] = useState(false)
  const [vacants, setVacants] = useState<VacantItem[]>([])
  const [totalVacant, setTotalVacant] = useState(0)
  const [totalProperties, setTotalProperties] = useState(0)
  const [pricing, setPricing] = useState<PricingItem[]>([])
  const [annual, setAnnual] = useState<AnnualMonth[]>([])
  const [annualTotals, setAnnualTotals] = useState({ received: 0, pending: 0, overdue: 0, count: 0 })
  const [year, setYear] = useState<number>(new Date().getFullYear())

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [mkRes, prRes, annRes] = await Promise.all([
        ownersApi.marketing().catch(() => ({ data: {} })),
        ownersApi.pricingSuggestion().catch(() => ({ data: { items: [] } })),
        ownersApi.annualFinancialSummary(year).catch(() => ({ data: {} })),
      ])

      const mkPayload = mkRes.data?.data ?? mkRes.data
      setVacants(mkPayload?.items ?? [])
      setTotalVacant(Number(mkPayload?.total_vacant ?? 0))
      setTotalProperties(Number(mkPayload?.total_properties ?? 0))

      const prPayload = prRes.data?.data ?? prRes.data
      setPricing(prPayload?.items ?? [])

      const annPayload = annRes.data?.data ?? annRes.data
      setAnnual(annPayload?.by_month ?? [])
      setAnnualTotals(annPayload?.totals ?? { received: 0, pending: 0, overdue: 0, count: 0 })
    } catch (err: any) {
      message.error(err?.response?.data?.message || '获取营销数据失败')
    } finally {
      setLoading(false)
    }
  }, [year])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const shareUrl = (item: VacantItem) =>
    `${window.location.origin}${item.share_url || `/properties/${item.id}`}`

  const copyLink = async (item: VacantItem) => {
    const url = shareUrl(item)
    try {
      await navigator.clipboard.writeText(url)
      message.success('分享链接已复制')
    } catch {
      window.prompt('复制分享链接', url)
    }
  }

  // 年度财务导出（CSV）
  const exportAnnual = () => {
    const header = ['月份', '已收', '应收未收', '逾期', '笔数', `币种`]
    const rows = annual.map((m) => [m.month, m.received, m.pending, m.overdue, m.count, ''])
    const totalRow = ['合计', annualTotals.received, annualTotals.pending, annualTotals.overdue, annualTotals.count, '']
    const csv = [header, ...rows, totalRow]
      .map((r) => r.map((c) => `"${c}"`).join(','))
      .join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `年度财务汇总_${year}.csv`
    a.click()
    URL.revokeObjectURL(url)
    message.success('年度财务汇总已导出')
  }

  const occupancy = totalProperties > 0
    ? Math.round(((totalProperties - totalVacant) / totalProperties) * 100)
    : 0

  const pricingStats = pricing.filter((p) => p.suggestion)

  return (
    <div className="rent-main">
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title">房源营销</h2>
          <p className="rent-page-header__subtitle">空置房源推广、自动定价建议与年度财务导出</p>
        </div>
        <div className="rent-page-header__actions">
          <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={fetchAll} disabled={loading}>
            刷新
          </button>
        </div>
      </div>

      {/* 概览卡 */}
      <div className="rent-grid rent-grid--4 rent-mb-5">
        <div className="rent-stat-card">
          <div className="rent-stat-card__label">名下房源</div>
          <div className="rent-stat-card__value">{totalProperties} 套</div>
          <div className="rent-stat-card__delta">全部房源统计</div>
        </div>
        <div className="rent-stat-card">
          <div className="rent-stat-card__label">空置待租</div>
          <div className="rent-stat-card__value" style={{ color: 'var(--state-warning)' }}>{totalVacant} 套</div>
          <div className="rent-stat-card__delta">推荐优先推广</div>
        </div>
        <div className="rent-stat-card">
          <div className="rent-stat-card__label">入住率</div>
          <div className="rent-stat-card__value">{occupancy}%</div>
          <div className="rent-stat-card__delta rent-stat-card__delta--up">健康水平</div>
        </div>
        <div className="rent-stat-card">
          <div className="rent-stat-card__label">待定价房源</div>
          <div className="rent-stat-card__value">{pricingStats.length} 套</div>
          <div className="rent-stat-card__delta">有市场可比基准</div>
        </div>
      </div>

      {/* 空置房源营销推广 */}
      <div className="rent-card rent-mb-5">
        <div className="rent-card__header">
          <h3 className="rent-card__title">空置房源推广</h3>
          <span className="rent-badge rent-badge--warning">{totalVacant} 套待推广</span>
        </div>
        <div className="rent-card__body" style={{ padding: 0 }}>
          {vacants.length === 0 ? (
            <div className="rent-empty rent-text-muted">暂无空置房源</div>
          ) : (
            <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
              <table className="rent-table">
                <thead>
                  <tr>
                    <th>房源</th>
                    <th>类型</th>
                    <th style={{ textAlign: 'right' }}>月租</th>
                    <th>状态</th>
                    <th>分享链接</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {vacants.map((v) => (
                    <tr key={v.id}>
                      <td>
                        <div>{v.title}</div>
                        {v.address && <div className="rent-text-sm rent-text-muted">{v.address}</div>}
                      </td>
                      <td>{propertyTypeText(v.property_type)}</td>
                      <td className="rent-table__mono" style={{ textAlign: 'right' }}>{fmtMoney(v.monthly_rent, v.currency)}</td>
                      <td>
                        <span className={`rent-badge ${v.status === 'vacant' ? 'rent-badge--warning' : 'rent-badge--neutral'}`}>
                          {v.status === 'vacant' ? '空置' : '维护中'}
                        </span>
                      </td>
                      <td className="rent-text-sm rent-text-muted" style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shareUrl(v)}</td>
                      <td>
                        <button className="rent-btn rent-btn--primary rent-btn--sm" onClick={() => copyLink(v)}>复制推广链接</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* 自动定价建议 */}
      <div className="rent-card rent-mb-5">
        <div className="rent-card__header">
          <h3 className="rent-card__title">自动定价建议</h3>
          <span className="rent-badge rent-badge--neutral">基于同类在租房源行情</span>
        </div>
        <div className="rent-card__body" style={{ padding: 0 }}>
          {pricing.length === 0 ? (
            <div className="rent-empty rent-text-muted">暂无定价建议数据</div>
          ) : (
            <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
              <table className="rent-table">
                <thead>
                  <tr>
                    <th>房源</th>
                    <th>当前月租</th>
                    <th>市场区间</th>
                    <th>同类基准</th>
                    <th style={{ textAlign: 'right' }}>偏离</th>
                    <th>建议</th>
                  </tr>
                </thead>
                <tbody>
                  {pricing.map((p) => {
                    const s = p.suggestion
                    const meta = s ? DIRECTION_META[s.direction] || DIRECTION_META.keep : DIRECTION_META.keep
                    const pr = p.peer_range
                    const range = pr
                      ? `${fmtMoney(pr[0], p.currency)} ~ ${fmtMoney(pr[1], p.currency)}`
                      : '数据不足'
                    return (
                      <tr key={p.property_id}>
                        <td>{p.title}</td>
                        <td className="rent-table__mono">{fmtMoney(p.monthly_rent, p.currency)}</td>
                        <td className="rent-text-sm">{range}</td>
                        <td className="rent-text-sm rent-text-muted">
                          {p.peer_avg ? fmtMoney(p.peer_avg, p.currency) : '—'}{' '}
                          <span>({p.peer_count} 套)</span>
                        </td>
                        <td className="rent-table__mono" style={{ textAlign: 'right' }}>
                          {s ? `${s.diff_pct > 0 ? '+' : ''}${s.diff_pct}%` : '—'}
                        </td>
                        <td>
                          {s ? (
                            <div className="rent-flex rent-flex--col" style={{ gap: 4 }}>
                              <span className={`rent-badge ${meta.cls}`}>{meta.label}</span>
                              <span className="rent-text-sm rent-text-muted">建议 {fmtMoney(s.suggested, p.currency)}</span>
                            </div>
                          ) : (
                            <span className="rent-badge rent-badge--neutral">数据不足</span>
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

      {/* 年度财务导出 */}
      <div className="rent-card">
        <div className="rent-card__header">
          <h3 className="rent-card__title">年度财务汇总</h3>
          <div className="rent-flex rent-gap-2">
            <select className="rent-form-select" style={{ width: 'auto', minWidth: 120 }} value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {[new Date().getFullYear(), new Date().getFullYear() - 1].map((y) => (
                <option key={y} value={y}>{y} 年</option>
              ))}
            </select>
            <button className="rent-btn rent-btn--primary rent-btn--sm" onClick={exportAnnual}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              导出 CSV
            </button>
          </div>
        </div>
        <div className="rent-card__body" style={{ padding: 0 }}>
          {annual.length === 0 ? (
            <div className="rent-empty rent-text-muted">暂无年度财务数据</div>
          ) : (
            <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
              <table className="rent-table">
                <thead>
                  <tr>
                    <th>月份</th>
                    <th style={{ textAlign: 'right' }}>已收</th>
                    <th style={{ textAlign: 'right' }}>应收未收</th>
                    <th style={{ textAlign: 'right' }}>逾期</th>
                    <th style={{ textAlign: 'right' }}>笔数</th>
                  </tr>
                </thead>
                <tbody>
                  {annual.map((m) => (
                    <tr key={m.month}>
                      <td className="rent-table__mono">{m.month}</td>
                      <td className="rent-table__mono" style={{ textAlign: 'right', color: 'var(--state-success)' }}>{fmtMoney(m.received)}</td>
                      <td className="rent-table__mono" style={{ textAlign: 'right' }}>{fmtMoney(m.pending)}</td>
                      <td className="rent-table__mono" style={{ textAlign: 'right', color: 'var(--state-error)' }}>{fmtMoney(m.overdue)}</td>
                      <td className="rent-table__mono" style={{ textAlign: 'right' }}>{m.count}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="rent-text-bold">合计</td>
                    <td className="rent-table__mono" style={{ textAlign: 'right', color: 'var(--state-success)' }}>{fmtMoney(annualTotals.received)}</td>
                    <td className="rent-table__mono" style={{ textAlign: 'right' }}>{fmtMoney(annualTotals.pending)}</td>
                    <td className="rent-table__mono" style={{ textAlign: 'right', color: 'var(--state-error)' }}>{fmtMoney(annualTotals.overdue)}</td>
                    <td className="rent-table__mono" style={{ textAlign: 'right' }}>{annualTotals.count}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Marketing