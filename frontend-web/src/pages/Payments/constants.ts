import type { DisplayStatus, DisplayType, ManualForm } from './types'

export const statusMeta: Record<DisplayStatus, { label: string; badge: string; dot: string }> = {
  completed: { label: 'payments.stCompleted', badge: 'rent-badge--success', dot: 'var(--state-success)' },
  pending: { label: 'payments.stPending', badge: 'rent-badge--info', dot: 'var(--state-info)' },
  overdue: { label: 'payments.stOverdue', badge: 'rent-badge--error', dot: 'var(--state-error)' },
  refunded: { label: 'payments.stRefunded', badge: 'rent-badge--neutral', dot: 'var(--rent-ink-3)' },
}

export const typeMeta: Record<DisplayType, { label: string; badge: string }> = {
  income: { label: 'payments.tyIncome', badge: 'rent-badge--primary' },
  expense: { label: 'payments.tyExpense', badge: 'rent-badge--neutral' },
  refund: { label: 'payments.tyRefund', badge: 'rent-badge--warning' },
}

/* 业务类型码 → i18n key：与「类型」筛选下拉保持同一口径（租金/押金/佣金…）。
   表格此前一律显示收支方向（收款），导致筛选「租金」后列表里全是「收款」。 */
export const PAYMENT_TYPE_LABEL_KEYS: Record<string, string> = {
  rent: 'payments.optRent',
  deposit: 'payments.optDeposit',
  commission: 'payments.optCommission',
  service_fee: 'payments.optServiceFee',
  utility: 'payments.optUtility',
  tax: 'payments.optTax',
  refund: 'payments.optRefund',
}

/* 支付渠道码 → i18n key。后端落库的是枚举码（promptpay / bank_transfer …），
   筛选下拉已翻译，但表格与详情此前直接打印原始码，两处口径不一致。 */
export const CHANNEL_LABEL_KEYS: Record<string, string> = {
  promptpay: 'payments.chPromptpay',
  bank_transfer: 'payments.chBankTransfer',
  stripe: 'payments.chCreditCard',
  credit_card: 'payments.chCreditCard',
  alipay: 'payments.chAlipay',
  wechat: 'payments.chWechat',
  wise: 'payments.chWise',
}

export const DEFAULT_MANUAL_FORM: ManualForm = {
  payer_id: '',
  payee_id: '',
  amount: '',
  currency: 'THB',
  payment_type: 'rent',
  channel: 'bank_transfer',
  due_date: '',
  description: '',
}
