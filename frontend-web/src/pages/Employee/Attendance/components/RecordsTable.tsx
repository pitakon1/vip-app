import { useTranslation } from 'react-i18next'
import { Spin, Empty } from 'antd'
import dayjs from 'dayjs'
import { statusBadgeTone } from '../constants'
import type { AttendanceRecord, AttendanceStatus } from '../types'

interface RecordsTableProps {
  loading: boolean
  records: AttendanceRecord[]
  weekdays: string[]
  statusLabelMap: Record<AttendanceStatus, string>
}

/** 最近考勤明细（取后端返回的前 6 条）。 */
const RecordsTable = ({ loading, records, weekdays, statusLabelMap }: RecordsTableProps) => {
  const { t } = useTranslation()

  return (
    <div className="rent-card">
      <div className="rent-card__header">
        <h3 className="rent-card__title">{t('attendance.recordsTitle')}</h3>
        <a href="#" className="rent-btn rent-btn--ghost rent-btn--sm">{t('attendance.viewAll')}</a>
      </div>
      <div className="rent-card__body" style={{ padding: 0 }}>
        <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
          <table className="rent-table">
            <thead>
              <tr>
                <th>{t('attendance.thDate')}</th>
                <th>{t('attendance.thCheckIn')}</th>
                <th>{t('attendance.thCheckOut')}</th>
                <th>{t('attendance.thType')}</th>
                <th>{t('common.status')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5}>
                    <div className="rent-empty">
                      <Spin size="small" style={{ marginRight: 8 }} />
                      {t('common.loading')}
                    </div>
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <div className="rent-empty">
                      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('attendance.emptyRecords')} />
                    </div>
                  </td>
                </tr>
              ) : (
                records.map((r) => {
                  const isLeave = r.status === 'leave' || r.status === 'absent'
                  const isField = r.status === 'field_work'
                  const typeBadge = isLeave ? (
                    <span className="rent-badge rent-badge--neutral">—</span>
                  ) : isField ? (
                    <span className="rent-badge rent-badge--info">{t('attendance.stField')}</span>
                  ) : (
                    <span className="rent-badge rent-badge--neutral">{t('attendance.badgeClock')}</span>
                  )
                  const tone = statusBadgeTone[r.status]
                  const dotColor =
                    tone === 'success'
                      ? 'var(--state-success)'
                      : tone === 'warning'
                        ? 'var(--state-warning)'
                        : tone === 'info'
                          ? 'var(--state-info)'
                          : 'var(--rent-ink-3)'
                  return (
                    <tr key={r.key}>
                      <td>
                        <div className="rent-text-bold">{dayjs(r.date).format('MM-DD')}</div>
                        <div className="rent-text-sm rent-text-muted">
                          {weekdays[dayjs(r.date).day()]}
                        </div>
                      </td>
                      <td className={`rent-table__mono${r.check_in ? '' : ' rent-text-muted'}`}>
                        {r.check_in || '--:--'}
                      </td>
                      <td className={`rent-table__mono${r.check_out ? '' : ' rent-text-muted'}`}>
                        {r.check_out || '--:--'}
                      </td>
                      <td>{typeBadge}</td>
                      <td>
                        <span className={`rent-badge rent-badge--${tone}`}>
                          <span className="rent-badge--dot" style={{ background: dotColor }} />
                          {statusLabelMap[r.status]}
                        </span>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default RecordsTable
