import { useState } from 'react'
import { View, Text, Input, Textarea, Button, ScrollView, Picker } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { maintenanceApi } from '@/services/api'
import { useSwrCache } from '@/hooks/useSwrCache'
import { iconStyle } from '@/utils/icons'
import type { MaintenanceTicket, MaintenanceStatus, MaintenancePriority } from '@/types'
import './index.scss'

// 键名与后端 TicketStatus 对齐（open/assigned/in_progress/resolved/closed）。
// 展示文案保持业务语义：后端 open=已提交待受理 →「待处理」，assigned=已派单 →「已受理」。
const STATUS_MAP: Record<MaintenanceStatus, { text: string; color: string }> = {
  open: { text: '待处理', color: 'var(--warning)' },
  assigned: { text: '已受理', color: 'var(--info)' },
  in_progress: { text: '处理中', color: 'var(--primary)' },
  resolved: { text: '已完成', color: 'var(--success)' },
  closed: { text: '已关闭', color: 'var(--ink-3)' }
}

const PRIORITY_OPTIONS: MaintenancePriority[] = ['low', 'medium', 'high', 'urgent']
const PRIORITY_LABELS = ['低', '中', '高', '紧急']

/** 优先级徽标配色（紧急=error / 高=warning / 中=info / 低=neutral） */
const PRIORITY_BADGE: Record<MaintenancePriority, string> = {
  urgent: 'badge--error',
  high: 'badge--warning',
  medium: 'badge--info',
  low: 'badge--neutral'
}

/** 状态徽标配色 */
const STATUS_BADGE: Record<MaintenanceStatus, string> = {
  open: 'badge--warning',
  assigned: 'badge--info',
  in_progress: 'badge--primary',
  resolved: 'badge--success',
  closed: 'badge--neutral'
}

const TABS = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待处理' },
  { key: 'processing', label: '处理中' },
  { key: 'done', label: '已完成' }
]

/**
 * Tab 与状态匹配。
 * 后端建单默认 `open`，必须归入「待处理」——旧口径（待处理=submitted）
 * 会让每一条新建工单在三个状态 Tab 里都消失，只剩「全部」能看到。
 * 对齐 Web：`pages/Tenant/Maintenance.tsx::normalizeStatus`。
 */
const matchTab = (status: MaintenanceStatus, tab: string) => {
  if (tab === 'all') return true
  if (tab === 'pending') return status === 'open'
  if (tab === 'processing') return status === 'assigned' || status === 'in_progress'
  return status === 'resolved' || status === 'closed'
}

function pickList(res: any): MaintenanceTicket[] {
  if (Array.isArray(res)) return res
  if (Array.isArray(res?.data)) return res.data
  if (Array.isArray(res?.items)) return res.items
  if (Array.isArray(res?.list)) return res.list
  if (Array.isArray(res?.data?.items)) return res.data.items
  if (Array.isArray(res?.data?.list)) return res.data.list
  return []
}

