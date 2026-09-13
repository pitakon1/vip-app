import { useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { attendanceApi, geoApi } from '@/services/api'
import './index.scss'

export default function AttendancePage() {
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null)
  const [loading, setLoading] = useState(false)

  const getAndCheck = async () => {
    if (loading) return
    setLoading(true)
    try {
      const loc = await Taro.getLocation({
        type: 'gcj02'
      })
      const { latitude, longitude } = loc
      // 带坐标 getLocation 结果
      const lat = Number((loc as any).latitude ?? latitude ?? 0)
      const lng = Number((loc as any).longitude ?? longitude ?? 0)
      if (!lat || !lng) {
        Taro.showToast({ title: '未获取到定位', icon: 'none' })
        return
      }
      setLocation({ latitude: lat, longitude: lng })
      await check(lat, lng)
    } catch (error) {
      console.error('[Attendance] 定位失败', error)
      Taro.showToast({ title: '定位失败，请检查定位权限', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  const check = async (lat: number, lng: number) => {
    try {
      const res: any = await geoApi.attendance(lat, lng)
      const data = res?.data ?? res
      const withinRadius = !!(data?.within_radius ?? true)
      if (withinRadius) {
        await attendanceApi.checkIn({ latitude: lat, longitude: lng })
        Taro.showToast({ title: '打卡成功', icon: 'success' })
      } else {
        Taro.showModal({
          title: '不在打卡半径',
          content: '当前位置不在打卡半径内，是否提交外勤申请？',
          success: async (r) => {
            if (r.confirm) {
              await attendanceApi.createExternalTrip({ latitude: lat, longitude: lng })
              Taro.showToast({ title: '外勤申请已提交', icon: 'success' })
            }
          }
        })
      }
    } catch (error) {
      console.error('[Attendance] 校验失败', error)
      Taro.showToast({ title: '打卡校验失败', icon: 'none' })
    }
  }

  useDidShow(() => {
    loadFromStorage()
    if (!useAuthStore.getState().token) {
      Taro.redirectTo({ url: '/pages/login/index' })
      return
    }
  })

  return (
    <View className='attendance-page'>
      <View className='page-container'>
        <View className='clock-panel'>
          <View className='clock-icon'>
            <Text className='clock-text'>📍</Text>
          </View>
          <Text className='clock-title'>GPS 定位打卡</Text>
          <Text className='clock-desc'>获取当前定位，系统将校验是否在打卡半径内</Text>
          <View className={`check-btn ${loading ? 'disabled' : ''}`} onClick={getAndCheck}>
            <Text className='check-text'>{loading ? '定位校验中...' : '立即打卡'}</Text>
          </View>
          {location && (
            <Text className='location-info'>
              当前定位：{location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
            </Text>
          )}
        </View>

        <View className='rules-card'>
          <Text className='rules-title'>打卡规则</Text>
          <Text className='rules-item'>• 在打卡半径内，直接完成打卡。</Text>
          <Text className='rules-item'>• 不在半径内，将引导提交外勤申请。</Text>
          <Text className='rules-item'>• 请确保已授予位置权限。</Text>
        </View>
      </View>
    </View>
  )
}