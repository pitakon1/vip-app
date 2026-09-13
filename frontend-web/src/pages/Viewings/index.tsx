import { useCallback, useEffect, useMemo, useState } from 'react'
import { message, Spin, Empty } from 'antd'
import { viewingsApi } from '@/services/api'
import './viewings.css'

type ViewingStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'

interface Viewing {
  id: string
  property_title: string
  property_address: string
  scheduled_at: string
  visitor_name: string
  visitor_phone: string
  visitor_email: string
  status: ViewingStatus
  assigned_to: string
  notes: string
  created_at: string
}

const STATUS_META: Record<ViewingStatus, { label: string; badge: string; dot: string }> = {
  pending: { label: '待确认', badge: 'rent-badge--warning', dot: 'var(--state-warning)' },
  confirmed: { label: '已确认', badge: 'rent-badge--info', dot: 'var(--state-info)' },
  completed: { label: '已完成', badge: 'rent-badge--success', dot: 'var(--state-success)' },
  cancelled: { label: '已取消', badge: 'rent-badge--neutral', dot: 'var(--rent-ink-3)' },
  no_show: { label: '未到场', badge: 'rent-badge--error', dot: 'var(--state-error)' },
}

interface QueryParams {
  page: number
  pageSize: number
  status?: ViewingStatus
  property_id?: string
}

const Viewings = () => {
  const [items, setItems] = useState<Viewing[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [submittingId, setSubmittingId] = useState<string | null>(null)
  const [queryParams, setQueryParams] = useState<QueryParams>({
    page: 1,
    pageSize: 10,
  })

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await viewingsApi.list({
        page: queryParams.page,
        limit: queryParams.pageSize,
        status: queryParams.status || undefined,
        property_id: queryParams.property_id || undefined,
      })
      const payload = res.data?.data ?? res.data
      setItems(payload?.items ?? [])
      setTotal(payload?.total ?? 0)
    } catch (err: any) {
      message.error(err?.response?.data?.message || '获取预约看房列表失败')
    } finally {
      setLoading(false)
    }
  }, [queryParams])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const changeStatus = async (id: string, status: ViewingStatus) => {
    try {
      setSubmittingId(id)
      await viewingsApi.updateStatus(id, status)
      message.success('状态已更新')
      fetchData()
    } catch (err: any) {
      message.error(err?.response?.data?.message || '更新状态失败')
    } finally {
      setSubmittingId(null)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / queryParams.pageSize))

  const counts = useMemo(() => {
    const nextStatus = (s: ViewingStatus) => ({
      pending: { confirmed: '已确认', no_show: '未到场' },
      confirmed: { completed: '已完成', cancelled: '已取消', no_show: '未到场' },
      completed: {},
      cancelled: {},
      no_show: {},
    })[s] as Record<string, string>
    return { nextStatus }
  }, [])

  return (
    <div className="rent-main">
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title">预约看房管理</h2>
          <p className="rent-page-header__subtitle">管理看房预约、确认与到访状态</p>
        </div>
        <div className="rent-page-header__actions">
          <span className="rent-badge rent-badge--neutral">共 {total.toLocaleString()} 条</span>
        </div>
      </div>

      {/* Filter */}
      <div className="rent-filter-bar">
        <select
          className="rent-form-select"
          style={{ width: 'auto', minWidth: 130 }}
          aria-label="状态"
          value={queryParams.status || ''}
          onChange={(e) =>
            setQueryParams((p) => ({
              ...p,
              status: (e.target.value || undefined) as ViewingStatus | undefined,
              page: 1,
            }))
          }
        >
          <option value="">全部状态</option>
          <option value="pending">待确认</option>
          <option value="confirmed">已确认</option>
          <option value="completed">已完成</option>
          <option value="cancelled">已取消</option>
          <option value="no_show">未到场</option>
        </select>
        <div className="rent-search" style={{ width: 'auto', minWidth: 200 }}>
          <input
            type="text"
            placeholder="房源ID（可选）"
            value={queryParams.property_id || ''}
            onChange={(e) => {
              const v = e.target.value
              setQueryParams((p) => ({ ...p, property_id: v || undefined, page: 1 }))
            }}
          />
        </div>
        <button className="rent-btn rent-btn--primary rent-btn--sm" onClick={() => setQueryParams((p) => ({ ...p, page: 1 }))}>筛选</button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="rent-empty"><Spin size="small" style={{ marginRight: 8 }} /><span className="rent-text-muted">加载中...</span></div>
      ) : (
        <div className="rent-table-wrap">
          <table className="rent-table">
            <thead>
              <tr>
                <th>房源</th>
                <th>预约时间</th>
                <th>访客</th>
                <th>联系方式</th>
                <th>负责人</th>
                <th>状态</th>
                <th>备注</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr><td colSpan={8}><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无预约看房记录" /></td></tr>
              )}
              {items.map((v) => {
                const meta = STATUS_META[v.status] || STATUS_META.pending
                const next = counts.nextStatus(v.status)
                const entries = Object.entries(next)
                return (
                  <tr key={v.id}>
                    <td>
                      <div>{v.property_title || '—'}</div>
                      <div className="rent-text-sm rent-text-muted">{v.property_address}</div>
                    </td>
                    <td className="rent-table__mono">{v.scheduled_at ? new Date(v.scheduled_at).toLocaleString() : '—'}</td>
                    <td>{v.visitor_name || '—'}</td>
                    <td>
                      <div className="rent-text-sm">{v.visitor_phone || '—'}</div>
                      <div className="rent-text-sm rent-text-muted">{v.visitor_email || ''}</div>
                    </td>
                    <td>{v.assigned_to || '—'}</td>
                    <td>
                      <span className={`rent-badge ${meta.badge}`}>
                        <span className="rent-badge--dot" style={{ background: meta.dot }} />
                        {meta.label}
                      </span>
                    </td>
                    <td className="rent-text-muted" style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {v.notes || '—'}
                    </td>
                    <td>
                      <div className="rent-flex rent-gap-2">
                        {entries.length === 0 && <span className="rent-text-muted">—</span>}
                        {entries.map(([st, label]) => (
                          <button
                            key={st}
                            className="rent-btn rent-btn--ghost rent-btn--sm"
                            disabled={submittingId === v.id}
                            onClick={() => changeStatus(v.id, st as ViewingStatus)}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {!loading && (
        <div className="rent-pagination">
          <span className="rent-pagination__info">共 {total.toLocaleString()} 条记录</span>
          <button
            className="rent-pagination__btn"
            aria-label="上一页"
            disabled={queryParams.page <= 1}
            onClick={() => setQueryParams((p) => ({ ...p, page: Math.max(1, p.page - 1) }))}
          >‹</button>
          <span className="rent-pagination__info">{queryParams.page} / {totalPages}</span>
          <button
            className="rent-pagination__btn"
            aria-label="下一页"
            disabled={queryParams.page >= totalPages}
            onClick={() => setQueryParams((p) => ({ ...p, page: Math.min(totalPages, p.page + 1) }))}
          >›</button>
        </div>
      )}
    </div>
  )
}

export default Viewings