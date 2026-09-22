import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { message, Modal, Rate } from 'antd'
import dayjs from 'dayjs'
import { useNavigate } from 'react-router-dom'
import api from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import { useCachedQuery } from '@/lib/queryCache'

interface MaintenanceTicket {
  id: string
  ticket_no?: string
  type?: string
  title?: string
  description: string
  urgency?: 'low' | 'medium' | 'high' | 'urgent'
  priority?: string
  status: string
  created_at: string
  updated_at?: string
  photos?: string[]
  /** 展示字段由后端 /maintenance-tickets 一并返回，不再由前端猜 */
  property_label?: string
  property_address?: string
  assignee_name?: string
  assigned_to?: string
  resolved_at?: string
  resolution_notes?: string
  resolution_photos?: string[]
  cost?: number
  rating?: number
  feedback?: string
  rated_at?: string
  location?: string
  assignee?: string
  category?: string
  progress?: Array<{ time: string; content: string }>
  [key: string]: any
}

type FilterKey = 'all' | 'pending' | 'in_progress' | 'completed'
type StatusKey = Exclude<FilterKey, 'all'>

// 接口状态（open/assigned/in_progress/resolved/closed）→ 页面展示分组
const normalizeStatus = (status?: string): StatusKey => {
  const v = String(status || '').toLowerCase()
  if (v === 'in_progress') return 'in_progress'
  if (v === 'resolved' || v === 'closed' || v === 'completed') return 'completed'
  return 'pending'
}

const urgencyBarMap: Record<string, string> = {
  urgent: 'mt-ticket__bar--urgent',
  high: 'mt-ticket__bar--high',
  medium: 'mt-ticket__bar--medium',
  low: 'mt-ticket__bar--low',
}

const statusClassMap: Record<StatusKey, string> = {
  pending: 'mt-ticket__status--pending',
  in_progress: 'mt-ticket__status--processing',
  completed: 'mt-ticket__status--done',
}

const statusDotColorMap: Record<StatusKey, string> = {
  pending: 'var(--state-warning)',
  in_progress: 'var(--state-info)',
  completed: 'var(--state-success)',
}

// 进度按工单在「待受理 → 已派单 → 处理中 → 已解决」链路上的真实位置推导，
// 不再用写死的魔法百分比假装进度。
const STATUS_PROGRESS: Record<string, number> = {
  open: 25,
  assigned: 50,
  in_progress: 75,
  resolved: 100,
  closed: 100,
}
const progressOf = (status?: string) => STATUS_PROGRESS[String(status || '').toLowerCase()] ?? 25

