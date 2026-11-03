/**
 * 考勤状态 / 请假类型 / 请假状态的 i18n 文案映射（页面内多处复用）。
 * 纯结构拆分自 pages/AttendanceManage/index.tsx，文案 key 与依赖保持不变。
 */
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { AttendanceStatus, LeaveStatus, LeaveType } from '../attendanceTypes'

export function useAttendanceLabels() {
  const { t } = useTranslation()

  // 状态文案 / 请假文案（依赖 i18n）
  const statusLabel = useMemo(
    () =>
      ({
        present: t('attendance.stPresent'),
        late: t('attendance.stLate'),
        early_out: t('attendance.stEarlyOut'),
        absent: t('attendance.stAbsent'),
        leave: t('attendance.stLeave'),
        field_work: t('attendance.stField'),
      }) as Record<AttendanceStatus, string>,
    [t],
  )
  const leaveTypeLabel = useMemo(
    () =>
      ({
        annual: t('attAdm.ltAnnual'),
        sick: t('attAdm.ltSick'),
        personal: t('attAdm.ltPersonal'),
        unpaid: t('attAdm.ltUnpaid'),
        maternity: t('attAdm.ltMaternity'),
        other: t('attAdm.ltOther'),
      }) as Record<LeaveType, string>,
    [t],
  )
  const leaveStatusLabel = useMemo(
    () =>
      ({
        pending: t('attAdm.lsPending'),
        approved: t('attAdm.lsApproved'),
        rejected: t('attAdm.lsRejected'),
        cancelled: t('attAdm.lsCancelled'),
      }) as Record<LeaveStatus, string>,
    [t],
  )

  return { statusLabel, leaveTypeLabel, leaveStatusLabel }
}
