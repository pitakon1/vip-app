import { useCallback, useEffect, useMemo, useState } from 'react'
import { message } from 'antd'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { attendanceApi } from '@/services/api'
import type { LeaveForm, LeaveRow } from '../types'

/**
 * 请假申请 + 我的请假记录（审批通过后由后端回写考勤为 leave）。
 * 请假天数由后端按自然日自动计算，前端只做展示预览。
 */
export const useLeaveFlow = () => {
  const { t } = useTranslation()
  const [leaves, setLeaves] = useState<LeaveRow[]>([])
  const [leaveSubmitting, setLeaveSubmitting] = useState(false)
  const [leaveForm, setLeaveForm] = useState<LeaveForm>({
    leave_type: 'annual',
    start_date: dayjs().format('YYYY-MM-DD'),
    end_date: dayjs().format('YYYY-MM-DD'),
    reason: '',
  })

  // 我的请假记录（后端按角色只返回本人申请）
  const loadLeaves = useCallback(() => {
    attendanceApi
      .leaveRequests()
      .then((res) => setLeaves((res.data ?? []) as LeaveRow[]))
      .catch(() => setLeaves([]))
  }, [])

  useEffect(() => {
    loadLeaves()
  }, [loadLeaves])

  const leaveDaysPreview = useMemo(() => {
    const start = dayjs(leaveForm.start_date)
    const end = dayjs(leaveForm.end_date)
    if (!start.isValid() || !end.isValid() || end.isBefore(start)) return 0
    return end.diff(start, 'day') + 1
  }, [leaveForm.start_date, leaveForm.end_date])

  const patchLeaveForm = (patch: Partial<LeaveForm>) => {
    setLeaveForm({ ...leaveForm, ...patch })
  }

  const handleLeaveSubmit = () => {
    if (!leaveForm.reason.trim()) {
      message.error(t('attendance.errLeaveReason'))
      return
    }
    if (leaveDaysPreview <= 0) {
      message.error(t('attendance.errLeaveRange'))
      return
    }
    setLeaveSubmitting(true)
    attendanceApi
      .applyLeave({
        leave_type: leaveForm.leave_type,
        start_date: leaveForm.start_date,
        end_date: leaveForm.end_date,
        reason: leaveForm.reason.trim(),
      })
      .then(() => {
        message.success(t('attendance.msgLeaveApplied'))
        setLeaveForm({
          leave_type: 'annual',
          start_date: dayjs().format('YYYY-MM-DD'),
          end_date: dayjs().format('YYYY-MM-DD'),
          reason: '',
        })
        loadLeaves()
      })
      .catch(() => message.error(t('attendance.errLeaveApply')))
      .finally(() => setLeaveSubmitting(false))
  }

  const handleLeaveCancel = (id: string) => {
    if (!window.confirm(t('attendance.confirmCancelLeave'))) return
    attendanceApi
      .cancelLeave(id)
      .then(() => {
        message.success(t('attendance.msgLeaveCancelled'))
        loadLeaves()
      })
      .catch(() => message.error(t('attendance.errLeaveApply')))
  }

  return {
    leaves,
    leaveForm,
    patchLeaveForm,
    leaveDaysPreview,
    leaveSubmitting,
    handleLeaveSubmit,
    handleLeaveCancel,
  }
}
