import { useState } from 'react'
import { View, Text, Input, Map } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { geoApi } from '@/services/api'
import './index.scss'

interface GeoResult {
  latitude?: number
  lat?: number
  longitude?: number
  lng?: number
  address?: string
  display_name?: string
}

function flattenCoords(res: any): { lat: number; lng: number; address: string } | null {
  const pick = res?.data ?? res?.result ?? res ?? null
  if (!pick) return null
  const data = Array.isArray(pick) ? pick[0] : pick
  const lat = Number(data?.latitude ?? data?.lat ?? data?.coords?.latitude)
  const lng = Number(data?.longitude ?? data?.lng ?? data?.coords?.longitude)
  if (isNaN(lat) || isNaN(lng)) return null
  return {
    lat,
    lng,
    address: data?.display_name || data?.address || data?.formatted_address || data?.name || ''
  }
}

export default function MapSearchPage() {
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)
  const [keyword, setKeyword] = useState('')
  const [searching, setSearching] = useState(false)
  const [locate, setLocate] = useState<{ lat: number; lng: number; address: string } | null>(null)
  const [distanceInfo, setDistanceInfo] = useState('')

  useDidShow(() => {
    loadFromStorage()
    if (!useAuthStore.getState().token) {
      Taro.redirectTo({ url: '/pages/login/index' })
      return
    }
  })

  const handleSearch = async () => {
    const addr = keyword.trim()
    if (!addr) return
    setSearching(true)
    setDistanceInfo('')
    try {
      const res = await geoApi.geocode(addr)
      const coords = flattenCoords(res)
      if (coords) {
        setLocate(coords)
        Taro.showToast({ title: '定位成功', icon: 'success' })
      } else {
        setLocate(null)
        Taro.showToast({ title: '未解析到坐标', icon: 'none' })
      }
    } catch (error) {
      console.error('[MapSearch] 定位失败', error)
      setLocate(null)
      Taro.showToast({ title: '定位失败', icon: 'none' })
    } finally {
      setSearching(false)
    }
  }

  const handleDistanceToOrigin = async () => {
    if (!locate) {
      Taro.showToast({ title: '请先搜索定位', icon: 'none' })
      return
    }
    try {
      const from = { lat: locate.lat, lng: locate.lng }
      const res: any = await geoApi.distance(from, { lat: 31.2304, lng: 121.4737 })
      const d = res?.data ?? res
      const km = d?.kilometers ?? d?.km ?? d?.distance
      setDistanceInfo(km != null ? `到（默认参考点）约 ${km} km` : `距离结果：${JSON.stringify(d)}`)
    } catch (error) {
      setDistanceInfo('距离计算失败')
      console.error('[MapSearch] 距离失败', error)
    }
  }

  const markers = locate
    ? [
        {
          id: 0,
          latitude: locate.lat,
          longitude: locate.lng,
          width: 32,
          height: 32
        }
      ]
    : undefined

  return (
    <View className='map-search-page'>
      <View className='page-container'>
        <View className='search-bar'>
          <Input
            className='search-input'
            value={keyword}
            onInput={(e) => setKeyword(e.detail.value)}
            confirmType='search'
            placeholder='输入地址检索定位'
            onConfirm={handleSearch}
          />
          <View className={`search-btn ${searching ? 'disabled' : ''}`} onClick={handleSearch}>
            <Text className='search-text'>{searching ? '检索中' : '检索'}</Text>
          </View>
        </View>

        {locate ? (
          <View className='map-wrap'>
            <Map
              className='map'
              longitude={locate.lng}
              latitude={locate.lat}
              scale={14}
              markers={markers as any}
              onError={() => {}}
            />
            <Text className='map-address'>{locate.address || '定位地址'}</Text>
            <View className='distance-btn' onClick={handleDistanceToOrigin}>
              <Text className='distance-text'>查询距参考点距离</Text>
            </View>
            {distanceInfo && <Text className='distance-info'>{distanceInfo}</Text>}
          </View>
        ) : (
          <View className='empty-tip'>
            <Text>输入地址检索，地图将展示定位结果</Text>
          </View>
        )}

        {locate && (
          <View className='result-card'>
            <Text className='result-label'>定位坐标</Text>
            <Text className='result-value'>
              纬度 {locate.lat.toFixed(6)}，经度 {locate.lng.toFixed(6)}
            </Text>
          </View>
        )}
      </View>
    </View>
  )
}