import { useEffect, useRef, useState } from 'react'
import { message } from 'antd'
import { useSearchParams } from 'react-router-dom'
import { chatApi } from '@/services/api'
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
  const [title, setTitle] = useState('')
  const [peerIds, setPeerIds] = useState('')
  const wsRef = useRef<WebSocket | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [searchParams] = useSearchParams()
  const urlId = searchParams.get('id')

  // 加载会话列表
  useEffect(() => {
    chatApi
      .conversations()
      .then((res) => setConvs(res.data || []))
      .catch(() => message.warning('会话列表加载失败'))
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
              id: `local-${Date.now()}`,
              sender_id: data.sender || 'unknown',
              body: data.body,
              message_type: 'text',
              created_at: new Date().toISOString(),
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
    chatApi.sendMessage(activeId, { body }).then(() => {
      setMsgs((prev) => [
        ...prev,
        {
          id: `sent-${Date.now()}`,
          sender_id: 'me',
          body,
          message_type: 'text',
          created_at: new Date().toISOString(),
        },
      ])
      setDraft('')
    })
    // 通过 WS 广播给自己线程
    wsRef.current?.send(JSON.stringify({ sender: 'me', body }))
  }

  const handleCreate = () => {
    if (!peerIds.trim()) {
      message.error('请输入参与人用户 ID（逗号分隔）')
      return
    }
    const participant_user_ids = peerIds.split(/[,，]/).map((s) => s.trim()).filter(Boolean)
    chatApi
      .createConversation({
        title: title.trim() || '咨询会话',
        participant_user_ids,
      })
      .then((res) => {
        message.success('会话已创建')
        setConvs((prev) => [{ ...res.data, participant_ids: res.data.participant_ids }, ...prev])
        setTitle('')
        setPeerIds('')
        openConv(res.data.id)
      })
      .catch(() => message.error('创建会话失败'))
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
          <div className="rent-chat__side-foot">
            <div className="rent-field rent-mb-2">
              <input
                className="rent-input"
                placeholder="会话标题"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="rent-field rent-mb-2">
              <input
                className="rent-input"
                placeholder="参与人 ID，如：00000000-0000-0000-0000-000000000001"
                value={peerIds}
                onChange={(e) => setPeerIds(e.target.value)}
              />
            </div>
            <button className="rent-btn rent-btn--primary rent-btn--block" onClick={handleCreate}>
              新建会话
            </button>
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
                    const mine = m.sender_id === 'me'
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