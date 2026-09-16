import { useMemo, useState } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { chatApi, notificationsApi } from '@/services/api'
import { iconStyle } from '@/utils/icons'
import type { IconKey } from '@/utils/icons'
import BottomNav from '@/components/BottomNav'
import './index.scss'

interface Conversation {
  id: number | string
  title?: string
  peer_name?: string
  last_message?: string
  unread_count?: number
  updated_at?: string
}

/** 通知（后端返回字段为 subject/content/status/related_entity_type/created_at） */
interface NotifRow {
  id: number | string
  subject?: string
  title?: string
  content?: string
  status?: string
  read?: boolean
  related_entity_type?: string
  template_key?: string
  created_at?: string
  createdAt?: string
  [key: string]: any
}

// 分类键与原型 Tab 一致：全部 / 系统通知 / 租务提醒 / 服务消息
type MsgCat = 'all' | 'system' | 'rent' | 'service'

const CATS: { key: MsgCat; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'system', label: '系统通知' },
  { key: 'rent', label: '租务提醒' },
  { key: 'service', label: '服务消息' }
]

// 按通知关联实体归类（后端无 type 字段，使用 related_entity_type / template_key 推导）
const RENT_KEYS = ['lease', 'payment', 'rent', 'invoice', 'deposit']
const SERVICE_KEYS = ['maintenance', 'service_order', 'service', 'repair', 'ticket']

const categoryOf = (n: NotifRow): MsgCat => {
  const raw = `${n.related_entity_type || ''} ${n.template_key || ''}`.toLowerCase()
  if (RENT_KEYS.some((k) => raw.includes(k))) return 'rent'
  if (SERVICE_KEYS.some((k) => raw.includes(k))) return 'service'
  return 'system'
}

const CAT_ICON: Record<MsgCat, { icon: IconKey; color: string; bg: string }> = {
  all: { icon: 'megaphone', color: 'var(--ink-2)', bg: 'var(--surface-2)' },
  system: { icon: 'megaphone', color: 'var(--info)', bg: 'rgba(var(--info-rgb), 0.12)' },
  rent: { icon: 'calendar', color: 'var(--warning)', bg: 'rgba(var(--warning-rgb), 0.12)' },
  service: { icon: 'clipboard', color: 'var(--primary)', bg: 'var(--sidebar-active)' }
}

const notifTitle = (n: NotifRow) => n.subject || n.title || '通知'
const notifTime = (n: NotifRow) => n.created_at || n.createdAt || ''
const isUnread = (n: NotifRow) => (n.read != null ? !n.read : n.status !== 'read')

function pickList<T>(res: any): T[] {
  if (Array.isArray(res)) return res
  if (Array.isArray(res?.data)) return res.data
  if (Array.isArray(res?.items)) return res.items
  if (Array.isArray(res?.list)) return res.list
  if (Array.isArray(res?.data?.items)) return res.data.items
  if (Array.isArray(res?.data?.list)) return res.data.list
  return []
}

const formatDay = (x?: string) => (x ? String(x).replace('T', ' ').slice(0, 10) : '')

