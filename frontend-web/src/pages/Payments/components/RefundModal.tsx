import { useTranslation } from 'react-i18next'

interface Props {
  reason: string
  setReason: (value: string) => void
  submitting: boolean
  onSubmit: () => void
  onClose: () => void
}

/** 退款弹窗（native rent-modal） */
export default function RefundModal({ reason, setReason, submitting, onSubmit, onClose }: Props) {
  const { t } = useTranslation()

  return (
    <div className="rent-modal-backdrop" onClick={onClose}>
      <div className="rent-modal payments-modal" onClick={(e) => e.stopPropagation()}>
        <div className="rent-modal__header">
          <h3 className="rent-card__title">{t('payments.modalRefundTitle')}</h3>
          <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={onClose}>
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
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>
        <div className="rent-modal__footer">
          <button className="rent-btn rent-btn--secondary" onClick={onClose}>{t('common.cancel')}</button>
          <button className="rent-btn rent-btn--primary" onClick={onSubmit} disabled={submitting}>
            {submitting ? t('common.submitting') : t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
