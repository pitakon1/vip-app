import { useCallback, useEffect, useRef, useState } from 'react'
import { message } from 'antd'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import DataState from '@/components/DataState'
import { errorText } from '@/lib/errorText'
import { propertyBindingsApi } from '@/services/api'

/**
 * C 端「添加我的房产」（/tenant/property-binding）
 *
 * 产品模型：C 端只有一种用户，有的名下有房产、有的只是租房。
 * 因此任何登录用户都能看到入口并提交绑定申请——只有后台审核通过后，
 * 才会建立用户与房源的关联，「我的房产 / 收益 / 委托」才有数据。
 * 附件走受保护上传接口，不做公开托管。
 */
interface BindingAttachment {
  name: string
  url: string
  size?: number | null
  content_type?: string | null
}

interface PropertyBinding {
  id: string
  kind?: 'claim' | 'new' | null
  status: 'pending' | 'approved' | 'rejected'
  address: string
  room_number: string
  size_sqm?: number | null
  property_type?: string | null
  note?: string | null
  attachments: BindingAttachment[]
  matched_property_id?: string | null
  reject_reason?: string | null
  review_note?: string | null
  reviewed_at?: string | null
  created_at?: string | null
}

// 提交前匹配到的系统内已有房源：选中即走「认领」，不选则按「新建房源」提交
interface MatchCandidate {
  property_id: string
  address: string
  room_number: string
  building?: string | null
  floor?: number | null
  size_sqm?: number | null
  property_type?: string | null
  status?: string | null
  score: number
}

const STATUS_BADGE: Record<string, string> = {
  pending: 'rent-badge--warning',
  approved: 'rent-badge--success',
  rejected: 'rent-badge--error',
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'propertyBinding.stPending',
  approved: 'propertyBinding.stApproved',
  rejected: 'propertyBinding.stRejected',
}

const PROPERTY_TYPES = ['apartment', 'house', 'condo', 'villa', 'office', 'shop']

const MAX_SIZE = 20 * 1024 * 1024
const ALLOWED_EXT = ['.pdf', '.jpg', '.jpeg', '.png', '.webp']

