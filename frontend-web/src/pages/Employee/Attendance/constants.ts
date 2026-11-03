import type { AttendanceStatus, LeaveStatus, LeaveType } from './types'

export const LEAVE_TYPES: LeaveType[] = ['annual', 'sick', 'personal', 'unpaid', 'maternity', 'other']

export const leaveStatusTone: Record<LeaveStatus, 'success' | 'warning' | 'error' | 'neutral'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'error',
  cancelled: 'neutral',
}

export const statusBadgeTone: Record<AttendanceStatus, 'success' | 'warning' | 'info' | 'neutral'> = {
  present: 'success',
  late: 'warning',
  early_out: 'warning',
  field_work: 'info',
  absent: 'neutral',
  leave: 'neutral',
}
