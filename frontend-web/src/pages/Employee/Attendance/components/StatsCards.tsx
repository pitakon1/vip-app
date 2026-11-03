import { useTranslation } from 'react-i18next'

interface StatsCardsProps {
  stats: { attend: number; late: number; field: number; leave: number }
  dueDays: number
  monthRecordsCount: number
  attendanceRate: number
}

/** KPI 卡片：本月出勤 / 迟到 / 外勤 / 出勤率。 */
const StatsCards = ({ stats, dueDays, monthRecordsCount, attendanceRate }: StatsCardsProps) => {
  const { t } = useTranslation()

  return (
    <div className="rent-grid rent-grid--4 rent-mb-5">
      <div className="rent-stat-card">
        <div className="rent-flex rent-flex--between rent-mb-2">
          <div className="rent-stat-card__label">{t('attendance.statMonthAttend')}</div>
          <div
            className="rent-stat-card__icon"
            style={{ background: 'rgba(20, 184, 166, 0.1)', color: 'var(--rent-primary)' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
              <path d="M9 16l2 2 4-4" />
            </svg>
          </div>
        </div>
        <div className="rent-stat-card__value">
          {stats.attend} <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--rent-ink-2)' }}>{t('attendance.unitDays')}</span>
        </div>
        <div className="rent-stat-card__delta rent-stat-card__delta--up">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 15 12 9 18 15" />
          </svg>
          {t('attendance.dueDaysLabel', { days: dueDays })}
        </div>
      </div>

      <div className="rent-stat-card">
        <div className="rent-flex rent-flex--between rent-mb-2">
          <div className="rent-stat-card__label">{t('attendance.statLateCount')}</div>
          <div
            className="rent-stat-card__icon"
            style={{ background: 'rgba(217,119,6,0.1)', color: 'var(--state-warning)' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
        </div>
        <div className="rent-stat-card__value" style={{ color: 'var(--state-warning)' }}>
          {stats.late} <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--rent-ink-2)' }}>{t('attendance.unitTimes')}</span>
        </div>
        <div className="rent-stat-card__delta" style={{ color: 'var(--state-warning)' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          {t('attendance.monthRecordsLabel', { count: monthRecordsCount })}
        </div>
      </div>

      <div className="rent-stat-card">
        <div className="rent-flex rent-flex--between rent-mb-2">
          <div className="rent-stat-card__label">{t('attendance.statField')}</div>
          <div
            className="rent-stat-card__icon"
            style={{ background: 'rgba(14,165,233,0.1)', color: 'var(--state-info)' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
          </div>
        </div>
        <div className="rent-stat-card__value">
          {stats.field} <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--rent-ink-2)' }}>{t('attendance.unitTimes')}</span>
        </div>
        <div className="rent-stat-card__delta rent-stat-card__delta--up">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 15 12 9 18 15" />
          </svg>
          {t('attendance.fieldHint')}
        </div>
      </div>

      <div className="rent-stat-card">
        <div className="rent-flex rent-flex--between rent-mb-2">
          <div className="rent-stat-card__label">{t('attendance.statRate')}</div>
          <div
            className="rent-stat-card__icon"
            style={{ background: 'rgba(22,163,74,0.1)', color: 'var(--state-success)' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="5" x2="5" y2="19" />
              <circle cx="6.5" cy="6.5" r="2.5" />
              <circle cx="17.5" cy="17.5" r="2.5" />
            </svg>
          </div>
        </div>
        <div className="rent-stat-card__value">
          {attendanceRate}
          <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--rent-ink-2)' }}>%</span>
        </div>
        <div className="rent-progress rent-mt-2">
          <div
            className="rent-progress__bar"
            style={{ width: `${attendanceRate}%`, background: 'var(--state-success)' }}
          />
        </div>
      </div>
    </div>
  )
}

export default StatsCards
