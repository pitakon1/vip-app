import { useCallback, useEffect, useMemo, useState } from 'react'
import { View, Text, ScrollView, Button } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { ownerApi, saleListingApi } from '@/services/api'
import { fmtMoney as money } from '@/utils/format'
import './index.scss'
import { iconStyle } from '@/utils/icons'
import BottomNav from '@/components/BottomNav'

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

const propertyTypeText = (t?: string) =>
  t === 'apartment' ? '公寓' : t === 'villa' ? '别墅' : t === 'condo' ? '公寓' : t || '房源'

// 方向 / 状态元信息：颜色语义交由 SCSS 徽章类实现
const DIRECTION_META: Record<string, { label: string; cls: string }> = {
  raise: { label: '建议涨价', cls: 'badge--success' },
  lower: { label: '建议降价', cls: 'badge--error' },
  keep: { label: '维持现价', cls: 'badge--info' }
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  vacant: { label: '空置', cls: 'badge--warning' },
  maintenance: { label: '维护中', cls: 'badge--neutral' }
}

// 售房挂牌状态（对齐后端 ListingStatus），进度由状态推导
const SALE_STATUS_META: Record<string, { label: string; cls: string; pct: number }> = {
  pending: { label: '待确认', cls: 'badge--warning', pct: 10 },
  active: { label: '在售', cls: 'badge--primary', pct: 35 },
  contracted: { label: '已签约', cls: 'badge--success', pct: 75 },
  closed: { label: '已成交', cls: 'badge--success', pct: 100 },
  cancelled: { label: '已取消', cls: 'badge--neutral', pct: 0 },
  expired: { label: '已过期', cls: 'badge--neutral', pct: 0 }
}

const saleMetaOf = (s?: string) => SALE_STATUS_META[s || ''] || { label: s || '待挂牌', cls: 'badge--neutral', pct: 0 }

const saleMetaText = (l: SaleListingItem) => {
  const room = l.bedrooms ? `${l.bedrooms}室${l.bathrooms || 0}厅` : ''
  const size = l.size_sqm ? `${l.size_sqm}㎡` : ''
  return [room, size].filter(Boolean).join(' · ')
}

const stepMeta = (p: VacantItem) => {
  const room = p.bedrooms ? `${p.bedrooms}室${p.bathrooms || 0}厅` : ''
  const size = p.size_sqm ? `${p.size_sqm}㎡` : ''
  const st = STATUS_META[p.status || ''] || { label: p.status || '待推广' }
  return [propertyTypeText(p.property_type), room, size].filter(Boolean).join(' · ') + ` · ${st.label}`
}

