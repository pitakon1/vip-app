import { useCallback, useEffect, useState } from 'react'
import { message, Modal, Spin, Empty } from 'antd'
import dayjs from 'dayjs'
import type { ReactNode } from 'react'
import api from '@/lib/api'
import useAuthStore from '@/stores/auth'
import { useCachedQuery } from '@/lib/queryCache'
import { useTranslation } from 'react-i18next'
import './payments.css'

interface PaymentMethod {
  id: string
  name: string
  desc: string
  icon: ReactNode
  color: string
  bg: string
}

interface PaymentRecord {
  id: string
  amount: number
  currency?: string
  status: string
  channel?: string
  payment_type?: string
  due_date?: string
  paid_at?: string
  [key: string]: any
}

const paymentMethods: PaymentMethod[] = [
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
    color: 'var(--rent-primary)',
    bg: 'rgba(20, 184, 166, 0.10)',
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
    color: 'var(--rent-primary)',
    bg: 'rgba(20, 184, 166, 0.10)',
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
    color: 'var(--rent-primary)',
    bg: 'rgba(20, 184, 166, 0.10)',
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
    color: 'var(--rent-primary)',
    bg: 'rgba(20, 184, 166, 0.10)',
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
    color: 'var(--rent-primary)',
    bg: 'rgba(20, 184, 166, 0.10)',
  },
]

const statusLabelMap: Record<string, string> = {
  succeeded: 'ownerPayments.stSucceeded',
  paid: 'ownerPayments.stPaid',
  pending: 'ownerPayments.stPending',
  failed: 'ownerPayments.stFailed',
  overdue: 'ownerPayments.stOverdue',
}

const typeLabelMap: Record<string, string> = {
  rent: 'ownerPayments.tyRent',
  deposit: 'ownerPayments.fDeposit',
  refund: 'ownerPayments.tyRefund',
  service: 'ownerPayments.fServiceFee',
}

