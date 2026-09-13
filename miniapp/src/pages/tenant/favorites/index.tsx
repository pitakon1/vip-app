import { useState } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { favoritesApi } from '@/services/api'
import './index.scss'

interface Favorite {
  id: string
  property_id?: string
  title?: string
  address?: string
  monthly_rent?: number
  currency?: string
  photo?: string
  notes?: string
  created_at?: string
}

function pickList(res: any): Favorite[] {
  if (Array.isArray(res)) return res
  if (Array.isArray(res?.data)) return res.data
  if (Array.isArray(res?.items)) return res.items
  if (Array.isArray(res?.data?.items)) return res.data.items
  if (Array.isArray(res?.data?.list)) return res.data.list
  return []
}

const formatMoney = (v?: number, currency?: string) => {
  const cur = currency === 'USD' ? '$' : currency === 'CNY' ? '¥' : '฿'
  return `${cur}${Number(v || 0).toLocaleString()}`
}

export default function TenantFavoritesPage() {
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)
  const [favorites, setFavorites] = useState<Favorite[]>([])
  const [loading, setLoading] = useState(false)
  const [removing, setRemoving] = useState(false)

  const fetchFavorites = async () => {
    setLoading(true)
    try {
      const res = await favoritesApi.list({ page: 1, limit: 100 })
      setFavorites(pickList(res))
    } catch (error) {
      console.error('[Favorites] 加载收藏失败', error)
      Taro.showToast({ title: '加载收藏失败', icon: 'none' })
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
    fetchFavorites()
  })

  const handleRemove = async (item: Favorite) => {
    const pid = item.property_id || item.id
    if (!pid) return
    setRemoving(true)
    try {
      await favoritesApi.remove(pid)
      setFavorites((list) => list.filter((f) => f.id !== item.id))
      Taro.showToast({ title: '已取消收藏', icon: 'success' })
    } catch (error) {
      console.error('[Favorites] 取消收藏失败', error)
      Taro.showToast({ title: '操作失败', icon: 'none' })
    } finally {
      setRemoving(false)
    }
  }

  const goViewing = (item: Favorite) => {
    const pid = item.property_id || item.id
    Taro.navigateTo({
      url: `/pages/tenant/viewings/index${pid ? `?property_id=${pid}` : ''}`
    })
  }

  return (
    <View className='tenant-favorites-page'>
      <View className='page-container'>
        <View className='list-title'>
          <Text>我的收藏</Text>
          <Text className='list-sub'>共 {favorites.length} 套</Text>
        </View>

        <ScrollView scrollY className='fav-list'>
          {loading && favorites.length === 0 && (
            <View className='empty-tip'>
              <Text>加载中...</Text>
            </View>
          )}
          {!loading && favorites.length === 0 && (
            <View className='empty-tip'>
              <Text>暂无收藏房源</Text>
            </View>
          )}

          {favorites.map((item) => (
            <View key={item.id} className='fav-card'>
              <View className='fav-card-header'>
                <Text className='fav-card-title'>{item.title || '未命名房源'}</Text>
                {!!item.photo && (
                  <Text className='fav-card-rent'>{formatMoney(item.monthly_rent, item.currency)}/月</Text>
                )}
              </View>
              <Text className='fav-card-address'>{item.address || '暂无地址'}</Text>
              {!!item.notes && <Text className='fav-card-notes'>{item.notes}</Text>}
              <View className='fav-card-footer'>
                <Text className='fav-card-date'>
                  {item.created_at ? `收藏于 ${item.created_at.replace('T', ' ').slice(0, 10)}` : ''}
                </Text>
                <View className='fav-card-actions'>
                  <View className='fav-btn fav-btn--primary' onClick={() => goViewing(item)}>
                    <Text className='fav-btn-text'>去看房</Text>
                  </View>
                  <View className='fav-btn fav-btn--danger' onClick={() => handleRemove(item)}>
                    <Text className='fav-btn-text'>{removing ? '处理中' : '取消收藏'}</Text>
                  </View>
                </View>
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
    </View>
  )
}