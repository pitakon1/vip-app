import { useMemo, useState } from 'react'
import { View, Text, Input, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { propertiesApi } from '@/services/api'
import './index.scss'

interface Listing {
  id: string
  title?: string
  room_number?: string
  address?: string
  district?: string
  area?: string
  property_type?: string
  monthly_rent?: number
  currency?: string
  bedrooms?: number
  size_sqm?: number
  status?: string
  [key: string]: any
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  vacant: { label: '空置', cls: 's-badge--success' },
  rented: { label: '已出租', cls: 's-badge--primary' },
  reserved: { label: '已预订', cls: 's-badge--warning' },
  maintenance: { label: '维护中', cls: 's-badge--neutral' }
}
const getStatus = (s?: string) =>
  STATUS_META[s ?? ''] ?? { label: s || '未知', cls: 's-badge--neutral' }

// 价格区间（单位：泰铢/月）
const PRICE_RANGES = [
  { key: '', label: '不限', min: 0, max: Infinity },
  { key: 'u3', label: '3万以下', min: 0, max: 30000 },
  { key: '3-5', label: '3-5万', min: 30000, max: 50000 },
  { key: '5-8', label: '5-8万', min: 50000, max: 80000 },
  { key: 'g8', label: '8万以上', min: 80000, max: Infinity }
]

const STATUS_CHOICES = [
  { key: '', label: '全部' },
  { key: 'vacant', label: '空置' },
  { key: 'rented', label: '已出租' },
  { key: 'reserved', label: '已预订' }
]

function pickList(res: any): Listing[] {
  if (Array.isArray(res)) return res
  if (Array.isArray(res?.data)) return res.data
  if (Array.isArray(res?.data?.items)) return res.data.items
  if (Array.isArray(res?.data?.list)) return res.data.list
  if (Array.isArray(res?.items)) return res.items
  if (Array.isArray(res?.list)) return res.list
  return []
}

const formatRent = (v?: number, currency?: string) => {
  const cur = currency === 'USD' ? '$' : currency === 'CNY' ? '¥' : '฿'
  return `${cur}${Number(v || 0).toLocaleString()}`
}

// 当前展开的筛选 tab
type OpenTab = null | 'price' | 'status'

export default function EmployeeSearchPage() {
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [areaKw, setAreaKw] = useState('')
  const [priceKey, setPriceKey] = useState('')
  const [statusKey, setStatusKey] = useState('')
  const [openTab, setOpenTab] = useState<OpenTab>(null)

  const fetchListings = async () => {
    setLoading(true)
    setError(false)
    try {
      const res: any = await propertiesApi.list({ page: 1, page_size: 200 })
      setListings(pickList(res))
    } catch (err) {
      console.error('[Search] 获取房源失败', err)
      setError(true)
      Taro.showToast({ title: '加载房源失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  useDidShow(() => {
    loadFromStorage()
    if (!useAuthStore.getState().token) {
      Taro.redirectTo({ url: '/pages/login/index' })
      return
    }
    fetchListings()
  })

  const toggleTab = (key: OpenTab) => setOpenTab((t) => (t === key ? null : key))

  const visibleList = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    const area = areaKw.trim().toLowerCase()
    const price = PRICE_RANGES.find((p) => p.key === priceKey) || PRICE_RANGES[0]
    return listings.filter((it) => {
      if (kw) {
        const hit = [it.title, it.room_number, it.address]
          .filter(Boolean)
          .map((v) => String(v).toLowerCase())
          .some((v) => v.includes(kw))
        if (!hit) return false
      }
      if (area) {
        const hit = [it.address, it.district, it.area, it.title]
          .filter(Boolean)
          .map((v) => String(v).toLowerCase())
          .some((v) => v.includes(area))
        if (!hit) return false
      }
      if (price.min > 0 && Number(it.monthly_rent || 0) < price.min) return false
      if (price.max < Infinity && Number(it.monthly_rent || 0) > price.max) return false
      if (statusKey && it.status !== statusKey) return false
      return true
    })
  }, [listings, keyword, areaKw, priceKey, statusKey])

  const onCardTap = (item: Listing) => {
    const st = getStatus(item.status)
    Taro.showModal({
      title: item.title || item.room_number || '房源详情',
      content: `${item.bedrooms || 0} 室 · ${item.size_sqm || 0} ㎡\n${
        item.address || '暂无地址'
      }\n月租 ${formatRent(item.monthly_rent)} · 状态 ${st.label}`,
      confirmText: '咨询客服',
      cancelText: '取消',
      success: (r) => {
        if (r.confirm) Taro.navigateTo({ url: '/pages/chat/list/index' })
      }
    })
  }

  return (
    <View className='s-page'>
      <View className='page-container'>
        {/* 搜索框 */}
        <View className='s-search'>
          <Text className='s-search__icon'>搜</Text>
          <Input
            className='s-search__input'
            value={keyword}
            placeholder='搜索小区 / 房号 / 地址'
            confirmType='search'
            onInput={(e: any) => setKeyword(e.detail.value)}
          />
          {keyword ? (
            <Text className='s-search__clear' onClick={() => setKeyword('')}>
              清
            </Text>
          ) : null}
        </View>

        {/* 筛选 Tab：区域 / 价格 / 状态 */}
        <View className='s-filter'>
          <View className='s-filter__bar'>
            <View className='s-filter__tab'>
              <Input
                className='s-filter__kw'
                value={areaKw}
                placeholder='区域'
                onInput={(e: any) => setAreaKw(e.detail.value)}
              />
            </View>
            <View
              className={`s-filter__tab ${openTab === 'price' ? 's-filter__tab--open' : ''} ${priceKey ? 's-filter__tab--active' : ''}`}
              onClick={() => toggleTab('price')}
            >
              <Text>{priceKey ? PRICE_RANGES.find((p) => p.key === priceKey)?.label : '价格'}</Text>
              <Text className='s-filter__arrow'>{openTab === 'price' ? '▲' : '▼'}</Text>
            </View>
            <View
              className={`s-filter__tab ${openTab === 'status' ? 's-filter__tab--open' : ''} ${statusKey ? 's-filter__tab--active' : ''}`}
              onClick={() => toggleTab('status')}
            >
              <Text>{statusKey ? STATUS_CHOICES.find((s) => s.key === statusKey)?.label : '状态'}</Text>
              <Text className='s-filter__arrow'>{openTab === 'status' ? '▲' : '▼'}</Text>
            </View>
          </View>

          {openTab === 'price' && (
            <View className='s-filter__panel'>
              {PRICE_RANGES.map((p) => (
                <View
                  key={p.key}
                  className={`s-chip ${priceKey === p.key ? 's-chip--active' : ''}`}
                  onClick={() => {
                    setPriceKey(p.key)
                    setOpenTab(null)
                  }}
                >
                  <Text>{p.label}</Text>
                </View>
              ))}
            </View>
          )}
          {openTab === 'status' && (
            <View className='s-filter__panel'>
              {STATUS_CHOICES.map((s) => (
                <View
                  key={s.key}
                  className={`s-chip ${statusKey === s.key ? 's-chip--active' : ''}`}
                  onClick={() => {
                    setStatusKey(s.key)
                    setOpenTab(null)
                  }}
                >
                  <Text>{s.label}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* 结果 */}
        <ScrollView scrollY className='s-scroll'>
          {loading && listings.length === 0 ? (
            <View className='s-state s-state--loading'>
              <View className='s-state__spinner' />
              <Text className='s-state__title'>正在加载房源</Text>
            </View>
          ) : error ? (
            <View className='s-state'>
              <Text className='s-state__icon'>!</Text>
              <Text className='s-state__title'>加载失败</Text>
              <View className='s-retry' onClick={fetchListings}>
                <Text className='s-retry__text'>点击重试</Text>
              </View>
            </View>
          ) : visibleList.length === 0 ? (
            <View className='s-state'>
              <Text className='s-state__icon'>空</Text>
              <Text className='s-state__title'>没有匹配的房源</Text>
              <Text className='s-state__desc'>调整筛选条件试试</Text>
            </View>
          ) : (
            <View className='s-results'>
              <Text className='s-summary'>共 {visibleList.length} 套</Text>
              {visibleList.map((it) => {
                const st = getStatus(it.status)
                return (
                  <View
                    key={it.id}
                    className='s-card'
                    hoverClass='s-card--hover'
                    onClick={() => onCardTap(it)}
                  >
                    <View className='s-card__top'>
                      <Text className='s-card__title'>
                        {it.title || it.room_number || '未命名房源'}
                      </Text>
                      <View className={`s-badge ${st.cls}`}>
                        <Text>{st.label}</Text>
                      </View>
                    </View>
                    <Text className='s-card__addr'>{it.address || '暂无地址'}</Text>
                    <View className='s-card__bottom'>
                      <Text className='s-card__layout'>
                        {it.bedrooms || 0} 室 · {it.size_sqm || 0} ㎡
                      </Text>
                      <Text className='s-card__rent'>
                        {formatRent(it.monthly_rent, it.currency)}
                        <Text className='s-card__unit'>/月</Text>
                      </Text>
                    </View>
                  </View>
                )
              })}
            </View>
          )}
        </ScrollView>
      </View>
    </View>
  )
}