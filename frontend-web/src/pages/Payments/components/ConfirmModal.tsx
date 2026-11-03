import { useTranslation } from 'react-i18next'
import type { Payment } from '@/types'
import { statusMeta } from '../constants'
import { formatAmount, toDisplayStatus } from '../utils'

interface Props {
  payment: Payment
  confirming: boolean
  onConfirm: () => void
  onClose: () => void
}

/** 确认到账弹窗 */
export default function ConfirmModal({ payment, confirming, onConfirm, onClose }: Props) {
  const { t } = useTranslation()

  return (
    <div className="rent-modal-backdrop" onClick={onClose}>
      <div className="rent-modal payments-modal" onClick={(e) => e.stopPropagation()}>
        <div className="rent-modal__header">
          <h3 className="rent-card__title">{t('payments.modalConfirmTitle')}</h3>
          <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="rent-modal__body">
          <p className="rent-text-muted rent-text-sm" style={{ marginTop: 0 }}>
            {t('payments.confirmSummary', { amount: formatAmount(payment), status: t(statusMeta[toDisplayStatus(payment)].label) })}
          </p>
        </div>
        <div className="rent-modal__footer">
          <button className="rent-btn rent-btn--secondary" onClick={onClose}>{t('common.cancel')}</button>
          <button className="rent-btn rent-btn--primary" onClick={onConfirm} disabled={confirming}>
            {confirming ? t('common.submitting') : t('payments.btnConfirmArrival')}
          </button>
        </div>
      </div>
    </div>
  )
}
