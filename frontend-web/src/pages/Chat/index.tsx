import { useEffect, useRef, useState } from 'react'
import { Modal, Select, Spin, message } from 'antd'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import api from '@/lib/api'
import useAuthStore from '@/stores/auth'
import { authApi, chatApi } from '@/services/api'
import './chat.css'

interface Conv {
  id: string
  title: string
  entity_type?: string | null
  entity_id?: string | null
  participant_ids: string[]
  created_at: string
  /** 当前用户视角的未读数（进入会话后清零） */
  unread_count?: number
}

interface Msg {
  id: string
  sender_id: string
  body: string
  message_type: string
  created_at: string
}

// WebSocket 状态：只用于提示用户（连接中 / 已断开重连中），不参与业务判断
type WsStatus = 'idle' | 'connecting' | 'open' | 'offline'

const MAX_WS_RETRY = 3

const Chat = () => {
  const { t } = useTranslation()
  const [convs, setConvs] = useState<Conv[]>([])
  const [convsLoading, setConvsLoading] = useState(true)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [msgsLoading, setMsgsLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [wsStatus, setWsStatus] = useState<WsStatus>('idle')
  const [draft, setDraft] = useState('')
  const wsRef = useRef<WebSocket | null>(null)
  // 当前会话 id 的 ref：WS 回调是异步的，必须与 state 分开判断「是否仍是当前会话」，
  // 否则切换会话后旧连接的回调会把消息写进新会话。
  const activeIdRef = useRef<string | null>(null)
  const retryRef = useRef<number | null>(null)
  const retryCountRef = useRef(0)
  const listRef = useRef<HTMLDivElement>(null)
  const [searchParams] = useSearchParams()
  const urlId = searchParams.get('id')
  const [myId, setMyId] = useState('')
  const currentUser = useAuthStore((s) => s.user)
  // 管理员主动发起会话：选择账号 → 建会话 → 直接进入
  const [newOpen, setNewOpen] = useState(false)
  const [userOptions, setUserOptions] = useState<{ label: string; value: string }[]>([])
  const [newUserId, setNewUserId] = useState<string>()
  const [newLoading, setNewLoading] = useState(false)

  // 加载会话列表 + 当前用户 id（用于区分“我发的”）
  useEffect(() => {
    chatApi
      .conversations()
      .then((res) => setConvs(res.data || []))
      .catch(() => message.warning(t('chat.loadConvsFailed')))
      .finally(() => setConvsLoading(false))
    authApi
      .me()
      .then((res) => setMyId(res?.data?.id || res?.data?.user?.id || ''))
      .catch(() => setMyId(''))
  }, [])

  // 停留在会话列表时定时刷新：对端新消息的未读角标无需手动刷新即可出现
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      chatApi
        .conversations()
        .then((res) => setConvs(res.data || []))
        .catch(() => undefined)
    }, 15000)
    return () => window.clearInterval(timer)
  }, [])

  const clearRetry = () => {
    if (retryRef.current !== null) {
      window.clearTimeout(retryRef.current)
      retryRef.current = null
    }
  }

  // 本地先清零角标，再异步通知后端标记已读（失败不回滚：下次列表刷新会以服务端为准）
  const clearUnread = (id: string) => {
    setConvs((prev) => prev.map((c) => (c.id === id ? { ...c, unread_count: 0 } : c)))
    chatApi.markRead(id).catch(() => undefined)
  }

  // 建立 WebSocket（可重入）：断线后按退避重试，最多 MAX_WS_RETRY 次。
  const connectWs = (id: string) => {
    clearRetry()
    wsRef.current?.close()
    wsRef.current = null
    setWsStatus('connecting')
    const ws = new WebSocket(chatApi.wsUrl(id))
    wsRef.current = ws
    ws.onopen = () => {
      if (wsRef.current !== ws || activeIdRef.current !== id) return
      retryCountRef.current = 0
      setWsStatus('open')
    }
    ws.onmessage = (ev) => {
      if (wsRef.current !== ws || activeIdRef.current !== id) return
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
          // 正在看这个会话：新消息直接算已读
          clearUnread(id)
        }
      } catch {
        /* ignore */
      }
    }
    ws.onclose = (ev) => {
      // 旧连接（已被替换）的关闭事件不参与重连，避免手动重连时叠加出第二条连接
      if (wsRef.current !== ws || activeIdRef.current !== id) return
      setWsStatus('offline')
      // 4401 = token 失效，重连没有意义，提示用户重新登录
      if (ev.code === 4401) {
        message.warning(t('chat.wsAuthFailed'))
        return
      }
      if (retryCountRef.current >= MAX_WS_RETRY) return
      retryCountRef.current += 1
      retryRef.current = window.setTimeout(() => {
        if (activeIdRef.current === id) connectWs(id)
      }, 1500 * retryCountRef.current)
    }
  }

  // 打开会话：拉取历史 + 建立 WebSocket；重复点击同一会话不重复请求
  const openConv = (id: string) => {
    if (activeIdRef.current === id) {
      // 同一会话但连接已断开（重试耗尽）时，点击可手动重连；connecting/open 状态不重复建连
      if (wsStatus === 'offline' || wsStatus === 'idle') {
        retryCountRef.current = 0
        connectWs(id)
      }
      return
    }
    activeIdRef.current = id
    setActiveId(id)
    setMsgs([])
    setMsgsLoading(true)
    chatApi
      .messages(id)
      .then((res) => {
        if (activeIdRef.current === id) {
          setMsgs(res.data || [])
          clearUnread(id)
        }
      })
      .catch(() => message.warning(t('chat.loadMsgsFailed')))
      .finally(() => {
        if (activeIdRef.current === id) setMsgsLoading(false)
      })
    connectWs(id)
  }

  // 管理员主动发起：拉取可对话账号（客户/业主/员工/合作方），选中后建会话
  const openNewConv = async () => {
    setNewOpen(true)
    if (userOptions.length) return
    setNewLoading(true)
    try {
      const res = await api.get('/admin/users', { params: { page_size: 100 } })
      const payload = res.data?.data ?? res.data
      const items: any[] = payload?.items ?? []
      setUserOptions(
        items
          .filter((u) => u.id !== currentUser?.id)
          .map((u) => ({
            value: u.id,
            label: `${u.full_name || u.email}（${u.email}）`,
          }))
      )
    } catch (err: any) {
      message.warning(err?.response?.data?.detail || t('chat.loadUsersFailed'))
      setNewOpen(false)
    } finally {
      setNewLoading(false)
    }
  }

  const createConv = async () => {
    if (!newUserId) return
    setNewLoading(true)
    try {
      const res = await chatApi.createConversation({ participant_user_ids: [newUserId] })
      const conv = res.data
      setConvs((prev) => [conv, ...prev.filter((c) => c.id !== conv.id)])
      setNewOpen(false)
      setNewUserId(undefined)
      openConv(conv.id)
    } catch (err: any) {
      message.error(err?.response?.data?.detail || t('chat.createConvFailed'))
    } finally {
      setNewLoading(false)
    }
  }

  // URL ?id= 直接打开会话（CRM「发消息」跳转）
  useEffect(() => {
    if (urlId) openConv(urlId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlId])

  useEffect(
    () => () => {
      activeIdRef.current = null
      clearRetry()
      wsRef.current?.close()
    },
    []
  )

  // WS 重试耗尽（代理阻断/弱网）时降级轮询：仍能收到对端新消息，而不是只能手动刷新
  useEffect(() => {
    if (!activeId || wsStatus !== 'offline') return
    const id = activeId
    const timer = window.setInterval(() => {
      chatApi
        .messages(id)
        .then((res) => {
          if (activeIdRef.current === id) setMsgs(res.data || [])
        })
        .catch(() => undefined)
    }, 15000)
    return () => window.clearInterval(timer)
  }, [activeId, wsStatus])

  const handleSend = async () => {
    if (!draft.trim() || !activeId || sending) return
    const id = activeId
    const body = draft.trim()
    setSending(true)
    try {
      // 发送/接收都走后端：REST 落库并广播，WS 仅用于接收对端消息（避免重复落库）
      await chatApi.sendMessage(id, { body })
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
    } catch {
      // 失败时不追加本地消息，避免「看起来发出去了、实际没落库」的假成功
      message.error(t('chat.sendFailed'))
    } finally {
      setSending(false)
    }
  }

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [msgs])

  return (
    <div className="rent-main">
      {/* 标题由 MainLayout 顶栏承担；页面内不再重复「消息」标题/副标题 */}
      <div className="rent-chat">
        {/* 会话列表 */}
        <aside className="rent-chat__side">
          <div className="rent-chat__side-head">
            <span>{t('chat.convList')}</span>
            {currentUser?.role === 'admin' ? (
              <button className="rent-btn rent-btn--primary rent-chat__new" onClick={openNewConv}>
                {t('chat.newConversation')}
              </button>
            ) : null}
          </div>
          <div className="rent-chat__list">
            {convsLoading ? (
              <div className="rent-empty rent-p-4">{t('common.loading')}</div>
            ) : convs.length === 0 ? (
              <div className="rent-empty rent-p-4">{t('chat.emptyConvs')}</div>
            ) : (
              convs.map((c) => (
                <div
                  key={c.id}
                  className={`rent-chat__item${activeId === c.id ? ' is-active' : ''}`}
                  onClick={() => openConv(c.id)}
                >
                  <div className="rent-chat__item-head">
                    <div className="rent-chat__item-title">{c.title}</div>
                    {c.unread_count ? (
                      <span className="rent-chat__badge">
                        {c.unread_count > 99 ? '99+' : c.unread_count}
                      </span>
                    ) : null}
                  </div>
                  <div className="rent-chat__item-meta">
                    {c.entity_type ? `${c.entity_type} · ` : ''}
                    {t('chat.peopleCount', { n: c.participant_ids.length })}
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>

        {/* 消息面板 */}
        <section className="rent-chat__main">
          {!activeId ? (
            <div className="rent-empty rent-chat__placeholder">{t('chat.pickConv')}</div>
          ) : (
            <>
              {/* 连接状态提示：仅在非 open 时显示，连接中/断线重连对用户可见 */}
              {wsStatus === 'connecting' ? (
                <div className="rent-chat__status">{t('chat.connecting')}</div>
              ) : wsStatus === 'offline' ? (
                <div className="rent-chat__status rent-chat__status--warn">{t('chat.offline')}</div>
              ) : null}
              <div className="rent-chat__msgs" ref={listRef}>
                {msgsLoading ? (
                  <div className="rent-empty rent-p-6">
                    <Spin />
                  </div>
                ) : msgs.length === 0 ? (
                  <div className="rent-empty rent-p-6">{t('chat.emptyMsgs')}</div>
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
                  placeholder={t('chat.inputPlaceholder')}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSend()
                  }}
                />
                <button
                  className="rent-btn rent-btn--primary"
                  onClick={handleSend}
                  disabled={sending || !draft.trim()}
                >
                  {sending ? t('common.loading') : t('chat.send')}
                </button>
              </div>
            </>
          )}
        </section>
      </div>

      <Modal
        title={t('chat.newConversation')}
        open={newOpen}
        onCancel={() => setNewOpen(false)}
        onOk={createConv}
        okText={t('chat.startChat')}
        cancelText={t('common.cancel')}
        okButtonProps={{ loading: newLoading, disabled: !newUserId }}
      >
        <Select
          showSearch
          style={{ width: '100%' }}
          placeholder={t('chat.pickUser')}
          options={userOptions}
          value={newUserId}
          onChange={setNewUserId}
          loading={newLoading}
          optionFilterProp="label"
        />
      </Modal>
    </div>
  )
}

export default Chat