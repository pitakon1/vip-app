import { useTranslation } from 'react-i18next'
import { Spin, Empty } from 'antd'
import { leaveStatusTone } from '../constants'
import type { LeaveStatus } from '../types'

interface AppealTableProps {
  appeals: any[]
  loading: boolean
  leaveStatusLabelMap: Record<LeaveStatus, string>
}

/** 我的申诉记录。 */
const AppealTable = ({ appeals, loading, leaveStatusLabelMap }: AppealTableProps) => {
  const { t } = useTranslation()

  return (
    <div className="rent-card">
      <div className="rent-card__header">
        <h3 className="rent-card__title">{t('attendance.appealList')}</h3>
      </div>
      <div className="rent-card__body" style={{ padding: 0 }}>
        <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
          <table className="rent-table">
            <thead>
              <tr>
                <th>{t('attendance.thDate')}</th>
                <th>{t('attendance.appealReason')}</th>
                <th>{t('common.status')}</th>
                <th>{t('attAdm.replyNote')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4}>
                    <div className="rent-empty">
                      <Spin size="small" style={{ marginRight: 8 }} />
                      {t('common.loading')}
                    </div>
                  </td>
                </tr>
              ) : appeals.length === 0 ? (
                <tr>
                  <td colSpan={4}>
                    <div className="rent-empty">
                      <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description={t('attendance.noAppeal')}
                      />
                    </div>
                  </td>
                </tr>
              ) : (
                appeals.map((row) => (
                  <tr key={row.id}>
                    <td className="rent-table__mono">{String(row.date ?? '').slice(0, 10)}</td>
                    <td className="rent-text-sm">{row.reason}</td>
                    <td>
                      <span
                        className={`rent-badge rent-badge--${leaveStatusTone[row.status as LeaveStatus]}`}
                      >
                        {leaveStatusLabelMap[row.status as LeaveStatus] ?? row.status}
                      </span>
                    </td>
                    <td className="rent-text-sm">{row.reply_note || '—'}</td>
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

export default AppealTable
