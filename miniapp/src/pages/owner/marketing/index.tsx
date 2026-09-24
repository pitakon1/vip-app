import { useCallback, useEffect, useMemo, useState } from 'react'
import { View, Text, ScrollView, Button } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { ownerApi, saleListingApi } from '@/services/api'
import { useSwrCache } from '@/hooks/useSwrCache'
import { fmtMoney as money } from '@/utils/format'
import './index.scss'
import { useI18n } from '@/i18n'
import { iconStyle } from '@/utils/icons'
import BottomNav from '@/components/BottomNav'
import StateBlock from '@/components/StateBlock'

interface VacantItem {
  id: string
  title?: string
  address?: string
  monthly_rent?: number
  currency?: string
  property_type?: string
  size_sqm?: number
  bedrooms?: number
  bathrooms?: number
  status?: string
  share_url?: string
}

interface PricingItem {
  property_id: string
  title?: string
  monthly_rent?: number
  currency?: string
  peer_count?: number
  peer_avg?: number
  peer_range?: [number, number] | null
  suggestion?: { direction: string; diff_pct: number; suggested: number }
}

interface AnnualMonth {
  month: string
  received: number
  pending: number
  overdue: number
  count: number
}

// 售房挂牌（GET /sale-listings 返回序列化对象）
interface SaleListingItem {
  id: string
  title?: string
  address?: string
  asking_price?: number
  currency?: string
  size_sqm?: number
  bedrooms?: number
  bathrooms?: number
  status?: string
  created_at?: string
}

// 在线估价记录（GET /sale-listings/{id}/valuations）
interface Valuation {
  id?: string
  market_value?: number
  low_estimate?: number
  high_estimate?: number
  currency?: string
  confidence?: number
  method?: string
  created_at?: string
}

const pick = (res: any, key: string, fallback: any[] = []) => {
  const d = res?.data ?? res
  return Array.isArray(d?.[key]) ? d[key] : d?.items ?? fallback
}

const propertyTypeText = (
  t: (k: string, p?: Record<string, string | number>) => string,
  type?: string
) =>
  type === 'apartment'
    ? t('prop.typeApartment')
    : type === 'villa'
      ? t('prop.typeVilla')
      : type === 'condo'
        ? t('prop.typeApartment')
        : type || t('prop.listing')

// 方向 / 状态元信息：颜色语义交由 SCSS 徽章类实现
const directionMetaOf = (
  t: (k: string, p?: Record<string, string | number>) => string,
  d?: string
): { label: string; cls: string } => {
  const map: Record<string, { label: string; cls: string }> = {
    raise: { label: t('mkt.dirRaise'), cls: 'badge--success' },
    lower: { label: t('mkt.dirLower'), cls: 'badge--error' },
    keep: { label: t('mkt.dirKeep'), cls: 'badge--info' }
  }
  return map[d || 'keep'] || map.keep
}

const statusMetaOf = (
  t: (k: string, p?: Record<string, string | number>) => string,
  s?: string
): { label: string; cls: string } => {
  const map: Record<string, { label: string; cls: string }> = {
    vacant: { label: t('prop.statusVacant'), cls: 'badge--warning' },
    maintenance: { label: t('prop.statusMaintenanceLong'), cls: 'badge--neutral' }
  }
  return map[s || ''] || { label: s || t('mkt.stToPromote'), cls: 'badge--neutral' }
}

// 售房挂牌状态（对齐后端 ListingStatus），进度由状态推导
const saleMetaOf = (
  t: (k: string, p?: Record<string, string | number>) => string,
  s?: string
): { label: string; cls: string; pct: number } => {
  const map: Record<string, { label: string; cls: string; pct: number }> = {
    pending: { label: t('home.vPending'), cls: 'badge--warning', pct: 10 },
    active: { label: t('mkt.stActive'), cls: 'badge--primary', pct: 35 },
    contracted: { label: t('mkt.stContracted'), cls: 'badge--success', pct: 75 },
    closed: { label: t('home.stClosed'), cls: 'badge--success', pct: 100 },
    cancelled: { label: t('mkt.stCancelled'), cls: 'badge--neutral', pct: 0 },
    expired: { label: t('mkt.stExpired'), cls: 'badge--neutral', pct: 0 }
  }
  return map[s || ''] || { label: s || t('mkt.stToPublish'), cls: 'badge--neutral', pct: 0 }
}

