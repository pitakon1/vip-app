import { useCallback, useEffect, useState } from 'react'
import { Button, message, Popconfirm, Empty, Spin } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import api from '@/lib/api'

interface ReviewItem {
  type: string
  id: string
  title: string
  applicant: string
  reason: string
  status: string
  created_at?: string
}

interface ReviewData {
  summary: Record<string, number>
  items: ReviewItem[]
}

const TYPE_META: Record<string, { label: string; badge: string; icon: string[]; style: { background: string; color: string } }> = {
  trip: {
    label: '外勤申请',
    badge: 'rent-badge--warning',
    icon: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', 'M9 12l2 2 4-4'],
    style: { background: 'rgba(217,119,6,0.12)', color: 'var(--state-warning)' },
  },
  maintenance: {
    label: '报修工单',
    badge: 'rent-badge--info',
    icon: ['M14.7 6.3a4 4 0 0 0 5 5l-8.5 8.5a2.1 2.1 0 0 1-3-3z', 'M6 18l1 1'],
    style: { background: 'rgba(14,165,233,0.1)', color: 'var(--state-info)' },
  },
  service: {
    label: '服务订单',
    badge: 'rent-badge--success',
    icon: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M9 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8z'],
    style: { background: 'rgba(22,163,74,0.1)', color: 'var(--state-success)' },
  },
  contract: {
    label: '合同流转',
    badge: 'rent-badge--neutral',
    icon: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6'],
    style: { background: 'rgba(20,184,166,0.1)', color: 'var(--rent-primary)' },
  },
}
const STATUS_LABEL: Record<string, string> = {
  pending: '待处理',
  open: '待受理',
  assigned: '已分派',
  in_progress: '处理中',
  draft: '草稿',
  sent: '已发出',
  partially_signed: '部分签署',
}
const STATUS_BADGE: Record<string, string> = {
  pending: 'rent-badge--warning',
  open: 'rent-badge--warning',
  assigned: 'rent-badge--info',
  in_progress: 'rent-badge--info',
  draft: 'rent-badge--neutral',
  sent: 'rent-badge--info',
  partially_signed: 'rent-badge--warning',
}

const PAGE_SIZE = 20

