import { useEffect, useMemo, useRef, useState } from 'react'
import { message } from 'antd'
import dayjs from 'dayjs'
import './attendance.css'

type AttendanceStatus = 'normal' | 'late' | 'early' | 'absent' | 'leave'

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
  normal: '正常',
  late: '迟到',
  early: '早退',
  absent: '缺勤',
  leave: '请假',
}

const statusBadgeTone: Record<AttendanceStatus, 'success' | 'warning' | 'info' | 'neutral'> = {
  normal: 'success',
  late: 'warning',
  early: 'warning',
  absent: 'neutral',
  leave: 'neutral',
}

const STATUS_BY_DAY = ['normal', 'normal', 'normal', 'late', 'normal', 'early', 'normal']

const WEEKDAYS_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

const buildStaticRecords = (): AttendanceRecord[] => {
  const records: AttendanceRecord[] = []
  const today = dayjs()
  for (let i = 0; i < 20; i++) {
    const date = today.subtract(i, 'day')
    // 周末跳过
    const weekday = date.day()
    if (weekday === 0 || weekday === 6) continue

    const status = STATUS_BY_DAY[i % STATUS_BY_DAY.length] as AttendanceStatus
    let checkIn: string | null = '09:00'
    let checkOut: string | null = '18:00'
    let remark = ''
    switch (status) {
      case 'late':
        checkIn = '09:25'
        remark = '交通拥堵'
        break
      case 'early':
        checkOut = '17:20'
        remark = '外出拜访客户'
        break
      case 'absent':
        checkIn = null
        checkOut = null
        remark = '未打卡'
        break
      case 'leave':
        checkIn = null
        checkOut = null
        remark = '事假'
        break
      default:
        remark = '正常出勤'
    }
    records.push({
      key: date.format('YYYY-MM-DD'),
      date: date.format('YYYY-MM-DD'),
      check_in: checkIn,
      check_out: checkOut,
      status,
      remark,
    })
  }
  return records
}

// 本月考勤日历静态展示数据（与设计稿一致）
const CALENDAR_CELLS: CalendarCell[] = [
  { day: 27, outside: true },
  { day: 28, outside: true },
  { day: 29, outside: true },
  { day: 30, outside: true },
  { day: 31, outside: true },
  { day: 1, event: { label: '休息', tone: 'neutral' } },
  { day: 2, event: { label: '休息', tone: 'neutral' } },
  { day: 3, today: true, event: { label: '正常', tone: 'success' } },
  { day: 4, event: { label: '正常', tone: 'success' } },
  { day: 5, event: { label: '迟到', tone: 'warning' } },
  { day: 6, event: { label: '外出', tone: 'info' } },
  { day: 7, event: { label: '正常', tone: 'success' } },
  { day: 8, event: { label: '休息', tone: 'neutral' } },
  { day: 9, event: { label: '休息', tone: 'neutral' } },
  { day: 10, event: { label: '正常', tone: 'success' } },
  { day: 11, event: { label: '请假', tone: 'neutral' } },
  { day: 12, event: { label: '正常', tone: 'success' } },
  { day: 13, event: { label: '外出', tone: 'info' } },
  { day: 14, event: { label: '正常', tone: 'success' } },
  { day: 15, event: { label: '休息', tone: 'neutral' } },
  { day: 16, event: { label: '休息', tone: 'neutral' } },
  { day: 17, event: { label: '正常', tone: 'success' } },
  { day: 18, event: { label: '正常', tone: 'success' } },
  { day: 19, event: { label: '正常', tone: 'success' } },
  { day: 20, event: { label: '外出', tone: 'info' } },
  { day: 21, event: { label: '正常', tone: 'success' } },
  { day: 22, event: { label: '休息', tone: 'neutral' } },
  { day: 23, event: { label: '休息', tone: 'neutral' } },
  { day: 24, event: { label: '正常', tone: 'success' } },
  { day: 25, event: { label: '请假', tone: 'neutral' } },
  { day: 26, event: { label: '正常', tone: 'success' } },
  { day: 27, event: { label: '正常', tone: 'success' } },
  { day: 28, event: { label: '正常', tone: 'success' } },
  { day: 29, event: { label: '休息', tone: 'neutral' } },
  { day: 30, event: { label: '休息', tone: 'neutral' } },
]

