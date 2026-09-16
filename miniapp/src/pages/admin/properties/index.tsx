import { useState } from 'react'
import { View, Text, Input, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { propertiesApi, dashboardApi } from '@/services/api'
import { request } from '@/lib/api'
import { iconStyle } from '@/utils/icons'
import BottomNav from '@/components/BottomNav'
import './index.scss'

interface PropertyItem {
  id: string
  room_number?: string
  building?: string
  address?: string
  property_type?: string
  monthly_rent?: number
  currency?: string
  bedrooms?: number
  bathrooms?: number
  size_sqm?: number
  status?: string
  photos?: string[]
  [key: string]: any
}

const TYPE_LABELS: Record<string, string> = {
  apartment: '公寓',
  condo: '公寓',
  house: '别墅',
  villa: '别墅',
  commercial: '商铺',
  shop: '商铺',
  office: '写字楼'
}

const STATUS_LABELS: Record<string, string> = {
  vacant: '空置中',
  rented: '已出租',
  renewing: '续约中',
  maintenance: '维护中'
}

const CURRENCY_SYMBOL: Record<string, string> = {
  CNY: '¥',
  THB: '฿',
  EUR: '€',
  USD: '$'
}

const FILTERS: { key: string; label: string }[] = [
  { key: '', label: '全部' },
  { key: 'vacant', label: '空置中' },
  { key: 'rented', label: '已出租' },
  { key: 'maintenance', label: '维护中' }
]

const PAGE_SIZE = 100

// 统一解析列表响应（Page[Property] / 直接数组 两种形态）
function pickList(res: any): PropertyItem[] {
  const d = res?.data ?? res
  if (Array.isArray(d)) return d
  if (Array.isArray(d?.items)) return d.items
  return []
}

const fmtRent = (v?: number, currency?: string) =>
  `${CURRENCY_SYMBOL[currency || 'THB'] || ''}${Number(v || 0).toLocaleString()}`

export default function AdminPropertiesPage() {
  const [list, setList] = useState<PropertyItem[]>([])
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState<any>(null)
  const [keyword, setKeyword] = useState('')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')

  const fetchSummary = async () => {
    try {
      const res: any = await dashboardApi.summary()
      setSummary(res?.data ?? res)
    } catch (error) {
      console.error('[AdminProperties] 获取房源统计失败', error)
    }
  }

  const fetchList = async (nextStatus = status, q = query) => {
    setLoading(true)
    try {
      const res: any = await propertiesApi.list({
        page: 1,
        page_size: PAGE_SIZE,
        sort: 'latest',
        ...(q ? { q } : {}),
        ...(nextStatus ? { status: nextStatus } : {})
      })
      setList(pickList(res))
    } catch (error) {
      console.error('[AdminProperties] 获取房源失败', error)
      Taro.showToast({ title: '加载房源失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  useDidShow(() => {
    fetchSummary()
    fetchList()
  })

  const handleSearch = () => {
    const q = keyword.trim()
    setQuery(q)
    fetchList(status, q)
  }

  const changeStatus = (key: string) => {
    setStatus(key)
    fetchList(key, query)
  }

  const openDetail = (item: PropertyItem) => {
    Taro.navigateTo({ url: `/pages/admin/property-detail/index?id=${item.id}` })
  }

  // 软删除房源：后端 DELETE /properties/{id}（require_agent）
  const removeProperty = (item: PropertyItem) => {
    Taro.showModal({
      title: '删除房源',
      content: `确认删除「${item.room_number || item.address || '该房源'}」？删除后列表不再展示。`,
      success: async (r) => {
        if (!r.confirm) return
        try {
          await request({ url: `/properties/${item.id}`, method: 'DELETE' })
          Taro.showToast({ title: '已删除', icon: 'none' })
          fetchList()
          fetchSummary()
        } catch (error) {
          console.error('[AdminProperties] 删除房源失败', error)
          Taro.showToast({ title: '删除失败', icon: 'none' })
        }
      }
    })
  }

  const stats = [
    { key: 'total', label: '总房源', value: summary?.total_properties, tone: 'primary' },
    { key: 'vacant', label: '空置', value: summary?.vacant, tone: 'warning' },
    { key: 'rented', label: '已出租', value: summary?.rented, tone: 'success' },
    { key: 'maintenance', label: '维护中', value: summary?.maintenance, tone: 'info' }
  ]

  return (
    <View className='ap-page'>
      {/* 搜索栏 */}
      <View className='ap-search'>
        <Input
          className='ap-search__input'
          value={keyword}
          placeholder='搜索房源名称/地址'
          confirmType='search'
          onInput={(e: any) => setKeyword(e.detail.value)}
          onConfirm={handleSearch}
        />
        <View className='ap-search__btn' onClick={handleSearch}>
          <Text className='ap-search__btn-text'>搜索</Text>
        </View>
      </View>

      {/* 状态筛选 */}
      <ScrollView scrollX className='ap-chips'>
        {FILTERS.map((f) => (
          <View
            key={f.key || 'all'}
            className={`ap-chip ${status === f.key ? 'ap-chip--active' : ''}`}
            onClick={() => changeStatus(f.key)}
          >
            <Text className='ap-chip__text'>{f.label}</Text>
          </View>
        ))}
      </ScrollView>

      {/* 统计（来源：/dashboard/summary） */}
      <View className='ap-stats'>
        {stats.map((s) => (
          <View key={s.key} className={`ap-stat ap-stat--${s.tone}`}>
            <Text className='ap-stat__value'>{s.value ?? '-'}</Text>
            <Text className='ap-stat__label'>{s.label}</Text>
          </View>
        ))}
      </View>

      <View className='ap-section-head'>
        <Text className='ap-section-head__title'>房源列表</Text>
        <Text className='ap-section-head__count'>共 {list.length} 套</Text>
      </View>

      <ScrollView scrollY className='ap-list'>
        {loading && list.length === 0 && (
          <View className='ap-state'>
            <Text className='ap-state__text'>加载中...</Text>
          </View>
        )}
        {!loading && list.length === 0 && (
          <View className='ap-state'>
            <View className='icon-svg' style={iconStyle('home', 72)} />
            <Text className='ap-state__text'>暂无房源</Text>
            <Text className='ap-state__desc'>
              {query || status ? '换个筛选条件试试' : '还没有录入任何房源'}
            </Text>
          </View>
        )}

        {list.map((item) => (
          <View key={item.id} className='ap-card' onClick={() => openDetail(item)}>
            {/* 头图占位（后端 photos 为空时展示类型徽章底色块） */}
            <View className='ap-card__banner'>
              {Array.isArray(item.photos) && item.photos.length > 0 ? null : (
                <Text className='ap-card__banner-ph'>房源</Text>
              )}
              <Text className='ap-card__type'>
                {TYPE_LABELS[item.property_type || ''] || '房源'}
              </Text>
              <Text className={`ap-card__status ap-card__status--${item.status || 'vacant'}`}>
                {STATUS_LABELS[item.status || ''] || '未知'}
              </Text>
            </View>

            <View className='ap-card__body'>
              <Text className='ap-card__name'>
                {item.room_number || item.address || '未命名房源'}
              </Text>
              <View className='ap-card__addr'>
                <Text className='icon-svg icon-svg--sm' style={iconStyle('home', 26)} />
                <Text className='ap-card__addr-text'>{item.address || '暂无地址'}</Text>
              </View>
              <View className='ap-card__meta'>
                <Text className='ap-card__meta-item'>{item.size_sqm || 0}㎡</Text>
                <Text className='ap-card__meta-item'>{item.bedrooms || 0}卧</Text>
                <Text className='ap-card__meta-item'>{item.bathrooms || 0}浴</Text>
              </View>
              <View className='ap-card__price-row'>
                <Text className='ap-card__price'>
                  {fmtRent(item.monthly_rent, item.currency)}
                  <Text className='ap-card__price-unit'>/月</Text>
                </Text>
              </View>
            </View>

            <View className='ap-card__footer'>
              <View
                className='ap-card__manage'
                onClick={(e) => {
                  e.stopPropagation()
                  openDetail(item)
                }}
              >
                <Text className='ap-card__manage-text'>管理</Text>
              </View>
              <View
                className='ap-card__del'
                onClick={(e) => {
                  e.stopPropagation()
                  removeProperty(item)
                }}
              >
                <Text className='icon-svg icon-svg--sm' style={iconStyle('close', 28)} />
              </View>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* 底部导航：房源 */}
      <BottomNav role='admin' active='properties' />
    </View>
  )
}