const ReviewCenter = () => {
  const [data, setData] = useState<ReviewData | null>(null)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/review-center/todos')
      const d = res.data?.data ?? res.data
      setData(d)
    } catch (err: any) {
      message.error(err?.response?.data?.detail || '加载待办失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // 外勤审批
  const handleTrip = async (id: string, action: 'approved' | 'rejected') => {
    try {
      await api.post(`/attendance/external-trips/${id}/approve`, { action, reply_note: action === 'approved' ? '管理员审批通过' : '管理员驳回' })
      message.success(action === 'approved' ? '已通过' : '已驳回')
      fetchData()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || '操作失败')
    }
  }

  // 报修工单受理 -> assigned；完结 -> resolved
  const handleTicket = async (id: string, status: string) => {
    try {
      await api.patch(`/maintenance-tickets/${id}`, { status })
      message.success('工单状态已更新')
      fetchData()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || '操作失败')
    }
  }

  // 服务订单受理 -> assigned
  const handleOrder = async (id: string, status: string) => {
    try {
      await api.patch(`/service-orders/${id}/status`, { status })
      message.success('订单状态已更新')
      fetchData()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || '操作失败')
    }
  }

  if (!data) return null

  const items = data.items ?? []
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pagedItems = items.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  return (
    <div className="rent-main">
      {/* Page Header */}
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title">工单审核中心</h2>
          <p className="rent-page-header__subtitle">
            统一处理外勤申请、报修工单、服务订单与合同流转待办
          </p>
        </div>
        <div className="rent-page-header__actions">
          <Button icon={<ReloadOutlined />} onClick={fetchData}>
            刷新
          </Button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="rent-grid rent-grid--4 rent-mb-5">
        {Object.entries(TYPE_META).map(([k, m]) => (
          <div className="rent-stat-card" key={k}>
            <div className="rent-stat-card__head">
              <div>
                <div className="rent-stat-card__label">{m.label}</div>
                <div className="rent-stat-card__value rent-num">{data.summary?.[k] ?? 0}</div>
                <div className="rent-stat-card__delta rent-text-muted">待办事项</div>
              </div>
              <div className="rent-stat-card__icon" style={m.style}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {m.icon.map((d) => (
                    <path key={d} d={d} />
                  ))}
                </svg>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Todo Table */}
      <div className="rent-card">
        <div className="rent-card__header">
          <h3 className="rent-card__title">待审核列表</h3>
        </div>
        <div className="rent-card__body" style={{ padding: 0 }}>
          <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
            <table className="rent-table">
              <thead>
                <tr>
                  <th>类型</th>
                  <th>对象</th>
                  <th>申请人</th>
                  <th>内容</th>
                  <th>提交时间</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="rent-loading-row">
                      <Spin size="small" style={{ marginRight: 8 }} />
                      加载中...
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <div className="rent-empty">
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无待办，所有工单已处理完毕" />
                      </div>
                    </td>
                  </tr>
                ) : (
                  pagedItems.map((r) => {
                    const meta = TYPE_META[r.type] || { label: r.type, badge: 'rent-badge--neutral' }
                    return (
                      <tr key={`${r.type}-${r.id}`}>
                        <td>
                          <span className={`rent-badge ${meta.badge}`}>{meta.label}</span>
                        </td>
                        <td style={{ fontWeight: 600 }}>{r.title || '—'}</td>
                        <td>{r.applicant || '—'}</td>
                        <td className="rent-text-muted">{r.reason || '—'}</td>
                        <td className="rent-table__mono">{r.created_at ? String(r.created_at).replace('T', ' ').slice(0, 16) : '—'}</td>
                        <td>
                          <span className={`rent-badge ${STATUS_BADGE[r.status] || 'rent-badge--neutral'}`}>
                            {STATUS_LABEL[r.status] || r.status}
                          </span>
                        </td>
                        <td>
                          <div className="rent-flex rent-gap-2" style={{ flexWrap: 'wrap' }}>
                            {r.type === 'trip' && (
                              <>
                                <button className="rent-btn rent-btn--primary rent-btn--sm" type="button" onClick={() => handleTrip(r.id, 'approved')}>
                                  通过
                                </button>
                                <Popconfirm title="确认驳回该外勤申请？" onConfirm={() => handleTrip(r.id, 'rejected')}>
                                  <button className="rent-btn rent-btn--ghost rent-btn--sm" type="button">
                                    驳回
                                  </button>
                                </Popconfirm>
                              </>
                            )}
                            {r.type === 'maintenance' && (
                              <>
                                <button className="rent-btn rent-btn--primary rent-btn--sm" type="button" onClick={() => handleTicket(r.id, 'assigned')}>
                                  受理
                                </button>
                                <button className="rent-btn rent-btn--ghost rent-btn--sm" type="button" onClick={() => handleTicket(r.id, 'resolved')}>
                                  完结
                                </button>
                              </>
                            )}
                            {r.type === 'service' && (
                              <button className="rent-btn rent-btn--primary rent-btn--sm" type="button" onClick={() => handleOrder(r.id, 'assigned')}>
                                受理
                              </button>
                            )}
                            {r.type === 'contract' && <span className="rent-text-muted rent-text-sm">请在合同管理页处理</span>}
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="rent-pagination" style={{ padding: '12px 20px' }}>
            <span className="rent-pagination__info">
              共 {items.length} 条 · 每页 {PAGE_SIZE} 条
            </span>
            <button
              className="rent-pagination__btn"
              type="button"
              aria-label="上一页"
              disabled={safePage <= 1}
              onClick={() => setPage(Math.max(1, safePage - 1))}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <span className="rent-pagination__info">
              {safePage} / {totalPages}
            </span>
            <button
              className="rent-pagination__btn"
              type="button"
              aria-label="下一页"
              disabled={safePage >= totalPages}
              onClick={() => setPage(Math.min(totalPages, safePage + 1))}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ReviewCenter