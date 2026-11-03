import { useCallback, useEffect, useState } from 'react'
import { message } from 'antd'
import { useTranslation } from 'react-i18next'
import { attendanceApi } from '@/services/api'
import { toRecord } from '../utils'
import type { AttendanceRecord } from '../types'

/** 加载我的考勤记录（真实数据，不做静态兜底）。 */
export const useAttendanceRecords = () => {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [records, setRecords] = useState<AttendanceRecord[]>([])

  const loadRecords = useCallback(() => {
    setLoading(true)
    attendanceApi
      .me()
      .then((res) => {
        setRecords((res.data ?? []).map(toRecord))
        setLoadFailed(false)
      })
      .catch(() => {
        setLoadFailed(true)
        message.error(t('attendance.errLoad'))
      })
      .finally(() => setLoading(false))
    // 与原实现保持一致：仅在挂载时取一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    loadRecords()
  }, [loadRecords])

  return { loading, loadFailed, records, loadRecords }
}
