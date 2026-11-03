/**
 * 「请假」页签：状态筛选 + 假勤列表 + 审批弹窗。
 * 纯结构拆分自 pages/AttendanceManage/index.tsx，类名与交互保持不变。
 */
import { useTranslation } from 'react-i18next'
import DataState from '@/components/DataState'
import { LEAVE_STATUSES, leaveStatusTone } from './attendanceTypes'
import type { AttendanceTab, LeaveStatus, LeaveType } from './attendanceTypes'
import { useAttendanceLabels } from './hooks/useAttendanceLabels'
import { useLeaveTab } from './hooks/useLeaveTab'
import LeaveReviewModal from './LeaveReviewModal'

export default function LeaveTab({ tab }: { tab: AttendanceTab }) {
  const { t } = useTranslation()
  const { leaveTypeLabel, leaveStatusLabel } = useAttendanceLabels()
  const {
    leaveFilter,
    setLeaveFilter,
    leaves,
    loadingLeaves,
    leavesError,
    review,
    setReview,
    replyNote,
    setReplyNote,
    saving,
    loadLeaves,
    submitReview,
    closeReview,
  } = useLeaveTab(tab)

  return (
    <>
      <div className="rent-card rent-mb-5">
        <div className="rent-card__body attAdm-filter">
          <label className="rent-label">{t('common.status')}</label>
          <select
            className="rent-input"
            value={leaveFilter}
            onChange={(e) => setLeaveFilter(e.target.value as '' | LeaveStatus)}
          >
            <option value="">{t('common.all')}</option>
            {LEAVE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {leaveStatusLabel[s]}
              </option>
            ))}
          </select>
          <button className="rent-btn rent-btn--primary" onClick={loadLeaves}>
            {t('common.search')}
          </button>
        </div>
      </div>

      <div className="rent-card">
        <div className="rent-card__header">
          <h3 className="rent-card__title">{t('attAdm.leaveTitle')}</h3>
          <span className="rent-caption">{t('attAdm.leaveHint')}</span>
        </div>
        <div className="rent-card__body" style={{ padding: 0 }}>
          <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
            <table className="rent-table">
              <thead>
                <tr>
                  <th>{t('attAdm.thEmployee')}</th>
                  <th>{t('attAdm.thDepartment')}</th>
                  <th>{t('attAdm.thLeaveType')}</th>
                  <th>{t('attAdm.thPeriod')}</th>
                  <th>{t('attAdm.thDays')}</th>
                  <th>{t('attAdm.thReason')}</th>
                  <th>{t('common.status')}</th>
                  <th>{t('common.action')}</th>
                </tr>
              </thead>
              <tbody>
                {leavesError && leaves.length === 0 ? (
                  <tr>
                    <td colSpan={8}>
                      <DataState error={leavesError} retryText={t('common.retry')} onRetry={loadLeaves} />
                    </td>
                  </tr>
                ) : loadingLeaves && leaves.length === 0 ? (
                  <tr>
                    <td colSpan={8}>
                      <DataState loading loadingText={t('common.loading')} skeletonRows={4} />
                    </td>
                  </tr>
                ) : leaves.length === 0 ? (
                  <tr>
                    <td colSpan={8}>
                      <DataState empty filtered={!!leaveFilter} emptyTitle={t('attAdm.noLeaves')} />
                    </td>
                  </tr>
                ) : (
                  leaves.map((l) => (
                    <tr key={l.id}>
                      <td className="rent-text-bold">{l.name || '—'}</td>
                      <td>{l.department || '—'}</td>
                      <td>{leaveTypeLabel[l.leave_type as LeaveType] ?? l.leave_type}</td>
                      <td className="rent-table__mono">
                        {l.start_date} ~ {l.end_date}
                      </td>
                      <td>{l.days}</td>
                      <td className="rent-text-sm">{l.reason}</td>
                      <td>
                        <span className={`rent-badge rent-badge--${leaveStatusTone[l.status as LeaveStatus]}`}>
                          {leaveStatusLabel[l.status as LeaveStatus] ?? l.status}
                        </span>
                        {l.reply_note && (
                          <div className="rent-text-sm rent-text-muted">{l.reply_note}</div>
                        )}
                      </td>
                      <td>
                        {l.status === 'pending' ? (
                          <>
                            <button
                              className="rent-btn rent-btn--ghost rent-btn--sm"
                              onClick={() => {
                                setReview({ leave: l, action: 'approved' })
                                setReplyNote('')
                              }}
                            >
                              {t('attAdm.approve')}
                            </button>
                            <button
                              className="rent-btn rent-btn--ghost rent-btn--sm attAdm-danger"
                              onClick={() => {
                                setReview({ leave: l, action: 'rejected' })
                                setReplyNote('')
                              }}
                            >
                              {t('attAdm.reject')}
                            </button>
                          </>
                        ) : (
                          <span className="rent-text-muted">—</span>
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

      <LeaveReviewModal
        review={review}
        replyNote={replyNote}
        setReplyNote={setReplyNote}
        saving={saving}
        leaveTypeLabel={leaveTypeLabel}
        onCancel={closeReview}
        onSubmit={submitReview}
      />
    </>
  )
}
