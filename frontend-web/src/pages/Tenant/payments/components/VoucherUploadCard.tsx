import { useTranslation } from 'react-i18next'
import { formatMoney } from '@/lib/money'
import { makeMethodLabelMap } from '../constants'
import type { PaymentVoucher } from '../types'

interface Props {
  pendingBills: PaymentVoucher[]
  billId: string
  onBillChange: (id: string) => void
  billType: string
  onBillTypeChange: (value: string) => void
  currency: string
  onCurrencyChange: (value: string) => void
  amount: string
  onAmountChange: (value: string) => void
  paymentDate: string
  onPaymentDateChange: (value: string) => void
  paymentMethod: string
  onPaymentMethodChange: (value: string) => void
  fileName: string
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  submitting: boolean
  onSubmit: () => void
}

/** 上传付款凭证表单（antd Form 之前的手写表单，保持原有交互） */
const VoucherUploadCard = ({
  pendingBills,
  billId,
  onBillChange,
  billType,
  onBillTypeChange,
  currency,
  onCurrencyChange,
  amount,
  onAmountChange,
  paymentDate,
  onPaymentDateChange,
  paymentMethod,
  onPaymentMethodChange,
  fileName,
  onFileChange,
  submitting,
  onSubmit,
}: Props) => {
  const { t } = useTranslation()
  const methodLabelMap = makeMethodLabelMap(t)
  const selectedBill = pendingBills.find((b) => String(b.id) === billId)

  return (
    <div className="rent-card" id="pay-upload" style={{ marginBottom: 32 }}>
      <div className="rent-card__header">
        <h3 className="rent-card__title">{t('tenantPayments.uploadTitle')}</h3>
      </div>
      <div className="rent-card__body">
        <div className="rent-pay-form-group">
          <label className="rent-pay-form-label">{t('tenantPayments.labelBill')}</label>
          <select
            className="rent-pay-form-select"
            value={billId}
            onChange={(e) => onBillChange(e.target.value)}
          >
            <option value="">{t('tenantPayments.billNone')}</option>
            {pendingBills.map((b) => (
              <option key={b.id} value={String(b.id)}>
                {formatMoney(b.amount, b.currency)} · {b.bill_type || b.payment_type || t('tenantPayments.typeRent')}
                {b.due_date ? ` · ${b.due_date}` : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="rent-pay-form-row">
          <div className="rent-pay-form-group">
            <label className="rent-pay-form-label">{t('tenantPayments.labelAmount')}</label>
            <input
              className="rent-pay-form-input"
              type="number"
              min={0}
              placeholder={t('tenantPayments.amountPlaceholder')}
              value={amount}
              disabled={!!selectedBill}
              onChange={(e) => onAmountChange(e.target.value)}
            />
          </div>
          <div className="rent-pay-form-group">
            <label className="rent-pay-form-label">{t('tenantPayments.labelDate')}</label>
            <input
              className="rent-pay-form-input"
              type="date"
              value={paymentDate}
              onChange={(e) => onPaymentDateChange(e.target.value)}
            />
          </div>
        </div>
        <div className="rent-pay-form-row">
          <div className="rent-pay-form-group">
            <label className="rent-pay-form-label">{t('tenantPayments.labelType')}</label>
            <select
              className="rent-pay-form-select"
              value={billType}
              disabled={!!selectedBill}
              onChange={(e) => onBillTypeChange(e.target.value)}
            >
              <option value="rent">{t('tenantPayments.typeRent')}</option>
              <option value="deposit">{t('tenantPayments.typeDeposit')}</option>
              <option value="utility">{t('tenantPayments.typeUtility')}</option>
              <option value="service_fee">{t('tenantPayments.typeServiceFee')}</option>
              <option value="tax">{t('tenantPayments.typeTax')}</option>
            </select>
          </div>
          <div className="rent-pay-form-group">
            <label className="rent-pay-form-label">{t('tenantPayments.labelCurrency')}</label>
            <select
              className="rent-pay-form-select"
              value={currency}
              disabled={!!selectedBill}
              onChange={(e) => onCurrencyChange(e.target.value)}
            >
              <option value="THB">THB</option>
              <option value="CNY">CNY</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </select>
          </div>
        </div>
        <div className="rent-pay-form-group">
          <label className="rent-pay-form-label">{t('tenantPayments.labelMethod')}</label>
          <select
            className="rent-pay-form-select"
            value={paymentMethod}
            onChange={(e) => onPaymentMethodChange(e.target.value)}
          >
            {Object.entries(methodLabelMap).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div className="rent-pay-form-group">
          <label className="rent-pay-form-label">{t('tenantPayments.labelImage')}</label>
          <label className="rent-pay-file-drop">
            <div className="rent-pay-file-drop__icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            </div>
            <div className="rent-pay-file-drop__text">{t('tenantPayments.dropText')}</div>
            <div className="rent-pay-file-drop__hint">{t('tenantPayments.dropHint')}</div>
            <input
              type="file"
              accept="image/*,application/pdf"
              style={{ display: 'none' }}
              onChange={onFileChange}
            />
          </label>
          {fileName && <div className="rent-pay-file-name">{t('tenantPayments.selected', { name: fileName })}</div>}
        </div>
        <button
          className="rent-btn rent-btn--primary rent-btn--block"
          disabled={submitting}
          onClick={onSubmit}
        >
          {submitting ? t('tenantPayments.submitting') : t('tenantPayments.submitVoucher')}
        </button>
      </div>
    </div>
  )
}

export default VoucherUploadCard
