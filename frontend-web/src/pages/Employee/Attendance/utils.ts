import dayjs from 'dayjs'
import type { AttendanceRecord, AttendanceStatus, CalendarCell } from './types'
import { statusBadgeTone } from './constants'

/** 把后端考勤记录转成表格/日历用的行数据。 */
export const toRecord = (raw: any): AttendanceRecord => ({
  key: String(raw.date ?? raw.id),
  date: String(raw.date ?? '').slice(0, 10),
  check_in: raw.check_in_time ? dayjs(raw.check_in_time).format('HH:mm') : null,
  check_out: raw.check_out_time ? dayjs(raw.check_out_time).format('HH:mm') : null,
  status: (raw.status as AttendanceStatus) || 'present',
  remark: raw.notes || '',
})

/** 按真实考勤记录生成本月日历（周一为一周起点）。 */
export const buildCalendar = (
  month: dayjs.Dayjs,
  records: AttendanceRecord[],
  statusLabelMap: Record<AttendanceStatus, string>,
  restLabel: string,
): CalendarCell[] => {
  const byDate = new Map(records.map((r) => [r.date, r]))
  const today = dayjs().format('YYYY-MM-DD')
  const cells: CalendarCell[] = []
  const first = month.startOf('month')

  // 月初前补上一月日期，保证与「一」列对齐
  const lead = (first.day() + 6) % 7
  for (let i = lead; i > 0; i--) {
    cells.push({ day: first.subtract(i, 'day').date(), outside: true })
  }

  for (let d = 1; d <= month.daysInMonth(); d++) {
    const date = month.date(d)
    const key = date.format('YYYY-MM-DD')
    const rec = byDate.get(key)
    const weekend = date.day() === 0 || date.day() === 6
    cells.push({
      day: d,
      today: key === today,
      event: rec
        ? { label: statusLabelMap[rec.status], tone: statusBadgeTone[rec.status] }
        : weekend
          ? { label: restLabel, tone: 'neutral' }
          : undefined,
    })
  }

  // 月末补下一月日期，凑满整周
  const tail = cells.length % 7
  for (let d = 1; d <= (tail ? 7 - tail : 0); d++) {
    cells.push({ day: d, outside: true })
  }
  return cells
}

/** HH:mm:ss → HH:mm 展示（无值时占位）。 */
export const fmtHHmm = (timeStr: string | null) => {
  if (!timeStr) return '--:--'
  const parts = timeStr.split(':')
  return `${parts[0] ?? '--'}:${parts[1] ?? '--'}`
}
