import { useTranslation } from 'react-i18next'
import { Empty } from 'antd'
import { BREAKDOWN_COLORS } from '../constants'
import type { PerfSummary } from '../types'
import { fmtMoney } from '../utils'

interface Props {
  summary: PerfSummary | null
}

/** 本月佣金构成 */
export const BreakdownCard = ({ summary: s }: Props) => {
  const { t } = useTranslation()
  return (
    <div className="rent-card">
      <div className="rent-card__header">
        <h3 className="rent-card__title">{t('employeePerformance.breakdownTitle')}</h3>
        <span className="rent-text-sm rent-text-muted">{t('employeePerformance.thisMonth')}</span>
      </div>
      <div className="rent-card__body rent-flex rent-flex--col rent-gap-4">
        {(s?.breakdown ?? []).length === 0 ? (
          <div className="rent-empty" style={{ padding: '32px 0' }}>
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('employeePerformance.emptyBreakdown')} />
          </div>
        ) : (
          (s?.breakdown ?? []).map((c, i) => (
            <div key={c.deal_type}>
              <div className="rent-flex rent-flex--between rent-mb-2">
                <div className="rent-flex rent-gap-2" style={{ alignItems: 'center' }}>
                  <span className="rent-leg-dot" style={{ background: BREAKDOWN_COLORS[i % BREAKDOWN_COLORS.length] }} />
                  <span className="rent-text-bold">{c.label}</span>
                  <span className="rent-text-sm rent-text-muted">{t('employeePerformance.countDeals', { n: c.count })}</span>
                </div>
                <span className="rent-table__mono rent-text-bold">{fmtMoney(c.amount)}</span>
              </div>
              <div className="rent-progress">
                <div
                  className="rent-progress__bar"
                  style={{ width: `${Math.max(2, c.percent)}%`, background: BREAKDOWN_COLORS[i % BREAKDOWN_COLORS.length] }}
                />
              </div>
              <div className="rent-caption rent-text-muted rent-mt-2">{t('employeePerformance.ratioLabel', { p: c.percent })}</div>
            </div>
          ))
        )}

        <hr className="rent-divider" />

        <div
          className="rent-flex rent-flex--between"
          style={{ padding: '12px 16px', background: 'var(--rent-surface-2)', borderRadius: 'var(--rent-radius-md)' }}
        >
          <span className="rent-text-bold">{t('employeePerformance.monthCommissionTotal')}</span>
          <span className="rent-stat-card__value" style={{ fontSize: 20, color: 'var(--rent-primary)' }}>
            {fmtMoney(s?.month_commission ?? 0)}
          </span>
        </div>
      </div>
    </div>
  )
}
