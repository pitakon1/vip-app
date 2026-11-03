import { useTranslation } from 'react-i18next'
import { Empty } from 'antd'
import { leaveStatusTone } from '../constants'
import type { LeaveRow, LeaveStatus, LeaveType } from '../types'

interface LeavesTableProps {
  leaves: LeaveRow[]
  leaveTypeLabelMap: Record<LeaveType, string>
  leaveStatusLabelMap: Record<LeaveStatus, string>
  onCancelLeave: (id: string) => void
}

/** 我的请假记录（待审批的可撤销）。 */
const LeavesTable = ({
  leaves,
  leaveTypeLabelMap,
  leaveStatusLabelMap,
  onCancelLeave,
}: LeavesTableProps) => {
  const { t } = useTranslation()

  return (
    <div className="rent-card">
      <div className="rent-card__header">
        <h3 className="rent-card__title">{t('attendance.myLeaves')}</h3>
      </div>
      <div className="rent-card__body" style={{ padding: 0 }}>
        <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
          <table className="rent-table">
            <thead>
              <tr>
                <th>{t('attendance.leaveType')}</th>
                <th>{t('attendance.leaveStart')}</th>
                <th>{t('attendance.leaveDays')}</th>
                <th>{t('common.status')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {leaves.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <div className="rent-empty">
                      <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description={t('attendance.noLeaves')}
                      />
                    </div>
                  </td>
                </tr>
              ) : (
                leaves.map((row) => (
                  <tr key={row.id}>
                    <td className="rent-text-bold">
                      {leaveTypeLabelMap[row.leave_type] ?? row.leave_type}
                    </td>
                    <td className="rent-table__mono">
                      {row.start_date} ~ {row.end_date}
                    </td>
                    <td>
                      {row.days ?? '--'}
                      {t('attendance.unitDays')}
                    </td>
                    <td>
                      <span className={`rent-badge rent-badge--${leaveStatusTone[row.status]}`}>
                        {leaveStatusLabelMap[row.status] ?? row.status}
                      </span>
                    </td>
                    <td>
                      {row.status === 'pending' && (
                        <button
                          className="rent-btn rent-btn--ghost rent-btn--sm"
                          onClick={() => onCancelLeave(row.id)}
                        >
                          {t('attendance.cancelLeave')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default LeavesTable
