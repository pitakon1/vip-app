import { useTranslation } from 'react-i18next'
import SearchSelect from './SearchSelect'
import type { Broker, DealType, Employee, FormState } from '../types'

interface CommissionRuleModalProps {
  open: boolean
  editingId: string | null
  form: FormState
  isAdmin: boolean
  employees: Employee[]
  brokers: Broker[]
  partners: { id: string; name: string }[]
  brokerEmployeeOptions: Employee[]
  scopeOptions: { value: string; label: string }[]
  brokerScopeOptions: { value: string; label: string }[]
  dealTypeText: Record<DealType, string>
  submitting: boolean
  onSet: (field: keyof FormState, value: string | boolean) => void
  onScopeChange: (scope: string) => void
  onBrokerChange: (brokerId: string) => void
  onSubmit: () => void
  onClose: () => void
}

export default function CommissionRuleModal({
  open,
  editingId,
  form,
  isAdmin,
  employees,
  brokers,
  partners,
  brokerEmployeeOptions,
  scopeOptions,
  brokerScopeOptions,
  dealTypeText,
  submitting,
  onSet,
  onScopeChange,
  onBrokerChange,
  onSubmit,
  onClose,
}: CommissionRuleModalProps) {
  const { t } = useTranslation()
  if (!open) return null

  return (
    <div className="rent-modal-backdrop" onClick={() => !submitting && onClose()}>
      <div className="rent-modal" onClick={(e) => e.stopPropagation()}>
        <div className="rent-modal__header">
          <h3 className="rent-card__title">{editingId ? t('commissionRules.editTitle') : t('commissionRules.createTitle')}</h3>
          <button className="rent-btn rent-btn--ghost rent-btn--sm" aria-label="关闭" onClick={onClose} disabled={submitting}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="rent-modal__body">
          <div className="rent-form-group">
            <label className="rent-form-label">{t('commissionRules.labelRuleName')}</label>
            <input
              className="rent-form-input"
              type="text"
              placeholder={t('commissionRules.placeholderRuleName')}
              value={form.name}
              onChange={(e) => onSet('name', e.target.value)}
            />
          </div>
          <div className="rent-form-row">
            <div className="rent-form-group">
              <label className="rent-form-label">{t('commissionRules.labelDealType')}</label>
              <select
                className="rent-form-select"
                value={form.deal_type}
                onChange={(e) => onSet('deal_type', e.target.value)}
              >
                {Object.entries(dealTypeText).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div className="rent-form-group">
              <label className="rent-form-label">{t('commissionRules.labelRate')}</label>
              <input
                className="rent-form-input"
                type="number"
                min="0"
                step="0.1"
                placeholder={t('commissionRules.placeholderRate')}
                value={form.rate}
                onChange={(e) => onSet('rate', e.target.value)}
              />
            </div>
          </div>
          <div className="rent-form-group">
            <label className="rent-form-label">{t('commissionRules.labelScope')}</label>
            <select
              className="rent-form-select"
              value={form.scope}
              onChange={(e) => onScopeChange(e.target.value)}
            >
              {(isAdmin ? scopeOptions : brokerScopeOptions).map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            {!isAdmin && (
              <div className="rent-text-sm rent-text-muted" style={{ marginTop: 6 }}>
                {t('commissionRules.brokerRestrict')}
              </div>
            )}
          </div>
          {form.scope === 'by_department' && isAdmin && (
            <div className="rent-form-group">
              <label className="rent-form-label">{t('commissionRules.labelDepartment')}</label>
              <input
                className="rent-form-input"
                type="text"
                placeholder={t('commissionRules.placeholderDepartment')}
                value={form.department}
                onChange={(e) => onSet('department', e.target.value)}
              />
            </div>
          )}
          {form.scope === 'by_employee' && (
            <div className="rent-form-group">
              <label className="rent-form-label">{t('commissionRules.labelEmployee')}</label>
              <SearchSelect
                placeholder={isAdmin ? t('commissionRules.placeholderEmployeeAdmin') : t('commissionRules.placeholderEmployeeBroker')}
                value={form.employee_id}
                options={employees.map((emp) => ({
                  value: emp.id,
                  label: emp.full_name + (emp.department ? ` · ${emp.department}` : ''),
                }))}
                onChange={(v) => onSet('employee_id', v)}
              />
              {!isAdmin && (
                <div className="rent-text-sm rent-text-muted" style={{ marginTop: 6 }}>
                  {t('commissionRules.empRestrict')}
                </div>
              )}
            </div>
          )}
          {form.scope === 'by_broker' && isAdmin && (
            <div className="rent-form-group">
              <label className="rent-form-label">{t('commissionRules.labelBroker')}</label>
              <SearchSelect
                placeholder={t('commissionRules.placeholderBroker')}
                value={form.broker_id}
                options={brokers.map((b) => ({ value: b.id, label: b.partner_name }))}
                onChange={(v) => onSet('broker_id', v)}
              />
            </div>
          )}
          {form.scope === 'by_partner' && isAdmin && (
            <div className="rent-form-group">
              <label className="rent-form-label">{t('commissionRules.labelPartner')}</label>
              <SearchSelect
                placeholder={t('commissionRules.placeholderPartner')}
                value={form.partner_id}
                options={partners.map((p) => ({ value: p.id, label: p.name }))}
                onChange={(v) => onSet('partner_id', v)}
              />
            </div>
          )}
          {form.scope === 'broker_employee' && isAdmin && (
            <>
              <div className="rent-form-group">
                <label className="rent-form-label">{t('commissionRules.labelBroker')}</label>
                <SearchSelect
                  placeholder={t('commissionRules.placeholderBroker')}
                  value={form.broker_id}
                  options={brokers.map((b) => ({ value: b.id, label: b.partner_name }))}
                  onChange={onBrokerChange}
                />
              </div>
              <div className="rent-form-group">
                <label className="rent-form-label">{t('commissionRules.labelBrokerEmployee')}</label>
                <SearchSelect
                  placeholder={t('commissionRules.placeholderBrokerEmployee')}
                  value={form.broker_employee_id}
                  options={brokerEmployeeOptions.map((emp) => ({
                    value: emp.id,
                    label: emp.full_name + (emp.department ? ` · ${emp.department}` : ''),
                  }))}
                  onChange={(v) => onSet('broker_employee_id', v)}
                />
              </div>
            </>
          )}
          <div className="rent-form-row">
            <div className="rent-form-group">
              <label className="rent-form-label">{t('commissionRules.labelMinAmount')}</label>
              <input
                className="rent-form-input"
                type="number"
                min="0"
                placeholder={t('commissionRules.placeholderOptional')}
                value={form.minimum_amount}
                onChange={(e) => onSet('minimum_amount', e.target.value)}
              />
            </div>
            <div className="rent-form-group">
              <label className="rent-form-label">{t('commissionRules.labelCapAmount')}</label>
              <input
                className="rent-form-input"
                type="number"
                min="0"
                placeholder={t('commissionRules.placeholderOptional')}
                value={form.cap_amount}
                onChange={(e) => onSet('cap_amount', e.target.value)}
              />
            </div>
          </div>
          <div className="rent-form-group">
            <label className="rent-form-label">{t('common.detail')}</label>
            <textarea
              className="rent-form-textarea"
              rows={2}
              placeholder={t('commissionRules.placeholderDescription')}
              value={form.description}
              onChange={(e) => onSet('description', e.target.value)}
            />
          </div>
          <div className="rent-flex rent-gap-2" style={{ alignItems: 'center' }}>
            <label className="rent-switch">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => onSet('is_active', e.target.checked)}
              />
              <span className="rent-switch__track" />
              <span className="rent-switch__thumb" />
            </label>
            <span className="rent-text-sm">{t('commissionRules.enableRule')}</span>
          </div>
        </div>
        <div className="rent-modal__footer">
          <button className="rent-btn rent-btn--secondary" onClick={onClose} disabled={submitting}>{t('common.cancel')}</button>
          <button className="rent-btn rent-btn--primary" onClick={onSubmit} disabled={submitting}>
            {submitting ? t('commissionRules.saving') : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
