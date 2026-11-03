import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import type { PerfSummary } from '../types'
import { fmtMoney } from '../utils'

interface Props {
  summary: PerfSummary | null
}

/** KPI 卡片：年度/月度业绩、成交数、佣金 */
export const KpiCards = ({ summary: s }: Props) => {
  const { t } = useTranslation()
  return (
    <div className="rent-grid rent-grid--4 rent-mb-5">
      <div className="rent-stat-card">
        <div className="rent-flex rent-flex--between rent-mb-2">
          <div className="rent-stat-card__label">{t('employeePerformance.yearTotal')}</div>
          <div className="rent-stat-card__icon" style={{ background: 'rgba(20, 184, 166, 0.1)', color: 'var(--rent-primary)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="1" x2="12" y2="23" />
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          </div>
        </div>
        <div className="rent-stat-card__value">{fmtMoney(s?.year_total ?? 0)}</div>
        <div className="rent-stat-card__delta rent-stat-card__delta--up">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 15 12 9 18 15" />
          </svg>
          {t('employeePerformance.yearCumulative', { y: s?.year ?? dayjs().year() })}
        </div>
      </div>

      <div className="rent-stat-card">
        <div className="rent-flex rent-flex--between rent-mb-2">
          <div className="rent-stat-card__label">{t('employeePerformance.monthTotal')}</div>
          <div className="rent-stat-card__icon" style={{ background: 'rgba(22,163,74,0.1)', color: 'var(--state-success)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </div>
        </div>
        <div className="rent-stat-card__value">{fmtMoney(s?.month_total ?? 0)}</div>
        <div className="rent-stat-card__delta rent-stat-card__delta--up">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 15 12 9 18 15" />
          </svg>
          {t('employeePerformance.monthDealsNote', { n: s?.month_deals ?? 0 })}
        </div>
      </div>

      <div className="rent-stat-card">
        <div className="rent-flex rent-flex--between rent-mb-2">
          <div className="rent-stat-card__label">{t('employeePerformance.dealsTotal')}</div>
          <div className="rent-stat-card__icon" style={{ background: 'rgba(14,165,233,0.1)', color: 'var(--state-info)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
          </div>
        </div>
        <div className="rent-stat-card__value">
          {s?.deals_total ?? 0} <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--rent-ink-2)' }}>{t('employeePerformance.unitDeal')}</span>
        </div>
        <div className="rent-stat-card__delta rent-stat-card__delta--up">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 15 12 9 18 15" />
          </svg>
          {t('employeePerformance.newRenewNote', { nr: s?.new_rentals ?? 0, rn: s?.renewals ?? 0 })}
        </div>
      </div>

      <div className="rent-stat-card">
        <div className="rent-flex rent-flex--between rent-mb-2">
          <div className="rent-stat-card__label">{t('employeePerformance.commissionTotal')}</div>
          <div className="rent-stat-card__icon" style={{ background: 'rgba(217,119,6,0.1)', color: 'var(--state-warning)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
              <path d="M12 6v2" />
              <path d="M12 16v2" />
            </svg>
          </div>
        </div>
        <div className="rent-stat-card__value">{fmtMoney(s?.commission_total ?? 0)}</div>
        <div className="rent-stat-card__delta rent-stat-card__delta--up">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 15 12 9 18 15" />
          </svg>
          {t('employeePerformance.monthCommissionNote', { amount: fmtMoney(s?.month_commission ?? 0) })}
        </div>
      </div>
    </div>
  )
}
