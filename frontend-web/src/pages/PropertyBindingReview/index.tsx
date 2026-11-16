import { LIST_PAGE_SIZE } from '@/lib/pagination'
import { useCallback, useEffect, useState } from 'react'
import { Input, Modal, message } from 'antd'
import { useTranslation } from 'react-i18next'
import DataState from '@/components/DataState'
import { errorText } from '@/lib/errorText'
import { propertyBindingsApi } from '@/services/api'

/**
 * 房产绑定审核（后台）：C 端提交的「添加我的房产」申请队列。
 * 通过后后端建立 Owner 档案 + Property，用户的「我的房产 / 收益 / 委托」才有数据；
 * 驳回必须填原因，用户可修改材料后重新提交。
 */
interface BindingAttachment {
  name: string
  url: string
  size?: number | null
  content_type?: string | null
}

interface TargetProperty {
  id: string
  address: string
  room_number: string
  size_sqm?: number | null
  property_type?: string | null
  status?: string | null
  review_status?: string | null
  owner_name?: string | null
  active_lease_count?: number
  active_listing_count?: number
}

interface MatchCandidate {
  property_id: string
  address: string
  room_number: string
  size_sqm?: number | null
  property_type?: string | null
  status?: string | null
  review_status?: string | null
  score?: number
  matched_by?: string | null
  owner_name?: string | null
  active_lease_count?: number
  active_listing_count?: number
}

interface PropertyBinding {
  id: string
  kind?: 'claim' | 'new' | null
  status: 'pending' | 'approved' | 'rejected'
  applicant_name?: string | null
  applicant_email?: string | null
  applicant_phone?: string | null
  address: string
  room_number: string
  size_sqm?: number | null
  property_type?: string | null
  note?: string | null
  attachments: BindingAttachment[]
  reject_reason?: string | null
  review_note?: string | null
  reviewed_by?: string | null
  reviewed_at?: string | null
  matched_property_id?: string | null
  property_id?: string | null
  target_property?: TargetProperty | null
  created_at?: string | null
}

const KIND_LABEL: Record<string, string> = {
  claim: 'propertyBindingReview.kindClaim',
  new: 'propertyBindingReview.kindNew',
}

const STATUS_BADGE: Record<string, string> = {
  pending: 'rent-badge--warning',
  approved: 'rent-badge--success',
  rejected: 'rent-badge--error',
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'propertyBindingReview.stPending',
  approved: 'propertyBindingReview.stApproved',
  rejected: 'propertyBindingReview.stRejected',
}

