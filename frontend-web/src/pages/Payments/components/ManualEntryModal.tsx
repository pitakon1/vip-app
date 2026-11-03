import { useTranslation } from 'react-i18next'
import type { ManualForm } from '../types'

interface Props {
  form: ManualForm
  setField: (key: keyof ManualForm) => (e: any) => void
  submitting: boolean
  onSubmit: () => void
  onClose: () => void
}

/** 手动记账弹窗 */
export default function ManualEntryModal({ form, setField, submitting, onSubmit, onClose }: Props) {
  const { t } = useTranslation()

  return (
    <div className="rent-modal-backdrop" onClick={onClose}>
      <div className="rent-modal payments-modal" onClick={(e) => e.stopPropagation()}>
        <div className="rent-modal__header">
          <h3 className="rent-card__title">{t('payments.modalManualTitle')}</h3>
          <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="rent-modal__body">
          <div className="rent-form-group">
            <label className="rent-form-label">{t('payments.labelPayer')}</label>
            <input className="rent-form-input" placeholder={t('payments.placeholderPayer')} value={form.payer_id} onChange={setField('payer_id')} />
          </div>
          <div className="rent-form-group">
            <label className="rent-form-label">{t('payments.labelPayee')}</label>
            <input className="rent-form-input" placeholder={t('payments.placeholderPayee')} value={form.payee_id} onChange={setField('payee_id')} />
          </div>
          <div className="rent-form-group">
            <label className="rent-form-label">{t('payments.labelAmount')}</label>
            <div className="rent-flex rent-gap-2">
              <input className="rent-form-input" type="number" min="0" step="0.01" placeholder="0.00" value={form.amount} onChange={setField('amount')} />
              <select className="rent-form-select" style={{ width: 110 }} aria-label={t('payments.ariaCurrency')} value={form.currency} onChange={setField('currency')}>
                <option value="THB">THB</option>
                <option value="CNY">CNY</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
          </div>
          <div className="rent-form-group">
            <label className="rent-form-label">{t('payments.labelFeeType')}</label>
            <select className="rent-form-select" aria-label={t('payments.ariaFeeType')} value={form.payment_type} onChange={setField('payment_type')}>
              <option value="rent">{t('payments.optRent')}</option>
              <option value="deposit">{t('payments.optDeposit')}</option>
              <option value="commission">{t('payments.optCommission')}</option>
              <option value="service_fee">{t('payments.optServiceFee')}</option>
              <option value="utility">{t('payments.optUtilityFee')}</option>
              <option value="tax">{t('payments.optTax')}</option>
            </select>
          </div>
          <div className="rent-form-group">
            <label className="rent-form-label">{t('payments.labelChannel')}</label>
            <select className="rent-form-select" aria-label={t('payments.ariaChannel2')} value={form.channel} onChange={setField('channel')}>
              <option value="promptpay">PromptPay</option>
              <option value="bank_transfer">{t('payments.chBankTransfer')}</option>
              <option value="stripe">{t('payments.chCreditCard')}</option>
              <option value="alipay">{t('payments.chAlipay')}</option>
              <option value="wechat">{t('payments.chWechat')}</option>
              <option value="wise">Wise</option>
            </select>
          </div>
          <div className="rent-form-group">
            <label className="rent-form-label">{t('payments.labelDueDate')}</label>
            <input className="rent-form-input" type="date" value={form.due_date} onChange={setField('due_date')} />
          </div>
          <div className="rent-form-group" style={{ marginBottom: 0 }}>
            <label className="rent-form-label">{t('payments.labelRemark')}</label>
            <textarea className="rent-form-textarea" rows={3} placeholder={t('payments.placeholderRemark')} value={form.description} onChange={setField('description')} />
          </div>
        </div>
        <div className="rent-modal__footer">
          <button className="rent-btn rent-btn--secondary" onClick={onClose}>{t('common.cancel')}</button>
          <button className="rent-btn rent-btn--primary" onClick={onSubmit} disabled={submitting}>
            {submitting ? t('common.submitting') : t('payments.btnRegister')}
          </button>
        </div>
      </div>
    </div>
  )
}
