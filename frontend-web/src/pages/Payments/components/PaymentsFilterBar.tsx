import { useTranslation } from 'react-i18next'

interface Props {
  filterType: string
  setFilterType: (value: string) => void
  filterMethod: string
  setFilterMethod: (value: string) => void
  filterStart: string
  setFilterStart: (value: string) => void
  filterEnd: string
  setFilterEnd: (value: string) => void
  status: string
  onStatusChange: (value: string | undefined) => void
  onSearch: (value: string) => void
  onApplyFilter: () => void
}

/** 筛选栏：关键字 / 类型 / 状态 / 渠道 / 日期区间 */
export default function PaymentsFilterBar({
  filterType,
  setFilterType,
  filterMethod,
  setFilterMethod,
  filterStart,
  setFilterStart,
  filterEnd,
  setFilterEnd,
  status,
  onStatusChange,
  onSearch,
  onApplyFilter,
}: Props) {
  const { t } = useTranslation()

  return (
    <div className="rent-filter-bar">
      <div className="rent-filter-bar__search">
        <div className="rent-search" style={{ width: '100%', maxWidth: 'none' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--rent-ink-3)" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder={t('payments.searchPlaceholder')}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSearch((e.target as HTMLInputElement).value)
            }}
          />
        </div>
      </div>
      <select
        className="rent-form-select"
        style={{ width: 'auto', minWidth: 120 }}
        aria-label={t('payments.ariaType')}
        value={filterType}
        onChange={(e) => setFilterType(e.target.value)}
      >
        <option value="">{t('payments.optAllTypes')}</option>
        <option value="rent">{t('payments.optRent')}</option>
        <option value="deposit">{t('payments.optDeposit')}</option>
        <option value="commission">{t('payments.optCommission')}</option>
        <option value="service_fee">{t('payments.optServiceFee')}</option>
        <option value="utility">{t('payments.optUtility')}</option>
        <option value="tax">{t('payments.optTax')}</option>
        <option value="refund">{t('payments.optRefund')}</option>
      </select>
      <select
        className="rent-form-select"
        style={{ width: 'auto', minWidth: 120 }}
        aria-label={t('common.status')}
        value={status}
        onChange={(e) => onStatusChange(e.target.value || undefined)}
      >
        <option value="">{t('payments.optAllStatus')}</option>
        <option value="succeeded">{t('payments.stCompleted')}</option>
        <option value="pending">{t('payments.stPending')}</option>
        <option value="overdue">{t('payments.stOverdue')}</option>
        <option value="refunded">{t('payments.stRefunded')}</option>
      </select>
      <select
        className="rent-form-select"
        style={{ width: 'auto', minWidth: 130 }}
        aria-label={t('payments.ariaChannel')}
        value={filterMethod}
        onChange={(e) => setFilterMethod(e.target.value)}
      >
        <option value="">{t('payments.optChannelAll')}</option>
        <option value="promptpay">PromptPay</option>
        <option value="bank_transfer">{t('payments.chBankTransfer')}</option>
        <option value="stripe">{t('payments.chCreditCard')}</option>
        <option value="alipay">{t('payments.chAlipay')}</option>
        <option value="wechat">{t('payments.chWechat')}</option>
        <option value="wise">Wise</option>
      </select>
      <div className="rent-flex rent-gap-2" style={{ alignItems: 'center' }}>
        <input
          type="date"
          className="rent-form-input"
          style={{ width: 'auto' }}
          aria-label={t('payments.ariaStart')}
          value={filterStart}
          onChange={(e) => setFilterStart(e.target.value)}
        />
        <span className="rent-text-muted rent-text-sm">{t('payments.to')}</span>
        <input
          type="date"
          className="rent-form-input"
          style={{ width: 'auto' }}
          aria-label={t('payments.ariaEnd')}
          value={filterEnd}
          onChange={(e) => setFilterEnd(e.target.value)}
        />
      </div>
      <button
        className="rent-btn rent-btn--primary rent-btn--sm"
        onClick={onApplyFilter}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
        </svg>
        {t('payments.btnFilter')}
      </button>
    </div>
  )
}
