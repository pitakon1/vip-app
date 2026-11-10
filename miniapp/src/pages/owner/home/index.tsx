import { useMemo } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useDidShow, usePullDownRefresh } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { ownerApi, listingApi, paymentsApi } from '@/services/api'
import { useSwrCache } from '@/hooks/useSwrCache'
import { fmtMoney as money } from '@/utils/format'
import { isOverdue, isUnpaid } from '@/utils/payment'
import { OPTION_PAGE_SIZE } from '@/lib/pagination'
import { iconStyle, type IconKey } from '@/utils/icons'
import ShellHeader from '@/components/ShellHeader'
import StateBlock from '@/components/StateBlock'
import BottomNav from '@/components/BottomNav'
import { useI18n } from '@/i18n'
import './index.scss'

/**
 * 业主「资产管理」（对齐 App screens/owner/HomeScreen.tsx）。
 *
 * 首页（pages/tenant/home）是租客同款 C 端公开首页；业主差异内容集中在本页：
 * 资产概览（出租率）→ 年度收益趋势 → 房源概览 → 我的上架单 → 待办提醒。
 * 数据全部来自真实接口：/owners/me/properties、/owners/me/annual-financial-summary、
 * /listings、/payments/me，不编造。
 */
interface AnnualMonthly {
  month?: string | number
  received?: number
  pending?: number
  overdue?: number
  count?: number
}

interface AnnualSummary {
  year?: number
  by_month?: AnnualMonthly[]
  totals?: { received?: number; pending?: number; overdue?: number; count?: number }
}

interface OwnerProperty {
  id: string
  name?: string
  room_number?: string
  project_name?: string
  address?: string
  status?: string
  monthly_rent?: number
  sale_price?: number
  currency?: string
  size_sqm?: number
  bedrooms?: number
  bathrooms?: number
  tenant_name?: string
}

interface Listing {
  id: string
  listing_type?: string
  room_number?: string
  address?: string
  status?: string
  monthly_rent?: number
  asking_price?: number
  currency?: string
  publisher_user_id?: string
  owner_commission_rate?: number
  sale_commission_rate?: number
  rental_commission_months?: number
}

interface HomePayload {
  properties: OwnerProperty[]
  annual: AnnualSummary | null
  listings: Listing[]
  payments: any[]
  paymentSummary?: {
    unpaid_count?: number
    unpaid_amount?: number
    overdue_count?: number
    overdue_amount?: number
  } | null
}

const pickList = <T,>(res: PromiseSettledResult<any>): T[] => {
  if (res.status !== 'fulfilled') return []
  const d: any = res.value
  const items = Array.isArray(d) ? d : d?.items ?? d?.data?.items ?? d?.data ?? []
  return Array.isArray(items) ? items : []
}

