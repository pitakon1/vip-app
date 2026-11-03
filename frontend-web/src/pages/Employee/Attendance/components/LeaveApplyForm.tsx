import { useTranslation } from 'react-i18next'
import { LEAVE_TYPES } from '../constants'
import type { LeaveForm, LeaveType } from '../types'

interface LeaveApplyFormProps {
  form: LeaveForm
  leaveTypeLabelMap: Record<LeaveType, string>
  daysPreview: number
  submitting: boolean
  onPatch: (patch: Partial<LeaveForm>) => void
  onSubmit: () => void
}

/** 请假申请表单。 */
const LeaveApplyForm = ({
  form,
  leaveTypeLabelMap,
  daysPreview,
  submitting,
  onPatch,
  onSubmit,
}: LeaveApplyFormProps) => {
  const { t } = useTranslation()

  return (
    <div className="rent-card">
      <div className="rent-card__header">
        <h3 className="rent-card__title">{t('attendance.leaveApplyTitle')}</h3>
      </div>
      <div className="rent-card__body">
        <div className="rent-grid rent-grid--2 rent-mb-4">
          <div className="rent-field">
            <label className="rent-label">{t('attendance.leaveType')}</label>
            <select
              className="rent-input"
              value={form.leave_type}
              onChange={(e) => onPatch({ leave_type: e.target.value as LeaveType })}
            >
              {LEAVE_TYPES.map((lt) => (
                <option key={lt} value={lt}>
                  {leaveTypeLabelMap[lt]}
                </option>
              ))}
            </select>
          </div>
          <div className="rent-field">
            <label className="rent-label">{t('attendance.leaveDays')}</label>
            <input className="rent-input" type="text" value={daysPreview} readOnly />
          </div>
          <div className="rent-field">
            <label className="rent-label">{t('attendance.leaveStart')}</label>
            <input
              className="rent-input"
              type="date"
              value={form.start_date}
              onChange={(e) => onPatch({ start_date: e.target.value })}
            />
          </div>
          <div className="rent-field">
            <label className="rent-label">{t('attendance.leaveEnd')}</label>
            <input
              className="rent-input"
              type="date"
              value={form.end_date}
              onChange={(e) => onPatch({ end_date: e.target.value })}
            />
          </div>
        </div>
        <div className="rent-field rent-mb-4">
          <label className="rent-label">{t('attendance.leaveReason')}</label>
          <textarea
            className="rent-textarea"
            rows={3}
            placeholder={t('attendance.phLeaveReason')}
            value={form.reason}
            onChange={(e) => onPatch({ reason: e.target.value })}
          />
        </div>
        <div className="rent-flex" style={{ justifyContent: 'flex-end' }}>
          <button className="rent-btn rent-btn--primary" onClick={onSubmit} disabled={submitting}>
            {t('attendance.submitLeave')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default LeaveApplyForm
