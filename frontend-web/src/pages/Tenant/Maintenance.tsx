import { useCallback, useEffect, useMemo, useState } from 'react'
import { message } from 'antd'
import dayjs from 'dayjs'
import api from '@/lib/api'

interface MaintenanceTicket {
  id: string
  ticket_no?: string
  type: string
  title?: string
  description: string
  urgency: 'low' | 'medium' | 'high' | 'urgent'
  status: 'pending' | 'in_progress' | 'completed'
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

const typeLabelMap: Record<string, string> = {
  plumbing: '水管问题',
  electrical: '电路问题',
  aircon: '空调维修',
  appliance: '家电维修',
  door_window: '门窗维修',
  wall: '墙面问题',
  other: '其他',
}

const urgencyBarMap: Record<string, string> = {
  urgent: 'mt-ticket__bar--urgent',
  high: 'mt-ticket__bar--high',
  medium: 'mt-ticket__bar--medium',
  low: 'mt-ticket__bar--low',
}

const urgencyLabelMap: Record<string, string> = {
  low: '低',
  medium: '中',
  high: '高',
  urgent: '紧急',
}

const statusClassMap: Record<MaintenanceTicket['status'], string> = {
  pending: 'mt-ticket__status--pending',
  in_progress: 'mt-ticket__status--processing',
  completed: 'mt-ticket__status--done',
}

const statusLabelMap: Record<MaintenanceTicket['status'], string> = {
  pending: '待处理',
  in_progress: '处理中',
  completed: '已完成',
}

const statusDotColorMap: Record<MaintenanceTicket['status'], string> = {
  pending: 'var(--state-warning)',
  in_progress: 'var(--state-info)',
  completed: 'var(--state-success)',
}

const statusProgressMap: Record<MaintenanceTicket['status'], number> = {
  pending: 20,
  in_progress: 60,
  completed: 100,
}

const STATIC_TICKETS: MaintenanceTicket[] = [
  {
    id: 'MT-001',
    ticket_no: 'MT-001',
    type: 'plumbing',
    title: '厨房水管爆裂漏水',
    description: '厨房水槽下方水管突然破裂，大量漏水，已关闭总阀门，需尽快上门处理。',
    urgency: 'urgent',
    status: 'pending',
    created_at: '2026-08-03 09:30:00',
    location: '阳光花园 A座12-3',
    category: '水管管路',
    assignee: '待分配',
  },
  {
    id: 'MT-002',
    ticket_no: 'MT-002',
    type: 'aircon',
    title: '卧室空调不制冷',
    description: '主卧空调开启后只出风不制冷，已持续三天，影响正常休息，师傅已上门排查。',
    urgency: 'high',
    status: 'in_progress',
    created_at: '2026-07-30 18:00:00',
    location: '阳光花园 A座12-3',
    category: '家电维修',
    assignee: '李师傅 · 家电维修',
  },
  {
    id: 'MT-003',
    ticket_no: 'MT-003',
    type: 'door_window',
    title: '卧室门锁卡顿',
    description: '卧室门锁开关困难，钥匙转动卡顿，师傅已更换锁芯并测试开关顺畅。',
    urgency: 'medium',
    status: 'completed',
    created_at: '2026-07-20 10:00:00',
    location: '阳光花园 A座12-3',
    category: '门窗五金',
    assignee: '张师傅 · 门窗维修',
  },
  {
    id: 'MT-004',
    ticket_no: 'MT-004',
    type: 'electrical',
    title: '客厅吸顶灯更换',
    description: '客厅吸顶灯灯管损坏，已由物业维修组更换为新灯管，照明恢复正常。',
    urgency: 'low',
    status: 'completed',
    created_at: '2026-07-10 14:00:00',
    location: '阳光花园 A座12-3',
    category: '灯具电器',
    assignee: '物业维修组',
  },
]

const TenantMaintenance = () => {
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [data, setData] = useState<MaintenanceTicket[]>([])
  const [filter, setFilter] = useState<FilterKey>('all')

  // form state (replaces antd Form)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium')
  const [location, setLocation] = useState('阳光花园 A座12-3 · 客厅')
  const [photoFiles, setPhotoFiles] = useState<File[]>([])
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/maintenance-tickets')
      const payload = res.data?.data ?? res.data
      const items = payload?.items ?? []
      setData(items.length ? items : STATIC_TICKETS)
    } catch {
      setData(STATIC_TICKETS)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const counts = useMemo(() => {
    return {
      all: data.length,
      pending: data.filter((d) => d.status === 'pending').length,
      in_progress: data.filter((d) => d.status === 'in_progress').length,
      completed: data.filter((d) => d.status === 'completed').length,
    }
  }, [data])

  const filteredData = useMemo(() => {
    if (filter === 'all') return data
    return data.filter((d) => d.status === filter)
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
    setLocation('阳光花园 A座12-3 · 客厅')
    setPhotoFiles([])
    setPhotoPreviews([])
  }

  const handleSubmit = async () => {
    if (!title.trim()) {
      message.warning('请输入报修标题')
      return
    }
    if (!description.trim()) {
      message.warning('请输入问题描述')
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

      message.success('报修提交成功，工作人员将尽快处理')
      const newTicket: MaintenanceTicket = {
        id: `MT-${dayjs().format('YYYYMMDDHHmmss')}`,
        ticket_no: `MT-${dayjs().format('YYYYMMDDHHmmss')}`,
        type: 'other',
        title,
        description,
        urgency: priority,
        status: 'pending',
        created_at: dayjs().format('YYYY-MM-DD HH:mm:ss'),
        location: '阳光花园 A座12-3',
        category: '其他',
        assignee: '待分配',
        progress: [
          { time: dayjs().format('YYYY-MM-DD HH:mm:ss'), content: '工单已提交' },
        ],
      }
      setData((prev) => [newTicket, ...prev])
      resetForm()
    } catch (err: any) {
      message.error(err?.response?.data?.message || '提交失败')
    } finally {
      setSubmitting(false)
    }
  }

  const segments: { key: FilterKey; label: string; count: number }[] = [
    { key: 'all', label: '全部', count: counts.all },
    { key: 'pending', label: '待处理', count: counts.pending },
    { key: 'in_progress', label: '处理中', count: counts.in_progress },
    { key: 'completed', label: '已完成', count: counts.completed },
  ]

  const summaryItems = [
    { label: '待处理', value: counts.pending, unit: '个', color: 'var(--state-warning)' },
    { label: '处理中', value: counts.in_progress, unit: '个', color: 'var(--state-info)' },
    { label: '已完成', value: counts.completed, unit: '个', color: 'var(--state-success)' },
    { label: '平均响应', value: '4.2', unit: '小时', color: 'var(--rent-primary)' },
  ]

  return (
    <>
      {loading && (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <span className="rent-text-muted">加载中…</span>
        </div>
      )}

      {/* Hero */}
      <div className="mt-hero">
        <div>
          <h2 className="mt-hero__title">报修申请</h2>
          <p className="mt-hero__subtitle">提交维修申请，跟踪处理进度</p>
        </div>
        <button
          className="mt-hero__btn"
          onClick={() => {
            const el = document.getElementById('new-ticket-form')
            if (el) el.scrollIntoView({ behavior: 'smooth' })
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          提交报修
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
          filteredData.map((t) => {
            const idLabel = t.ticket_no || `#${(t.id || '').slice(-6)}`
            const titleLabel = t.title || t.description || '-'
            const descLabel = t.description || ''
            const barClass = urgencyBarMap[t.urgency] || 'mt-ticket__bar--medium'
            const stClass = statusClassMap[t.status]
            const stLabel = statusLabelMap[t.status]
            const stDot = statusDotColorMap[t.status]
            const uLabel = urgencyLabelMap[t.urgency] || ''
            const category = t.category || typeLabelMap[t.type] || '其他'
            const loc = t.location || '阳光花园 A座12-3'
            const assignee = t.assignee || '待分配'
            const createdDate = t.created_at ? dayjs(t.created_at).format('YYYY-MM-DD') : '-'
            const progress = statusProgressMap[t.status] ?? 0
            return (
              <div key={t.id} className="mt-ticket">
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
                  {t.status === 'in_progress' && (
                    <div className="mt-ticket__progress-wrap">
                      <div className="mt-ticket__progress-head">
                        <span className="mt-ticket__progress-label">处理进度</span>
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
                        提交于 {createdDate}
                      </span>
                      <span className="mt-ticket__meta-item">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                        {assignee}
                      </span>
                    </div>
                    <div className="mt-ticket__actions">
                      <button className="rent-btn rent-btn--secondary rent-btn--sm">查看详情</button>
                      {t.status === 'pending' && (
                        <button className="rent-btn rent-btn--ghost rent-btn--sm">取消申请</button>
                      )}
                      {t.status === 'in_progress' && (
                        <button className="rent-btn rent-btn--ghost rent-btn--sm">联系师傅</button>
                      )}
                      {t.status === 'completed' && (
                        <button className="rent-btn rent-btn--primary rent-btn--sm">评价</button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })
        ) : (
          <div className="rent-empty">暂无报修记录</div>
        )}
      </div>

      {/* New Ticket Form */}
      <div className="mt-form-card" id="new-ticket-form">
        <div className="mt-form-card__header">
          <h3 className="mt-form-card__title">提交新报修</h3>
          <span className="rent-badge rent-badge--primary">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            新申请
          </span>
        </div>
        <div className="mt-form-card__body">
          <form className="mt-form" onSubmit={(e) => { e.preventDefault(); handleSubmit() }}>
            <div>
              <label className="mt-form__label">报修标题 <span className="req">*</span></label>
              <input
                type="text"
                className="mt-form__input"
                placeholder="请简述问题，例如：卫生间水管漏水"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div>
              <label className="mt-form__label">问题描述 <span className="req">*</span></label>
              <textarea
                rows={4}
                className="mt-form__textarea"
                placeholder="请详细描述问题发生的时间、位置和具体表现，便于师傅快速判断..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="mt-form__row">
              <div>
                <label className="mt-form__label">优先级</label>
                <select
                  className="mt-form__select"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as any)}
                >
                  <option value="low">低 — 不影响正常生活</option>
                  <option value="medium">中 — 影响部分使用</option>
                  <option value="high">高 — 严重影响生活</option>
                  <option value="urgent">紧急 — 存在安全隐患或需立即处理</option>
                </select>
              </div>
              <div>
                <label className="mt-form__label">报修位置</label>
                <select
                  className="mt-form__select"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                >
                  <option>阳光花园 A座12-3 · 客厅</option>
                  <option>阳光花园 A座12-3 · 主卧</option>
                  <option>阳光花园 A座12-3 · 厨房</option>
                  <option>阳光花园 A座12-3 · 卫生间</option>
                  <option>阳光花园 A座12-3 · 公共区域</option>
                </select>
              </div>
            </div>

            <div>
              <label className="mt-form__label">上传照片</label>
              <label className="mt-form__upload">
                <div className="mt-form__upload-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                </div>
                <span className="mt-form__upload-text">点击上传或拖拽图片到此处</span>
                <span className="mt-form__upload-hint">支持 JPG / PNG，单张不超过 5MB，最多 6 张</span>
                <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handlePhotoChange} />
              </label>
              {photoPreviews.length > 0 && (
                <div className="mt-form__photos">
                  {photoPreviews.map((src, i) => (
                    <img key={i} className="mt-form__photo-thumb" src={src} alt={`照片 ${i + 1}`} />
                  ))}
                </div>
              )}
            </div>

            <div className="mt-form__footer">
              <span className="mt-form__footer-hint">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                提交后物业将在 4 小时内响应并分配维修师傅
              </span>
              <div className="mt-form__footer-actions">
                <button type="button" className="rent-btn rent-btn--secondary" onClick={resetForm}>取消</button>
                <button type="submit" className="mt-submit-btn" disabled={submitting}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>
                  {submitting ? '提交中…' : '提交报修'}
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
