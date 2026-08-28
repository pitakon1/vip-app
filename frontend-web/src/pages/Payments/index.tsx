import { useCallback, useEffect, useMemo, useState } from 'react'
import { message } from 'antd'
import { paymentsApi } from '@/services/api'
import type { Payment, PaymentStatus } from '@/types'
import './payments.css'

/* ===== 状态显示元数据（与设计稿徽章颜色一致） ===== */
type DisplayStatus = 'completed' | 'pending' | 'overdue' | 'refunded'

const statusMeta: Record<DisplayStatus, { label: string; badge: string; dot: string }> = {
  completed: { label: '已完成', badge: 'rent-badge--success', dot: 'var(--state-success)' },
  pending: { label: '待确认', badge: 'rent-badge--info', dot: 'var(--state-info)' },
  overdue: { label: '逾期', badge: 'rent-badge--error', dot: 'var(--state-error)' },
  refunded: { label: '已退款', badge: 'rent-badge--neutral', dot: 'var(--rent-ink-3)' },
}

// 将 API 状态映射为设计稿展示状态
const toDisplayStatus = (p: Payment): DisplayStatus => {
  const explicit = (p as any).display_status as DisplayStatus | undefined
  if (explicit) return explicit
  const s = p.status as PaymentStatus
  if (s === 'succeeded' || s === 'paid') return 'completed'
  if (s === 'pending') return 'pending'
  if (s === 'overdue' || s === 'failed') return 'overdue'
  if ((p as any).status === 'refunded') return 'refunded'
  return 'completed'
}

/* ===== 类型显示元数据（收款/付款/退款） ===== */
type DisplayType = 'income' | 'expense' | 'refund'

const typeMeta: Record<DisplayType, { label: string; badge: string }> = {
  income: { label: '收款', badge: 'rent-badge--primary' },
  expense: { label: '付款', badge: 'rent-badge--neutral' },
  refund: { label: '退款', badge: 'rent-badge--warning' },
}

const toDisplayType = (p: Payment): DisplayType => {
  const explicit = (p as any).display_type as DisplayType | undefined
  if (explicit) return explicit
  if (p.payment_type === 'refund') return 'refund'
  return 'income'
}

interface QueryParams {
  page: number
  pageSize: number
  status?: PaymentStatus
  keyword?: string
}

