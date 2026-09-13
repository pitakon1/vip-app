import { useState } from 'react'
import { View, Text, ScrollView, Input } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { notificationsApi, translateApi, leasesApi } from '@/services/api'
import type { Notification, NotificationType } from '@/types'
import './index.scss'

const TYPE_MAP: Record<NotificationType, { text: string; color: string; bg: string }> = {
  payment: { text: '租金提醒', color: '#dc2626', bg: '#fff1f0' },
  lease: { text: '合同到期', color: '#d97706', bg: '#fffbe6' },
  maintenance: { text: '维修通知', color: '#14b8a6', bg: '#f0f5ff' },
  system: { text: '系统通知', color: '#999999', bg: '#f5f5f5' }
}

// 金刚区：按「是否在租」分流。访客态仅保留找房入口；在租态展示履约服务。
const VISITOR_GRID: Array<{ key: string; label: string; url: string }> = [
  { key: 'listings', label: '精选房源', url: '/pages/tenant/listings/index' },
  { key: 'favorites', label: '我的收藏', url: '/pages/tenant/favorites/index' },
  { key: 'viewing', label: '预约看房', url: '/pages/tenant/viewings/index' },
  { key: 'map', label: '地图找房', url: '/pages/map/search/index' }
]

const TENANT_GRID: Array<{ key: string; label: string; url: string }> = [
  { key: 'maintenance', label: '维修', url: '/pages/tenant/maintenance/index' },
  { key: 'payments', label: '缴费', url: '/pages/tenant/payments/index' },
  { key: 'contracts', label: '我的合同', url: '/pages/contracts/index' },
  { key: 'services', label: '增值服务', url: '/pages/tenant/services/index' }
]

function pickList(res: any): Notification[] {
  if (Array.isArray(res)) return res
  if (Array.isArray(res?.data)) return res.data
  if (Array.isArray(res?.items)) return res.items
  if (Array.isArray(res?.list)) return res.list
  if (Array.isArray(res?.data?.items)) return res.data.items
  if (Array.isArray(res?.data?.list)) return res.data.list
  return []
}

