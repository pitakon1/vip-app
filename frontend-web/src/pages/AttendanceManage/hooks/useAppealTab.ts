/**
 * 「申诉审批」页签的数据与审批弹窗状态。
 * 纯结构拆分自 pages/AttendanceManage/index.tsx，筛选参数与审批载荷保持不变。
 */
import { useCallback, useEffect, useState } from 'react'
import { message } from 'antd'
import { useTranslation } from 'react-i18next'
import { attendanceApi } from '@/services/api'
import { errorText } from '@/lib/errorText'
import type { AttendanceTab } from '../attendanceTypes'

const APPEAL_STATUSES: ('pending' | 'approved' | 'rejected')[] = ['pending', 'approved', 'rejected']

export function useAppealTab(tab: AttendanceTab) {
  const { t } = useTranslation()

  const [appealFilter, setAppealFilter] = useState<'' | 'pending' | 'approved' | 'rejected'>('')
  const [appeals, setAppeals] = useState<any[]>([])
  const [loadingAppeals, setLoadingAppeals] = useState(false)
  const [appealsError, setAppealsError] = useState<string | null>(null)
  const [appealReview, setAppealReview] = useState<{
    appeal: any
    action: 'approved' | 'rejected'
  } | null>(null)
  const [appealNote, setAppealNote] = useState('')
  const [saving, setSaving] = useState(false)

  const loadAppeals = useCallback(() => {
    setLoadingAppeals(true)
    setAppealsError(null)
    attendanceApi
      .appeals(appealFilter ? { status: appealFilter } : undefined)
      .then((res) => setAppeals(res.data ?? []))
      .catch(() => setAppealsError(t('common.loadFailed')))
      .finally(() => setLoadingAppeals(false))
  }, [appealFilter, t])

  useEffect(() => {
    if (tab === 'appeal') loadAppeals()
  }, [tab, loadAppeals])

  const submitAppealReview = async () => {
    if (!appealReview) return
    setSaving(true)
    try {
      await attendanceApi.approveAppeal(appealReview.appeal.id, {
        action: appealReview.action,
        reply_note: appealNote || null,
      })
      message.success(t('attAdm.msgAppealReviewed'))
      setAppealReview(null)
      setAppealNote('')
      loadAppeals()
    } catch (err) {
      message.error(errorText(err, t('attAdm.errAppealReview')))
    } finally {
      setSaving(false)
    }
  }

  return {
    APPEAL_STATUSES,
    appealFilter,
    setAppealFilter,
    appeals,
    loadingAppeals,
    appealsError,
    appealReview,
    setAppealReview,
    appealNote,
    setAppealNote,
    saving,
    loadAppeals,
    submitAppealReview,
    closeAppealReview: () => setAppealReview(null),
  }
}

export type AppealTabState = ReturnType<typeof useAppealTab>
