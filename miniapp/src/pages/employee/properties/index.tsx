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
  property_type?: string
  monthly_rent?: number
  currency?: string
  bedrooms?: number
  size_sqm?: number
  status?: string
  [key: string]: any
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  vacant: { label: '空置', cls: 'p-badge--success' },
  rented: { label: '已出租', cls: 'p-badge--primary' },
  reserved: { label: '已预订', cls: 'p-badge--warning' },
  maintenance: { label: '维护中', cls: 'p-badge--neutral' }
}
const getStatus = (s?: string) =>
  STATUS_META[s ?? ''] ?? { label: s || '未知', cls: 'p-badge--neutral' }

// 状态筛选胶囊（"全部" 为空）
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

export default function EmployeePropertiesPage() {
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [statusKey, setStatusKey] = useState('')

  const fetchListings = async () => {
    setLoading(true)
    setError(false)
    try {
      const res: any = await propertiesApi.list({ page: 1, page_size: 200 })
      setListings(pickList(res))
    } catch (err) {
      console.error('[Properties] 获取房源失败', err)
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

  const visibleList = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    return listings.filter((it) => {
      if (statusKey && it.status !== statusKey) return false
      if (kw) {
        return [it.title, it.room_number, it.address]
          .filter(Boolean)
          .map((v) => String(v).toLowerCase())
          .some((v) => v.includes(kw))
      }
      return true
    })
  }, [listings, keyword, statusKey])

  // 点击卡片 → 操作面板
  const onCardTap = (it: Listing) => {
    Taro.showActionSheet({
      itemList: ['查看详情', '变更状态'],
      success: (r) => {
        if (r.tapIndex === 0) {
          const st = getStatus(it.status)
          Taro.showModal({
            title: it.title || it.room_number || '房源详情',
            content: `${it.bedrooms || 0} 室 · ${it.size_sqm || 0} ㎡\n${
              it.address || '暂无地址'
            }\n月租 ${formatRent(it.monthly_rent, it.currency)} · 状态 ${st.label}`,
            showCancel: false,
            confirmText: '知道了'
          })
        } else {
          Taro.showToast({ title: '请在 Web 端变更房源状态', icon: 'none' })
        }
      }
    })
  }

  return (
    <View className='p-page'>
      <View className='page-container'>
        {/* 搜索框 */}
        <View className='p-search'>
          <Text className='p-search__icon'>搜</Text>
          <Input
            className='p-search__input'
            value={keyword}
            placeholder='搜索小区 / 房号 / 地址'
            onInput={(e: any) => setKeyword(e.detail.value)}
          />
          {keyword ? (
            <Text className='p-search__clear' onClick={() => setKeyword('')}>
              清
            </Text>
          ) : null}
        </View>

        {/* 状态筛选胶囊 */}
        <ScrollView scrollX className='p-caps'>
          {STATUS_CHOICES.map((c) => (
            <View
              key={c.key}
              className={`p-caps__item ${statusKey === c.key ? 'p-caps__item--active' : ''}`}
              onClick={() => setStatusKey(c.key)}
            >
              <Text>{c.label}</Text>
            </View>
          ))}
        </ScrollView>

        {/* 结果 */}
        <ScrollView scrollY className='p-scroll'>
          {loading && listings.length === 0 ? (
            <View className='p-state p-state--loading'>
              <View className='p-state__spinner' />
              <Text className='p-state__title'>正在加载房源</Text>
            </View>
          ) : error ? (
            <View className='p-state'>
              <Text className='p-state__icon'>!</Text>
              <Text className='p-state__title'>加载失败</Text>
              <View className='p-retry' onClick={fetchListings}>
                <Text className='p-retry__text'>点击重试</Text>
              </View>
            </View>
          ) : visibleList.length === 0 ? (
            <View className='p-state'>
              <Text className='p-state__icon'>空</Text>
              <Text className='p-state__title'>没有匹配的房源</Text>
            </View>
          ) : (
            <View className='p-results'>
              {visibleList.map((it) => {
                const st = getStatus(it.status)
                return (
                  <View
                    key={it.id}
                    className='p-card'
                    hoverClass='p-card--hover'
                    onClick={() => onCardTap(it)}
                  >
                    <View className='p-card__top'>
                      <Text className='p-card__title'>
                        {it.title || it.room_number || '未命名房源'}
                      </Text>
                      <View className={`p-badge ${st.cls}`}>
                        <Text>{st.label}</Text>
                      </View>
                    </View>
                    <Text className='p-card__addr'>{it.address || '暂无地址'}</Text>
                    <View className='p-card__bottom'>
                      <Text className='p-card__layout'>
                        {it.bedrooms || 0} 室 · {it.size_sqm || 0} ㎡
                      </Text>
                      <Text className='p-card__rent'>
                        {formatRent(it.monthly_rent, it.currency)}
                        <Text className='p-card__unit'>/月</Text>
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