const Attendance = () => {
  const [loading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [checkInTime, setCheckInTime] = useState<string | null>(null)
  const [checkOutTime, setCheckOutTime] = useState<string | null>(null)
  const [records] = useState<AttendanceRecord[]>(() => buildStaticRecords())
  const [now, setNow] = useState(() => dayjs())
  const [outingLocation, setOutingLocation] = useState('')
  const [outingReturn, setOutingReturn] = useState('')
  const [outingReason, setOutingReason] = useState('')
  const outingFormRef = useRef<HTMLDivElement>(null)

  const today = dayjs().format('YYYY-MM-DD')

  useEffect(() => {
    const timer = setInterval(() => setNow(dayjs()), 1000)
    return () => clearInterval(timer)
  }, [])

  const handleCheckIn = () => {
    setSubmitting(true)
    setTimeout(() => {
      setCheckInTime(dayjs().format('HH:mm:ss'))
      setSubmitting(false)
      message.success('打卡成功')
    }, 300)
  }

  const handleCheckOut = () => {
    setSubmitting(true)
    setTimeout(() => {
      setCheckOutTime(dayjs().format('HH:mm:ss'))
      setSubmitting(false)
      message.success('打卡成功')
    }, 300)
  }

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
    const outingTime = dayjs().format('YYYY-MM-DD HH:mm')
    const expectedReturn = dayjs(outingReturn).format('YYYY-MM-DD HH:mm')
    console.log('外出登记', {
      outing_time: outingTime,
      expected_return: expectedReturn,
      reason: outingReason,
      location: outingLocation,
    })
    message.success('外出登记已提交')
    setOutingLocation('')
    setOutingReturn('')
    setOutingReason('')
  }

  const handleScrollToOuting = () => {
    outingFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // 今日状态判定
  const todayStatus = useMemo<AttendanceStatus>(() => {
    if (!checkInTime) return 'absent'
    const inHour = parseInt(checkInTime.split(':')[0], 10)
    const inMin = parseInt(checkInTime.split(':')[1], 10)
    const lateThreshold = inHour > 9 || (inHour === 9 && inMin > 0)
    if (checkOutTime) {
      const outHour = parseInt(checkOutTime.split(':')[0], 10)
      const outMin = parseInt(checkOutTime.split(':')[1], 10)
      const earlyLeave = outHour < 18 || (outHour === 18 && outMin < 0)
      if (earlyLeave) return 'early'
    }
    return lateThreshold ? 'late' : 'normal'
  }, [checkInTime, checkOutTime])

  // 统计
  const stats = useMemo(() => {
    let attend = 0
    let late = 0
    let early = 0
    let leave = 0
    records.forEach((r) => {
      if (r.status === 'normal') attend += 1
      else if (r.status === 'late') late += 1
      else if (r.status === 'early') early += 1
      else if (r.status === 'leave') leave += 1
    })
    return { attend, late, early, leave }
  }, [records])

  const dueDays = stats.attend + stats.late + stats.early
  const attendanceRate = dueDays > 0 ? Math.round((stats.attend / dueDays) * 100) : 0

  const fmtHHmm = (t: string | null) => {
    if (!t) return '--:--'
    const parts = t.split(':')
    return `${parts[0] ?? '--'}:${parts[1] ?? '--'}`
  }

  const recentRecords = records.slice(0, 6)

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
      </div>

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
                {checkInTime ? '已签到' : '未签到'}
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
              style={{ background: 'rgba(66,99,235,0.1)', color: 'var(--rent-primary)' }}
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
            较上月持平
          </div>
        </div>

        <div className="rent-stat-card">
          <div className="rent-flex rent-flex--between rent-mb-2">
            <div className="rent-stat-card__label">外出登记</div>
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
            {stats.early} <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--rent-ink-3)' }}>次</span>
          </div>
          <div className="rent-stat-card__delta rent-stat-card__delta--up">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 15 12 9 18 15" />
            </svg>
            客户拜访 {stats.early} 次
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
            <span className="rent-text-sm rent-text-muted">2026年8月</span>
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

              {CALENDAR_CELLS.map((cell, idx) => {
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
            <span className="rent-text-sm rent-text-muted">今日 {today}</span>
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
                        <div className="rent-empty">加载中...</div>
                      </td>
                    </tr>
                  ) : recentRecords.length === 0 ? (
                    <tr>
                      <td colSpan={5}>
                        <div className="rent-empty">暂无考勤记录</div>
                      </td>
                    </tr>
                  ) : (
                    recentRecords.map((r) => {
                      const isLeave = r.status === 'leave' || r.status === 'absent'
                      const isField = r.status === 'early'
                      const typeBadge = isLeave ? (
                        <span className="rent-badge rent-badge--neutral">—</span>
                      ) : isField ? (
                        <span className="rent-badge rent-badge--info">外勤</span>
                      ) : (
                        <span className="rent-badge rent-badge--neutral">办公室</span>
                      )
                      const tone = statusBadgeTone[r.status]
                      const dotColor =
                        tone === 'success'
                          ? 'var(--state-success)'
                          : tone === 'warning'
                            ? 'var(--state-warning)'
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
          <span className="rent-text-sm rent-text-muted">填写外出信息后提交审批</span>
        </div>
        <div className="rent-card__body">
          <div className="rent-grid rent-grid--2 rent-mb-4">
            <div className="rent-field">
              <label className="rent-label">外出地点</label>
              <input
                className="rent-input"
                type="text"
                placeholder="如：阳光花园客户接待中心"
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