export default function OwnerMarketingPage() {
  const [loading, setLoading] = useState(false)
  const [vacants, setVacants] = useState<VacantItem[]>([])
  const [totalVacant, setTotalVacant] = useState(0)
  const [totalProperties, setTotalProperties] = useState(0)
  const [pricing, setPricing] = useState<PricingItem[]>([])
  const [year, setYear] = useState<number>(new Date().getFullYear())
  const [annual, setAnnual] = useState<AnnualMonth[]>([])
  const [annualTotals, setAnnualTotals] = useState({
    received: 0,
    pending: 0,
    overdue: 0,
    count: 0
  })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // 委托类型：出租 / 出售（对齐原型 rent-tabs）
  const [activeTab, setActiveTab] = useState<'rent' | 'sale'>('rent')
  // 我的售房挂牌与在线估价记录
  const [saleListings, setSaleListings] = useState<SaleListingItem[]>([])
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null)
  const [valuations, setValuations] = useState<Valuation[]>([])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [mk, pr, ann, sl]: [any, any, any, any] = await Promise.all([
        ownerApi.marketing(),
        ownerApi.pricingSuggestion(),
        ownerApi.annualFinancialSummary(year),
        saleListingApi.list().catch(() => null)
      ])
      const mkD = mk?.data ?? mk
      setVacants(pick(mkD, 'items'))
      setTotalVacant(Number(mkD?.total_vacant ?? 0))
      setTotalProperties(Number(mkD?.total_properties ?? 0))
      setPricing(pick(pr?.data ?? pr, 'items'))
      const annD = ann?.data ?? ann
      setAnnual(pick(annD, 'by_month'))
      setAnnualTotals(annD?.totals ?? { received: 0, pending: 0, overdue: 0, count: 0 })
      // 售房挂牌：按当前登录用户收窄（非管理员接口仅返回 active/pending）
      const slD = sl?.data ?? sl
      setSaleListings(pick(slD, 'items'))
    } catch (error) {
      Taro.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }, [year])

  useDidShow(() => {
    if (!useAuthStore.getState().token) {
      Taro.redirectTo({ url: '/pages/login/index' })
      return
    }
    fetchAll()
  })

  // 切换年份时重新拉取该年度的财务汇总数据
  useEffect(() => {
    fetchAll()
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
  const saleStep = saleMetaOf(selectedSale?.status)

  // 我的出租委托：空置房源中已有分享链接的视为已挂牌推广
  const rentConsigns = vacants.map((v) => {
    const published = !!v.share_url
    return {
      id: v.id,
      title: v.title || '未命名房源',
      statusLabel: published ? '进行中' : '待挂牌',
      statusCls: published ? 'badge--primary' : 'badge--neutral',
      pct: published ? 65 : 20,
      desc: [money(v.monthly_rent, v.currency) + '/月', published ? '推广中' : '待发布推广'].join(' · ')
    }
  })

  const copyLink = (item: VacantItem) => {
    Taro.setClipboardData({
      data: item.share_url || `/pages/tenant/listings/index`,
      success: () => Taro.showToast({ title: '链接已复制', icon: 'success' })
    })
  }

  const exportCsv = () => {
    const rows = [
      ['月份', '已收', '应收未收', '逾期', '笔数'],
      ...annual.map((m) => [m.month, m.received, m.pending, m.overdue, m.count])
    ]
    rows.push(['合计', annualTotals.received, annualTotals.pending, annualTotals.overdue, annualTotals.count])
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n')
    Taro.showModal({
      title: '导出年度财务',
      content: `${year} 年：已收 ${money(annualTotals.received)}，逾期 ${money(annualTotals.overdue)}。导出 CSV 数据。`,
      confirmText: '确认',
      success: (res) => {
        if (res.confirm) {
          // 小程序无法直接下载文件，将数据写入剪贴板
          Taro.setClipboardData({
            data: `\ufeff${csv}`,
            success: () => Taro.showToast({ title: 'CSV 数据已复制', icon: 'success' })
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
      : '暂无区间数据'
  const dirMeta = DIRECTION_META[selectedPricing?.suggestion?.direction || 'keep'] || DIRECTION_META.keep

  return (
    <View className='owner-marketing-page'>
      <View className='page-container'>
        <Text className='page-title'>委托中心</Text>
        <Text className='page-subtitle'>委托出租与委托出售全流程：选房定价、挂牌托管、在线估价与成交跟进</Text>

        {/* 双委托入口 Tab（对齐原型 .rent-tabs） */}
        <View className='owner-tabs'>
          <View
            className={`owner-tabs__item ${activeTab === 'rent' ? 'owner-tabs__item--active' : ''}`}
            onClick={() => setActiveTab('rent')}
          >
            <Text>委托出租</Text>
          </View>
          <View
            className={`owner-tabs__item ${activeTab === 'sale' ? 'owner-tabs__item--active' : ''}`}
            onClick={() => setActiveTab('sale')}
          >
            <Text>委托出售</Text>
          </View>
        </View>

        {/* 概览 */}
        <View className='stats-grid'>
          <View className='stat-card'>
            <Text className='stat-num'>{totalProperties}</Text>
            <Text className='stat-label'>名下房源</Text>
          </View>
          <View className='stat-card stat-card--warning'>
            <Text className='stat-num'>{totalVacant}</Text>
            <Text className='stat-label'>空置待租</Text>
          </View>
          <View className='stat-card'>
            <Text className='stat-num'>{occupancy}%</Text>
            <Text className='stat-label'>入住率</Text>
          </View>
          <View className='stat-card'>
            <Text className='stat-num'>{pricingCount}</Text>
            <Text className='stat-label'>待定价</Text>
          </View>
        </View>

        {/* 委托推广四步流程（委托出租） */}
        {activeTab === 'rent' && (
          <>
        <View className='steps'>
          <View className={stepCls(1)}>
            <Text className='steps__dot'>1</Text>
            <Text className='steps__label'>选择房源</Text>
          </View>
          <View className={stepCls(2)}>
            <Text className='steps__dot'>2</Text>
            <Text className='steps__label'>定价</Text>
          </View>
          <View className={stepCls(3)}>
            <Text className='steps__dot'>3</Text>
            <Text className='steps__label'>挂牌</Text>
          </View>
          <View className={stepCls(4)}>
            <Text className='steps__dot'>4</Text>
            <Text className='steps__label'>托管完成</Text>
          </View>
        </View>

        {/* ① 选择房源 */}
        <View className='card-item'>
          <View className='card-item__head'>
            <Text className='card-item__title'>① 选择房源</Text>
            <View className='badge badge--primary'>
              <Text>可选 {totalVacant} 套</Text>
            </View>
          </View>
          {vacants.length === 0 ? (
            <View className='empty-tip'>
              <Text>暂无可推广的空置房源</Text>
            </View>
          ) : (
            vacants.map((v) => {
              const st = STATUS_META[v.status || ''] || { label: v.status || '待推广', cls: 'badge--neutral' }
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
                    <Text className='pick__title'>{v.title || '未命名房源'}</Text>
                    <Text className='pick__meta'>{stepMeta(v)}</Text>
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
              已选：{selected.title || '未命名房源'} · 月租 {money(selected.monthly_rent, selected.currency)}
            </Text>
          )}
        </View>

        {/* ② 定价建议 */}
        <View className='card-item'>
          <View className='card-item__head'>
            <Text className='card-item__title'>② 定价建议</Text>
            <View className='badge badge--neutral'>
              <Text>同类在租行情</Text>
            </View>
          </View>
          {!selected || !selectedPricing ? (
            <View className='empty-tip'>
              <Text>该房源暂无同行情定价基准</Text>
            </View>
          ) : (
            <View>
              <View className='price-row'>
                <View className='price-row__left'>
                  <Text className='price-row__label'>建议月租金</Text>
                  <Text className='price-row__main'>
                    {suggestedPrice != null ? money(suggestedPrice, selectedPricing.currency) : '—'}
                    <Text className='price-row__unit'>/月</Text>
                  </Text>
                </View>
                <View className='price-row__right'>
                  <Text className='price-row__label'>市场均值</Text>
                  <Text className='price-row__avg'>
                    {selectedPricing.peer_avg ? money(selectedPricing.peer_avg, selectedPricing.currency) : '—'}
                  </Text>
                </View>
              </View>
              <View className='progress'>
                <View className='progress__bar' style={{ width: `${rangePct}%` }} />
              </View>
              <View className='price-row price-row--foot'>
                <Text className='price-row__hint'>市场租金区间 {rangeText}</Text>
                <Text className='price-row__dir'>
                  {dirMeta.label}
                  {selectedPricing.suggestion
                    ? ` ${selectedPricing.suggestion.diff_pct > 0 ? '+' : ''}${selectedPricing.suggestion.diff_pct}%`
                    : ''}
                </Text>
              </View>
              <Text className='card-item__sub'>
                定价依据：同户型 {selectedPricing.peer_count || 0} 套在租房源行情与当前挂牌租金对比
                {selectedPricing.monthly_rent
                  ? `（当前月租 ${money(selectedPricing.monthly_rent, selectedPricing.currency)}）`
                  : ''}
                。
              </Text>
            </View>
          )}
        </View>

        {/* ③ 挂牌推广 */}
        <View className='card-item'>
          <View className='card-item__head'>
            <Text className='card-item__title'>③ 挂牌推广</Text>
            <View className='badge badge--primary'>
              <Text>全渠道分享</Text>
            </View>
          </View>
          {!selected ? (
            <View className='empty-tip'>
              <Text>请先在第 1 步选择房源</Text>
            </View>
          ) : (
            <View>
              <View className='field'>
                <Text className='field__label'>房源</Text>
                <Text className='field__value'>{selected.title || '未命名房源'}</Text>
              </View>
              <View className='field'>
                <Text className='field__label'>类型</Text>
                <Text className='field__value'>{propertyTypeText(selected.property_type)}</Text>
              </View>
              <View className='field'>
                <Text className='field__label'>月租</Text>
                <Text className='field__value'>{money(selected.monthly_rent, selected.currency)}</Text>
              </View>
              <View className='field'>
                <Text className='field__label'>挂牌状态</Text>
                <View className={`badge ${(STATUS_META[selected.status || ''] || { cls: 'badge--neutral' }).cls}`}>
                  <Text>{(STATUS_META[selected.status || ''] || { label: selected.status || '待推广' }).label}</Text>
                </View>
              </View>
              <View className='field'>
                <Text className='field__label'>分享链接</Text>
                <Text className='field__value field__value--mono'>
                  {selected.share_url || `/properties/${selected.id}`}
                </Text>
              </View>
              <Button className='share-btn' onClick={() => copyLink(selected)}>
                复制推广链接
              </Button>
            </View>
          )}
        </View>

        {/* ④ 托管完成 · 年度财务汇总 */}
        <View className='card-item'>
          <View className='card-item__head'>
            <Text className='card-item__title'>④ 托管完成 · 年度财务汇总</Text>
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
              <Text>暂无年度财务数据</Text>
            </View>
          ) : (
            <ScrollView scrollX className='ann-table'>
              <View className='ann-row ann-row--head'>
                <Text className='ann-cell'>月份</Text>
                <Text className='ann-cell'>已收</Text>
                <Text className='ann-cell'>应收未收</Text>
                <Text className='ann-cell'>逾期</Text>
                <Text className='ann-cell'>笔数</Text>
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
                <Text className='ann-cell'>合计</Text>
                <Text className='ann-cell ann-cell--success'>{money(annualTotals.received)}</Text>
                <Text className='ann-cell'>{money(annualTotals.pending)}</Text>
                <Text className='ann-cell ann-cell--error'>{money(annualTotals.overdue)}</Text>
                <Text className='ann-cell'>{annualTotals.count}</Text>
              </View>
            </ScrollView>
          )}
          <Button className='export-btn' onClick={exportCsv}>
            <View className='export-btn__icon icon-svg' style={iconStyle('doc', 32)} />
            导出年度财务 CSV
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
                <Text className='steps__label'>在线估价</Text>
              </View>
              <View className={selectedSale ? 'steps__item steps__item--active' : 'steps__item'}>
                <Text className='steps__dot'>2</Text>
                <Text className='steps__label'>挂牌</Text>
              </View>
              <View className='steps__item'>
                <Text className='steps__dot'>3</Text>
                <Text className='steps__label'>预约带看</Text>
              </View>
              <View className='steps__item'>
                <Text className='steps__dot'>4</Text>
                <Text className='steps__label'>成交</Text>
              </View>
            </View>

            {/* 售房挂牌选择 */}
            <View className='card-item'>
              <View className='card-item__head'>
                <Text className='card-item__title'>我的售房挂牌</Text>
                <View className='badge badge--primary'>
                  <Text>共 {saleListings.length} 套</Text>
                </View>
              </View>
              {saleListings.length === 0 ? (
                <View className='empty-tip'>
                  <Text>暂无售房挂牌，请先提交售房委托</Text>
                </View>
              ) : (
                saleListings.map((l) => {
                  const st = saleMetaOf(l.status)
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
                        <Text className='pick__title'>{l.title || '未命名房源'}</Text>
                        <Text className='pick__meta'>
                          {[saleMetaText(l), l.address].filter(Boolean).join(' · ') || '—'}
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
                <Text className='card-item__title'>① 在线估价</Text>
                <View className='badge badge--warning'>
                  <Text>AVM 估价</Text>
                </View>
              </View>
              {!selectedSale ? (
                <View className='empty-tip'>
                  <Text>请先选择一套售房挂牌</Text>
                </View>
              ) : (
                <View>
                  <View className='field'>
                    <Text className='field__label'>小区 / 房源</Text>
                    <Text className='field__value'>{selectedSale.title || '未命名房源'}</Text>
                  </View>
                  <View className='field'>
                    <Text className='field__label'>户型</Text>
                    <Text className='field__value'>{saleMetaText(selectedSale) || '—'}</Text>
                  </View>
                  <View className='field'>
                    <Text className='field__label'>挂牌价</Text>
                    <Text className='field__value'>
                      {money(selectedSale.asking_price, selectedSale.currency)}
                    </Text>
                  </View>
                  {!latestValuation ? (
                    <View className='empty-tip'>
                      <Text>暂无估价记录</Text>
                    </View>
                  ) : (
                    <View className='est-box'>
                      <Text className='est-box__label'>预估价（参考区间）</Text>
                      <Text className='est-box__value'>
                        {latestValuation.low_estimate != null && latestValuation.high_estimate != null
                          ? `${money(latestValuation.low_estimate, latestValuation.currency)} - ${money(
                              latestValuation.high_estimate,
                              latestValuation.currency
                            )}`
                          : money(latestValuation.market_value, latestValuation.currency)}
                      </Text>
                      <Text className='est-box__note'>
                        市场估值 {money(latestValuation.market_value, latestValuation.currency)}
                        {latestValuation.confidence != null ? ` · 置信度 ${latestValuation.confidence}%` : ''}
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </View>

            {/* ② 挂牌 */}
            <View className='card-item'>
              <View className='card-item__head'>
                <Text className='card-item__title'>② 挂牌</Text>
                <View className={`badge ${saleStep.cls}`}>
                  <Text>{saleStep.label}</Text>
                </View>
              </View>
              {!selectedSale ? (
                <View className='empty-tip'>
                  <Text>请先选择一套售房挂牌</Text>
                </View>
              ) : (
                <View>
                  <View className='field'>
                    <Text className='field__label'>挂牌价</Text>
                    <Text className='field__value'>
                      {money(selectedSale.asking_price, selectedSale.currency)}
                    </Text>
                  </View>
                  <View className='field'>
                    <Text className='field__label'>挂牌地址</Text>
                    <Text className='field__value'>{selectedSale.address || '—'}</Text>
                  </View>
                  <View className='field'>
                    <Text className='field__label'>挂牌时间</Text>
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
                <Text className='card-item__title'>③ 预约带看</Text>
                <View className='badge badge--neutral'>
                  <Text>挂牌后解锁</Text>
                </View>
              </View>
              <View className='empty-tip'>
                <Text>带看预约数据由经纪人端登记，暂未接入小程序</Text>
              </View>
            </View>

            {/* ④ 成交 */}
            <View className='card-item'>
              <View className='card-item__head'>
                <Text className='card-item__title'>④ 成交</Text>
                <View className={`badge ${saleStep.cls}`}>
                  <Text>{saleStep.label}</Text>
                </View>
              </View>
              <Text className='card-item__sub'>
                成交流程：议价 → 定金 → 签约 → 过户 → 房款到账（监管账户）。
              </Text>
              <View className='progress'>
                <View className='progress__bar' style={{ width: `${saleStep.pct}%` }} />
              </View>
              <Text className='card-item__sub'>当前进度：{saleStep.label}</Text>
            </View>
          </>
        )}

        {/* ============ 我的委托 ============ */}
        <View className='section-title section-title--plain'>
          <Text>我的委托</Text>
        </View>
        <View className='card-item card-item--list'>
          {rentConsigns.length === 0 && saleListings.length === 0 && (
            <View className='empty-tip'>
              <Text>暂无委托记录</Text>
            </View>
          )}

          {rentConsigns.map((c) => (
            <View key={`rent-${c.id}`} className='consign'>
              <View className='consign__icon consign__icon--rent'>
                <View className='icon-svg' style={iconStyle('home', 36)} />
              </View>
              <View className='consign__body'>
                <View className='consign__head'>
                  <Text className='consign__title'>出租委托 · {c.title}</Text>
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
            const st = saleMetaOf(l.status)
            return (
              <View key={`sale-${l.id}`} className='consign'>
                <View className='consign__icon consign__icon--sale'>
                  <View className='icon-svg' style={iconStyle('money', 36)} />
                </View>
                <View className='consign__body'>
                  <View className='consign__head'>
                    <Text className='consign__title'>出售委托 · {l.title || '未命名房源'}</Text>
                    <View className={`badge ${st.cls}`}>
                      <Text>{st.label}</Text>
                    </View>
                  </View>
                  <Text className='consign__desc'>
                    {[
                      String(l.created_at || '').replace('T', ' ').slice(0, 10),
                      `挂牌价 ${money(l.asking_price, l.currency)}`
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
          <View className='empty-tip'>
            <Text>加载中...</Text>
          </View>
        )}
      </View>

      <BottomNav role='owner' active='' />
    </View>
  )
}