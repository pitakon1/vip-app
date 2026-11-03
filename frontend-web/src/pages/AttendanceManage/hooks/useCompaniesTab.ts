/**
 * 「按合作公司」页签的数据状态。
 * 纯结构拆分自 pages/AttendanceManage/index.tsx，请求参数与日期默认值保持不变。
 */
import { useCallback, useEffect, useState } from 'react'
import { message } from 'antd'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { attendanceApi } from '@/services/api'
import type { AttendanceTab } from '../attendanceTypes'

export function useCompaniesTab(tab: AttendanceTab) {
  const { t } = useTranslation()

  const [companyRange, setCompanyRange] = useState({
    start: dayjs().startOf('month').format('YYYY-MM-DD'),
    end: dayjs().format('YYYY-MM-DD'),
  })
  const [companyRows, setCompanyRows] = useState<any[]>([])
  const [loadingCompanies, setLoadingCompanies] = useState(false)

  const loadCompanies = useCallback(() => {
    setLoadingCompanies(true)
    attendanceApi
      .adminCompanies({ start_date: companyRange.start, end_date: companyRange.end })
      .then((res) => setCompanyRows(res.data?.companies ?? []))
      .catch(() => message.error(t('attAdm.errCompanies')))
      .finally(() => setLoadingCompanies(false))
  }, [companyRange.start, companyRange.end, t])

  useEffect(() => {
    if (tab === 'companies') loadCompanies()
  }, [tab, loadCompanies])

  return {
    companyRange,
    setCompanyRange,
    companyRows,
    loadingCompanies,
    loadCompanies,
  }
}

export type CompaniesTabState = ReturnType<typeof useCompaniesTab>
