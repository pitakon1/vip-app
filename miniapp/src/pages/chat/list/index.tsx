import { useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useDidShow, usePullDownRefresh } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { chatApi } from '@/services/api'
import BottomNav from '@/components/BottomNav'
import StateBlock from '@/components/StateBlock'
import { useI18n } from '@/i18n'
import './index.scss'

interface Conversation {
  id: number | string
  title?: string
  peer_name?: string
  created_at?: string
  updated_at?: string
}

function pickList<T>(res: any): T[] {
  if (Array.isArray(res)) return res
  if (Array.isArray(res?.data)) return res.data
  if (Array.isArray(res?.items)) return res.items
  if (Array.isArray(res?.list)) return res.list
  if (Array.isArray(res?.data?.items)) return res.data.items
  if (Array.isArray(res?.data?.list)) return res.data.list
  return []
}

const formatTime = (x?: string) => (x ? String(x).replace('T', ' ').slice(5, 16) : '')

export default function ChatListPage() {
  const { t } = useI18n()
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    const convRes = await chatApi.conversations().catch(() => null)
    if (!convRes) {
      Taro.showToast({ title: t('chat.loadConvFailed'), icon: 'none' })
    }
    setConversations(convRes ? pickList<Conversation>(convRes) : [])
    setLoading(false)
  }

  useDidShow(() => {
    loadFromStorage()
    if (!useAuthStore.getState().token) {
      Taro.redirectTo({ url: '/pages/login/index' })
      return
    }
    void load()
  })

  // 下拉刷新（对齐 App 的 RefreshControl）
  usePullDownRefresh(async () => {
    await load()
    Taro.stopPullDownRefresh()
  })

  const openConversation = (id: number | string) => {
    Taro.navigateTo({ url: `/pages/chat/detail/index?id=${id}` })
  }

  return (
    <View className='chat-list-page'>
      <View className='page-container'>
        {loading && conversations.length === 0 && (
          <StateBlock loading text={t('common.loading')} />
        )}
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
              <Text className='conv-title'>{c.peer_name || c.title || t('chat.unnamedConv')}</Text>
              <Text className='conv-time'>
                {formatTime(c.created_at || c.updated_at)}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <BottomNav role='tenant' active='messages' />
    </View>
  )
}