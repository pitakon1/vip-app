import { useCallback, useEffect, useMemo, useState } from 'react'
import { message } from 'antd'
import DataState from '@/components/DataState'
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
  listing_id?: string
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
  const [selectedId, setSelectedId] = useState<string | null>(null)

  interface MarketingPayload {
    vacants: VacantItem[]
    totalVacant: number
    totalProperties: number
    pricing: PricingItem[]
  }

  const q = useCachedQuery<MarketingPayload>({
    queryKey: ['owner-marketing', uid],
    cacheKey: `owner-marketing:${uid}`,
    queryFn: async (): Promise<MarketingPayload> => {
      const [mkRes, prRes] = await Promise.all([
        ownersApi.marketing(),
        ownersApi.pricingSuggestion(),
      ])

      const mkPayload = mkRes.data?.data ?? mkRes.data
      const prPayload = prRes.data?.data ?? prRes.data
      return {
        vacants: mkPayload?.items ?? [],
        totalVacant: Number(mkPayload?.total_vacant ?? 0),
        totalProperties: Number(mkPayload?.total_properties ?? 0),
        pricing: prPayload?.items ?? [],
      }
    },
  })
  const vacants = q.data?.vacants ?? []
  const totalVacant = q.data?.totalVacant ?? 0
  const totalProperties = q.data?.totalProperties ?? 0
  const pricing = q.data?.pricing ?? []
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

  // 分享链接只使用后端给出的公开地址（/listing/{listing_id}）；没有上架房源时
  // 不再拼一个必然 404 的 /properties/{property_id}。
  const shareUrl = (item: VacantItem) => {
    const path = item.share_url || (item.listing_id ? `/listing/${item.listing_id}` : '')
    return path ? `${window.location.origin}${path}` : ''
  }

  const copyLink = async (item: VacantItem) => {
    const url = shareUrl(item)
    if (!url) {
      message.warning(t('ownerMarketing.noPublicLink'))
      return
    }
    try {
      await navigator.clipboard.writeText(url)
      message.success(t('ownerMarketing.msgLinkCopied'))
    } catch {
      window.prompt(t('ownerMarketing.promptCopyLink'), url)
    }
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

  const emptyBlock = (desc: string) =>
    q.isError && !q.data ? null : <DataState empty emptyTitle={desc} />

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

      {loading ? (
        <DataState loading loadingText={t('common.loading')} skeletonRows={2} />
      ) : q.isError ? (
        <DataState
          error={t('common.loadFailed')}
          retryText={t('common.retry')}
          onRetry={() => q.refetch({ cancelRefetch: false })}
        />
      ) : null}

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
                      <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--rent-ink-2)' }}>{t('ownerMarketing.perMonth')}</span>
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
                  {shareUrl(selected) || t('ownerMarketing.noPublicLink')}
                </div>
              </div>
              <button
                className="rent-btn rent-btn--primary rent-btn--block rent-mt-4"
                disabled={!shareUrl(selected)}
                onClick={() => copyLink(selected)}
              >
                {t('ownerMarketing.copyLink')}
              </button>
            </>
          )}
        </div>
      </div>

    </div>
  )
}

export default Marketing