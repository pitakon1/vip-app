import { useTranslation } from 'react-i18next'
import type { Dayjs } from 'dayjs'
import { fmtHHmm } from '../utils'
import type { AttendanceStatus, GeoInfo } from '../types'

interface ClockCardProps {
  now: Dayjs
  weekdays: string[]
  todayLabelMap: Record<AttendanceStatus, string>
  todayStatus: AttendanceStatus | null
  checkInTime: string | null
  checkOutTime: string | null
  submitting: boolean
  gpsStatus: 'idle' | 'locating' | 'denied'
  geoInfo: GeoInfo | null
  onCheckIn: () => void
  onCheckOut: () => void
  onScrollToOuting: () => void
}

/** 打卡卡片：实时时钟、今日状态、打卡按钮、外勤入口与定位提示。 */
const ClockCard = ({
  now,
  weekdays,
  todayLabelMap,
  todayStatus,
  checkInTime,
  checkOutTime,
  submitting,
  gpsStatus,
  geoInfo,
  onCheckIn,
  onCheckOut,
  onScrollToOuting,
}: ClockCardProps) => {
  const { t } = useTranslation()

  const clockBtnLabel = checkInTime ? t('attendance.clockOut') : t('attendance.clockIn')
  const clockBtnDisabled = submitting || (!!checkInTime && !!checkOutTime)
  const clockBtnClick = checkInTime ? onCheckOut : onCheckIn

  return (
    <div className="rent-card rent-clock-card rent-mb-5">
      <div className="rent-card__body">
        <div>
          <div
            style={{
              fontSize: 14,
              // 品牌绿底上用深墨前景（白字 2.49:1 不达标，UI-01）
              color: 'rgba(11,47,43,0.78)',
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
            <span style={{ fontSize: 13, color: 'rgba(11,47,43,0.78)' }}>
              {t('attendance.todayCheckIn')}{' '}
              <span className="rent-mono" style={{ color: 'var(--rent-primary-foreground)' }}>
                {checkInTime ? fmtHHmm(checkInTime) : '--:--'}
              </span>{' '}
              {t('attendance.todayCheckOut')}{' '}
              <span
                className="rent-mono"
                style={{ color: checkOutTime ? 'var(--rent-primary-foreground)' : 'rgba(11,47,43,0.6)' }}
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
            onClick={onScrollToOuting}
            style={{ background: 'rgba(255,255,255,0.15)', color: 'var(--rent-primary-foreground)', border: '1px solid rgba(255,255,255,0.35)' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            {t('attendance.outingRegister')}
          </button>
          <div style={{ fontSize: 12, color: 'rgba(11,47,43,0.7)', textAlign: 'center', lineHeight: 1.5 }}>
            {gpsStatus === 'denied'
              ? t('attendance.gpsDenied')
              : geoInfo
                ? `${geoInfo.within_radius ? t('attendance.inRange') : t('attendance.outOfRange')} · ${t('attendance.geoDistance', { km: geoInfo.distance_km })}${geoInfo.address ? ` · ${geoInfo.address}` : ''}`
                : t('attendance.geoHint')}
          </div>
        </div>
      </div>
    </div>
  )
}

export default ClockCard
