import { useEffect, useRef, useState } from 'react'
import { message } from 'antd'
import { useSearchParams } from 'react-router-dom'
import { authApi, chatApi } from '@/services/api'
import './chat.css'

interface Conv {
  id: string
  title: string
  entity_type?: string | null
  entity_id?: string | null
  participant_ids: string[]
  created_at: string
}

interface Msg {
  id: string
  sender_id: string
  body: string
  message_type: string
  created_at: string
}

const Chat = () => {
  const [convs, setConvs] = useState<Conv[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [draft, setDraft] = useState('')
  const [loading] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [searchParams] = useSearchParams()
  const urlId = searchParams.get('id')
  const [myId, setMyId] = useState('')

  // 加载会话列表 + 当前用户 id（用于区分“我发的”）
  useEffect(() => {
    chatApi
      .conversations()
      .then((res) => setConvs(res.data || []))
      .catch(() => message.warning('会话列表加载失败'))
    authApi
      .me()
      .then((res) => setMyId(res?.data?.id || res?.data?.user?.id || ''))
      .catch(() => setMyId(''))
  }, [])

  // 打开会话：拉取历史 + 建立 WebSocket
  const openConv = (id: string) => {
    setActiveId(id)
    setMsgs([])
    chatApi
      .messages(id)
      .then((res) => setMsgs(res.data || []))
      .catch(() => message.warning('消息加载失败'))

    wsRef.current?.close()
    const ws = new WebSocket(chatApi.wsUrl(id))
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data)
        if (data.event === 'message') {
          setMsgs((prev) => [
            ...prev,
            {
              id: data.id || `local-${Date.now()}`,
              sender_id: data.sender_id || 'unknown',
              body: data.body,
              message_type: data.message_type || 'text',
              created_at: data.created_at || new Date().toISOString(),
            },
          ])
        }
      } catch {
        /* ignore */
      }
    }
    wsRef.current = ws
  }

  // URL ?id= 直接打开会话（CRM「发消息」跳转）
  useEffect(() => {
    if (urlId) openConv(urlId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlId])

  useEffect(() => () => wsRef.current?.close(), [])

  const handleSend = () => {
    if (!draft.trim() || !activeId) return
    const body = draft.trim()
    // 发送/接收都走后端：REST 落库并广播，WS 仅用于接收对端消息（避免重复落库）
    chatApi.sendMessage(activeId, { body }).then(() => {
      setMsgs((prev) => [
        ...prev,
        {
          id: `sent-${Date.now()}`,
          sender_id: myId || 'me',
          body,
          message_type: 'text',
          created_at: new Date().toISOString(),
        },
      ])
      setDraft('')
    })
  }

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [msgs])

  return (
    <div className="rent-main">
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title">咨询会话</h2>
          <p className="rent-page-header__subtitle">客户 / 房东直接咨询工作人员 · 实时聊天</p>
        </div>
      </div>

      <div className="rent-chat">
        {/* 会话列表 */}
        <aside className="rent-chat__side">
          <div className="rent-chat__side-head">会话列表</div>
          <div className="rent-chat__list">
            {loading ? (
              <div className="rent-empty rent-p-4">加载中...</div>
            ) : convs.length === 0 ? (
              <div className="rent-empty rent-p-4">暂无会话</div>
            ) : (
              convs.map((c) => (
                <div
                  key={c.id}
                  className={`rent-chat__item${activeId === c.id ? ' is-active' : ''}`}
                  onClick={() => openConv(c.id)}
                >
                  <div className="rent-chat__item-title">{c.title}</div>
                  <div className="rent-chat__item-meta">
                    {c.entity_type ? `${c.entity_type} · ` : ''}
                    {c.participant_ids.length} 人
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>

        {/* 消息面板 */}
        <section className="rent-chat__main">
          {!activeId ? (
            <div className="rent-empty rent-chat__placeholder">选择左侧会话开始咨询</div>
          ) : (
            <>
              <div className="rent-chat__msgs" ref={listRef}>
                {msgs.length === 0 ? (
                  <div className="rent-empty rent-p-6">暂无消息，打个招呼吧</div>
                ) : (
                  msgs.map((m, i) => {
                    const mine = m.sender_id === 'me' || (!!myId && m.sender_id === myId)
                    return (
                      <div key={m.id || i} className={`rent-chat__msg${mine ? ' is-mine' : ''}`}>
                        <div className="rent-chat__bubble">{m.body}</div>
                      </div>
                    )
                  })
                )}
              </div>
              <div className="rent-chat__input">
                <input
                  className="rent-input"
                  placeholder="输入消息..."
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSend()
                  }}
                />
                <button className="rent-btn rent-btn--primary" onClick={handleSend}>
                  发送
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}

export default Chat