const fmtMoney = (v: number) => `RM ${Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const statusBadgeCls: Record<string, string> = {
  paid: 'rent-badge--success',
  succeeded: 'rent-badge--success',
  pending: 'rent-badge--warning',
  failed: 'rent-badge--error',
  overdue: 'rent-badge--error',
}

/** 缴费记录行（卡片「最近」与「全部记录」弹窗共用一份，避免两处表格走样） */
interface RecordRow {
  id: string
  date: string
  item: string
  amount: number
  channel: string
  status: string
}

const RecordsTable = ({ rows }: { rows: RecordRow[] }) => {
  const { t } = useTranslation()
  return (
  <div className="rent-table-wrap pay-table-wrap">
    <table className="rent-table">
      <thead>
        <tr>
          <th>{t('ownerPayments.thDate')}</th>
          <th>{t('ownerPayments.fPaymentItem')}</th>
          <th>{t('ownerPayments.thAmount')}</th>
          <th>{t('ownerPayments.fPaymentMethod')}</th>
          <th>{t('common.status')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={5}>
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('ownerPayments.noRecords')} />
            </td>
          </tr>
        ) : (
          rows.map((r) => {
            const status = r.status || 'paid'
            const badgeCls = statusBadgeCls[status] || 'rent-badge--neutral'
            const label =
              statusLabelMap[status]
                ? t(statusLabelMap[status])
                : (status === 'paid' ? t('ownerPayments.stPaid') : status === 'pending' ? t('ownerPayments.stProcessing') : status)
            const dotColor =
              status === 'paid' || status === 'succeeded'
                ? 'var(--state-success)'
                : status === 'pending'
                  ? 'var(--state-warning)'
                  : 'var(--state-error)'
            return (
              <tr key={r.id}>
                <td className="rent-mono">{r.date}</td>
                <td>{r.item}</td>
                <td className="rent-mono rent-num">{fmtMoney(r.amount)}</td>
                <td>{r.channel}</td>
                <td>
                  <span className={`rent-badge ${badgeCls}`}>
                    <span className="rent-badge--dot" style={{ background: dotColor }} />
                    {label}
                  </span>
                </td>
              </tr>
            )
          })
        )}
      </tbody>
    </table>
  </div>
  )
}

/** 卡片内「最近」预览条数，其余走「查看全部」弹窗 */
const RECENT_RECORD_LIMIT = 5

const Payments = () => {
  const { t } = useTranslation()
  const [currentMethod, setCurrentMethod] = useState<PaymentMethod | null>(null)
  const [amount, setAmount] = useState<number>(0)
  const [submitting, setSubmitting] = useState(false)
  const [selectedProperty, setSelectedProperty] = useState<string>('')
  // 全部缴费记录弹窗（卡片只预览最近若干条）
  const [recordsOpen, setRecordsOpen] = useState(false)

  const user = useAuthStore((s) => s.user)
  const uid = user?.id ?? 'anon'

  const qRecords = useCachedQuery<PaymentRecord[]>({
    queryKey: ['owner-payments', 'mine', uid],
    cacheKey: `owner-payments:mine:${uid}`,
    queryFn: async () => {
      try {
        const res = await api.get('/payments/me')
        const payload = res.data?.data ?? res.data
        return payload?.items ?? []
      } catch (err: any) {
        message.error(err?.response?.data?.message || t('ownerPayments.errLoadRecords'))
        return []
      }
    },
  })
  const records = qRecords.data ?? []

  const qProps = useCachedQuery<{ id: string; label: string }[]>({
    queryKey: ['owner-payments', 'properties', uid],
    cacheKey: `owner-payments:properties:${uid}`,
    queryFn: async () => {
      try {
        const res = await api.get('/owners/me/properties')
        const items = Array.isArray(res.data) ? res.data : (res.data?.items ?? [])
        return items.map((p: any) => ({
          id: p.id,
          label: `${p.address || p.property_name || t('ownerPayments.fProperty')} · ${p.room_number || ''}`.replace(' · ', ' · '),
        }))
      } catch {
        return []
      }
    },
  })
  const properties = qProps.data ?? []

  const loading = (qRecords.isPending && !qRecords.data) || (qProps.isPending && !qProps.data)
  const refresh = useCallback(() => {
    void qRecords.refetch({ cancelRefetch: false })
    void qProps.refetch({ cancelRefetch: false })
  }, [qRecords, qProps])

  // 以最近一笔未结清账单金额作为默认缴费金额
  useEffect(() => {
    const due = records.find(
      (r) => !['succeeded', 'paid', 'refunded'].includes(String(r.status || '').toLowerCase()),
    )
    setAmount(Number(due?.amount || 0))
  }, [records])

  // 默认选中第一套房产（背景刷新时保留用户已选中的选择）
  useEffect(() => {
    setSelectedProperty((prev) => prev || properties[0]?.id || '')
  }, [properties])

  const selectMethod = (method: PaymentMethod) => {
    setCurrentMethod(method)
  }

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
        payment_type: 'service',
        channel: currentMethod?.id || 'qr',
        idempotency_key: `owner-pay-${user.id}-${Date.now()}`,
        description: '业主在线缴费',
      })
      message.success(t('ownerPayments.msgCreated'))
      refresh()
      setCurrentMethod(null)
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('ownerPayments.errCreate'))
    } finally {
      setSubmitting(false)
    }
  }

  // 当前选中的支付方式（默认选中第一个，匹配设计稿）
  const selectedMethod = currentMethod || paymentMethods[0]
  const displayAmount = amount > 0 ? amount : 0

  // 缴费记录（真实接口数据，无兜底）
  const renderRecords: RecordRow[] = records.map((r) => ({
    id: r.id,
    date: r.paid_at || r.due_date ? dayjs(r.paid_at || r.due_date).format('YYYY-MM-DD') : '-',
    item: typeLabelMap[r.payment_type || ''] ? t(typeLabelMap[r.payment_type || '']) : (r.payment_type || t('ownerPayments.fManagementFee')),
    amount: Number(r.amount || 0),
    channel: r.channel || '-',
    status: r.status,
  }))

  return (
    <div className="rent-main">
      {loading && (
        <div className="owner-loading-bar">
          <Spin size="small" style={{ marginRight: 8 }} />
          {t('common.loading')}
        </div>
      )}

      {/* Page header */}
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title">{t('ownerPayments.title')}</h2>
          <p className="rent-page-header__subtitle">{t('ownerPayments.subtitle')}</p>
        </div>
        <div className="rent-page-header__actions">
          <button type="button" className="rent-btn rent-btn--secondary" onClick={() => setRecordsOpen(true)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            {t('ownerPayments.recordsTitle')}
          </button>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="pay-grid">
        {/* Left column — Payment form */}
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
            {/* Payment purpose */}
            <div className="rent-form-group">
              <label className="rent-form-label">{t('ownerPayments.fPaymentItem')}</label>
              <select className="rent-form-select">
                <option>{t('ownerPayments.fManagementFee')}</option>
                <option>{t('ownerPayments.fRepairFee')}</option>
                <option>{t('ownerPayments.fServiceFee')}</option>
                <option>{t('ownerPayments.fDeposit')}</option>
              </select>
            </div>

            {/* Property */}
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

            {/* Amount */}
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

            {/* Payment method */}
            <div className="rent-form-group">
              <label className="rent-form-label">{t('ownerPayments.fPaymentMethod')}</label>
              <div className="rent-grid rent-grid--3 pay-method-grid">
                {paymentMethods.map((m) => {
                  const isSelected = selectedMethod.id === m.id
                  return (
                    <div
                      key={m.id}
                      className="pay-method-card"
                      data-selected={isSelected}
                      onClick={() => selectMethod(m)}
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
                  )
                })}
              </div>
            </div>

            {/* Conditional: QR code panel (shown by default for QR method) */}
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
                    {t(selectedMethod.name)}
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

            {/* Terms */}
            <div className="rent-form-group">
              <label className="pay-check">
                <input type="checkbox" defaultChecked />
                <span>
                  {t('ownerPayments.termsPrefix')}<a href="#">{t('ownerPayments.termsLink')}</a>{t('ownerPayments.termsSuffix')}
                </span>
              </label>
            </div>

            {/* Confirm button */}
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

        {/* Right column — Payment summary */}
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
          <div className="rent-card__footer">
            <button type="button" className="pay-link" onClick={() => setRecordsOpen(true)}>
              <span>{t('ownerPayments.recentRecords')}</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Recent payments card (full width) */}
      <div className="rent-card">
        <div className="rent-card__header">
          <h3 className="rent-card__title">{t('ownerPayments.recentRecords')}</h3>
          <button
            type="button"
            className="rent-btn rent-btn--ghost rent-btn--sm"
            onClick={() => setRecordsOpen(true)}
          >
            {t('ownerPayments.viewAll')}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
        <RecordsTable rows={renderRecords.slice(0, RECENT_RECORD_LIMIT)} />
      </div>

      {/* 全部缴费记录（真实 /payments/me 数据） */}
      <Modal
        title={t('ownerPayments.recordsTitle')}
        open={recordsOpen}
        onCancel={() => setRecordsOpen(false)}
        footer={null}
        width={760}
      >
        <RecordsTable rows={renderRecords} />
      </Modal>
    </div>
  )
}

export default Payments
