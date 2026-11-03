/**
 * 「核对」页签的汇总卡 + 考勤明细表（含失败 / 加载 / 空态与展开明细行）。
 * 纯结构拆分自 pages/AttendanceManage/index.tsx，类名与交互保持不变。
 */
import { Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import DataState from '@/components/DataState'
import { STATUSES, fmtTime, statusTone } from './attendanceTypes'
import type { AttendanceStatus, DayRow, EmployeeRecord, LeaveType } from './attendanceTypes'

export default function RecordsList({
  records,
  summary,
  loading,
  error,
  expanded,
  isFiltering,
  isPartnerAdmin,
  statusLabel,
  leaveTypeLabel,
  onRetry,
  onToggleExpand,
  onCalibrate,
}: {
  records: EmployeeRecord[]
  summary: Record<string, number>
  loading: boolean
  error: string | null
  expanded: string[]
  isFiltering: boolean
  isPartnerAdmin: boolean
  statusLabel: Record<AttendanceStatus, string>
  leaveTypeLabel: Record<LeaveType, string>
  onRetry: () => void
  onToggleExpand: (employeeId: string) => void
  onCalibrate: (employee: EmployeeRecord, day: DayRow | null) => void
}) {
  const { t } = useTranslation()

  return (
    <>
      <div className="rent-card rent-mb-5">
        <div className="rent-card__header">
          <h3 className="rent-card__title">{t('attAdm.summaryTitle')}</h3>
          <span className="rent-caption">
            {t('attAdm.employeeCount', { count: records.length })}
          </span>
        </div>
        <div className="rent-card__body">
          <div className="attAdm-badges">
            {STATUSES.map((s) => (
              <span key={s} className={`rent-badge rent-badge--${statusTone[s]}`}>
                <span className={`rent-badge--dot attAdm-dot attAdm-dot--${statusTone[s]}`} />
                {statusLabel[s]} {summary[s] ?? 0}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="rent-card">
        <div className="rent-card__header">
          <h3 className="rent-card__title">{t('attAdm.recordsTitle')}</h3>
          <span className="rent-caption">{t('attAdm.recordsHint')}</span>
        </div>
        <div className="rent-card__body" style={{ padding: 0 }}>
          <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
            <table className="rent-table">
              <thead>
                <tr>
                  <th>{t('attAdm.thEmployee')}</th>
                  <th>{t('attAdm.thDepartment')}</th>
                  <th>{t('attAdm.thCode')}</th>
                  <th>{t('attAdm.thRecorded')}</th>
                  <th>{t('attAdm.thAbnormal')}</th>
                  <th>{t('common.action')}</th>
                </tr>
              </thead>
              <tbody>
                {error && records.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <DataState error={error} retryText={t('common.retry')} onRetry={onRetry} />
                    </td>
                  </tr>
                ) : loading && records.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <DataState loading loadingText={t('common.loading')} skeletonRows={4} />
                    </td>
                  </tr>
                ) : records.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <DataState empty filtered={isFiltering} emptyTitle={t('common.noData')} />
                    </td>
                  </tr>
                ) : (
                  records.map((emp) => {
                    const abnormal = emp.days.filter(
                      (d) => d.late_minutes || d.early_out_minutes || d.status === 'absent',
                    ).length
                    const open = expanded.includes(emp.employee_id)
                    return (
                      <Fragment key={emp.employee_id}>
                        <tr>
                          <td className="rent-text-bold">{emp.name || emp.email || '—'}</td>
                          <td>{emp.department || '—'}</td>
                          <td className="rent-table__mono">{emp.employee_code || '—'}</td>
                          <td>{emp.days.length}</td>
                          <td>
                            {abnormal > 0 ? (
                              <span className="rent-badge rent-badge--warning">{abnormal}</span>
                            ) : (
                              <span className="rent-badge rent-badge--neutral">0</span>
                            )}
                          </td>
                          <td>
                            <button
                              className="rent-btn rent-btn--ghost rent-btn--sm"
                              onClick={() => onToggleExpand(emp.employee_id)}
                            >
                              {open ? t('attAdm.collapse') : t('attAdm.expand')}
                            </button>
                            {!isPartnerAdmin && (
                              <button
                                className="rent-btn rent-btn--ghost rent-btn--sm"
                                onClick={() => onCalibrate(emp, null)}
                              >
                                {t('attAdm.calibrate')}
                              </button>
                            )}
                          </td>
                        </tr>
                        {open && (
                          <tr>
                            <td colSpan={6} style={{ background: 'var(--rent-surface-2)' }}>
                              {emp.days.length === 0 ? (
                                <div className="rent-text-sm rent-text-muted">
                                  {t('attAdm.noDayRecords')}
                                </div>
                              ) : (
                                <table className="rent-table">
                                  <thead>
                                    <tr>
                                      <th>{t('attendance.thDate')}</th>
                                      <th>{t('attendance.thCheckIn')}</th>
                                      <th>{t('attendance.thCheckOut')}</th>
                                      <th>{t('common.status')}</th>
                                      <th>{t('attAdm.thLate')}</th>
                                      <th>{t('attAdm.thEarlyOut')}</th>
                                      <th>{t('attAdm.thNotes')}</th>
                                      <th>{t('common.action')}</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {emp.days.map((d) => (
                                      <tr key={d.date}>
                                        <td className="rent-table__mono">{d.date.slice(0, 10)}</td>
                                        <td className="rent-table__mono">{fmtTime(d.check_in)}</td>
                                        <td className="rent-table__mono">{fmtTime(d.check_out)}</td>
                                        <td>
                                          <span
                                            className={`rent-badge rent-badge--${statusTone[d.status]}`}
                                          >
                                            {statusLabel[d.status]}
                                          </span>
                                        </td>
                                        <td>{d.late_minutes ? `${d.late_minutes}` : '—'}</td>
                                        <td>
                                          {d.early_out_minutes ? `${d.early_out_minutes}` : '—'}
                                        </td>
                                        <td className="rent-text-sm">
                                          {d.notes
                                            ? (leaveTypeLabel as Record<string, string>)[d.notes] ??
                                              d.notes
                                            : '—'}
                                        </td>
                                        <td>
                                          {!isPartnerAdmin && (
                                            <button
                                              className="rent-btn rent-btn--ghost rent-btn--sm"
                                              onClick={() => onCalibrate(emp, d)}
                                            >
                                              {t('attAdm.calibrate')}
                                            </button>
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  )
}