export default function ChatListPage() {
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [notifications, setNotifications] = useState<NotifRow[]>([])
  const [loading, setLoading] = useState(false)
  const [cat, setCat] = useState<MsgCat>('all')
  const [marking, setMarking] = useState(false)

  const fetchAll = async () => {
    setLoading(true)
    const [notifRes, convRes] = await Promise.all([
      notificationsApi.mine().catch(() => null),
      chatApi.conversations().catch(() => null)
    ])
    if (!notifRes && !convRes) {
      Taro.showToast({ title: '加载消息失败', icon: 'none' })
    }
    setNotifications(notifRes ? pickList<NotifRow>(notifRes) : [])
    setConversations(convRes ? pickList<Conversation>(convRes) : [])
    setLoading(false)
  }

  useDidShow(() => {
    loadFromStorage()
    if (!useAuthStore.getState().token) {
      Taro.redirectTo({ url: '/pages/login/index' })
      return
    }
    fetchAll()
  })

  const unreadCount = useMemo(
    () => notifications.filter((n) => isUnread(n)).length,
    [notifications]
  )

  const counts = useMemo(() => {
    const base: Record<MsgCat, number> = {
      all: notifications.length,
      system: 0,
      rent: 0,
      service: 0
    }
    notifications.forEach((n) => {
      base[categoryOf(n)] += 1
    })
    return base
  }, [notifications])

  const visibleMessages = useMemo(
    () => (cat === 'all' ? notifications : notifications.filter((n) => categoryOf(n) === cat)),
    [notifications, cat]
  )

  const handleReadAll = async () => {
    if (marking || unreadCount === 0) return
    setMarking(true)
    try {
      await notificationsApi.readAll()
      setNotifications((list) => list.map((n) => ({ ...n, read: true, status: 'read' })))
      Taro.showToast({ title: '已全部标记为已读', icon: 'success' })
    } catch (error) {
      console.error('[ChatList] 全部已读失败', error)
      Taro.showToast({ title: '操作失败', icon: 'none' })
    } finally {
      setMarking(false)
    }
  }

  const openConversation = (id: number | string) => {
    Taro.navigateTo({ url: `/pages/chat/detail/index?id=${id}` })
  }

  return (
    <View className='chat-list-page'>
      <View className='page-container'>
        {/* ===== 标题区：消息中心 + 计数 + 全部已读 ===== */}
        <View className='msg-head'>
          <View className='msg-head__left'>
            <Text className='msg-head__title'>消息中心</Text>
            <Text className='msg-head__sub'>
              共 {notifications.length} 条消息 · {unreadCount} 条未读
            </Text>
          </View>
          <View
            className={`msg-head__btn ${unreadCount === 0 ? 'msg-head__btn--disabled' : ''}`}
            onClick={handleReadAll}
          >
            <Text className='msg-head__btn-text'>{marking ? '处理中...' : '全部已读'}</Text>
          </View>
        </View>

        {/* ===== 分类 Tab ===== */}
        <ScrollView scrollX className='msg-tabs'>
          <View className='msg-tabs__inner'>
            {CATS.map((c) => (
              <View
                key={c.key}
                className={`msg-tab ${cat === c.key ? 'msg-tab--active' : ''}`}
                onClick={() => setCat(c.key)}
              >
                <Text className='msg-tab__text'>
                  {c.label}
                  <Text className='msg-tab__count'>{counts[c.key]}</Text>
                </Text>
              </View>
            ))}
          </View>
        </ScrollView>

        {/* ===== 消息列表 ===== */}
        <View className='msg-card'>
          {loading && visibleMessages.length === 0 && (
            <View className='empty-state'>
              <Text>加载中...</Text>
            </View>
          )}
          {!loading && visibleMessages.length === 0 && (
            <View className='empty-state'>
              <View className='empty-state__icon icon-svg' style={iconStyle('megaphone', 80)} />
              <Text>暂无消息</Text>
            </View>
          )}
          {visibleMessages.map((n) => {
            const category = categoryOf(n)
            const meta = CAT_ICON[category]
            const unread = isUnread(n)
            return (
              <View key={n.id} className='msg-item'>
                <View
                  className='msg-icon icon-svg'
                  style={{ ...iconStyle(meta.icon, 40), backgroundColor: meta.bg }}
                />
                <View className='msg-body'>
                  <View className='msg-title-row'>
                    <Text className='msg-title'>{notifTitle(n)}</Text>
                    {unread && <View className='msg-dot' />}
                    <Text className='msg-cat-badge' style={{ color: meta.color }}>
                      {CATS.find((c) => c.key === category)?.label}
                    </Text>
                  </View>
                  <Text className='msg-summary'>{n.content || '—'}</Text>
                </View>
                <Text className='msg-time'>{formatDay(notifTime(n))}</Text>
              </View>
            )
          })}
        </View>

        {/* ===== 客服会话（联系客服入口，原型无此区块） ===== */}
        {conversations.length > 0 && (
          <>
            <Text className='msg-section-title'>客服会话</Text>
            <View className='conversation-list'>
              {conversations.map((c) => (
                <View
                  key={c.id}
                  className='conversation-card'
                  onClick={() => openConversation(c.id)}
                >
                  <View className='avatar'>
                    <Text className='avatar-text'>
                      {(c.peer_name || c.title || '?').charAt(0)}
                    </Text>
                  </View>
                  <View className='conv-info'>
                    <View className='conv-head'>
                      <Text className='conv-title'>{c.peer_name || c.title || '会话'}</Text>
                      {c.updated_at && (
                        <Text className='conv-time'>{formatDay(c.updated_at)}</Text>
                      )}
                    </View>
                    <View className='conv-foot'>
                      <Text className='conv-preview'>{c.last_message || '暂无消息'}</Text>
                      {!!c.unread_count && c.unread_count > 0 && (
                        <View className='unread-badge'>
                          <Text className='unread-text'>{c.unread_count}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}
      </View>

      <BottomNav role='tenant' active='messages' />
    </View>
  )
}