const Payments = () => {
  const [data, setData] = useState<Payment[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [refundOpen, setRefundOpen] = useState(false)
  const [currentPayment, setCurrentPayment] = useState<Payment | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [refundReason, setRefundReason] = useState('')
  const [queryParams, setQueryParams] = useState<QueryParams>({
    page: 1,
    pageSize: 10,
  })
  const [filterType, setFilterType] = useState<string>('')
  const [filterMethod, setFilterMethod] = useState<string>('')
  const [filterStart, setFilterStart] = useState<string>('')
  const [filterEnd, setFilterEnd] = useState<string>('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await paymentsApi.list({
        page: queryParams.page,
        pageSize: queryParams.pageSize,
        status: queryParams.status,
        keyword: queryParams.keyword,
      })
      const payload = res.data?.data ?? res.data
      setData(payload?.items ?? [])
      setTotal(payload?.total ?? 0)
    } catch (err: any) {
      message.error(err?.response?.data?.message || '获取付款列表失败')
    } finally {
      setLoading(false)
    }
  }, [queryParams])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const summary = useMemo(() => {
    const succeeded = data.filter(
      (p) => p.status === 'succeeded' || p.status === 'paid',
    )
    const pending = data.filter((p) => p.status === 'pending')
    const overdue = data.filter(
      (p) => p.status === 'overdue' || p.status === 'failed',
    )
    const refunds = data.filter((p) => p.payment_type === 'refund')
    const totalAmount = succeeded.reduce(
      (sum, p) => sum + Number(p.amount || 0),
      0,
    )
    const pendingAmount = pending.reduce(
      (sum, p) => sum + Number(p.amount || 0),
      0,
    )
    const overdueAmount = overdue.reduce(
      (sum, p) => sum + Number(p.amount || 0),
      0,
    )
    const expenseAmount = refunds.reduce(
      (sum, p) => sum + Number(p.amount || 0),
      0,
    )
    return {
      totalAmount,
      pendingAmount,
      overdueAmount,
      expenseAmount,
      count: succeeded.length,
      pendingCount: pending.length,
      overdueCount: overdue.length,
    }
  }, [data])

  const displayData = data

  // 顶部统计卡片数值（来自真实接口数据）
  const statIncome = summary.totalAmount
  const statExpense = summary.expenseAmount
  const statPending = summary.pendingAmount
  const statOverdue = summary.overdueAmount
  const statTotal = total

  const handleSearch = (value: string) => {
    setQueryParams((p) => ({ ...p, keyword: value || undefined, page: 1 }))
  }

  const handleStatusChange = (value: PaymentStatus | undefined) => {
    setQueryParams((p) => ({ ...p, status: value, page: 1 }))
  }

  const openRefund = (record: Payment) => {
    setCurrentPayment(record)
    setRefundReason('')
    setRefundOpen(true)
  }

  const handleRefund = async () => {
    if (!currentPayment) return
    if (!refundReason.trim()) {
      message.error('请输入退款原因')
      return
    }
    try {
      setSubmitting(true)
      await paymentsApi.refund(String(currentPayment.id), refundReason)
      message.success('退款申请已提交')
      setRefundOpen(false)
      fetchData()
    } catch (err: any) {
      message.error(err?.response?.data?.message || '退款失败')
    } finally {
      setSubmitting(false)
    }
  }

  const formatAmount = (p: Payment) => {
    const amt = Number(p.amount || 0)
    return `฿${amt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  return (
    <div className="rent-main">
      {/* Page Header */}
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title">收付款管理</h2>
          <p className="rent-page-header__subtitle">跟踪所有租金收付记录</p>
        </div>
        <div className="rent-page-header__actions">
          <button className="rent-btn rent-btn--secondary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            导出
          </button>
          <button className="rent-btn rent-btn--primary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            手动记账
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="rent-grid rent-grid--4 rent-mb-5">
        <div className="rent-stat-card">
          <div className="rent-stat-card__label">本月收入</div>
          <div className="rent-stat-card__value">฿{Number(statIncome).toLocaleString()}</div>
          <div className="rent-stat-card__delta rent-stat-card__delta--up">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="18 15 12 9 6 15" />
            </svg>
            +15.2% 较上月
          </div>
        </div>
        <div className="rent-stat-card">
          <div className="rent-stat-card__label">本月支出</div>
          <div className="rent-stat-card__value">฿{Number(statExpense).toLocaleString()}</div>
          <div className="rent-stat-card__delta rent-stat-card__delta--up">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="6 9 12 15 18 9" />
            </svg>
            -3.1% 较上月
          </div>
        </div>
        <div className="rent-stat-card">
          <div className="rent-stat-card__label">待收款</div>
          <div className="rent-stat-card__value">฿{Number(statPending).toLocaleString()}</div>
          <div className="rent-mt-2">
            <span className="rent-badge rent-badge--warning">
              <span className="rent-badge--dot" style={{ background: 'var(--state-warning)' }} />
              {summary.pendingCount} 笔待确认
            </span>
          </div>
        </div>
        <div className="rent-stat-card">
          <div className="rent-stat-card__label">逾期款项</div>
          <div className="rent-stat-card__value">฿{Number(statOverdue).toLocaleString()}</div>
          <div className="rent-mt-2">
            <span className="rent-badge rent-badge--error">
              <span className="rent-badge--dot" style={{ background: 'var(--state-error)' }} />
              {summary.overdueCount} 笔逾期
            </span>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="rent-filter-bar">
        <div className="rent-filter-bar__search">
          <div className="rent-search" style={{ width: '100%', maxWidth: 'none' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--rent-ink-3)" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="搜索租客 / 合同号"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSearch((e.target as HTMLInputElement).value)
              }}
            />
          </div>
        </div>
        <select
          className="rent-form-select"
          style={{ width: 'auto', minWidth: 120 }}
          aria-label="类型"
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
        >
          <option value="">全部类型</option>
          <option value="income">收款</option>
          <option value="expense">付款</option>
          <option value="refund">退款</option>
        </select>
        <select
          className="rent-form-select"
          style={{ width: 'auto', minWidth: 120 }}
          aria-label="状态"
          value={queryParams.status || ''}
          onChange={(e) => handleStatusChange((e.target.value || undefined) as PaymentStatus | undefined)}
        >
          <option value="">全部状态</option>
          <option value="succeeded">已完成</option>
          <option value="pending">待确认</option>
          <option value="overdue">逾期</option>
          <option value="refunded">已退款</option>
        </select>
        <select
          className="rent-form-select"
          style={{ width: 'auto', minWidth: 130 }}
          aria-label="方式"
          value={filterMethod}
          onChange={(e) => setFilterMethod(e.target.value)}
        >
          <option value="">全部方式</option>
          <option value="银行转账">银行转账</option>
          <option value="信用卡">信用卡</option>
          <option value="支付宝">支付宝</option>
          <option value="微信">微信</option>
          <option value="Wise">Wise</option>
        </select>
        <div className="rent-flex rent-gap-2" style={{ alignItems: 'center' }}>
          <input
            type="date"
            className="rent-form-input"
            style={{ width: 'auto' }}
            aria-label="起始日期"
            value={filterStart}
            onChange={(e) => setFilterStart(e.target.value)}
          />
          <span className="rent-text-muted rent-text-sm">至</span>
          <input
            type="date"
            className="rent-form-input"
            style={{ width: 'auto' }}
            aria-label="结束日期"
            value={filterEnd}
            onChange={(e) => setFilterEnd(e.target.value)}
          />
        </div>
        <button className="rent-btn rent-btn--primary rent-btn--sm">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
          </svg>
          筛选
        </button>
      </div>

      {/* Payments Table */}
      {loading ? (
        <div className="rent-empty">
          <div className="rent-text-muted">加载中...</div>
        </div>
      ) : (
        <>
          <div className="rent-table-wrap payments-table-wrap">
            <table className="rent-table">
              <thead>
                <tr>
                  <th>流水号</th>
                  <th>日期</th>
                  <th>租客/业主</th>
                  <th>类型</th>
                  <th>金额 (฿)</th>
                  <th>方式</th>
                  <th>合同编号</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {displayData.map((p) => {
                  const ds = toDisplayStatus(p)
                  const dt = toDisplayType(p)
                  const sMeta = statusMeta[ds]
                  const tMeta = typeMeta[dt]
                  const code = (p as any).code || `PMT-${p.id}`
                  const tenantName = (p as any).tenant_name || p.lease_id || '-'
                  const contractCode = (p as any).contract_code || p.lease_id || '-'
                  const date = p.paid_at || p.due_date || '-'
                  const channel = p.channel || '-'
                  const isRefundable = ds === 'overdue'
                  const isConfirmable = ds === 'pending'
                  return (
                    <tr key={p.id}>
                      <td><span className="rent-mono">{code}</span></td>
                      <td className="rent-table__mono">{date}</td>
                      <td>{tenantName}</td>
                      <td>
                        <span className={`rent-badge ${tMeta.badge}`}>{tMeta.label}</span>
                      </td>
                      <td className="rent-num">{formatAmount(p)}</td>
                      <td>{channel}</td>
                      <td><span className="rent-mono">{contractCode}</span></td>
                      <td>
                        <span className={`rent-badge ${sMeta.badge}`}>
                          <span className="rent-badge--dot" style={{ background: sMeta.dot }} />
                          {sMeta.label}
                        </span>
                      </td>
                      <td>
                        <div className="rent-flex rent-gap-2">
                          <button className="rent-btn rent-btn--ghost rent-btn--sm">查看</button>
                          {isConfirmable && (
                            <button className="rent-btn rent-btn--primary rent-btn--sm">确认</button>
                          )}
                          {isRefundable && (
                            <button
                              className="rent-btn rent-btn--ghost rent-btn--sm"
                              style={{ color: 'var(--state-error)', borderColor: 'var(--state-error)' }}
                              onClick={() => openRefund(p)}
                            >
                              退款
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="rent-pagination">
            <span className="rent-pagination__info">共 {statTotal.toLocaleString()} 条记录</span>
            <button
              className="rent-pagination__btn"
              aria-label="上一页"
              onClick={() => setQueryParams((p) => ({ ...p, page: Math.max(1, p.page - 1) }))}
              disabled={queryParams.page <= 1}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <button className="rent-pagination__btn" data-active={true}>{queryParams.page}</button>
            <button
              className="rent-pagination__btn"
              aria-label="下一页"
              onClick={() => setQueryParams((p) => ({ ...p, page: p.page + 1 }))}
              disabled={displayData.length < queryParams.pageSize}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
        </>
      )}

      {/* Refund Modal (native rent-modal) */}
      {refundOpen && (
        <div className="rent-modal-backdrop" onClick={() => setRefundOpen(false)}>
          <div className="rent-modal payments-modal" onClick={(e) => e.stopPropagation()}>
            <div className="rent-modal__header">
              <h3 className="rent-card__title">申请退款</h3>
              <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => setRefundOpen(false)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="rent-modal__body">
              <div className="rent-form-group" style={{ marginBottom: 0 }}>
                <label className="rent-form-label">退款原因 *</label>
                <textarea
                  className="rent-form-textarea"
                  rows={3}
                  placeholder="请输入退款原因"
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                />
              </div>
            </div>
            <div className="rent-modal__footer">
              <button className="rent-btn rent-btn--secondary" onClick={() => setRefundOpen(false)}>取消</button>
              <button className="rent-btn rent-btn--primary" onClick={handleRefund} disabled={submitting}>
                {submitting ? '提交中...' : '确定'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Payments
