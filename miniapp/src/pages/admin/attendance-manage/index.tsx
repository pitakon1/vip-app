import { useCallback, useEffect, useMemo, useState } from 'react'
import { View, Text, ScrollView, Input, Textarea, Picker, Switch } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { attendanceApi, employeesApi } from '@/services/api'
import { MAX_PAGE_SIZE } from '@/lib/api'
import { useI18n } from '@/i18n'
import './index.scss'

/**
 * 管理端「考勤管理」（对标 Web 端 AttendanceManage，四个页签）：
 *   核对   —— P0：全员考勤明细 + 行内校准（改状态/补上下班时间/改备注）
 *   考勤组 —— P1-a：多办公点/多班次规则与成员分配
 *   请假   —— P1-b：假勤审批（通过与后端考勤联动）
 *   报表   —— P1-c：异常分类统计与逐日趋势
 * 口径与 Web 端保持一致：字段名、表单校验、入参组装、状态色调全部照搬。
 */

type AttendanceStatus = 'present' | 'late' | 'early_out' | 'absent' | 'leave' | 'field_work'
type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'

const STATUSES: AttendanceStatus[] = ['present', 'late', 'early_out', 'absent', 'leave', 'field_work']
const LEAVE_TYPES = ['annual', 'sick', 'personal', 'unpaid', 'maternity', 'other']
const LEAVE_STATUSES: LeaveStatus[] = ['pending', 'approved', 'rejected', 'cancelled']

/** 状态 → 色调（对齐 Web：present 绿 / late·early_out 橙 / absent 红 / leave 灰 / field_work 蓝） */
const STATUS_TONE: Record<string, string> = {
  present: 'success',
  late: 'warning',
  early_out: 'warning',
  absent: 'error',
  leave: 'neutral',
  field_work: 'info'
}

const STATUS_KEY: Record<string, string> = {
  present: 'att.stPresent',
  late: 'att.stLate',
  early_out: 'att.stEarlyOut',
  absent: 'att.stAbsent',
  leave: 'att.stLeave',
  field_work: 'att.stFieldWork'
}

const LEAVE_TONE: Record<string, string> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'error',
  cancelled: 'neutral'
}

const LEAVE_TYPE_KEY: Record<string, string> = {
  annual: 'att.ltAnnual',
  sick: 'att.ltSick',
  personal: 'att.ltPersonal',
  unpaid: 'att.ltUnpaid',
  maternity: 'att.ltMaternity',
  other: 'att.ltOther'
}

const LEAVE_STATUS_KEY: Record<string, string> = {
  pending: 'att.lsPending',
  approved: 'att.lsApproved',
  rejected: 'att.lsRejected',
  cancelled: 'att.lsCancelled'
}

interface DayRow {
  date: string
  status: string
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
  is_active: true
})

