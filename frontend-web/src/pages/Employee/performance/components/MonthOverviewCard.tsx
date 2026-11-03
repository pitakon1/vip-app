import { useTranslation } from 'react-i18next'
import type { Dayjs } from 'dayjs'
import type { BarItem, PerfSummary } from '../types'
import { fmtMoney } from '../utils'

interface Props {
  monthTabs: Dayjs[]
  activeMonthIdx: number
  onMonthChange: (month: Dayjs) => void
  barData: BarItem[]
  summary: PerfSummary | null
}

/** 月度业绩概览：月份选项卡 + 柱图 + 四项小结 */
export const MonthOverviewCard = ({ monthTabs, activeMonthIdx, onMonthChange, barData, summary: s }: Props) => {
  const { t } = useTranslation()
  return (
    <div className="rent-card rent-mb-5">
      <div className="rent-card__header">
        <h3 className="rent-card__title">{t('employeePerformance.monthOverview')}</h3>
        <span className="rent-text-sm rent-text-muted">{t('employeePerformance.unitLabel')}</span>
      </div>
      <div className="rent-card__body">
        {/* Month Tabs */}
        <div className="rent-tabs">
          {monthTabs.map((mo, idx) => (
            <div
              key={mo.format('YYYY-MM')}
              className="rent-tab"
              data-active={idx === activeMonthIdx}
              onClick={() => onMonthChange(mo)}
              style={{ cursor: 'pointer' }}
            >
              {t('employeePerformance.monthNum', { m: mo.format('M') })}
            </div>
          ))}
        </div>

        {/* CSS Bar Chart */}
        <div style={{ marginBottom: 24 }}>
          <div className="rent-bar-chart">
            {barData.map((b) => (
              <div key={b.label} className="rent-bar-chart__col">
                <div className={`rent-bar-chart__val${b.active ? ' rent-bar-chart__val--active' : ''}`}>
                  {b.value}
                </div>
                <div
                  className={`rent-bar-chart__bar${b.active ? ' rent-bar-chart__bar--active' : ''}`}
                  style={{ height: b.height }}
                />
              </div>
            ))}
          </div>
          <div className="rent-bar-chart__labels">
            {barData.map((b) => (
              <div
                key={b.label}
                className={`rent-bar-chart__label${b.active ? ' rent-bar-chart__label--active' : ''}`}
              >
                {b.label}
              </div>
            ))}
          </div>
        </div>

        {/* Monthly Breakdown */}
        <div className="rent-grid rent-grid--4">
          <div className="rent-mini-stat">
            <div className="rent-text-sm rent-text-muted rent-mb-2">{t('employeePerformance.miniDeals')}</div>
            <div className="rent-mini-stat__value">
              {s?.month_deals ?? 0} <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--rent-ink-2)' }}>{t('employeePerformance.unitDeal')}</span>
            </div>
          </div>
          <div className="rent-mini-stat">
            <div className="rent-text-sm rent-text-muted rent-mb-2">{t('employeePerformance.miniRentIncome')}</div>
            <div className="rent-mini-stat__value">{fmtMoney(s?.month_total ?? 0)}</div>
          </div>
          <div className="rent-mini-stat">
            <div className="rent-text-sm rent-text-muted rent-mb-2">{t('employeePerformance.miniCommissionIncome')}</div>
            <div className="rent-mini-stat__value">{fmtMoney(s?.month_commission ?? 0)}</div>
          </div>
          <div className="rent-mini-stat">
            <div className="rent-text-sm rent-text-muted rent-mb-2">{t('employeePerformance.miniNewRenew')}</div>
            <div className="rent-mini-stat__value">
              {s?.new_rentals ?? 0} <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--rent-ink-2)' }}>/</span> {s?.renewals ?? 0}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
