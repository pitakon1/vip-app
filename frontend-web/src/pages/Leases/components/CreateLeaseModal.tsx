import { useTranslation } from 'react-i18next'
import type { Property } from '@/types'
import type { CreateFormValues } from '../types'

interface Props {
  open: boolean
  form: CreateFormValues
  properties: Property[]
  setField: <K extends keyof CreateFormValues>(key: K, value: CreateFormValues[K]) => void
  submitting: boolean
  onClose: () => void
  onSubmit: () => void
}

/** 新建租约弹窗 */
export default function CreateLeaseModal({
  open,
  form,
  properties,
  setField,
  submitting,
  onClose,
  onSubmit,
}: Props) {
  const { t } = useTranslation()
  if (!open) return null

  return (
    <div className="rent-modal-backdrop" onClick={onClose}>
      <div className="rent-modal leases-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 600 }}>
        <div className="rent-modal__header">
          <h3 className="rent-card__title">{t('leases.modalCreateTitle')}</h3>
          <button className="rent-btn rent-btn--ghost rent-btn--sm" aria-label={t('common.close')} onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="rent-modal__body">
          <div className="rent-form-row">
            <div className="rent-form-group">
              <label className="rent-form-label">{t('leases.labelProperty')}</label>
              <select
                className="rent-form-select"
                value={form.propertyId}
                onChange={(e) => setField('propertyId', e.target.value)}
              >
                <option value="">{t('leases.optSelectProperty')}</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>{p.room_number || `#${p.id}`}</option>
                ))}
              </select>
            </div>
            <div className="rent-form-group">
              <label className="rent-form-label">{t('leases.labelTenantName')}</label>
              <input
                className="rent-form-input"
                value={form.tenantName}
                onChange={(e) => setField('tenantName', e.target.value)}
                placeholder={t('leases.placeholderTenantName')}
              />
            </div>
          </div>
          <div className="rent-form-row">
            <div className="rent-form-group">
              <label className="rent-form-label">{t('leases.labelTenantPhone')}</label>
              <input
                className="rent-form-input"
                value={form.tenantPhone}
                onChange={(e) => setField('tenantPhone', e.target.value)}
                placeholder={t('leases.placeholderTenantPhone')}
              />
            </div>
            <div className="rent-form-group">
              <label className="rent-form-label">{t('leases.labelTerm')}</label>
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
          </div>
          <div className="rent-form-row" style={{ marginBottom: 0 }}>
            <div className="rent-form-group" style={{ marginBottom: 0 }}>
              <label className="rent-form-label">{t('leases.labelMonthlyRent')}</label>
              <input
                className="rent-form-input"
                type="number"
                min={0}
                value={form.monthlyRent}
                onChange={(e) => setField('monthlyRent', e.target.value)}
                placeholder={t('leases.placeholderMonthlyRent')}
              />
            </div>
            <div className="rent-form-group" style={{ marginBottom: 0 }}>
              <label className="rent-form-label">{t('leases.labelDeposit')}</label>
              <input
                className="rent-form-input"
                type="number"
                min={0}
                value={form.deposit}
                onChange={(e) => setField('deposit', e.target.value)}
                placeholder={t('leases.placeholderDeposit')}
              />
            </div>
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