const TenantMaintenance = () => {
  const { t } = useTranslation()

  const typeLabelMap: Record<string, string> = {
    plumbing: t('tenantMaintenance.type.plumbing'),
    electrical: t('tenantMaintenance.type.electrical'),
    aircon: t('tenantMaintenance.type.aircon'),
    appliance: t('tenantMaintenance.type.appliance'),
    door_window: t('tenantMaintenance.type.door_window'),
    wall: t('tenantMaintenance.type.wall'),
    other: t('tenantMaintenance.type.other'),
  }

  const urgencyLabelMap: Record<string, string> = {
    low: t('tenantMaintenance.priorityLow'),
    medium: t('tenantMaintenance.priorityMedium'),
    high: t('tenantMaintenance.priorityHigh'),
    urgent: t('tenantMaintenance.urgent'),
  }

  const statusLabelMap: Record<StatusKey, string> = {
    pending: t('tenantMaintenance.pending'),
    in_progress: t('tenantMaintenance.inProgress'),
    completed: t('tenantMaintenance.completed'),
  }

  // 报修位置可选房间（通用房间名，非示例数据；具体房源由真实租约数据拼接）
  const ROOM_OPTIONS = t('tenantMaintenance.roomOptions', { returnObjects: true }) as string[]

  const user = useAuthStore((s) => s.user)
  const uid = user?.id ?? 'anon'
  const navigate = useNavigate()
  const [submitting, setSubmitting] = useState(false)
  const [filter, setFilter] = useState<FilterKey>('all')

  // 当前租客的真实房源（报修必须落到具体 property_id，后端必填）
  const [propertyLabel, setPropertyLabel] = useState('')
  const [leasePropertyId, setLeasePropertyId] = useState('')

  // 工单详情 / 评价弹窗
  const [detailTicket, setDetailTicket] = useState<MaintenanceTicket | null>(null)
  const [reviewTicket, setReviewTicket] = useState<MaintenanceTicket | null>(null)
  const [reviewRating, setReviewRating] = useState(5)
  const [reviewFeedback, setReviewFeedback] = useState('')
  const [reviewSubmitting, setReviewSubmitting] = useState(false)
  /** 正在执行撤单/联系师傅的工单 id（防重复点击） */
  const [busyId, setBusyId] = useState('')

  // form state (replaces antd Form)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium')
  const [location, setLocation] = useState('')
  const [photoFiles, setPhotoFiles] = useState<File[]>([])
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([])

  const q = useCachedQuery<MaintenanceTicket[]>({
    queryKey: ['tenant-maintenance', 'mine', uid],
    cacheKey: `tenant-maintenance:mine:${uid}`,
    queryFn: async () => {
      try {
        const [res, leasesRes] = await Promise.all([
          api.get('/maintenance-tickets'),
          api.get('/leases').catch(() => ({ data: { items: [] } })),
        ])
        const payload = res.data?.data ?? res.data
        const lPayload = leasesRes.data?.data ?? leasesRes.data
        const leases: any[] = lPayload?.items ?? []
        const lease = leases.find((l) => l.status === 'active') || leases[0]
        const prop = lease?.property
        const pid = lease?.property_id || prop?.id || ''
        if (pid) setLeasePropertyId(pid)
        if (prop?.address || prop?.building || prop?.room_number || lease?.property_name) {
          setPropertyLabel(prop?.address || prop?.building || prop?.room_number || lease?.property_name)
        }
        return payload?.items ?? []
      } catch {
        return []
      }
    },
  })
  const data = q.data ?? []
  const loading = q.isPending && !q.data
  const refresh = () => {
    void q.refetch({ cancelRefetch: false })
  }

  const locationOptions = useMemo(
    () => ROOM_OPTIONS.map((room) => (propertyLabel ? `${propertyLabel} · ${room}` : room)),
    [propertyLabel, ROOM_OPTIONS],
  )

  const counts = useMemo(() => {
    return {
      all: data.length,
      pending: data.filter((d) => normalizeStatus(d.status) === 'pending').length,
      in_progress: data.filter((d) => normalizeStatus(d.status) === 'in_progress').length,
      completed: data.filter((d) => normalizeStatus(d.status) === 'completed').length,
    }
  }, [data])

  const filteredData = useMemo(() => {
    if (filter === 'all') return data
    return data.filter((d) => normalizeStatus(d.status) === filter)
  }, [data, filter])

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    setPhotoFiles((prev) => [...prev, ...files])
    setPhotoPreviews((prev) => [...prev, ...files.map((f) => URL.createObjectURL(f))])
  }

  const resetForm = () => {
    setTitle('')
    setDescription('')
    setPriority('medium')
    setLocation('')
    setPhotoFiles([])
    setPhotoPreviews([])
  }

  const handleSubmit = async () => {
    if (!title.trim()) {
      message.warning(t('tenantMaintenance.warnTitle'))
      return
    }
    if (!description.trim()) {
      message.warning(t('tenantMaintenance.warnDesc'))
      return
    }
    if (!leasePropertyId) {
      message.warning(t('tenantMaintenance.noLeaseWarn'))
      return
    }
    setSubmitting(true)
    // 后端工单表没有「房间」列，用户选的报修位置不能丢，随描述一并落库。
    const descWithLocation = location
      ? `${t('tenantMaintenance.labelLocation')}: ${location}\n${description.trim()}`
      : description.trim()
    try {
      // 工单必须真正落库：POST 失败就是失败，不再伪造本地记录骗用户「已提交」。
      await api.post('/maintenance-tickets', {
        property_id: leasePropertyId,
        title: title.trim(),
        description: descWithLocation,
        priority,
      })
      message.success(t('tenantMaintenance.submitSuccess'))
      resetForm()
      refresh()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || err?.response?.data?.message || t('tenantMaintenance.submitFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  // 查看详情：直接展示后端返回的工单实体（含房源与受理师傅）
  const openDetail = (ticket: MaintenanceTicket) => setDetailTicket(ticket)

  // 取消申请：走租客自助撤销接口（员工侧 PATCH 需 agent 权限，租客调用必 403）
  const handleCancel = (ticket: MaintenanceTicket) => {
    Modal.confirm({
      title: t('tenantMaintenance.cancelApply'),
      content: t('tenantMaintenance.cancelConfirm'),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      okButtonProps: { danger: true },
      onOk: async () => {
        setBusyId(ticket.id)
        try {
          await api.post(`/maintenance-tickets/${ticket.id}/cancel`)
          message.success(t('tenantMaintenance.cancelSuccess'))
          refresh()
        } catch (err: any) {
          message.error(err?.response?.data?.detail || t('tenantMaintenance.cancelFailed'))
        } finally {
          setBusyId('')
        }
      },
    })
  }

  // 联系师傅：后端按「员工 → 账号」解析并幂等建会话，拿到会话 id 直接进聊天页
  const handleContactWorker = async (ticket: MaintenanceTicket) => {
    setBusyId(ticket.id)
    try {
      const res = await api.post(`/maintenance-tickets/${ticket.id}/contact`)
      const conv = res.data?.data ?? res.data
      if (!conv?.id) throw new Error('contact response missing conversation id')
      navigate(`/chat?id=${conv.id}`)
    } catch (err: any) {
      message.warning(
        err?.response?.data?.detail ||
          (ticket.assigned_to ? t('tenantMaintenance.contactFailed') : t('tenantMaintenance.contactNoWorker')),
      )
    } finally {
      setBusyId('')
    }
  }

  const openReview = (ticket: MaintenanceTicket) => {
    setReviewRating(5)
    setReviewFeedback('')
    setReviewTicket(ticket)
  }

  const handleReviewSubmit = async () => {
    if (!reviewTicket) return
    setReviewSubmitting(true)
    try {
      await api.post(`/maintenance-tickets/${reviewTicket.id}/rate`, {
        rating: reviewRating,
        feedback: reviewFeedback.trim() || undefined,
      })
      message.success(t('tenantMaintenance.reviewSuccess'))
      setReviewTicket(null)
      refresh()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || t('tenantMaintenance.reviewFailed'))
    } finally {
      setReviewSubmitting(false)
    }
  }

  const segments: { key: FilterKey; label: string; count: number }[] = [
    { key: 'all', label: t('tenantMaintenance.all'), count: counts.all },
    { key: 'pending', label: t('tenantMaintenance.pending'), count: counts.pending },
    { key: 'in_progress', label: t('tenantMaintenance.inProgress'), count: counts.in_progress },
    { key: 'completed', label: t('tenantMaintenance.completed'), count: counts.completed },
  ]

  const summaryItems = [
    { label: t('tenantMaintenance.pending'), value: counts.pending, unit: t('tenantMaintenance.countUnit'), color: 'var(--state-warning)' },
    { label: t('tenantMaintenance.inProgress'), value: counts.in_progress, unit: t('tenantMaintenance.countUnit'), color: 'var(--state-info)' },
    { label: t('tenantMaintenance.completed'), value: counts.completed, unit: t('tenantMaintenance.countUnit'), color: 'var(--state-success)' },
  ]

  return (
    <>
      {loading && (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <span className="rent-text-muted">{t('tenantMaintenance.loading')}</span>
        </div>
      )}

      {/* Hero */}
      <div className="mt-hero">
        <div>
          <h2 className="mt-hero__title">{t('tenantMaintenance.submitMaintenance')}</h2>
          <p className="mt-hero__subtitle">{t('tenantMaintenance.subtitle')}</p>
        </div>
        <button
          className="mt-hero__btn"
          onClick={() => {
            const el = document.getElementById('new-ticket-form')
            if (el) el.scrollIntoView({ behavior: 'smooth' })
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          {t('tenantMaintenance.submitBtn')}
        </button>
      </div>

      {/* Status Summary Bar */}
      <div className="mt-summary">
        {summaryItems.map((s) => (
          <div key={s.label} className="mt-summary__item">
            <div className="mt-summary__label">
              <span className="mt-summary__dot" style={{ background: s.color }}></span>
              {s.label}
            </div>
            <div className="mt-summary__value">{s.value}<span className="mt-summary__unit">{s.unit}</span></div>
          </div>
        ))}
      </div>

      {/* Segment Control */}
      <div className="mt-segment">
        {segments.map((s) => (
          <button
            key={s.key}
            className="mt-segment__item"
            data-active={filter === s.key}
            onClick={() => setFilter(s.key)}
          >
            {s.label} <span className="mt-segment__count">{s.count}</span>
          </button>
        ))}
      </div>

      {/* Ticket List */}
      <div className="mt-ticket-list">
        {filteredData.length ? (
          filteredData.map((ticket) => {
            const idLabel = ticket.ticket_no || (ticket.id || '').slice(-6)
            const titleLabel = ticket.title || ticket.description || '-'
            const descLabel = ticket.description || ''
            const urgencyKey = ticket.urgency || ticket.priority || 'medium'
            const statusKey = normalizeStatus(ticket.status)
            const barClass = urgencyBarMap[urgencyKey] || 'mt-ticket__bar--medium'
            const stClass = statusClassMap[statusKey]
            const stLabel = statusLabelMap[statusKey]
            const stDot = statusDotColorMap[statusKey]
            const uLabel = urgencyLabelMap[urgencyKey] || ''
            const category = ticket.category || typeLabelMap[ticket.type || ''] || t('tenantMaintenance.categoryOther')
            // 房源/师傅一律用后端返回的本单信息，不再拿「当前租约房源」「待分配」兜底
            const loc = ticket.property_label || ticket.property_address || propertyLabel || '—'
            const assignee = ticket.assignee_name || t('tenantMaintenance.waitingAssign')
            const busy = busyId === ticket.id
            const createdDate = ticket.created_at ? dayjs(ticket.created_at).format('YYYY-MM-DD') : '-'
            const progress = progressOf(ticket.status)
            return (
              <div key={ticket.id} className="mt-ticket">
                <div className={`mt-ticket__bar ${barClass}`}></div>
                <div className="mt-ticket__body">
                  <div className="mt-ticket__top">
                    <div className="mt-ticket__head">
                      <span className="mt-ticket__id">#{idLabel}</span>
                      <h3 className="mt-ticket__title">{titleLabel}</h3>
                    </div>
                    <span className={`mt-ticket__status ${stClass}`}>
                      <span className="mt-ticket__status-dot" style={{ background: stDot }}></span>
                      {stLabel} · {uLabel}
                    </span>
                  </div>
                  <p className="mt-ticket__desc">{descLabel}</p>
                  <div className="mt-ticket__meta">
                    <span className="mt-ticket__meta-item">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                      {loc}
                    </span>
                    <span className="mt-ticket__meta-item">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
                      {category}
                    </span>
                  </div>
                  {statusKey === 'in_progress' && (
                    <div className="mt-ticket__progress-wrap">
                      <div className="mt-ticket__progress-head">
                        <span className="mt-ticket__progress-label">{t('tenantMaintenance.progress')}</span>
                        <span className="mt-ticket__progress-value">{progress}%</span>
                      </div>
                      <div className="rent-progress">
                        <div className="rent-progress__bar" style={{ width: `${progress}%`, background: 'var(--state-info)' }}></div>
                      </div>
                    </div>
                  )}
                  <div className="mt-ticket__footer">
                    <div className="mt-ticket__footer-info">
                      <span className="mt-ticket__meta-item">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                        {t('tenantMaintenance.submittedAt', { date: createdDate })}
                      </span>
                      <span className="mt-ticket__meta-item">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                        {assignee}
                      </span>
                    </div>
                    <div className="mt-ticket__actions">
                      <button
                        className="rent-btn rent-btn--secondary rent-btn--sm"
                        onClick={() => openDetail(ticket)}
                      >
                        {t('tenantMaintenance.viewDetail')}
                      </button>
                      {statusKey === 'pending' && (
                        <button
                          className="rent-btn rent-btn--ghost rent-btn--sm"
                          disabled={busy}
                          onClick={() => handleCancel(ticket)}
                        >
                          {t('tenantMaintenance.cancelApply')}
                        </button>
                      )}
                      {statusKey === 'in_progress' && (
                        <button
                          className="rent-btn rent-btn--ghost rent-btn--sm"
                          disabled={busy}
                          onClick={() => handleContactWorker(ticket)}
                        >
                          {t('tenantMaintenance.contactWorker')}
                        </button>
                      )}
                      {statusKey === 'completed' &&
                        (ticket.rating ? (
                          <span className="rent-text-sm rent-text-muted">
                            {t('tenantMaintenance.reviewDone')} · {ticket.rating}★
                          </span>
                        ) : (
                          <button
                            className="rent-btn rent-btn--primary rent-btn--sm"
                            onClick={() => openReview(ticket)}
                          >
                            {t('tenantMaintenance.review')}
                          </button>
                        ))}
                    </div>
                  </div>
                </div>
              </div>
            )
          })
        ) : (
          <div className="rent-empty">{t('tenantMaintenance.empty')}</div>
        )}
      </div>

      {/* New Ticket Form */}
      <div className="mt-form-card" id="new-ticket-form">
        <div className="mt-form-card__header">
          <h3 className="mt-form-card__title">{t('tenantMaintenance.newTicketTitle')}</h3>
          <span className="rent-badge rent-badge--primary">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            {t('tenantMaintenance.badgeNew')}
          </span>
        </div>
        <div className="mt-form-card__body">
          <form className="mt-form" onSubmit={(e) => { e.preventDefault(); handleSubmit() }}>
            <div>
              <label className="mt-form__label">{t('tenantMaintenance.labelTitle')} <span className="req">*</span></label>
              <input
                type="text"
                className="mt-form__input"
                placeholder={t('tenantMaintenance.titlePlaceholder')}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div>
              <label className="mt-form__label">{t('tenantMaintenance.labelDesc')} <span className="req">*</span></label>
              <textarea
                rows={4}
                className="mt-form__textarea"
                placeholder={t('tenantMaintenance.descPlaceholder')}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="mt-form__row">
              <div>
                <label className="mt-form__label">{t('tenantMaintenance.labelPriority')}</label>
                <select
                  className="mt-form__select"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as any)}
                >
                  <option value="low">{t('tenantMaintenance.priorityOptionLow')}</option>
                  <option value="medium">{t('tenantMaintenance.priorityOptionMedium')}</option>
                  <option value="high">{t('tenantMaintenance.priorityOptionHigh')}</option>
                  <option value="urgent">{t('tenantMaintenance.priorityOptionUrgent')}</option>
                </select>
              </div>
              <div>
                <label className="mt-form__label">{t('tenantMaintenance.labelLocation')}</label>
                <select
                  className="mt-form__select"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                >
                  <option value="">{propertyLabel || t('tenantMaintenance.locationPlaceholder')}</option>
                  {locationOptions.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="mt-form__label">{t('tenantMaintenance.labelPhoto')}</label>
              <label className="mt-form__upload">
                <div className="mt-form__upload-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                </div>
                <span className="mt-form__upload-text">{t('tenantMaintenance.uploadText')}</span>
                <span className="mt-form__upload-hint">{t('tenantMaintenance.uploadHint')}</span>
                <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handlePhotoChange} />
              </label>
              {photoPreviews.length > 0 && (
                <div className="mt-form__photos">
                  {photoPreviews.map((src, i) => (
                    <img key={i} className="mt-form__photo-thumb" src={src} alt={t('tenantMaintenance.photoAltComplete', { index: i + 1 })} />
                  ))}
                </div>
              )}
            </div>

            <div className="mt-form__footer">
              <span className="mt-form__footer-hint">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                {t('tenantMaintenance.footerHint')}
              </span>
              <div className="mt-form__footer-actions">
                <button type="button" className="rent-btn rent-btn--secondary" onClick={resetForm}>{t('tenantMaintenance.cancel')}</button>
                <button type="submit" className="mt-submit-btn" disabled={submitting}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>
                  {submitting ? t('tenantMaintenance.submitting') : t('tenantMaintenance.submitBtn')}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* 工单详情（全部字段来自后端工单实体） */}
      <Modal
        title={t('tenantMaintenance.detailTitle')}
        open={!!detailTicket}
        onCancel={() => setDetailTicket(null)}
        footer={
          <button
            type="button"
            className="rent-btn rent-btn--secondary"
            onClick={() => setDetailTicket(null)}
          >
            {t('tenantMaintenance.detailClose')}
          </button>
        }
      >
        {detailTicket && (
          <div className="mt-detail">
            <h3 className="mt-detail__title">{detailTicket.title || detailTicket.description}</h3>
            <div className="mt-detail__rows">
              <div className="mt-detail__row">
                <span className="mt-detail__label">{t('tenantMaintenance.detailNo')}</span>
                <span className="mt-detail__value">
                  #{detailTicket.ticket_no || (detailTicket.id || '').slice(-6)}
                </span>
              </div>
              <div className="mt-detail__row">
                <span className="mt-detail__label">{t('common.status')}</span>
                <span className="mt-detail__value">
                  {statusLabelMap[normalizeStatus(detailTicket.status)]} ·{' '}
                  {urgencyLabelMap[detailTicket.urgency || detailTicket.priority || 'medium'] || ''}
                </span>
              </div>
              <div className="mt-detail__row">
                <span className="mt-detail__label">{t('tenantMaintenance.detailProperty')}</span>
                <span className="mt-detail__value">
                  {detailTicket.property_label || detailTicket.property_address || propertyLabel || '—'}
                </span>
              </div>
              <div className="mt-detail__row">
                <span className="mt-detail__label">{t('tenantMaintenance.detailWorker')}</span>
                <span className="mt-detail__value">
                  {detailTicket.assignee_name || t('tenantMaintenance.waitingAssign')}
                </span>
              </div>
              <div className="mt-detail__row">
                <span className="mt-detail__label">{t('tenantMaintenance.detailCreated')}</span>
                <span className="mt-detail__value">
                  {detailTicket.created_at ? dayjs(detailTicket.created_at).format('YYYY-MM-DD HH:mm') : '—'}
                </span>
              </div>
              {detailTicket.updated_at && (
                <div className="mt-detail__row">
                  <span className="mt-detail__label">{t('tenantMaintenance.detailUpdated')}</span>
                  <span className="mt-detail__value">
                    {dayjs(detailTicket.updated_at).format('YYYY-MM-DD HH:mm')}
                  </span>
                </div>
              )}
              {detailTicket.resolved_at && (
                <div className="mt-detail__row">
                  <span className="mt-detail__label">{t('tenantMaintenance.detailResolved')}</span>
                  <span className="mt-detail__value">
                    {dayjs(detailTicket.resolved_at).format('YYYY-MM-DD HH:mm')}
                  </span>
                </div>
              )}
              {!!detailTicket.cost && (
                <div className="mt-detail__row">
                  <span className="mt-detail__label">{t('tenantMaintenance.detailCost')}</span>
                  <span className="mt-detail__value">฿{Number(detailTicket.cost).toLocaleString()}</span>
                </div>
              )}
              {detailTicket.rating && (
                <div className="mt-detail__row">
                  <span className="mt-detail__label">{t('tenantMaintenance.detailRating')}</span>
                  <span className="mt-detail__value">
                    <Rate disabled value={detailTicket.rating} style={{ fontSize: 14 }} />
                  </span>
                </div>
              )}
              {detailTicket.feedback && (
                <div className="mt-detail__row">
                  <span className="mt-detail__label">{t('tenantMaintenance.detailFeedback')}</span>
                  <span className="mt-detail__value">{detailTicket.feedback}</span>
                </div>
              )}
              {detailTicket.resolution_notes && (
                <div className="mt-detail__row">
                  <span className="mt-detail__label">{t('tenantMaintenance.detailResult')}</span>
                  <span className="mt-detail__value">{detailTicket.resolution_notes}</span>
                </div>
              )}
            </div>
            <div className="mt-detail__block">
              <span className="mt-detail__label">{t('tenantMaintenance.labelDesc')}</span>
              <p className="mt-detail__desc">{detailTicket.description}</p>
            </div>
            {!!detailTicket.photos?.length && (
              <div className="mt-detail__block">
                <span className="mt-detail__label">{t('tenantMaintenance.detailPhotos')}</span>
                <div className="mt-form__photos">
                  {detailTicket.photos.map((src, i) => (
                    <img
                      key={i}
                      className="mt-form__photo-thumb"
                      src={typeof src === 'string' ? src : (src as any)?.url}
                      alt={t('tenantMaintenance.photoAltComplete', { index: i + 1 })}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* 服务评价 */}
      <Modal
        title={t('tenantMaintenance.reviewTitle')}
        open={!!reviewTicket}
        onCancel={() => setReviewTicket(null)}
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="rent-btn rent-btn--secondary"
              onClick={() => setReviewTicket(null)}
            >
              {t('tenantMaintenance.cancel')}
            </button>
            <button
              type="button"
              className="rent-btn rent-btn--primary"
              disabled={reviewSubmitting}
              onClick={handleReviewSubmit}
            >
              {reviewSubmitting ? t('tenantMaintenance.submitting') : t('tenantMaintenance.reviewSubmit')}
            </button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 8 }}>
          <div>
            <div className="mt-detail__label" style={{ marginBottom: 8 }}>
              {t('tenantMaintenance.reviewRating')}
            </div>
            <Rate value={reviewRating} onChange={setReviewRating} />
          </div>
          <div>
            <div className="mt-detail__label" style={{ marginBottom: 8 }}>
              {t('tenantMaintenance.reviewFeedback')}
            </div>
            <textarea
              rows={3}
              className="mt-form__textarea"
              placeholder={t('tenantMaintenance.reviewFeedbackPlaceholder')}
              value={reviewFeedback}
              onChange={(e) => setReviewFeedback(e.target.value)}
            />
          </div>
        </div>
      </Modal>
    </>
  )
}

export default TenantMaintenance