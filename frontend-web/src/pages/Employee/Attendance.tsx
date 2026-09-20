import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { message, Spin, Empty, Alert, Button } from 'antd'
import dayjs from 'dayjs'
import { attendanceApi, geoApi } from '@/services/api'
import { downloadReport } from '@/lib/download'
import './attendance.css'

// 与后端 AttendanceStatus 枚举保持一致
type AttendanceStatus = 'present' | 'late' | 'absent' | 'leave' | 'field_work'

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

const statusLabelMap: Record<AttendanceStatus, string> = {
  present: '正常',
  late: '迟到',
  absent: '缺勤',
  leave: '请假',
  field_work: '外勤',
}

const statusBadgeTone: Record<AttendanceStatus, 'success' | 'warning' | 'info' | 'neutral'> = {
  present: 'success',
  late: 'warning',
  field_work: 'info',
  absent: 'neutral',
  leave: 'neutral',
}

const WEEKDAYS_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

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
const buildCalendar = (month: dayjs.Dayjs, records: AttendanceRecord[]): CalendarCell[] => {
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
          ? { label: '休息', tone: 'neutral' }
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
  const [loading, setLoading] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [checkInTime, setCheckInTime] = useState<string | null>(null)
  const [checkOutTime, setCheckOutTime] = useState<string | null>(null)
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [now, setNow] = useState(() => dayjs())
  const [outingLocation, setOutingLocation] = useState('')
  const [outingReturn, setOutingReturn] = useState('')
  const [outingReason, setOutingReason] = useState('')
  const outingFormRef = useRef<HTMLDivElement>(null)
  // v1.8 GPS 考勤
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'locating' | 'denied'>('idle')
  const [geoInfo, setGeoInfo] = useState<{ distance_km?: number; within_radius?: boolean; address?: string } | null>(null)

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
        message.error('获取考勤记录失败，请稍后重试')
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    loadRecords()
  }, [loadRecords])

  // 加载今日考勤状态（含定位半径信息）
  useEffect(() => {
    attendanceApi
      .today()
      .then((res) => {
        const d = res.data
        if (d.check_in_time) setCheckInTime(dayjs(d.check_in_time).format('HH:mm:ss'))
        if (d.check_out_time) setCheckOutTime(dayjs(d.check_out_time).format('HH:mm:ss'))
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
        message.warning(`当前不在打卡半径内（约 ${geo.data.distance_km}km）。请先在下方填写外勤申请。`)
        outingFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        setSubmitting(false)
        return
      }
      if (endpoint === 'check-in') {
        await attendanceApi.checkIn({ lat, lng })
        setCheckInTime(dayjs().format('HH:mm:ss'))
        message.success('定位打卡成功（上班）')
      } else {
        await attendanceApi.checkOut({ lat, lng })
        setCheckOutTime(dayjs().format('HH:mm:ss'))
        message.success('定位打卡成功（下班）')
      }
      // 打卡后刷新记录，日历与明细立即反映最新状态
      loadRecords()
    } catch {
      message.error('定位失败或未授权，无法完成打卡')
      setGpsStatus('denied')
    } finally {
      setSubmitting(false)
    }
  }

  const handleCheckIn = clockNow('check-in')
  const handleCheckOut = clockNow('check-out')

  const handleOutingSubmit = () => {
    if (!outingLocation.trim()) {
      message.error('请输入外出地点')
      return
    }
    if (!outingReturn) {
      message.error('请选择预计返回时间')
      return
    }
    if (!outingReason.trim()) {
      message.error('请填写外出事由')
      return
    }
    attendanceApi
      .createExternalTrip({
        trip_date: dayjs().format('YYYY-MM-DD'),
        from_location: '公司',
        to_location: outingLocation,
        reason: outingReason,
      })
      .then(() => {
        message.success('外勤申请已提交，待审批通过后可在定位半径外打卡')
        setOutingLocation('')
        setOutingReturn('')
        setOutingReason('')
      })
      .catch(() => message.error('外勤申请提交失败'))
  }

  const handleScrollToOuting = () => {
    outingFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // 今日状态判定（用于打卡卡片的文案判定）
  const todayStatus = useMemo<AttendanceStatus>(() => {
    if (!checkInTime) return 'absent'
    const [inHour, inMin] = checkInTime.split(':').map((v) => parseInt(v, 10))
    return inHour > 9 || (inHour === 9 && inMin > 0) ? 'late' : 'present'
  }, [checkInTime])
  const todayLabelMap: Record<AttendanceStatus, string> = {
    present: '已签到',
    late: '已签到（迟到）',
    absent: '未签到',
    leave: '请假中',
    field_work: '外勤中',
  }

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
    const t = dayjs()
    let days = 0
    for (let d = 1; d <= t.date(); d++) {
      const w = t.date(d).day()
      if (w !== 0 && w !== 6) days += 1
    }
    return days
  }, [])
  const attendedDays = stats.attend + stats.late + stats.field
  const attendanceRate = dueDays > 0 ? Math.min(100, Math.round((attendedDays / dueDays) * 100)) : 0

  const fmtHHmm = (t: string | null) => {
    if (!t) return '--:--'
    const parts = t.split(':')
    return `${parts[0] ?? '--'}:${parts[1] ?? '--'}`
  }

  const recentRecords = records.slice(0, 6)
  const calendarCells = useMemo(() => buildCalendar(dayjs(), records), [records])

  // 导出考勤明细（员工只能导出自己的，范围由后端按角色校验）
  const handleExport = async () => {
    try {
      await downloadReport(
        '/exports/attendance',
        { start_date: dayjs().startOf('month').format('YYYY-MM-DD'), end_date: dayjs().format('YYYY-MM-DD') },
        'attendance.csv',
      )
      message.success('考勤明细已导出')
    } catch {
      message.error('导出失败，请稍后重试')
    }
  }

  const clockBtnLabel = checkInTime ? '下班打卡' : '上班打卡'
  const clockBtnDisabled = submitting || (!!checkInTime && !!checkOutTime)
  const clockBtnClick = checkInTime ? handleCheckOut : handleCheckIn

  return (
    <div className="rent-main">
      {/* Page Header */}
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title">考勤打卡</h2>
          <p className="rent-page-header__subtitle">每日上下班打卡、外出登记</p>
        </div>
        <div className="rent-page-header__actions">
          <button className="rent-btn rent-btn--secondary" type="button" onClick={handleExport}>
            导出
          </button>
        </div>
      </div>

      {loadFailed && !loading && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="获取考勤记录失败"
          action={<Button size="small" onClick={() => loadRecords()}>重试</Button>}
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
              {now.format('YYYY年M月D日')} {WEEKDAYS_CN[now.day()]}
            </div>
            <div
              className="rent-num"
              style={{
                fontSize: 56,
                fontWeight: 700,
                color: '#ffffff',
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
                  color: '#ffffff',
                }}
              >
                <span
                  className="rent-badge--dot"
                  style={{ background: checkInTime ? '#ffffff' : 'rgba(255,255,255,0.6)' }}
                />
                {todayLabelMap[todayStatus]}
              </span>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.9)' }}>
                今日打卡 · 上班{' '}
                <span className="rent-mono" style={{ color: '#fff' }}>
                  {checkInTime ? fmtHHmm(checkInTime) : '--:--'}
                </span>{' '}
                · 下班{' '}
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
              style={{ background: '#ffffff', color: 'var(--rent-primary)', border: 'none' }}
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
              style={{ background: 'rgba(255,255,255,0.15)', color: '#ffffff', border: '1px solid rgba(255,255,255,0.35)' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              外出登记
            </button>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', textAlign: 'center', lineHeight: 1.5 }}>
              {gpsStatus === 'denied'
                ? '⚠ 定位未授权，需允许定位才能打卡'
                : geoInfo
                  ? `定位距离办公点 ${geoInfo.distance_km}km${geoInfo.address ? ` · ${geoInfo.address}` : ''}`
                  : '打卡将校验 500KM 半径定位，超出需先提交外勤申请'}
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="rent-grid rent-grid--4 rent-mb-5">
        <div className="rent-stat-card">
          <div className="rent-flex rent-flex--between rent-mb-2">
            <div className="rent-stat-card__label">本月出勤</div>
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
            {stats.attend} <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--rent-ink-3)' }}>天</span>
          </div>
          <div className="rent-stat-card__delta rent-stat-card__delta--up">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 15 12 9 18 15" />
            </svg>
            应出勤 {dueDays} 天
          </div>
        </div>

        <div className="rent-stat-card">
          <div className="rent-flex rent-flex--between rent-mb-2">
            <div className="rent-stat-card__label">迟到次数</div>
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
            {stats.late} <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--rent-ink-3)' }}>次</span>
          </div>
          <div className="rent-stat-card__delta" style={{ color: 'var(--state-warning)' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            本月记录 {monthRecords.length} 条
          </div>
        </div>

        <div className="rent-stat-card">
          <div className="rent-flex rent-flex--between rent-mb-2">
            <div className="rent-stat-card__label">外勤打卡</div>
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
            {stats.field} <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--rent-ink-3)' }}>次</span>
          </div>
          <div className="rent-stat-card__delta rent-stat-card__delta--up">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 15 12 9 18 15" />
            </svg>
            半径外打卡需先提交外勤申请
          </div>
        </div>

        <div className="rent-stat-card">
          <div className="rent-flex rent-flex--between rent-mb-2">
            <div className="rent-stat-card__label">出勤率</div>
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
            <h3 className="rent-card__title">本月考勤日历</h3>
            <span className="rent-caption">{dayjs().format('YYYY年M月')}</span>
          </div>
          <div className="rent-card__body">
            <div className="rent-calendar">
              <div className="rent-calendar__header">一</div>
              <div className="rent-calendar__header">二</div>
              <div className="rent-calendar__header">三</div>
              <div className="rent-calendar__header">四</div>
              <div className="rent-calendar__header">五</div>
              <div className="rent-calendar__header">六</div>
              <div className="rent-calendar__header">日</div>

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
                正常
              </span>
              <span className="rent-calendar__legend-item">
                <span className="rent-badge--dot" style={{ background: 'var(--state-warning)' }} />
                迟到
              </span>
              <span className="rent-calendar__legend-item">
                <span className="rent-badge--dot" style={{ background: 'var(--state-info)' }} />
                外出
              </span>
              <span className="rent-calendar__legend-item">
                <span className="rent-badge--dot" style={{ background: 'var(--rent-ink-3)' }} />
                请假 / 休息
              </span>
              <span className="rent-calendar__legend-item">
                <span className="rent-badge--dot" style={{ background: 'var(--rent-primary)' }} />
                今日
              </span>
            </div>
          </div>
        </div>

        {/* Attendance Records */}
        <div className="rent-card">
          <div className="rent-card__header">
            <h3 className="rent-card__title">考勤记录</h3>
            <a href="#" className="rent-btn rent-btn--ghost rent-btn--sm">查看全部</a>
          </div>
          <div className="rent-card__body" style={{ padding: 0 }}>
            <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
              <table className="rent-table">
                <thead>
                  <tr>
                    <th>日期</th>
                    <th>上班打卡</th>
                    <th>下班打卡</th>
                    <th>类型</th>
                    <th>状态</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={5}>
                        <div className="rent-empty">
                          <Spin size="small" style={{ marginRight: 8 }} />
                          加载中...
                        </div>
                      </td>
                    </tr>
                  ) : recentRecords.length === 0 ? (
                    <tr>
                      <td colSpan={5}>
                        <div className="rent-empty">
                          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无考勤记录" />
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
                        <span className="rent-badge rent-badge--info">外勤</span>
                      ) : (
                        <span className="rent-badge rent-badge--neutral">打卡</span>
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
                              {WEEKDAYS_CN[dayjs(r.date).day()]}
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
          <h3 className="rent-card__title">外出登记</h3>
          <span className="rent-caption">填写外出信息后提交审批</span>
        </div>
        <div className="rent-card__body">
          <div className="rent-grid rent-grid--2 rent-mb-4">
            <div className="rent-field">
              <label className="rent-label">外出地点</label>
              <input
                className="rent-input"
                type="text"
                placeholder="如：客户接待中心"
                value={outingLocation}
                onChange={(e) => setOutingLocation(e.target.value)}
              />
            </div>
            <div className="rent-field">
              <label className="rent-label">预计返回时间</label>
              <input
                className="rent-input"
                type="datetime-local"
                value={outingReturn}
                onChange={(e) => setOutingReturn(e.target.value)}
              />
            </div>
          </div>
          <div className="rent-field rent-mb-4">
            <label className="rent-label">外出事由</label>
            <textarea
              className="rent-textarea"
              rows={3}
              placeholder="请简述外出事由，如客户拜访、实地看房、合同签署等..."
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
              取消
            </button>
            <button className="rent-btn rent-btn--primary" onClick={handleOutingSubmit}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 2L11 13" />
                <path d="M22 2l-7 20-4-9-9-4 20-7z" />
              </svg>
              提交登记
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Attendance
