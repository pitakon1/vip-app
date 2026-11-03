import { useTranslation } from 'react-i18next'
import type { LeadStatus } from '@/types'
import type { CreateFormValues } from '../types'

interface LeadFormModalProps {
  open: boolean
  form: CreateFormValues
  employeeOptions: { id: string; name: string }[]
  stageOptions: { value: LeadStatus; label: string }[]
  submitting: boolean
  onPatch: (patch: Partial<CreateFormValues>) => void
  onSubmit: () => void
  onClose: () => void
}

export default function LeadFormModal({
  open,
  form,
  employeeOptions,
  stageOptions,
  submitting,
  onPatch,
  onSubmit,
  onClose,
}: LeadFormModalProps) {
  const { t } = useTranslation()
  if (!open) return null

  return (
    <div className="rent-modal-backdrop" onClick={onClose}>
      <div className="rent-modal crm-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <div className="rent-modal__header">
          <h3 className="rent-card__title">{form.id ? t('crm.editLead') : t('crm.newLeadModal')}</h3>
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
              <label className="rent-form-label">{t('crm.labelName')}</label>
              <input
                className="rent-form-input"
                value={form.name}
                onChange={(e) => onPatch({ name: e.target.value })}
                placeholder={t('crm.phName')}
              />
            </div>
            <div className="rent-form-group">
              <label className="rent-form-label">{t('crm.thNationality')}</label>
              <input
                className="rent-form-input"
                value={form.nationality}
                onChange={(e) => onPatch({ nationality: e.target.value })}
                placeholder={t('crm.phNationality')}
              />
            </div>
          </div>
          <div className="rent-form-row">
            <div className="rent-form-group">
              <label className="rent-form-label">{t('crm.labelPhone')}</label>
              <input
                className="rent-form-input"
                value={form.phone}
                onChange={(e) => onPatch({ phone: e.target.value })}
                placeholder={t('crm.phPhone')}
              />
            </div>
            <div className="rent-form-group">
              <label className="rent-form-label">{t('crm.labelEmail')}</label>
              <input
                className="rent-form-input"
                value={form.email}
                onChange={(e) => onPatch({ email: e.target.value })}
                placeholder={t('crm.phEmail')}
              />
            </div>
          </div>
          <div className="rent-form-row">
            <div className="rent-form-group">
              <label className="rent-form-label">{t('crm.labelBudget')}</label>
              <input
                className="rent-form-input"
                type="number"
                min={0}
                value={form.budget_max}
                onChange={(e) => onPatch({ budget_max: e.target.value })}
                placeholder={t('crm.labelBudget')}
              />
            </div>
            <div className="rent-form-group">
              <label className="rent-form-label">{t('crm.labelAssignedTo')}</label>
              <select
                className="rent-form-select"
                value={form.assigned_to}
                onChange={(e) => onPatch({ assigned_to: e.target.value })}
              >
                <option value="">{t('crm.unassigned')}</option>
                {employeeOptions.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="rent-form-group">
            <label className="rent-form-label">{t('crm.labelSource')}</label>
            <input
              className="rent-form-input"
              value={form.source}
              onChange={(e) => onPatch({ source: e.target.value })}
              placeholder={t('crm.phSource')}
            />
          </div>
          <div className="rent-form-group">
            <label className="rent-form-label">{t('crm.thStage')}</label>
            <select
              className="rent-form-select"
              value={form.stage}
              onChange={(e) => onPatch({ stage: e.target.value as LeadStatus })}
            >
              {stageOptions.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <div className="rent-form-group" style={{ marginBottom: 0 }}>
            <label className="rent-form-label">{t('crm.labelRequirement')}</label>
            <textarea
              className="rent-form-textarea"
              rows={2}
              value={form.requirement}
              onChange={(e) => onPatch({ requirement: e.target.value })}
              placeholder={t('crm.phRequirement')}
            />
          </div>
          <div className="rent-form-group" style={{ marginBottom: 0 }}>
            <label className="rent-form-label">{t('crm.labelNotes')}</label>
            <textarea
              className="rent-form-textarea"
              rows={2}
              value={form.notes}
              onChange={(e) => onPatch({ notes: e.target.value })}
              placeholder={t('crm.phNotes')}
            />
          </div>
        </div>
        <div className="rent-modal__footer">
          <button className="rent-btn rent-btn--secondary" onClick={onClose}>{t('common.cancel')}</button>
          <button className="rent-btn rent-btn--primary" onClick={onSubmit} disabled={submitting}>
            {submitting ? t('common.submitting') : form.id ? t('common.save') : t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