const pad2 = (n: number) => String(n).padStart(2, '0')
const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}
const monthStartStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`
}
/** 后端返回的 naive UTC ISO；与 Web 端 dayjs 口径一致，按本地时刻取 HH:mm */
const hhmm = (iso?: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}
const unwrapList = (res: any) => (Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [])

const RECORD_PAGE_STEP = 30

export default function AttendanceManagePage() {
  const { t } = useI18n()
  const [tab, setTab] = useState<'records' | 'groups' | 'leave' | 'report'>('records')

  const statusLabel = useMemo(
    () => STATUSES.map((s) => ({ value: s, label: t(STATUS_KEY[s]) })),
    [t]
  )
  const leaveTypeLabel = useMemo(
    () => LEAVE_TYPES.map((s) => ({ value: s, label: t(LEAVE_TYPE_KEY[s]) })),
    [t]
  )
  const leaveStatusLabel = useMemo(
    () => LEAVE_STATUSES.map((s) => ({ value: s, label: t(LEAVE_STATUS_KEY[s]) })),
    [t]
  )

  const TABS = [
    { key: 'records' as const, label: t('attAdm.tabRecords') },
    { key: 'groups' as const, label: t('attAdm.tabGroups') },
    { key: 'leave' as const, label: t('attAdm.tabLeave') },
    { key: 'report' as const, label: t('attAdm.tabReport') }
  ]

  const toast = (title: string, icon: 'none' | 'success' = 'none') =>
    Taro.showToast({ title, icon })

  // ---------------------------------------------------------------- 核对
  const [range, setRange] = useState({ start: monthStartStr(), end: todayStr() })
  const [recordsDept, setRecordsDept] = useState('')
  const [summary, setSummary] = useState<Record<string, number>>({})
  const [records, setRecords] = useState<EmployeeRecord[]>([])
  const [loadingRecords, setLoadingRecords] = useState(false)
  const [expanded, setExpanded] = useState<string[]>([])
  const [visibleCount, setVisibleCount] = useState(RECORD_PAGE_STEP)

  const loadRecords = useCallback(async () => {
    setLoadingRecords(true)
    try {
      const res: any = await attendanceApi.adminRecords({
        start_date: range.start,
        end_date: range.end,
        ...(recordsDept ? { department: recordsDept } : {})
      })
      const data = res?.data ?? res
      setRecords(Array.isArray(data?.records) ? data.records : [])
      setSummary(data?.summary ?? {})
      setExpanded([])
      setVisibleCount(RECORD_PAGE_STEP)
    } catch (e: any) {
      toast(e?.message || t('attAdm.recordsLoadFailed'))
    } finally {
      setLoadingRecords(false)
    }
  }, [range.start, range.end, recordsDept, t])

  // 校准（弹窗表单）
  const [calib, setCalib] = useState<{ employee: EmployeeRecord; day: DayRow | null } | null>(null)
  const [calibForm, setCalibForm] = useState({ status: '', check_in: '', check_out: '', notes: '' })
  const [saving, setSaving] = useState(false)

  const openCalibrate = (employee: EmployeeRecord, day: DayRow | null) => {
    setCalib({ employee, day })
    setCalibForm({
      status: day?.status ?? '',
      check_in: hhmm(day?.check_in),
      check_out: hhmm(day?.check_out),
      notes: day?.notes ?? ''
    })
  }

  const submitCalibrate = async () => {
    if (!calib) return
    const date = calib.day?.date ?? range.start
    const exists = !!calib.day
    if (!exists && !calibForm.status) {
      toast(t('attAdm.missingHint'))
      return
    }
    const payload: Record<string, unknown> = { date }
    if (calibForm.status) payload.status = calibForm.status
    if (calibForm.check_in) payload.check_in_time = `${date}T${calibForm.check_in}:00`
    if (calibForm.check_out) payload.check_out_time = `${date}T${calibForm.check_out}:00`
    if (calibForm.notes) payload.notes = calibForm.notes
    if (Object.keys(payload).length === 1) {
      toast(t('attAdm.calibrateEmpty'))
      return
    }
    if (calibForm.check_in && calibForm.check_out && calibForm.check_out < calibForm.check_in) {
      toast(t('attAdm.timeRangeInvalid'))
      return
    }
    setSaving(true)
    try {
      await attendanceApi.calibrate(calib.employee.employee_id, payload)
      toast(t('attAdm.calibrated'), 'success')
      setCalib(null)
      loadRecords()
    } catch (e: any) {
      toast(e?.message || t('attAdm.calibrateFailed'))
    } finally {
      setSaving(false)
    }
  }

  // ---------------------------------------------------------------- 考勤组
  const [groups, setGroups] = useState<any[]>([])
  const [loadingGroups, setLoadingGroups] = useState(false)
  const [groupSheet, setGroupSheet] = useState<{ id: string | null } | null>(null)
  const [groupForm, setGroupForm] = useState<GroupForm>(emptyGroupForm())
  const [membersSheet, setMembersSheet] = useState<any | null>(null)
  const [members, setMembers] = useState<any[]>([])
  const [empOptions, setEmpOptions] = useState<any[]>([])
  const [picked, setPicked] = useState<string[]>([])

  const loadGroups = useCallback(async () => {
    setLoadingGroups(true)
    try {
      const res: any = await attendanceApi.groups()
      setGroups(unwrapList(res))
    } catch (e: any) {
      toast(e?.message || t('attAdm.groupsLoadFailed'))
    } finally {
      setLoadingGroups(false)
    }
  }, [t])

  const loadEmployees = useCallback(async () => {
    try {
      const res: any = await employeesApi.list({ page: 1, page_size: MAX_PAGE_SIZE })
      const payload = res?.data ?? res
      setEmpOptions(Array.isArray(payload?.items) ? payload.items : unwrapList(res))
    } catch {
      setEmpOptions([])
    }
  }, [])

  const openGroupSheet = (group?: any) => {
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
        is_active: group.is_active !== false
      })
      setGroupSheet({ id: group.id })
    } else {
      setGroupForm(emptyGroupForm())
      setGroupSheet({ id: null })
    }
  }

  const submitGroup = async () => {
    if (!groupForm.name.trim()) {
      toast(t('attAdm.groupNameRequired'))
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
      is_active: groupForm.is_active
    }
    setSaving(true)
    try {
      if (groupSheet?.id) await attendanceApi.updateGroup(groupSheet.id, body)
      else await attendanceApi.createGroup(body)
      toast(t('attAdm.groupSaved'), 'success')
      setGroupSheet(null)
      loadGroups()
    } catch (e: any) {
      toast(e?.message || t('attAdm.groupSaveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const removeGroup = async (group: any) => {
    const res = await Taro.showModal({
      title: t('common.deleteTitle'),
      content: t('common.deleteConfirmContent', { name: group.name })
    })
    if (!res.confirm) return
    try {
      await attendanceApi.deleteGroup(group.id)
      toast(t('attAdm.groupDeleted'), 'success')
      loadGroups()
    } catch (e: any) {
      toast(e?.message || t('attAdm.groupDeleteFailed'))
    }
  }

  const openMembers = async (group: any) => {
    setMembersSheet(group)
    setPicked([])
    loadEmployees()
    try {
      const res: any = await attendanceApi.groupMembers(group.id)
      setMembers(unwrapList(res))
    } catch {
      setMembers([])
    }
  }

  const addMembers = async () => {
    if (!membersSheet || picked.length === 0) return
    try {
      const res: any = await attendanceApi.assignGroupMembers(membersSheet.id, {
        employee_ids: picked
      })
      setMembers(unwrapList(res))
      setPicked([])
      toast(t('attAdm.memberAdded'), 'success')
      loadGroups()
    } catch (e: any) {
      toast(e?.message || t('attAdm.memberAddFailed'))
    }
  }

  const dropMember = async (employeeId: string) => {
    if (!membersSheet) return
    try {
      await attendanceApi.removeGroupMember(membersSheet.id, employeeId)
      setMembers((prev) => prev.filter((m) => m.employee_id !== employeeId))
      loadGroups()
    } catch (e: any) {
      toast(e?.message || t('attAdm.memberRemoveFailed'))
    }
  }

  // ---------------------------------------------------------------- 请假
  const [leaveFilter, setLeaveFilter] = useState<LeaveStatus | ''>('pending')
  const [leaves, setLeaves] = useState<any[]>([])
  const [loadingLeaves, setLoadingLeaves] = useState(false)
  const [review, setReview] = useState<{ leave: any; action: 'approved' | 'rejected' } | null>(null)
  const [replyNote, setReplyNote] = useState('')

  const loadLeaves = useCallback(async () => {
    setLoadingLeaves(true)
    try {
      const res: any = await attendanceApi.leaveRequests(
        leaveFilter ? { status: leaveFilter } : undefined
      )
      setLeaves(unwrapList(res))
    } catch (e: any) {
      toast(e?.message || t('attAdm.leavesLoadFailed'))
    } finally {
      setLoadingLeaves(false)
    }
  }, [leaveFilter, t])

  const submitReview = async () => {
    if (!review) return
    setSaving(true)
    try {
      await attendanceApi.approveLeave(review.leave.id, {
        action: review.action,
        reply_note: replyNote || null
      })
      toast(t('attAdm.reviewed'), 'success')
      setReview(null)
      setReplyNote('')
      loadLeaves()
    } catch (e: any) {
      toast(e?.message || t('attAdm.reviewFailed'))
    } finally {
      setSaving(false)
    }
  }

  // ---------------------------------------------------------------- 报表
  const [reportRange, setReportRange] = useState({ start: monthStartStr(), end: todayStr() })
  const [reportDept, setReportDept] = useState('')
  const [report, setReport] = useState<any | null>(null)
  const [loadingReport, setLoadingReport] = useState(false)

  const loadReport = useCallback(async () => {
    setLoadingReport(true)
    try {
      const res: any = await attendanceApi.summary({
        start_date: reportRange.start,
        end_date: reportRange.end,
        ...(reportDept ? { department: reportDept } : {})
      })
      setReport(res?.data ?? res)
    } catch (e: any) {
      toast(e?.message || t('attAdm.reportLoadFailed'))
    } finally {
      setLoadingReport(false)
    }
  }, [reportRange.start, reportRange.end, reportDept, t])

  useEffect(() => {
    if (tab === 'records') loadRecords()
    else if (tab === 'groups') loadGroups()
    else if (tab === 'leave') loadLeaves()
    else if (tab === 'report') loadReport()
  }, [tab, loadRecords, loadGroups, loadLeaves, loadReport])

  const totals = report?.totals ?? {}
  const dailyRows: any[] = report?.daily ?? []
  const dailyMax = useMemo(() => {
    const values = dailyRows.map((d) => Number(d.late ?? 0) + Number(d.early_out ?? 0) + Number(d.absent ?? 0))
    return Math.max(1, ...values)
  }, [dailyRows])
  const topEmployees = useMemo(() => {
    const list: any[] = [...(report?.employees ?? [])]
    return list.sort((a, b) => Number(b.abnormal ?? 0) - Number(a.abnormal ?? 0)).slice(0, 20)
  }, [report])

  const visibleRecords = records.slice(0, visibleCount)

  return (
    <View className='am-page'>
      {/* 顶部横向胶囊页签 */}
      <ScrollView scrollX className='am-tabs' showScrollbar={false}>
        <View className='am-tabs__inner'>
          {TABS.map((item) => (
            <View
              key={item.key}
              className={`am-tab${tab === item.key ? ' am-tab--active' : ''}`}
              onClick={() => setTab(item.key)}
            >
              <Text className='am-tab__text'>{item.label}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <ScrollView scrollY className='am-scroll'>
        {/* ------------------------------------------------ 核对 */}
        {tab === 'records' && (
          <View className='am-body'>
            <View className='am-card'>
              <View className='am-filter'>
                <Text className='am-filter__label'>{t('attAdm.dateRange')}</Text>
                <Picker
                  mode='date'
                  value={range.start}
                  onChange={(e: any) => setRange((p) => ({ ...p, start: e.detail.value }))}
                >
                  <View className='am-filter__date'>
                    <Text className='am-filter__date-text'>{range.start}</Text>
                  </View>
                </Picker>
                <Text className='am-filter__sep'>~</Text>
                <Picker
                  mode='date'
                  value={range.end}
                  onChange={(e: any) => setRange((p) => ({ ...p, end: e.detail.value }))}
                >
                  <View className='am-filter__date'>
                    <Text className='am-filter__date-text'>{range.end}</Text>
                  </View>
                </Picker>
              </View>
              <View className='am-filter'>
                <Text className='am-filter__label'>{t('attAdm.department')}</Text>
                <Input
                  className='am-filter__input'
                  value={recordsDept}
                  placeholder={t('attAdm.deptPh')}
                  onInput={(e: any) => setRecordsDept(e.detail.value)}
                />
                <View className='am-btn am-btn--primary' onClick={() => loadRecords()}>
                  <Text className='am-btn__text'>{t('common.search')}</Text>
                </View>
              </View>
            </View>

            <View className='am-card'>
              <View className='am-card__head'>
                <Text className='am-card__title'>{t('attAdm.summaryTitle')}</Text>
                <Text className='am-card__extra'>
                  {t('attAdm.employeesCount', { count: records.length })}
                </Text>
              </View>
              <View className='am-pills'>
                {STATUSES.map((s) => (
                  <View key={s} className={`am-badge am-badge--${STATUS_TONE[s]}`}>
                    <Text>{t(STATUS_KEY[s])} {summary[s] ?? 0}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View className='am-card'>
              <View className='am-card__head'>
                <Text className='am-card__title'>{t('attAdm.recordsTitle')}</Text>
              </View>
              {loadingRecords ? (
                <View className='am-empty'><Text className='am-empty__text'>{t('common.loading')}</Text></View>
              ) : records.length === 0 ? (
                <View className='am-empty'><Text className='am-empty__text'>{t('attAdm.noData')}</Text></View>
              ) : (
                visibleRecords.map((emp) => {
                  const abnormal = emp.days.filter(
                    (d) => d.late_minutes || d.early_out_minutes || d.status === 'absent'
                  ).length
                  const open = expanded.includes(emp.employee_id)
                  return (
                    <View key={emp.employee_id} className='am-emp'>
                      <View
                        className='am-emp__head'
                        onClick={() =>
                          setExpanded((prev) =>
                            open ? prev.filter((id) => id !== emp.employee_id) : [...prev, emp.employee_id]
                          )
                        }
                      >
                        <View className='am-emp__body'>
                          <Text className='am-emp__name'>{emp.name || emp.email || '—'}</Text>
                          <Text className='am-emp__sub'>
                            {(emp.employee_code || '—') + ' · ' + (emp.department || '—')}
                          </Text>
                        </View>
                        <View className={`am-badge am-badge--${abnormal > 0 ? 'warning' : 'neutral'}`}>
                          <Text>{abnormal}</Text>
                        </View>
                        <View
                          className='am-btn am-btn--ghost am-btn--sm'
                          onClick={(e: any) => {
                            e.stopPropagation()
                            openCalibrate(emp, null)
                          }}
                        >
                          <Text className='am-btn__text'>{t('attAdm.calibrate')}</Text>
                        </View>
                      </View>
                      <Text className='am-emp__toggle'>
                        {open ? t('attAdm.collapse') : t('attAdm.expand')}
                      </Text>

                      {open && (
                        <View className='am-days'>
                          {emp.days.length === 0 ? (
                            <Text className='am-days__none'>{t('attAdm.noDays')}</Text>
                          ) : (
                            emp.days.map((d) => (
                              <View key={d.date} className='am-day'>
                                <View className='am-day__top'>
                                  <Text className='am-day__date'>{d.date.slice(0, 10)}</Text>
                                  <View className={`am-badge am-badge--${STATUS_TONE[d.status] || 'neutral'}`}>
                                    <Text>{STATUS_KEY[d.status] ? t(STATUS_KEY[d.status]) : d.status}</Text>
                                  </View>
                                </View>
                                <View className='am-day__mid'>
                                  <Text className='am-day__time'>
                                    {t('att.checkInLabel')} {hhmm(d.check_in) || '--:--'} · {t('att.checkOutLabel')}{' '}
                                    {hhmm(d.check_out) || '--:--'}
                                  </Text>
                                  <View
                                    className='am-btn am-btn--ghost am-btn--sm'
                                    onClick={() => openCalibrate(emp, d)}
                                  >
                                    <Text className='am-btn__text'>{t('attAdm.calibrate')}</Text>
                                  </View>
                                </View>
                                <View className='am-day__bottom'>
                                  <Text className='am-day__meta'>
                                    {t('attAdm.lateMin')} {d.late_minutes ?? 0} · {t('attAdm.earlyMin')}{' '}
                                    {d.early_out_minutes ?? 0}
                                  </Text>
                                  {d.notes ? <Text className='am-day__note'>{d.notes}</Text> : null}
                                </View>
                              </View>
                            ))
                          )}
                        </View>
                      )}
                    </View>
                  )
                })
              )}
              {visibleCount < records.length && (
                <View className='am-more' onClick={() => setVisibleCount((n) => n + RECORD_PAGE_STEP)}>
                  <Text className='am-more__text'>{t('common.loadingMore')}</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* ------------------------------------------------ 考勤组 */}
        {tab === 'groups' && (
          <View className='am-body'>
            {loadingGroups ? (
              <View className='am-empty'><Text className='am-empty__text'>{t('common.loading')}</Text></View>
            ) : groups.length === 0 ? (
              <View className='am-empty'><Text className='am-empty__text'>{t('attAdm.noGroups')}</Text></View>
            ) : (
              groups.map((g) => (
                <View key={g.id} className='am-card'>
                  <View className='am-card__head'>
                    <View className='am-gtitle'>
                      <Text className='am-gtitle__name'>{g.name}</Text>
                      {g.is_default && (
                        <View className='am-badge am-badge--info'><Text>{t('attAdm.badgeDefault')}</Text></View>
                      )}
                      {g.is_active === false && (
                        <View className='am-badge am-badge--neutral'><Text>{t('attAdm.badgeInactive')}</Text></View>
                      )}
                    </View>
                  </View>
                  {g.description ? <Text className='am-gdesc'>{g.description}</Text> : null}
                  <View className='am-grow'><Text className='am-grow__label'>{t('attAdm.department')}</Text><Text className='am-grow__value'>{g.department || '—'}</Text></View>
                  <View className='am-grow'><Text className='am-grow__label'>{t('att.ruleOffice')}</Text><Text className='am-grow__value'>{`${g.office_lat}, ${g.office_lng}`}</Text></View>
                  <View className='am-grow'><Text className='am-grow__label'>{t('attAdm.radius')}</Text><Text className='am-grow__value'>{t('att.kmValue', { km: g.radius_km })}</Text></View>
                  <View className='am-grow'><Text className='am-grow__label'>{t('att.ruleShift')}</Text><Text className='am-grow__value'>{`${g.work_start} - ${g.work_end}`}</Text></View>
                  <View className='am-grow'><Text className='am-grow__label'>{t('att.ruleGrace')}</Text><Text className='am-grow__value'>{t('att.graceValue', { late: g.late_grace_minutes, early: g.early_grace_minutes })}</Text></View>
                  <View className='am-grow'><Text className='am-grow__label'>{t('attAdm.manageMembers')}</Text><Text className='am-grow__value'>{t('attAdm.memberCount', { count: g.member_count ?? 0 })}</Text></View>
                  <View className='am-acts'>
                    <View className='am-btn am-btn--ghost am-btn--sm' onClick={() => openMembers(g)}>
                      <Text className='am-btn__text'>{t('attAdm.manageMembers')}</Text>
                    </View>
                    <View className='am-btn am-btn--ghost am-btn--sm' onClick={() => openGroupSheet(g)}>
                      <Text className='am-btn__text'>{t('common.edit')}</Text>
                    </View>
                    <View className='am-btn am-btn--ghost am-btn--sm am-btn--danger' onClick={() => removeGroup(g)}>
                      <Text className='am-btn__text'>{t('common.delete')}</Text>
                    </View>
                  </View>
                </View>
              ))
            )}
            <View className='am-addbtn' onClick={() => openGroupSheet()}>
              <Text className='am-addbtn__text'>{t('attAdm.newGroup')}</Text>
            </View>
          </View>
        )}

        {/* ------------------------------------------------ 请假审批 */}
        {tab === 'leave' && (
          <View className='am-body'>
            <View className='am-card'>
              <View className='am-filter'>
                <Text className='am-filter__label'>{t('attAdm.leaveFilter')}</Text>
                <Picker
                  mode='selector'
                  range={[t('common.all'), ...leaveStatusLabel.map((o) => o.label)]}
                  onChange={(e: any) => {
                    const idx = Number(e.detail.value)
                    setLeaveFilter(idx === 0 ? '' : LEAVE_STATUSES[idx - 1])
                  }}
                >
                  <View className='am-filter__select'>
                    <Text className='am-filter__select-text'>
                      {leaveFilter ? t(LEAVE_STATUS_KEY[leaveFilter]) : t('common.all')}
                    </Text>
                    <Text className='am-filter__caret'>▾</Text>
                  </View>
                </Picker>
                <View className='am-btn am-btn--primary' onClick={() => loadLeaves()}>
                  <Text className='am-btn__text'>{t('common.search')}</Text>
                </View>
              </View>
            </View>

            {loadingLeaves ? (
              <View className='am-empty'><Text className='am-empty__text'>{t('common.loading')}</Text></View>
            ) : leaves.length === 0 ? (
              <View className='am-empty'><Text className='am-empty__text'>{t('attAdm.noLeaves')}</Text></View>
            ) : (
              leaves.map((l) => (
                <View key={l.id} className='am-card'>
                  <View className='am-card__head'>
                    <View className='am-gtitle'>
                      <Text className='am-gtitle__name'>{l.name || '—'}</Text>
                      <View className={`am-badge am-badge--${LEAVE_TONE[l.status] || 'neutral'}`}>
                        <Text>{LEAVE_STATUS_KEY[l.status] ? t(LEAVE_STATUS_KEY[l.status]) : l.status}</Text>
                      </View>
                    </View>
                  </View>
                  <Text className='am-gdesc'>{l.department || '—'} · {t(LEAVE_TYPE_KEY[l.leave_type] || l.leave_type)}</Text>
                  <View className='am-grow'><Text className='am-grow__label'>{t('attAdm.period')}</Text><Text className='am-grow__value'>{`${l.start_date} ~ ${l.end_date}`}</Text></View>
                  <View className='am-grow'><Text className='am-grow__label'>{t('attAdm.days')}</Text><Text className='am-grow__value'>{t('att.leaveDaysUnit', { days: l.days })}</Text></View>
                  <View className='am-grow'><Text className='am-grow__label'>{t('attAdm.reason')}</Text><Text className='am-grow__value'>{l.reason || '—'}</Text></View>
                  {l.reply_note ? (
                    <View className='am-grow'><Text className='am-grow__label'>{t('attAdm.replyNote')}</Text><Text className='am-grow__value'>{l.reply_note}</Text></View>
                  ) : null}
                  {l.status === 'pending' && (
                    <View className='am-acts'>
                      <View
                        className='am-btn am-btn--primary am-btn--sm'
                        onClick={() => { setReview({ leave: l, action: 'approved' }); setReplyNote('') }}
                      >
                        <Text className='am-btn__text'>{t('attAdm.approve')}</Text>
                      </View>
                      <View
                        className='am-btn am-btn--ghost am-btn--sm am-btn--danger'
                        onClick={() => { setReview({ leave: l, action: 'rejected' }); setReplyNote('') }}
                      >
                        <Text className='am-btn__text'>{t('attAdm.reject')}</Text>
                      </View>
                    </View>
                  )}
                </View>
              ))
            )}
          </View>
        )}

        {/* ------------------------------------------------ 异常报表 */}
        {tab === 'report' && (
          <View className='am-body'>
            <View className='am-card'>
              <View className='am-filter'>
                <Text className='am-filter__label'>{t('attAdm.dateRange')}</Text>
                <Picker
                  mode='date'
                  value={reportRange.start}
                  onChange={(e: any) => setReportRange((p) => ({ ...p, start: e.detail.value }))}
                >
                  <View className='am-filter__date'>
                    <Text className='am-filter__date-text'>{reportRange.start}</Text>
                  </View>
                </Picker>
                <Text className='am-filter__sep'>~</Text>
                <Picker
                  mode='date'
                  value={reportRange.end}
                  onChange={(e: any) => setReportRange((p) => ({ ...p, end: e.detail.value }))}
                >
                  <View className='am-filter__date'>
                    <Text className='am-filter__date-text'>{reportRange.end}</Text>
                  </View>
                </Picker>
              </View>
              <View className='am-filter'>
                <Text className='am-filter__label'>{t('attAdm.department')}</Text>
                <Input
                  className='am-filter__input'
                  value={reportDept}
                  placeholder={t('attAdm.deptPh')}
                  onInput={(e: any) => setReportDept(e.detail.value)}
                />
                <View className='am-btn am-btn--primary' onClick={() => loadReport()}>
                  <Text className='am-btn__text'>{t('common.search')}</Text>
                </View>
              </View>
            </View>

            {loadingReport ? (
              <View className='am-empty'><Text className='am-empty__text'>{t('common.loading')}</Text></View>
            ) : !report ? (
              <View className='am-empty'><Text className='am-empty__text'>{t('attAdm.noData')}</Text></View>
            ) : (
              <>
                <View className='am-kpis'>
                  <View className='am-kpi'>
                    <Text className='am-kpi__label'>{t('att.stLate')}</Text>
                    <Text className='am-kpi__value am-kpi__value--warning'>{totals.late ?? 0}</Text>
                  </View>
                  <View className='am-kpi'>
                    <Text className='am-kpi__label'>{t('att.stEarlyOut')}</Text>
                    <Text className='am-kpi__value am-kpi__value--warning'>{totals.early_out ?? 0}</Text>
                  </View>
                  <View className='am-kpi'>
                    <Text className='am-kpi__label'>{t('att.stAbsent')}</Text>
                    <Text className='am-kpi__value am-kpi__value--error'>{totals.absent ?? 0}</Text>
                  </View>
                  <View className='am-kpi'>
                    <Text className='am-kpi__label'>{t('attAdm.kpiAbnormal')}</Text>
                    <Text className='am-kpi__value am-kpi__value--warning'>{totals.abnormal ?? 0}</Text>
                  </View>
                  <View className='am-kpi am-kpi--wide'>
                    <Text className='am-kpi__label'>{t('attAdm.kpiRate')}</Text>
                    <Text className='am-kpi__value am-kpi__value--primary'>
                      {totals.attendance_rate ?? 0}%
                    </Text>
                    <Text className='am-kpi__hint'>
                      {t('attAdm.rateHint', { attended: totals.attended ?? 0, expected: totals.expected ?? 0 })}
                    </Text>
                  </View>
                </View>

                <View className='am-card'>
                  <View className='am-card__head'><Text className='am-card__title'>{t('attAdm.deptTitle')}</Text></View>
                  {(report.departments ?? []).length === 0 ? (
                    <View className='am-empty'><Text className='am-empty__text'>{t('attAdm.noData')}</Text></View>
                  ) : (
                    <View className='am-table'>
                      <View className='am-table__head'>
                        <Text className='am-td am-td--name'>{t('attAdm.deptCol')}</Text>
                        <Text className='am-td'>{t('att.stLate')}</Text>
                        <Text className='am-td'>{t('att.stEarlyOut')}</Text>
                        <Text className='am-td'>{t('att.stAbsent')}</Text>
                        <Text className='am-td'>{t('attAdm.abnormal')}</Text>
                      </View>
                      {report.departments.map((d: any) => (
                        <View key={d.department} className='am-table__row'>
                          <Text className='am-td am-td--name'>{d.department}</Text>
                          <Text className='am-td'>{d.late}</Text>
                          <Text className='am-td'>{d.early_out}</Text>
                          <Text className='am-td'>{d.absent}</Text>
                          <Text className='am-td am-td--strong'>{d.abnormal}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>

                <View className='am-card'>
                  <View className='am-card__head'>
                    <Text className='am-card__title'>{t('attAdm.trendTitle')}</Text>
                    <Text className='am-card__extra'>{t('attAdm.trendHint')}</Text>
                  </View>
                  {dailyRows.length === 0 ? (
                    <View className='am-empty'><Text className='am-empty__text'>{t('attAdm.noData')}</Text></View>
                  ) : (
                    <View className='am-trend'>
                      {dailyRows.map((d) => {
                        const value = Number(d.late ?? 0) + Number(d.early_out ?? 0) + Number(d.absent ?? 0)
                        return (
                          <View key={d.date} className='am-trend__row'>
                            <Text className='am-trend__label'>{String(d.date).slice(5)}</Text>
                            <View className='am-trend__track'>
                              <View
                                className='am-trend__bar'
                                style={{ width: `${Math.max(Math.round((value / dailyMax) * 100), value > 0 ? 4 : 0)}%` }}
                              />
                            </View>
                            <Text className='am-trend__value'>{value}</Text>
                          </View>
                        )
                      })}
                    </View>
                  )}
                </View>

                <View className='am-card'>
                  <View className='am-card__head'>
                    <Text className='am-card__title'>{t('attAdm.empTitle')}</Text>
                    <Text className='am-card__extra'>{t('attAdm.kpiAbnormal')}</Text>
                  </View>
                  {topEmployees.length === 0 ? (
                    <View className='am-empty'><Text className='am-empty__text'>{t('attAdm.noData')}</Text></View>
                  ) : (
                    topEmployees.map((e: any) => (
                      <View key={e.employee_id} className='am-grow'>
                        <Text className='am-grow__label'>{e.name || e.email || '—'}</Text>
                        <Text className='am-grow__value'>{`${e.department || '—'} · ${t('attAdm.abnormal')} ${e.abnormal ?? 0}`}</Text>
                      </View>
                    ))
                  )}
                </View>
              </>
            )}
          </View>
        )}

        <View className='am-bottom-space' />
      </ScrollView>

      {/* ===== 校准弹窗 ===== */}
      {calib && (
        <View className='am-sheet-mask' onClick={() => setCalib(null)}>
          <View className='am-sheet' onClick={(e: any) => e.stopPropagation()}>
            <Text className='am-sheet__title'>
              {t('attAdm.calibrateTitle', { name: calib.employee.name || calib.employee.email || '' })}
            </Text>
            <View className='am-field'>
              <Text className='am-field__label'>{t('att.fieldDate')}</Text>
              <View className='am-field__readonly'>
                <Text className='am-field__readonly-text'>{calib.day?.date ?? range.start}</Text>
              </View>
            </View>
            <View className='am-field'>
              <Text className='am-field__label'>{t('attAdm.leaveFilter')}</Text>
              <Picker
                mode='selector'
                range={[t('attAdm.statusKeep'), ...statusLabel.map((o) => o.label)]}
                onChange={(e: any) => {
                  const idx = Number(e.detail.value)
                  setCalibForm((p) => ({ ...p, status: idx === 0 ? '' : STATUSES[idx - 1] }))
                }}
              >
                <View className='am-field__select'>
                  <Text className='am-field__select-text'>
                    {calibForm.status ? t(STATUS_KEY[calibForm.status]) : t('attAdm.statusKeep')}
                  </Text>
                  <Text className='am-field__caret'>▾</Text>
                </View>
              </Picker>
              {!calib.day && <Text className='am-field__hint'>{t('attAdm.missingHint')}</Text>}
            </View>
            <View className='am-field-row'>
              <View className='am-field am-field--half'>
                <Text className='am-field__label'>{t('attAdm.checkIn')}</Text>
                <Picker
                  mode='time'
                  value={calibForm.check_in || '09:00'}
                  onChange={(e: any) => setCalibForm((p) => ({ ...p, check_in: e.detail.value }))}
                >
                  <View className='am-field__select'>
                    <Text className='am-field__select-text'>{calibForm.check_in || '--:--'}</Text>
                  </View>
                </Picker>
              </View>
              <View className='am-field am-field--half'>
                <Text className='am-field__label'>{t('attAdm.checkOut')}</Text>
                <Picker
                  mode='time'
                  value={calibForm.check_out || '18:00'}
                  onChange={(e: any) => setCalibForm((p) => ({ ...p, check_out: e.detail.value }))}
                >
                  <View className='am-field__select'>
                    <Text className='am-field__select-text'>{calibForm.check_out || '--:--'}</Text>
                  </View>
                </Picker>
              </View>
            </View>
            <View className='am-field'>
              <Text className='am-field__label'>{t('attAdm.notes')}</Text>
              <Input
                className='am-field__input'
                value={calibForm.notes}
                placeholder={t('attAdm.notesPh')}
                onInput={(e: any) => setCalibForm((p) => ({ ...p, notes: e.detail.value }))}
              />
            </View>
            <View className={`am-submit${saving ? ' am-submit--disabled' : ''}`} onClick={() => !saving && submitCalibrate()}>
              <Text className='am-submit__text'>{saving ? t('common.saving') : t('common.save')}</Text>
            </View>
          </View>
        </View>
      )}

      {/* ===== 考勤组表单 ===== */}
      {groupSheet && (
        <View className='am-sheet-mask' onClick={() => setGroupSheet(null)}>
          <View className='am-sheet am-sheet--tall' onClick={(e: any) => e.stopPropagation()}>
            <Text className='am-sheet__title'>
              {groupSheet.id ? t('attAdm.editGroup') : t('attAdm.newGroup')}
            </Text>
            <ScrollView scrollY className='am-sheet__scroll'>
              <View className='am-field'>
                <Text className='am-field__label am-field__label--req'>{t('attAdm.groupName')}</Text>
                <Input
                  className='am-field__input'
                  value={groupForm.name}
                  placeholder={t('attAdm.groupNamePh')}
                  onInput={(e: any) => setGroupForm((p) => ({ ...p, name: e.detail.value }))}
                />
              </View>
              <View className='am-field'>
                <Text className='am-field__label'>{t('attAdm.groupDesc')}</Text>
                <Input
                  className='am-field__input'
                  value={groupForm.description}
                  onInput={(e: any) => setGroupForm((p) => ({ ...p, description: e.detail.value }))}
                />
              </View>
              <View className='am-field'>
                <Text className='am-field__label'>{t('attAdm.department')}</Text>
                <Input
                  className='am-field__input'
                  value={groupForm.department}
                  placeholder={t('attAdm.deptPh')}
                  onInput={(e: any) => setGroupForm((p) => ({ ...p, department: e.detail.value }))}
                />
              </View>
              <View className='am-field-row'>
                <View className='am-field am-field--half'>
                  <Text className='am-field__label'>{t('attAdm.officeLat')}</Text>
                  <Input
                    className='am-field__input'
                    value={groupForm.office_lat}
                    onInput={(e: any) => setGroupForm((p) => ({ ...p, office_lat: e.detail.value }))}
                  />
                </View>
                <View className='am-field am-field--half'>
                  <Text className='am-field__label'>{t('attAdm.officeLng')}</Text>
                  <Input
                    className='am-field__input'
                    value={groupForm.office_lng}
                    onInput={(e: any) => setGroupForm((p) => ({ ...p, office_lng: e.detail.value }))}
                  />
                </View>
              </View>
              <View className='am-field-row'>
                <View className='am-field am-field--half'>
                  <Text className='am-field__label'>{t('attAdm.radius')}</Text>
                  <Input
                    className='am-field__input'
                    value={groupForm.radius_km}
                    onInput={(e: any) => setGroupForm((p) => ({ ...p, radius_km: e.detail.value }))}
                  />
                </View>
                <View className='am-field am-field--half'>
                  <Text className='am-field__label'>{t('attAdm.utcOffset')}</Text>
                  <Input
                    className='am-field__input'
                    value={groupForm.utc_offset_hours}
                    onInput={(e: any) => setGroupForm((p) => ({ ...p, utc_offset_hours: e.detail.value }))}
                  />
                </View>
              </View>
              <View className='am-field-row'>
                <View className='am-field am-field--half'>
                  <Text className='am-field__label'>{t('attAdm.workStart')}</Text>
                  <Picker
                    mode='time'
                    value={groupForm.work_start}
                    onChange={(e: any) => setGroupForm((p) => ({ ...p, work_start: e.detail.value }))}
                  >
                    <View className='am-field__select'>
                      <Text className='am-field__select-text'>{groupForm.work_start}</Text>
                    </View>
                  </Picker>
                </View>
                <View className='am-field am-field--half'>
                  <Text className='am-field__label'>{t('attAdm.workEnd')}</Text>
                  <Picker
                    mode='time'
                    value={groupForm.work_end}
                    onChange={(e: any) => setGroupForm((p) => ({ ...p, work_end: e.detail.value }))}
                  >
                    <View className='am-field__select'>
                      <Text className='am-field__select-text'>{groupForm.work_end}</Text>
                    </View>
                  </Picker>
                </View>
              </View>
              <View className='am-field-row'>
                <View className='am-field am-field--half'>
                  <Text className='am-field__label'>{t('attAdm.lateGrace')}</Text>
                  <Input
                    className='am-field__input'
                    type='number'
                    value={groupForm.late_grace_minutes}
                    onInput={(e: any) => setGroupForm((p) => ({ ...p, late_grace_minutes: e.detail.value }))}
                  />
                </View>
                <View className='am-field am-field--half'>
                  <Text className='am-field__label'>{t('attAdm.earlyGrace')}</Text>
                  <Input
                    className='am-field__input'
                    type='number'
                    value={groupForm.early_grace_minutes}
                    onInput={(e: any) => setGroupForm((p) => ({ ...p, early_grace_minutes: e.detail.value }))}
                  />
                </View>
              </View>
              <View className='am-switches'>
                <View className='am-switch'>
                  <Text className='am-switch__label'>{t('attAdm.isDefault')}</Text>
                  <Switch
                    color='#14b8a6'
                    checked={groupForm.is_default}
                    onChange={(e: any) => setGroupForm((p) => ({ ...p, is_default: e.detail.value }))}
                  />
                </View>
                <View className='am-switch'>
                  <Text className='am-switch__label'>{t('attAdm.isActive')}</Text>
                  <Switch
                    color='#14b8a6'
                    checked={groupForm.is_active}
                    onChange={(e: any) => setGroupForm((p) => ({ ...p, is_active: e.detail.value }))}
                  />
                </View>
              </View>
            </ScrollView>
            <View className={`am-submit${saving ? ' am-submit--disabled' : ''}`} onClick={() => !saving && submitGroup()}>
              <Text className='am-submit__text'>{saving ? t('common.saving') : t('common.save')}</Text>
            </View>
          </View>
        </View>
      )}

      {/* ===== 成员管理 ===== */}
      {membersSheet && (
        <View className='am-sheet-mask' onClick={() => setMembersSheet(null)}>
          <View className='am-sheet am-sheet--tall' onClick={(e: any) => e.stopPropagation()}>
            <Text className='am-sheet__title'>
              {t('attAdm.groupMembersTitle', { name: membersSheet.name })}
            </Text>
            <ScrollView scrollY className='am-sheet__scroll'>
              <Text className='am-subtitle'>{t('attAdm.memberCount', { count: members.length })}</Text>
              {members.length === 0 ? (
                <Text className='am-days__none'>{t('attAdm.noMembers')}</Text>
              ) : (
                members.map((m) => (
                  <View key={m.employee_id} className='am-mrow'>
                    <Text className='am-mrow__name'>
                      {m.name || m.email || m.employee_id}
                      <Text className='am-mrow__dept'>{` · ${m.department || '—'}`}</Text>
                    </Text>
                    <View
                      className='am-btn am-btn--ghost am-btn--sm am-btn--danger'
                      onClick={() => dropMember(m.employee_id)}
                    >
                      <Text className='am-btn__text'>{t('attAdm.remove')}</Text>
                    </View>
                  </View>
                ))
              )}

              <View className='am-divider' />
              <Text className='am-subtitle'>{t('attAdm.addMembers')}</Text>
              <Text className='am-field__hint'>{t('attAdm.selectMemberPh')}</Text>
              {empOptions.map((emp) => {
                const selected = picked.includes(emp.id)
                return (
                  <View
                    key={emp.id}
                    className={`am-pick${selected ? ' am-pick--active' : ''}`}
                    onClick={() =>
                      setPicked((prev) =>
                        prev.includes(emp.id) ? prev.filter((id) => id !== emp.id) : [...prev, emp.id]
                      )
                    }
                  >
                    <Text className='am-pick__name'>{emp.full_name || emp.email || emp.id}</Text>
                    <Text className='am-pick__dept'>{emp.department || '—'}</Text>
                    <View className={`am-check${selected ? ' am-check--on' : ''}`}>
                      {selected ? <Text className='am-check__text'>✓</Text> : null}
                    </View>
                  </View>
                )
              })}
            </ScrollView>
            <View
              className={`am-submit${picked.length === 0 ? ' am-submit--disabled' : ''}`}
              onClick={() => picked.length > 0 && addMembers()}
            >
              <Text className='am-submit__text'>{`${t('attAdm.addMembers')} (${picked.length})`}</Text>
            </View>
          </View>
        </View>
      )}

      {/* ===== 审批弹窗 ===== */}
      {review && (
        <View className='am-sheet-mask' onClick={() => setReview(null)}>
          <View className='am-sheet' onClick={(e: any) => e.stopPropagation()}>
            <Text className='am-sheet__title'>
              {review.action === 'approved' ? t('attAdm.approveTitle') : t('attAdm.rejectTitle')}
            </Text>
            <Text className='am-gdesc'>
              {`${review.leave.name || '—'} · ${t(LEAVE_TYPE_KEY[review.leave.leave_type] || review.leave.leave_type)} · ${review.leave.start_date} ~ ${review.leave.end_date} · ${t('att.leaveDaysUnit', { days: review.leave.days })}`}
            </Text>
            <View className='am-field'>
              <Text className='am-field__label'>{t('attAdm.replyNote')}</Text>
              <Textarea
                className='am-field__textarea'
                value={replyNote}
                placeholder={t('attAdm.replyNotePh')}
                onInput={(e: any) => setReplyNote(e.detail.value)}
              />
            </View>
            <View className={`am-submit${saving ? ' am-submit--disabled' : ''}`} onClick={() => !saving && submitReview()}>
              <Text className='am-submit__text'>
                {saving ? t('common.submitting') : review.action === 'approved' ? t('attAdm.approve') : t('attAdm.reject')}
              </Text>
            </View>
          </View>
        </View>
      )}
    </View>
  )
}