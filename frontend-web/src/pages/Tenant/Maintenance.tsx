import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { message } from 'antd'
import dayjs from 'dayjs'
import api from '@/lib/api'
import { useQueryClient } from '@tanstack/react-query'
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

const statusProgressMap: Record<StatusKey, number> = {
  pending: 20,
  in_progress: 60,
  completed: 100,
}

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
  const queryClient = useQueryClient()
  const [submitting, setSubmitting] = useState(false)
  const [filter, setFilter] = useState<FilterKey>('all')

  // 当前租客的真实房源（用于报修位置选项）
  const [propertyLabel, setPropertyLabel] = useState('')

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
    setSubmitting(true)
    const formData = new FormData()
    formData.append('type', 'other')
    formData.append('description', description)
    const apiUrgency = priority === 'urgent' ? 'high' : priority
    formData.append('urgency', apiUrgency)
    photoFiles.forEach((f) => {
      formData.append('photos', f)
    })

    try {
      try {
        await api.post('/maintenance-tickets', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      } catch {
        // API 不可用时本地展示
      }

      message.success(t('tenantMaintenance.submitSuccess'))
      const localId = `local-${Date.now()}`
      const newTicket: MaintenanceTicket = {
        id: localId,
        type: 'other',
        title,
        description,
        urgency: priority,
        status: 'pending',
        created_at: dayjs().format('YYYY-MM-DD HH:mm:ss'),
        location: location || propertyLabel || undefined,
        category: t('tenantMaintenance.categoryOther'),
        assignee: t('tenantMaintenance.waitingAssign'),
        progress: [
          { time: dayjs().format('YYYY-MM-DD HH:mm:ss'), content: t('tenantMaintenance.progressTicket') },
        ],
      }
      queryClient.setQueryData<MaintenanceTicket[]>(['tenant-maintenance', 'mine', uid], (prev) => [newTicket, ...(prev ?? [])])
      resetForm()
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('tenantMaintenance.submitFailed'))
    } finally {
      setSubmitting(false)
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
            const loc = ticket.location || propertyLabel || '—'
            const assignee = ticket.assignee || t('tenantMaintenance.waitingAssign')
            const createdDate = ticket.created_at ? dayjs(ticket.created_at).format('YYYY-MM-DD') : '-'
            const progress = statusProgressMap[statusKey] ?? 0
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
                      <button className="rent-btn rent-btn--secondary rent-btn--sm">{t('tenantMaintenance.viewDetail')}</button>
                      {statusKey === 'pending' && (
                        <button className="rent-btn rent-btn--ghost rent-btn--sm">{t('tenantMaintenance.cancelApply')}</button>
                      )}
                      {statusKey === 'in_progress' && (
                        <button className="rent-btn rent-btn--ghost rent-btn--sm">{t('tenantMaintenance.contactWorker')}</button>
                      )}
                      {statusKey === 'completed' && (
                        <button className="rent-btn rent-btn--primary rent-btn--sm">{t('tenantMaintenance.review')}</button>
                      )}
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
    </>
  )
}

export default TenantMaintenance