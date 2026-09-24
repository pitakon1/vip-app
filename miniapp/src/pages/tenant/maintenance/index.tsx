import { useState } from 'react'
import { View, Text, Input, Textarea, Button, ScrollView, Picker } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { maintenanceApi, leasesApi } from '@/services/api'
import { useSwrCache } from '@/hooks/useSwrCache'
import { iconStyle } from '@/utils/icons'
import type { MaintenanceTicket, MaintenanceStatus, MaintenancePriority } from '@/types'
import './index.scss'
import { useI18n } from '@/i18n'

// 键名与后端 TicketStatus 对齐（open/assigned/in_progress/resolved/closed）。
// 展示文案保持业务语义：后端 open=已提交待受理 →「待处理」，assigned=已派单 →「已受理」。
const buildStatusMap = (
  t: (k: string, p?: Record<string, string | number>) => string
): Record<MaintenanceStatus, { text: string; color: string }> => ({
  open: { text: t('maint.stOpen'), color: 'var(--warning)' },
  assigned: { text: t('maint.stAccepted'), color: 'var(--info)' },
  in_progress: { text: t('maint.stInProgress'), color: 'var(--primary)' },
  resolved: { text: t('maint.stResolved'), color: 'var(--success)' },
  closed: { text: t('maint.stClosed'), color: 'var(--ink-3)' }
})

const PRIORITY_OPTIONS: MaintenancePriority[] = ['low', 'medium', 'high', 'urgent']
const buildPriorityLabels = (
  t: (k: string, p?: Record<string, string | number>) => string
): string[] => [t('maint.priorityLow'), t('maint.priorityMedium'), t('maint.priorityHigh'), t('maint.priorityUrgent')]

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