export default function TenantMaintenancePage() {
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)
  const uid = useAuthStore((state) => state.user?.id) ?? 'anon'
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<MaintenancePriority>('medium')
  const [tab, setTab] = useState('all')

  // 工单详情弹层 + 评价
  const [activeTicket, setActiveTicket] = useState<MaintenanceTicket | null>(null)
  const [rating, setRating] = useState(0)
  const [feedback, setFeedback] = useState('')
  const [ratingSubmitting, setRatingSubmitting] = useState(false)

  const openDetail = (ticket: MaintenanceTicket) => {
    setActiveTicket(ticket)
    setRating(0)
    setFeedback('')
  }

  const closeDetail = () => {
    if (ratingSubmitting) return
    setActiveTicket(null)
  }

  const pickRating = (n: number) => setRating(n)

  const submitRating = async () => {
    if (!activeTicket) return
    if (rating < 1) {
      Taro.showToast({ title: '请选择评分', icon: 'none' })
      return
    }
    setRatingSubmitting(true)
    Taro.showLoading({ title: '提交中...', mask: true })
    try {
      await maintenanceApi.rate(String(activeTicket.id), {
        rating,
        feedback: feedback.trim() || undefined
      })
      Taro.hideLoading()
      Taro.showToast({ title: '评价已提交', icon: 'success' })
      setActiveTicket(null)
    } catch (error) {
      console.error('[Maintenance] 提交评价失败', error)
      Taro.hideLoading()
      Taro.showToast({ title: '提交失败，请重试', icon: 'none' })
    } finally {
      setRatingSubmitting(false)
    }
  }

  const { data: tickets, setData: setTickets, loading, refresh } = useSwrCache<MaintenanceTicket[]>({
    key: `tenant:maintenance:${uid}`,
    fetcher: async () => {
      const res = await maintenanceApi.list()
      return pickList(res)
    },
  })

  useDidShow(() => {
    loadFromStorage()
    if (!useAuthStore.getState().token) {
      Taro.redirectTo({ url: '/pages/login/index' })
      return
    }
    void refresh()
  })

  const resetForm = () => {
    setTitle('')
    setDescription('')
    setPriority('medium')
  }

  const handleSubmit = async () => {
    if (!title.trim()) {
      Taro.showToast({ title: '请填写标题', icon: 'none' })
      return
    }

    setSubmitting(true)
    Taro.showLoading({ title: '提交中...', mask: true })
    try {
      const res = await maintenanceApi.create({ title: title.trim(), description, priority })
      // 乐观更新：把新工单插到列表头部
      const created = (res as any)?.data || res
      const newTicket: MaintenanceTicket = {
        id: created?.id ?? Date.now(),
        propertyId: created?.propertyId ?? 0,
        tenantId: created?.tenantId ?? 0,
        title,
        description,
        // 回落值必须是后端建单的真实默认态 `open`（旧代码写 'submitted'，
        // 一旦接口没回 status，就会往本地塞一个后端永远不会返回的值）。
        status: created?.status ?? 'open',
        priority,
        createdAt:
          created?.createdAt ?? new Date().toISOString().split('T')[0]
      }
      setTickets([newTicket, ...tickets])
      resetForm()
      setShowForm(false)
      Taro.hideLoading()
      Taro.showToast({ title: '提交成功', icon: 'success' })
    } catch (error) {
      console.error('[Maintenance] 提交报修失败', error)
      Taro.hideLoading()
      Taro.showToast({ title: '提交失败，请重试', icon: 'none' })
    } finally {
      setSubmitting(false)
    }
  }

  const priorityIndex = PRIORITY_OPTIONS.indexOf(priority)

  const counts = {
    all: tickets.length,
    pending: tickets.filter((t) => t.status === 'open').length,
    processing: tickets.filter((t) => t.status === 'assigned' || t.status === 'in_progress').length,
    done: tickets.filter((t) => t.status === 'resolved' || t.status === 'closed').length
  }

  const visibleTickets = tickets.filter((t) => matchTab(t.status, tab))

  return (
    <View className='tenant-maintenance-page'>
      <View className='page-container'>
        <View className='stat-row'>
          <View className='stat-item'>
            <Text className='stat-label'>待处理</Text>
            <Text className='stat-value'>{counts.pending} 个</Text>
          </View>
          <View className='stat-item'>
            <Text className='stat-label'>处理中</Text>
            <Text className='stat-value'>{counts.processing} 个</Text>
          </View>
        </View>

        <ScrollView scrollX className='ticket-tabs'>
          <View className='ticket-tabs-inner'>
            {TABS.map((t) => (
              <View
                key={t.key}
                className={`ticket-tab ${tab === t.key ? 'ticket-tab--active' : ''}`}
                onClick={() => setTab(t.key)}
              >
                <Text className='ticket-tab-text'>
                  {t.label} {counts[t.key as keyof typeof counts]}
                </Text>
              </View>
            ))}
          </View>
        </ScrollView>

        <View className='section-title'>
          <Text>工单列表</Text>
        </View>

        <ScrollView scrollY className='ticket-list'>
          {loading && tickets.length === 0 && (
            <View className='empty-state'>
              <Text>加载中...</Text>
            </View>
          )}
          {!loading && visibleTickets.length === 0 && (
            <View className='empty-state'>
              <View className='empty-state__icon icon-svg' style={iconStyle('clipboard', 80)} />
              <Text>暂无报修记录</Text>
            </View>
          )}
          {visibleTickets.map((ticket) => {
            const statusInfo = STATUS_MAP[ticket.status] || STATUS_MAP.open
            const priorityLabel =
              PRIORITY_LABELS[PRIORITY_OPTIONS.indexOf(ticket.priority)] ?? '中'
            return (
              <View key={ticket.id} className='ticket-card' onClick={() => openDetail(ticket)}>
                <View className='ticket-header'>
                  <Text className='ticket-no'>#{String(ticket.id).slice(0, 8)}</Text>
                  <Text className='ticket-title'>{ticket.title}</Text>
                </View>
                <Text className='ticket-desc'>{ticket.description}</Text>
                <View className='ticket-footer'>
                  <View className='ticket-badges'>
                    <Text className={`badge ${PRIORITY_BADGE[ticket.priority] || 'badge--info'}`}>
                      {priorityLabel}
                    </Text>
                    <Text className={`badge ${STATUS_BADGE[ticket.status] || 'badge--warning'}`}>
                      {statusInfo.text}
                    </Text>
                  </View>
                  <Text className='ticket-date'>{ticket.createdAt}</Text>
                </View>
              </View>
            )
          })}
        </ScrollView>

        {showForm && (
          <View className='form-card'>
            <View className='form-item'>
              <Text className='form-label'>标题</Text>
              <Input
                className='form-input'
                type='text'
                placeholder='请输入报修标题'
                value={title}
                onInput={(e) => setTitle(e.detail.value)}
              />
            </View>

            <View className='form-item'>
              <Text className='form-label'>问题描述</Text>
              <Textarea
                className='form-textarea'
                placeholder='请详细描述问题'
                value={description}
                onInput={(e) => setDescription(e.detail.value)}
              />
            </View>

            <View className='form-item'>
              <Text className='form-label'>优先级</Text>
              <Picker
                mode='selector'
                range={PRIORITY_LABELS}
                value={priorityIndex}
                onChange={(e) =>
                  setPriority(PRIORITY_OPTIONS[Number(e.detail.value)])
                }
              >
                <View className='priority-picker'>
                  <Text className='picker-text'>
                    {PRIORITY_LABELS[priorityIndex]}
                  </Text>
                  <Text className='picker-arrow'>›</Text>
                </View>
              </Picker>
            </View>

            <Button
              className='submit-btn'
              type='primary'
              loading={submitting}
              disabled={submitting}
              onClick={handleSubmit}
            >
              提交报修
            </Button>
          </View>
        )}

        {activeTicket && (
          <View className='rate-mask' onClick={closeDetail}>
            <View className='rate-panel' onClick={(e) => e.stopPropagation()}>
              <View className='rate-panel-header'>
                <Text className='rate-panel-title'>{activeTicket.title}</Text>
                <View
                  className='rate-panel-close icon-svg'
                  style={iconStyle('close', 36)}
                  onClick={closeDetail}
                />
              </View>
              <Text className='rate-panel-status'>
                状态：{(STATUS_MAP[activeTicket.status] || STATUS_MAP.open).text}
              </Text>
              <Text className='rate-panel-desc'>{activeTicket.description}</Text>
              <Text className='rate-panel-meta'>
                优先级：
                {PRIORITY_LABELS[PRIORITY_OPTIONS.indexOf(activeTicket.priority)] ?? '中'} · 提交于{' '}
                {activeTicket.createdAt}
              </Text>

              {activeTicket.status === 'resolved' || activeTicket.status === 'closed' ? (
                <View className='rate-body'>
                  <Text className='rate-label'>服务评价</Text>
                  <View className='rate-stars'>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <View
                        key={n}
                        className='rate-star icon-svg'
                        style={iconStyle(n <= rating ? 'starFill' : 'star', 40)}
                        onClick={() => pickRating(n)}
                      />
                    ))}
                  </View>
                  <Text className='rate-label'>反馈意见（可选）</Text>
                  <Textarea
                    className='rate-textarea'
                    placeholder='请输入您的评价或建议'
                    value={feedback}
                    onInput={(e) => setFeedback(e.detail.value)}
                  />
                  <Button
                    className='rate-submit'
                    type='primary'
                    disabled={ratingSubmitting}
                    loading={ratingSubmitting}
                    onClick={submitRating}
                  >
                    提交评价
                  </Button>
                </View>
              ) : (
                <Text className='rate-tip'>工单处理完成后可进行服务评价</Text>
              )}
            </View>
          </View>
        )}
      </View>

      <View className='ticket-fab' onClick={() => setShowForm(!showForm)}>
        <Text className='ticket-fab-text'>{showForm ? '×' : '＋'}</Text>
      </View>
    </View>
  )
}
