import { useState } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { ownerApi } from '@/services/api'
import type { Property, PropertyStatus } from '@/types'
import './index.scss'

const STATUS_MAP: Record<PropertyStatus, { text: string; color: string; bg: string }> = {
  vacant: { text: '空置', color: '#999999', bg: '#f5f5f5' },
  rented: { text: '已出租', color: '#52c41a', bg: '#f6ffed' },
  reserved: { text: '已预订', color: '#faad14', bg: '#fffbe6' }
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
          <View className='stat-card'>
            <Text className='stat-num'>{stats.rented}</Text>
            <Text className='stat-label'>已出租</Text>
          </View>
          <View className='stat-card'>
            <Text className='stat-num'>{stats.vacant}</Text>
            <Text className='stat-label'>空置中</Text>
          </View>
          <View className='stat-card'>
            <Text className='stat-num'>{stats.reserved}</Text>
            <Text className='stat-label'>已预订</Text>
          </View>
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
            <View className='empty-tip'>
              <Text>加载中...</Text>
            </View>
          )}
          {!loading && properties.length === 0 && (
            <View className='empty-tip'>
              <Text>暂无房源数据</Text>
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
