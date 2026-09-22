import { useCallback, useEffect, useState } from 'react'
import { Empty, Popover } from 'antd'
import { useTranslation } from 'react-i18next'
import { notificationsApi } from '@/services/api'

interface NotifItem {
  id: string
  subject?: string
  content?: string
  status?: string
  created_at?: string
}

const PANEL_WIDTH = 340
const FETCH_SIZE = 20

/**
 * 顶栏通知铃铛。
 *
 * 此前 Web 两个布局里都是一颗写死数字（1 / 3）的假红点且没有 onClick，
 * 后端 `/notifications/me`、`/{id}/read`、`/read-all` 三个接口早已存在，
 * 这里接真：未读数取自真实通知（status !== 'read'），点条目标记已读。
 */
const NotificationsBell = () => {
  const { t } = useTranslation()
  const [items, setItems] = useState<NotifItem[]>([])
  const [open, setOpen] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await notificationsApi.mine({ page: 1, pageSize: FETCH_SIZE })
      const payload = res.data?.data ?? res.data
      setItems((payload?.items ?? []) as NotifItem[])
    } catch {
      // 未登录/接口不可用时保持空列表，不展示假红点
      setItems([])
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const unread = items.filter((n) => n.status !== 'read').length

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) load()
  }

  const markRead = async (item: NotifItem) => {
    if (item.status === 'read') return
    try {
      await notificationsApi.read(String(item.id))
      setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, status: 'read' } : n)))
    } catch {
      // 标记失败时保留未读态，下次打开重试
    }
  }

  const markAllRead = async () => {
    try {
      await notificationsApi.readAll()
      setItems((prev) => prev.map((n) => ({ ...n, status: 'read' })))
    } catch {
      // 同上
    }
  }

  const panel = (
    <div style={{ width: PANEL_WIDTH }}>
      <div
        className="rent-flex rent-flex--between"
        style={{ alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--rent-line)' }}
      >
        <span className="rent-text-bold rent-text-sm">{t('topbar.notifications')}</span>
        {unread > 0 && (
          <button
            className="rent-btn rent-btn--ghost rent-btn--sm"
            onClick={(e) => {
              e.stopPropagation()
              markAllRead()
            }}
          >
            {t('topbar.markAllRead')}
          </button>
        )}
      </div>
      <div style={{ maxHeight: 360, overflowY: 'auto' }}>
        {items.length === 0 ? (
          <div className="rent-empty" style={{ padding: '28px 0' }}>
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('topbar.notifEmpty')} />
          </div>
        ) : (
          items.map((n) => (
            <div
              key={n.id}
              onClick={(e) => {
                e.stopPropagation()
                markRead(n)
              }}
              style={{
                padding: '10px 16px',
                borderBottom: '1px solid var(--rent-line)',
                cursor: n.status === 'read' ? 'default' : 'pointer',
                background: n.status === 'read' ? '#fff' : 'rgba(20, 184, 166, 0.05)',
              }}
            >
              <div className="rent-flex rent-gap-2 rent-mb-2" style={{ alignItems: 'center' }}>
                {n.status !== 'read' && (
                  <span className="rent-badge--dot" style={{ background: 'var(--rent-primary)', flexShrink: 0 }} />
                )}
                <span className="rent-text-sm rent-text-bold">{n.subject || t('topbar.notifications')}</span>
              </div>
              <div className="rent-text-sm rent-text-muted" style={{ lineHeight: 1.5 }}>
                {n.content}
              </div>
              {n.created_at && (
                <div className="rent-caption rent-text-muted" style={{ marginTop: 4 }}>
                  {String(n.created_at).replace('T', ' ').slice(0, 16)}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )

  return (
    <Popover
      open={open}
      onOpenChange={handleOpenChange}
      placement="bottomRight"
      trigger="click"
      arrow={false}
      content={panel}
    >
      <button className="rent-icon-btn" aria-label={t('topbar.notifications')}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--rent-ink-2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && <span className="rent-icon-btn__badge">{unread > 99 ? '99+' : unread}</span>}
      </button>
    </Popover>
  )
}

export default NotificationsBell