const saleMetaText = (
  t: (k: string, p?: Record<string, string | number>) => string,
  l: SaleListingItem
) => {
  const room = l.bedrooms ? t('mkt.roomLayout', { bed: l.bedrooms, bath: l.bathrooms || 0 }) : ''
  const size = l.size_sqm ? t('mkt.sizeSqm', { n: l.size_sqm }) : ''
  return [room, size].filter(Boolean).join(' · ')
}

const stepMeta = (
  t: (k: string, p?: Record<string, string | number>) => string,
  p: VacantItem
) => {
  const room = p.bedrooms ? t('mkt.roomLayout', { bed: p.bedrooms, bath: p.bathrooms || 0 }) : ''
  const size = p.size_sqm ? t('mkt.sizeSqm', { n: p.size_sqm }) : ''
  const st = statusMetaOf(t, p.status)
  return [propertyTypeText(t, p.property_type), room, size].filter(Boolean).join(' · ') + ` · ${st.label}`
}

export default function OwnerMarketingPage() {
  const { t } = useI18n()
  const uid = useAuthStore((state) => state.user?.id) ?? 'anon'
  const [year, setYear] = useState<number>(new Date().getFullYear())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // 委托类型：出租 / 出售（对齐原型 rent-tabs）
  const [activeTab, setActiveTab] = useState<'rent' | 'sale'>('rent')
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null)
  const [valuations, setValuations] = useState<Valuation[]>([])

  interface MarketingPayload {
    vacants: VacantItem[]
    totalVacant: number
    totalProperties: number
    pricing: PricingItem[]
    annual: AnnualMonth[]
    annualTotals: { received: number; pending: number; overdue: number; count: number }
    saleListings: SaleListingItem[]
  }

  const { data, loading, refresh } = useSwrCache<MarketingPayload>({
    key: `owner:marketing:${uid}:${year}`,
    fetcher: async (): Promise<MarketingPayload> => {
      const [mk, pr, ann, sl]: [any, any, any, any] = await Promise.all([
        ownerApi.marketing(),
        ownerApi.pricingSuggestion(),
        ownerApi.annualFinancialSummary(year),
        saleListingApi.list().catch(() => null)
      ])
      const mkD = mk?.data ?? mk
      const annD = ann?.data ?? ann
      const slD = sl?.data ?? sl
      return {
        vacants: pick(mkD, 'items'),
        totalVacant: Number(mkD?.total_vacant ?? 0),
        totalProperties: Number(mkD?.total_properties ?? 0),
        pricing: pick(pr?.data ?? pr, 'items'),
        annual: pick(annD, 'by_month'),
        annualTotals: annD?.totals ?? { received: 0, pending: 0, overdue: 0, count: 0 },
        // 售房挂牌：按当前登录用户收窄（非管理员接口仅返回 active/pending）
        saleListings: pick(slD, 'items')
      }
    },
  })
  const vacants = data?.vacants ?? []
  const totalVacant = data?.totalVacant ?? 0
  const totalProperties = data?.totalProperties ?? 0
  const pricing = data?.pricing ?? []
  const annual = data?.annual ?? []
  const annualTotals = data?.annualTotals ?? { received: 0, pending: 0, overdue: 0, count: 0 }
  const saleListings = data?.saleListings ?? []

  useDidShow(() => {
    if (!useAuthStore.getState().token) {
      Taro.redirectTo({ url: '/pages/login/index' })
      return
    }
    void refresh()
  })

  // 切换年份时重新拉取该年度的财务汇总数据（缓存按年份隔离，force 拉取）
  useEffect(() => {
    void refresh(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year])

  // 定价建议按 property_id 关联，口径不一致时回退按房源标题匹配
  const pricingOf = useCallback(
    (item?: VacantItem | null) => {
      if (!item) return undefined
      return (
        pricing.find((p) => String(p.property_id) === String(item.id)) ??
        pricing.find((p) => !!p.title && p.title === item.title)
      )
    },
    [pricing]
  )

  // 默认选中第一个「有定价基准」的房源，保证第 ② 步有真实数据可展示
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
    [vacants, selectedId]
  )
  const selectedPricing = pricingOf(selected)

  // 默认选中第一条售房挂牌，保证出售流程有真实数据可展示
  useEffect(() => {
    if (saleListings.length === 0) {
      setSelectedSaleId(null)
      return
    }
    setSelectedSaleId((prev) =>
      prev && saleListings.some((l) => l.id === prev) ? prev : saleListings[0].id
    )
  }, [saleListings])

  // 在线估价记录：仅在选中挂牌后拉取
  useEffect(() => {
    if (!selectedSaleId) {
      setValuations([])
      return
    }
    let alive = true
    saleListingApi
      .valuations(selectedSaleId)
      .then((res: any) => {
        if (!alive) return
        const d = res?.data ?? res
        setValuations(Array.isArray(d) ? d : Array.isArray(d?.items) ? d.items : [])
      })
      .catch(() => {
        if (alive) setValuations([])
      })
    return () => {
      alive = false
    }
  }, [selectedSaleId])

  const selectedSale = useMemo(
    () => saleListings.find((l) => l.id === selectedSaleId) ?? null,
    [saleListings, selectedSaleId]
  )
  // 取最新一条估价记录作为预估价展示
  const latestValuation = valuations.length > 0 ? valuations[valuations.length - 1] : null
  const saleStep = saleMetaOf(t, selectedSale?.status)

  // 我的出租委托：空置房源中已有分享链接的视为已挂牌推广
  const rentConsigns = vacants.map((v) => {
    const published = !!v.share_url
    return {
      id: v.id,
      title: v.title || t('prop.unnamed'),
      statusLabel: published ? t('mkt.cStatusOngoing') : t('mkt.stToPublish'),
      statusCls: published ? 'badge--primary' : 'badge--neutral',
      pct: published ? 65 : 20,
      desc: [money(v.monthly_rent, v.currency) + t('pub.perMonth'), published ? t('mkt.cStatusPromoting') : t('mkt.cStatusToPromote')].join(' · ')
    }
  })

  const copyLink = (item: VacantItem) => {
    Taro.setClipboardData({
      data: item.share_url || `/pages/tenant/listings/index`,
      success: () => Taro.showToast({ title: t('mkt.linkCopied'), icon: 'success' })
    })
  }

  const exportCsv = () => {
    const rows = [
      [t('mkt.colMonth'), t('mkt.colReceived'), t('mkt.colPending'), t('mkt.colOverdue'), t('mkt.colCount')],
      ...annual.map((m) => [m.month, m.received, m.pending, m.overdue, m.count])
    ]
    rows.push([t('mkt.colTotal'), annualTotals.received, annualTotals.pending, annualTotals.overdue, annualTotals.count])
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n')
    Taro.showModal({
      title: t('mkt.exportTitle'),
      content: t('mkt.exportContent', { year, received: money(annualTotals.received), overdue: money(annualTotals.overdue) }),
      confirmText: t('common.confirm'),
      success: (res) => {
        if (res.confirm) {
          // 小程序无法直接下载文件，将数据写入剪贴板
          Taro.setClipboardData({
            data: `\ufeff${csv}`,
            success: () => Taro.showToast({ title: t('mkt.csvCopied'), icon: 'success' })
          })
        }
      }
    })
  }

  const occupancy =
    totalProperties > 0
      ? Math.round(((totalProperties - totalVacant) / totalProperties) * 100)
      : 0

  const pricingCount = pricing.filter((p) => p.suggestion).length

  // 步骤条：选定房源后第 1 步完成、第 2 步激活
  const stepCls = (step: number) => {
    if (step === 1) return `steps__item ${selected ? 'steps__item--done' : 'steps__item--active'}`
    if (step === 2) return `steps__item ${selected ? 'steps__item--active' : ''}`
    return 'steps__item'
  }

  // ② 定价建议：建议价在同行情区间中的真实位置
  const pRange = selectedPricing?.peer_range
  const suggestedPrice = selectedPricing?.suggestion?.suggested
  const rangePct =
    pRange && pRange.length === 2 && suggestedPrice != null && pRange[1] > pRange[0]
      ? Math.min(100, Math.max(0, Math.round(((suggestedPrice - pRange[0]) / (pRange[1] - pRange[0])) * 100)))
      : 0
  const rangeText =
    pRange && pRange.length === 2
      ? `${money(pRange[0], selectedPricing?.currency)} ~ ${money(pRange[1], selectedPricing?.currency)}`
      : t('mkt.noRange')
  const dirMeta = directionMetaOf(t, selectedPricing?.suggestion?.direction)

  return (
    <View className='owner-marketing-page'>
      <View className='page-container'>
        <Text className='page-title'>{t('mkt.title')}</Text>
        <Text className='page-subtitle'>{t('mkt.subtitle')}</Text>

        {/* 双委托入口 Tab（对齐原型 .rent-tabs） */}
        <View className='owner-tabs'>
          <View
            className={`owner-tabs__item ${activeTab === 'rent' ? 'owner-tabs__item--active' : ''}`}
            onClick={() => setActiveTab('rent')}
          >
            <Text>{t('mkt.tabRent')}</Text>
          </View>
          <View
            className={`owner-tabs__item ${activeTab === 'sale' ? 'owner-tabs__item--active' : ''}`}
            onClick={() => setActiveTab('sale')}
          >
            <Text>{t('mkt.tabSale')}</Text>
          </View>
        </View>

        {/* 概览 */}
        <View className='stats-grid'>
          <View className='stat-card'>
            <Text className='stat-num'>{totalProperties}</Text>
            <Text className='stat-label'>{t('mkt.statProperties')}</Text>
          </View>
          <View className='stat-card stat-card--warning'>
            <Text className='stat-num'>{totalVacant}</Text>
            <Text className='stat-label'>{t('mkt.statVacant')}</Text>
          </View>
          <View className='stat-card'>
            <Text className='stat-num'>{occupancy}%</Text>
            <Text className='stat-label'>{t('mkt.statOccupancy')}</Text>
          </View>
          <View className='stat-card'>
            <Text className='stat-num'>{pricingCount}</Text>
            <Text className='stat-label'>{t('mkt.statPricing')}</Text>
          </View>
        </View>

        {/* 委托推广四步流程（委托出租） */}
        {activeTab === 'rent' && (
          <>
        <View className='steps'>
          <View className={stepCls(1)}>
            <Text className='steps__dot'>1</Text>
            <Text className='steps__label'>{t('mkt.stepPick')}</Text>
          </View>
          <View className={stepCls(2)}>
            <Text className='steps__dot'>2</Text>
            <Text className='steps__label'>{t('mkt.stepPricing')}</Text>
          </View>
          <View className={stepCls(3)}>
            <Text className='steps__dot'>3</Text>
            <Text className='steps__label'>{t('mkt.stepPublish')}</Text>
          </View>
          <View className={stepCls(4)}>
            <Text className='steps__dot'>4</Text>
            <Text className='steps__label'>{t('mkt.stepDone')}</Text>
          </View>
        </View>

        {/* ① 选择房源 */}
        <View className='card-item'>
          <View className='card-item__head'>
            <Text className='card-item__title'>{t('mkt.card1Rent')}</Text>
            <View className='badge badge--primary'>
              <Text>{t('mkt.pickCount', { n: totalVacant })}</Text>
            </View>
          </View>
          {vacants.length === 0 ? (
            <View className='empty-tip'>
              <Text>{t('mkt.noVacant')}</Text>
            </View>
          ) : (
            vacants.map((v) => {
              const st = statusMetaOf(t, v.status)
              const active = v.id === selectedId
              return (
                <View
                  key={v.id}
                  className={`pick ${active ? 'pick--active' : ''}`}
                  hoverClass='pick--hover'
                  onClick={() => setSelectedId(v.id)}
                >
                  <View className={`pick__radio ${active ? 'pick__radio--on' : ''}`} />
                  <View className='pick__body'>
                    <Text className='pick__title'>{v.title || t('prop.unnamed')}</Text>
                    <Text className='pick__meta'>{stepMeta(t, v)}</Text>
                  </View>
                  <View className={`badge ${st.cls}`}>
                    <Text>{st.label}</Text>
                  </View>
                </View>
              )
            })
          )}
          {selected && (
            <Text className='card-item__sub'>
              {t('mkt.selectedLine', {
                title: selected.title || t('prop.unnamed'),
                rent: money(selected.monthly_rent, selected.currency)
              })}
            </Text>
          )}
        </View>

        {/* ② 定价建议 */}
        <View className='card-item'>
          <View className='card-item__head'>
            <Text className='card-item__title'>{t('mkt.card2Rent')}</Text>
            <View className='badge badge--neutral'>
              <Text>{t('mkt.peerMarket')}</Text>
            </View>
          </View>
          {!selected || !selectedPricing ? (
            <View className='empty-tip'>
              <Text>{t('mkt.noPricing')}</Text>
            </View>
          ) : (
            <View>
              <View className='price-row'>
                <View className='price-row__left'>
                  <Text className='price-row__label'>{t('mkt.suggestedRent')}</Text>
                  <Text className='price-row__main'>
                    {suggestedPrice != null ? money(suggestedPrice, selectedPricing.currency) : '—'}
                    <Text className='price-row__unit'>{t('pub.perMonth')}</Text>
                  </Text>
                </View>
                <View className='price-row__right'>
                  <Text className='price-row__label'>{t('mkt.peerAvg')}</Text>
                  <Text className='price-row__avg'>
                    {selectedPricing.peer_avg ? money(selectedPricing.peer_avg, selectedPricing.currency) : '—'}
                  </Text>
                </View>
              </View>
              <View className='progress'>
                <View className='progress__bar' style={{ width: `${rangePct}%` }} />
              </View>
              <View className='price-row price-row--foot'>
                <Text className='price-row__hint'>{t('mkt.peerRange', { range: rangeText })}</Text>
                <Text className='price-row__dir'>
                  {dirMeta.label}
                  {selectedPricing.suggestion
                    ? ` ${selectedPricing.suggestion.diff_pct > 0 ? '+' : ''}${selectedPricing.suggestion.diff_pct}%`
                    : ''}
                </Text>
              </View>
              <Text className='card-item__sub'>
                {t('mkt.pricingBasis', { n: selectedPricing.peer_count || 0 })}
                {selectedPricing.monthly_rent
                  ? t('mkt.currentRentNote', { v: money(selectedPricing.monthly_rent, selectedPricing.currency) })
                  : ''}
                {t('mkt.period')}
              </Text>
            </View>
          )}
        </View>

        {/* ③ 挂牌推广 */}
        <View className='card-item'>
          <View className='card-item__head'>
            <Text className='card-item__title'>{t('mkt.card3Rent')}</Text>
            <View className='badge badge--primary'>
              <Text>{t('mkt.allChannelShare')}</Text>
            </View>
          </View>
          {!selected ? (
            <View className='empty-tip'>
              <Text>{t('mkt.pickFirst')}</Text>
            </View>
          ) : (
            <View>
              <View className='field'>
                <Text className='field__label'>{t('prop.listing')}</Text>
                <Text className='field__value'>{selected.title || t('prop.unnamed')}</Text>
              </View>
              <View className='field'>
                <Text className='field__label'>{t('mkt.fieldType')}</Text>
                <Text className='field__value'>{propertyTypeText(t, selected.property_type)}</Text>
              </View>
              <View className='field'>
                <Text className='field__label'>{t('prop.monthlyRent')}</Text>
                <Text className='field__value'>{money(selected.monthly_rent, selected.currency)}</Text>
              </View>
              <View className='field'>
                <Text className='field__label'>{t('mkt.fieldPublishStatus')}</Text>
                <View className={`badge ${statusMetaOf(t, selected.status).cls}`}>
                  <Text>{statusMetaOf(t, selected.status).label}</Text>
                </View>
              </View>
              <View className='field'>
                <Text className='field__label'>{t('mkt.fieldShareLink')}</Text>
                <Text className='field__value field__value--mono'>
                  {selected.share_url || `/properties/${selected.id}`}
                </Text>
              </View>
              <Button className='share-btn' onClick={() => copyLink(selected)}>
                {t('mkt.copyLinkBtn')}
              </Button>
            </View>
          )}
        </View>

        {/* ④ 托管完成 · 年度财务汇总 */}
        <View className='card-item'>
          <View className='card-item__head'>
            <Text className='card-item__title'>{t('mkt.card4Rent')}</Text>
            <View className='year-row'>
              {[new Date().getFullYear(), new Date().getFullYear() - 1].map((y) => (
                <View
                  key={y}
                  className={`year-chip ${y === year ? 'year-chip--active' : ''}`}
                  onClick={() => setYear(y)}
                >
                  <Text>{y}</Text>
                </View>
              ))}
            </View>
          </View>
          {annual.length === 0 ? (
            <View className='empty-tip'>
              <Text>{t('mkt.noAnnual')}</Text>
            </View>
          ) : (
            <ScrollView scrollX className='ann-table'>
              <View className='ann-row ann-row--head'>
                <Text className='ann-cell'>{t('mkt.colMonth')}</Text>
                <Text className='ann-cell'>{t('mkt.colReceived')}</Text>
                <Text className='ann-cell'>{t('mkt.colPending')}</Text>
                <Text className='ann-cell'>{t('mkt.colOverdue')}</Text>
                <Text className='ann-cell'>{t('mkt.colCount')}</Text>
              </View>
              {annual.map((m) => (
                <View key={m.month} className='ann-row'>
                  <Text className='ann-cell'>{m.month}</Text>
                  <Text className='ann-cell ann-cell--success'>{money(m.received)}</Text>
                  <Text className='ann-cell'>{money(m.pending)}</Text>
                  <Text className='ann-cell ann-cell--error'>{money(m.overdue)}</Text>
                  <Text className='ann-cell'>{m.count}</Text>
                </View>
              ))}
              <View className='ann-row ann-row--total'>
                <Text className='ann-cell'>{t('mkt.colTotal')}</Text>
                <Text className='ann-cell ann-cell--success'>{money(annualTotals.received)}</Text>
                <Text className='ann-cell'>{money(annualTotals.pending)}</Text>
                <Text className='ann-cell ann-cell--error'>{money(annualTotals.overdue)}</Text>
                <Text className='ann-cell'>{annualTotals.count}</Text>
              </View>
            </ScrollView>
          )}
          <Button className='export-btn' onClick={exportCsv}>
            <View className='export-btn__icon icon-svg' style={iconStyle('doc', 32)} />
            {t('mkt.exportCsvBtn')}
          </Button>
        </View>
          </>
        )}

        {/* ============ 委托出售 ============ */}
        {activeTab === 'sale' && (
          <>
            <View className='steps'>
              <View className={selectedSale ? 'steps__item steps__item--done' : 'steps__item steps__item--active'}>
                <Text className='steps__dot'>1</Text>
                <Text className='steps__label'>{t('mkt.stepValuation')}</Text>
              </View>
              <View className={selectedSale ? 'steps__item steps__item--active' : 'steps__item'}>
                <Text className='steps__dot'>2</Text>
                <Text className='steps__label'>{t('mkt.stepPublish')}</Text>
              </View>
              <View className='steps__item'>
                <Text className='steps__dot'>3</Text>
                <Text className='steps__label'>{t('mkt.stepViewing')}</Text>
              </View>
              <View className='steps__item'>
                <Text className='steps__dot'>4</Text>
                <Text className='steps__label'>{t('mkt.stepClosed')}</Text>
              </View>
            </View>

            {/* 售房挂牌选择 */}
            <View className='card-item'>
              <View className='card-item__head'>
                <Text className='card-item__title'>{t('mkt.mySaleListings')}</Text>
                <View className='badge badge--primary'>
                  <Text>{t('prop.countUnit', { n: saleListings.length })}</Text>
                </View>
              </View>
              {saleListings.length === 0 ? (
                <View className='empty-tip'>
                  <Text>{t('mkt.noSaleListings')}</Text>
                </View>
              ) : (
                saleListings.map((l) => {
                  const st = saleMetaOf(t, l.status)
                  const active = l.id === selectedSaleId
                  return (
                    <View
                      key={l.id}
                      className={`pick ${active ? 'pick--active' : ''}`}
                      hoverClass='pick--hover'
                      onClick={() => setSelectedSaleId(l.id)}
                    >
                      <View className={`pick__radio ${active ? 'pick__radio--on' : ''}`} />
                      <View className='pick__body'>
                        <Text className='pick__title'>{l.title || t('prop.unnamed')}</Text>
                        <Text className='pick__meta'>
                          {[saleMetaText(t, l), l.address].filter(Boolean).join(' · ') || '—'}
                        </Text>
                      </View>
                      <View className={`badge ${st.cls}`}>
                        <Text>{st.label}</Text>
                      </View>
                    </View>
                  )
                })
              )}
            </View>

            {/* ① 在线估价 */}
            <View className='card-item'>
              <View className='card-item__head'>
                <Text className='card-item__title'>{t('mkt.card1Sale')}</Text>
                <View className='badge badge--warning'>
                  <Text>{t('mkt.avmBadge')}</Text>
                </View>
              </View>
              {!selectedSale ? (
                <View className='empty-tip'>
                  <Text>{t('mkt.pickSaleFirst')}</Text>
                </View>
              ) : (
                <View>
                  <View className='field'>
                    <Text className='field__label'>{t('mkt.fieldCommunity')}</Text>
                    <Text className='field__value'>{selectedSale.title || t('prop.unnamed')}</Text>
                  </View>
                  <View className='field'>
                    <Text className='field__label'>{t('pub.layout')}</Text>
                    <Text className='field__value'>{saleMetaText(t, selectedSale) || '—'}</Text>
                  </View>
                  <View className='field'>
                    <Text className='field__label'>{t('mkt.fieldAskingPrice')}</Text>
                    <Text className='field__value'>
                      {money(selectedSale.asking_price, selectedSale.currency)}
                    </Text>
                  </View>
                  {!latestValuation ? (
                    <View className='empty-tip'>
                      <Text>{t('mkt.noValuation')}</Text>
                    </View>
                  ) : (
                    <View className='est-box'>
                      <Text className='est-box__label'>{t('mkt.estRange')}</Text>
                      <Text className='est-box__value'>
                        {latestValuation.low_estimate != null && latestValuation.high_estimate != null
                          ? `${money(latestValuation.low_estimate, latestValuation.currency)} - ${money(
                              latestValuation.high_estimate,
                              latestValuation.currency
                            )}`
                          : money(latestValuation.market_value, latestValuation.currency)}
                      </Text>
                      <Text className='est-box__note'>
                        {t('mkt.marketValue', { v: money(latestValuation.market_value, latestValuation.currency) })}
                        {latestValuation.confidence != null ? t('mkt.confidenceNote', { n: latestValuation.confidence }) : ''}
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </View>

            {/* ② 挂牌 */}
            <View className='card-item'>
              <View className='card-item__head'>
                <Text className='card-item__title'>{t('mkt.card2Sale')}</Text>
                <View className={`badge ${saleStep.cls}`}>
                  <Text>{saleStep.label}</Text>
                </View>
              </View>
              {!selectedSale ? (
                <View className='empty-tip'>
                  <Text>{t('mkt.pickSaleFirst')}</Text>
                </View>
              ) : (
                <View>
                  <View className='field'>
                    <Text className='field__label'>{t('mkt.fieldAskingPrice')}</Text>
                    <Text className='field__value'>
                      {money(selectedSale.asking_price, selectedSale.currency)}
                    </Text>
                  </View>
                  <View className='field'>
                    <Text className='field__label'>{t('mkt.fieldPublishAddress')}</Text>
                    <Text className='field__value'>{selectedSale.address || '—'}</Text>
                  </View>
                  <View className='field'>
                    <Text className='field__label'>{t('mkt.fieldPublishTime')}</Text>
                    <Text className='field__value'>
                      {String(selectedSale.created_at || '').replace('T', ' ').slice(0, 10) || '—'}
                    </Text>
                  </View>
                </View>
              )}
            </View>

            {/* ③ 预约带看 */}
            <View className='card-item'>
              <View className='card-item__head'>
                <Text className='card-item__title'>{t('mkt.card3Sale')}</Text>
                <View className='badge badge--neutral'>
                  <Text>{t('mkt.unlockAfterPublish')}</Text>
                </View>
              </View>
              <View className='empty-tip'>
                <Text>{t('mkt.viewingHint')}</Text>
              </View>
            </View>

            {/* ④ 成交 */}
            <View className='card-item'>
              <View className='card-item__head'>
                <Text className='card-item__title'>{t('mkt.card4Sale')}</Text>
                <View className={`badge ${saleStep.cls}`}>
                  <Text>{saleStep.label}</Text>
                </View>
              </View>
              <Text className='card-item__sub'>
                {t('mkt.dealFlow')}
              </Text>
              <View className='progress'>
                <View className='progress__bar' style={{ width: `${saleStep.pct}%` }} />
              </View>
              <Text className='card-item__sub'>{t('mkt.currentProgress', { label: saleStep.label })}</Text>
            </View>
          </>
        )}

        {/* ============ 我的委托 ============ */}
        <View className='section-title section-title--plain'>
          <Text>{t('mkt.myConsigns')}</Text>
        </View>
        <View className='card-item card-item--list'>
          {rentConsigns.length === 0 && saleListings.length === 0 && (
            <View className='empty-tip'>
              <Text>{t('mkt.noConsigns')}</Text>
            </View>
          )}

          {rentConsigns.map((c) => (
            <View key={`rent-${c.id}`} className='consign'>
              <View className='consign__icon consign__icon--rent'>
                <View className='icon-svg' style={iconStyle('home', 36)} />
              </View>
              <View className='consign__body'>
                <View className='consign__head'>
                  <Text className='consign__title'>{t('mkt.rentConsignTitle', { title: c.title })}</Text>
                  <View className={`badge ${c.statusCls}`}>
                    <Text>{c.statusLabel}</Text>
                  </View>
                </View>
                <Text className='consign__desc'>{c.desc}</Text>
                <View className='progress'>
                  <View className='progress__bar' style={{ width: `${c.pct}%` }} />
                </View>
              </View>
            </View>
          ))}

          {saleListings.map((l) => {
            const st = saleMetaOf(t, l.status)
            return (
              <View key={`sale-${l.id}`} className='consign'>
                <View className='consign__icon consign__icon--sale'>
                  <View className='icon-svg' style={iconStyle('money', 36)} />
                </View>
                <View className='consign__body'>
                  <View className='consign__head'>
                    <Text className='consign__title'>{t('mkt.saleConsignTitle', { title: l.title || t('prop.unnamed') })}</Text>
                    <View className={`badge ${st.cls}`}>
                      <Text>{st.label}</Text>
                    </View>
                  </View>
                  <Text className='consign__desc'>
                    {[
                      String(l.created_at || '').replace('T', ' ').slice(0, 10),
                      t('mkt.askingPriceLine', { v: money(l.asking_price, l.currency) })
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                  <View className='progress'>
                    <View className='progress__bar' style={{ width: `${st.pct}%` }} />
                  </View>
                </View>
              </View>
            )
          })}
        </View>

        {loading && (
          <StateBlock loading text={t('common.loading')} />
        )}
      </View>

      <BottomNav role='owner' active='' />
    </View>
  )
}