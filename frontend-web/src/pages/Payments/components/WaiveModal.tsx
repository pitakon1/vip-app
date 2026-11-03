import { useTranslation } from 'react-i18next'
import type { Payment } from '@/types'
import { formatFee, lateFeeDue } from '../utils'

interface Props {
  payment: Payment
  amount: string
  setAmount: (value: string) => void
  reason: string
  setReason: (value: string) => void
  submitting: boolean
  onSubmit: () => void
  onClose: () => void
}

/** 逾期滞纳金减免弹窗 */
export default function WaiveModal({
  payment,
  amount,
  setAmount,
  reason,
  setReason,
  submitting,
  onSubmit,
  onClose,
}: Props) {
  const { t } = useTranslation()

  return (
    <div className="rent-modal-backdrop" onClick={onClose}>
      <div className="rent-modal payments-modal" onClick={(e) => e.stopPropagation()}>
        <div className="rent-modal__header">
          <h3 className="rent-card__title">{t('payments.modalWaiveTitle')}</h3>
          <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="rent-modal__body">
          <p className="rent-text-muted rent-text-sm" style={{ marginTop: 0 }}>
            {t('payments.waiveSummary', {
              due: formatFee(lateFeeDue(payment)),
              waived: formatFee(Number(payment.late_fee_waived || 0)),
            })}
          </p>
          <div className="rent-form-group">
            <label className="rent-form-label">{t('payments.labelWaiveAmount')}</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="rent-form-input"
              placeholder={formatFee(lateFeeDue(payment))}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="rent-form-group" style={{ marginBottom: 0 }}>
            <label className="rent-form-label">{t('payments.labelWaiveReason')}</label>
            <textarea
              className="rent-form-textarea"
              rows={3}
              placeholder={t('payments.placeholderWaiveReason')}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>
        <div className="rent-modal__footer">
          <button className="rent-btn rent-btn--secondary" onClick={onClose}>{t('common.cancel')}</button>
          <button className="rent-btn rent-btn--primary" onClick={onSubmit} disabled={submitting}>
            {submitting ? t('common.submitting') : t('payments.btnConfirmWaive')}
          </button>
        </div>
      </div>
    </div>
  )
}
