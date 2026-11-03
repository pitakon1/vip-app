/**
 * 「核对」页签的数据与校准弹窗状态。
 *
 * 纯结构拆分自 pages/AttendanceManage/index.tsx：请求参数、重置条件、
 * 校准提交载荷的构造完全保持不变。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { message } from 'antd'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { attendanceApi } from '@/services/api'
import { downloadReport } from '@/lib/download'
import type { AttendanceStatus, AttendanceTab, DayRow, EmployeeRecord } from '../attendanceTypes'

export function useRecordsTab(tab: AttendanceTab) {
  const { t } = useTranslation()

  const [range, setRange] = useState({ start: dayjs().format('YYYY-MM-DD'), end: dayjs().format('YYYY-MM-DD') })
  const [recordsDept, setRecordsDept] = useState('')
  const [recordsPartner, setRecordsPartner] = useState('')
  const [summary, setSummary] = useState<Record<string, number>>({})
  const [records, setRecords] = useState<EmployeeRecord[]>([])
  const [loadingRecords, setLoadingRecords] = useState(false)
  const [recordsError, setRecordsError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string[]>([])

  const loadRecords = useCallback(() => {
    setLoadingRecords(true)
    setRecordsError(null)
    attendanceApi
      .adminRecords({
        start_date: range.start,
        end_date: range.end,
        ...(recordsDept ? { department: recordsDept } : {}),
        ...(recordsPartner ? { partner_id: recordsPartner } : {}),
      })
      .then((res) => {
        setRecords(res.data?.records ?? [])
        setSummary(res.data?.summary ?? {})
      })
      .catch(() => setRecordsError(t('common.loadFailed')))
      .finally(() => setLoadingRecords(false))
  }, [range.start, range.end, recordsDept, recordsPartner, t])

  useEffect(() => {
    if (tab === 'records') loadRecords()
  }, [tab, loadRecords])

  // 校准弹窗
  const [calib, setCalib] = useState<{
    employee: EmployeeRecord
    day: DayRow | null
    exists: boolean
  } | null>(null)
  const [calibForm, setCalibForm] = useState({
    status: '' as '' | AttendanceStatus,
    check_in: '',
    check_out: '',
    notes: '',
  })
  const [saving, setSaving] = useState(false)

  const openCalibrate = (employee: EmployeeRecord, day: DayRow | null) => {
    setCalib({ employee, day, exists: !!day })
    setCalibForm({
      status: (day?.status ?? '') as '' | AttendanceStatus,
      check_in: day?.check_in ? dayjs(day.check_in).format('HH:mm') : '',
      check_out: day?.check_out ? dayjs(day.check_out).format('HH:mm') : '',
      notes: day?.notes ?? '',
    })
  }

  const submitCalibrate = async () => {
    if (!calib) return
    const date = calib.day?.date ?? range.start
    const payload: Record<string, unknown> = { date }
    if (calibForm.status) payload.status = calibForm.status
    if (calibForm.check_in) payload.check_in_time = `${date}T${calibForm.check_in}:00`
    if (calibForm.check_out) payload.check_out_time = `${date}T${calibForm.check_out}:00`
    if (calibForm.notes) payload.notes = calibForm.notes
    if (Object.keys(payload).length === 1) {
      message.error(t('attAdm.errCalibrateEmpty'))
      return
    }
    if (calibForm.check_in && calibForm.check_out && calibForm.check_out < calibForm.check_in) {
      message.error(t('attAdm.errCalibrateRange'))
      return
    }
    setSaving(true)
    try {
      await attendanceApi.calibrate(calib.employee.employee_id, payload)
      message.success(t('attAdm.msgCalibrated'))
      setCalib(null)
      loadRecords()
    } catch {
      message.error(t('attAdm.errCalibrate'))
    } finally {
      setSaving(false)
    }
  }

  const handleExportRecords = async () => {
    try {
      await downloadReport(
        '/exports/attendance',
        {
          start_date: range.start,
          end_date: range.end,
          ...(recordsDept ? { department: recordsDept } : {}),
          ...(recordsPartner ? { partner_id: recordsPartner } : {}),
        },
        'attendance-admin.csv',
      )
      message.success(t('attendance.msgExported'))
    } catch {
      message.error(t('attendance.exportFailed'))
    }
  }

  const deptOptions = useMemo(
    () => [...new Set(records.map((r) => r.department).filter(Boolean))] as string[],
    [records],
  )

  const toggleExpanded = (employeeId: string) => {
    setExpanded((prev) =>
      prev.includes(employeeId)
        ? prev.filter((id) => id !== employeeId)
        : [...prev, employeeId],
    )
  }

  return {
    range,
    setRange,
    recordsDept,
    setRecordsDept,
    recordsPartner,
    setRecordsPartner,
    summary,
    records,
    loadingRecords,
    recordsError,
    expanded,
    loadRecords,
    deptOptions,
    toggleExpanded,
    handleExportRecords,
    calib,
    calibForm,
    setCalibForm,
    saving,
    openCalibrate,
    submitCalibrate,
    closeCalibrate: () => setCalib(null),
  }
}

export type RecordsTabState = ReturnType<typeof useRecordsTab>
