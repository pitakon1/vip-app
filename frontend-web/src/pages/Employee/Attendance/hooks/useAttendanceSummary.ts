import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { buildCalendar } from '../utils'
import type { AttendanceRecord, AttendanceStatus, CalendarCell } from '../types'

/** 本月考勤记录与统计（全部来自真实打卡数据）。 */
export const useAttendanceSummary = (
  records: AttendanceRecord[],
  statusLabelMap: Record<AttendanceStatus, string>,
) => {
  const { t } = useTranslation()
  const monthPrefix = dayjs().format('YYYY-MM')
  const monthRecords = useMemo(
    () => records.filter((r) => r.date.startsWith(monthPrefix)),
    [records, monthPrefix],
  )

  const stats = useMemo(() => {
    let attend = 0
    let late = 0
    let field = 0
    let leave = 0
    monthRecords.forEach((r) => {
      if (r.status === 'present') attend += 1
      else if (r.status === 'late') late += 1
      else if (r.status === 'field_work') field += 1
      else if (r.status === 'leave') leave += 1
    })
    return { attend, late, field, leave }
  }, [monthRecords])

  // 应出勤 = 本月已过去的工作日（周一至周五）；出勤率按「有打卡记录的工作日」计算
  const dueDays = useMemo(() => {
    const today = dayjs()
    let days = 0
    for (let d = 1; d <= today.date(); d++) {
      const w = today.date(d).day()
      if (w !== 0 && w !== 6) days += 1
    }
    return days
  }, [])
  const attendedDays = stats.attend + stats.late + stats.field
  const attendanceRate = dueDays > 0 ? Math.min(100, Math.round((attendedDays / dueDays) * 100)) : 0

  const recentRecords = records.slice(0, 6)
  const calendarCells = useMemo<CalendarCell[]>(
    () => buildCalendar(dayjs(), records, statusLabelMap, t('attendance.rest')),
    [records, statusLabelMap, t],
  )

  return { monthRecords, stats, dueDays, attendanceRate, recentRecords, calendarCells }
}