const TenantPropertyBinding = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const [items, setItems] = useState<PropertyBinding[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [address, setAddress] = useState('')
  const [roomNumber, setRoomNumber] = useState('')
  const [sizeSqm, setSizeSqm] = useState('')
  const [propertyType, setPropertyType] = useState('apartment')
  const [note, setNote] = useState('')
  const [attachments, setAttachments] = useState<BindingAttachment[]>([])
  const [matches, setMatches] = useState<MatchCandidate[]>([])
  const [matching, setMatching] = useState(false)
  const [matchSearched, setMatchSearched] = useState(false)
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLDivElement>(null)

  const fetchMine = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await propertyBindingsApi.mine()
      const payload = res.data?.data ?? res.data
      setItems(Array.isArray(payload) ? payload : [])
    } catch (err) {
      setLoadError(errorText(err, t('common.loadFailed')))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { void fetchMine() }, [fetchMine])

  const pending = items.find((i) => i.status === 'pending')
  const approved = items.find((i) => i.status === 'approved')

  const resetForm = () => {
    setAddress('')
    setRoomNumber('')
    setSizeSqm('')
    setPropertyType('apartment')
    setNote('')
    setAttachments([])
    setMatches([])
    setMatchSearched(false)
    setSelectedPropertyId(null)
  }

  // 驳回后重新提交：把原申请内容回填到表单，用户改材料后再次提交
  const prefillFrom = (b: PropertyBinding) => {
    setAddress(b.address || '')
    setRoomNumber(b.room_number || '')
    setSizeSqm(b.size_sqm != null ? String(b.size_sqm) : '')
    setPropertyType(b.property_type || 'apartment')
    setNote(b.note || '')
    setAttachments(b.attachments || [])
    // 认领类申请保留原目标；新建类保持未选中
    setSelectedPropertyId(b.kind === 'claim' ? b.matched_property_id || null : null)
    setMatches([])
    setMatchSearched(b.kind === 'claim')
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const runMatch = async () => {
    if (!address.trim() || !roomNumber.trim()) {
      message.warning(t('propertyBinding.warnMatchFields'))
      return
    }
    setMatching(true)
    try {
      const res = await propertyBindingsApi.match({
        address: address.trim(),
        room_number: roomNumber.trim(),
      })
      const payload = res.data?.data ?? res.data
      const list: MatchCandidate[] = Array.isArray(payload?.items) ? payload.items : []
      setMatches(list)
      setMatchSearched(true)
      // 命中多个时不替用户决定：默认不选中，由用户自己选
      setSelectedPropertyId(null)
    } catch (err) {
      message.error(errorText(err, t('propertyBinding.errMatch')))
    } finally {
      setMatching(false)
    }
  }

  // 地址 / 房号一变，之前的匹配结果就失效，必须重新匹配后选择
  const changeAddress = (v: string) => {
    setAddress(v)
    setMatches([])
    setMatchSearched(false)
    setSelectedPropertyId(null)
  }

  const changeRoom = (v: string) => {
    setRoomNumber(v)
    setMatches([])
    setMatchSearched(false)
    setSelectedPropertyId(null)
  }

  const handlePickFiles = () => {
    if (uploading) return
    fileRef.current?.click()
  }

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return
    for (const file of files) {
      const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
      if (!ALLOWED_EXT.includes(ext)) {
        message.warning(t('propertyBinding.errFileType'))
        return
      }
      if (file.size > MAX_SIZE) {
        message.warning(t('propertyBinding.errFileSize'))
        return
      }
    }
    setUploading(true)
    try {
      const uploaded: BindingAttachment[] = []
      for (const file of files) {
        const res = await propertyBindingsApi.uploadAttachment(file)
        const payload = res.data?.data ?? res.data
        if (!payload?.url) throw new Error('upload failed')
        uploaded.push({
          name: payload.name || file.name,
          url: payload.url,
          size: payload.size ?? file.size,
          content_type: payload.content_type || file.type || null,
        })
      }
      setAttachments((prev) => [...prev, ...uploaded])
    } catch (err) {
      message.error(errorText(err, t('propertyBinding.errUpload')))
    } finally {
      setUploading(false)
    }
  }

  const removeAttachment = (url: string) => {
    setAttachments((prev) => prev.filter((a) => a.url !== url))
  }

  const handleSubmit = async () => {
    if (!address.trim()) {
      message.warning(t('propertyBinding.warnAddress'))
      return
    }
    if (!roomNumber.trim()) {
      message.warning(t('propertyBinding.warnRoom'))
      return
    }
    if (!attachments.length) {
      message.warning(t('propertyBinding.warnAttachments'))
      return
    }
    setSubmitting(true)
    try {
      await propertyBindingsApi.create({
        // 选中匹配房源 → 认领；未选中 → 新建待审房源
        kind: selectedPropertyId ? 'claim' : 'new',
        property_id: selectedPropertyId || undefined,
        address: address.trim(),
        room_number: roomNumber.trim(),
        size_sqm: sizeSqm.trim() ? Number(sizeSqm) : undefined,
        property_type: propertyType,
        note: note.trim() || undefined,
        attachments,
      })
      message.success(t('propertyBinding.submitOk'))
      resetForm()
      await fetchMine()
    } catch (err) {
      message.error(errorText(err, t('propertyBinding.errSubmit')))
    } finally {
      setSubmitting(false)
    }
  }

  const fmtSize = (n?: number | null) => {
    if (!n) return ''
    if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
    return `${(n / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="rent-main">
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title">{t('propertyBinding.title')}</h2>
          <p className="rent-page-header__subtitle">{t('propertyBinding.subtitle')}</p>
        </div>
      </div>

      {/* 已通过：直达「我的房产」，让入口闭环 */}
      {approved && (
        <div className="rent-card" style={{ marginBottom: 20 }}>
          <div className="rent-card__body rent-flex rent-flex--between" style={{ alignItems: 'center' }}>
            <span className="rent-text-sm">
              {t('propertyBinding.approvedHint', { address: `${approved.address} ${approved.room_number}` })}
            </span>
            <button type="button" className="rent-btn rent-btn--primary rent-btn--sm" onClick={() => navigate('/tenant/my-properties')}>
              {t('propertyBinding.viewMyProperties')}
            </button>
          </div>
        </div>
      )}

      <div ref={formRef} className="rent-card" style={{ marginBottom: 20 }}>
        <div className="rent-card__header">
          <h3 className="rent-card__title">{t('propertyBinding.formTitle')}</h3>
        </div>
        <div className="rent-card__body">
          {pending ? (
            <div className="rent-empty rent-state rent-state--empty">
              <div className="rent-state__title">{t('propertyBinding.pendingTitle')}</div>
              <div className="rent-state__sub">{t('propertyBinding.pendingSub')}</div>
            </div>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); void handleSubmit() }}>
              <div className="rent-text-sm rent-text-muted" style={{ marginBottom: 12 }}>
                {t('propertyBinding.reviewNotice')}
              </div>
              <div className="rent-form-group">
                <label className="rent-form-label" htmlFor="pb-address">
                  {t('propertyBinding.fieldAddress')} *
                </label>
                <input
                  id="pb-address"
                  className="rent-form-input"
                  value={address}
                  placeholder={t('propertyBinding.phAddress')}
                  onChange={(e) => changeAddress(e.target.value)}
                />
              </div>

              <div className="rent-form-group">
                <label className="rent-form-label" htmlFor="pb-room">
                  {t('propertyBinding.fieldRoom')} *
                </label>
                <input
                  id="pb-room"
                  className="rent-form-input"
                  value={roomNumber}
                  placeholder={t('propertyBinding.phRoom')}
                  onChange={(e) => changeRoom(e.target.value)}
                />
              </div>

              {/* 审核准入：先匹配系统内已有房源，命中即认领，未命中才新建 */}
              <div className="rent-form-group">
                <label className="rent-form-label">{t('propertyBinding.matchLabel')}</label>
                <div className="rent-flex rent-gap-2" style={{ alignItems: 'center' }}>
                  <button
                    type="button"
                    className="rent-btn rent-btn--secondary rent-btn--sm"
                    disabled={matching}
                    onClick={() => { void runMatch() }}
                  >
                    {matching ? t('propertyBinding.matching') : t('propertyBinding.matchBtn')}
                  </button>
                  <span className="rent-text-sm rent-text-muted">{t('propertyBinding.matchHint')}</span>
                </div>
                {matchSearched && matches.length === 0 && (
                  <div className="rent-text-sm rent-text-muted" style={{ marginTop: 8 }}>
                    {t('propertyBinding.matchNone')}
                  </div>
                )}
                {matches.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div className="rent-text-sm rent-text-muted" style={{ marginBottom: 6 }}>
                      {t('propertyBinding.matchFound', { n: matches.length })}
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none' }}>
                      {matches.map((m) => (
                        <li key={m.property_id} style={{ marginBottom: 6 }}>
                          <label className="rent-text-sm" style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                            <input
                              type="radio"
                              name="pb-match"
                              checked={selectedPropertyId === m.property_id}
                              onChange={() => setSelectedPropertyId(m.property_id)}
                              style={{ marginTop: 3 }}
                            />
                            <span>
                              <span className="rent-text-bold">{m.address} · {m.room_number}</span>
                              {m.size_sqm ? <span className="rent-text-muted"> · {m.size_sqm} m²</span> : null}
                              {m.property_type ? <span className="rent-text-muted"> · {t(`propertyBinding.type.${m.property_type}`, m.property_type)}</span> : null}
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                    {selectedPropertyId ? (
                      <div className="rent-text-sm" style={{ marginTop: 6, color: 'var(--state-warning, #b45309)' }}>
                        {t('propertyBinding.claimSelected')}
                      </div>
                    ) : (
                      <div className="rent-text-sm rent-text-muted" style={{ marginTop: 6 }}>
                        {t('propertyBinding.claimPickHint')}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="rent-flex rent-gap-3">
                <div className="rent-form-group" style={{ flex: 1 }}>
                  <label className="rent-form-label" htmlFor="pb-size">{t('propertyBinding.fieldSize')}</label>
                  <input
                    id="pb-size"
                    type="number"
                    min={0}
                    step={0.1}
                    className="rent-form-input"
                    value={sizeSqm}
                    placeholder={t('propertyBinding.phSize')}
                    onChange={(e) => setSizeSqm(e.target.value)}
                  />
                </div>
                <div className="rent-form-group" style={{ flex: 1 }}>
                  <label className="rent-form-label" htmlFor="pb-type">{t('propertyBinding.fieldType')}</label>
                  <select
                    id="pb-type"
                    className="rent-form-select"
                    value={propertyType}
                    onChange={(e) => setPropertyType(e.target.value)}
                  >
                    {PROPERTY_TYPES.map((p) => (
                      <option key={p} value={p}>{t(`propertyBinding.type.${p}`)}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="rent-form-group">
                <label className="rent-form-label" htmlFor="pb-note">{t('propertyBinding.fieldNote')}</label>
                <textarea
                  id="pb-note"
                  rows={3}
                  className="rent-form-textarea"
                  value={note}
                  placeholder={t('propertyBinding.phNote')}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>

              <div className="rent-form-group">
                <label className="rent-form-label">{t('propertyBinding.fieldAttachments')} *</label>
                <div className="rent-text-sm rent-text-muted" style={{ marginBottom: 8 }}>
                  {t('propertyBinding.attachmentsHint')}
                </div>
                <button
                  type="button"
                  className="rent-btn rent-btn--secondary rent-btn--sm"
                  disabled={uploading}
                  onClick={handlePickFiles}
                >
                  {uploading ? t('propertyBinding.uploading') : t('propertyBinding.uploadBtn')}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  multiple
                  hidden
                  onChange={(e) => { void handleFiles(e) }}
                />
                {attachments.length > 0 && (
                  <ul style={{ margin: '12px 0 0', paddingLeft: 18 }}>
                    {attachments.map((a) => (
                      <li key={a.url} style={{ marginBottom: 6 }}>
                        <span className="rent-text-sm">{a.name}</span>
                        <span className="rent-text-sm rent-text-muted" style={{ marginLeft: 8 }}>{fmtSize(a.size)}</span>
                        <button
                          type="button"
                          className="rent-btn rent-btn--ghost rent-btn--sm"
                          style={{ marginLeft: 8 }}
                          onClick={() => removeAttachment(a.url)}
                        >
                          {t('propertyBinding.removeFile')}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rent-flex rent-gap-2" style={{ justifyContent: 'flex-end' }}>
                <button type="button" className="rent-btn rent-btn--secondary" onClick={resetForm} disabled={submitting}>
                  {t('common.cancel')}
                </button>
                <button type="submit" className="rent-btn rent-btn--primary" disabled={submitting || uploading}>
                  {submitting ? t('propertyBinding.submitting') : t('propertyBinding.submit')}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      <div className="rent-card">
        <div className="rent-card__header">
          <h3 className="rent-card__title">{t('propertyBinding.myApps')}</h3>
        </div>
        <div className="rent-card__body">
          {loading ? (
            <DataState loading loadingText={t('common.loading')} skeletonRows={2} />
          ) : loadError ? (
            <DataState error={loadError} retryText={t('common.retry')} onRetry={() => { void fetchMine() }} />
          ) : items.length === 0 ? (
            <DataState empty emptyTitle={t('propertyBinding.emptyApps')} emptySub={t('propertyBinding.emptyAppsSub')} />
          ) : (
            <div className="rent-table-wrap">
              <table className="rent-table">
                <thead>
                  <tr>
                    <th>{t('propertyBinding.fieldAddress')}</th>
                    <th>{t('propertyBinding.fieldRoom')}</th>
                    <th>{t('propertyBinding.thKind')}</th>
                    <th>{t('propertyBinding.thSubmittedAt')}</th>
                    <th>{t('common.status')}</th>
                    <th>{t('common.action')}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((b) => (
                    <tr key={b.id}>
                      <td>{b.address}</td>
                      <td>{b.room_number}</td>
                      <td>
                        <span className="rent-badge rent-badge--neutral">
                          {b.kind === 'claim'
                            ? t('propertyBinding.kindClaim')
                            : t('propertyBinding.kindNew')}
                        </span>
                      </td>
                      <td className="rent-mono">{b.created_at ? b.created_at.slice(0, 10) : '—'}</td>
                      <td>
                        <span className={`rent-badge ${STATUS_BADGE[b.status] || 'rent-badge--neutral'}`}>
                          {STATUS_LABEL[b.status] ? t(STATUS_LABEL[b.status]) : b.status}
                        </span>
                        {b.status === 'rejected' && b.reject_reason && (
                          <div className="rent-text-sm" style={{ color: 'var(--state-error)' }}>{b.reject_reason}</div>
                        )}
                      </td>
                      <td>
                        {b.status === 'rejected' && (
                          <button
                            type="button"
                            className="rent-btn rent-btn--secondary rent-btn--sm"
                            onClick={() => prefillFrom(b)}
                          >
                            {t('propertyBinding.resubmit')}
                          </button>
                        )}
                        {b.status === 'approved' && (
                          <button
                            type="button"
                            className="rent-btn rent-btn--ghost rent-btn--sm"
                            onClick={() => navigate('/tenant/my-properties')}
                          >
                            {t('propertyBinding.viewMyProperties')}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default TenantPropertyBinding
