import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { AttendanceStatus, LeaveStatus, LeaveType } from '../types'

/**
 * 状态文案 / 星期文案（依赖 i18n，故在页面内构造）。
 * 拆分自 Attendance.tsx 组件内的 useMemo 文案表，key 与文案完全不变。
 */
export const useAttendanceLabels = () => {
  const { t } = useTranslation()

  const statusLabelMap = useMemo<Record<AttendanceStatus, string>>(
    () => ({
      present: t('attendance.stPresent'),
      late: t('attendance.stLate'),
      early_out: t('attendance.stEarlyOut'),
      absent: t('attendance.stAbsent'),
      leave: t('attendance.stLeave'),
      field_work: t('attendance.stField'),
    }),
    [t],
  )
  const weekdays = useMemo(
    () => [
      t('attendance.wdSun'),
      t('attendance.wdMon'),
      t('attendance.wdTue'),
      t('attendance.wdWed'),
      t('attendance.wdThu'),
      t('attendance.wdFri'),
      t('attendance.wdSat'),
    ],
    [t],
  )
  const leaveTypeLabelMap = useMemo<Record<LeaveType, string>>(
    () => ({
      annual: t('attendance.ltAnnual'),
      sick: t('attendance.ltSick'),
      personal: t('attendance.ltPersonal'),
      unpaid: t('attendance.ltUnpaid'),
      maternity: t('attendance.ltMaternity'),
      other: t('attendance.ltOther'),
    }),
    [t],
  )
  const leaveStatusLabelMap = useMemo<Record<LeaveStatus, string>>(
    () => ({
      pending: t('attendance.lsPending'),
      approved: t('attendance.lsApproved'),
      rejected: t('attendance.lsRejected'),
      cancelled: t('attendance.lsCancelled'),
    }),
    [t],
  )
  const todayLabelMap = useMemo<Record<AttendanceStatus, string>>(
    () => ({
      present: t('attendance.todayPresent'),
      late: t('attendance.todayLate'),
      early_out: t('attendance.todayEarlyOut'),
      absent: t('attendance.todayAbsent'),
      leave: t('attendance.todayLeave'),
      field_work: t('attendance.todayField'),
    }),
    [t],
  )

  return { statusLabelMap, weekdays, leaveTypeLabelMap, leaveStatusLabelMap, todayLabelMap }
}
