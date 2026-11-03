import { useEffect, useRef, useState } from 'react'
import { message } from 'antd'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { attendanceApi, geoApi } from '@/services/api'
import type { AttendanceStatus, GeoInfo } from '../types'

/**
 * 今日打卡状态 + GPS 定位校验 + 外勤登记。
 * 打卡状态取后端判定结果（作息时间与宽限由服务端配置决定，前端不重算）。
 */
export const useAttendanceClock = (onClocked: () => void) => {
  const { t } = useTranslation()
  const [submitting, setSubmitting] = useState(false)
  const [checkInTime, setCheckInTime] = useState<string | null>(null)
  const [checkOutTime, setCheckOutTime] = useState<string | null>(null)
  const [todayStatus, setTodayStatus] = useState<AttendanceStatus | null>(null)
  const [outingLocation, setOutingLocation] = useState('')
  const [outingReturn, setOutingReturn] = useState('')
  const [outingReason, setOutingReason] = useState('')
  const outingFormRef = useRef<HTMLDivElement>(null)
  // v1.8 GPS 考勤
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'locating' | 'denied'>('idle')
  const [geoInfo, setGeoInfo] = useState<GeoInfo | null>(null)

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
      onClocked()
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

  const resetOuting = () => {
    setOutingLocation('')
    setOutingReturn('')
    setOutingReason('')
  }

  return {
    submitting,
    checkInTime,
    checkOutTime,
    todayStatus,
    gpsStatus,
    geoInfo,
    handleCheckIn,
    handleCheckOut,
    outingFormRef,
    outingLocation,
    setOutingLocation,
    outingReturn,
    setOutingReturn,
    outingReason,
    setOutingReason,
    handleOutingSubmit,
    handleScrollToOuting,
    resetOuting,
  }
}