export default function OwnerHomePage() {
  const { t } = useI18n()
  const loadFromStorage = useAuthStore((s) => s.loadFromStorage)
  const user = useAuthStore((s) => s.user)
  const uid = user?.id ?? 'anon'
  const year = new Date().getFullYear()

  const { data, error, refresh } = useSwrCache<HomePayload>({
    key: `owner-home:${uid}:${year}`,
    fetcher: async (): Promise<HomePayload> => {
      const [propRes, sumRes, listRes, payRes] = await Promise.allSettled([
        ownerApi.properties(),
        ownerApi.annualFinancialSummary(year),
        listingApi.list({ page: 1, page_size: OPTION_PAGE_SIZE, mine: true }),
        paymentsApi.mine()
      ])
      const payBody: any = payRes.status === 'fulfilled' ? payRes.value : null
      return {
        properties: pickList<OwnerProperty>(propRes),
        annual: sumRes.status === 'fulfilled' ? ((sumRes.value as any) ?? null) : null,
        listings: pickList<Listing>(listRes),
        payments: pickList<any>(payRes),
        paymentSummary: payBody?.summary ?? null
      }
    }
  })

  const properties = data?.properties ?? []
  const annual = data?.annual ?? null
  // 我的上架单：后端 mine=true 已按「发布人/业主/合作方」收窄，前端不再二次过滤
  const listings = data?.listings ?? []
  const pays = data?.payments ?? []
  const paySummary = data?.paymentSummary
  const due = pays.filter(isUnpaid)
  const overdue = due.filter(isOverdue)
  const dueCount = Number(paySummary?.unpaid_count ?? due.length)
  const dueTotal = Number(paySummary?.unpaid_amount ?? due.reduce((s, p) => s + Number(p.amount || 0), 0))
  const overdueCount = Number(paySummary?.overdue_count ?? overdue.length)

  const currency = properties[0]?.currency || 'THB'

  useDidShow(() => {
    loadFromStorage()
    if (!useAuthStore.getState().token) {
      Taro.redirectTo({ url: '/pages/login/index' })
      return
    }
    void refresh()
  })

  usePullDownRefresh(async () => {
    await refresh(true)
    Taro.stopPullDownRefresh()
  })

  /* ===== 本月实收 / 年累计实收：取年度汇总（真实数据） ===== */
  const monthReceived = useMemo(() => {
    const buckets = annual?.by_month ?? []
    return Number(buckets.length ? buckets[buckets.length - 1]?.received ?? 0 : 0)
  }, [annual])

  const yearReceived = Number(annual?.totals?.received ?? 0)

  /* ===== 年度收益趋势（月度实收柱状） ===== */
  const chartData = useMemo(() => {
    return (annual?.by_month ?? [])
      .map((b) => {
        const s = String(b.month ?? '')
        const num = s.includes('-') ? Number(s.split('-')[1]) : Number(s)
        const label = Number.isInteger(num) && num >= 1 && num <= 12 ? t(`emp.month.${num}`) : s
        return { label, value: Number(b.received ?? 0) }
      })
      .filter((d) => d.value > 0)
  }, [annual, t])
  const chartMax = chartData.reduce((m, d) => Math.max(m, d.value), 0)

  /* ===== 资产概览（在管 / 出租中 / 空置 / 在售） ===== */
  const statusCount = useMemo(() => {
    const count = { total: properties.length, vacant: 0, rented: 0, forSale: 0, other: 0 }
    properties.forEach((p) => {
      const s = String(p.status || '').toLowerCase()
      if (s === 'vacant' || s === 'available') count.vacant += 1
      else if (s === 'for_sale' || s === 'on_sale' || s === 'sale') count.forSale += 1
      else if (s === 'rented' || s === 'active') count.rented += 1
    })
    // 维护中 / 续租中等状态不归入上面三桶，单独兜底，保证分布条占比合计为 100%
    count.other = Math.max(0, count.total - count.vacant - count.rented - count.forSale)
    return count
  }, [properties])

  const propTitle = (p: OwnerProperty) =>
    p.name ||
    (p.project_name
      ? `${p.project_name}·${p.room_number ?? ''}`
      : p.room_number || p.address || t('ownerHome.propertyFallback'))

  const propMeta = (p: OwnerProperty) =>
    `${t('ownerHome.rooms', { bed: p.bedrooms ?? 0, bath: p.bathrooms ?? 0 })} · ${
      p.size_sqm ? `${p.size_sqm}${t('pub.sqm')}` : '—'
    }`

  const propStatusOf = (p: OwnerProperty): { text: string; cls: string; icon: IconKey } => {
    const s = String(p.status || '').toLowerCase()
    if (s === 'vacant' || s === 'available')
      return { text: t('ownerHome.vacant'), cls: 'warning', icon: 'home' }
    if (s === 'for_sale' || s === 'on_sale' || s === 'sale')
      return { text: t('ownerHome.forSale'), cls: 'info', icon: 'storefront' }
    return { text: t('ownerHome.rented'), cls: 'success', icon: 'home' }
  }

  const listingPrice = (l: Listing) => {
    if (l.listing_type === 'sell' && l.asking_price != null)
      return money(l.asking_price, l.currency || currency)
    if (l.monthly_rent != null) return `${money(l.monthly_rent, l.currency || currency)}${t('pub.perMonth')}`
    return '—'
  }

  const listingCommission = (l: Listing) => {
    if (l.owner_commission_rate != null)
      return t('ownerHome.commissionOwner', { rate: l.owner_commission_rate })
    if (l.listing_type === 'sell')
      return l.sale_commission_rate != null
        ? t('ownerHome.commissionSale', { rate: l.sale_commission_rate })
        : t('ownerHome.sell')
    return l.rental_commission_months != null
      ? t('ownerHome.commissionRentMonths', { n: l.rental_commission_months })
      : t('ownerHome.rent')
  }

  // 上架单状态文案（与「我的上架单」同口径）
  const listingStatusOf = (s?: string): { key: string; cls: string } => {
    const map: Record<string, { key: string; cls: string }> = {
      pending: { key: 'myListings.status.pending', cls: 'warning' },
      active: { key: 'myListings.status.active', cls: 'success' },
      rejected: { key: 'myListings.status.rejected', cls: 'error' },
      closed: { key: 'myListings.status.closed', cls: 'neutral' },
      sold: { key: 'myListings.status.sold', cls: 'info' },
      rented: { key: 'myListings.status.rented', cls: 'info' }
    }
    return map[String(s || '')] ?? map.pending
  }

  const go = (url: string) => Taro.navigateTo({ url })
  const hasTodo = statusCount.vacant > 0 || dueCount > 0 || dueTotal > 0

  return (
    <View className='owner-home-page'>
      <ShellHeader title={t('nav.ownerHome')} />
      <View className='page-container'>
        {!data ? (
          error ? (
            <StateBlock
              error
              text={t('common.loadFailedTapRetry')}
              retryText={t('common.tapRetry')}
              onRetry={() => void refresh(true)}
            />
          ) : (
            <StateBlock loading text={t('ownerHome.loading')} />
          )
        ) : (
          <>
            {/* 1. 资产概览卡 */}
            <View className='asset-hero'>
              <View className='asset-hero__head'>
                <View>
                  <Text className='asset-hero__label'>{t('ownerHome.monthReceived')}</Text>
                  <Text className='asset-hero__total'>{money(monthReceived, currency)}</Text>
                </View>
                <Text
                  className='asset-hero__link'
                  onClick={() => go('/pages/owner/properties/index')}
                >
                  {t('ownerHome.managedCount', { n: statusCount.total })}
                </Text>
              </View>

              <View className='asset-stats'>
                <View className='asset-stat'>
                  <Text className='asset-stat__value asset-stat__value--success'>{statusCount.rented}</Text>
                  <Text className='asset-stat__label'>{t('ownerHome.rented')}</Text>
                </View>
                <View className='asset-stat'>
                  <Text className='asset-stat__value asset-stat__value--warning'>{statusCount.vacant}</Text>
                  <Text className='asset-stat__label'>{t('ownerHome.vacant')}</Text>
                </View>
                <View className='asset-stat'>
                  <Text className='asset-stat__value asset-stat__value--info'>{statusCount.forSale}</Text>
                  <Text className='asset-stat__label'>{t('ownerHome.forSale')}</Text>
                </View>
                <View className='asset-stat'>
                  <Text className='asset-stat__value asset-stat__value--primary'>
                    {yearReceived ? money(yearReceived, currency) : '—'}
                  </Text>
                  <Text className='asset-stat__label'>{t('ownerHome.yearIncome')}</Text>
                </View>
              </View>

              {statusCount.total > 0 ? (
                <View className='asset-stack'>
                  <View className='asset-stack__head'>
                    <Text className='asset-stack__label'>{t('ownerHome.assetDistribution')}</Text>
                    <Text className='asset-stack__total'>{t('ownerHome.totalUnits', { n: statusCount.total })}</Text>
                  </View>
                  <View className='asset-stack__bar'>
                    {statusCount.rented > 0 && (
                      <View
                        className='asset-stack__seg asset-stack__seg--success'
                        style={{ flex: statusCount.rented }}
                      />
                    )}
                    {statusCount.vacant > 0 && (
                      <View
                        className='asset-stack__seg asset-stack__seg--warning'
                        style={{ flex: statusCount.vacant }}
                      />
                    )}
                    {statusCount.forSale > 0 && (
                      <View
                        className='asset-stack__seg asset-stack__seg--info'
                        style={{ flex: statusCount.forSale }}
                      />
                    )}
                    {statusCount.other > 0 && (
                      <View
                        className='asset-stack__seg asset-stack__seg--other'
                        style={{ flex: statusCount.other }}
                      />
                    )}
                  </View>
                  <View className='asset-stack__legend'>
                    <Text className='asset-stack__legend-item'>
                      <Text className='dot dot--success' /> {t('ownerHome.rented')} ·{' '}
                      {t('ownerHome.units', { n: statusCount.rented })}
                    </Text>
                    <Text className='asset-stack__legend-item'>
                      <Text className='dot dot--warning' /> {t('ownerHome.vacant')} ·{' '}
                      {t('ownerHome.units', { n: statusCount.vacant })}
                    </Text>
                    <Text className='asset-stack__legend-item'>
                      <Text className='dot dot--info' /> {t('ownerHome.forSale')} ·{' '}
                      {t('ownerHome.units', { n: statusCount.forSale })}
                    </Text>
                  </View>
                </View>
              ) : (
                <View className='asset-empty'>
                  <Text className='asset-empty__title'>{t('ownerHome.emptyPropsTitle')}</Text>
                  <Text className='asset-empty__sub'>{t('ownerHome.emptyPropsSub')}</Text>
                  <View
                    className='asset-empty__btn'
                    onClick={() => go('/pages/owner/properties/index')}
                  >
                    <Text className='asset-empty__btn-text'>{t('ownerHome.goRegister')}</Text>
                  </View>
                </View>
              )}
            </View>

            {/* 2. 年度收益趋势 */}
            <View className='section-head'>
              <Text className='section-head__title'>{t('ownerHome.trendTitle')}</Text>
              <Text className='section-head__hint'>{currency}</Text>
            </View>
            <View className='card'>
              {chartData.length > 0 ? (
                <View className='trend-chart'>
                  {chartData.map((d, i) => (
                    <View key={`${d.label}-${i}`} className='trend-col'>
                      <Text className='trend-col__value'>
                        {d.value >= 1000 ? `${Math.round(d.value / 1000)}k` : d.value}
                      </Text>
                      <View className='trend-col__track'>
                        <View
                          className='trend-col__bar'
                          style={{ height: `${chartMax ? Math.max(6, (d.value / chartMax) * 100) : 0}%` }}
                        />
                      </View>
                      <Text className='trend-col__label'>{d.label}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <StateBlock
                  empty
                  icon='chart'
                  text={`${t('ownerHome.noTrendTitle')} · ${t('ownerHome.noTrendSub')}`}
                />
              )}
            </View>

            {/* 3. 房源概览（前 3 套） */}
            <View className='section-head'>
              <Text className='section-head__title'>{t('ownerHome.propsTitle')}</Text>
            </View>
            <View className='card card--list'>
              {properties.length === 0 ? (
                <StateBlock
                  empty
                  icon='home'
                  text={`${t('ownerHome.noPropsTitle')} · ${t('ownerHome.noPropsSub')}`}
                />
              ) : (
                <>
                  {properties.slice(0, 3).map((p) => {
                    const st = propStatusOf(p)
                    return (
                      <View
                        key={p.id}
                        className='entity-row'
                        hoverClass='entity-row--hover'
                        onClick={() =>
                          go(`/pages/owner/property-detail/index?id=${encodeURIComponent(p.id)}`)
                        }
                      >
                        <View className={`entity-row__icon entity-row__icon--${st.cls}`}>
                          <View className='icon-svg' style={iconStyle(st.icon, 36)} />
                        </View>
                        <View className='entity-row__body'>
                          <View className='entity-row__top'>
                            <Text className='entity-row__name' numberOfLines={1}>
                              {propTitle(p)}
                            </Text>
                            <Text className={`badge badge--${st.cls} entity-row__badge`}>{st.text}</Text>
                          </View>
                          <Text className='entity-row__meta' numberOfLines={1}>
                            {p.address || propMeta(p)}
                            {p.tenant_name ? ` · ${t('ownerHome.tenant', { name: p.tenant_name })}` : ''}
                          </Text>
                          <Text className='entity-row__price'>
                            {p.monthly_rent
                              ? `${money(Number(p.monthly_rent), p.currency || currency)}${t('pub.perMonth')}`
                              : p.sale_price
                                ? money(Number(p.sale_price), p.currency || currency)
                                : t('ownerHome.noPrice')}
                          </Text>
                        </View>
                        <Text className='entity-row__arrow'>›</Text>
                      </View>
                    )
                  })}
                  <View
                    className='more-row'
                    onClick={() => go('/pages/owner/properties/index')}
                  >
                    <Text className='more-row__link'>
                      {t('ownerHome.viewAllUnits', { n: statusCount.total })}
                    </Text>
                  </View>
                </>
              )}
            </View>

            {/* 4. 我的上架单（前 3 条） */}
            <View className='section-head'>
              <Text className='section-head__title'>{t('ownerHome.myListings')}</Text>
              <Text
                className='section-head__link'
                onClick={() => go('/pages/tenant/listings/index')}
              >
                {t('ownerHome.viewAllListings', { n: listings.length })}
              </Text>
            </View>
            <View className='card card--list'>
              {listings.length === 0 ? (
                <StateBlock
                  empty
                  icon='storefront'
                  text={`${t('ownerHome.noListingsTitle')} · ${t('ownerHome.noListingsSub')}`}
                />
              ) : (
                listings.slice(0, 3).map((l) => {
                  const st = listingStatusOf(l.status)
                  return (
                    <View
                      key={l.id}
                      className='entity-row'
                      hoverClass='entity-row--hover'
                      onClick={() => go('/pages/tenant/listings/index')}
                    >
                      <View className={`entity-row__icon entity-row__icon--${st.cls}`}>
                        <View
                          className='icon-svg'
                          style={iconStyle(l.listing_type === 'sell' ? 'storefront' : 'home', 36)}
                        />
                      </View>
                      <View className='entity-row__body'>
                        <View className='entity-row__top'>
                          <Text className='entity-row__name' numberOfLines={1}>
                            {l.room_number || l.address || t('ownerHome.listingFallback')}
                          </Text>
                          <Text className={`badge badge--${st.cls} entity-row__badge`}>{t(st.key)}</Text>
                        </View>
                        <Text className='entity-row__meta' numberOfLines={1}>
                          {l.listing_type === 'sell' ? t('ownerHome.sell') : t('ownerHome.rent')} ·{' '}
                          {listingCommission(l)}
                        </Text>
                        <Text className='entity-row__price'>{listingPrice(l)}</Text>
                      </View>
                      <Text className='entity-row__arrow'>›</Text>
                    </View>
                  )
                })
              )}
            </View>

            {/* 5. 待办 / 提醒 */}
            {hasTodo && (
              <View className='alert-card'>
                {statusCount.vacant > 0 && (
                  <View className='alert-row' onClick={() => go('/pages/owner/properties/index')}>
                    <View className='alert-row__icon'>
                      <View className='icon-svg' style={iconStyle('home', 34)} />
                    </View>
                    <View className='alert-row__body'>
                      <Text className='alert-row__title'>{t('ownerHome.vacantTodo')}</Text>
                      <Text className='alert-row__desc'>
                        {t('ownerHome.vacantTodoDesc', { n: statusCount.vacant })}
                      </Text>
                    </View>
                    <Text className='alert-row__arrow'>›</Text>
                  </View>
                )}
                {(dueCount > 0 || dueTotal > 0) && (
                  <View className='alert-row' onClick={() => go('/pages/tenant/payments/index')}>
                    <View className='alert-row__icon alert-row__icon--error'>
                      <View className='icon-svg' style={iconStyle('card', 34)} />
                    </View>
                    <View className='alert-row__body'>
                      <Text className='alert-row__title'>{t('ownerHome.dueTodo')}</Text>
                      <Text className='alert-row__desc'>
                        {t('ownerHome.dueDesc', { n: dueCount, amount: money(dueTotal, currency) })}
                        {overdueCount > 0 ? t('ownerHome.dueOverdue', { n: overdueCount }) : ''}
                      </Text>
                    </View>
                    <Text className='alert-row__arrow'>›</Text>
                  </View>
                )}
                <View className='alert-row' onClick={() => go('/pages/tenant/documents/index')}>
                  <View className='alert-row__icon alert-row__icon--info'>
                    <View className='icon-svg' style={iconStyle('doc', 34)} />
                  </View>
                  <View className='alert-row__body'>
                    <Text className='alert-row__title'>{t('ownerHome.docsTodo')}</Text>
                    <Text className='alert-row__desc'>{t('ownerHome.docsDesc')}</Text>
                  </View>
                  <Text className='alert-row__arrow'>›</Text>
                </View>
              </View>
            )}
          </>
        )}
      </View>

      <BottomNav role='owner' active='dashboard' />
    </View>
  )
}
