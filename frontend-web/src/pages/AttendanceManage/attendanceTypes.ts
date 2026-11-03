/**
 * 考勤管理页的共享类型与常量。
 * 纯结构拆分自 pages/AttendanceManage/index.tsx，取值、文案口径与展示格式保持不变。
 */
import { BANGKOK_CENTER } from '@/constants/location'
import dayjs from 'dayjs'

export type AttendanceStatus = 'present' | 'late' | 'early_out' | 'absent' | 'leave' | 'field_work'
export type LeaveType = 'annual' | 'sick' | 'personal' | 'unpaid' | 'maternity' | 'other'
export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'
export type AttendanceTab = 'records' | 'groups' | 'leave' | 'report' | 'appeal' | 'companies'

export const STATUSES: AttendanceStatus[] = [
  'present',
  'late',
  'early_out',
  'absent',
  'leave',
  'field_work',
]
export const LEAVE_TYPES: LeaveType[] = ['annual', 'sick', 'personal', 'unpaid', 'maternity', 'other']
export const LEAVE_STATUSES: LeaveStatus[] = ['pending', 'approved', 'rejected', 'cancelled']

export const statusTone: Record<AttendanceStatus, string> = {
  present: 'success',
  late: 'warning',
  early_out: 'warning',
  field_work: 'info',
  absent: 'neutral',
  leave: 'neutral',
}

export const leaveStatusTone: Record<LeaveStatus, string> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'error',
  cancelled: 'neutral',
}

export interface DayRow {
  date: string
  status: AttendanceStatus
  check_in: string | null
  check_out: string | null
  notes: string | null
  late_minutes: number | null
  early_out_minutes: number | null
}

export interface EmployeeRecord {
  employee_id: string
  name: string | null
  email: string | null
  department: string | null
  employee_code: string | null
  days: DayRow[]
}

export interface GroupForm {
  name: string
  description: string
  department: string
  office_lat: string
  office_lng: string
  radius_km: string
  utc_offset_hours: string
  work_start: string
  work_end: string
  late_grace_minutes: string
  early_grace_minutes: string
  is_default: boolean
  is_active: boolean
}

export const emptyGroupForm = (): GroupForm => ({
  name: '',
  description: '',
  department: '',
  office_lat: String(BANGKOK_CENTER.lat),
  office_lng: String(BANGKOK_CENTER.lng),
  radius_km: '0.5',
  utc_offset_hours: '7',
  work_start: '09:00',
  work_end: '18:00',
  late_grace_minutes: '0',
  early_grace_minutes: '0',
  is_default: false,
  is_active: true,
})

/** 后端返回的是 naive UTC ISO；与考勤打卡页一致按本地时刻展示，保证同一口径。 */
export const fmtTime = (v: string | null) => (v ? dayjs(v).format('HH:mm') : '--:--')
