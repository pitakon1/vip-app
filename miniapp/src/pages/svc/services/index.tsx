import { useCallback, useEffect, useState } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { billingApi, leasesApi, serviceOrdersApi } from '@/services/api'
import { useSwrCache } from '@/hooks/useSwrCache'
import { fmtMoney as money } from '@/utils/format'
import { OPTION_PAGE_SIZE } from '@/lib/pagination'
import { iconStyle, type IconKey } from '@/utils/icons'
import StateBlock from '@/components/StateBlock'
import ShellHeader from '@/components/ShellHeader'
import { useI18n } from '@/i18n'
import './index.scss'

// 服务图标（按真实服务编码映射）
const SERVICE_ICONS: Record<string, IconKey> = {
  cleaning: 'sparkles',
  ac_cleaning: 'sparkles',
  wifi_install: 'grid',
  utility_payment: 'money',
  insurance: 'briefcase'
}

const SERVICE_NAME_KEYS: Record<string, string> = {
  cleaning: 'svc.name.cleaning',
  ac_cleaning: 'svc.name.acCleaning',
  wifi_install: 'svc.name.wifiInstall',
  utility_payment: 'svc.name.utility',
  insurance: 'svc.name.insurance'
}

// 价目来源：GET /billing/pricing → service_catalog（价税分离，税费另算）
interface CatalogItem {
  code: string
  label_zh?: string
  label_en?: string
  label_th?: string
  unit?: string
  base_price?: number
  tax_inclusive?: boolean
}

interface ServiceOrderRow {
  id: string | number
  service_type?: string
  amount?: number
  currency?: string
  status?: string
  scheduled_at?: string
  created_at?: string
}

// 购买规格（淘宝式 SKU：按次 / 按日 / 按月）
type BuyModel = 'per_use' | 'daily' | 'monthly'

const MODEL_OPTIONS: Array<{ key: BuyModel; labelKey: string }> = [
  { key: 'per_use', labelKey: 'svc.model.perUse' },
  { key: 'daily', labelKey: 'svc.model.daily' },
  { key: 'monthly', labelKey: 'svc.model.monthly' }
]

// 各规格可选购数量（次数 / 天数 / 月数）
const MODEL_QTY_OPTIONS: Record<BuyModel, number[]> = {
  per_use: [1, 2, 3, 5],
  daily: [1, 3, 7, 15, 30],
  monthly: [1, 3, 6, 12]
}

const MODEL_UNIT_KEY: Record<BuyModel, string> = {
  per_use: 'svc.unit.perUse',
  daily: 'svc.unit.daily',
  monthly: 'svc.unit.monthly'
}

const ORDER_STATUS: Record<string, { text: string; color: string; badge: string }> = {
  pending: { text: 'svc.st.pending', color: 'var(--warning-ink)', badge: 'badge--warning' },
  assigned: { text: 'svc.st.assigned', color: 'var(--info-ink)', badge: 'badge--info' },
  in_progress: { text: 'svc.st.inProgress', color: 'var(--primary-text)', badge: 'badge--info' },
  completed: { text: 'svc.st.completed', color: 'var(--success-ink)', badge: 'badge--success' },
  cancelled: { text: 'svc.st.cancelled', color: 'var(--ink-3)', badge: 'badge--neutral' }
}

interface ServicesPayload {
  catalog: CatalogItem[]
  orders: ServiceOrderRow[]
  activeLease: any
}

interface Quote {
  unit_price?: number
  base_amount?: number
  tax_amount?: number
  total_amount?: number
}

function pickList<T>(res: any): T[] {
  if (Array.isArray(res)) return res
  if (Array.isArray(res?.data)) return res.data
  if (Array.isArray(res?.items)) return res.items
  if (Array.isArray(res?.list)) return res.list
  if (Array.isArray(res?.data?.items)) return res.data.items
  if (Array.isArray(res?.data?.list)) return res.data.list
  return []
}

const formatTime = (x?: string) => (x ? String(x).replace('T', ' ').slice(0, 16) : '—')

