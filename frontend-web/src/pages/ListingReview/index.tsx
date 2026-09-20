import { useCallback, useEffect, useState } from 'react'
import { message, Spin, Empty, Modal, Input } from 'antd'
import { listingsApi } from '@/services/api'
import { formatMoney } from '@/lib/money'

interface Listing {
  id: string
  listing_type: string
  status: string
  property_id: string
  publisher: string
  asking_price: number | null
  monthly_rent: number | null
  currency: string
  sale_commission_rate: number | null
  rental_commission_months: number | null
  mandate_type: string
  buyer_side_rate: number | null
  listing_side_rate: number | null
  dedupe_state: string | null
  reject_reason: string | null
  broker_company?: string | null
  broker_real_name?: string | null
  created_at?: string | null
}

const STATUS_LABEL: Record<string, string> = { pending: '待审核', active: '已上架', rejected: '已拒绝', closed: '已下架', sold: '已售出', rented: '已出租' }
const CURRENCY: Record<string, string> = { THB: '฿', CNY: '¥', USD: '$', RM: 'RM ' }

const ListingReview = () => {
  const [items, setItems] = useState<Listing[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('pending')
  const [current, setCurrent] = useState<Listing | null>(null)
  const [note, setNote] = useState('')
  const [modalMode, setModalMode] = useState<'approved' | 'rejected' | null>(null)
  const pageSize = 10

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await listingsApi.list({ page, page_size: pageSize, status: status || undefined })
      const payload = res.data?.data ?? res.data
      setItems(payload?.items ?? [])
      setTotal(payload?.total ?? 0)
    } catch (err: any) {
      message.error(err?.response?.data?.detail || '获取审核列表失败')
    } finally {
      setLoading(false)
    }
  }, [page, status])

  useEffect(() => { fetchData() }, [fetchData])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const openReview = (li: Listing, mode: 'approved' | 'rejected') => {
    setCurrent(li)
    setNote('')
    setModalMode(mode)
  }
  const handleReview = async () => {
    if (!current) return
    if (modalMode === 'rejected' && !note.trim()) {
      message.warning('拒绝时请填写原因')
      return
    }
    try {
      await listingsApi.review(current.id, modalMode!, note)
      message.success(modalMode === 'approved' ? '已通过，房源已上架' : '已拒绝')
      setModalMode(null)
      fetchData()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || '审核失败')
    }
  }

  const priceOf = (li: Listing) => {
    const cur = CURRENCY[li.currency] || li.currency
    const v = li.listing_type === 'sell' ? li.asking_price : li.monthly_rent
    return `${cur}${formatMoney(Number(v || 0), li.currency, false)}${li.listing_type === 'rent' ? '/月' : ''}`
  }

  return (
    <div className="rent-main">
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title">平台上架审核</h2>
          <p className="rent-page-header__subtitle">审核经纪人 / 业主发布的房源上架单</p>
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
                <th>房源</th>
                <th>发布人</th>
                <th>类型</th>
                <th>价格</th>
                <th>佣金</th>
                <th>分成</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && <tr><td colSpan={8}><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无待审核上架单" /></td></tr>}
              {items.map((li) => (
                <tr key={li.id}>
                  <td>
                    <div className="rent-text-bold">房源 {li.property_id.slice(0, 8)}</div>
                    <div className="rent-text-sm rent-text-muted">{li.publisher}</div>
                  </td>
                  <td>{li.broker_company || li.broker_real_name || '—'}</td>
                  <td><span className="rent-badge rent-badge--info">{li.listing_type === 'sell' ? '出售' : '出租'}</span></td>
                  <td>{priceOf(li)}</td>
                  <td>{li.listing_type === 'rent' ? `${li.rental_commission_months ?? '-'} 月` : `${li.sale_commission_rate ?? '-'}%`}</td>
                  <td>{li.buyer_side_rate != null ? `客源 ${li.buyer_side_rate}% / 房源 ${li.listing_side_rate}%` : '-'}</td>
                  <td>
                    <span className="rent-badge rent-badge--neutral">{STATUS_LABEL[li.status] || li.status}</span>
                    {li.status === 'rejected' && li.reject_reason && <div className="rent-text-sm rent-text-muted" style={{ color: 'var(--state-error)' }}>{li.reject_reason}</div>}
                  </td>
                  <td>
                    <div className="rent-flex rent-gap-2">
                      <button className="rent-btn rent-btn--primary rent-btn--sm" onClick={() => openReview(li, 'approved')}>通过</button>
                      <button className="rent-btn rent-btn--ghost rent-btn--sm" style={{ color: 'var(--state-error)', borderColor: 'var(--state-error)' }} onClick={() => openReview(li, 'rejected')}>拒绝</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="rent-pagination">
        <span className="rent-pagination__info">共 {total.toLocaleString()} 条</span>
        <button className="rent-pagination__btn" aria-label="上一页" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</button>
        <span className="rent-pagination__info">{page} / {totalPages}</span>
        <button className="rent-pagination__btn" aria-label="下一页" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>›</button>
      </div>

      <Modal
        open={!!modalMode}
        onCancel={() => setModalMode(null)}
        onOk={handleReview}
        okText={modalMode === 'approved' ? '确认通过' : '确认拒绝'}
        cancelText="取消"
        title={modalMode === 'approved' ? '通过上架审核' : '拒绝上架'}
      >
        {current && (
          <div>
            <p>房源：{current.property_id} · {current.listing_type === 'sell' ? '出售' : '出租'} · {priceOf(current)}</p>
            {modalMode === 'rejected' && (
              <div className="rent-form-group" style={{ marginTop: 12 }}>
                <label className="rent-form-label">拒绝原因 *</label>
                <Input.TextArea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="请输入拒绝原因" />
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}

export default ListingReview