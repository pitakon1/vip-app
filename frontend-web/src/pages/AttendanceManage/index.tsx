import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { message, Modal, Empty, Spin, Popconfirm } from 'antd'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { attendanceApi, employeesApi } from '@/services/api'
import { downloadReport } from '@/lib/download'
import './attendanceAdmin.css'

/**
 * 管理端「考勤管理」（对标企业微信考勤应用，四个页签）：
 *   核对   —— P0：全员考勤明细 + 行内校准（改状态/补上下班时间/改备注）
 *   考勤组 —— P1-a：多办公点/多班次规则与成员分配
 *   请假   —— P1-b：假勤审批（通过与后端考勤联动）
 *   报表   —— P1-c：异常分类统计与逐日趋势
 */

type AttendanceStatus = 'present' | 'late' | 'early_out' | 'absent' | 'leave' | 'field_work'
type LeaveType = 'annual' | 'sick' | 'personal' | 'unpaid' | 'maternity' | 'other'
type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'

const STATUSES: AttendanceStatus[] = [
  'present',
  'late',
  'early_out',
  'absent',
  'leave',
  'field_work',
]
const LEAVE_TYPES: LeaveType[] = ['annual', 'sick', 'personal', 'unpaid', 'maternity', 'other']
const LEAVE_STATUSES: LeaveStatus[] = ['pending', 'approved', 'rejected', 'cancelled']

const statusTone: Record<AttendanceStatus, string> = {
  present: 'success',
  late: 'warning',
  early_out: 'warning',
  field_work: 'info',
  absent: 'neutral',
  leave: 'neutral',
}

const leaveStatusTone: Record<LeaveStatus, string> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'error',
  cancelled: 'neutral',
}

interface DayRow {
  date: string
  status: AttendanceStatus
  check_in: string | null
  check_out: string | null
  notes: string | null
  late_minutes: number | null
  early_out_minutes: number | null
}

interface EmployeeRecord {
  employee_id: string
  name: string | null
  email: string | null
  department: string | null
  employee_code: string | null
  days: DayRow[]
}

interface GroupForm {
  name: string
  description: string
  department: string
  office_lat: string
  office_lng: string
  radius_km: string
  utc_offset_hours: string
  work_start: string
  work_end: string
  late_grace_minutes: string
  early_grace_minutes: string
  is_default: boolean
  is_active: boolean
}

const emptyGroupForm = (): GroupForm => ({
  name: '',
  description: '',
  department: '',
  office_lat: '13.7563',
  office_lng: '100.5018',
  radius_km: '0.5',
  utc_offset_hours: '7',
  work_start: '09:00',
  work_end: '18:00',
  late_grace_minutes: '0',
  early_grace_minutes: '0',
  is_default: false,
  is_active: true,
})

/** 后端返回的是 naive UTC ISO；与考勤打卡页一致按本地时刻展示，保证同一口径。 */
const fmtTime = (v: string | null) => (v ? dayjs(v).format('HH:mm') : '--:--')