export default function TenantServicesPage() {
  const { t, lang } = useI18n()
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)
  const token = useAuthStore((state) => state.token)
  const user = useAuthStore((state) => state.user)
  const uid = user?.id ?? 'anon'

  const [selected, setSelected] = useState<CatalogItem | null>(null)
  const [buyModel, setBuyModel] = useState<BuyModel>('per_use')
  const [buyQty, setBuyQty] = useState<number>(1)
  const [quote, setQuote] = useState<Quote | null>(null)
  const [modelQuotes, setModelQuotes] = useState<Partial<Record<BuyModel, number>>>({})
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const { data, loading, refresh } = useSwrCache<ServicesPayload>({
    key: `tenant:services:${uid}`,
    fetcher: async (): Promise<ServicesPayload> => {
      const [priceRes, orderRes, leaseRes] = await Promise.allSettled([
        billingApi.pricing(),
        serviceOrdersApi.list({ page: 1, page_size: OPTION_PAGE_SIZE }),
        leasesApi.mine()
      ])

      // 价目由后端配置驱动；接口未返回前不注入任何占位数据
      let catalog: CatalogItem[] = []
      if (priceRes.status === 'fulfilled') {
        const cat: any = (priceRes.value as any)?.service_catalog ?? {}
        catalog = Object.entries(cat).map(([code, v]: [string, any]) => ({ code, ...v }))
      }

      const orders =
        orderRes.status === 'fulfilled' ? pickList<ServiceOrderRow>(orderRes.value) : []

      // 服务订单必须关联一套生效中的租约（后端 property_id 必填）
      let activeLease: any = null
      if (leaseRes.status === 'fulfilled') {
        const list = pickList<any>(leaseRes.value)
        activeLease = list.find((l) => l?.status === 'active') ?? null
      }
      return { catalog, orders, activeLease }
    }
  })

  const catalog = data?.catalog ?? []
  const orders = data?.orders ?? []
  const activeLease = data?.activeLease ?? null
  const orderList = orders

  useDidShow(() => {
    loadFromStorage()
    if (!useAuthStore.getState().token) {
      Taro.redirectTo({ url: '/pages/login/index' })
      return
    }
    void refresh(true)
  })

  const openBuy = (item: CatalogItem) => {
    setSelected(item)
    setBuyModel('per_use')
    setBuyQty(1)
  }

  const closeBuy = () => {
    setSelected(null)
    setQuote(null)
    setModelQuotes({})
  }

  // 当前选中商品的规格单价与本次总额：全部来自服务端报价
  const selectedIsUtility = selected?.code === 'utility_payment'

  // 选中商品时预取三种规格的单价，仅用于展示
  useEffect(() => {
    if (!selected || selectedIsUtility) {
      setModelQuotes({})
      return
    }
    let alive = true
    Promise.all(
      MODEL_OPTIONS.map(async (m) => {
        const res: any = await billingApi.quote({
          code: selected.code,
          qty: 1,
          billing_model: m.key
        })
        return [m.key, Number(res?.unit_price || 0)] as const
      })
    )
      .then((pairs) => {
        if (alive) setModelQuotes(Object.fromEntries(pairs) as Partial<Record<BuyModel, number>>)
      })
      .catch(() => {
        if (alive) setModelQuotes({})
      })
    return () => {
      alive = false
    }
  }, [selected?.code, selectedIsUtility])

  // 当前规格 × 数量的服务端报价
  useEffect(() => {
    if (!selected) {
      setQuote(null)
      return
    }
    let alive = true
    setQuoteLoading(true)
    billingApi
      .quote({
        code: selected.code,
        qty: selectedIsUtility ? 1 : buyQty,
        billing_model: selectedIsUtility ? 'per_use' : buyModel
      })
      .then((res: any) => {
        if (alive) setQuote(res ? { ...res } : null)
      })
      .catch(() => {
        if (alive) setQuote(null)
      })
      .finally(() => {
        if (alive) setQuoteLoading(false)
      })
    return () => {
      alive = false
    }
  }, [selected?.code, selectedIsUtility, buyModel, buyQty])

  const unitPrice = Number(quote?.unit_price || 0)
  const total = Number(quote?.base_amount || 0)

  const switchModel = (m: BuyModel) => {
    setBuyModel(m)
    setBuyQty(MODEL_QTY_OPTIONS[m][0])
  }

  const unitOf = (m: BuyModel) => t(MODEL_UNIT_KEY[m])
  const serviceNameOf = (item?: CatalogItem | null) => {
    if (!item) return ''
    // 价目表自带三语名称，优先用后端文案（服务编码可扩展，前端不必硬编码）
    const label =
      lang === 'zh' ? item.label_zh : lang === 'en' ? item.label_en : item.label_th
    if (label) return label
    const k = SERVICE_NAME_KEYS[item.code]
    return k ? t(k) : item.code
  }

  // 提交购买：写入真实服务订单（orderer_id / orderer_type / property_id 必填）
  const handleBuy = async () => {
    if (!selected) return
    if (!token || !user?.id) {
      Taro.showToast({ title: t('svc.loginRequired'), icon: 'none' })
      return
    }
    if (!activeLease?.property_id) {
      Taro.showToast({ title: t('svc.noActiveLease'), icon: 'none' })
      return
    }
    setSubmitting(true)
    try {
      // 水电代缴走公共事业专用接口（单笔缴付，不按次/按日/按月），其余服务走购买规格
      const isUtility = selected.code === 'utility_payment'
      const orderBase = {
        orderer_id: user.id,
        orderer_type: (user.role === 'owner' ? 'owner' : 'tenant') as 'owner' | 'tenant',
        property_id: activeLease.property_id,
        service_type: selected.code,
        // 金额来自服务端报价；后端会再次按价目表校验，篡改客户端金额无效
        amount: total,
        currency: 'THB',
        notes: isUtility
          ? '公共事业代缴（单笔）'
          : `${t(MODEL_OPTIONS.find((m) => m.key === buyModel)?.labelKey ?? 'svc.model.perUse')} x${buyQty}`
      }
      await serviceOrdersApi.create(
        isUtility
          ? orderBase
          : {
              ...orderBase,
              billing_model: buyModel,
              billing_interval: buyQty,
              billing_amount: unitPrice
            }
      )
      Taro.showToast({
        title: isUtility ? t('svc.paySuccess') : t('svc.buySuccess'),
        icon: 'success'
      })
      closeBuy()
      void refresh(true)
    } catch (err) {
      console.error('[TenantServices] 下单失败', err)
      Taro.showToast({ title: t('svc.buyFail'), icon: 'none' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <View className='tenant-services-page'>
      <ShellHeader title={t('nav.services')} />
      <View className='page-container'>
        <View className='svc-hero'>
          <Text className='svc-hero-label'>{t('svc.title')}</Text>
          <Text className='svc-hero-title'>{t('svc.subtitle')}</Text>
        </View>

        {/* 规格标签行：当前可选规格一眼可见 */}
        <View className='svc-filter-row'>
          {MODEL_OPTIONS.map((m) => (
            <View key={m.key} className='svc-filter-tag'>
              <Text className='svc-filter-tag__text'>{t(m.labelKey)}</Text>
            </View>
          ))}
        </View>

        {/* 服务商品橱窗（两列商品卡） */}
        <View className='svc-section-head'>
          <Text className='svc-section-title'>{t('svc.sectionShop')}</Text>
          <Text className='svc-section-hint'>{t('svc.sectionShopSub')}</Text>
        </View>

        {!data ? (
          <StateBlock loading text={t('svc.loading')} />
        ) : catalog.length === 0 ? (
          <StateBlock
            empty
            text={t('svc.empty')}
            icon='clipboard'
          />
        ) : (
          <View className='svc-grid'>
            {catalog.map((item) => {
              const unitBase = selectedUnitLabel(item, t)
              return (
                <View
                  key={item.code}
                  className='svc-product'
                  hoverClass='svc-product--hover'
                  onClick={() => openBuy(item)}
                >
                  <View className='svc-product__icon icon-svg' style={iconStyle(SERVICE_ICONS[item.code] ?? 'clipboard', 44)} />
                  <Text className='svc-product__name' numberOfLines={2}>
                    {serviceNameOf(item)}
                  </Text>
                  <Text className='svc-product__tag' numberOfLines={1}>
                    {item.code === 'utility_payment' ? t('svc.utilityTag') : t('svc.modelTag')}
                  </Text>
                  <View className='svc-product__foot'>
                    <Text className='svc-product__price' numberOfLines={1}>
                      {unitBase}
                    </Text>
                    <View className='svc-product__buy'>+</View>
                  </View>
                </View>
              )
            })}
          </View>
        )}

        {/* 我的订单（真实订单数据） */}
        <View className='svc-section-head'>
          <Text className='svc-section-title'>{t('svc.myOrders')}</Text>
        </View>
        {loading && orderList.length === 0 ? (
          <StateBlock loading text={t('pub.loading')} />
        ) : orderList.length === 0 ? (
          <StateBlock empty text={t('svc.noOrders')} icon='clipboard' />
        ) : (
          <View className='order-list'>
            {orderList.map((o) => {
              const meta = ORDER_STATUS[o.status || 'pending'] || ORDER_STATUS.pending
              const matched = catalog.find((c) => c.code === o.service_type)
              return (
                <View key={o.id} className='order-card'>
                  <View className='order-icon icon-svg' style={iconStyle('clipboard', 40)} />
                  <View className='order-info'>
                    <Text className='order-name'>
                      {matched ? serviceNameOf(matched) : t('svc.orderFallback')}
                    </Text>
                    <Text className='order-time'>
                      {formatTime(o.scheduled_at || o.created_at)} · {money(o.amount, o.currency || 'THB')}
                    </Text>
                  </View>
                  <Text className={`badge ${meta.badge} order-status`}>{t(meta.text)}</Text>
                </View>
              )
            })}
          </View>
        )}
      </View>

      {/* 淘宝式 SKU 购买弹层 */}
      {!!selected && (
        <View className='svc-overlay' onClick={closeBuy}>
          <View className='svc-sheet' onClick={(e) => e.stopPropagation()}>
            <ScrollView scrollY className='svc-sheet__scroll'>
              <View className='svc-sku-head'>
                <View className='svc-sku-icon icon-svg' style={iconStyle(SERVICE_ICONS[selected.code] ?? 'clipboard', 48)} />
                <View className='svc-sku-info'>
                  <Text className='svc-sku-title'>{serviceNameOf(selected)}</Text>
                  <Text className='svc-sku-price'>
                    {money(total, 'THB')}
                    <Text className='svc-sku-unit'>
                      {'  '}
                      {selectedIsUtility
                        ? `/${t('svc.unit.order')}`
                        : `/${t('svc.qtyTotal', { n: buyQty, unit: unitOf(buyModel) })}`}
                    </Text>
                  </Text>
                </View>
                <Text className='svc-sku-close' onClick={closeBuy}>
                  ×
                </Text>
              </View>

              {/* 规格选择（水电代缴为公共事业专用接口，无规格选择） */}
              {!selectedIsUtility && (
                <>
                  <Text className='svc-spec-label'>{t('svc.specModel')}</Text>
                  <View className='svc-model-row'>
                    {MODEL_OPTIONS.map((m) => {
                      const active = buyModel === m.key
                      return (
                        <View
                          key={m.key}
                          className={`svc-model ${active ? 'svc-model--active' : ''}`}
                          onClick={() => switchModel(m.key)}
                        >
                          <Text className={`svc-model__label ${active ? 'svc-model__label--active' : ''}`}>
                            {t(m.labelKey)}
                          </Text>
                          <Text className={`svc-model__sub ${active ? 'svc-model__sub--active' : ''}`}>
                            {money(Number(modelQuotes[m.key] || 0), 'THB')}/{unitOf(m.key)}
                          </Text>
                        </View>
                      )
                    })}
                  </View>

                  <Text className='svc-spec-label'>{t('svc.specQty')}</Text>
                  <View className='svc-qty-wrap'>
                    {MODEL_QTY_OPTIONS[buyModel].map((n) => {
                      const active = buyQty === n
                      return (
                        <View
                          key={n}
                          className={`svc-qty ${active ? 'svc-qty--active' : ''}`}
                          onClick={() => setBuyQty(n)}
                        >
                          <Text className={`svc-qty__text ${active ? 'svc-qty__text--active' : ''}`}>
                            {n}
                            {unitOf(buyModel)}
                          </Text>
                        </View>
                      )
                    })}
                  </View>
                </>
              )}

              {/* 小计明细 */}
              <View className='svc-summary'>
                <View className='svc-sum-row'>
                  <Text className='svc-sum-label'>{t('svc.unitPrice')}</Text>
                  <Text className='svc-sum-value'>{money(unitPrice, 'THB')}</Text>
                </View>
                {!selectedIsUtility && (
                  <View className='svc-sum-row'>
                    <Text className='svc-sum-label'>{t('svc.specQty')}</Text>
                    <Text className='svc-sum-value'>
                      {buyQty}
                      {unitOf(buyModel)}
                    </Text>
                  </View>
                )}
                <View className='svc-sum-row'>
                  <Text className='svc-sum-label'>{t('svc.subtotal')}</Text>
                  <Text className='svc-sum-value svc-sum-value--total'>{money(total, 'THB')}</Text>
                </View>
                {!selectedIsUtility && (
                  <View className='svc-sum-row'>
                    <Text className='svc-sum-label'>{t('svc.tax')}</Text>
                    <Text className='svc-sum-value'>{t('svc.taxNote')}</Text>
                  </View>
                )}
              </View>

              {!activeLease?.property_id && <Text className='svc-warn'>{t('svc.noLeaseWarn')}</Text>}
            </ScrollView>

            {/* 底部结算条 */}
            <View className='svc-buy-bar'>
              <View>
                <Text className='svc-buy-bar__label'>
                  {quoteLoading ? t('svc.quoting') : t('svc.totalDue')}
                </Text>
                <Text className='svc-buy-bar__total'>{quoteLoading ? '—' : money(total, 'THB')}</Text>
              </View>
              <View
                className={`svc-buy-btn ${submitting || quoteLoading || !quote ? 'svc-buy-btn--disabled' : ''}`}
                onClick={() => {
                  if (submitting || quoteLoading || !quote) return
                  void handleBuy()
                }}
              >
                <Text className='svc-buy-btn__text'>
                  {selectedIsUtility ? t('svc.payNow') : t('svc.buyNow')}
                </Text>
              </View>
            </View>
          </View>
        </View>
      )}
    </View>
  )
}

/** 商品卡单价：水电代缴按「笔」，其余按价目单位（次/台/月） */
function selectedUnitLabel(
  item: CatalogItem,
  t: (k: string, p?: Record<string, string | number>) => string
) {
  const unit = item.code === 'utility_payment' ? t('svc.unit.order') : item.unit || t('svc.unit.perUse')
  return `${money(Number(item.base_price || 0), 'THB')}/${unit}`
}
