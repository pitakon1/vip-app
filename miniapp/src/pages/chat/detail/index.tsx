import { useRef, useState } from 'react'
import { View, Text, ScrollView, Input } from '@tarojs/components'
import Taro, { useDidShow, useUnload, useRouter } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { authApi, chatApi } from '@/services/api'
import ShellHeader from '@/components/ShellHeader'
import StateBlock from '@/components/StateBlock'
import { useI18n } from '@/i18n'
import { fmtDateTime } from '@/utils/format'
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
  const { t } = useI18n()
  const router = useRouter()
  const conversationId = String(router.params.id ?? '')
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)
  const [messages, setMessages] = useState<Message[]>([])
  const [inputText, setInputText] = useState('')
  const [sending, setSending] = useState(false)
  const [myId, setMyId] = useState('')
  const socketRef = useRef<any>(null)
  const unloadedRef = useRef(false)
  const pollTimerRef = useRef<any>(null)
  const retryTimerRef = useRef<any>(null)
  const retryCountRef = useRef(0)

  const fetchMessages = async (silent = false) => {
    if (!conversationId) return
    try {
      const res = await chatApi.messages(conversationId)
      setMessages(pickMessages(res))
      // 拉取成功即标记已读，会话列表的未读角标随之清零
      chatApi.markRead(conversationId).catch(() => undefined)
    } catch (error) {
      console.error('[ChatDetail] 获取消息失败', error)
      if (!silent) Taro.showToast({ title: t('chat.loadMsgFailed'), icon: 'none' })
    }
  }

  // 断线（切网/切后台）后按退避重连，最多 3 次；重连前先关掉旧连接，避免重复收消息
  const connectSocket = () => {
    if (unloadedRef.current || !conversationId) return
    Taro.connectSocket({ url: chatApi.wsUrl(conversationId) })
      .then((task: any) => {
        if (unloadedRef.current) {
          task?.close?.({})
          return
        }
        socketRef.current?.close?.({})
        socketRef.current = task
        retryCountRef.current = 0
        task.onMessage((res: any) => {
          try {
            const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
            if (data.event === 'message') {
              // 按服务端 id 去重：轮询/重连可能带来同一条消息
              setMessages((prev) =>
                data.id && prev.some((m) => String(m.id) === String(data.id))
                  ? prev
                  : [
                      ...prev,
                      {
                        id: data.id ?? `rt-${Date.now()}`,
                        body: data.body,
                        sender_id: data.sender_id,
                        created_at: data.created_at
                      }
                    ]
              )
              // 正在看这个会话：新消息直接算已读
              chatApi.markRead(conversationId).catch(() => undefined)
            }
          } catch (error) {
            console.error('[ChatDetail] WS 消息解析失败', error)
          }
        })
        task.onClose?.(() => {
          if (unloadedRef.current || retryCountRef.current >= 3) return
          retryCountRef.current += 1
          retryTimerRef.current = setTimeout(connectSocket, 1500 * retryCountRef.current)
        })
      })
      .catch(() => {
        if (unloadedRef.current || retryCountRef.current >= 3) return
        retryCountRef.current += 1
        retryTimerRef.current = setTimeout(connectSocket, 1500 * retryCountRef.current)
      })
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
    connectSocket()
    // 兜底轮询：小程序 WS 被后台/弱网掐断时，仍能收到新消息（15s 一次，静默失败）
    if (pollTimerRef.current) clearInterval(pollTimerRef.current)
    pollTimerRef.current = setInterval(() => {
      void fetchMessages(true)
    }, 15000)
  })

  useUnload(() => {
    unloadedRef.current = true
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
    if (pollTimerRef.current) clearInterval(pollTimerRef.current)
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
      Taro.showToast({ title: t('chat.sendFailed'), icon: 'none' })
    } finally {
      setSending(false)
    }
  }

  return (
    <View className='chat-detail-page'>
      <ShellHeader title={t('chat.detailTitle')} />
      <ScrollView scrollY className='message-list' scrollWithAnimation>
        {messages.length === 0 && (
          <StateBlock empty text={t('chat.empty')} />
        )}
        {messages.map((m) => {
          const mine = m.mine || m.is_mine || (!!myId && String(m.sender_id) === myId)
          const content = m.body || m.content || m.text || ''
          return (
            <View key={m.id} className={`message-row ${mine ? 'mine' : 'other'}`}>
              <View className='bubble'>
                <Text className='bubble-text'>{content}</Text>
                {m.created_at && <Text className='bubble-time'>{fmtDateTime(m.created_at)}</Text>}
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
          placeholder={t('chat.inputPlaceholder')}
          onConfirm={handleSend}
        />
        <View className={`send-btn ${sending ? 'disabled' : ''}`} onClick={handleSend}>
          <Text className='send-text'>{t('chat.send')}</Text>
        </View>
      </View>
    </View>
  )
}