import { useRef, useState } from 'react'
import { View, Text, ScrollView, Input } from '@tarojs/components'
import Taro, { useDidShow, useUnload, useRouter } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { authApi, chatApi } from '@/services/api'
import './index.scss'

interface Message {
  id: number | string
  sender_id?: number | string
  mine?: boolean
  is_mine?: boolean
  body?: string
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
  const [myId, setMyId] = useState('')
  const socketRef = useRef<any>(null)
  const unloadedRef = useRef(false)

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
    // 当前用户 id 用于区分“我发的”
    authApi.me().then((res: any) => {
      const me = res?.id ?? res?.user?.id
      if (me) setMyId(String(me))
    }).catch(() => undefined)
    // 建立实时接收通道：发送走 REST，WebSocket 仅接收对端消息
    if (conversationId) {
      Taro.connectSocket({ url: chatApi.wsUrl(conversationId) })
        .then((task: any) => {
          if (unloadedRef.current) {
            task?.close?.({})
            return
          }
          socketRef.current = task
          task.onMessage((res: any) => {
            try {
              const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
              if (data.event === 'message') {
                setMessages((prev) => [
                  ...prev,
                  {
                    id: data.id ?? `rt-${Date.now()}`,
                    body: data.body,
                    sender_id: data.sender_id,
                    created_at: data.created_at
                  }
                ])
              }
            } catch (error) {
              console.error('[ChatDetail] WS 消息解析失败', error)
            }
          })
        })
        .catch(() => undefined)
    }
  })

  useUnload(() => {
    unloadedRef.current = true
    if (socketRef.current) {
      socketRef.current.close({ code: 1000, reason: 'page unload' })
      socketRef.current = null
    }
  })

  const handleSend = async () => {
    const text = inputText.trim()
    if (!text || !conversationId) return
    if (sending) return
    setSending(true)
    try {
      await chatApi.sendMessage(conversationId, { body: text })
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
          <View className='empty-state'>
            <Text>暂时没有消息，来说点什么吧</Text>
          </View>
        )}
        {messages.map((m) => {
          const mine = m.mine || m.is_mine || (!!myId && String(m.sender_id) === myId)
          const content = m.body || m.content || m.text || ''
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