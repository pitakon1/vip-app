import { useTranslation } from 'react-i18next'
import type { LeadStatus } from '@/types'

interface StageModalProps {
  open: boolean
  value: LeadStatus | ''
  stageOptions: { value: LeadStatus; label: string }[]
  submitting: boolean
  onChange: (value: LeadStatus) => void
  onSubmit: () => void
  onClose: () => void
}

export default function StageModal({ open, value, stageOptions, submitting, onChange, onSubmit, onClose }: StageModalProps) {
  const { t } = useTranslation()
  if (!open) return null

  return (
    <div className="rent-modal-backdrop" onClick={onClose}>
      <div className="rent-modal" onClick={(e) => e.stopPropagation()}>
        <div className="rent-modal__header">
          <h3 className="rent-card__title">{t('crm.editStageTitle')}</h3>
          <button className="rent-btn rent-btn--ghost rent-btn--sm" aria-label={t('common.close')} onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="rent-modal__body">
          <div className="rent-form-group" style={{ marginBottom: 0 }}>
            <label className="rent-form-label">{t('crm.labelStageRequired')}</label>
            <select
              className="rent-form-select"
              value={value}
              onChange={(e) => onChange(e.target.value as LeadStatus)}
            >
              <option value="">{t('crm.msgStageRequired')}</option>
              {stageOptions.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
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
