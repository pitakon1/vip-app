/**
 * 「申诉审批」页签：状态筛选 + 申诉列表 + 审批弹窗。
 * 纯结构拆分自 pages/AttendanceManage/index.tsx，类名与交互保持不变。
 */
import { useTranslation } from 'react-i18next'
import DataState from '@/components/DataState'
import { leaveStatusTone } from './attendanceTypes'
import type { AttendanceTab, LeaveStatus } from './attendanceTypes'
import { useAttendanceLabels } from './hooks/useAttendanceLabels'
import { useAppealTab } from './hooks/useAppealTab'
import AppealReviewModal from './AppealReviewModal'

export default function AppealTab({ tab }: { tab: AttendanceTab }) {
  const { t } = useTranslation()
  const { leaveStatusLabel } = useAttendanceLabels()
  const {
    APPEAL_STATUSES,
    appealFilter,
    setAppealFilter,
    appeals,
    loadingAppeals,
    appealsError,
    appealReview,
    setAppealReview,
    appealNote,
    setAppealNote,
    saving,
    loadAppeals,
    submitAppealReview,
    closeAppealReview,
  } = useAppealTab(tab)

  return (
    <>
      <div className="rent-card rent-mb-5">
        <div className="rent-card__body attAdm-filter">
          <label className="rent-label">{t('common.status')}</label>
          <select
            className="rent-input"
            value={appealFilter}
            onChange={(e) =>
              setAppealFilter(e.target.value as '' | 'pending' | 'approved' | 'rejected')
            }
          >
            <option value="">{t('common.all')}</option>
            {APPEAL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {leaveStatusLabel[s]}
              </option>
            ))}
          </select>
          <button className="rent-btn rent-btn--primary" onClick={loadAppeals}>
            {t('common.search')}
          </button>
        </div>
      </div>

      <div className="rent-card">
        <div className="rent-card__header">
          <h3 className="rent-card__title">{t('attAdm.appealReview')}</h3>
        </div>
        <div className="rent-card__body" style={{ padding: 0 }}>
          <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
            <table className="rent-table">
              <thead>
                <tr>
                  <th>{t('attAdm.thEmployee')}</th>
                  <th>{t('attAdm.thDepartment')}</th>
                  <th>{t('attAdm.appealDate')}</th>
                  <th>{t('attAdm.thReason')}</th>
                  <th>{t('common.status')}</th>
                  <th>{t('attAdm.replyNote')}</th>
                  <th>{t('common.action')}</th>
                </tr>
              </thead>
              <tbody>
                {appealsError && appeals.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <DataState error={appealsError} retryText={t('common.retry')} onRetry={loadAppeals} />
                    </td>
                  </tr>
                ) : loadingAppeals && appeals.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <DataState loading loadingText={t('common.loading')} skeletonRows={4} />
                    </td>
                  </tr>
                ) : appeals.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <DataState empty filtered={!!appealFilter} emptyTitle={t('attendance.noAppeal')} />
                    </td>
                  </tr>
                ) : (
                  appeals.map((a) => (
                    <tr key={a.id}>
                      <td className="rent-text-bold">{a.name || '—'}</td>
                      <td>{a.department || '—'}</td>
                      <td className="rent-table__mono">{String(a.date ?? '').slice(0, 10)}</td>
                      <td className="rent-text-sm">{a.reason}</td>
                      <td>
                        <span className={`rent-badge rent-badge--${leaveStatusTone[a.status as LeaveStatus]}`}>
                          {leaveStatusLabel[a.status as LeaveStatus] ?? a.status}
                        </span>
                      </td>
                      <td className="rent-text-sm">{a.reply_note || '—'}</td>
                      <td>
                        {a.status === 'pending' ? (
                          <>
                            <button
                              className="rent-btn rent-btn--ghost rent-btn--sm"
                              onClick={() => {
                                setAppealReview({ appeal: a, action: 'approved' })
                                setAppealNote('')
                              }}
                            >
                              {t('attAdm.approve')}
                            </button>
                            <button
                              className="rent-btn rent-btn--ghost rent-btn--sm attAdm-danger"
                              onClick={() => {
                                setAppealReview({ appeal: a, action: 'rejected' })
                                setAppealNote('')
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

      <AppealReviewModal
        appealReview={appealReview}
        appealNote={appealNote}
        setAppealNote={setAppealNote}
        saving={saving}
        onCancel={closeAppealReview}
        onSubmit={submitAppealReview}
      />
    </>
  )
}
