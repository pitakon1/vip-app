import { useTranslation } from 'react-i18next'
import type { PaymentSummary } from '../types'

interface Props {
  summary: PaymentSummary
}

/** 顶部四张统计卡片（数值来自真实接口数据） */
export default function PaymentsSummaryCards({ summary }: Props) {
  const { t } = useTranslation()
  const statIncome = summary.totalAmount
  const statExpense = summary.expenseAmount
  const statPending = summary.pendingAmount
  const statOverdue = summary.overdueAmount

  return (
    <div className="rent-grid rent-grid--4 rent-mb-5">
      <div className="rent-stat-card">
        <div className="rent-stat-card__label">{t('payments.statIncome')}</div>
        <div className="rent-stat-card__value">฿{Number(statIncome).toLocaleString()}</div>
      </div>
      <div className="rent-stat-card">
        <div className="rent-stat-card__label">{t('payments.statExpense')}</div>
        <div className="rent-stat-card__value">฿{Number(statExpense).toLocaleString()}</div>
      </div>
      <div className="rent-stat-card">
        <div className="rent-stat-card__label">{t('payments.statPending')}</div>
        <div className="rent-stat-card__value">฿{Number(statPending).toLocaleString()}</div>
        <div className="rent-mt-2">
          <span className="rent-badge rent-badge--warning">
            <span className="rent-badge--dot" style={{ background: 'var(--state-warning)' }} />
            {t('payments.pendingCount', { count: summary.pendingCount })}
          </span>
        </div>
      </div>
      <div className="rent-stat-card">
        <div className="rent-stat-card__label">{t('payments.statOverdue')}</div>
        <div className="rent-stat-card__value">฿{Number(statOverdue).toLocaleString()}</div>
        <div className="rent-mt-2">
          <span className="rent-badge rent-badge--error">
            <span className="rent-badge--dot" style={{ background: 'var(--state-error)' }} />
            {t('payments.overdueCount', { count: summary.overdueCount })}
          </span>
        </div>
      </div>
    </div>
  )
}