const buildTabs = (
  t: (k: string, p?: Record<string, string | number>) => string
): Array<{ key: string; label: string }> => [
  { key: 'all', label: t('common.all') },
  { key: 'pending', label: t('maint.stOpen') },
  { key: 'processing', label: t('maint.stInProgress') },
  { key: 'done', label: t('maint.stResolved') }
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
  const { t } = useI18n()
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)
  const uid = useAuthStore((state) => state.user?.id) ?? 'anon'
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<MaintenancePriority>('medium')
  const [tab, setTab] = useState('all')
  const STATUS_MAP = buildStatusMap(t)
  const PRIORITY_LABELS = buildPriorityLabels(t)
  const TABS = buildTabs(t)

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
      Taro.showToast({ title: t('maint.ratingRequired'), icon: 'none' })
      return
    }
    setRatingSubmitting(true)
    Taro.showLoading({ title: t('common.submitting'), mask: true })
    try {
      await maintenanceApi.rate(String(activeTicket.id), {
        rating,
        feedback: feedback.trim() || undefined
      })
      Taro.hideLoading()
      Taro.showToast({ title: t('maint.ratingSubmitted'), icon: 'success' })
      setActiveTicket(null)
    } catch (error) {
      console.error('[Maintenance] 提交评价失败', error)
      Taro.hideLoading()
      Taro.showToast({ title: t('common.submitFailedRetry'), icon: 'none' })
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

  // 报修要落到具体房源（后端 property_id 必填）：取生效中的租约
  const [activeLease, setActiveLease] = useState<{ property_id?: string } | null>(null)

  useDidShow(() => {
    loadFromStorage()
    if (!useAuthStore.getState().token) {
      Taro.redirectTo({ url: '/pages/login/index' })
      return
    }
    void refresh()
    leasesApi
      .mine()
      .then((res: any) => {
        const d = res?.data
        const list: any[] = Array.isArray(d) ? d : d?.items ?? []
        setActiveLease(list.find((l) => l?.status === 'active') ?? null)
      })
      .catch(() => setActiveLease(null))
  })

  const resetForm = () => {
    setTitle('')
    setDescription('')
    setPriority('medium')
  }

  const handleSubmit = async () => {
    if (!title.trim()) {
      Taro.showToast({ title: t('maint.titleRequired'), icon: 'none' })
      return
    }
    if (!activeLease?.property_id) {
      Taro.showToast({ title: t('maint.noActiveLease'), icon: 'none' })
      return
    }

    setSubmitting(true)
    Taro.showLoading({ title: t('common.submitting'), mask: true })
    try {
      const res = await maintenanceApi.create({
        property_id: activeLease.property_id,
        title: title.trim(),
        description,
        priority
      })
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
      Taro.showToast({ title: t('common.submitSuccess'), icon: 'success' })
    } catch (error) {
      console.error('[Maintenance] 提交报修失败', error)
      Taro.hideLoading()
      Taro.showToast({ title: t('common.submitFailedRetry'), icon: 'none' })
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
            <Text className='stat-label'>{t('maint.stOpen')}</Text>
            <Text className='stat-value'>{t('common.countGe', { n: counts.pending })}</Text>
          </View>
          <View className='stat-item'>
            <Text className='stat-label'>{t('maint.stInProgress')}</Text>
            <Text className='stat-value'>{t('common.countGe', { n: counts.processing })}</Text>
          </View>
        </View>

        <ScrollView scrollX className='ticket-tabs'>
          <View className='ticket-tabs-inner'>
            {TABS.map((tabItem) => (
              <View
                key={tabItem.key}
                className={`ticket-tab ${tab === tabItem.key ? 'ticket-tab--active' : ''}`}
                onClick={() => setTab(tabItem.key)}
              >
                <Text className='ticket-tab-text'>
                  {tabItem.label} {counts[tabItem.key as keyof typeof counts]}
                </Text>
              </View>
            ))}
          </View>
        </ScrollView>

        <View className='section-title'>
          <Text>{t('maint.listTitle')}</Text>
        </View>

        <ScrollView scrollY className='ticket-list'>
          {loading && tickets.length === 0 && (
            <View className='empty-state'>
              <Text>{t('common.loading')}</Text>
            </View>
          )}
          {!loading && visibleTickets.length === 0 && (
            <View className='empty-state'>
              <View className='empty-state__icon icon-svg' style={iconStyle('clipboard', 80)} />
              <Text>{t('maint.emptyRecords')}</Text>
            </View>
          )}
          {visibleTickets.map((ticket) => {
            const statusInfo = STATUS_MAP[ticket.status] || STATUS_MAP.open
            const priorityLabel =
              PRIORITY_LABELS[PRIORITY_OPTIONS.indexOf(ticket.priority)] ?? t('maint.priorityMedium')
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
              <Text className='form-label'>{t('maint.formTitle')}</Text>
              <Input
                className='form-input'
                type='text'
                placeholder={t('maint.titlePlaceholder')}
                value={title}
                onInput={(e) => setTitle(e.detail.value)}
              />
            </View>

            <View className='form-item'>
              <Text className='form-label'>{t('maint.formDesc')}</Text>
              <Textarea
                className='form-textarea'
                placeholder={t('maint.descPlaceholder')}
                value={description}
                onInput={(e) => setDescription(e.detail.value)}
              />
            </View>

            <View className='form-item'>
              <Text className='form-label'>{t('maint.formPriority')}</Text>
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
              {t('maint.submitRepair')}
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
                {t('maint.statusPrefix')}{(STATUS_MAP[activeTicket.status] || STATUS_MAP.open).text}
              </Text>
              <Text className='rate-panel-desc'>{activeTicket.description}</Text>
              <Text className='rate-panel-meta'>
                {t('maint.priorityPrefix')}
                {PRIORITY_LABELS[PRIORITY_OPTIONS.indexOf(activeTicket.priority)] ?? t('maint.priorityMedium')} · {t('maint.submittedAt')}{' '}
                {activeTicket.createdAt}
              </Text>

              {activeTicket.status === 'resolved' || activeTicket.status === 'closed' ? (
                <View className='rate-body'>
                  <Text className='rate-label'>{t('maint.rateLabel')}</Text>
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
                  <Text className='rate-label'>{t('maint.feedbackLabel')}</Text>
                  <Textarea
                    className='rate-textarea'
                    placeholder={t('maint.feedbackPlaceholder')}
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
                    {t('maint.submitRating')}
                  </Button>
                </View>
              ) : (
                <Text className='rate-tip'>{t('maint.rateTip')}</Text>
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
