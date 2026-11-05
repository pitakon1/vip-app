import { useTranslation } from 'react-i18next'
import { formatMoney } from '@/lib/money'
import type { EmployeeStats } from '../types'

interface Props {
  stats: EmployeeStats
}

/** 顶部四个统计卡：总人数 / 业绩冠军 / 人均业绩 / 团队累计业绩（全部为后端全局值） */
export const EmployeeStatsCards = ({ stats }: Props) => {
  const { t } = useTranslation()
  return (
    <div className="rent-grid rent-grid--4 rent-mb-5">
      <div className="rent-stat-card">
        <div className="rent-stat-card__head">
          <div>
            <div className="rent-stat-card__label">{t('employees.statTotal')}</div>
            <div className="rent-stat-card__value rent-num">{stats.totalEmp}</div>
          </div>
          <div className="rent-stat-card__icon" style={{ background: 'rgba(20, 184, 166, 0.1)', color: 'var(--rent-primary)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
          </div>
        </div>
      </div>

      <div className="rent-stat-card">
        <div className="rent-stat-card__head">
          <div>
            <div className="rent-stat-card__label">{t('employees.statTop')}</div>
            <div className="rent-stat-card__value rent-num" style={{ fontSize: 22 }}>{stats.topName}</div>
            <div className="rent-stat-card__delta" style={{ color: 'var(--state-warning)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></svg>
              {formatMoney(stats.topPerf)}
            </div>
          </div>
          <div className="rent-stat-card__icon" style={{ background: 'rgba(217,119,6,0.1)', color: 'var(--state-warning)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="7" /><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" /></svg>
          </div>
        </div>
      </div>

      <div className="rent-stat-card">
        <div className="rent-stat-card__head">
          <div>
            <div className="rent-stat-card__label">{t('employees.statAvg')}</div>
            <div className="rent-stat-card__value rent-num">{formatMoney(stats.avg)}</div>
          </div>
          <div className="rent-stat-card__icon" style={{ background: 'rgba(22,163,74,0.1)', color: 'var(--state-success)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg>
          </div>
        </div>
      </div>

      <div className="rent-stat-card">
        <div className="rent-stat-card__head">
          <div>
            <div className="rent-stat-card__label">{t('employees.statTotalPerf')}</div>
            <div className="rent-stat-card__value rent-num">{formatMoney(stats.totalPerf)}</div>
          </div>
          <div className="rent-stat-card__icon" style={{ background: 'rgba(14,165,233,0.1)', color: 'var(--state-info)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></svg>
          </div>
        </div>
      </div>
    </div>
  )
}
