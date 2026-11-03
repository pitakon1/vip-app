/**
 * 考勤校准弹窗（核对页签的「表单弹窗」）。
 * 纯结构拆分自 pages/AttendanceManage/index.tsx，字段、文案与提交载荷保持不变。
 */
import { Modal } from 'antd'
import type { Dispatch, SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'
import { STATUSES } from './attendanceTypes'
import type { AttendanceStatus, DayRow, EmployeeRecord } from './attendanceTypes'

type CalibForm = { status: '' | AttendanceStatus; check_in: string; check_out: string; notes: string }

export default function CalibrateModal({
  calib,
  form,
  setForm,
  saving,
  rangeStart,
  statusLabel,
  onCancel,
  onSubmit,
}: {
  calib: { employee: EmployeeRecord; day: DayRow | null; exists: boolean } | null
  form: CalibForm
  setForm: Dispatch<SetStateAction<CalibForm>>
  saving: boolean
  rangeStart: string
  statusLabel: Record<AttendanceStatus, string>
  onCancel: () => void
  onSubmit: () => void
}) {
  const { t } = useTranslation()

  return (
    <Modal
      open={!!calib}
      title={t('attAdm.calibrateTitle', { name: calib?.employee.name ?? '' })}
      onCancel={onCancel}
      onOk={onSubmit}
      confirmLoading={saving}
      okText={t('common.save')}
      cancelText={t('common.cancel')}
      destroyOnClose
    >
      {calib && (
        <div className="attAdm-form">
          <div className="rent-field">
            <label className="rent-label">{t('attendance.thDate')}</label>
            <input className="rent-input" value={calib.day?.date ?? rangeStart} readOnly />
          </div>
          <div className="rent-field">
            <label className="rent-label">{t('common.status')}</label>
            <select
              className="rent-input"
              value={form.status}
              onChange={(e) =>
                setForm((p) => ({ ...p, status: e.target.value as '' | AttendanceStatus }))
              }
            >
              <option value="">{t('attAdm.keepStatus')}</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {statusLabel[s]}
                </option>
              ))}
            </select>
            {!calib.exists && (
              <div className="rent-text-sm rent-text-muted">{t('attAdm.missingRecordHint')}</div>
            )}
          </div>
          <div className="rent-grid rent-grid--2">
            <div className="rent-field">
              <label className="rent-label">{t('attendance.thCheckIn')}</label>
              <input
                className="rent-input"
                type="time"
                value={form.check_in}
                onChange={(e) => setForm((p) => ({ ...p, check_in: e.target.value }))}
              />
            </div>
            <div className="rent-field">
              <label className="rent-label">{t('attendance.thCheckOut')}</label>
              <input
                className="rent-input"
                type="time"
                value={form.check_out}
                onChange={(e) => setForm((p) => ({ ...p, check_out: e.target.value }))}
              />
            </div>
          </div>
          <div className="rent-field">
            <label className="rent-label">{t('attAdm.thNotes')}</label>
            <input
              className="rent-input"
              placeholder={t('attAdm.phNotes')}
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
            />
          </div>
        </div>
      )}
    </Modal>
  )
}
