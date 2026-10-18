import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { message, Modal } from 'antd'
import { useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import api from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import { useCachedQuery } from '@/lib/queryCache'
import './payments.css'

interface PaymentVoucher {
  id: string
  amount: number
  currency?: string
  payment_date: string
  payment_method: string
  receipt_url?: string
  status: 'pending' | 'approved' | 'rejected'
  review_comment?: string
  created_at: string
  bill_type?: string
  property_name?: string
  due_date?: string
  [key: string]: any
}

type FilterKey = 'all' | 'pending' | 'approved' | 'rejected'
type StatusKey = Exclude<FilterKey, 'all'>

// 接口状态（pending/processing/succeeded/failed/refunded/expired/disputed）→ 页面展示分组
const normalizeStatus = (status?: string): StatusKey => {
  const v = String(status || '').toLowerCase()
  if (v === 'succeeded' || v === 'paid' || v === 'approved') return 'approved'
  if (v === 'failed' || v === 'expired' || v === 'disputed' || v === 'refunded' || v === 'rejected') {
    return 'rejected'
  }
  return 'pending'
}

const methodIconMap: Record<string, React.ReactNode> = {
  bank_transfer: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 21h18"/><path d="M3 10h18"/><path d="M5 6l7-3 7 3"/><path d="M4 10v11"/><path d="M20 10v11"/></svg>
  ),
  alipay: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 7a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3V5a3 3 0 0 0-3-3H5a3 3 0 0 0-3 3z"/><path d="M2 17a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3v-2a3 3 0 0 0-3-3H5a3 3 0 0 0-3 3z"/></svg>
  ),
  wechat: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 12l2 2 4-4"/><path d="M21 12c0 5-3.5 7.5-9 9-5.5-1.5-9-4-9-9V5l9-3 9 3z"/></svg>
  ),
  promptpay: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
  ),
  credit_card: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
  ),
}

const defaultMethodIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
)

/* ===== 业主在线缴费（业主独有的数据块：在线支付管理费 / 服务费 / 押金） ===== */

interface OnlinePayMethod {
  id: string
  name: string
  desc: string
  icon: React.ReactNode
}

const onlinePayMethods: OnlinePayMethod[] = [
  {
    id: 'qr',
    name: 'ownerPayments.pmQr',
    desc: 'ownerPayments.pmQrDesc',
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <path d="M14 14h3v3h-3z" />
        <path d="M20 14v3" />
        <path d="M14 20h3" />
        <path d="M20 20v1" />
      </svg>
    ),
  },
  {
    id: 'card',
    name: 'Visa / Mastercard',
    desc: 'ownerPayments.pmCardDesc',
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <line x1="2" y1="10" x2="22" y2="10" />
      </svg>
    ),
  },
  {
    id: 'alipay',
    name: 'ownerPayments.pmAlipay',
    desc: 'ownerPayments.pmAlipayDesc',
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <path d="M8 12h8" />
        <path d="M12 8v8" />
      </svg>
    ),
  },
  {
    id: 'wechat',
    name: 'ownerPayments.pmWechat',
    desc: 'WeChat Pay',
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
      </svg>
    ),
  },
  {
    id: 'wise',
    name: 'ownerPayments.pmWise',
    desc: 'ownerPayments.pmWiseDesc',
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="3 7 9 7 7 9" />
        <polyline points="3 17 9 17 7 15" />
        <line x1="12" y1="7" x2="21" y2="7" />
        <line x1="12" y1="17" x2="21" y2="17" />
        <line x1="3" y1="12" x2="21" y2="12" />
      </svg>
    ),
  },
]

