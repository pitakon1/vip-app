import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { message, Spin, Empty, Alert, Button } from 'antd'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { attendanceApi, geoApi } from '@/services/api'
import { downloadReport } from '@/lib/download'
import './attendance.css'

// 与后端 AttendanceStatus 枚举保持一致
type AttendanceStatus = 'present' | 'late' | 'early_out' | 'absent' | 'leave' | 'field_work'

interface AttendanceRecord {
  key: string
  date: string
  check_in: string | null
  check_out: string | null
  status: AttendanceStatus
  remark: string
}

interface CalendarCell {
  day: number
  outside?: boolean
  today?: boolean
  event?: { label: string; tone: 'success' | 'warning' | 'info' | 'neutral' }
}

// 我的生效考勤规则（考勤组命中则为组规则，否则为全局兜底）
interface MyRule {
  group_id?: string | null
  group_name?: string | null
  office_lat?: number
  office_lng?: number
  radius_km?: number
  utc_offset_hours?: number
  work_start?: string
  work_end?: string
  late_grace_minutes?: number
  early_grace_minutes?: number
}

type LeaveType = 'annual' | 'sick' | 'personal' | 'unpaid' | 'maternity' | 'other'
type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'

interface LeaveRow {
  id: string
  leave_type: LeaveType
  start_date: string
  end_date: string
  days: number | null
  reason: string
  status: LeaveStatus
  reply_note?: string | null
  created_at?: string | null
}

const LEAVE_TYPES: LeaveType[] = ['annual', 'sick', 'personal', 'unpaid', 'maternity', 'other']

const leaveStatusTone: Record<LeaveStatus, 'success' | 'warning' | 'error' | 'neutral'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'error',
  cancelled: 'neutral',
}

const statusBadgeTone: Record<AttendanceStatus, 'success' | 'warning' | 'info' | 'neutral'> = {
  present: 'success',
  late: 'warning',
  early_out: 'warning',
  field_work: 'info',
  absent: 'neutral',
  leave: 'neutral',
}

/** 把后端考勤记录转成表格/日历用的行数据。 */
const toRecord = (raw: any): AttendanceRecord => ({
  key: String(raw.date ?? raw.id),
  date: String(raw.date ?? '').slice(0, 10),
  check_in: raw.check_in_time ? dayjs(raw.check_in_time).format('HH:mm') : null,
  check_out: raw.check_out_time ? dayjs(raw.check_out_time).format('HH:mm') : null,
  status: (raw.status as AttendanceStatus) || 'present',
  remark: raw.notes || '',
})

/** 按真实考勤记录生成本月日历（周一为一周起点）。 */
const buildCalendar = (
  month: dayjs.Dayjs,
  records: AttendanceRecord[],
  statusLabelMap: Record<AttendanceStatus, string>,
  restLabel: string,
): CalendarCell[] => {
  const byDate = new Map(records.map((r) => [r.date, r]))
  const today = dayjs().format('YYYY-MM-DD')
  const cells: CalendarCell[] = []
  const first = month.startOf('month')

  // 月初前补上一月日期，保证与「一」列对齐
  const lead = (first.day() + 6) % 7
  for (let i = lead; i > 0; i--) {
    cells.push({ day: first.subtract(i, 'day').date(), outside: true })
  }

  for (let d = 1; d <= month.daysInMonth(); d++) {
    const date = month.date(d)
    const key = date.format('YYYY-MM-DD')
    const rec = byDate.get(key)
    const weekend = date.day() === 0 || date.day() === 6
    cells.push({
      day: d,
      today: key === today,
      event: rec
        ? { label: statusLabelMap[rec.status], tone: statusBadgeTone[rec.status] }
        : weekend
          ? { label: restLabel, tone: 'neutral' }
          : undefined,
    })
  }

  // 月末补下一月日期，凑满整周
  const tail = cells.length % 7
  for (let d = 1; d <= (tail ? 7 - tail : 0); d++) {
    cells.push({ day: d, outside: true })
  }
  return cells
}

