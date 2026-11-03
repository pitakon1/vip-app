import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import type { CalendarCell } from '../types'

/** 本月考勤日历（按真实记录着色，周末显示休息）。 */
const AttendanceCalendar = ({ cells }: { cells: CalendarCell[] }) => {
  const { t } = useTranslation()

  return (
    <div className="rent-card">
      <div className="rent-card__header">
        <h3 className="rent-card__title">{t('attendance.calendarTitle')}</h3>
        <span className="rent-caption">{t('attendance.monthLabel', { y: dayjs().year(), m: dayjs().month() + 1 })}</span>
      </div>
      <div className="rent-card__body">
        <div className="rent-calendar">
          <div className="rent-calendar__header">{t('attendance.calMon')}</div>
          <div className="rent-calendar__header">{t('attendance.calTue')}</div>
          <div className="rent-calendar__header">{t('attendance.calWed')}</div>
          <div className="rent-calendar__header">{t('attendance.calThu')}</div>
          <div className="rent-calendar__header">{t('attendance.calFri')}</div>
          <div className="rent-calendar__header">{t('attendance.calSat')}</div>
          <div className="rent-calendar__header">{t('attendance.calSun')}</div>

          {cells.map((cell, idx) => {
            const cls = [
              'rent-calendar__cell',
              cell.outside ? 'rent-calendar__cell--outside' : '',
              cell.today ? 'rent-calendar__cell--today' : '',
            ]
              .filter(Boolean)
              .join(' ')
            return (
              <div key={idx} className={cls}>
                <span className="rent-calendar__date">{cell.day}</span>
                {cell.event && (
                  <span className={`rent-calendar__event rent-calendar__event--${cell.event.tone}`}>
                    {cell.event.label}
                  </span>
                )}
              </div>
            )
          })}
        </div>
        <hr className="rent-divider" />
        <div className="rent-calendar__legend">
          <span className="rent-calendar__legend-item">
            <span className="rent-badge--dot" style={{ background: 'var(--state-success)' }} />
            {t('attendance.stPresent')}
          </span>
          <span className="rent-calendar__legend-item">
            <span className="rent-badge--dot" style={{ background: 'var(--state-warning)' }} />
            {t('attendance.stLate')}
          </span>
          <span className="rent-calendar__legend-item">
            <span className="rent-badge--dot" style={{ background: 'var(--state-info)' }} />
            {t('attendance.legendOut')}
          </span>
          <span className="rent-calendar__legend-item">
            <span className="rent-badge--dot" style={{ background: 'var(--rent-ink-3)' }} />
            {t('attendance.legendLeaveRest')}
          </span>
          <span className="rent-calendar__legend-item">
            <span className="rent-badge--dot" style={{ background: 'var(--rent-primary)' }} />
            {t('attendance.legendToday')}
          </span>
        </div>
      </div>
    </div>
  )
}

export default AttendanceCalendar
