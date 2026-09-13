import { useEffect, useRef, useState } from 'react'
import { message } from 'antd'
import { aiApi } from '@/services/api'
import './ai.css'

interface Turn {
  role: 'user' | 'assistant'
  content: string
  status?: 'reserved' | 'ok' | 'error'
}

const AIAssistant = () => {
  const [health, setHealth] = useState<any>(null)
  const [turns, setTurns] = useState<Turn[]>([
    {
      role: 'assistant',
      content:
        '您好，我是 AI 助手。目前可提供找房问答、合同生成、翻译增强等能力（接口已预留）。配置 OPENAI_API_KEY 后即可真实对话。',
    },
  ])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    aiApi.health().then((res) => setHealth(res.data)).catch(() => {})
  }, [])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [turns])

  const handleSend = async () => {
    const text = input.trim()
    if (!text || sending) return
    setInput('')
    setTurns((p) => [...p, { role: 'user', content: text }])
    setSending(true)
    const history = turns.map((t) => ({ role: t.role, content: t.content }))
    try {
      const res = await aiApi.chat([...history, { role: 'user', content: text }])
      const data = res.data
      if (data.status === 'ok' && data.content) {
        setTurns((p) => [...p, { role: 'assistant', content: data.content, status: 'ok' }])
      } else {
        setTurns((p) => [
          ...p,
          { role: 'assistant', content: data.message || 'AI 接口尚未配置真实密钥，返回预留提示。', status: 'reserved' },
        ])
      }
    } catch {
      setTurns((p) => [...p, { role: 'assistant', content: '请求失败，请稍后重试。', status: 'error' }])
    } finally {
      setSending(false)
    }
  }

  const configured = health?.configured === true

  return (
    <div className="rent-main">
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title">AI 助手</h2>
          <p className="rent-page-header__subtitle">应用接口已预留 · 未配置密钥时返回保留提示</p>
        </div>
        <span className={`rent-badge ${configured ? 'rent-badge--success' : 'rent-badge--neutral'}`}>
          {configured ? '已接入真实模型' : '未配置 OPENAI_API_KEY'}
        </span>
      </div>

      <div className="rent-card">
        <div className="rent-card__body">
          <div className="rent-ai-desc rent-mb-4">
            {health?.capabilities?.length ? (
              <div>
                <div className="rent-text-sm rent-text-muted rent-mb-2">已预留能力：</div>
                <div className="rent-flex" style={{ gap: 8, flexWrap: 'wrap' }}>
                  {health.capabilities.map((c: string) => (
                    <span key={c} className="rent-badge rent-badge--info">{c}</span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="rent-ai-chat" ref={listRef}>
            {turns.map((t, i) => (
              <div key={i} className={`rent-ai-msg is-${t.role}`}>
                <div className="rent-ai-bubble">{t.content}</div>
                {t.status === 'reserved' && (
                  <div className="rent-ai-note">预留提示 · 配置密钥后生效</div>
                )}
              </div>
            ))}
            {sending && <div className="rent-text-sm rent-text-muted">思考中…</div>}
          </div>

          <div className="rent-ai-input">
            <input
              className="rent-input"
              placeholder={configured ? '输入问题...' : 'AI 助手（未配置密钥，仅返回预留提示）'}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            />
            <button className="rent-btn rent-btn--primary" onClick={handleSend} disabled={sending}>
              发送
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AIAssistant