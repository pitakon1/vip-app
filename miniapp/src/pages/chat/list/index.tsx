import { useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useDidShow, usePullDownRefresh } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { chatApi } from '@/services/api'
import BottomNav from '@/components/BottomNav'
import StatusTop from '@/components/StatusTop'
import StateBlock from '@/components/StateBlock'
import { useI18n } from '@/i18n'
import { fmtDateTime } from '@/utils/format'
import { iconStyle } from '@/utils/icons'
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

export default function ChatListPage() {
  const { t } = useI18n()
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)
  // 访客态：浏览无需注册；消息是需登录的动作 → 站内引导登录（对齐 App ChatListScreen）
  const [guest, setGuest] = useState(false)

  const load = async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const convRes = await chatApi.conversations()
      setConversations(pickList<Conversation>(convRes))
    } catch (error) {
      console.error('[ChatList] 获取会话失败', error)
      setLoadError(true)
      Taro.showToast({ title: t('chat.loadConvFailed'), icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  useDidShow(() => {
    loadFromStorage()
    if (!useAuthStore.getState().token) {
      setGuest(true)
      setLoading(false)
      return
    }
    setGuest(false)
    void load()
  })

  // 下拉刷新（对齐 App 的 RefreshControl）；访客没有会话可刷新
  usePullDownRefresh(async () => {
    if (!guest) await load()
    Taro.stopPullDownRefresh()
  })

  const openConversation = (id: number | string) => {
    Taro.navigateTo({ url: `/pages/chat/detail/index?id=${id}` })
  }

  return (
    <View className='chat-list-page'>
      <StatusTop />
      <View className='page-container'>
        {guest ? (
          <View className='chat-guest'>
            <View className='chat-guest__icon'>
              <View className='icon-svg' style={iconStyle('chat', 64)} />
            </View>
            <Text className='chat-guest__title'>{t('pub.meTitle')}</Text>
            <Text className='chat-guest__sub'>{t('pub.guestHint')}</Text>
            <View
              className='chat-guest__primary'
              onClick={() => Taro.navigateTo({ url: '/pages/login/index' })}
            >
              {t('pub.login')}
            </View>
            <View
              className='chat-guest__ghost'
              onClick={() => Taro.navigateTo({ url: '/pages/login/index' })}
            >
              {t('pub.registerAccount')}
            </View>
          </View>
        ) : (
          <>
            {loading && conversations.length === 0 && (
              <StateBlock loading text={t('common.loading')} />
            )}
            {!loading && loadError && conversations.length === 0 && (
              <StateBlock
                error
                text={t('chat.loadConvFailed')}
                retryText={t('acc.retry')}
                onRetry={() => void load()}
              />
            )}
            {!loading && !loadError && conversations.length === 0 && (
              <StateBlock empty text={t('chat.noConversations')} />
            )}
            {conversations.length > 0 && (
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
                      {fmtDateTime(c.created_at || c.updated_at)}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </View>

      <BottomNav role={guest ? 'guest' : 'tenant'} active='messages' />
    </View>
  )
}