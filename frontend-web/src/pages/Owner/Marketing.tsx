import { useCallback, useEffect, useMemo, useState } from 'react'
import { message, Empty } from 'antd'
import { ownersApi } from '@/services/api'
import useAuthStore from '@/stores/auth'
import { useCachedQuery } from '@/lib/queryCache'
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

const statusBadge = (status?: string) =>
  status === 'vacant'
    ? { label: '空置', cls: 'rent-badge--warning' }
    : { label: '维护中', cls: 'rent-badge--neutral' }

const Marketing = () => {
  const user = useAuthStore((s) => s.user)
  const uid = user?.id ?? 'anon'
  const [year, setYear] = useState<number>(new Date().getFullYear())
  const [selectedId, setSelectedId] = useState<string | null>(null)

  interface MarketingPayload {
    vacants: VacantItem[]
    totalVacant: number
    totalProperties: number
    pricing: PricingItem[]
    annual: AnnualMonth[]
    annualTotals: { received: number; pending: number; overdue: number; count: number }
  }

  // 缓存优先（localStorage 秒开）+ 后台刷新；年份切换自动换 key 重新拉取
  const q = useCachedQuery<MarketingPayload>({
    queryKey: ['owner-marketing', uid, String(year)],
    cacheKey: `owner-marketing:${uid}:${year}`,
    queryFn: async (): Promise<MarketingPayload> => {
      const [mkRes, prRes, annRes] = await Promise.all([
        ownersApi.marketing().catch(() => ({ data: {} })),
        ownersApi.pricingSuggestion().catch(() => ({ data: { items: [] } })),
        ownersApi.annualFinancialSummary(year).catch(() => ({ data: {} })),
      ])

      const mkPayload = mkRes.data?.data ?? mkRes.data
      const prPayload = prRes.data?.data ?? prRes.data
      const annPayload = annRes.data?.data ?? annRes.data
      return {
        vacants: mkPayload?.items ?? [],
        totalVacant: Number(mkPayload?.total_vacant ?? 0),
        totalProperties: Number(mkPayload?.total_properties ?? 0),
        pricing: prPayload?.items ?? [],
        annual: annPayload?.by_month ?? [],
        annualTotals: annPayload?.totals ?? { received: 0, pending: 0, overdue: 0, count: 0 },
      }
    },
  })
  const vacants = q.data?.vacants ?? []
  const totalVacant = q.data?.totalVacant ?? 0
  const totalProperties = q.data?.totalProperties ?? 0
  const pricing = q.data?.pricing ?? []
  const annual = q.data?.annual ?? []
  const annualTotals = q.data?.annualTotals ?? { received: 0, pending: 0, overdue: 0, count: 0 }
  const loading = q.isPending && !q.data

  // 定价建议按 property_id 关联，id 口径不一致时回退按房源标题匹配
  const pricingOf = useCallback(
    (item?: VacantItem | null) => {
      if (!item) return undefined
      return (
        pricing.find((p) => String(p.property_id) === String(item.id)) ??
        pricing.find((p) => !!p.title && p.title === item.title)
      )
    },
    [pricing],
  )

  // 默认选中第一个「有定价基准」的房源，保证步骤 ② 有真实数据可展示
  useEffect(() => {
    if (vacants.length === 0) {
      setSelectedId(null)
      return
    }
    setSelectedId((prev) => {
      if (prev && vacants.some((v) => v.id === prev)) return prev
      const withPricing = vacants.find((v) => pricingOf(v))
      return (withPricing ?? vacants[0]).id
    })
  }, [vacants, pricingOf])

  const selected = useMemo(
    () => vacants.find((v) => v.id === selectedId) ?? null,
    [vacants, selectedId],
  )
  const selectedPricing = pricingOf(selected)

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

  const pricingCount = pricing.filter((p) => p.suggestion).length

  // 步骤条：选定房源后第 1 步完成、第 2 步激活
  const stepCls = (step: number) => {
    if (step === 1) return selected ? 'rent-v17-step rent-v17-step--done' : 'rent-v17-step rent-v17-step--active'
    if (step === 2) return selected ? 'rent-v17-step rent-v17-step--active' : 'rent-v17-step'
    return 'rent-v17-step'
  }

  // ② 定价建议：建议价在同行情区间中的真实位置
  const pRange = selectedPricing?.peer_range
  const suggestedPrice = selectedPricing?.suggestion?.suggested
  const rangePct =
    pRange && suggestedPrice != null && pRange[1] > pRange[0]
      ? Math.min(100, Math.max(0, Math.round(((suggestedPrice - pRange[0]) / (pRange[1] - pRange[0])) * 100)))
      : 0
  const rangeText = pRange && pRange.length === 2
    ? `${fmtMoney(pRange[0], selectedPricing?.currency)} ~ ${fmtMoney(pRange[1], selectedPricing?.currency)}`
    : '暂无区间数据'
  const dirMeta = DIRECTION_META[selectedPricing?.suggestion?.direction || 'keep'] || DIRECTION_META.keep

  const emptyBlock = (desc: string) => (
    <div className="rent-empty" style={{ padding: '28px 0' }}>
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={desc} />
    </div>
  )

  return (
    <div className="rent-main">
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title">房源营销</h2>
          <p className="rent-page-header__subtitle">空置房源推广、自动定价建议与年度财务导出</p>
        </div>
        <div className="rent-page-header__actions">
          <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => q.refetch({ cancelRefetch: false })} disabled={q.isRefetching}>
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
          <div className="rent-stat-card__value">{pricingCount} 套</div>
          <div className="rent-stat-card__delta">有市场可比基准</div>
        </div>
      </div>

      {/* 委托推广四步流程 */}
      <div className="rent-v17-steps rent-mb-5">
        <div className={stepCls(1)}>
          <div className="rent-v17-step__dot">1</div>
          <div className="rent-v17-step__label">选择房源</div>
        </div>
        <div className={stepCls(2)}>
          <div className="rent-v17-step__dot">2</div>
          <div className="rent-v17-step__label">定价</div>
        </div>
        <div className={stepCls(3)}>
          <div className="rent-v17-step__dot">3</div>
          <div className="rent-v17-step__label">挂牌</div>
        </div>
        <div className={stepCls(4)}>
          <div className="rent-v17-step__dot">4</div>
          <div className="rent-v17-step__label">托管完成</div>
        </div>
      </div>

      <div className="rent-grid rent-grid--2 rent-mb-5" style={{ alignItems: 'start' }}>
        {/* 第 1 步：房源选择 */}
        <div className="rent-card">
          <div className="rent-card__header">
            <h3 className="rent-card__title">① 选择房源</h3>
            <span className="rent-badge rent-badge--primary">可选 {totalVacant} 套</span>
          </div>
          <div className="rent-card__body">
            {vacants.length === 0 ? (
              emptyBlock('暂无可推广的空置房源')
            ) : (
              <>
                {vacants.map((v) => {
                  const badge = statusBadge(v.status)
                  return (
                    <div
                      key={v.id}
                      className="rent-v17-pick"
                      data-active={v.id === selectedId}
                      onClick={() => setSelectedId(v.id)}
                    >
                      <div className="rent-v17-pick__radio" />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="rent-text-bold">{v.title}</div>
                        <div className="rent-text-sm rent-text-muted">
                          {propertyTypeText(v.property_type)} · 月租 {fmtMoney(v.monthly_rent, v.currency)}
                        </div>
                      </div>
                      <span className={`rent-badge ${badge.cls}`}>{badge.label}</span>
                    </div>
                  )
                })}
                {selected && (
                  <div className="rent-text-sm rent-text-muted rent-mt-3">
                    已选：{selected.title} · 月租 {fmtMoney(selected.monthly_rent, selected.currency)}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* 第 2 步：定价建议 */}
        <div className="rent-card">
          <div className="rent-card__header">
            <h3 className="rent-card__title">② 定价建议</h3>
            <span className="rent-badge rent-badge--neutral">同类在租行情</span>
          </div>
          <div className="rent-card__body">
            {!selected || !selectedPricing ? (
              emptyBlock('该房源暂无同行情定价基准')
            ) : (
              <>
                <div className="rent-flex rent-flex--between" style={{ marginBottom: 12 }}>
                  <div>
                    <div className="rent-text-sm rent-text-muted">建议月租金</div>
                    <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--rent-primary)', fontVariantNumeric: 'tabular-nums' }}>
                      {suggestedPrice != null ? fmtMoney(suggestedPrice, selectedPricing.currency) : '—'}
                      <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--rent-ink-3)' }}>/月</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="rent-text-sm rent-text-muted">市场均值</div>
                    <div className="rent-text-bold" style={{ fontSize: 16 }}>
                      {selectedPricing.peer_avg ? fmtMoney(selectedPricing.peer_avg, selectedPricing.currency) : '—'}
                    </div>
                  </div>
                </div>
                <div className="rent-progress">
                  <div className="rent-progress__bar" style={{ width: `${rangePct}%` }} />
                </div>
                <div className="rent-flex rent-flex--between rent-mt-2">
                  <span className="rent-text-sm rent-text-muted">市场租金区间 {rangeText}</span>
                  <span className="rent-text-sm rent-text-bold" style={{ color: 'var(--rent-primary)' }}>
                    {dirMeta.label}
                    {selectedPricing.suggestion ? ` ${selectedPricing.suggestion.diff_pct > 0 ? '+' : ''}${selectedPricing.suggestion.diff_pct}%` : ''}
                  </span>
                </div>
                <div className="rent-divider" />
                <div className="rent-text-sm rent-text-muted">
                  定价依据：同小区 {selectedPricing.peer_count} 套在租房源行情与当前挂牌租金对比
                  {selectedPricing.monthly_rent ? `（当前月租 ${fmtMoney(selectedPricing.monthly_rent, selectedPricing.currency)}）` : ''}。
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 第 3 步：挂牌推广 */}
      <div className="rent-card rent-mb-5">
        <div className="rent-card__header">
          <h3 className="rent-card__title">③ 挂牌推广</h3>
          <span className="rent-badge rent-badge--primary">全渠道分享链接</span>
        </div>
        <div className="rent-card__body">
          {!selected ? (
            emptyBlock('请先在第 1 步选择房源')
          ) : (
            <>
              <div className="rent-v17-field">
                <div className="rent-v17-field__label">房源</div>
                <div className="rent-v17-field__value">{selected.title}</div>
              </div>
              <div className="rent-v17-field">
                <div className="rent-v17-field__label">类型</div>
                <div className="rent-v17-field__value">{propertyTypeText(selected.property_type)}</div>
              </div>
              <div className="rent-v17-field">
                <div className="rent-v17-field__label">月租</div>
                <div className="rent-v17-field__value rent-mono">{fmtMoney(selected.monthly_rent, selected.currency)}</div>
              </div>
              <div className="rent-v17-field">
                <div className="rent-v17-field__label">挂牌状态</div>
                <div className="rent-v17-field__value">
                  <span className={`rent-badge ${statusBadge(selected.status).cls}`}>
                    {statusBadge(selected.status).label}
                  </span>
                </div>
              </div>
              <div className="rent-v17-field">
                <div className="rent-v17-field__label">分享链接</div>
                <div
                  className="rent-v17-field__value rent-mono"
                  style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {shareUrl(selected)}
                </div>
              </div>
              <button
                className="rent-btn rent-btn--primary rent-btn--block rent-mt-4"
                onClick={() => copyLink(selected)}
              >
                复制推广链接
              </button>
            </>
          )}
        </div>
      </div>

      {/* 第 4 步：托管对账（年度财务汇总） */}
      <div className="rent-card">
        <div className="rent-card__header">
          <h3 className="rent-card__title">④ 托管完成 · 年度财务汇总</h3>
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
            emptyBlock('暂无年度财务数据')
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