import { useCallback } from 'react'
import { message } from 'antd'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { downloadReport } from '@/lib/download'

/** 导出考勤明细（员工只能导出自己的，范围由后端按角色校验）。 */
export const useAttendanceExport = () => {
  const { t } = useTranslation()

  return useCallback(async () => {
    try {
      await downloadReport(
        '/exports/attendance',
        { start_date: dayjs().startOf('month').format('YYYY-MM-DD'), end_date: dayjs().format('YYYY-MM-DD') },
        'attendance.csv',
      )
      message.success(t('attendance.msgExported'))
    } catch {
      message.error(t('attendance.exportFailed'))
    }
  }, [t])
}
