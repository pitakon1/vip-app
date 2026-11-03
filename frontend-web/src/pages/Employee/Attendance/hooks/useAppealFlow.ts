import { useCallback, useEffect, useState } from 'react'
import { message } from 'antd'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { attendanceApi } from '@/services/api'

/** 打卡异常申诉：提交申诉 + 我的申诉记录（后端按角色只返回本人的申诉）。 */
export const useAppealFlow = () => {
  const { t } = useTranslation()
  const [appealDate, setAppealDate] = useState<dayjs.Dayjs | null>(dayjs())
  const [appealReason, setAppealReason] = useState('')
  const [appealSubmitting, setAppealSubmitting] = useState(false)
  const [appeals, setAppeals] = useState<any[]>([])
  const [appealsLoading, setAppealsLoading] = useState(false)

  const loadAppeals = useCallback(() => {
    setAppealsLoading(true)
    attendanceApi
      .appeals()
      .then((res) => setAppeals(res.data ?? []))
      .catch(() => setAppeals([]))
      .finally(() => setAppealsLoading(false))
  }, [])

  useEffect(() => {
    loadAppeals()
  }, [loadAppeals])

  const handleAppealSubmit = () => {
    if (!appealReason.trim()) {
      message.error(t('attendance.errAppealReason'))
      return
    }
    setAppealSubmitting(true)
    attendanceApi
      .applyAppeal({
        date: (appealDate ?? dayjs()).format('YYYY-MM-DD'),
        reason: appealReason.trim(),
      })
      .then(() => {
        message.success(t('attendance.appealSubmitted'))
        setAppealReason('')
        setAppealDate(dayjs())
        loadAppeals()
      })
      .catch(() => message.error(t('attendance.errAppeal')))
      .finally(() => setAppealSubmitting(false))
  }

  return {
    appeals,
    appealsLoading,
    appealDate,
    setAppealDate,
    appealReason,
    setAppealReason,
    appealSubmitting,
    handleAppealSubmit,
  }
}
