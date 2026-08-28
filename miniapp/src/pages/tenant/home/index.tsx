import { useState } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { notificationsApi } from '@/services/api'
import type { Notification, NotificationType } from '@/types'
import './index.scss'

const TYPE_MAP: Record<NotificationType, { text: string; color: string; bg: string }> = {
  payment: { text: '租金提醒', color: '#ff4d4f', bg: '#fff1f0' },
  lease: { text: '合同到期', color: '#faad14', bg: '#fffbe6' },
  maintenance: { text: '维修通知', color: '#1677ff', bg: '#f0f5ff' },
  system: { text: '系统通知', color: '#999999', bg: '#f5f5f5' }
}

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