const Attendance = () => {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [checkInTime, setCheckInTime] = useState<string | null>(null)
  const [checkOutTime, setCheckOutTime] = useState<string | null>(null)
  // 今日状态取后端判定结果（作息时间与宽限由服务端配置决定，前端不重算）
  const [todayStatus, setTodayStatus] = useState<AttendanceStatus | null>(null)
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [now, setNow] = useState(() => dayjs())
  const [outingLocation, setOutingLocation] = useState('')
  const [outingReturn, setOutingReturn] = useState('')
  const [outingReason, setOutingReason] = useState('')
  const outingFormRef = useRef<HTMLDivElement>(null)
  // v1.8 GPS 考勤
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'locating' | 'denied'>('idle')
  const [geoInfo, setGeoInfo] = useState<{ distance_km?: number; within_radius?: boolean; address?: string } | null>(null)
  // P1 员工自助：我的生效规则 + 假勤申请/记录
  const [myRule, setMyRule] = useState<MyRule | null>(null)
  const [leaves, setLeaves] = useState<LeaveRow[]>([])
  const [leaveSubmitting, setLeaveSubmitting] = useState(false)
  const [leaveForm, setLeaveForm] = useState({
    leave_type: 'annual' as LeaveType,
    start_date: dayjs().format('YYYY-MM-DD'),
    end_date: dayjs().format('YYYY-MM-DD'),
    reason: '',
  })

  // 状态文案 / 星期文案（依赖 i18n，故放在组件内）
  const statusLabelMap = useMemo<Record<AttendanceStatus, string>>(
    () => ({
      present: t('attendance.stPresent'),
      late: t('attendance.stLate'),
      early_out: t('attendance.stEarlyOut'),
      absent: t('attendance.stAbsent'),
      leave: t('attendance.stLeave'),
      field_work: t('attendance.stField'),
    }),
    [t],
  )
  const weekdays = useMemo(
    () => [
      t('attendance.wdSun'),
      t('attendance.wdMon'),
      t('attendance.wdTue'),
      t('attendance.wdWed'),
      t('attendance.wdThu'),
      t('attendance.wdFri'),
      t('attendance.wdSat'),
    ],
    [t],
  )
  const leaveTypeLabelMap = useMemo<Record<LeaveType, string>>(
    () => ({
      annual: t('attendance.ltAnnual'),
      sick: t('attendance.ltSick'),
      personal: t('attendance.ltPersonal'),
      unpaid: t('attendance.ltUnpaid'),
      maternity: t('attendance.ltMaternity'),
      other: t('attendance.ltOther'),
    }),
    [t],
  )
  const leaveStatusLabelMap = useMemo<Record<LeaveStatus, string>>(
    () => ({
      pending: t('attendance.lsPending'),
      approved: t('attendance.lsApproved'),
      rejected: t('attendance.lsRejected'),
      cancelled: t('attendance.lsCancelled'),
    }),
    [t],
  )

  // 我的规则展示项（全部来自后端解析结果，前端不写死作息/半径）
  const ruleItems = useMemo(() => {
    if (!myRule) return []
    return [
      {
        label: t('attendance.ruleGroup'),
        value: myRule.group_name || t('attendance.ruleFallback'),
      },
      {
        label: t('attendance.ruleOffice'),
        value: `${myRule.office_lat ?? '--'}, ${myRule.office_lng ?? '--'}`,
      },
      { label: t('attendance.ruleRadius'), value: `${myRule.radius_km ?? '--'} km` },
      {
        label: t('attendance.ruleShift'),
        value: `${myRule.work_start ?? '--'} - ${myRule.work_end ?? '--'}`,
      },
      {
        label: t('attendance.ruleGrace'),
        value: `${myRule.late_grace_minutes ?? 0} / ${myRule.early_grace_minutes ?? 0} ${t('attendance.unitMin')}`,
      },
      {
        label: t('attendance.ruleTimezone'),
        value: `UTC+${myRule.utc_offset_hours ?? 0}`,
      },
    ]
  }, [myRule, t])

  // 加载我的考勤记录（真实数据，不做静态兜底）
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
  }, [])

  useEffect(() => {
    loadRecords()
  }, [loadRecords])

  // 我的生效考勤规则（后端按「显式成员 → 部门 → 默认组 → 全局配置」解析）
  const loadMyRule = useCallback(() => {
    attendanceApi
      .myRule()
      .then((res) => setMyRule(res.data ?? null))
      .catch(() => setMyRule(null))
  }, [])

  // 我的请假记录（后端按角色只返回本人申请）
  const loadLeaves = useCallback(() => {
    attendanceApi
      .leaveRequests()
      .then((res) => setLeaves((res.data ?? []) as LeaveRow[]))
      .catch(() => setLeaves([]))
  }, [])

  useEffect(() => {
    loadMyRule()
    loadLeaves()
  }, [loadMyRule, loadLeaves])

  // 加载今日考勤状态（含定位半径信息）；状态一并取后端判定，前端只负责展示
  useEffect(() => {
    attendanceApi
      .today()
      .then((res) => {
        const d = res.data
        if (d.check_in_time) setCheckInTime(dayjs(d.check_in_time).format('HH:mm:ss'))
        if (d.check_out_time) setCheckOutTime(dayjs(d.check_out_time).format('HH:mm:ss'))
        setTodayStatus((d.status as AttendanceStatus) ?? null)
        if (d.check_in_location?.address) setGeoInfo(d.check_in_location)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const timer = setInterval(() => setNow(dayjs()), 1000)
    return () => clearInterval(timer)
  }, [])

  const getPosition = (): Promise<{ lat: number; lng: number }> =>
    new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        setGpsStatus('denied')
        reject(new Error('unsupported'))
        return
      }
      setGpsStatus('locating')
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setGpsStatus('idle')
          resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        },
        () => {
          setGpsStatus('denied')
          reject(new Error('denied'))
        },
        { enableHighAccuracy: true, timeout: 10000 },
      )
    })

  const clockNow = (endpoint: 'check-in' | 'check-out') => async () => {
    setSubmitting(true)
    try {
      const { lat, lng } = await getPosition()
      // 500KM 半径校验
      const geo = await geoApi.attendance(lat, lng)
      setGeoInfo(geo.data)
      if (geo.data.within_radius === false) {
        message.warning(t('attendance.warnOutOfRange', { km: geo.data.distance_km }))
        outingFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        setSubmitting(false)
        return
      }
      if (endpoint === 'check-in') {
        const res = await attendanceApi.checkIn({ lat, lng })
        setCheckInTime(dayjs().format('HH:mm:ss'))
        setTodayStatus((res.data?.status as AttendanceStatus) ?? null)
        message.success(t('attendance.msgCheckInOk'))
      } else {
        const res = await attendanceApi.checkOut({ lat, lng })
        setCheckOutTime(dayjs().format('HH:mm:ss'))
        setTodayStatus((res.data?.status as AttendanceStatus) ?? null)
        message.success(t('attendance.msgCheckOutOk'))
      }
      // 打卡后刷新记录，日历与明细立即反映最新状态
      loadRecords()
    } catch {
      message.error(t('attendance.errClock'))
      setGpsStatus('denied')
    } finally {
      setSubmitting(false)
    }
  }

  const handleCheckIn = clockNow('check-in')
  const handleCheckOut = clockNow('check-out')

  const handleOutingSubmit = () => {
    if (!outingLocation.trim()) {
      message.error(t('attendance.errOutingLocation'))
      return
    }
    if (!outingReturn) {
      message.error(t('attendance.errOutingReturn'))
      return
    }
    if (!outingReason.trim()) {
      message.error(t('attendance.errOutingReason'))
      return
    }
    attendanceApi
      .createExternalTrip({
        trip_date: dayjs().format('YYYY-MM-DD'),
        from_location: t('attendance.fromCompany'),
        to_location: outingLocation,
        reason: outingReason,
      })
      .then(() => {
        message.success(t('attendance.msgOutingSubmitted'))
        setOutingLocation('')
        setOutingReturn('')
        setOutingReason('')
      })
      .catch(() => message.error(t('attendance.errOutingSubmit')))
  }

  const handleScrollToOuting = () => {
    outingFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // 请假天数由后端按自然日自动计算，前端只做展示预览
  const leaveDaysPreview = useMemo(() => {
    const start = dayjs(leaveForm.start_date)
    const end = dayjs(leaveForm.end_date)
    if (!start.isValid() || !end.isValid() || end.isBefore(start)) return 0
    return end.diff(start, 'day') + 1
  }, [leaveForm.start_date, leaveForm.end_date])

  const handleLeaveSubmit = () => {
    if (!leaveForm.reason.trim()) {
      message.error(t('attendance.errLeaveReason'))
      return
    }
    if (leaveDaysPreview <= 0) {
      message.error(t('attendance.errLeaveRange'))
      return
    }
    setLeaveSubmitting(true)
    attendanceApi
      .applyLeave({
        leave_type: leaveForm.leave_type,
        start_date: leaveForm.start_date,
        end_date: leaveForm.end_date,
        reason: leaveForm.reason.trim(),
      })
      .then(() => {
        message.success(t('attendance.msgLeaveApplied'))
        setLeaveForm({
          leave_type: 'annual',
          start_date: dayjs().format('YYYY-MM-DD'),
          end_date: dayjs().format('YYYY-MM-DD'),
          reason: '',
        })
        loadLeaves()
      })
      .catch(() => message.error(t('attendance.errLeaveApply')))
      .finally(() => setLeaveSubmitting(false))
  }

  const handleLeaveCancel = (id: string) => {
    if (!window.confirm(t('attendance.confirmCancelLeave'))) return
    attendanceApi
      .cancelLeave(id)
      .then(() => {
        message.success(t('attendance.msgLeaveCancelled'))
        loadLeaves()
      })
      .catch(() => message.error(t('attendance.errLeaveApply')))
  }

  const todayLabelMap = useMemo<Record<AttendanceStatus, string>>(
    () => ({
      present: t('attendance.todayPresent'),
      late: t('attendance.todayLate'),
      early_out: t('attendance.todayEarlyOut'),
      absent: t('attendance.todayAbsent'),
      leave: t('attendance.todayLeave'),
      field_work: t('attendance.todayField'),
    }),
    [t],
  )

  // 本月考勤记录与统计（全部来自真实打卡数据）
  const monthPrefix = dayjs().format('YYYY-MM')
  const monthRecords = useMemo(
    () => records.filter((r) => r.date.startsWith(monthPrefix)),
    [records, monthPrefix],
  )

  const stats = useMemo(() => {
    let attend = 0
    let late = 0
    let field = 0
    let leave = 0
    monthRecords.forEach((r) => {
      if (r.status === 'present') attend += 1
      else if (r.status === 'late') late += 1
      else if (r.status === 'field_work') field += 1
      else if (r.status === 'leave') leave += 1
    })
    return { attend, late, field, leave }
  }, [monthRecords])

  // 应出勤 = 本月已过去的工作日（周一至周五）；出勤率按「有打卡记录的工作日」计算
  const dueDays = useMemo(() => {
    const today = dayjs()
    let days = 0
    for (let d = 1; d <= today.date(); d++) {
      const w = today.date(d).day()
      if (w !== 0 && w !== 6) days += 1
    }
    return days
  }, [])
  const attendedDays = stats.attend + stats.late + stats.field
  const attendanceRate = dueDays > 0 ? Math.min(100, Math.round((attendedDays / dueDays) * 100)) : 0

  const fmtHHmm = (timeStr: string | null) => {
    if (!timeStr) return '--:--'
    const parts = timeStr.split(':')
    return `${parts[0] ?? '--'}:${parts[1] ?? '--'}`
  }

  const recentRecords = records.slice(0, 6)
  const calendarCells = useMemo(
    () => buildCalendar(dayjs(), records, statusLabelMap, t('attendance.rest')),
    [records, statusLabelMap, t],
  )

  // 导出考勤明细（员工只能导出自己的，范围由后端按角色校验）
  const handleExport = async () => {
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
  }

  const clockBtnLabel = checkInTime ? t('attendance.clockOut') : t('attendance.clockIn')
  const clockBtnDisabled = submitting || (!!checkInTime && !!checkOutTime)
  const clockBtnClick = checkInTime ? handleCheckOut : handleCheckIn

  return (
    <div className="rent-main">
      {/* Page Header */}
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title">{t('attendance.title')}</h2>
          <p className="rent-page-header__subtitle">{t('attendance.subtitle')}</p>
        </div>
        <div className="rent-page-header__actions">
          <button className="rent-btn rent-btn--secondary" type="button" onClick={handleExport}>
            {t('attendance.export')}
          </button>
        </div>
      </div>

      {loadFailed && !loading && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={t('attendance.errLoadShort')}
          action={<Button size="small" onClick={() => loadRecords()}>{t('common.retry')}</Button>}
        />
      )}

      {/* Clock-in Card */}
      <div className="rent-card rent-clock-card rent-mb-5">
        <div className="rent-card__body">
          <div>
            <div
              style={{
                fontSize: 14,
                color: 'rgba(255,255,255,0.85)',
                marginBottom: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              {t('attendance.dateFull', { y: now.year(), m: now.month() + 1, d: now.date() })} {weekdays[now.day()]}
            </div>
            <div
              className="rent-num"
              style={{
                fontSize: 56,
                fontWeight: 700,
                color: 'var(--rent-primary-foreground)',
                letterSpacing: '-0.03em',
                lineHeight: 1,
              }}
            >
              {now.format('HH:mm:ss')}
            </div>
            <div
              style={{
                marginTop: 14,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <span
                className="rent-badge"
                style={{
                  background: checkInTime ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.12)',
                  color: 'var(--rent-primary-foreground)',
                }}
              >
                <span
                  className="rent-badge--dot"
                  style={{ background: checkInTime ? '#ffffff' : 'rgba(255,255,255,0.6)' }}
                />
                {todayLabelMap[todayStatus ?? 'absent']}
              </span>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.9)' }}>
                {t('attendance.todayCheckIn')}{' '}
                <span className="rent-mono" style={{ color: 'var(--rent-primary-foreground)' }}>
                  {checkInTime ? fmtHHmm(checkInTime) : '--:--'}
                </span>{' '}
                {t('attendance.todayCheckOut')}{' '}
                <span
                  className="rent-mono"
                  style={{ color: checkOutTime ? '#fff' : 'rgba(255,255,255,0.7)' }}
                >
                  {checkOutTime ? fmtHHmm(checkOutTime) : '--:--'}
                </span>
              </span>
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              minWidth: 220,
              flex: 1,
              maxWidth: 280,
            }}
          >
            <button
              className="rent-btn rent-btn--lg rent-btn--block"
              onClick={clockBtnClick}
              disabled={clockBtnDisabled}
              style={{ background: 'var(--rent-card)', color: 'var(--rent-primary)', border: 'none' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              {clockBtnLabel}
            </button>
            <button
              className="rent-btn rent-btn--lg rent-btn--block"
              onClick={handleScrollToOuting}
              style={{ background: 'rgba(255,255,255,0.15)', color: 'var(--rent-primary-foreground)', border: '1px solid rgba(255,255,255,0.35)' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              {t('attendance.outingRegister')}
            </button>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', textAlign: 'center', lineHeight: 1.5 }}>
              {gpsStatus === 'denied'
                ? t('attendance.gpsDenied')
                : geoInfo
                  ? `${t('attendance.geoDistance', { km: geoInfo.distance_km })}${geoInfo.address ? ` · ${geoInfo.address}` : ''}`
                  : t('attendance.geoHint')}
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="rent-grid rent-grid--4 rent-mb-5">
        <div className="rent-stat-card">
          <div className="rent-flex rent-flex--between rent-mb-2">
            <div className="rent-stat-card__label">{t('attendance.statMonthAttend')}</div>
            <div
              className="rent-stat-card__icon"
              style={{ background: 'rgba(20, 184, 166, 0.1)', color: 'var(--rent-primary)' }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
                <path d="M9 16l2 2 4-4" />
              </svg>
            </div>
          </div>
          <div className="rent-stat-card__value">
            {stats.attend} <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--rent-ink-3)' }}>{t('attendance.unitDays')}</span>
          </div>
          <div className="rent-stat-card__delta rent-stat-card__delta--up">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 15 12 9 18 15" />
            </svg>
            {t('attendance.dueDaysLabel', { days: dueDays })}
          </div>
        </div>

        <div className="rent-stat-card">
          <div className="rent-flex rent-flex--between rent-mb-2">
            <div className="rent-stat-card__label">{t('attendance.statLateCount')}</div>
            <div
              className="rent-stat-card__icon"
              style={{ background: 'rgba(217,119,6,0.1)', color: 'var(--state-warning)' }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
          </div>
          <div className="rent-stat-card__value" style={{ color: 'var(--state-warning)' }}>
            {stats.late} <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--rent-ink-3)' }}>{t('attendance.unitTimes')}</span>
          </div>
          <div className="rent-stat-card__delta" style={{ color: 'var(--state-warning)' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            {t('attendance.monthRecordsLabel', { count: monthRecords.length })}
          </div>
        </div>

        <div className="rent-stat-card">
          <div className="rent-flex rent-flex--between rent-mb-2">
            <div className="rent-stat-card__label">{t('attendance.statField')}</div>
            <div
              className="rent-stat-card__icon"
              style={{ background: 'rgba(14,165,233,0.1)', color: 'var(--state-info)' }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
            </div>
          </div>
          <div className="rent-stat-card__value">
            {stats.field} <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--rent-ink-3)' }}>{t('attendance.unitTimes')}</span>
          </div>
          <div className="rent-stat-card__delta rent-stat-card__delta--up">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 15 12 9 18 15" />
            </svg>
            {t('attendance.fieldHint')}
          </div>
        </div>

        <div className="rent-stat-card">
          <div className="rent-flex rent-flex--between rent-mb-2">
            <div className="rent-stat-card__label">{t('attendance.statRate')}</div>
            <div
              className="rent-stat-card__icon"
              style={{ background: 'rgba(22,163,74,0.1)', color: 'var(--state-success)' }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="5" x2="5" y2="19" />
                <circle cx="6.5" cy="6.5" r="2.5" />
                <circle cx="17.5" cy="17.5" r="2.5" />
              </svg>
            </div>
          </div>
          <div className="rent-stat-card__value">
            {attendanceRate}
            <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--rent-ink-3)' }}>%</span>
          </div>
          <div className="rent-progress rent-mt-2">
            <div
              className="rent-progress__bar"
              style={{ width: `${attendanceRate}%`, background: 'var(--state-success)' }}
            />
          </div>
        </div>
      </div>

      {/* Two-column: Calendar + Records */}
      <div className="rent-grid rent-grid--2 rent-mb-5">
        {/* Attendance Calendar */}
        <div className="rent-card">
          <div className="rent-card__header">
            <h3 className="rent-card__title">{t('attendance.calendarTitle')}</h3>
            <span className="rent-caption">{t('attendance.monthLabel', { y: dayjs().year(), m: dayjs().month() + 1 })}</span>
          </div>
          <div className="rent-card__body">
            <div className="rent-calendar">
              <div className="rent-calendar__header">{t('attendance.calMon')}</div>
              <div className="rent-calendar__header">{t('attendance.calTue')}</div>
              <div className="rent-calendar__header">{t('attendance.calWed')}</div>
              <div className="rent-calendar__header">{t('attendance.calThu')}</div>
              <div className="rent-calendar__header">{t('attendance.calFri')}</div>
              <div className="rent-calendar__header">{t('attendance.calSat')}</div>
              <div className="rent-calendar__header">{t('attendance.calSun')}</div>

              {calendarCells.map((cell, idx) => {
                const cls = [
                  'rent-calendar__cell',
                  cell.outside ? 'rent-calendar__cell--outside' : '',
                  cell.today ? 'rent-calendar__cell--today' : '',
                ]
                  .filter(Boolean)
                  .join(' ')
                return (
                  <div key={idx} className={cls}>
                    <span className="rent-calendar__date">{cell.day}</span>
                    {cell.event && (
                      <span className={`rent-calendar__event rent-calendar__event--${cell.event.tone}`}>
                        {cell.event.label}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
            <hr className="rent-divider" />
            <div className="rent-calendar__legend">
              <span className="rent-calendar__legend-item">
                <span className="rent-badge--dot" style={{ background: 'var(--state-success)' }} />
                {t('attendance.stPresent')}
              </span>
              <span className="rent-calendar__legend-item">
                <span className="rent-badge--dot" style={{ background: 'var(--state-warning)' }} />
                {t('attendance.stLate')}
              </span>
              <span className="rent-calendar__legend-item">
                <span className="rent-badge--dot" style={{ background: 'var(--state-info)' }} />
                {t('attendance.legendOut')}
              </span>
              <span className="rent-calendar__legend-item">
                <span className="rent-badge--dot" style={{ background: 'var(--rent-ink-3)' }} />
                {t('attendance.legendLeaveRest')}
              </span>
              <span className="rent-calendar__legend-item">
                <span className="rent-badge--dot" style={{ background: 'var(--rent-primary)' }} />
                {t('attendance.legendToday')}
              </span>
            </div>
          </div>
        </div>

        {/* Attendance Records */}
        <div className="rent-card">
          <div className="rent-card__header">
            <h3 className="rent-card__title">{t('attendance.recordsTitle')}</h3>
            <a href="#" className="rent-btn rent-btn--ghost rent-btn--sm">{t('attendance.viewAll')}</a>
          </div>
          <div className="rent-card__body" style={{ padding: 0 }}>
            <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
              <table className="rent-table">
                <thead>
                  <tr>
                    <th>{t('attendance.thDate')}</th>
                    <th>{t('attendance.thCheckIn')}</th>
                    <th>{t('attendance.thCheckOut')}</th>
                    <th>{t('attendance.thType')}</th>
                    <th>{t('common.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={5}>
                        <div className="rent-empty">
                          <Spin size="small" style={{ marginRight: 8 }} />
                          {t('common.loading')}
                        </div>
                      </td>
                    </tr>
                  ) : recentRecords.length === 0 ? (
                    <tr>
                      <td colSpan={5}>
                        <div className="rent-empty">
                          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('attendance.emptyRecords')} />
                        </div>
                      </td>
                    </tr>
                  ) : (
                    recentRecords.map((r) => {
                      const isLeave = r.status === 'leave' || r.status === 'absent'
                      const isField = r.status === 'field_work'
                      const typeBadge = isLeave ? (
                        <span className="rent-badge rent-badge--neutral">—</span>
                      ) : isField ? (
                        <span className="rent-badge rent-badge--info">{t('attendance.stField')}</span>
                      ) : (
                        <span className="rent-badge rent-badge--neutral">{t('attendance.badgeClock')}</span>
                      )
                      const tone = statusBadgeTone[r.status]
                      const dotColor =
                        tone === 'success'
                          ? 'var(--state-success)'
                          : tone === 'warning'
                            ? 'var(--state-warning)'
                            : tone === 'info'
                              ? 'var(--state-info)'
                              : 'var(--rent-ink-3)'
                      return (
                        <tr key={r.key}>
                          <td>
                            <div className="rent-text-bold">{dayjs(r.date).format('MM-DD')}</div>
                            <div className="rent-text-sm rent-text-muted">
                              {weekdays[dayjs(r.date).day()]}
                            </div>
                          </td>
                          <td className={`rent-table__mono${r.check_in ? '' : ' rent-text-muted'}`}>
                            {r.check_in || '--:--'}
                          </td>
                          <td className={`rent-table__mono${r.check_out ? '' : ' rent-text-muted'}`}>
                            {r.check_out || '--:--'}
                          </td>
                          <td>{typeBadge}</td>
                          <td>
                            <span className={`rent-badge rent-badge--${tone}`}>
                              <span className="rent-badge--dot" style={{ background: dotColor }} />
                              {statusLabelMap[r.status]}
                            </span>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Outing Registration Form */}
      <div className="rent-card" ref={outingFormRef}>
        <div className="rent-card__header">
          <h3 className="rent-card__title">{t('attendance.outingRegister')}</h3>
          <span className="rent-caption">{t('attendance.outingFormHint')}</span>
        </div>
        <div className="rent-card__body">
          <div className="rent-grid rent-grid--2 rent-mb-4">
            <div className="rent-field">
              <label className="rent-label">{t('attendance.labelOutingLocation')}</label>
              <input
                className="rent-input"
                type="text"
                placeholder={t('attendance.phOutingLocation')}
                value={outingLocation}
                onChange={(e) => setOutingLocation(e.target.value)}
              />
            </div>
            <div className="rent-field">
              <label className="rent-label">{t('attendance.labelOutingReturn')}</label>
              <input
                className="rent-input"
                type="datetime-local"
                value={outingReturn}
                onChange={(e) => setOutingReturn(e.target.value)}
              />
            </div>
          </div>
          <div className="rent-field rent-mb-4">
            <label className="rent-label">{t('attendance.labelOutingReason')}</label>
            <textarea
              className="rent-textarea"
              rows={3}
              placeholder={t('attendance.phOutingReason')}
              value={outingReason}
              onChange={(e) => setOutingReason(e.target.value)}
            />
          </div>
          <div className="rent-flex" style={{ justifyContent: 'flex-end', gap: 8 }}>
            <button
              className="rent-btn rent-btn--secondary"
              onClick={() => {
                setOutingLocation('')
                setOutingReturn('')
                setOutingReason('')
              }}
            >
              {t('common.cancel')}
            </button>
            <button className="rent-btn rent-btn--primary" onClick={handleOutingSubmit}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 2L11 13" />
                <path d="M22 2l-7 20-4-9-9-4 20-7z" />
              </svg>
              {t('attendance.submitOuting')}
            </button>
          </div>
        </div>
      </div>

      {/* 我的考勤规则（P1-a：后端按「成员 → 部门 → 默认组 → 全局」解析出的生效规则） */}
      <div className="rent-card rent-mb-5">
        <div className="rent-card__header">
          <h3 className="rent-card__title">{t('attendance.myRuleTitle')}</h3>
          <span className="rent-caption">
            {myRule?.group_id ? t('attendance.ruleGroup') : t('attendance.ruleFallback')}
          </span>
        </div>
        <div className="rent-card__body">
          {ruleItems.length === 0 ? (
            <div className="rent-empty">
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('common.noData')} />
            </div>
          ) : (
            <div className="rent-grid rent-grid--3">
              {ruleItems.map((item) => (
                <div key={item.label} className="rent-field">
                  <div className="rent-label">{item.label}</div>
                  <div className="rent-text-bold">{item.value}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 请假申请 + 我的请假记录（P1-b：审批通过后由后端回写考勤为 leave） */}
      <div className="rent-grid rent-grid--2">
        <div className="rent-card">
          <div className="rent-card__header">
            <h3 className="rent-card__title">{t('attendance.leaveApplyTitle')}</h3>
          </div>
          <div className="rent-card__body">
            <div className="rent-grid rent-grid--2 rent-mb-4">
              <div className="rent-field">
                <label className="rent-label">{t('attendance.leaveType')}</label>
                <select
                  className="rent-input"
                  value={leaveForm.leave_type}
                  onChange={(e) =>
                    setLeaveForm({ ...leaveForm, leave_type: e.target.value as LeaveType })
                  }
                >
                  {LEAVE_TYPES.map((lt) => (
                    <option key={lt} value={lt}>
                      {leaveTypeLabelMap[lt]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="rent-field">
                <label className="rent-label">{t('attendance.leaveDays')}</label>
                <input className="rent-input" type="text" value={leaveDaysPreview} readOnly />
              </div>
              <div className="rent-field">
                <label className="rent-label">{t('attendance.leaveStart')}</label>
                <input
                  className="rent-input"
                  type="date"
                  value={leaveForm.start_date}
                  onChange={(e) =>
                    setLeaveForm({ ...leaveForm, start_date: e.target.value })
                  }
                />
              </div>
              <div className="rent-field">
                <label className="rent-label">{t('attendance.leaveEnd')}</label>
                <input
                  className="rent-input"
                  type="date"
                  value={leaveForm.end_date}
                  onChange={(e) => setLeaveForm({ ...leaveForm, end_date: e.target.value })}
                />
              </div>
            </div>
            <div className="rent-field rent-mb-4">
              <label className="rent-label">{t('attendance.leaveReason')}</label>
              <textarea
                className="rent-textarea"
                rows={3}
                placeholder={t('attendance.phLeaveReason')}
                value={leaveForm.reason}
                onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })}
              />
            </div>
            <div className="rent-flex" style={{ justifyContent: 'flex-end' }}>
              <button
                className="rent-btn rent-btn--primary"
                onClick={handleLeaveSubmit}
                disabled={leaveSubmitting}
              >
                {t('attendance.submitLeave')}
              </button>
            </div>
          </div>
        </div>

        <div className="rent-card">
          <div className="rent-card__header">
            <h3 className="rent-card__title">{t('attendance.myLeaves')}</h3>
          </div>
          <div className="rent-card__body" style={{ padding: 0 }}>
            <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
              <table className="rent-table">
                <thead>
                  <tr>
                    <th>{t('attendance.leaveType')}</th>
                    <th>{t('attendance.leaveStart')}</th>
                    <th>{t('attendance.leaveDays')}</th>
                    <th>{t('common.status')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {leaves.length === 0 ? (
                    <tr>
                      <td colSpan={5}>
                        <div className="rent-empty">
                          <Empty
                            image={Empty.PRESENTED_IMAGE_SIMPLE}
                            description={t('attendance.noLeaves')}
                          />
                        </div>
                      </td>
                    </tr>
                  ) : (
                    leaves.map((row) => (
                      <tr key={row.id}>
                        <td className="rent-text-bold">
                          {leaveTypeLabelMap[row.leave_type] ?? row.leave_type}
                        </td>
                        <td className="rent-table__mono">
                          {row.start_date} ~ {row.end_date}
                        </td>
                        <td>
                          {row.days ?? '--'}
                          {t('attendance.unitDays')}
                        </td>
                        <td>
                          <span className={`rent-badge rent-badge--${leaveStatusTone[row.status]}`}>
                            {leaveStatusLabelMap[row.status] ?? row.status}
                          </span>
                        </td>
                        <td>
                          {row.status === 'pending' && (
                            <button
                              className="rent-btn rent-btn--ghost rent-btn--sm"
                              onClick={() => handleLeaveCancel(row.id)}
                            >
                              {t('attendance.cancelLeave')}
                            </button>
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
      </div>
    </div>
  )
}

export default Attendance
