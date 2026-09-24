import { useCallback, useEffect, useMemo, useState } from 'react'
import { message } from 'antd'
import { useTranslation } from 'react-i18next'
import { paymentsApi } from '@/services/api'
import { downloadReport } from '@/lib/download'
import type { Payment, PaymentStatus } from '@/types'
import './payments.css'

/* ===== 状态显示元数据（与设计稿徽章颜色一致） ===== */
type DisplayStatus = 'completed' | 'pending' | 'overdue' | 'refunded'

const statusMeta: Record<DisplayStatus, { label: string; badge: string; dot: string }> = {
  completed: { label: 'payments.stCompleted', badge: 'rent-badge--success', dot: 'var(--state-success)' },
  pending: { label: 'payments.stPending', badge: 'rent-badge--info', dot: 'var(--state-info)' },
  overdue: { label: 'payments.stOverdue', badge: 'rent-badge--error', dot: 'var(--state-error)' },
  refunded: { label: 'payments.stRefunded', badge: 'rent-badge--neutral', dot: 'var(--rent-ink-3)' },
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
  income: { label: 'payments.tyIncome', badge: 'rent-badge--primary' },
  expense: { label: 'payments.tyExpense', badge: 'rent-badge--neutral' },
  refund: { label: 'payments.tyRefund', badge: 'rent-badge--warning' },
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
  status?: string
  keyword?: string
  payment_type?: string
  channel?: string
  date_from?: string
  date_to?: string
}