const AttendanceManage = () => {
  const { t } = useTranslation()
  const [tab, setTab] = useState<'records' | 'groups' | 'leave' | 'report'>('records')

  // 状态文案 / 请假文案（依赖 i18n）
  const statusLabel = useMemo(
    () =>
      ({
        present: t('attendance.stPresent'),
        late: t('attendance.stLate'),
        early_out: t('attendance.stEarlyOut'),
        absent: t('attendance.stAbsent'),
        leave: t('attendance.stLeave'),
        field_work: t('attendance.stField'),
      }) as Record<AttendanceStatus, string>,
    [t],
  )
  const leaveTypeLabel = useMemo(
    () =>
      ({
        annual: t('attAdm.ltAnnual'),
        sick: t('attAdm.ltSick'),
        personal: t('attAdm.ltPersonal'),
        unpaid: t('attAdm.ltUnpaid'),
        maternity: t('attAdm.ltMaternity'),
        other: t('attAdm.ltOther'),
      }) as Record<LeaveType, string>,
    [t],
  )
  const leaveStatusLabel = useMemo(
    () =>
      ({
        pending: t('attAdm.lsPending'),
        approved: t('attAdm.lsApproved'),
        rejected: t('attAdm.lsRejected'),
        cancelled: t('attAdm.lsCancelled'),
      }) as Record<LeaveStatus, string>,
    [t],
  )

  const tabs = useMemo(
    () => [
      { key: 'records' as const, label: t('attAdm.tabRecords') },
      { key: 'groups' as const, label: t('attAdm.tabGroups') },
      { key: 'leave' as const, label: t('attAdm.tabLeave') },
      { key: 'report' as const, label: t('attAdm.tabReport') },
    ],
    [t],
  )

  // ---------------------------------------------------------------- 核对
  const [range, setRange] = useState({ start: dayjs().format('YYYY-MM-DD'), end: dayjs().format('YYYY-MM-DD') })
  const [recordsDept, setRecordsDept] = useState('')
  const [summary, setSummary] = useState<Record<string, number>>({})
  const [records, setRecords] = useState<EmployeeRecord[]>([])
  const [loadingRecords, setLoadingRecords] = useState(false)
  const [expanded, setExpanded] = useState<string[]>([])

  const loadRecords = useCallback(() => {
    setLoadingRecords(true)
    attendanceApi
      .adminRecords({
        start_date: range.start,
        end_date: range.end,
        ...(recordsDept ? { department: recordsDept } : {}),
      })
      .then((res) => {
        setRecords(res.data?.records ?? [])
        setSummary(res.data?.summary ?? {})
      })
      .catch(() => message.error(t('attAdm.errRecords')))
      .finally(() => setLoadingRecords(false))
  }, [range.start, range.end, recordsDept, t])

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
        { start_date: range.start, end_date: range.end, ...(recordsDept ? { department: recordsDept } : {}) },
        'attendance-admin.csv',
      )
      message.success(t('attendance.msgExported'))
    } catch {
      message.error(t('attendance.exportFailed'))
    }
  }

  // ---------------------------------------------------------------- 考勤组
  const [groups, setGroups] = useState<any[]>([])
  const [loadingGroups, setLoadingGroups] = useState(false)
  const [groupModal, setGroupModal] = useState<{ id: string | null } | null>(null)
  const [groupForm, setGroupForm] = useState<GroupForm>(emptyGroupForm())
  const [membersModal, setMembersModal] = useState<any | null>(null)
  const [members, setMembers] = useState<any[]>([])
  const [empOptions, setEmpOptions] = useState<any[]>([])
  const [pickedEmployees, setPickedEmployees] = useState<string[]>([])

  const loadGroups = useCallback(() => {
    setLoadingGroups(true)
    attendanceApi
      .groups()
      .then((res) => setGroups(res.data ?? []))
      .catch(() => message.error(t('attAdm.errGroups')))
      .finally(() => setLoadingGroups(false))
  }, [t])

  useEffect(() => {
    if (tab === 'groups') loadGroups()
  }, [tab, loadGroups])

  const loadEmployees = useCallback(() => {
    employeesApi
      .list({ page: 1, pageSize: 200 })
      .then((res) => {
        const payload = res.data?.data ?? res.data
        setEmpOptions(payload?.items ?? [])
      })
      .catch(() => setEmpOptions([]))
  }, [])

  const openGroupModal = (group?: any) => {
    if (group) {
      setGroupForm({
        name: group.name ?? '',
        description: group.description ?? '',
        department: group.department ?? '',
        office_lat: String(group.office_lat ?? ''),
        office_lng: String(group.office_lng ?? ''),
        radius_km: String(group.radius_km ?? ''),
        utc_offset_hours: String(group.utc_offset_hours ?? ''),
        work_start: group.work_start ?? '09:00',
        work_end: group.work_end ?? '18:00',
        late_grace_minutes: String(group.late_grace_minutes ?? 0),
        early_grace_minutes: String(group.early_grace_minutes ?? 0),
        is_default: !!group.is_default,
        is_active: group.is_active !== false,
      })
      setGroupModal({ id: group.id })
    } else {
      setGroupForm(emptyGroupForm())
      setGroupModal({ id: null })
    }
  }

  const submitGroup = async () => {
    if (!groupForm.name.trim()) {
      message.error(t('attAdm.errGroupName'))
      return
    }
    const body: Record<string, unknown> = {
      name: groupForm.name.trim(),
      description: groupForm.description || null,
      department: groupForm.department || null,
      office_lat: Number(groupForm.office_lat),
      office_lng: Number(groupForm.office_lng),
      radius_km: Number(groupForm.radius_km),
      utc_offset_hours: Number(groupForm.utc_offset_hours),
      work_start: groupForm.work_start,
      work_end: groupForm.work_end,
      late_grace_minutes: Number(groupForm.late_grace_minutes),
      early_grace_minutes: Number(groupForm.early_grace_minutes),
      is_default: groupForm.is_default,
      is_active: groupForm.is_active,
    }
    setSaving(true)
    try {
      if (groupModal?.id) {
        await attendanceApi.updateGroup(groupModal.id, body)
      } else {
        await attendanceApi.createGroup(body)
      }
      message.success(t('attAdm.msgGroupSaved'))
      setGroupModal(null)
      loadGroups()
    } catch (err: any) {
      const detail = err?.response?.data?.message
      message.error(detail || t('attAdm.errGroupSave'))
    } finally {
      setSaving(false)
    }
  }

  const removeGroup = async (id: string) => {
    try {
      await attendanceApi.deleteGroup(id)
      message.success(t('attAdm.msgGroupDeleted'))
      loadGroups()
    } catch {
      message.error(t('attAdm.errGroupDelete'))
    }
  }

  const openMembers = async (group: any) => {
    setMembersModal(group)
    setPickedEmployees([])
    loadEmployees()
    try {
      const res = await attendanceApi.groupMembers(group.id)
      setMembers(res.data ?? [])
    } catch {
      setMembers([])
    }
  }

  const addMembers = async () => {
    if (!membersModal || pickedEmployees.length === 0) return
    try {
      const res = await attendanceApi.assignGroupMembers(membersModal.id, {
        employee_ids: pickedEmployees,
      })
      setMembers(res.data ?? [])
      setPickedEmployees([])
      message.success(t('attAdm.msgMembersAdded'))
      loadGroups()
    } catch {
      message.error(t('attAdm.errMemberAdd'))
    }
  }

  const dropMember = async (employeeId: string) => {
    if (!membersModal) return
    try {
      await attendanceApi.removeGroupMember(membersModal.id, employeeId)
      setMembers((prev) => prev.filter((m) => m.employee_id !== employeeId))
      loadGroups()
    } catch {
      message.error(t('attAdm.errMemberRemove'))
    }
  }

  // ---------------------------------------------------------------- 请假
  const [leaveFilter, setLeaveFilter] = useState<'' | LeaveStatus>('pending')
  const [leaves, setLeaves] = useState<any[]>([])
  const [loadingLeaves, setLoadingLeaves] = useState(false)
  const [review, setReview] = useState<{ leave: any; action: 'approved' | 'rejected' } | null>(null)
  const [replyNote, setReplyNote] = useState('')

  const loadLeaves = useCallback(() => {
    setLoadingLeaves(true)
    attendanceApi
      .leaveRequests(leaveFilter ? { status: leaveFilter } : undefined)
      .then((res) => setLeaves(res.data ?? []))
      .catch(() => message.error(t('attAdm.errLeaves')))
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
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('attAdm.errLeaveReview'))
    } finally {
      setSaving(false)
    }
  }

  // ---------------------------------------------------------------- 报表
  const [reportRange, setReportRange] = useState({
    start: dayjs().startOf('month').format('YYYY-MM-DD'),
    end: dayjs().format('YYYY-MM-DD'),
  })
  const [reportDept, setReportDept] = useState('')
  const [report, setReport] = useState<any | null>(null)
  const [loadingReport, setLoadingReport] = useState(false)

  const loadReport = useCallback(() => {
    setLoadingReport(true)
    attendanceApi
      .summary({
        start_date: reportRange.start,
        end_date: reportRange.end,
        ...(reportDept ? { department: reportDept } : {}),
      })
      .then((res) => setReport(res.data))
      .catch(() => message.error(t('attAdm.errReport')))
      .finally(() => setLoadingReport(false))
  }, [reportRange.start, reportRange.end, reportDept, t])

  useEffect(() => {
    if (tab === 'report') loadReport()
  }, [tab, loadReport])

  const deptOptions = useMemo(
    () => [...new Set(records.map((r) => r.department).filter(Boolean))] as string[],
    [records],
  )

  const totals = report?.totals
  const dailyMax = useMemo(() => {
    const rows: any[] = report?.daily ?? []
    return Math.max(1, ...rows.map((d) => d.abnormal ?? 0))
  }, [report])

  return (
    <div className="rent-main">
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title">{t('attAdm.title')}</h2>
          <p className="rent-page-header__subtitle">{t('attAdm.subtitle')}</p>
        </div>
        {tab === 'records' && (
          <div className="rent-page-header__actions">
            <button className="rent-btn rent-btn--secondary" onClick={handleExportRecords}>
              {t('attendance.export')}
            </button>
          </div>
        )}
      </div>

      <div className="rent-tabs">
        {tabs.map((item) => (
          <div
            key={item.key}
            className="rent-tab"
            data-active={tab === item.key ? 'true' : 'false'}
            onClick={() => setTab(item.key)}
          >
            {item.label}
          </div>
        ))}
      </div>

      {/* ------------------------------------------------ 核对 */}
      {tab === 'records' && (
        <>
          <div className="rent-card rent-mb-5">
            <div className="rent-card__body attAdm-filter">
              <label className="rent-label">{t('attAdm.dateRange')}</label>
              <input
                className="rent-input"
                type="date"
                value={range.start}
                onChange={(e) => setRange((p) => ({ ...p, start: e.target.value }))}
              />
              <span className="attAdm-filter__sep">~</span>
              <input
                className="rent-input"
                type="date"
                value={range.end}
                onChange={(e) => setRange((p) => ({ ...p, end: e.target.value }))}
              />
              <label className="rent-label">{t('attAdm.department')}</label>
              <input
                className="rent-input"
                list="attAdm-depts"
                placeholder={t('common.all')}
                value={recordsDept}
                onChange={(e) => setRecordsDept(e.target.value)}
              />
              <datalist id="attAdm-depts">
                {deptOptions.map((d) => (
                  <option key={d} value={d} />
                ))}
              </datalist>
              <button className="rent-btn rent-btn--primary" onClick={loadRecords}>
                {t('common.search')}
              </button>
              {recordsDept && (
                <button className="rent-btn rent-btn--ghost" onClick={() => setRecordsDept('')}>
                  {t('common.reset')}
                </button>
              )}
            </div>
          </div>

          <div className="rent-card rent-mb-5">
            <div className="rent-card__header">
              <h3 className="rent-card__title">{t('attAdm.summaryTitle')}</h3>
              <span className="rent-caption">
                {t('attAdm.employeeCount', { count: records.length })}
              </span>
            </div>
            <div className="rent-card__body">
              <div className="attAdm-badges">
                {STATUSES.map((s) => (
                  <span key={s} className={`rent-badge rent-badge--${statusTone[s]}`}>
                    <span className={`rent-badge--dot attAdm-dot attAdm-dot--${statusTone[s]}`} />
                    {statusLabel[s]} {summary[s] ?? 0}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="rent-card">
            <div className="rent-card__header">
              <h3 className="rent-card__title">{t('attAdm.recordsTitle')}</h3>
              <span className="rent-caption">{t('attAdm.recordsHint')}</span>
            </div>
            <div className="rent-card__body" style={{ padding: 0 }}>
              <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
                <table className="rent-table">
                  <thead>
                    <tr>
                      <th>{t('attAdm.thEmployee')}</th>
                      <th>{t('attAdm.thDepartment')}</th>
                      <th>{t('attAdm.thCode')}</th>
                      <th>{t('attAdm.thRecorded')}</th>
                      <th>{t('attAdm.thAbnormal')}</th>
                      <th>{t('common.action')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingRecords ? (
                      <tr>
                        <td colSpan={6}>
                          <div className="rent-empty">
                            <Spin size="small" style={{ marginRight: 8 }} />
                            {t('common.loading')}
                          </div>
                        </td>
                      </tr>
                    ) : records.length === 0 ? (
                      <tr>
                        <td colSpan={6}>
                          <div className="rent-empty">
                            <Empty
                              image={Empty.PRESENTED_IMAGE_SIMPLE}
                              description={t('common.noData')}
                            />
                          </div>
                        </td>
                      </tr>
                    ) : (
                      records.map((emp) => {
                        const abnormal = emp.days.filter(
                          (d) => d.late_minutes || d.early_out_minutes || d.status === 'absent',
                        ).length
                        const open = expanded.includes(emp.employee_id)
                        return (
                          <Fragment key={emp.employee_id}>
                            <tr>
                              <td className="rent-text-bold">{emp.name || emp.email || '—'}</td>
                              <td>{emp.department || '—'}</td>
                              <td className="rent-table__mono">{emp.employee_code || '—'}</td>
                              <td>{emp.days.length}</td>
                              <td>
                                {abnormal > 0 ? (
                                  <span className="rent-badge rent-badge--warning">{abnormal}</span>
                                ) : (
                                  <span className="rent-badge rent-badge--neutral">0</span>
                                )}
                              </td>
                              <td>
                                <button
                                  className="rent-btn rent-btn--ghost rent-btn--sm"
                                  onClick={() =>
                                    setExpanded((prev) =>
                                      open
                                        ? prev.filter((id) => id !== emp.employee_id)
                                        : [...prev, emp.employee_id],
                                    )
                                  }
                                >
                                  {open ? t('attAdm.collapse') : t('attAdm.expand')}
                                </button>
                                <button
                                  className="rent-btn rent-btn--ghost rent-btn--sm"
                                  onClick={() => openCalibrate(emp, null)}
                                >
                                  {t('attAdm.calibrate')}
                                </button>
                              </td>
                            </tr>
                            {open && (
                              <tr>
                                <td colSpan={6} style={{ background: 'var(--rent-surface-2)' }}>
                                  {emp.days.length === 0 ? (
                                    <div className="rent-text-sm rent-text-muted">
                                      {t('attAdm.noDayRecords')}
                                    </div>
                                  ) : (
                                    <table className="rent-table">
                                      <thead>
                                        <tr>
                                          <th>{t('attendance.thDate')}</th>
                                          <th>{t('attendance.thCheckIn')}</th>
                                          <th>{t('attendance.thCheckOut')}</th>
                                          <th>{t('common.status')}</th>
                                          <th>{t('attAdm.thLate')}</th>
                                          <th>{t('attAdm.thEarlyOut')}</th>
                                          <th>{t('attAdm.thNotes')}</th>
                                          <th>{t('common.action')}</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {emp.days.map((d) => (
                                          <tr key={d.date}>
                                            <td className="rent-table__mono">{d.date.slice(0, 10)}</td>
                                            <td className="rent-table__mono">{fmtTime(d.check_in)}</td>
                                            <td className="rent-table__mono">{fmtTime(d.check_out)}</td>
                                            <td>
                                              <span
                                                className={`rent-badge rent-badge--${statusTone[d.status]}`}
                                              >
                                                {statusLabel[d.status]}
                                              </span>
                                            </td>
                                            <td>{d.late_minutes ? `${d.late_minutes}` : '—'}</td>
                                            <td>
                                              {d.early_out_minutes ? `${d.early_out_minutes}` : '—'}
                                            </td>
                                            <td className="rent-text-sm">
                                              {d.notes
                                                ? (leaveTypeLabel as Record<string, string>)[d.notes] ??
                                                  d.notes
                                                : '—'}
                                            </td>
                                            <td>
                                              <button
                                                className="rent-btn rent-btn--ghost rent-btn--sm"
                                                onClick={() => openCalibrate(emp, d)}
                                              >
                                                {t('attAdm.calibrate')}
                                              </button>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  )}
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ------------------------------------------------ 考勤组 */}
      {tab === 'groups' && (
        <>
          <div className="rent-card rent-mb-5">
            <div className="rent-card__header">
              <h3 className="rent-card__title">{t('attAdm.groupsTitle')}</h3>
              <button className="rent-btn rent-btn--primary rent-btn--sm" onClick={() => openGroupModal()}>
                {t('attAdm.newGroup')}
              </button>
            </div>
            <div className="rent-card__body" style={{ padding: 0 }}>
              <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
                <table className="rent-table">
                  <thead>
                    <tr>
                      <th>{t('attAdm.thGroupName')}</th>
                      <th>{t('attAdm.thDepartment')}</th>
                      <th>{t('attAdm.thOffice')}</th>
                      <th>{t('attAdm.thRadius')}</th>
                      <th>{t('attAdm.thShift')}</th>
                      <th>{t('attAdm.thGrace')}</th>
                      <th>{t('attAdm.thMembers')}</th>
                      <th>{t('common.action')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingGroups ? (
                      <tr>
                        <td colSpan={8}>
                          <div className="rent-empty">
                            <Spin size="small" style={{ marginRight: 8 }} />
                            {t('common.loading')}
                          </div>
                        </td>
                      </tr>
                    ) : groups.length === 0 ? (
                      <tr>
                        <td colSpan={8}>
                          <div className="rent-empty">
                            <Empty
                              image={Empty.PRESENTED_IMAGE_SIMPLE}
                              description={t('attAdm.noGroups')}
                            />
                          </div>
                        </td>
                      </tr>
                    ) : (
                      groups.map((g) => (
                        <tr key={g.id}>
                          <td>
                            <div className="rent-text-bold">
                              {g.name}
                              {g.is_default && (
                                <span className="rent-badge rent-badge--primary attAdm-inline-badge">
                                  {t('attAdm.isDefault')}
                                </span>
                              )}
                              {g.is_active === false && (
                                <span className="rent-badge rent-badge--neutral attAdm-inline-badge">
                                  {t('attAdm.inactive')}
                                </span>
                              )}
                            </div>
                            {g.description && (
                              <div className="rent-text-sm rent-text-muted">{g.description}</div>
                            )}
                          </td>
                          <td>{g.department || '—'}</td>
                          <td className="rent-table__mono">
                            {g.office_lat}, {g.office_lng}
                          </td>
                          <td>{t('attAdm.km', { km: g.radius_km })}</td>
                          <td className="rent-table__mono">
                            {g.work_start} - {g.work_end}
                          </td>
                          <td>
                            {t('attAdm.graceText', {
                              late: g.late_grace_minutes,
                              early: g.early_grace_minutes,
                            })}
                          </td>
                          <td>{g.member_count ?? 0}</td>
                          <td>
                            <button
                              className="rent-btn rent-btn--ghost rent-btn--sm"
                              onClick={() => openMembers(g)}
                            >
                              {t('attAdm.manageMembers')}
                            </button>
                            <button
                              className="rent-btn rent-btn--ghost rent-btn--sm"
                              onClick={() => openGroupModal(g)}
                            >
                              {t('common.edit')}
                            </button>
                            <Popconfirm
                              title={t('attAdm.confirmDeleteGroup')}
                              okText={t('common.confirm')}
                              cancelText={t('common.cancel')}
                              onConfirm={() => removeGroup(g.id)}
                            >
                              <button className="rent-btn rent-btn--ghost rent-btn--sm attAdm-danger">
                                {t('common.delete')}
                              </button>
                            </Popconfirm>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div className="rent-card">
            <div className="rent-card__body rent-text-sm rent-text-muted">{t('attAdm.groupRuleHint')}</div>
          </div>
        </>
      )}

      {/* ------------------------------------------------ 请假 */}
      {tab === 'leave' && (
        <>
          <div className="rent-card rent-mb-5">
            <div className="rent-card__body attAdm-filter">
              <label className="rent-label">{t('common.status')}</label>
              <select
                className="rent-input"
                value={leaveFilter}
                onChange={(e) => setLeaveFilter(e.target.value as '' | LeaveStatus)}
              >
                <option value="">{t('common.all')}</option>
                {LEAVE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {leaveStatusLabel[s]}
                  </option>
                ))}
              </select>
              <button className="rent-btn rent-btn--primary" onClick={loadLeaves}>
                {t('common.search')}
              </button>
            </div>
          </div>

          <div className="rent-card">
            <div className="rent-card__header">
              <h3 className="rent-card__title">{t('attAdm.leaveTitle')}</h3>
              <span className="rent-caption">{t('attAdm.leaveHint')}</span>
            </div>
            <div className="rent-card__body" style={{ padding: 0 }}>
              <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
                <table className="rent-table">
                  <thead>
                    <tr>
                      <th>{t('attAdm.thEmployee')}</th>
                      <th>{t('attAdm.thDepartment')}</th>
                      <th>{t('attAdm.thLeaveType')}</th>
                      <th>{t('attAdm.thPeriod')}</th>
                      <th>{t('attAdm.thDays')}</th>
                      <th>{t('attAdm.thReason')}</th>
                      <th>{t('common.status')}</th>
                      <th>{t('common.action')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingLeaves ? (
                      <tr>
                        <td colSpan={8}>
                          <div className="rent-empty">
                            <Spin size="small" style={{ marginRight: 8 }} />
                            {t('common.loading')}
                          </div>
                        </td>
                      </tr>
                    ) : leaves.length === 0 ? (
                      <tr>
                        <td colSpan={8}>
                          <div className="rent-empty">
                            <Empty
                              image={Empty.PRESENTED_IMAGE_SIMPLE}
                              description={t('attAdm.noLeaves')}
                            />
                          </div>
                        </td>
                      </tr>
                    ) : (
                      leaves.map((l) => (
                        <tr key={l.id}>
                          <td className="rent-text-bold">{l.name || '—'}</td>
                          <td>{l.department || '—'}</td>
                          <td>{leaveTypeLabel[l.leave_type as LeaveType] ?? l.leave_type}</td>
                          <td className="rent-table__mono">
                            {l.start_date} ~ {l.end_date}
                          </td>
                          <td>{l.days}</td>
                          <td className="rent-text-sm">{l.reason}</td>
                          <td>
                            <span className={`rent-badge rent-badge--${leaveStatusTone[l.status as LeaveStatus]}`}>
                              {leaveStatusLabel[l.status as LeaveStatus] ?? l.status}
                            </span>
                            {l.reply_note && (
                              <div className="rent-text-sm rent-text-muted">{l.reply_note}</div>
                            )}
                          </td>
                          <td>
                            {l.status === 'pending' ? (
                              <>
                                <button
                                  className="rent-btn rent-btn--ghost rent-btn--sm"
                                  onClick={() => {
                                    setReview({ leave: l, action: 'approved' })
                                    setReplyNote('')
                                  }}
                                >
                                  {t('attAdm.approve')}
                                </button>
                                <button
                                  className="rent-btn rent-btn--ghost rent-btn--sm attAdm-danger"
                                  onClick={() => {
                                    setReview({ leave: l, action: 'rejected' })
                                    setReplyNote('')
                                  }}
                                >
                                  {t('attAdm.reject')}
                                </button>
                              </>
                            ) : (
                              <span className="rent-text-muted">—</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ------------------------------------------------ 报表 */}
      {tab === 'report' && (
        <>
          <div className="rent-card rent-mb-5">
            <div className="rent-card__body attAdm-filter">
              <label className="rent-label">{t('attAdm.dateRange')}</label>
              <input
                className="rent-input"
                type="date"
                value={reportRange.start}
                onChange={(e) => setReportRange((p) => ({ ...p, start: e.target.value }))}
              />
              <span className="attAdm-filter__sep">~</span>
              <input
                className="rent-input"
                type="date"
                value={reportRange.end}
                onChange={(e) => setReportRange((p) => ({ ...p, end: e.target.value }))}
              />
              <label className="rent-label">{t('attAdm.department')}</label>
              <input
                className="rent-input"
                placeholder={t('common.all')}
                value={reportDept}
                onChange={(e) => setReportDept(e.target.value)}
              />
              <button className="rent-btn rent-btn--primary" onClick={loadReport}>
                {t('common.search')}
              </button>
            </div>
          </div>

          {loadingReport ? (
            <div className="rent-empty">
              <Spin size="small" style={{ marginRight: 8 }} />
              {t('common.loading')}
            </div>
          ) : !report ? (
            <div className="rent-empty">
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('common.noData')} />
            </div>
          ) : (
            <>
              <div className="rent-grid rent-grid--4 rent-mb-5">
                <div className="rent-stat-card">
                  <div className="rent-stat-card__label">{t('attAdm.kpiRate')}</div>
                  <div className="rent-stat-card__value">
                    {totals?.attendance_rate ?? 0}
                    <span className="attAdm-unit">%</span>
                  </div>
                  <div className="rent-text-sm rent-text-muted">
                    {t('attAdm.kpiRateHint', {
                      attended: totals?.attended ?? 0,
                      expected: totals?.expected ?? 0,
                    })}
                  </div>
                </div>
                <div className="rent-stat-card">
                  <div className="rent-stat-card__label">{t('attAdm.kpiAbnormal')}</div>
                  <div className="rent-stat-card__value" style={{ color: 'var(--state-warning)' }}>
                    {totals?.abnormal ?? 0}
                  </div>
                  <div className="rent-text-sm rent-text-muted">
                    {t('attendance.statLateCount')} {totals?.late ?? 0} · {t('attendance.stEarlyOut')}{' '}
                    {totals?.early_out ?? 0} · {t('attendance.stAbsent')} {totals?.absent ?? 0}
                  </div>
                </div>
                <div className="rent-stat-card">
                  <div className="rent-stat-card__label">{t('attAdm.kpiMinutes')}</div>
                  <div className="rent-stat-card__value">{totals?.late_minutes ?? 0}</div>
                  <div className="rent-text-sm rent-text-muted">
                    {t('attendance.stEarlyOut')} {totals?.early_out_minutes ?? 0}
                  </div>
                </div>
                <div className="rent-stat-card">
                  <div className="rent-stat-card__label">{t('attAdm.kpiOther')}</div>
                  <div className="rent-stat-card__value">{totals?.field_work ?? 0}</div>
                  <div className="rent-text-sm rent-text-muted">
                    {t('attendance.stLeave')} {totals?.leave ?? 0} · {t('attendance.stField')}{' '}
                    {totals?.field_work ?? 0}
                  </div>
                </div>
              </div>

              <div className="rent-grid rent-grid--2 rent-mb-5">
                <div className="rent-card">
                  <div className="rent-card__header">
                    <h3 className="rent-card__title">{t('attAdm.deptTitle')}</h3>
                  </div>
                  <div className="rent-card__body" style={{ padding: 0 }}>
                    <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
                      <table className="rent-table">
                        <thead>
                          <tr>
                            <th>{t('attAdm.thDepartment')}</th>
                            <th>{t('attendance.stLate')}</th>
                            <th>{t('attendance.stEarlyOut')}</th>
                            <th>{t('attendance.stAbsent')}</th>
                            <th>{t('attendance.stLeave')}</th>
                            <th>{t('attAdm.thAbnormal')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(report.departments ?? []).length === 0 ? (
                            <tr>
                              <td colSpan={6}>
                                <div className="rent-empty">{t('common.noData')}</div>
                              </td>
                            </tr>
                          ) : (
                            report.departments.map((d: any) => (
                              <tr key={d.department}>
                                <td className="rent-text-bold">{d.department}</td>
                                <td>{d.late}</td>
                                <td>{d.early_out}</td>
                                <td>{d.absent}</td>
                                <td>{d.leave}</td>
                                <td>
                                  <span className="rent-badge rent-badge--warning">{d.abnormal}</span>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                <div className="rent-card">
                  <div className="rent-card__header">
                    <h3 className="rent-card__title">{t('attAdm.trendTitle')}</h3>
                    <span className="rent-caption">{t('attAdm.trendHint')}</span>
                  </div>
                  <div className="rent-card__body">
                    {(report.daily ?? []).length === 0 ? (
                      <div className="rent-empty">{t('common.noData')}</div>
                    ) : (
                      <div className="attAdm-trend">
                        {report.daily.map((d: any) => {
                          const value = d.abnormal ?? 0
                          return (
                            <div key={d.date} className="attAdm-trend__row">
                              <span className="attAdm-trend__label">{d.date.slice(5)}</span>
                              <div className="rent-progress attAdm-trend__bar">
                                <div
                                  className="rent-progress__bar"
                                  style={{ width: `${Math.round((value / dailyMax) * 100)}%` }}
                                />
                              </div>
                              <span className="attAdm-trend__value">
                                {t('attAdm.trendValue', {
                                  present: d.present,
                                  abnormal: d.abnormal,
                                })}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="rent-card">
                <div className="rent-card__header">
                  <h3 className="rent-card__title">{t('attAdm.empTitle')}</h3>
                  <span className="rent-caption">
                    {t('attAdm.employeeCount', { count: report.total_employees ?? 0 })}
                  </span>
                </div>
                <div className="rent-card__body" style={{ padding: 0 }}>
                  <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
                    <table className="rent-table">
                      <thead>
                        <tr>
                          <th>{t('attAdm.thEmployee')}</th>
                          <th>{t('attAdm.thDepartment')}</th>
                          <th>{t('attendance.stPresent')}</th>
                          <th>{t('attendance.stLate')}</th>
                          <th>{t('attendance.stEarlyOut')}</th>
                          <th>{t('attendance.stAbsent')}</th>
                          <th>{t('attendance.stLeave')}</th>
                          <th>{t('attendance.stField')}</th>
                          <th>{t('attAdm.thAbnormal')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(report.employees ?? []).length === 0 ? (
                          <tr>
                            <td colSpan={9}>
                              <div className="rent-empty">{t('common.noData')}</div>
                            </td>
                          </tr>
                        ) : (
                          report.employees.map((e: any) => (
                            <tr key={e.employee_id}>
                              <td className="rent-text-bold">{e.name || e.email || '—'}</td>
                              <td>{e.department || '—'}</td>
                              <td>{e.present}</td>
                              <td>{e.late}</td>
                              <td>{e.early_out}</td>
                              <td>{e.absent}</td>
                              <td>{e.leave}</td>
                              <td>{e.field_work}</td>
                              <td>
                                {e.abnormal > 0 ? (
                                  <span className="rent-badge rent-badge--warning">{e.abnormal}</span>
                                ) : (
                                  <span className="rent-badge rent-badge--neutral">0</span>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* 校准弹窗 */}
      <Modal
        open={!!calib}
        title={t('attAdm.calibrateTitle', { name: calib?.employee.name ?? '' })}
        onCancel={() => setCalib(null)}
        onOk={submitCalibrate}
        confirmLoading={saving}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        destroyOnClose
      >
        {calib && (
          <div className="attAdm-form">
            <div className="rent-field">
              <label className="rent-label">{t('attendance.thDate')}</label>
              <input className="rent-input" value={calib.day?.date ?? range.start} readOnly />
            </div>
            <div className="rent-field">
              <label className="rent-label">{t('common.status')}</label>
              <select
                className="rent-input"
                value={calibForm.status}
                onChange={(e) =>
                  setCalibForm((p) => ({ ...p, status: e.target.value as '' | AttendanceStatus }))
                }
              >
                <option value="">{t('attAdm.keepStatus')}</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {statusLabel[s]}
                  </option>
                ))}
              </select>
              {!calib.exists && (
                <div className="rent-text-sm rent-text-muted">{t('attAdm.missingRecordHint')}</div>
              )}
            </div>
            <div className="rent-grid rent-grid--2">
              <div className="rent-field">
                <label className="rent-label">{t('attendance.thCheckIn')}</label>
                <input
                  className="rent-input"
                  type="time"
                  value={calibForm.check_in}
                  onChange={(e) => setCalibForm((p) => ({ ...p, check_in: e.target.value }))}
                />
              </div>
              <div className="rent-field">
                <label className="rent-label">{t('attendance.thCheckOut')}</label>
                <input
                  className="rent-input"
                  type="time"
                  value={calibForm.check_out}
                  onChange={(e) => setCalibForm((p) => ({ ...p, check_out: e.target.value }))}
                />
              </div>
            </div>
            <div className="rent-field">
              <label className="rent-label">{t('attAdm.thNotes')}</label>
              <input
                className="rent-input"
                placeholder={t('attAdm.phNotes')}
                value={calibForm.notes}
                onChange={(e) => setCalibForm((p) => ({ ...p, notes: e.target.value }))}
              />
            </div>
          </div>
        )}
      </Modal>

      {/* 考勤组弹窗 */}
      <Modal
        open={!!groupModal}
        title={groupModal?.id ? t('attAdm.editGroup') : t('attAdm.newGroup')}
        onCancel={() => setGroupModal(null)}
        onOk={submitGroup}
        confirmLoading={saving}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        width={640}
        destroyOnClose
      >
        <div className="attAdm-form">
          <div className="rent-grid rent-grid--2">
            <div className="rent-field">
              <label className="rent-label">{t('attAdm.thGroupName')}</label>
              <input
                className="rent-input"
                value={groupForm.name}
                onChange={(e) => setGroupForm((p) => ({ ...p, name: e.target.value }))}
              />
            </div>
            <div className="rent-field">
              <label className="rent-label">{t('attAdm.thDepartment')}</label>
              <input
                className="rent-input"
                placeholder={t('attAdm.phDepartment')}
                value={groupForm.department}
                onChange={(e) => setGroupForm((p) => ({ ...p, department: e.target.value }))}
              />
            </div>
          </div>
          <div className="rent-grid rent-grid--2">
            <div className="rent-field">
              <label className="rent-label">{t('attAdm.thShift')}</label>
              <div className="attAdm-shift">
                <input
                  className="rent-input"
                  type="time"
                  value={groupForm.work_start}
                  onChange={(e) => setGroupForm((p) => ({ ...p, work_start: e.target.value }))}
                />
                <span className="attAdm-filter__sep">~</span>
                <input
                  className="rent-input"
                  type="time"
                  value={groupForm.work_end}
                  onChange={(e) => setGroupForm((p) => ({ ...p, work_end: e.target.value }))}
                />
              </div>
            </div>
            <div className="rent-field">
              <label className="rent-label">{t('attAdm.thGrace')}</label>
              <div className="attAdm-shift">
                <input
                  className="rent-input"
                  type="number"
                  min={0}
                  value={groupForm.late_grace_minutes}
                  onChange={(e) =>
                    setGroupForm((p) => ({ ...p, late_grace_minutes: e.target.value }))
                  }
                />
                <input
                  className="rent-input"
                  type="number"
                  min={0}
                  value={groupForm.early_grace_minutes}
                  onChange={(e) =>
                    setGroupForm((p) => ({ ...p, early_grace_minutes: e.target.value }))
                  }
                />
              </div>
              <div className="rent-text-sm rent-text-muted">{t('attAdm.graceHint')}</div>
            </div>
          </div>
          <div className="rent-grid rent-grid--3">
            <div className="rent-field">
              <label className="rent-label">{t('attAdm.labelLat')}</label>
              <input
                className="rent-input"
                type="number"
                step="0.0001"
                value={groupForm.office_lat}
                onChange={(e) => setGroupForm((p) => ({ ...p, office_lat: e.target.value }))}
              />
            </div>
            <div className="rent-field">
              <label className="rent-label">{t('attAdm.labelLng')}</label>
              <input
                className="rent-input"
                type="number"
                step="0.0001"
                value={groupForm.office_lng}
                onChange={(e) => setGroupForm((p) => ({ ...p, office_lng: e.target.value }))}
              />
            </div>
            <div className="rent-field">
              <label className="rent-label">{t('attAdm.thRadius')}</label>
              <input
                className="rent-input"
                type="number"
                step="0.1"
                min={0.1}
                value={groupForm.radius_km}
                onChange={(e) => setGroupForm((p) => ({ ...p, radius_km: e.target.value }))}
              />
            </div>
          </div>
          <div className="rent-grid rent-grid--2">
            <div className="rent-field">
              <label className="rent-label">{t('attAdm.labelOffset')}</label>
              <input
                className="rent-input"
                type="number"
                step="0.5"
                value={groupForm.utc_offset_hours}
                onChange={(e) => setGroupForm((p) => ({ ...p, utc_offset_hours: e.target.value }))}
              />
            </div>
            <div className="rent-field">
              <label className="rent-label">{t('attAdm.labelDesc')}</label>
              <input
                className="rent-input"
                value={groupForm.description}
                onChange={(e) => setGroupForm((p) => ({ ...p, description: e.target.value }))}
              />
            </div>
          </div>
          <div className="attAdm-switches">
            <label className="attAdm-check">
              <input
                type="checkbox"
                checked={groupForm.is_default}
                onChange={(e) => setGroupForm((p) => ({ ...p, is_default: e.target.checked }))}
              />
              {t('attAdm.isDefault')}
            </label>
            <label className="attAdm-check">
              <input
                type="checkbox"
                checked={groupForm.is_active}
                onChange={(e) => setGroupForm((p) => ({ ...p, is_active: e.target.checked }))}
              />
              {t('attAdm.enabled')}
            </label>
          </div>
        </div>
      </Modal>

      {/* 成员管理弹窗 */}
      <Modal
        open={!!membersModal}
        title={t('attAdm.membersTitle', { name: membersModal?.name ?? '' })}
        onCancel={() => setMembersModal(null)}
        footer={null}
        width={640}
        destroyOnClose
      >
        <div className="attAdm-form">
          <div className="rent-field">
            <label className="rent-label">{t('attAdm.addMembers')}</label>
            <select
              className="rent-input attAdm-multi"
              multiple
              value={pickedEmployees}
              onChange={(e) =>
                setPickedEmployees(
                  Array.from(e.target.selectedOptions).map((o) => (o as HTMLOptionElement).value),
                )
              }
            >
              {empOptions.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.full_name || e.email || e.id} · {e.department || '—'}
                </option>
              ))}
            </select>
            <div className="attAdm-member-actions">
              <button className="rent-btn rent-btn--primary rent-btn--sm" onClick={addMembers}>
                {t('attAdm.addToGroup')}
              </button>
              <span className="rent-text-sm rent-text-muted">{t('attAdm.exclusiveHint')}</span>
            </div>
          </div>
          <hr className="rent-divider" />
          <div className="rent-text-bold rent-mb-2">
            {t('attAdm.currentMembers', { count: members.length })}
          </div>
          {members.length === 0 ? (
            <div className="rent-empty">{t('attAdm.noMembers')}</div>
          ) : (
            <ul className="attAdm-member-list">
              {members.map((m) => (
                <li key={m.employee_id}>
                  <span>
                    {m.name || m.email || m.employee_id}
                    <span className="rent-text-sm rent-text-muted">
                      {' '}
                      · {m.department || '—'}
                    </span>
                  </span>
                  <button
                    className="rent-btn rent-btn--ghost rent-btn--sm attAdm-danger"
                    onClick={() => dropMember(m.employee_id)}
                  >
                    {t('attAdm.remove')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Modal>

      {/* 审批弹窗 */}
      <Modal
        open={!!review}
        title={review?.action === 'approved' ? t('attAdm.approve') : t('attAdm.reject')}
        onCancel={() => setReview(null)}
        onOk={submitReview}
        confirmLoading={saving}
        okText={t('common.confirm')}
        cancelText={t('common.cancel')}
        destroyOnClose
      >
        {review && (
          <div className="attAdm-form">
            <div className="rent-text-sm rent-text-muted rent-mb-4">
              {review.leave.name} · {leaveTypeLabel[review.leave.leave_type as LeaveType]} ·{' '}
              {review.leave.start_date} ~ {review.leave.end_date} · {review.leave.days}
            </div>
            <div className="rent-field">
              <label className="rent-label">{t('attAdm.replyNote')}</label>
              <textarea
                className="rent-textarea"
                rows={3}
                placeholder={t('attAdm.phReplyNote')}
                value={replyNote}
                onChange={(e) => setReplyNote(e.target.value)}
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

export default AttendanceManage