/**
 * 「报表」页签的数据状态。
 * 纯结构拆分自 pages/AttendanceManage/index.tsx，日期默认值与查询参数保持不变。
 */
import { useCallback, useEffect, useState } from 'react'
import { message } from 'antd'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { attendanceApi } from '@/services/api'
import type { AttendanceTab } from '../attendanceTypes'

export function useReportTab(tab: AttendanceTab) {
  const { t } = useTranslation()

  const [reportRange, setReportRange] = useState({
    start: dayjs().startOf('month').format('YYYY-MM-DD'),
    end: dayjs().format('YYYY-MM-DD'),
  })
  const [reportDept, setReportDept] = useState('')
  const [reportPartner, setReportPartner] = useState('')
  const [report, setReport] = useState<any | null>(null)
  const [loadingReport, setLoadingReport] = useState(false)

  const loadReport = useCallback(() => {
    setLoadingReport(true)
    attendanceApi
      .summary({
        start_date: reportRange.start,
        end_date: reportRange.end,
        ...(reportDept ? { department: reportDept } : {}),
        ...(reportPartner ? { partner_id: reportPartner } : {}),
      })
      .then((res) => setReport(res.data))
      .catch(() => message.error(t('attAdm.errReport')))
      .finally(() => setLoadingReport(false))
  }, [reportRange.start, reportRange.end, reportDept, reportPartner, t])

  useEffect(() => {
    if (tab === 'report') loadReport()
  }, [tab, loadReport])

  return {
    reportRange,
    setReportRange,
    reportDept,
    setReportDept,
    reportPartner,
    setReportPartner,
    report,
    loadingReport,
    loadReport,
  }
}

export type ReportTabState = ReturnType<typeof useReportTab>