const fmtSize = (n?: number | null) => {
  if (!n) return '—'
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

const PropertyBindingReview = () => {
  const { t } = useTranslation()
  const [items, setItems] = useState<PropertyBinding[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('pending')
  const [keyword, setKeyword] = useState('')
  const [detail, setDetail] = useState<PropertyBinding | null>(null)
  const [current, setCurrent] = useState<PropertyBinding | null>(null)
  const [modalMode, setModalMode] = useState<'approved' | 'rejected' | null>(null)
  const [note, setNote] = useState('')
  const [reason, setReason] = useState('')
  // 认领改判：审核人员可重新匹配并改选目标房源
  const [candidates, setCandidates] = useState<MatchCandidate[]>([])
  const [matching, setMatching] = useState(false)
  const [matchDone, setMatchDone] = useState(false)
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null)
  const pageSize = LIST_PAGE_SIZE

  const fetchData = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await propertyBindingsApi.list({
        page,
        page_size: pageSize,
        status: status || undefined,
        keyword: keyword.trim() || undefined,
      })
      const payload = res.data?.data ?? res.data
      setItems(payload?.items ?? [])
      setTotal(payload?.total ?? 0)
    } catch (err) {
      setLoadError(errorText(err, t('propertyBindingReview.errLoad')))
    } finally {
      setLoading(false)
    }
  }, [page, status, keyword, pageSize, t])

  useEffect(() => { fetchData() }, [fetchData])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const openReview = (b: PropertyBinding, mode: 'approved' | 'rejected') => {
    setCurrent(b)
    setNote('')
    setReason('')
    setCandidates([])
    setMatchDone(false)
    setSelectedPropertyId(
      b.kind === 'claim' ? b.matched_property_id || b.property_id || null : null,
    )
    setModalMode(mode)
  }

  // 重新触发匹配：让审核人员看到全部候选，改判后通过仍只改原房源归属
  const runRematch = async () => {
    if (!current) return
    setMatching(true)
    try {
      const res = await propertyBindingsApi.match({
        address: current.address,
        room_number: current.room_number,
      })
      const payload = res.data?.data ?? res.data
      const items: MatchCandidate[] = (payload?.items ?? []).filter(
        (c: MatchCandidate) => c.review_status === 'approved',
      )
      setCandidates(items)
      setMatchDone(true)
      // 默认仍指向申请时选定的目标；用户显式点选才会改判
      if (
        items.length > 0 &&
        !items.some((c) => c.property_id === selectedPropertyId) &&
        !selectedPropertyId
      ) {
        setSelectedPropertyId(items[0].property_id)
      }
    } catch (err) {
      message.error(errorText(err, t('propertyBindingReview.errMatch')))
    } finally {
      setMatching(false)
    }
  }

  const targetOf = (b: PropertyBinding) =>
    b.kind === 'claim' ? b.matched_property_id || b.property_id || null : null

  // 当前选中的目标（候选列表优先，其次申请时命中的目标）
  const selectedTarget: { address: string; room_number: string; owner_name?: string | null } | null =
    candidates.find((c) => c.property_id === selectedPropertyId) ||
    (current?.target_property && current.target_property.id === selectedPropertyId
      ? current.target_property
      : null)

  const handleReview = async () => {
    if (!current) return
    if (modalMode === 'rejected' && !reason.trim()) {
      message.warning(t('propertyBindingReview.warnReason'))
      return
    }
    try {
      if (modalMode === 'approved') {
        await propertyBindingsApi.approve(
          current.id,
          note.trim() || undefined,
          current.kind === 'claim' ? selectedPropertyId || undefined : undefined,
        )
        message.success(t('propertyBindingReview.msgApproved'))
      } else {
        await propertyBindingsApi.reject(current.id, reason.trim(), note.trim() || undefined)
        message.success(t('propertyBindingReview.msgRejected'))
      }
      setModalMode(null)
      setDetail(null)
      fetchData()
    } catch (err) {
      message.error(errorText(err, t('propertyBindingReview.errReview')))
    }
  }

  // 附件需 Bearer：取二进制后转 objectURL 打开
  const openAttachment = async (b: PropertyBinding, index: number) => {
    try {
      const res = await propertyBindingsApi.attachmentBlob(b.id, index)
      const url = URL.createObjectURL(res.data as Blob)
      window.open(url, '_blank', 'noopener')
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (err) {
      message.error(errorText(err, t('propertyBindingReview.errAttachment')))
    }
  }

  const applicantOf = (b: PropertyBinding) =>
    b.applicant_name || b.applicant_email || b.applicant_phone || '—'

  return (
    <div className="rent-main">
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title">{t('propertyBindingReview.title')}</h2>
          <p className="rent-page-header__subtitle">{t('propertyBindingReview.subtitle')}</p>
        </div>
      </div>

      <div className="rent-filter-bar">
        <select
          className="rent-form-select"
          style={{ width: 'auto', minWidth: 130 }}
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1) }}
        >
          <option value="">{t('propertyBindingReview.allStatus')}</option>
          {Object.keys(STATUS_LABEL).map((k) => (
            <option key={k} value={k}>{t(STATUS_LABEL[k])}</option>
          ))}
        </select>
        <Input.Search
          allowClear
          style={{ width: 240 }}
          placeholder={t('propertyBindingReview.phKeyword')}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onSearch={() => { setPage(1); fetchData() }}
        />
      </div>

      {loadError && items.length === 0 ? (
        <DataState error={loadError} retryText={t('common.retry')} onRetry={fetchData} />
      ) : loading && items.length === 0 ? (
        <DataState loading loadingText={t('common.loading')} skeletonRows={5} />
      ) : items.length === 0 ? (
        <DataState empty filtered={!!status || !!keyword} emptyTitle={t('propertyBindingReview.empty')} />
      ) : (
        <div className="rent-table-wrap">
          <table className="rent-table">
            <thead>
              <tr>
                <th>{t('propertyBindingReview.thApplicant')}</th>
                <th>{t('propertyBindingReview.thKind')}</th>
                <th>{t('propertyBindingReview.thProperty')}</th>
                <th>{t('propertyBindingReview.thSize')}</th>
                <th>{t('propertyBindingReview.thAttachments')}</th>
                <th>{t('propertyBindingReview.thSubmittedAt')}</th>
                <th>{t('common.status')}</th>
                <th>{t('common.action')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((b) => (
                <tr key={b.id}>
                  <td>
                    <div className="rent-text-bold">{applicantOf(b)}</div>
                    <div className="rent-text-sm rent-text-muted">{b.applicant_phone || b.applicant_email || ''}</div>
                  </td>
                  <td>
                    <span className={`rent-badge ${b.kind === 'claim' ? 'rent-badge--warning' : 'rent-badge--neutral'}`}>
                      {KIND_LABEL[b.kind || 'new'] ? t(KIND_LABEL[b.kind || 'new']) : b.kind || 'new'}
                    </span>
                  </td>
                  <td>
                    <div className="rent-text-bold">{b.address}</div>
                    <div className="rent-text-sm rent-text-muted">{t('propertyBindingReview.roomLabel', { room: b.room_number })}</div>
                    {b.kind === 'claim' && b.target_property && (
                      <div className="rent-text-sm rent-text-muted">
                        {t('propertyBindingReview.claimTarget', {
                          room: b.target_property.room_number,
                          address: b.target_property.address,
                        })}
                      </div>
                    )}
                  </td>
                  <td>{b.size_sqm ? `${b.size_sqm} m²` : '—'}</td>
                  <td>{t('propertyBindingReview.attachmentsCount', { n: b.attachments?.length ?? 0 })}</td>
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
                    <div className="rent-flex rent-gap-2">
                      <button className="rent-btn rent-btn--secondary rent-btn--sm" onClick={() => setDetail(b)}>
                        {t('propertyBindingReview.view')}
                      </button>
                      {b.status === 'pending' && (
                        <>
                          <button className="rent-btn rent-btn--primary rent-btn--sm" onClick={() => openReview(b, 'approved')}>
                            {t('propertyBindingReview.approve')}
                          </button>
                          <button
                            className="rent-btn rent-btn--ghost rent-btn--sm"
                            style={{ color: 'var(--state-error)', borderColor: 'var(--state-error)' }}
                            onClick={() => openReview(b, 'rejected')}
                          >
                            {t('propertyBindingReview.reject')}
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="rent-pagination">
        <span className="rent-pagination__info">{t('propertyBindingReview.totalItems', { total: total.toLocaleString() })}</span>
        <button className="rent-pagination__btn" aria-label={t('propertyBindingReview.prevPage')} disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</button>
        <span className="rent-pagination__info">{page} / {totalPages}</span>
        <button className="rent-pagination__btn" aria-label={t('propertyBindingReview.nextPage')} disabled={page >= totalPages} onClick={() => setPage(page + 1)}>›</button>
      </div>

      {/* 申请详情：材料预览 + 审核信息回显 */}
      <Modal
        open={!!detail}
        title={t('propertyBindingReview.detailTitle')}
        footer={null}
        onCancel={() => setDetail(null)}
      >
        {detail && (
          <div>
            <div className="rent-text-bold" style={{ fontSize: 16 }}>{detail.address} · {detail.room_number}</div>
            <div className="rent-text-sm rent-text-muted" style={{ marginTop: 4 }}>
              {t('propertyBindingReview.applicantLine', { name: applicantOf(detail) })}
              {' · '}
              {detail.applicant_phone || detail.applicant_email || '—'}
            </div>
            <div className="rent-text-sm" style={{ marginTop: 8 }}>
              {t('propertyBindingReview.kindLine', {
                kind: t(KIND_LABEL[detail.kind || 'new']),
              })}
            </div>
            <div className="rent-text-sm" style={{ marginTop: 8 }}>
              {t('propertyBindingReview.sizeLine', { size: detail.size_sqm ?? '—', type: detail.property_type || '—' })}
            </div>
            {detail.kind === 'claim' && detail.target_property && (
              <div className="rent-card" style={{ marginTop: 12 }}>
                <div className="rent-card__body">
                  <div className="rent-text-bold">
                    {detail.target_property.address} · {detail.target_property.room_number}
                  </div>
                  <div className="rent-text-sm rent-text-muted" style={{ marginTop: 4 }}>
                    {t('propertyBindingReview.targetOwner', {
                      owner: detail.target_property.owner_name || '—',
                    })}
                  </div>
                  <div className="rent-text-sm rent-text-muted">
                    {t('propertyBindingReview.targetLinks', {
                      leases: detail.target_property.active_lease_count ?? 0,
                      listings: detail.target_property.active_listing_count ?? 0,
                    })}
                  </div>
                  <div className="rent-text-sm rent-text-muted" style={{ marginTop: 4 }}>
                    {t('propertyBindingReview.claimNoDuplicate')}
                  </div>
                </div>
              </div>
            )}
            {detail.note && (
              <div className="rent-text-sm" style={{ marginTop: 8 }}>
                {t('propertyBindingReview.noteLine', { note: detail.note })}
              </div>
            )}
            <div className="rent-text-sm" style={{ marginTop: 12 }}>{t('propertyBindingReview.attachments')}</div>
            <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
              {(detail.attachments ?? []).map((a, i) => (
                <li key={`${a.url}-${i}`} style={{ marginBottom: 6 }}>
                  <button
                    type="button"
                    className="rent-btn rent-btn--ghost rent-btn--sm"
                    onClick={() => openAttachment(detail, i)}
                  >
                    {a.name || t('propertyBindingReview.attachmentN', { n: i + 1 })}
                  </button>
                  <span className="rent-text-sm rent-text-muted" style={{ marginLeft: 8 }}>{fmtSize(a.size)}</span>
                </li>
              ))}
            </ul>
            {detail.reviewed_at && (
              <div className="rent-text-sm rent-text-muted" style={{ marginTop: 12 }}>
                {t('propertyBindingReview.reviewedAt', { at: detail.reviewed_at.slice(0, 19).replace('T', ' ') })}
                {detail.review_note ? ` · ${detail.review_note}` : ''}
              </div>
            )}
            {detail.status === 'rejected' && detail.reject_reason && (
              <div className="rent-text-sm" style={{ marginTop: 8, color: 'var(--state-error)' }}>
                {t('propertyBindingReview.rejectReasonLine', { reason: detail.reject_reason })}
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={!!modalMode}
        onCancel={() => setModalMode(null)}
        onOk={handleReview}
        okText={modalMode === 'approved' ? t('propertyBindingReview.okApprove') : t('propertyBindingReview.okReject')}
        cancelText={t('common.cancel')}
        title={modalMode === 'approved' ? t('propertyBindingReview.modalTitleApprove') : t('propertyBindingReview.modalTitleReject')}
      >
        {current && (
          <div>
            <p>{current.address} · {current.room_number} · {applicantOf(current)}</p>
            {modalMode === 'approved' && (
              <div className="rent-text-sm rent-text-muted">
                {current.kind === 'claim'
                  ? t('propertyBindingReview.approveClaimHint')
                  : t('propertyBindingReview.approveNewHint')}
              </div>
            )}
            {modalMode === 'approved' && current.kind === 'claim' && (
              <div style={{ marginTop: 12 }}>
                <div className="rent-text-sm rent-text-bold">
                  {t('propertyBindingReview.selectedTarget', {
                    room: selectedTarget?.room_number || current.room_number,
                    address: selectedTarget?.address || current.address,
                  })}
                </div>
                {selectedTarget && selectedTarget.owner_name && (
                  <div className="rent-text-sm rent-text-muted">
                    {t('propertyBindingReview.targetOwner', { owner: selectedTarget.owner_name })}
                  </div>
                )}
                {selectedPropertyId !== targetOf(current) && (
                  <div className="rent-text-sm" style={{ color: 'var(--state-warning, #b45309)', marginTop: 4 }}>
                    {t('propertyBindingReview.changedTargetTip')}
                  </div>
                )}
                <div className="rent-flex rent-gap-2" style={{ marginTop: 8 }}>
                  <button
                    type="button"
                    className="rent-btn rent-btn--ghost rent-btn--sm"
                    disabled={matching}
                    onClick={runRematch}
                  >
                    {matching ? t('propertyBindingReview.rematching') : t('propertyBindingReview.rematchBtn')}
                  </button>
                  <span className="rent-text-sm rent-text-muted">{t('propertyBindingReview.rematchHint')}</span>
                </div>
                {candidates.length > 0 ? (
                  <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                    {candidates.map((m) => (
                      <li key={m.property_id} style={{ marginBottom: 6 }}>
                        <label className="rent-text-sm" style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                          <input
                            type="radio"
                            name="pb-review-target"
                            checked={selectedPropertyId === m.property_id}
                            onChange={() => setSelectedPropertyId(m.property_id)}
                            style={{ marginTop: 3 }}
                          />
                          <span>
                            <span className="rent-text-bold">{m.address} · {m.room_number}</span>
                            {m.size_sqm ? <span className="rent-text-muted"> · {m.size_sqm} m²</span> : null}
                            <span className="rent-text-muted">
                              {' · '}
                              {t('propertyBindingReview.candidateLinks', {
                                leases: m.active_lease_count ?? 0,
                                listings: m.active_listing_count ?? 0,
                              })}
                            </span>
                            {m.owner_name ? (
                              <span className="rent-text-muted"> · {m.owner_name}</span>
                            ) : null}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                ) : matchDone ? (
                  <div className="rent-text-sm rent-text-muted" style={{ marginTop: 6 }}>
                    {t('propertyBindingReview.rematchNone')}
                  </div>
                ) : null}
              </div>
            )}
            {modalMode === 'rejected' && (
              <div className="rent-text-sm rent-text-muted">
                {t('propertyBindingReview.rejectHint')}
              </div>
            )}
            {modalMode === 'rejected' && (
              <div className="rent-form-group" style={{ marginTop: 12 }}>
                <label className="rent-form-label">{t('propertyBindingReview.rejectReasonLabel')}</label>
                <Input.TextArea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('propertyBindingReview.phRejectReason')} />
              </div>
            )}
            <div className="rent-form-group" style={{ marginTop: 12 }}>
              <label className="rent-form-label">{t('propertyBindingReview.noteLabel')}</label>
              <Input.TextArea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('propertyBindingReview.notePh')} />
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

export default PropertyBindingReview
