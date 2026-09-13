import { useState } from 'react'
import { View, Text, ScrollView, Input } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { aiApi } from '@/services/api'
import './index.scss'

interface ChatItem {
  role: 'user' | 'assistant'
  content: string
}

export default function AiPage() {
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)
  const [messages, setMessages] = useState<ChatItem[]>([])
  const [inputText, setInputText] = useState('')
  const [sending, setSending] = useState(false)
  const [unconfigured, setUnconfigured] = useState(false)
  const [health, setHealth] = useState('')

  const checkHealth = async () => {
    try {
      const res: any = await aiApi.health()
      setHealth(typeof res === 'object' ? JSON.stringify(res) : String(res))
    } catch (error) {
      // 接口未配密钥时后端会提示预留
      setUnconfigured(true)
    }
  }

  useDidShow(() => {
    loadFromStorage()
    if (!useAuthStore.getState().token) {
      Taro.redirectTo({ url: '/pages/login/index' })
      return
    }
    checkHealth()
  })

  const handleSend = async () => {
    const text = inputText.trim()
    if (!text || sending) return
    const next = [...messages, { role: 'user' as const, content: text }]
    setMessages(next)
    setInputText('')
    setSending(true)
    try {
      const res: any = await aiApi.chat([
        ...messages.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user', content: text }
      ])
      const reply = res?.reply ?? res?.content ?? res?.message ?? res?.data?.reply
      setMessages([...next, { role: 'assistant', content: String(reply || res) }])
    } catch (error) {
      setUnconfigured(true)
      setMessages([...next, { role: 'assistant', content: 'AI 服务暂不可用，接口未配置密钥或服务未就绪。' }])
    } finally {
      setSending(false)
    }
  }

  return (
    <View className='ai-page'>
      <View className='page-container'>
        {unconfigured && (
          <View className='notice'>
            <Text className='notice-text'>
              AI 应用接口为预留接口：后端尚未配置模型密钥，当前不可用。请先在后端配置后再体验。
            </Text>
          </View>
        )}

        <ScrollView scrollY className='message-list'>
          {messages.length === 0 && (
            <View className='empty-tip'>
              <Text>{health ? `服务状态：${health}` : '输入问题开始与 AI 对话'}</Text>
            </View>
          )}
          {messages.map((m, idx) => (
            <View key={idx} className={`msg-row ${m.role}`}>
              <View className='bubble'>
                <Text className='bubble-text'>{m.content}</Text>
              </View>
            </View>
          ))}
          {sending && (
            <View className='msg-row assistant'>
              <View className='bubble'>
                <Text className='bubble-text'>思考中...</Text>
              </View>
            </View>
          )}
        </ScrollView>

        <View className='input-bar'>
          <Input
            className='input-box'
            value={inputText}
            onInput={(e) => setInputText(e.detail.value)}
            confirmType='send'
            placeholder='输入问题...'
            onConfirm={handleSend}
          />
          <View className={`send-btn ${sending ? 'disabled' : ''}`} onClick={handleSend}>
            <Text className='send-text'>发送</Text>
          </View>
        </View>
      </View>
    </View>
  )
}