export default function TenantHomePage() {
  const user = useAuthStore((state) => state.user)
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(false)
  const [isRenting, setIsRenting] = useState(false)
  const [translateText, setTranslateText] = useState('')
  const [translated, setTranslated] = useState('')
  const [translating, setTranslating] = useState(false)

  const handleTranslate = async () => {
    const text = translateText.trim()
    if (!text || translating) return
    setTranslating(true)
    try {
      const res: any = await translateApi.translate(text, 'en')
      const out = res?.translated_text ?? res?.translation ?? res?.text ?? res?.data?.translated_text
      setTranslated(String(out || res))
    } catch (error) {
      console.error('[TenantHome] 翻译失败', error)
      setTranslated('翻译失败，请稍后重试')
    } finally {
      setTranslating(false)
    }
  }

  // 判断是否在租：有「生效中」租约则展示租客服务金刚区，否则按访客找房态展示
  const loadRentingState = async () => {
    try {
      const res: any = await leasesApi.mine()
      const leases = pickList(res)
      setIsRenting(Array.isArray(leases) && leases.some((l: any) => l?.status === 'active'))
    } catch (error) {
      // 接口不可用时保守按访客态展示，避免对非在租用户暴露租客专属入口
      console.error('[TenantHome] 获取租约状态失败', error)
      setIsRenting(false)
    }
  }

  const fetchNotifications = async () => {
    setLoading(true)
    try {
      const res = await notificationsApi.mine()
      setNotifications(pickList(res))
    } catch (error) {
      console.error('[TenantHome] 获取通知失败', error)
      Taro.showToast({ title: '加载通知失败', icon: 'none' })
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
    fetchNotifications()
    loadRentingState()
  })

  const handleReadAll = async () => {
    try {
      await notificationsApi.readAll()
      setNotifications((list) => list.map((n) => ({ ...n, read: true })))
      Taro.showToast({ title: '已全部标记为已读', icon: 'success' })
    } catch (error) {
      console.error('[TenantHome] 标记已读失败', error)
      Taro.showToast({ title: '操作失败', icon: 'none' })
    }
  }

  const goQuick = (url: string) => {
    Taro.navigateTo({ url })
  }

  const activeGrid = isRenting ? TENANT_GRID : VISITOR_GRID

  // 租金提醒与合同到期通知单独聚合展示
  const rentReminders = notifications.filter((n) => n.type === 'payment')
  const leaseReminders = notifications.filter((n) => n.type === 'lease')
  const otherNotifications = notifications.filter(
    (n) => n.type !== 'payment' && n.type !== 'lease'
  )

  const renderCard = (n: Notification) => {
    const info = TYPE_MAP[n.type] || TYPE_MAP.system
    return (
      <View key={n.id} className={`notice-card ${n.read ? 'is-read' : ''}`}>
        <View className='notice-header'>
          <Text className='notice-tag' style={{ color: info.color, backgroundColor: info.bg }}>
            {info.text}
          </Text>
          {!n.read && <Text className='unread-dot'>未读</Text>}
        </View>
        <Text className='notice-title'>{n.title}</Text>
        <Text className='notice-content'>{n.content}</Text>
        <Text className='notice-time'>{n.createdAt}</Text>
      </View>
    )
  }

  return (
    <View className='tenant-home-page'>
      <View className='page-container'>
        <View className='welcome-section'>
          <Text className='welcome-text'>你好，{user?.name || '租客'}</Text>
          <Text className='welcome-sub'>祝您生活愉快</Text>
        </View>

        <View className='quick-nav'>
          {activeGrid.map((entry) => (
            <View
              key={entry.key}
              className={`quick-nav-item quick-nav-item--${entry.key}`}
              onClick={() => goQuick(entry.url)}
            >
              <View className='quick-nav-icon' />
              <Text className='quick-nav-label'>{entry.label}</Text>
            </View>
          ))}
        </View>

        <View className='translate-section'>
          <Text className='translate-title'>房源翻译</Text>
          <Text className='translate-desc'>
            示例房源描述：「三室一厅朝南，家电齐全，月租五千，近地铁站」
          </Text>
          <Input
            className='translate-input'
            value={translateText}
            placeholder='输入要翻译的中文房源描述'
            onInput={((e: any) => setTranslateText((e as any).detail.value)) as any}
          />
          <View className={`translate-btn ${translating ? 'disabled' : ''}`} onClick={handleTranslate}>
            <Text className='translate-btn-text'>{translating ? '翻译中...' : 'Google 翻译'}</Text>
          </View>
          {translated && <Text className='translate-result'>{translated}</Text>}
        </View>

        <View className='action-bar'>
          <Text className='action-title'>我的通知</Text>
          {notifications.length > 0 && (
            <Text className='action-link' onClick={handleReadAll}>
              全部已读
            </Text>
          )}
        </View>

        <ScrollView scrollY className='notice-list'>
          {loading && notifications.length === 0 && (
            <View className='empty-tip'>
              <Text>加载中...</Text>
            </View>
          )}
          {!loading && notifications.length === 0 && (
            <View className='empty-tip'>
              <Text>暂无通知</Text>
            </View>
          )}

          {rentReminders.length > 0 && (
            <View className='notice-group'>
              <Text className='group-title'>租金提醒</Text>
              {rentReminders.map(renderCard)}
            </View>
          )}

          {leaseReminders.length > 0 && (
            <View className='notice-group'>
              <Text className='group-title'>合同到期通知</Text>
              {leaseReminders.map(renderCard)}
            </View>
          )}

          {otherNotifications.length > 0 && (
            <View className='notice-group'>
              <Text className='group-title'>其他通知</Text>
              {otherNotifications.map(renderCard)}
            </View>
          )}
        </ScrollView>
      </View>
    </View>
  )
}
