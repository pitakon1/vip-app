import { useState } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { ownerApi } from '@/services/api'
import type { Property, PropertyStatus } from '@/types'
import './index.scss'

const STATUS_MAP: Record<PropertyStatus, { text: string; color: string; bg: string }> = {
  vacant: { text: '空置', color: '#999999', bg: '#f5f5f5' },
  rented: { text: '已出租', color: '#16a34a', bg: '#f6ffed' },
  reserved: { text: '已预订', color: '#d97706', bg: '#fffbe6' }
}

// 从接口返回中提取房源列表，兼容多种结构
function pickList(res: any): Property[] {
  if (Array.isArray(res)) return res
  if (Array.isArray(res?.data)) return res.data
  if (Array.isArray(res?.items)) return res.items
  if (Array.isArray(res?.list)) return res.list
  if (Array.isArray(res?.data?.items)) return res.data.items
  if (Array.isArray(res?.data?.list)) return res.data.list
  return []
}

export default function OwnerHomePage() {
  const user = useAuthStore((state) => state.user)
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)
  const [properties, setProperties] = useState<Property[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [loading, setLoading] = useState(false)

  const fetchProperties = async () => {
    setLoading(true)
    try {
      const res = await ownerApi.properties()
      setProperties(pickList(res))
    } catch (error) {
      console.error('[OwnerHome] 获取房源失败', error)
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
    fetchProperties()
  })

  const onRefresh = async () => {
    setRefreshing(true)
    try {
      const res = await ownerApi.properties()
      setProperties(pickList(res))
      Taro.showToast({ title: '刷新成功', icon: 'success' })
    } catch (error) {
      console.error('[OwnerHome] 刷新失败', error)
      Taro.showToast({ title: '刷新失败', icon: 'none' })
    } finally {
      setRefreshing(false)
    }
  }

  const stats = {
    total: properties.length,
    rented: properties.filter((p) => p.status === 'rented').length,
    vacant: properties.filter((p) => p.status === 'vacant').length,
    reserved: properties.filter((p) => p.status === 'reserved').length
  }

  return (
    <View className='owner-home-page'>
      <View className='page-container'>
        <View className='welcome-section'>
          <Text className='welcome-text'>欢迎回来，{user?.name || '业主'}</Text>
          <Text className='welcome-sub'>您名下共有 {stats.total} 套房产</Text>
        </View>

        <View className='stats-grid'>
          <View className='stat-card stat-card--success'>
            <View className='stat-dot' />
            <Text className='stat-num'>{stats.rented}</Text>
            <Text className='stat-label'>已出租</Text>
          </View>
          <View className='stat-card stat-card--warning'>
            <View className='stat-dot' />
            <Text className='stat-num'>{stats.vacant}</Text>
            <Text className='stat-label'>空置中</Text>
          </View>
          <View className='stat-card stat-card--neutral'>
            <View className='stat-dot' />
            <Text className='stat-num'>{stats.reserved}</Text>
            <Text className='stat-label'>已预订</Text>
          </View>
        </View>

        <View
          className='marketing-entry'
          hoverClass='marketing-entry--hover'
          onClick={() => Taro.navigateTo({ url: '/pages/owner/marketing/index' })}
        >
          <View className='marketing-entry__body'>
            <Text className='marketing-entry__title'>房源营销</Text>
            <Text className='marketing-entry__sub'>空置推广 · 定价建议 · 年度财务导出</Text>
          </View>
          <Text className='marketing-entry__arrow'>›</Text>
        </View>

        <View className='section-title'>
          <Text>房屋状态列表</Text>
          <Text className='section-hint'>下拉刷新</Text>
        </View>

        <ScrollView
          scrollY
          className='property-list'
          refresherEnabled
          refresherTriggered={refreshing}
          onRefresherRefresh={onRefresh}
        >
          {loading && properties.length === 0 && (
            <View className='state state--loading'>
              <View className='state__spinner' />
              <Text className='state__title'>正在加载</Text>
            </View>
          )}
          {!loading && properties.length === 0 && (
            <View className='state'>
              <View className='state__icon'>
                <Text className='state__glyph'>房</Text>
              </View>
              <Text className='state__title'>暂无房源数据</Text>
              <Text className='state__desc'>下拉页面即可刷新</Text>
            </View>
          )}
          {properties.map((item) => {
            const statusInfo = STATUS_MAP[item.status] || STATUS_MAP.vacant
            return (
              <View key={item.id} className='property-card'>
                <View className='property-header'>
                  <Text className='property-code'>{item.code}</Text>
                  <Text
                    className='property-status'
                    style={{ color: statusInfo.color, backgroundColor: statusInfo.bg }}
                  >
                    {statusInfo.text}
                  </Text>
                </View>
                <View className='property-info'>
                  {item.projectName && (
                    <Text className='info-item'>小区：{item.projectName}</Text>
                  )}
                  {item.layout && <Text className='info-item'>户型：{item.layout}</Text>}
                  <Text className='info-item'>面积：{item.area}㎡</Text>
                  {item.floor && <Text className='info-item'>楼层：{item.floor}</Text>}
                  {item.rentPrice != null && (
                    <Text className='info-item rent-price'>月租：¥{item.rentPrice}/月</Text>
                  )}
                </View>
              </View>
            )
          })}
        </ScrollView>
      </View>
    </View>
  )
}
