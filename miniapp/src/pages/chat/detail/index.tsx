import { useState } from 'react'
import { View, Text, ScrollView, Input } from '@tarojs/components'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { chatApi } from '@/services/api'
import './index.scss'

interface Message {
  id: number | string
  sender_id?: number | string
  mine?: boolean
  is_mine?: boolean
  content?: string
  text?: string
  created_at?: string
}

function pickMessages(res: any): Message[] {
  if (Array.isArray(res)) return res
  if (Array.isArray(res?.data)) return res.data
  if (Array.isArray(res?.items)) return res.items
  if (Array.isArray(res?.list)) return res.list
  if (Array.isArray(res?.data?.items)) return res.data.items
  if (Array.isArray(res?.data?.list)) return res.data.list
  return []
}

export default function ChatDetailPage() {
  const router = useRouter()
  const conversationId = String(router.params.id ?? '')
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)
  const [messages, setMessages] = useState<Message[]>([])
  const [inputText, setInputText] = useState('')
  const [sending, setSending] = useState(false)

  const fetchMessages = async () => {
    if (!conversationId) return
    try {
      const res = await chatApi.messages(conversationId)
      setMessages(pickMessages(res))
    } catch (error) {
      console.error('[ChatDetail] 获取消息失败', error)
      Taro.showToast({ title: '加载消息失败', icon: 'none' })
    }
  }

  useDidShow(() => {
    loadFromStorage()
    if (!useAuthStore.getState().token) {
      Taro.redirectTo({ url: '/pages/login/index' })
      return
    }
    fetchMessages()
  })

  const handleSend = async () => {
    const text = inputText.trim()
    if (!text || !conversationId) return
    if (sending) return
    setSending(true)
    try {
      await chatApi.sendMessage(conversationId, { content: text })
      setInputText('')
      await fetchMessages()
    } catch (error) {
      console.error('[ChatDetail] 发送失败', error)
      Taro.showToast({ title: '发送失败', icon: 'none' })
    } finally {
      setSending(false)
    }
  }

  return (
    <View className='chat-detail-page'>
      <ScrollView scrollY className='message-list' scrollWithAnimation>
        {messages.length === 0 && (
          <View className='empty-tip'>
            <Text>暂时没有消息，来说点什么吧</Text>
          </View>
        )}
        {messages.map((m) => {
          const mine = m.mine || m.is_mine
          const content = m.content || m.text || ''
          return (
            <View key={m.id} className={`message-row ${mine ? 'mine' : 'other'}`}>
              <View className='bubble'>
                <Text className='bubble-text'>{content}</Text>
                {m.created_at && <Text className='bubble-time'>{m.created_at}</Text>}
              </View>
            </View>
          )
        })}
      </ScrollView>

      <View className='input-bar'>
        <Input
          className='input-box'
          value={inputText}
          onInput={(e) => setInputText(e.detail.value)}
          confirmType='send'
          placeholder='输入消息...'
          onConfirm={handleSend}
        />
        <View className={`send-btn ${sending ? 'disabled' : ''}`} onClick={handleSend}>
          <Text className='send-text'>发送</Text>
        </View>
      </View>
    </View>
  )
}