const Payments = () => {
  const { t } = useTranslation()
  const [data, setData] = useState<Payment[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [refundOpen, setRefundOpen] = useState(false)
  const [currentPayment, setCurrentPayment] = useState<Payment | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [refundReason, setRefundReason] = useState('')
  // 逾期滞纳金减免
  const [waiveOpen, setWaiveOpen] = useState(false)
  const [waivePayment, setWaivePayment] = useState<Payment | null>(null)
  const [waiveAmount, setWaiveAmount] = useState('')
  const [waiveReason, setWaiveReason] = useState('')
  // 手动记账
  const [manualOpen, setManualOpen] = useState(false)
  const [manualForm, setManualForm] = useState({
    payer_id: '', payee_id: '', amount: '', currency: 'THB',
    payment_type: 'rent', channel: 'bank_transfer', due_date: '', description: '',
  })
  // 确认到账
  const [confirmTarget, setConfirmTarget] = useState<Payment | null>(null)
  const [confirming, setConfirming] = useState(false)
  // 查看详情
  const [detail, setDetail] = useState<Payment | null>(null)
  const [detailType, setDetailType] = useState<'detail' | 'receipt' | 'invoice'>('detail')
  const [docData, setDocData] = useState<Record<string, any> | null>(null)
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
        payment_type: queryParams.payment_type,
        channel: queryParams.channel,
        date_from: queryParams.date_from,
        date_to: queryParams.date_to,
      })
      const payload = res.data?.data ?? res.data
      setData(payload?.items ?? [])
      setTotal(payload?.total ?? 0)
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('payments.errFetch'))
    } finally {
      setLoading(false)
    }
  }, [queryParams])

  // 导出当前筛选条件下的收付款流水（后端生成 CSV，见 /api/v1/exports/payments）
  const handleExport = async () => {
    try {
      await downloadReport(
        '/exports/payments',
        {
          status: queryParams.status || undefined,
          payment_type: filterType || undefined,
          channel: filterMethod || undefined,
          date_from: filterStart || undefined,
          date_to: filterEnd || undefined,
        },
        'payments.csv',
      )
      message.success(t('payments.msgExported'))
    } catch {
      message.error(t('payments.errExport'))
    }
  }

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

  // 分页页码（对齐原型 rent-pagination 结构）
  const totalPages = Math.max(1, Math.ceil(total / queryParams.pageSize))
  const pageNumbers: (number | string)[] = useMemo(() => {
    const nums: (number | string)[] = []
    const page = queryParams.page
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) nums.push(i)
    } else {
      nums.push(1)
      if (page > 4) nums.push('prev-ellipsis')
      const start = Math.max(2, page - 1)
      const end = Math.min(totalPages - 1, page + 1)
      for (let i = start; i <= end; i++) nums.push(i)
      if (page < totalPages - 3) nums.push('next-ellipsis')
      nums.push(totalPages)
    }
    return nums
  }, [queryParams.page, totalPages])

  const handleSearch = (value: string) => {
    setQueryParams((p) => ({ ...p, keyword: value || undefined, page: 1 }))
  }

  const handleStatusChange = (value: string | undefined) => {
    setQueryParams((p) => ({ ...p, status: value, page: 1 }))
  }

  // 类型/方式/日期筛选：点击「筛选」后统一应用到列表查询
  const handleApplyFilter = () => {
    setQueryParams((p) => ({
      ...p,
      payment_type: filterType || undefined,
      channel: filterMethod || undefined,
      date_from: filterStart || undefined,
      date_to: filterEnd || undefined,
      page: 1,
    }))
  }

  const openRefund = (record: Payment) => {
    setCurrentPayment(record)
    setRefundReason('')
    setRefundOpen(true)
  }

  const handleRefund = async () => {
    if (!currentPayment) return
    if (!refundReason.trim()) {
      message.error(t('payments.errRefundReason'))
      return
    }
    try {
      setSubmitting(true)
      await paymentsApi.refund(String(currentPayment.id), refundReason)
      message.success(t('payments.msgRefundSubmitted'))
      setRefundOpen(false)
      fetchData()
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('payments.errRefundFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  const formatAmount = (p: Payment) => {
    const amt = Number(p.amount || 0)
    // 与设计稿一致：单元格只展示金额，币种由表头“金额 (฿)”体现
    return amt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  // 尚需缴纳的滞纳金（毛额扣除已减免）
  const lateFeeDue = (p: Payment) =>
    Math.max(Number(p.late_fee_accrued || 0) - Number(p.late_fee_waived || 0), 0)

  const formatFee = (v: number) =>
    v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const openWaive = (record: Payment) => {
    setWaivePayment(record)
    setWaiveAmount('')
    setWaiveReason('')
    setWaiveOpen(true)
  }

  // 不填金额 = 全额减免剩余滞纳金（后端同样支持）
  const handleWaive = async () => {
    if (!waivePayment) return
    const amount = waiveAmount.trim() ? Number(waiveAmount) : null
    if (amount !== null && (!Number.isFinite(amount) || amount <= 0)) {
      message.error(t('payments.errWaiveAmount'))
      return
    }
    try {
      setSubmitting(true)
      await paymentsApi.waiveLateFee(String(waivePayment.id), amount, waiveReason.trim())
      message.success(t('payments.msgWaived'))
      setWaiveOpen(false)
      fetchData()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || t('payments.errWaiveFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  // 手动记账提交
  const handleManualSubmit = async () => {
    if (!Number(manualForm.amount) || Number(manualForm.amount) <= 0) {
      message.error(t('payments.errInvalidAmount'))
      return
    }
    // 后端 PaymentCreate.payer_id 是必填（UUID）。此前表单标注「可留空」并把空值发成
    // undefined，提交后只会收到 422，页面笼统提示「登记失败」，用户看不出是哪个字段的问题。
    if (!manualForm.payer_id.trim()) {
      message.error(t('payments.errPayerRequired'))
      return
    }
    try {
      setSubmitting(true)
      await paymentsApi.create({
        ...manualForm,
        payer_id: manualForm.payer_id.trim(),
        payee_id: manualForm.payee_id || undefined,
        amount: Number(manualForm.amount),
        due_date: manualForm.due_date || undefined,
        description: manualForm.description || undefined,
      })
      message.success(t('payments.msgRegistered'))
      setManualOpen(false)
      setManualForm({
        payer_id: '', payee_id: '', amount: '', currency: 'THB',
        payment_type: 'rent', channel: 'bank_transfer', due_date: '', description: '',
      })
      fetchData()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || err?.response?.data?.message || t('payments.errRegisterFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  // 确认到账
  const openConfirm = (record: Payment) => setConfirmTarget(record)
  const handleConfirmSub = async () => {
    if (!confirmTarget) return
    try {
      setConfirming(true)
      await paymentsApi.confirm(String(confirmTarget.id), { note: undefined })
      message.success(t('payments.msgConfirmed'))
      setConfirmTarget(null)
      fetchData()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || t('payments.errConfirmFailed'))
    } finally {
      setConfirming(false)
    }
  }

  // 查看详情 / 凭证 / 发票
  const openDetail = (record: Payment, type: 'detail' | 'receipt' | 'invoice' = 'detail') => {
    setDetail(record)
    setDetailType(type)
    setDocData(null)
    if (type === 'detail') return
    const apiFn = type === 'receipt' ? paymentsApi.receipt : paymentsApi.invoice
    apiFn(String(record.id))
      .then((res: any) => {
        // 后端返回 { data: {...} } 或直接对象；若是文件流则带 urls
        const payload = res?.data?.data ?? res?.data ?? res
        setDocData(typeof payload === 'string' ? { url: payload } : payload)
      })
      .catch(() => {
        setDocData({ error: true })
      })
  }

  const setManual = (k: keyof typeof manualForm) => (e: any) =>
    setManualForm((f) => ({ ...f, [k]: e.target.value }))

  return (
    <div className="rent-main">
      {/* Page Header */}
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title">{t('payments.title')}</h2>
          <p className="rent-page-header__subtitle">{t('payments.subtitle')}</p>
        </div>
        <div className="rent-page-header__actions">
          <button className="rent-btn rent-btn--secondary" onClick={handleExport}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            {t('payments.btnExport')}
          </button>
          <button className="rent-btn rent-btn--primary" onClick={() => setManualOpen(true)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            {t('payments.btnManual')}
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="rent-grid rent-grid--4 rent-mb-5">
        <div className="rent-stat-card">
          <div className="rent-stat-card__label">{t('payments.statIncome')}</div>
          <div className="rent-stat-card__value">฿{Number(statIncome).toLocaleString()}</div>
          <div className="rent-stat-card__delta rent-stat-card__delta--up">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="18 15 12 9 6 15" />
            </svg>
            {t('payments.statDeltaUp')}
          </div>
        </div>
        <div className="rent-stat-card">
          <div className="rent-stat-card__label">{t('payments.statExpense')}</div>
          <div className="rent-stat-card__value">฿{Number(statExpense).toLocaleString()}</div>
          <div className="rent-stat-card__delta rent-stat-card__delta--up">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="6 9 12 15 18 9" />
            </svg>
            {t('payments.statDeltaDown')}
          </div>
        </div>
        <div className="rent-stat-card">
          <div className="rent-stat-card__label">{t('payments.statPending')}</div>
          <div className="rent-stat-card__value">฿{Number(statPending).toLocaleString()}</div>
          <div className="rent-mt-2">
            <span className="rent-badge rent-badge--warning">
              <span className="rent-badge--dot" style={{ background: 'var(--state-warning)' }} />
              {t('payments.pendingCount', { count: summary.pendingCount })}
            </span>
          </div>
        </div>
        <div className="rent-stat-card">
          <div className="rent-stat-card__label">{t('payments.statOverdue')}</div>
          <div className="rent-stat-card__value">฿{Number(statOverdue).toLocaleString()}</div>
          <div className="rent-mt-2">
            <span className="rent-badge rent-badge--error">
              <span className="rent-badge--dot" style={{ background: 'var(--state-error)' }} />
              {t('payments.overdueCount', { count: summary.overdueCount })}
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
              placeholder={t('payments.searchPlaceholder')}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSearch((e.target as HTMLInputElement).value)
              }}
            />
          </div>
        </div>
        <select
          className="rent-form-select"
          style={{ width: 'auto', minWidth: 120 }}
          aria-label={t('payments.ariaType')}
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
        >
          <option value="">{t('payments.optAllTypes')}</option>
          <option value="rent">{t('payments.optRent')}</option>
          <option value="deposit">{t('payments.optDeposit')}</option>
          <option value="commission">{t('payments.optCommission')}</option>
          <option value="service_fee">{t('payments.optServiceFee')}</option>
          <option value="utility">{t('payments.optUtility')}</option>
          <option value="tax">{t('payments.optTax')}</option>
          <option value="refund">{t('payments.optRefund')}</option>
        </select>
        <select
          className="rent-form-select"
          style={{ width: 'auto', minWidth: 120 }}
          aria-label={t('common.status')}
          value={queryParams.status || ''}
          onChange={(e) => handleStatusChange(e.target.value || undefined)}
        >
          <option value="">{t('payments.optAllStatus')}</option>
          <option value="succeeded">{t('payments.stCompleted')}</option>
          <option value="pending">{t('payments.stPending')}</option>
          <option value="overdue">{t('payments.stOverdue')}</option>
          <option value="refunded">{t('payments.stRefunded')}</option>
        </select>
        <select
          className="rent-form-select"
          style={{ width: 'auto', minWidth: 130 }}
          aria-label={t('payments.ariaChannel')}
          value={filterMethod}
          onChange={(e) => setFilterMethod(e.target.value)}
        >
          <option value="">{t('payments.optChannelAll')}</option>
          <option value="promptpay">PromptPay</option>
          <option value="bank_transfer">{t('payments.chBankTransfer')}</option>
          <option value="stripe">{t('payments.chCreditCard')}</option>
          <option value="alipay">{t('payments.chAlipay')}</option>
          <option value="wechat">{t('payments.chWechat')}</option>
          <option value="wise">Wise</option>
        </select>
        <div className="rent-flex rent-gap-2" style={{ alignItems: 'center' }}>
          <input
            type="date"
            className="rent-form-input"
            style={{ width: 'auto' }}
            aria-label={t('payments.ariaStart')}
            value={filterStart}
            onChange={(e) => setFilterStart(e.target.value)}
          />
          <span className="rent-text-muted rent-text-sm">{t('payments.to')}</span>
          <input
            type="date"
            className="rent-form-input"
            style={{ width: 'auto' }}
            aria-label={t('payments.ariaEnd')}
            value={filterEnd}
            onChange={(e) => setFilterEnd(e.target.value)}
          />
        </div>
        <button
          className="rent-btn rent-btn--primary rent-btn--sm"
          onClick={handleApplyFilter}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
          </svg>
          {t('payments.btnFilter')}
        </button>
      </div>

      {/* Payments Table */}
      {loading ? (
        <div className="rent-empty">
          <div className="rent-text-muted">{t('common.loading')}</div>
        </div>
      ) : (
        <>
          <div className="rent-table-wrap payments-table-wrap">
            <table className="rent-table">
              <thead>
                <tr>
                  <th>{t('payments.thCode')}</th>
                  <th>{t('payments.thDate')}</th>
                  <th>{t('payments.thTenantOwner')}</th>
                  <th>{t('payments.thType')}</th>
                  <th className="rent-money">{t('payments.thAmount')}</th>
                  <th className="rent-money">{t('payments.thLateFee')}</th>
                  <th>{t('payments.thChannel')}</th>
                  <th>{t('payments.thContract')}</th>
                  <th>{t('common.status')}</th>
                  <th>{t('common.action')}</th>
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
                  // 后端 Lease 无合同号字段：以租约 ID 前 8 位生成可读合同编号
                  const contractCode =
                    (p as any).contract_code ||
                    (p.lease_id ? `LS-${String(p.lease_id).slice(0, 8).toUpperCase()}` : '-')
                  const date = p.paid_at || p.due_date || '-'
                  const channel = p.channel || '-'
                  const isRefundable = ds === 'overdue'
                  const isConfirmable = ds === 'pending'
                  const feeDue = lateFeeDue(p)
                  return (
                    <tr key={p.id}>
                      <td><span className="rent-mono">{code}</span></td>
                      <td className="rent-table__mono">{date}</td>
                      <td>{tenantName}</td>
                      <td>
                        <span className={`rent-badge ${tMeta.badge}`}>{t(tMeta.label)}</span>
                      </td>
                      <td className="rent-money rent-num">{formatAmount(p)}</td>
                      <td className="rent-money rent-num">
                        {feeDue > 0 ? (
                          <>
                            <span style={{ color: 'var(--state-error)' }}>{formatFee(feeDue)}</span>
                            {Number(p.late_fee_waived || 0) > 0 && (
                              <span className="rent-text-muted rent-text-sm">
                                {t('payments.waivedSuffix', { amount: formatFee(Number(p.late_fee_waived)) })}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="rent-text-muted">-</span>
                        )}
                      </td>
                      <td>{channel}</td>
                      <td><span className="rent-mono">{contractCode}</span></td>
                      <td>
                        <span className={`rent-badge ${sMeta.badge}`}>
                          <span className="rent-badge--dot" style={{ background: sMeta.dot }} />
                          {t(sMeta.label)}
                        </span>
                      </td>
                      <td>
                        <div className="rent-flex rent-gap-2">
                          <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => openDetail(p, 'detail')}>{t('payments.btnView')}</button>
                          {isConfirmable && (
                            <button className="rent-btn rent-btn--primary rent-btn--sm" onClick={() => openConfirm(p)}>{t('payments.btnConfirm')}</button>
                          )}
                          {feeDue > 0 && (
                            <button
                              className="rent-btn rent-btn--ghost rent-btn--sm"
                              onClick={() => openWaive(p)}
                            >
                              {t('payments.btnWaive')}
                            </button>
                          )}
                          {isRefundable && (
                            <button
                              className="rent-btn rent-btn--ghost rent-btn--sm"
                              style={{ color: 'var(--state-error)', borderColor: 'var(--state-error)' }}
                              onClick={() => openRefund(p)}
                            >
                              {t('payments.btnRefund')}
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
            <span className="rent-pagination__info">{t('payments.pageInfo', { count: statTotal.toLocaleString() })}</span>
            <button
              className="rent-pagination__btn"
              aria-label={t('payments.ariaPrev')}
              onClick={() => setQueryParams((p) => ({ ...p, page: Math.max(1, p.page - 1) }))}
              disabled={queryParams.page <= 1}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            {pageNumbers.map((n, idx) =>
              n === 'prev-ellipsis' || n === 'next-ellipsis' ? (
                <span className="rent-pagination__info" key={idx} style={{ margin: '0 4px' }}>...</span>
              ) : (
                <button
                  key={idx}
                  className="rent-pagination__btn"
                  data-active={queryParams.page === n}
                  onClick={() => setQueryParams((p) => ({ ...p, page: Number(n) }))}
                >
                  {n}
                </button>
              )
            )}
            <button
              className="rent-pagination__btn"
              aria-label={t('payments.ariaNext')}
              onClick={() => setQueryParams((p) => ({ ...p, page: Math.min(totalPages, p.page + 1) }))}
              disabled={queryParams.page >= totalPages}
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
              <h3 className="rent-card__title">{t('payments.modalRefundTitle')}</h3>
              <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => setRefundOpen(false)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="rent-modal__body">
              <div className="rent-form-group" style={{ marginBottom: 0 }}>
                <label className="rent-form-label">{t('payments.labelRefundReason')}</label>
                <textarea
                  className="rent-form-textarea"
                  rows={3}
                  placeholder={t('payments.placeholderRefundReason')}
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                />
              </div>
            </div>
            <div className="rent-modal__footer">
              <button className="rent-btn rent-btn--secondary" onClick={() => setRefundOpen(false)}>{t('common.cancel')}</button>
              <button className="rent-btn rent-btn--primary" onClick={handleRefund} disabled={submitting}>
                {submitting ? t('common.submitting') : t('common.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Waive late fee modal */}
      {waiveOpen && waivePayment && (
        <div className="rent-modal-backdrop" onClick={() => setWaiveOpen(false)}>
          <div className="rent-modal payments-modal" onClick={(e) => e.stopPropagation()}>
            <div className="rent-modal__header">
              <h3 className="rent-card__title">{t('payments.modalWaiveTitle')}</h3>
              <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => setWaiveOpen(false)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="rent-modal__body">
              <p className="rent-text-muted rent-text-sm" style={{ marginTop: 0 }}>
                {t('payments.waiveSummary', {
                  due: formatFee(lateFeeDue(waivePayment)),
                  waived: formatFee(Number(waivePayment.late_fee_waived || 0)),
                })}
              </p>
              <div className="rent-form-group">
                <label className="rent-form-label">{t('payments.labelWaiveAmount')}</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="rent-form-input"
                  placeholder={formatFee(lateFeeDue(waivePayment))}
                  value={waiveAmount}
                  onChange={(e) => setWaiveAmount(e.target.value)}
                />
              </div>
              <div className="rent-form-group" style={{ marginBottom: 0 }}>
                <label className="rent-form-label">{t('payments.labelWaiveReason')}</label>
                <textarea
                  className="rent-form-textarea"
                  rows={3}
                  placeholder={t('payments.placeholderWaiveReason')}
                  value={waiveReason}
                  onChange={(e) => setWaiveReason(e.target.value)}
                />
              </div>
            </div>
            <div className="rent-modal__footer">
              <button className="rent-btn rent-btn--secondary" onClick={() => setWaiveOpen(false)}>{t('common.cancel')}</button>
              <button className="rent-btn rent-btn--primary" onClick={handleWaive} disabled={submitting}>
                {submitting ? t('common.submitting') : t('payments.btnConfirmWaive')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual entry modal */}
      {manualOpen && (
        <div className="rent-modal-backdrop" onClick={() => setManualOpen(false)}>
          <div className="rent-modal payments-modal" onClick={(e) => e.stopPropagation()}>
            <div className="rent-modal__header">
              <h3 className="rent-card__title">{t('payments.modalManualTitle')}</h3>
              <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => setManualOpen(false)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="rent-modal__body">
              <div className="rent-form-group">
                <label className="rent-form-label">{t('payments.labelPayer')}</label>
                <input className="rent-form-input" placeholder={t('payments.placeholderPayer')} value={manualForm.payer_id} onChange={setManual('payer_id')} />
              </div>
              <div className="rent-form-group">
                <label className="rent-form-label">{t('payments.labelPayee')}</label>
                <input className="rent-form-input" placeholder={t('payments.placeholderPayee')} value={manualForm.payee_id} onChange={setManual('payee_id')} />
              </div>
              <div className="rent-form-group">
                <label className="rent-form-label">{t('payments.labelAmount')}</label>
                <div className="rent-flex rent-gap-2">
                  <input className="rent-form-input" type="number" min="0" step="0.01" placeholder="0.00" value={manualForm.amount} onChange={setManual('amount')} />
                  <select className="rent-form-select" style={{ width: 110 }} aria-label={t('payments.ariaCurrency')} value={manualForm.currency} onChange={setManual('currency')}>
                    <option value="THB">THB</option>
                    <option value="CNY">CNY</option>
                    <option value="EUR">EUR</option>
                  </select>
                </div>
              </div>
              <div className="rent-form-group">
                <label className="rent-form-label">{t('payments.labelFeeType')}</label>
                <select className="rent-form-select" aria-label={t('payments.ariaFeeType')} value={manualForm.payment_type} onChange={setManual('payment_type')}>
                  <option value="rent">{t('payments.optRent')}</option>
                  <option value="deposit">{t('payments.optDeposit')}</option>
                  <option value="commission">{t('payments.optCommission')}</option>
                  <option value="service_fee">{t('payments.optServiceFee')}</option>
                  <option value="utility">{t('payments.optUtilityFee')}</option>
                  <option value="tax">{t('payments.optTax')}</option>
                </select>
              </div>
              <div className="rent-form-group">
                <label className="rent-form-label">{t('payments.labelChannel')}</label>
                <select className="rent-form-select" aria-label={t('payments.ariaChannel2')} value={manualForm.channel} onChange={setManual('channel')}>
                  <option value="promptpay">PromptPay</option>
                  <option value="bank_transfer">{t('payments.chBankTransfer')}</option>
                  <option value="stripe">{t('payments.chCreditCard')}</option>
                  <option value="alipay">{t('payments.chAlipay')}</option>
                  <option value="wechat">{t('payments.chWechat')}</option>
                  <option value="wise">Wise</option>
                </select>
              </div>
              <div className="rent-form-group">
                <label className="rent-form-label">{t('payments.labelDueDate')}</label>
                <input className="rent-form-input" type="date" value={manualForm.due_date} onChange={setManual('due_date')} />
              </div>
              <div className="rent-form-group" style={{ marginBottom: 0 }}>
                <label className="rent-form-label">{t('payments.labelRemark')}</label>
                <textarea className="rent-form-textarea" rows={3} placeholder={t('payments.placeholderRemark')} value={manualForm.description} onChange={setManual('description')} />
              </div>
            </div>
            <div className="rent-modal__footer">
              <button className="rent-btn rent-btn--secondary" onClick={() => setManualOpen(false)}>{t('common.cancel')}</button>
              <button className="rent-btn rent-btn--primary" onClick={handleManualSubmit} disabled={submitting}>
                {submitting ? t('common.submitting') : t('payments.btnRegister')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm arrival modal */}
      {confirmTarget && (
        <div className="rent-modal-backdrop" onClick={() => setConfirmTarget(null)}>
          <div className="rent-modal payments-modal" onClick={(e) => e.stopPropagation()}>
            <div className="rent-modal__header">
              <h3 className="rent-card__title">{t('payments.modalConfirmTitle')}</h3>
              <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => setConfirmTarget(null)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="rent-modal__body">
              <p className="rent-text-muted rent-text-sm" style={{ marginTop: 0 }}>
                {t('payments.confirmSummary', { amount: formatAmount(confirmTarget), status: t(statusMeta[toDisplayStatus(confirmTarget)].label) })}
              </p>
            </div>
            <div className="rent-modal__footer">
              <button className="rent-btn rent-btn--secondary" onClick={() => setConfirmTarget(null)}>{t('common.cancel')}</button>
              <button className="rent-btn rent-btn--primary" onClick={handleConfirmSub} disabled={confirming}>
                {confirming ? t('common.submitting') : t('payments.btnConfirmArrival')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail / receipt / invoice modal */}
      {detail && (
        <div className="rent-modal-backdrop" onClick={() => setDetail(null)}>
          <div className="rent-modal payments-modal" onClick={(e) => e.stopPropagation()}>
            <div className="rent-modal__header">
              <h3 className="rent-card__title">{t('payments.modalDetailTitle')}</h3>
              <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => setDetail(null)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="rent-modal__body">
              {detailType === 'detail' ? (
                <>
                  <div className="rent-form-group"><div className="rent-modal-row"><span className="rent-text-muted">{t('payments.thCode')}</span><span className="rent-mono">{(detail as any).code || `PMT-${detail.id}`}</span></div></div>
                  <div className="rent-form-group"><div className="rent-modal-row"><span className="rent-text-muted">{t('payments.rowAmount')}</span><span>{formatAmount(detail)} {(detail as any).currency || 'THB'}</span></div></div>
                  <div className="rent-form-group"><div className="rent-modal-row"><span className="rent-text-muted">{t('payments.thType')}</span><span>{t(typeMeta[toDisplayType(detail)].label)}</span></div></div>
                  <div className="rent-form-group"><div className="rent-modal-row"><span className="rent-text-muted">{t('common.status')}</span><span>{t(statusMeta[toDisplayStatus(detail)].label)}</span></div></div>
                  <div className="rent-form-group"><div className="rent-modal-row"><span className="rent-text-muted">{t('payments.thChannel')}</span><span>{detail.channel || '-'}</span></div></div>
                  <div className="rent-form-group"><div className="rent-modal-row"><span className="rent-text-muted">{t('payments.rowDueDate')}</span><span>{detail.due_date || '-'}</span></div></div>
                  <div className="rent-form-group" style={{ marginBottom: 0 }}><div className="rent-modal-row"><span className="rent-text-muted">{t('payments.labelRemark')}</span><span>{detail.description || '-'}</span></div></div>
                </>
              ) : docData === null ? (
                <div className="rent-empty rent-text-muted">{t('common.loading')}</div>
              ) : (docData as any)?.error ? (
                <div className="rent-empty rent-text-muted">{t('payments.errDocFetch')}</div>
              ) : (
                <div className="rent-empty">
                  {(docData as any)?.url ? (
                    <img src={(docData as any).url} alt={t('payments.altDoc')} style={{ maxWidth: '100%', maxHeight: '60vh', objectFit: 'contain' }} />
                  ) : (
                    <pre className="rent-text-muted" style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(docData, null, 2)}</pre>
                  )}
                </div>
              )}
            </div>
            <div className="rent-modal__footer rent-flex" style={{ justifyContent: 'flex-end', gap: 8 }}>
              {detailType === 'detail' && (
                <>
                  <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => openDetail(detail, 'receipt')}>{t('payments.btnReceipt')}</button>
                  <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => openDetail(detail, 'invoice')}>{t('payments.btnInvoice')}</button>
                </>
              )}
              <button className="rent-btn rent-btn--secondary" onClick={() => setDetail(null)}>{t('common.close')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Payments
