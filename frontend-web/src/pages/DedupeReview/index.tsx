import { useCallback, useEffect, useState } from 'react'
import { message, Spin, Empty, Modal, Input } from 'antd'
import { useTranslation } from 'react-i18next'
import { dedupeApi } from '@/services/api'

interface DedupeReview {
  id: string
  candidate_listing_id: string | null
  candidate_property_id: string | null
  matched_property_id: string | null
  matched_listing_id: string | null
  match_type: string | null
  match_key: string | null
  score: number | null
  status: string | null
  note: string | null
  created_at: string | null
}

const MATCH_TYPE_LABEL: Record<string, string> = { exact: '强命中', fuzzy: '相似命中' }
const STATUS_LABEL: Record<string, string> = { pending: '待审核', merged: '已合并', dismissed: '已驳回' }

const DedupeReview = () => {
  const { t } = useTranslation()
  const [items, setItems] = useState<DedupeReview[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('pending')
  const [current, setCurrent] = useState<DedupeReview | null>(null)
  const [note, setNote] = useState('')
  const [modalMode, setModalMode] = useState<'merge' | 'dismiss' | null>(null)
  const pageSize = 10

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await dedupeApi.list({ page, page_size: pageSize, status: status || undefined })
      const payload = res.data?.data ?? res.data
      setItems(payload?.items ?? [])
      setTotal(payload?.total ?? 0)
    } catch (err: any) {
      message.error(err?.response?.data?.detail || '获取去重审核列表失败')
    } finally {
      setLoading(false)
    }
  }, [page, status])

  useEffect(() => { fetchData() }, [fetchData])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const openAction = (r: DedupeReview, mode: 'merge' | 'dismiss') => {
    setCurrent(r)
    setNote(r.note || '')
    setModalMode(mode)
  }

  const handleAction = async () => {
    if (!current) return
    try {
      if (modalMode === 'merge') {
        await dedupeApi.merge(current.id, note || undefined)
        message.success('已确认合并，候选上架单已停用')
      } else {
        await dedupeApi.dismiss(current.id, note || undefined)
        message.success('已驳回（判为非重复），继续审核')
      }
      setModalMode(null)
      fetchData()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || '操作失败')
    }
  }

  return (
    <div className="rent-main">
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title">去重审核队列</h2>
          <p className="rent-page-header__subtitle">人工比对疑似重复房源，「合并」或「驳回（非重复）」</p>
        </div>
      </div>

      <div className="rent-filter-bar">
        <select className="rent-form-select" style={{ width: 'auto', minWidth: 130 }} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
          <option value="">全部状态</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="rent-empty"><Spin size="small" style={{ marginRight: 8 }} /><span className="rent-text-muted">加载中...</span></div>
      ) : (
        <div className="rent-table-wrap">
          <table className="rent-table">
            <thead>
              <tr>
                <th>候选房源</th>
                <th>匹配房源</th>
                <th>匹配键（地址/房号归一化）</th>
                <th>命中类型</th>
                <th>相似度</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && <tr><td colSpan={7}><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('dedupeReview.empty')} /></td></tr>}
              {items.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div className="rent-text-bold">上架单 {r.candidate_listing_id?.slice(0, 8) ?? '-'}</div>
                    <div className="rent-text-sm rent-text-muted">档案 {r.candidate_property_id?.slice(0, 8) ?? '-'}</div>
                  </td>
                  <td>
                    <div className="rent-text-bold">档案 {r.matched_property_id?.slice(0, 8) ?? '-'}</div>
                    {r.matched_listing_id && <div className="rent-text-sm rent-text-muted">上架单 {r.matched_listing_id.slice(0, 8)}</div>}
                  </td>
                  <td><code className="rent-text-sm">{r.match_key || '-'}</code></td>
                  <td><span className="rent-badge rent-badge--warning">{MATCH_TYPE_LABEL[r.match_type || ''] || r.match_type || '-'}</span></td>
                  <td>
                    <span className="rent-text-bold" style={{ color: Number(r.score) >= 0.8 ? 'var(--state-error)' : Number(r.score) >= 0.6 ? 'var(--state-warning)' : undefined }}>
                      {Math.round(Number(r.score || 0) * 100)}%
                    </span>
                  </td>
                  <td><span className="rent-badge rent-badge--neutral">{STATUS_LABEL[r.status || ''] || r.status}</span></td>
                  <td>
                    {r.status === 'pending' ? (
                      <div className="rent-flex rent-gap-2">
                        <button className="rent-btn rent-btn--primary rent-btn--sm" onClick={() => openAction(r, 'merge')}>确认合并</button>
                        <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => openAction(r, 'dismiss')}>驳回</button>
                      </div>
                    ) : <span className="rent-text-muted">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="rent-pagination">
        <span className="rent-pagination__info">共 {total.toLocaleString()} 条</span>
        <button className="rent-pagination__btn" aria-label={t('dedupeReview.prevPage')} disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</button>
        <span className="rent-pagination__info">{page} / {totalPages}</span>
        <button className="rent-pagination__btn" aria-label={t('dedupeReview.nextPage')} disabled={page >= totalPages} onClick={() => setPage(page + 1)}>›</button>
      </div>

      <Modal
        open={!!modalMode}
        onCancel={() => setModalMode(null)}
        onOk={handleAction}
        okText={modalMode === 'merge' ? '确认合并' : '确认驳回'}
        cancelText="取消"
        title={modalMode === 'merge' ? '确认合并（判重复）' : '驳回（判非重复）'}
      >
        {current && (
          <div>
            <p>候选：{current.candidate_listing_id?.slice(0, 8)} ↔ 匹配：{current.matched_property_id?.slice(0, 8)} · 相似度 {Math.round(Number(current.score || 0) * 100)}%</p>
            <p>匹配键：<code>{current.match_key || '-'}</code></p>
            <div className="rent-form-group" style={{ marginTop: 12 }}>
              <label className="rent-form-label">备注（可选）</label>
              <Input.TextArea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('dedupeReview.notePlaceholder')} />
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

export default DedupeReview