const fmtMoney = (v: number) => `RM ${Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/**
 * 业主在线缴费卡片：关联名下房源、选择支付方式并走 POST /payments 下单。
 * 房源自 /owners/me/properties（无档案时返回空数组，不阻断页面）。
 */
const OwnerOnlinePayCard = ({ onPaid }: { onPaid: () => void }) => {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const uid = user?.id ?? 'anon'
  const [selected, setSelected] = useState<OnlinePayMethod>(onlinePayMethods[0])
  const [amount, setAmount] = useState(0)
  const [selectedProperty, setSelectedProperty] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const qProps = useCachedQuery<{ id: string; label: string }[]>({
    queryKey: ['tenant-payments', 'properties', uid],
    cacheKey: `tenant-payments:properties:${uid}`,
    queryFn: async () => {
      try {
        const res = await api.get('/owners/me/properties')
        const items = Array.isArray(res.data) ? res.data : (res.data?.items ?? [])
        return items.map((p: any) => ({
          id: p.id,
          label: `${p.address || p.property_name || t('ownerPayments.fProperty')} · ${p.room_number || ''}`,
        }))
      } catch {
        return []
      }
    },
  })
  const properties = qProps.data ?? []

  // 默认选中第一套房产（背景刷新时保留用户已选中的选择）
  useEffect(() => {
    setSelectedProperty((prev) => prev || properties[0]?.id || '')
  }, [properties])

  const handleConfirmPay = async () => {
    if (amount <= 0) {
      message.warning(t('ownerPayments.warnAmount'))
      return
    }
    if (!user) {
      message.error(t('ownerPayments.errSession'))
      return
    }
    setSubmitting(true)
    try {
      await api.post('/payments', {
        payer_id: user.id,
        amount,
        currency: 'THB',
        payment_type: 'service_fee',
        channel: selected.id,
        idempotency_key: `owner-pay-${user.id}-${Date.now()}`,
        description: '业主在线缴费',
      })
      message.success(t('ownerPayments.msgCreated'))
      onPaid()
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('ownerPayments.errCreate'))
    } finally {
      setSubmitting(false)
    }
  }

  const displayAmount = amount > 0 ? amount : 0

  return (
    <div className="pay-grid">
      {/* 左栏：在线缴费表单 */}
      <div className="rent-card">
        <div className="rent-card__header">
          <h3 className="rent-card__title">{t('ownerPayments.cardTitle')}</h3>
          <span className="rent-badge rent-badge--info">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            {t('ownerPayments.securePay')}
          </span>
        </div>
        <div className="rent-card__body">
          <div className="rent-form-group">
            <label className="rent-form-label">{t('ownerPayments.fPaymentItem')}</label>
            <select className="rent-form-select">
              <option>{t('ownerPayments.fManagementFee')}</option>
              <option>{t('ownerPayments.fRepairFee')}</option>
              <option>{t('ownerPayments.fServiceFee')}</option>
              <option>{t('ownerPayments.fDeposit')}</option>
            </select>
          </div>

          <div className="rent-form-group">
            <label className="rent-form-label">{t('ownerPayments.fRelatedProperty')}</label>
            <select
              className="rent-form-select"
              value={selectedProperty}
              onChange={(e) => setSelectedProperty(e.target.value)}
            >
              {properties.length ? (
                properties.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))
              ) : (
                <option value="">{t('ownerPayments.noRelatedProperty')}</option>
              )}
            </select>
          </div>

          <div className="rent-form-group">
            <label className="rent-form-label">{t('ownerPayments.fAmount')}</label>
            <div className="pay-amount-wrap">
              <span className="pay-amount-prefix">RM</span>
              <input
                type="text"
                className="pay-amount-input"
                value={amount > 0 ? amount.toFixed(2) : ''}
                placeholder={t('ownerPayments.phAmount')}
                onChange={(e) => {
                  const n = Number(e.target.value.replace(/,/g, ''))
                  if (!Number.isNaN(n)) setAmount(n)
                }}
              />
            </div>
            <div className="rent-form-hint">{t('ownerPayments.amountHint', { amount: fmtMoney(displayAmount) })}</div>
          </div>

          <div className="rent-form-group">
            <label className="rent-form-label">{t('ownerPayments.fPaymentMethod')}</label>
            <div className="rent-grid rent-grid--3 pay-method-grid">
              {onlinePayMethods.map((m) => (
                <div
                  key={m.id}
                  className="pay-method-card"
                  data-selected={selected.id === m.id}
                  onClick={() => setSelected(m)}
                >
                  <span className="pay-method-card__check">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </span>
                  <div className="pay-method-card__icon">{m.icon}</div>
                  <div className="pay-method-card__label">{t(m.name)}</div>
                  <div className="pay-method-card__sub">{t(m.desc)}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="pay-method-panel">
            <div className="rent-flex rent-flex--between rent-gap-3 rent-mb-3">
              <div className="rent-flex rent-gap-2" style={{ alignItems: 'center' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--rent-primary)" strokeWidth="2">
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                  <path d="M14 14h3v3h-3z" />
                  <path d="M20 14v3" />
                  <path d="M14 20h3" />
                  <path d="M20 20v1" />
                </svg>
                <span className="rent-text-bold" style={{ fontSize: 14, color: 'var(--rent-ink)' }}>
                  {t(selected.name)}
                </span>
              </div>
              <span className="rent-badge rent-badge--warning">
                <span className="rent-badge--dot" style={{ background: 'var(--state-warning)' }} />
                {t('ownerPayments.qrValid')}
              </span>
            </div>
            <div className="rent-text-center">
              <div className="pay-qr-box" style={{ margin: '0 auto 12px' }}>
                <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M3 7V5a2 2 0 0 1 2-2h2" />
                  <path d="M17 3h2a2 2 0 0 1 2 2v2" />
                  <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
                  <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
                  <rect x="7" y="7" width="3" height="3" />
                  <rect x="14" y="7" width="3" height="3" />
                  <rect x="7" y="14" width="3" height="3" />
                  <rect x="14" y="14" width="3" height="3" />
                </svg>
                <span className="rent-text-sm rent-text-muted">{t('ownerPayments.pmQr')}</span>
              </div>
              <p className="pay-panel-tip">{t('ownerPayments.qrTip')}</p>
            </div>
          </div>

          <div className="rent-form-group">
            <label className="pay-check">
              <input type="checkbox" defaultChecked />
              <span>
                {t('ownerPayments.termsPrefix')}<a href="#">{t('ownerPayments.termsLink')}</a>{t('ownerPayments.termsSuffix')}
              </span>
            </label>
          </div>

          <button
            type="button"
            className="rent-btn rent-btn--primary rent-btn--lg rent-btn--block"
            onClick={handleConfirmPay}
            disabled={submitting}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            {submitting ? t('common.submitting') : t('ownerPayments.confirmPay', { amount: fmtMoney(displayAmount) })}
          </button>
        </div>
      </div>

      {/* 右栏：订单摘要 */}
      <div className="rent-card">
        <div className="rent-card__header">
          <h3 className="rent-card__title">{t('ownerPayments.orderDetail')}</h3>
          <span className="rent-caption">{t('ownerPayments.orderNo')} #{`PAY${dayjs().format('YYYYMMDDHHmmss')}`}</span>
        </div>
        <div className="rent-card__body">
          <div className="pay-summary-row">
            <span className="pay-summary-row__label">{t('ownerPayments.fPaymentItem')}</span>
            <span className="pay-summary-row__value">{dayjs().format(t('ownerPayments.monthFormat'))}{t('ownerPayments.fManagementFee')}</span>
          </div>
          <div className="pay-summary-row">
            <span className="pay-summary-row__label">{t('ownerPayments.fRelatedProperty')}</span>
            <span className="pay-summary-row__value">
              {properties.find((p) => p.id === selectedProperty)?.label.split(' · ')[0] || '—'}
            </span>
          </div>
          <div className="pay-summary-row">
            <span className="pay-summary-row__label">{t('ownerPayments.amountDue')}</span>
            <span className="pay-summary-row__value rent-mono">{fmtMoney(displayAmount)}</span>
          </div>
          <div className="pay-summary-row">
            <span className="pay-summary-row__label">{t('ownerPayments.discount')}</span>
            <span className="pay-summary-row__value rent-mono" style={{ color: 'var(--state-success)' }}>
              -RM 0.00
            </span>
          </div>
          <hr className="rent-divider" />
          <div className="pay-summary-total">
            <span className="pay-summary-total__label">{t('ownerPayments.amountPaid')}</span>
            <span className="pay-summary-total__value rent-num">{fmtMoney(displayAmount)}</span>
          </div>
          <div className="rent-mt-4">
            <div className="rent-flex rent-gap-2 rent-mb-2" style={{ alignItems: 'center' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--state-success)" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <polyline points="9 12 11 14 15 10" />
              </svg>
              <span className="rent-caption" style={{ color: 'var(--state-success)' }}>
                {t('ownerPayments.pciNote')}
              </span>
            </div>
            <div className="rent-flex rent-gap-2" style={{ alignItems: 'center' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--rent-ink-3)" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span className="rent-caption">{t('ownerPayments.arrivalNote')}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const TenantPayments = () => {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const uid = user?.id ?? 'anon'
  // 业主独有数据块（在线缴费）仅在业主身份下渲染；其余区块两个角色完全一致
  const isOwner = user?.role === 'owner'
  const queryClient = useQueryClient()
  const [submitting, setSubmitting] = useState(false)
  const [filter, setFilter] = useState<FilterKey>('all')
  const [keyword, setKeyword] = useState('')
  /** 查看凭证详情弹窗（数据来自 /payments/me 返回的支付单实体） */
  const [detailBill, setDetailBill] = useState<PaymentVoucher | null>(null)

  // form state (replaces antd Form)
  const [amount, setAmount] = useState('')
  const [paymentDate, setPaymentDate] = useState(dayjs().format('YYYY-MM-DD'))
  const [paymentMethod, setPaymentMethod] = useState('bank_transfer')
  const [fileName, setFileName] = useState('')
  const [fileObj, setFileObj] = useState<File | null>(null)

  const chipLabelMap: Record<FilterKey, string> = {
    all: t('tenantPayments.chipAll'),
    pending: t('tenantPayments.chipPending'),
    approved: t('tenantPayments.chipApproved'),
    rejected: t('tenantPayments.chipRejected'),
  }

  const recordStatusMap: Record<StatusKey, { label: string; cls: string }> = {
    pending: { label: t('tenantPayments.statusPending'), cls: 'rent-pay-record__status--warning' },
    approved: { label: t('tenantPayments.statusApproved'), cls: 'rent-pay-record__status--success' },
    rejected: { label: t('tenantPayments.statusRejected'), cls: 'rent-pay-record__status--error' },
  }

  const methodLabelMap: Record<string, string> = {
    bank_transfer: t('tenantPayments.methodBankTransfer'),
    cash: t('tenantPayments.methodCash'),
    alipay: t('tenantPayments.methodAlipay'),
    wechat: t('tenantPayments.methodWechat'),
    promptpay: t('tenantPayments.methodPromptpay'),
    credit_card: t('tenantPayments.methodCreditCard'),
  }

  const q = useCachedQuery<PaymentVoucher[]>({
    queryKey: ['tenant-payments', 'mine', uid],
    cacheKey: `tenant-payments:mine:${uid}`,
    queryFn: async () => {
      try {
        const res = await api.get('/payments/me')
        const payload = res.data?.data ?? res.data
        // 真实字段映射：接口使用 channel / payment_type
        return (payload?.items ?? []).map((p: any) => ({
          ...p,
          payment_method: p.payment_method ?? p.channel,
          bill_type: p.bill_type ?? p.payment_type,
        }))
      } catch {
        return []
      }
    },
  })
  const data = q.data ?? []
  const loading = q.isPending && !q.data
  const refresh = useCallback(() => {
    void q.refetch({ cancelRefetch: false })
  }, [q])

  const filteredData = useMemo(() => {
    if (filter === 'all') return data
    return data.filter((d) => normalizeStatus(d.status) === filter)
  }, [data, filter])

  const summary = useMemo(() => {
    const pending = data.filter((d) => normalizeStatus(d.status) === 'pending')
    const approved = data.filter((d) => normalizeStatus(d.status) === 'approved')
    const sum = (arr: PaymentVoucher[]) => arr.reduce((acc, x) => acc + Number(x.amount || 0), 0)
    return {
      pendingTotal: sum(pending),
      approvedTotal: sum(approved),
    }
  }, [data])

  // 搜索：凭证编号 / 月份 / 类型
  const searchFiltered = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    if (!kw) return filteredData
    return filteredData.filter((d) => {
      const dateStr = dayjs(d.payment_date || d.created_at).format(t('tenantPayments.monthFormat'))
      return [
        d.id,
        d.bill_type,
        methodLabelMap[d.payment_method],
        dateStr,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(kw))
    })
  }, [filteredData, keyword, t])

  // 按月分组（倒序）
  const monthGroups = useMemo(() => {
    const map = new Map<string, PaymentVoucher[]>()
    for (const d of searchFiltered) {
      const key = dayjs(d.payment_date || d.created_at || dayjs()).format(t('tenantPayments.monthFormat'))
      const arr = map.get(key) || []
      arr.push(d)
      map.set(key, arr)
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1))
  }, [searchFiltered])

  const firstPending = useMemo(
    () => data.find((d) => normalizeStatus(d.status) === 'pending'),
    [data],
  )
  const heroProperty = firstPending?.property_name || firstPending?.description || ''
  const heroDue = firstPending?.due_date
    ? dayjs(firstPending.due_date).format(t('tenantPayments.dateDisplayFormat'))
    : ''

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) {
      setFileObj(null)
      setFileName('')
      return
    }
    setFileObj(f)
    setFileName(f.name)
  }

  const scrollToUpload = () => {
    const el = document.getElementById('pay-upload')
    if (el) el.scrollIntoView({ behavior: 'smooth' })
  }

  // 凭证原件走鉴权端点（receipts 目录不对外静态托管），用 query token 兜底预览
  const openReceipt = (bill: PaymentVoucher) => {
    const token = localStorage.getItem('token') || ''
    window.open(`/api/v1/payments/${bill.id}/proof-file?token=${encodeURIComponent(token)}`, '_blank')
  }

  const handleSubmit = async () => {
    const amt = Number(amount)
    if (!amount || isNaN(amt) || amt <= 0) {
      message.warning(t('tenantPayments.warnAmount'))
      return
    }
    if (!paymentDate) {
      message.warning(t('tenantPayments.warnDate'))
      return
    }
    if (!paymentMethod) {
      message.warning(t('tenantPayments.warnMethod'))
      return
    }
    setSubmitting(true)
    const formData = new FormData()
    formData.append('amount', String(amt))
    formData.append('payment_date', paymentDate)
    formData.append('payment_method', paymentMethod)
    if (fileObj) {
      formData.append('receipt', fileObj)
    }

    try {
      // 后端会校验并真正落盘凭证（返回落库的 receipt_url），失败即抛错。
      // 这里不再吞掉异常、也不再伪造一条本地记录——「已上传」必须是服务端确认过的。
      const res = await api.post('/payments/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      const payload = res.data?.data ?? res.data
      if (!payload?.id) {
        throw new Error('upload response missing id')
      }

      message.success(t('tenantPayments.uploadSuccess'))
      const newItem: PaymentVoucher = {
        ...payload,
        payment_method: payload.payment_method ?? payload.channel,
        bill_type: payload.bill_type ?? payload.payment_type,
      }
      queryClient.setQueryData(
        ['tenant-payments', 'mine', uid],
        (prev: PaymentVoucher[] | undefined) => [newItem, ...(prev ?? [])],
      )
      setAmount('')
      setPaymentDate(dayjs().format('YYYY-MM-DD'))
      setPaymentMethod('bank_transfer')
      setFileObj(null)
      setFileName('')
    } catch (err: any) {
      message.error(err?.response?.data?.detail || err?.response?.data?.message || t('tenantPayments.uploadFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  const chips: FilterKey[] = ['all', 'pending', 'approved', 'rejected']

  return (
    <>
      {loading && (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <span className="rent-text-muted">{t('common.loading')}</span>
        </div>
      )}

      {/* Hero: 本月租金大卡片 */}
      <div className="rent-pay-hero">
        <div className="rent-pay-hero__deco rent-pay-hero__deco--1"></div>
        <div className="rent-pay-hero__deco rent-pay-hero__deco--2"></div>
        <div className="rent-pay-hero__deco rent-pay-hero__deco--3"></div>
        <div className="rent-pay-hero__content">
          <p className="rent-pay-hero__label">{t('tenantPayments.monthRent')}</p>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
            <h2 className="rent-pay-hero__amount">฿{summary.pendingTotal.toLocaleString()}</h2>
            <span className="rent-pay-hero__status"><span className="rent-pay-hero__status-dot"></span>{t('tenantPayments.toPay')}</span>
          </div>
          {(heroProperty || heroDue) && (
            <div className="rent-pay-hero__meta">
              {heroProperty && (
                <span className="rent-pay-hero__meta-item">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/><path d="M9 9v.01"/><path d="M9 12v.01"/><path d="M9 15v.01"/><path d="M9 18v.01"/></svg>
                  {heroProperty}
                </span>
              )}
              {heroProperty && heroDue && <span className="rent-pay-hero__meta-sep"></span>}
              {heroDue && (
                <span className="rent-pay-hero__meta-item">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  {t('tenantPayments.payBefore', { date: heroDue })}
                </span>
              )}
            </div>
          )}
          <button className="rent-pay-hero__upload" onClick={scrollToUpload}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            {t('tenantPayments.uploadVoucher')}
          </button>
        </div>
      </div>

      {/* 付款状态摘要条 */}
      <div className="rent-pay-summary">
        <div className="rent-pay-summary__item">
          <div><span className="rent-pay-summary__num">{data.length}</span><span className="rent-pay-summary__num-unit">{t('tenantPayments.uploadedCount')}</span></div>
          <div className="rent-pay-summary__label">{t('tenantPayments.uploadedVouchers')}</div>
        </div>
        <div className="rent-pay-summary__item">
          <div><span className="rent-pay-summary__num">{data.filter((d) => normalizeStatus(d.status) === 'pending').length}</span><span className="rent-pay-summary__num-unit">{t('tenantPayments.unitCount')}</span></div>
          <div className="rent-pay-summary__label">{t('tenantPayments.pendingReview')}</div>
        </div>
        <div className="rent-pay-summary__item">
          <div><span className="rent-pay-summary__num">{data.filter((d) => normalizeStatus(d.status) === 'approved').length}</span><span className="rent-pay-summary__num-unit">{t('tenantPayments.unitCount')}</span></div>
          <div className="rent-pay-summary__label">{t('tenantPayments.confirmed')}</div>
        </div>
      </div>

      {/* 业主在线缴费（业主独有数据块） */}
      {isOwner && <OwnerOnlinePayCard onPaid={refresh} />}

      {/* 搜索框 */}
      <div className="rent-pay-search">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--rent-ink-3)" strokeWidth="2" style={{ flexShrink: 0 }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input
          type="text"
          placeholder={t('tenantPayments.searchPlaceholder')}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
      </div>

      {/* 状态筛选胶囊 */}
      <div className="rent-chips no-scrollbar">
        {chips.map((k) => (
          <button
            key={k}
            className="rent-chip"
            data-active={filter === k}
            onClick={() => setFilter(k)}
          >
            {chipLabelMap[k]}
          </button>
        ))}
      </div>

      {/* 上传凭证表单 */}
      <div className="rent-card" id="pay-upload" style={{ marginBottom: 32 }}>
        <div className="rent-card__header">
          <h3 className="rent-card__title">{t('tenantPayments.uploadTitle')}</h3>
        </div>
        <div className="rent-card__body">
          <div className="rent-pay-form-row">
            <div className="rent-pay-form-group">
              <label className="rent-pay-form-label">{t('tenantPayments.labelAmount')}</label>
              <input
                className="rent-pay-form-input"
                type="number"
                min={0}
                placeholder={t('tenantPayments.amountPlaceholder')}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="rent-pay-form-group">
              <label className="rent-pay-form-label">{t('tenantPayments.labelDate')}</label>
              <input
                className="rent-pay-form-input"
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
              />
            </div>
          </div>
          <div className="rent-pay-form-group">
            <label className="rent-pay-form-label">{t('tenantPayments.labelMethod')}</label>
            <select
              className="rent-pay-form-select"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
            >
              {Object.entries(methodLabelMap).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div className="rent-pay-form-group">
            <label className="rent-pay-form-label">{t('tenantPayments.labelImage')}</label>
            <label className="rent-pay-file-drop">
              <div className="rent-pay-file-drop__icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              </div>
              <div className="rent-pay-file-drop__text">{t('tenantPayments.dropText')}</div>
              <div className="rent-pay-file-drop__hint">{t('tenantPayments.dropHint')}</div>
              <input
                type="file"
                accept="image/*,application/pdf"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
            </label>
            {fileName && <div className="rent-pay-file-name">{t('tenantPayments.selected', { name: fileName })}</div>}
          </div>
          <button
            className="rent-btn rent-btn--primary rent-btn--block"
            disabled={submitting}
            onClick={handleSubmit}
          >
            {submitting ? t('tenantPayments.submitting') : t('tenantPayments.submitVoucher')}
          </button>
        </div>
      </div>

      {/* 付款记录 */}
      <div className="rent-pay-section">
        <h3 className="rent-pay-section__title">{t('tenantPayments.recordsTitle')}</h3>
        {monthGroups.length ? (
          monthGroups.map(([month, bills]) => (
            <div key={month} className="rent-pay-month">
              <div className="rent-pay-month__header">
                <h4 className="rent-pay-month__title">{month}</h4>
                <span className="rent-pay-month__count">{bills.length} {t('tenantPayments.countUnit')}</span>
              </div>
              {bills.map((bill, idx) => {
                const statusKey = normalizeStatus(bill.status)
                const st = recordStatusMap[statusKey]
                const method = methodLabelMap[bill.payment_method] || bill.payment_method || t('tenantPayments.otherMethod')
                const uploadDate = dayjs(bill.created_at || bill.payment_date).format('YYYY-MM-DD')
                const recordNo = `PAY-${dayjs(bill.payment_date || bill.created_at).format('YYYY-MM')}${String(idx + 1).padStart(2, '0')}`
                return (
                  <div key={bill.id} className="rent-pay-record">
                    <div className="rent-pay-record__method">
                      {methodIconMap[bill.payment_method] || defaultMethodIcon}
                    </div>
                    <div className="rent-pay-record__main">
                      <div className="rent-pay-record__id">{bill.id.startsWith('local-') ? recordNo : bill.id}</div>
                      <div className="rent-pay-record__meta">
                        <span>{method}</span>
                        <span className="rent-pay-record__meta-sep"></span>
                        <span>{t('tenantPayments.uploadedAt', { date: uploadDate })}</span>
                      </div>
                    </div>
                    <div className="rent-pay-record__amount">฿{Number(bill.amount || 0).toLocaleString()}</div>
                    <div className={`rent-pay-record__status ${st.cls}`}>
                      <span className="rent-pay-record__status-dot"></span>{st.label}
                    </div>
                    <div className="rent-pay-record__actions">
                      {statusKey === 'rejected' ? (
                        <button className="rent-btn rent-btn--primary rent-btn--sm" onClick={scrollToUpload}>{t('tenantPayments.reupload')}</button>
                      ) : (
                        <button
                          className="rent-btn rent-btn--secondary rent-btn--sm"
                          onClick={() => setDetailBill(bill)}
                        >
                          {t('tenantPayments.view')}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ))
        ) : (
          <div className="rent-empty">{t('tenantPayments.empty')}</div>
        )}
      </div>

      {/* 凭证详情（字段全部来自支付单实体，不做臆造） */}
      <Modal
        title={t('tenantPayments.detailTitle')}
        open={!!detailBill}
        onCancel={() => setDetailBill(null)}
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            {detailBill?.receipt_url && (
              <button
                type="button"
                className="rent-btn rent-btn--secondary"
                onClick={() => detailBill && openReceipt(detailBill)}
              >
                {t('tenantPayments.detailReceipt')}
              </button>
            )}
            <button
              type="button"
              className="rent-btn rent-btn--primary"
              onClick={() => setDetailBill(null)}
            >
              {t('tenantPayments.close')}
            </button>
          </div>
        }
      >
        {detailBill && (
          <div className="mt-detail">
            <div className="mt-detail__rows">
              <div className="mt-detail__row">
                <span className="mt-detail__label">{t('tenantPayments.detailNo')}</span>
                <span className="mt-detail__value">{detailBill.id}</span>
              </div>
              <div className="mt-detail__row">
                <span className="mt-detail__label">{t('tenantPayments.detailAmount')}</span>
                <span className="mt-detail__value">
                  ฿{Number(detailBill.amount || 0).toLocaleString()} {detailBill.currency || ''}
                </span>
              </div>
              <div className="mt-detail__row">
                <span className="mt-detail__label">{t('tenantPayments.detailDate')}</span>
                <span className="mt-detail__value">
                  {detailBill.payment_date
                    ? dayjs(detailBill.payment_date).format(t('tenantPayments.dateDisplayFormat'))
                    : '—'}
                </span>
              </div>
              <div className="mt-detail__row">
                <span className="mt-detail__label">{t('tenantPayments.detailMethod')}</span>
                <span className="mt-detail__value">
                  {methodLabelMap[detailBill.payment_method] || detailBill.payment_method || t('tenantPayments.otherMethod')}
                </span>
              </div>
              <div className="mt-detail__row">
                <span className="mt-detail__label">{t('tenantPayments.detailStatusCol')}</span>
                <span className="mt-detail__value">
                  {recordStatusMap[normalizeStatus(detailBill.status)].label}
                </span>
              </div>
              <div className="mt-detail__row">
                <span className="mt-detail__label">{t('tenantPayments.detailUploadedAt')}</span>
                <span className="mt-detail__value">
                  {detailBill.created_at
                    ? dayjs(detailBill.created_at).format('YYYY-MM-DD HH:mm')
                    : '—'}
                </span>
              </div>
              {detailBill.bill_type && (
                <div className="mt-detail__row">
                  <span className="mt-detail__label">{t('tenantPayments.detailBillType')}</span>
                  <span className="mt-detail__value">{detailBill.bill_type}</span>
                </div>
              )}
              {detailBill.property_name && (
                <div className="mt-detail__row">
                  <span className="mt-detail__label">{t('tenantPayments.detailProperty')}</span>
                  <span className="mt-detail__value">{detailBill.property_name}</span>
                </div>
              )}
              {detailBill.due_date && (
                <div className="mt-detail__row">
                  <span className="mt-detail__label">{t('tenantPayments.detailDue')}</span>
                  <span className="mt-detail__value">
                    {dayjs(detailBill.due_date).format(t('tenantPayments.dateDisplayFormat'))}
                  </span>
                </div>
              )}
              {detailBill.description && (
                <div className="mt-detail__row">
                  <span className="mt-detail__label">{t('tenantPayments.detailDesc')}</span>
                  <span className="mt-detail__value">{detailBill.description}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}

export default TenantPayments
