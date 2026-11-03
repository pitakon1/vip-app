/**
 * 员工考勤页的页面私有类型。
 * 纯结构拆分自 pages/Employee/Attendance.tsx，字段定义与后端枚举保持一致。
 */

/** 与后端 AttendanceStatus 枚举保持一致 */
export type AttendanceStatus = 'present' | 'late' | 'early_out' | 'absent' | 'leave' | 'field_work'

export interface AttendanceRecord {
  key: string
  date: string
  check_in: string | null
  check_out: string | null
  status: AttendanceStatus
  remark: string
}

export interface CalendarCell {
  day: number
  outside?: boolean
  today?: boolean
  event?: { label: string; tone: 'success' | 'warning' | 'info' | 'neutral' }
}

/** 我的生效考勤规则（考勤组命中则为组规则，否则为全局兜底） */
export interface MyRule {
  group_id?: string | null
  group_name?: string | null
  office_lat?: number
  office_lng?: number
  radius_km?: number
  utc_offset_hours?: number
  work_start?: string
  work_end?: string
  late_grace_minutes?: number
  early_grace_minutes?: number
}

export type LeaveType = 'annual' | 'sick' | 'personal' | 'unpaid' | 'maternity' | 'other'
export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'

export interface LeaveRow {
  id: string
  leave_type: LeaveType
  start_date: string
  end_date: string
  days: number | null
  reason: string
  status: LeaveStatus
  reply_note?: string | null
  created_at?: string | null
}

/** GET /geo/attendance 返回的定位校验信息 */
export interface GeoInfo {
  distance_km?: number
  within_radius?: boolean
  address?: string
}

export interface LeaveForm {
  leave_type: LeaveType
  start_date: string
  end_date: string
  reason: string
}

/** 我的生效规则展示项 */
export interface RuleItem {
  label: string
  value: string
}
