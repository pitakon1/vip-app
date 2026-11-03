import { useTranslation } from 'react-i18next'
import type { RenewFormValues } from '../types'

interface Props {
  open: boolean
  form: RenewFormValues
  setField: <K extends keyof RenewFormValues>(key: K, value: RenewFormValues[K]) => void
  submitting: boolean
  onClose: () => void
  onSubmit: () => void
}

/** 续约弹窗 */
export default function RenewLeaseModal({
  open,
  form,
  setField,
  submitting,
  onClose,
  onSubmit,
}: Props) {
  const { t } = useTranslation()
  if (!open) return null

  return (
    <div className="rent-modal-backdrop" onClick={onClose}>
      <div className="rent-modal" onClick={(e) => e.stopPropagation()}>
        <div className="rent-modal__header">
          <h3 className="rent-card__title">{t('leases.modalRenewTitle')}</h3>
          <button className="rent-btn rent-btn--ghost rent-btn--sm" aria-label={t('common.close')} onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="rent-modal__body">
          <div className="rent-form-group">
            <label className="rent-form-label">{t('leases.labelNewTerm')}</label>
            <div className="rent-flex rent-gap-2" style={{ alignItems: 'center' }}>
              <input
                type="date"
                className="rent-form-input"
                value={form.startDate}
                onChange={(e) => setField('startDate', e.target.value)}
              />
              <span className="rent-text-muted rent-text-sm">{t('leases.to')}</span>
              <input
                type="date"
                className="rent-form-input"
                value={form.endDate}
                onChange={(e) => setField('endDate', e.target.value)}
              />
            </div>
          </div>
          <div className="rent-form-group" style={{ marginBottom: 0 }}>
            <label className="rent-form-label">{t('leases.labelNewMonthlyRent')}</label>
            <input
              className="rent-form-input"
              type="number"
              min={0}
              value={form.monthlyRent}
              onChange={(e) => setField('monthlyRent', e.target.value)}
              placeholder={t('leases.placeholderMonthlyRent')}
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
