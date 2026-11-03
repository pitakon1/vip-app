/**
 * 「请假」页签的数据与审批弹窗状态。
 * 纯结构拆分自 pages/AttendanceManage/index.tsx，筛选参数与审批载荷保持不变。
 */
import { useCallback, useEffect, useState } from 'react'
import { message } from 'antd'
import { useTranslation } from 'react-i18next'
import { attendanceApi } from '@/services/api'
import { errorText } from '@/lib/errorText'
import type { AttendanceTab, LeaveStatus } from '../attendanceTypes'

export function useLeaveTab(tab: AttendanceTab) {
  const { t } = useTranslation()

  const [leaveFilter, setLeaveFilter] = useState<'' | LeaveStatus>('pending')
  const [leaves, setLeaves] = useState<any[]>([])
  const [loadingLeaves, setLoadingLeaves] = useState(false)
  const [leavesError, setLeavesError] = useState<string | null>(null)
  const [review, setReview] = useState<{ leave: any; action: 'approved' | 'rejected' } | null>(null)
  const [replyNote, setReplyNote] = useState('')
  const [saving, setSaving] = useState(false)

  const loadLeaves = useCallback(() => {
    setLoadingLeaves(true)
    setLeavesError(null)
    attendanceApi
      .leaveRequests(leaveFilter ? { status: leaveFilter } : undefined)
      .then((res) => setLeaves(res.data ?? []))
      .catch(() => setLeavesError(t('common.loadFailed')))
      .finally(() => setLoadingLeaves(false))
  }, [leaveFilter, t])

  useEffect(() => {
    if (tab === 'leave') loadLeaves()
  }, [tab, loadLeaves])

  const submitReview = async () => {
    if (!review) return
    setSaving(true)
    try {
      const res = await attendanceApi.approveLeave(review.leave.id, {
        action: review.action,
        reply_note: replyNote || null,
      })
      const applied = res.data?.applied_days
      message.success(
        review.action === 'approved'
          ? t('attAdm.msgLeaveApproved', { days: applied ?? 0 })
          : t('attAdm.msgLeaveRejected'),
      )
      setReview(null)
      setReplyNote('')
      loadLeaves()
    } catch (err) {
      message.error(errorText(err, t('attAdm.errLeaveReview')))
    } finally {
      setSaving(false)
    }
  }

  return {
    leaveFilter,
    setLeaveFilter,
    leaves,
    loadingLeaves,
    leavesError,
    review,
    setReview,
    replyNote,
    setReplyNote,
    saving,
    loadLeaves,
    submitReview,
    closeReview: () => setReview(null),
  }
}

export type LeaveTabState = ReturnType<typeof useLeaveTab>
