import { useCallback, useEffect, useMemo, useState } from 'react'
import { message, Empty } from 'antd'
import { ownersApi } from '@/services/api'
import useAuthStore from '@/stores/auth'
import { useCachedQuery } from '@/lib/queryCache'
import { useTranslation } from 'react-i18next'
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

const propertyTypeText = (t: (k: string) => string, type?: string) =>
  type === 'apartment' ? t('ownerMarketing.ptApartment') : type === 'villa' ? t('ownerMarketing.ptVilla') : type === 'condo' ? t('ownerMarketing.ptCondo') : type || t('ownerMarketing.ptProperty')

const DIRECTION_META: Record<string, { label: string; cls: string }> = {
  raise: { label: 'ownerMarketing.dirRaise', cls: 'rent-badge--success' },
  lower: { label: 'ownerMarketing.dirLower', cls: 'rent-badge--error' },
  keep: { label: 'ownerMarketing.dirKeep', cls: 'rent-badge--info' },
}

const statusBadge = (status?: string) =>
  status === 'vacant'
    ? { label: 'ownerMarketing.stVacant', cls: 'rent-badge--warning' }
    : { label: 'ownerMarketing.stMaintenance', cls: 'rent-badge--neutral' }

const Marketing = () => {
  const { t } = useTranslation()
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
      message.success(t('ownerMarketing.msgLinkCopied'))
    } catch {
      window.prompt(t('ownerMarketing.promptCopyLink'), url)
    }
  }

  // 年度财务导出（CSV）
  const exportAnnual = () => {
    const header = [t('ownerMarketing.csvMonth'), t('ownerMarketing.csvReceived'), t('ownerMarketing.csvPending'), t('ownerMarketing.csvOverdue'), t('ownerMarketing.csvCount'), t('ownerMarketing.csvCurrency')]
    const rows = annual.map((m) => [m.month, m.received, m.pending, m.overdue, m.count, ''])
    const totalRow = [t('ownerMarketing.csvTotal'), annualTotals.received, annualTotals.pending, annualTotals.overdue, annualTotals.count, '']
    const csv = [header, ...rows, totalRow]
      .map((r) => r.map((c) => `"${c}"`).join(','))
      .join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = t('ownerMarketing.csvFilename', { year })
    a.click()
    URL.revokeObjectURL(url)
    message.success(t('ownerMarketing.msgExported'))
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
    : t('ownerMarketing.noRange')
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
          <h2 className="rent-page-header__title">{t('ownerMarketing.title')}</h2>
          <p className="rent-page-header__subtitle">{t('ownerMarketing.subtitle')}</p>
        </div>
        <div className="rent-page-header__actions">
          <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => q.refetch({ cancelRefetch: false })} disabled={q.isRefetching}>
            {t('ownerMarketing.refresh')}
          </button>
        </div>
      </div>

      {/* 概览卡 */}
      <div className="rent-grid rent-grid--4 rent-mb-5">
        <div className="rent-stat-card">
          <div className="rent-stat-card__label">{t('ownerMarketing.statProperties')}</div>
          <div className="rent-stat-card__value">{t('ownerMarketing.units', { n: totalProperties })}</div>
          <div className="rent-stat-card__delta">{t('ownerMarketing.statPropertiesNote')}</div>
        </div>
        <div className="rent-stat-card">
          <div className="rent-stat-card__label">{t('ownerMarketing.statVacant')}</div>
          <div className="rent-stat-card__value" style={{ color: 'var(--state-warning)' }}>{t('ownerMarketing.units', { n: totalVacant })}</div>
          <div className="rent-stat-card__delta">{t('ownerMarketing.statVacantNote')}</div>
        </div>
        <div className="rent-stat-card">
          <div className="rent-stat-card__label">{t('ownerMarketing.statOccupancy')}</div>
          <div className="rent-stat-card__value">{occupancy}%</div>
          <div className="rent-stat-card__delta rent-stat-card__delta--up">{t('ownerMarketing.statOccupancyNote')}</div>
        </div>
        <div className="rent-stat-card">
          <div className="rent-stat-card__label">{t('ownerMarketing.statPricing')}</div>
          <div className="rent-stat-card__value">{t('ownerMarketing.units', { n: pricingCount })}</div>
          <div className="rent-stat-card__delta">{t('ownerMarketing.statPricingNote')}</div>
        </div>
      </div>

      {/* 委托推广四步流程 */}
      <div className="rent-v17-steps rent-mb-5">
        <div className={stepCls(1)}>
          <div className="rent-v17-step__dot">1</div>
          <div className="rent-v17-step__label">{t('ownerMarketing.stepSelect')}</div>
        </div>
        <div className={stepCls(2)}>
          <div className="rent-v17-step__dot">2</div>
          <div className="rent-v17-step__label">{t('ownerMarketing.stepPricing')}</div>
        </div>
        <div className={stepCls(3)}>
          <div className="rent-v17-step__dot">3</div>
          <div className="rent-v17-step__label">{t('ownerMarketing.stepListing')}</div>
        </div>
        <div className={stepCls(4)}>
          <div className="rent-v17-step__dot">4</div>
          <div className="rent-v17-step__label">{t('ownerMarketing.stepDone')}</div>
        </div>
      </div>

      <div className="rent-grid rent-grid--2 rent-mb-5" style={{ alignItems: 'start' }}>
        {/* 第 1 步：房源选择 */}
        <div className="rent-card">
          <div className="rent-card__header">
            <h3 className="rent-card__title">{t('ownerMarketing.step1Title')}</h3>
            <span className="rent-badge rent-badge--primary">{t('ownerMarketing.availableUnits', { n: totalVacant })}</span>
          </div>
          <div className="rent-card__body">
            {vacants.length === 0 ? (
              emptyBlock(t('ownerMarketing.noVacants'))
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
                          {propertyTypeText(t, v.property_type)} · {t('ownerMarketing.monthlyRent')} {fmtMoney(v.monthly_rent, v.currency)}
                        </div>
                      </div>
                      <span className={`rent-badge ${badge.cls}`}>{t(badge.label)}</span>
                    </div>
                  )
                })}
                {selected && (
                  <div className="rent-text-sm rent-text-muted rent-mt-3">
                    {t('ownerMarketing.selectedLabel', { title: selected.title })} · {t('ownerMarketing.monthlyRent')} {fmtMoney(selected.monthly_rent, selected.currency)}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* 第 2 步：定价建议 */}
        <div className="rent-card">
          <div className="rent-card__header">
            <h3 className="rent-card__title">{t('ownerMarketing.step2Title')}</h3>
            <span className="rent-badge rent-badge--neutral">{t('ownerMarketing.peerMarket')}</span>
          </div>
          <div className="rent-card__body">
            {!selected || !selectedPricing ? (
              emptyBlock(t('ownerMarketing.noPricing'))
            ) : (
              <>
                <div className="rent-flex rent-flex--between" style={{ marginBottom: 12 }}>
                  <div>
                    <div className="rent-text-sm rent-text-muted">{t('ownerMarketing.suggestedRent')}</div>
                    <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--rent-primary)', fontVariantNumeric: 'tabular-nums' }}>
                      {suggestedPrice != null ? fmtMoney(suggestedPrice, selectedPricing.currency) : '—'}
                      <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--rent-ink-3)' }}>{t('ownerMarketing.perMonth')}</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="rent-text-sm rent-text-muted">{t('ownerMarketing.marketAvg')}</div>
                    <div className="rent-text-bold" style={{ fontSize: 16 }}>
                      {selectedPricing.peer_avg ? fmtMoney(selectedPricing.peer_avg, selectedPricing.currency) : '—'}
                    </div>
                  </div>
                </div>
                <div className="rent-progress">
                  <div className="rent-progress__bar" style={{ width: `${rangePct}%` }} />
                </div>
                <div className="rent-flex rent-flex--between rent-mt-2">
                  <span className="rent-text-sm rent-text-muted">{t('ownerMarketing.marketRange', { range: rangeText })}</span>
                  <span className="rent-text-sm rent-text-bold" style={{ color: 'var(--rent-primary)' }}>
                    {t(dirMeta.label)}
                    {selectedPricing.suggestion ? ` ${selectedPricing.suggestion.diff_pct > 0 ? '+' : ''}${selectedPricing.suggestion.diff_pct}%` : ''}
                  </span>
                </div>
                <div className="rent-divider" />
                <div className="rent-text-sm rent-text-muted">
                  {t('ownerMarketing.pricingBasis', { n: selectedPricing.peer_count })}
                  {selectedPricing.monthly_rent ? t('ownerMarketing.currentRent', { amount: fmtMoney(selectedPricing.monthly_rent, selectedPricing.currency) }) : ''}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 第 3 步：挂牌推广 */}
      <div className="rent-card rent-mb-5">
        <div className="rent-card__header">
          <h3 className="rent-card__title">{t('ownerMarketing.step3Title')}</h3>
          <span className="rent-badge rent-badge--primary">{t('ownerMarketing.allChannels')}</span>
        </div>
        <div className="rent-card__body">
          {!selected ? (
            emptyBlock(t('ownerMarketing.selectFirst'))
          ) : (
            <>
              <div className="rent-v17-field">
                <div className="rent-v17-field__label">{t('ownerMarketing.fProperty')}</div>
                <div className="rent-v17-field__value">{selected.title}</div>
              </div>
              <div className="rent-v17-field">
                <div className="rent-v17-field__label">{t('ownerMarketing.fType')}</div>
                <div className="rent-v17-field__value">{propertyTypeText(t, selected.property_type)}</div>
              </div>
              <div className="rent-v17-field">
                <div className="rent-v17-field__label">{t('ownerMarketing.fMonthlyRent')}</div>
                <div className="rent-v17-field__value rent-mono">{fmtMoney(selected.monthly_rent, selected.currency)}</div>
              </div>
              <div className="rent-v17-field">
                <div className="rent-v17-field__label">{t('ownerMarketing.fListingStatus')}</div>
                <div className="rent-v17-field__value">
                  <span className={`rent-badge ${statusBadge(selected.status).cls}`}>
                    {t(statusBadge(selected.status).label)}
                  </span>
                </div>
              </div>
              <div className="rent-v17-field">
                <div className="rent-v17-field__label">{t('ownerMarketing.fShareLink')}</div>
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
                {t('ownerMarketing.copyLink')}
              </button>
            </>
          )}
        </div>
      </div>

      {/* 第 4 步：托管对账（年度财务汇总） */}
      <div className="rent-card">
        <div className="rent-card__header">
          <h3 className="rent-card__title">{t('ownerMarketing.step4Title')}</h3>
          <div className="rent-flex rent-gap-2">
            <select className="rent-form-select" style={{ width: 'auto', minWidth: 120 }} value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {[new Date().getFullYear(), new Date().getFullYear() - 1].map((y) => (
                <option key={y} value={y}>{t('ownerMarketing.yearSuffix', { y })}</option>
              ))}
            </select>
            <button className="rent-btn rent-btn--primary rent-btn--sm" onClick={exportAnnual}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              {t('ownerMarketing.exportCsv')}
            </button>
          </div>
        </div>
        <div className="rent-card__body" style={{ padding: 0 }}>
          {annual.length === 0 ? (
            emptyBlock(t('ownerMarketing.noAnnual'))
          ) : (
            <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
              <table className="rent-table">
                <thead>
                  <tr>
                    <th>{t('ownerMarketing.thMonth')}</th>
                    <th style={{ textAlign: 'right' }}>{t('ownerMarketing.thReceived')}</th>
                    <th style={{ textAlign: 'right' }}>{t('ownerMarketing.thPending')}</th>
                    <th style={{ textAlign: 'right' }}>{t('ownerMarketing.thOverdue')}</th>
                    <th style={{ textAlign: 'right' }}>{t('ownerMarketing.thCount')}</th>
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
                    <td className="rent-text-bold">{t('ownerMarketing.totalRow')}</td>
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