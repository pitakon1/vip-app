import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { message } from 'antd'
import dayjs from 'dayjs'
import api from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import { useCachedQuery } from '@/lib/queryCache'
import { errorText } from '@/lib/errorText'
import { fmtMoney, onlinePayMethods } from '../constants'
import type { OnlinePayMethod, OwnerPropertyOption } from '../types'

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

  const qProps = useCachedQuery<OwnerPropertyOption[]>({
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
      message.error(errorText(err, t('ownerPayments.errCreate')))
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
                {/* 原协议名是 href="#" 死链接；项目内暂无协议详情页，改为纯文本，不再伪装成可点击入口。 */}
                {t('ownerPayments.termsPrefix')}<span>{t('ownerPayments.termsLink')}</span>{t('ownerPayments.termsSuffix')}
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
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--rent-ink-2)" strokeWidth="2">
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

export default OwnerOnlinePayCard
