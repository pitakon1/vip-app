import { useState } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { chatApi } from '@/services/api'
import './index.scss'

interface Conversation {
  id: number | string
  title?: string
  peer_name?: string
  last_message?: string
  unread_count?: number
  updated_at?: string
}

function pickList(res: any): Conversation[] {
  if (Array.isArray(res)) return res
  if (Array.isArray(res?.data)) return res.data
  if (Array.isArray(res?.items)) return res.items
  if (Array.isArray(res?.list)) return res.list
  if (Array.isArray(res?.data?.items)) return res.data.items
  if (Array.isArray(res?.data?.list)) return res.data.list
  return []
}

export default function ChatListPage() {
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(false)

  const fetchConversations = async () => {
    setLoading(true)
    try {
      const res = await chatApi.conversations()
      setConversations(pickList(res))
    } catch (error) {
      console.error('[ChatList] 获取会话失败', error)
      Taro.showToast({ title: '加载会话失败', icon: 'none' })
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
    fetchConversations()
  })

  const openConversation = (id: number | string) => {
    Taro.navigateTo({ url: `/pages/chat/detail/index?id=${id}` })
  }

  return (
    <View className='chat-list-page'>
      <View className='page-container'>
        <ScrollView scrollY className='conversation-list'>
          {loading && conversations.length === 0 && (
            <View className='empty-tip'>
              <Text>加载中...</Text>
            </View>
          )}
          {!loading && conversations.length === 0 && (
            <View className='empty-tip'>
              <Text>暂无会话，去发起聊天吧</Text>
            </View>
          )}
          {conversations.map((c) => (
            <View
              key={c.id}
              className='conversation-card'
              onClick={() => openConversation(c.id)}
            >
              <View className='avatar'>
                <Text className='avatar-text'>
                  {(c.peer_name || c.title || '?' ).charAt(0)}
                </Text>
              </View>
              <View className='conv-info'>
                <View className='conv-head'>
                  <Text className='conv-title'>{c.peer_name || c.title || '会话'}</Text>
                  {c.updated_at && <Text className='conv-time'>{c.updated_at}</Text>}
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
        </ScrollView>
      </View>
    </View>
  )
}