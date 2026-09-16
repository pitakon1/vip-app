import { useEffect, useMemo, useState } from 'react'
import { View, Text, ScrollView, Input, Picker } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { attendanceApi } from '@/services/api'
import BottomNav from '@/components/BottomNav'
import './index.scss'

interface Trip {
  id: string
  trip_date?: string
  to_location?: string
  reason?: string
  status?: string
  reply_note?: string | null
}

// 我的考勤明细（GET /attendance/me）
interface AttendanceRec {
  id: string
  date?: string
  check_in_time?: string | null
  check_out_time?: string | null
  status?: string
  notes?: string | null
}

const TRIP_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: '待审批', cls: 'a-badge--warning' },
  approved: { label: '已通过', cls: 'a-badge--success' },
  rejected: { label: '已驳回', cls: 'a-badge--error' }
}

// 考勤状态 → 文案 + 徽章样式
const ATT_STATUS: Record<string, string> = {
  present: '正常',
  late: '迟到',
  absent: '缺勤',
  leave: '请假',
  field_work: '外勤'
}

const ATT_BADGE: Record<string, string> = {
  present: 'a-badge--success',
  late: 'a-badge--warning',
  absent: 'a-badge--error',
  leave: 'a-badge--neutral',
  field_work: 'a-badge--neutral'
}

// 从时间戳取 HH:MM（后端返回完整 datetime）
const hhmm = (iso?: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

const todayStr = () => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const pad2 = (n: number) => String(n).padStart(2, '0')

function pickList(res: any): Trip[] {
  if (Array.isArray(res)) return res
  if (Array.isArray(res?.data)) return res.data
  if (Array.isArray(res?.items)) return res.items
  return []
}

export default function AttendancePage() {
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null)
  const [locState, setLocState] = useState<'getting' | 'ready' | 'denied'>('getting')
  const [checkedIn, setCheckedIn] = useState(false)
  const [checkedOut, setCheckedOut] = useState(false)
  const [checkInTime, setCheckInTime] = useState<string | null>(null)
  const [checkOutTime, setCheckOutTime] = useState<string | null>(null)
  const [attStatus, setAttStatus] = useState<string | null>(null)
  const [stateLoaded, setStateLoaded] = useState(false)
  const [roleNotice, setRoleNotice] = useState(false)
  const [acting, setActing] = useState(false)
  const [now, setNow] = useState(new Date())

  // 实时时钟
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  // 我的考勤明细（本月统计与记录列表）
  const [records, setRecords] = useState<AttendanceRec[]>([])

  // 外勤相关
  const [trips, setTrips] = useState<Trip[]>([])
  const [showTrips, setShowTrips] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [tripDate, setTripDate] = useState(todayStr())
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const getLoc = async (): Promise<{ latitude: number; longitude: number } | null> => {
    try {
      const loc = await Taro.getLocation({ type: 'gcj02' })
      const lat = Number((loc as any).latitude ?? 0)
      const lng = Number((loc as any).longitude ?? 0)
      if (!lat || !lng) return null
      setLocation({ latitude: lat, longitude: lng })
      setLocState('ready')
      return { latitude: lat, longitude: lng }
    } catch (e) {
      setLocState('denied')
      return null
    }
  }

  const loadToday = async () => {
    setStateLoaded(false)
    try {
      const res: any = await attendanceApi.today()
      const data = res?.data ?? res
      setCheckedIn(!!data?.checked_in)
      setCheckedOut(!!data?.checked_out)
      setCheckInTime(data?.check_in_time ?? null)
      setCheckOutTime(data?.check_out_time ?? null)
      setAttStatus(data?.status ?? null)
      setRoleNotice(false)
    } catch (err: any) {
      // 非员工角色无考勤数据，静默降级
      setCheckedIn(false)
      setCheckedOut(false)
      setCheckInTime(null)
      setCheckOutTime(null)
      setAttStatus(null)
      setRoleNotice(true)
    } finally {
      setStateLoaded(true)
    }
  }

  const loadRecords = async () => {
    try {
      const res: any = await attendanceApi.myAttendance()
      const data = res?.data ?? res
      const list = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : []
      setRecords(list)
    } catch (err) {
      console.error('[Attendance] 获取考勤明细失败', err)
      setRecords([])
    }
  }

  const loadTrips = async () => {
    if (trips.length || showTrips) {
      setShowTrips((v) => !v)
      if (showTrips) return
    }
    try {
      const res: any = await attendanceApi.externalTrips()
      setTrips(pickList(res))
      setShowTrips(true)
    } catch (err) {
      Taro.showToast({ title: '外勤记录加载失败', icon: 'none' })
    }
  }

  useDidShow(async () => {
    loadFromStorage()
    if (!useAuthStore.getState().token) {
      Taro.redirectTo({ url: '/pages/login/index' })
      return
    }
    await loadToday()
    loadRecords()
    getLoc()
  })

  const doCheck = async (mode: 'in' | 'out') => {
    if (acting) return
    let loc = location
    if (!loc) loc = await getLoc()
    setActing(true)
    try {
      const payload = loc ? { lat: loc.latitude, lng: loc.longitude } : {}
      if (mode === 'in') await attendanceApi.checkIn(payload)
      else await attendanceApi.checkOut(payload)
      Taro.showToast({ title: mode === 'in' ? '上班打卡成功' : '下班打卡成功', icon: 'success' })
      await loadToday()
    } catch (err: any) {
      let msg = err?.message || '打卡失败'
      // 后端可能返回英文 detail，截断展示
      if (typeof msg === 'string' && msg.length > 60) msg = `${msg.slice(0, 60)}...`
      Taro.showToast({ title: msg, icon: 'none' })
    } finally {
      setActing(false)
    }
  }

  const submitTrip = async () => {
    if (!reason.trim()) {
      Taro.showToast({ title: '请填写外勤事由', icon: 'none' })
      return
    }
    setSubmitting(true)
    try {
      await attendanceApi.createExternalTrip({
        trip_date: tripDate,
        reason: reason.trim()
      })
      Taro.showToast({ title: '外勤申请已提交', icon: 'success' })
      setShowForm(false)
      setReason('')
    } catch (err: any) {
      Taro.showToast({ title: err?.message || '提交失败', icon: 'none' })
    } finally {
      setSubmitting(false)
    }
  }

  const locText =
    locState === 'getting'
      ? '正在获取位置...'
      : location
      ? `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`
      : locState === 'denied'
      ? '未获取到定位，请确认已授权位置权限'
      : '未获取到定位'

  const dateLabel = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 ${WEEKDAYS[now.getDay()]}`
  const clockText = `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`
  // 今日状态：优先接口 status，缺失时按打卡进度推导（不伪造）
  const todayStatus = !stateLoaded
    ? '--'
    : ATT_STATUS[attStatus || ''] || (checkedOut ? '已签退' : checkedIn ? '已签到' : '未打卡')

  // 本月考勤记录（按日期倒序，接口已倒序）
  const monthPrefix = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`
  const monthRecords = useMemo(
    () => records.filter((r) => String(r.date || '').startsWith(monthPrefix)),
    [records, monthPrefix]
  )

  // 本月统计：全部由真实考勤记录聚合（加班无后端字段，不做展示）
  const monthStats = useMemo(() => {
    const count = (s: string) => monthRecords.filter((r) => r.status === s).length
    return {
      present: count('present'),
      late: count('late'),
      leave: count('leave'),
      absent: count('absent')
    }
  }, [monthRecords])

  return (
    <View className='a-page'>
      <View className='page-container'>
        <ScrollView scrollY className='a-scroll'>
          {/* 打卡卡：日期 + 实时时钟 + 打卡按钮 + 今日状态 */}
          <View className='a-clock'>
            <View className='a-clock__date'>
              <Text className='a-clock__date-text'>{dateLabel}</Text>
            </View>
            <Text className='a-clock__time'>{clockText}</Text>

            {/* GPS 定位（保留原有定位校验逻辑） */}
            <View className='a-clock__loc'>
              <View className={`a-clock__pin ${locState === 'ready' ? 'a-clock__pin--ok' : ''}`}>
                <Text className='a-clock__pin-text'>位</Text>
              </View>
              <Text className='a-clock__loc-text'>{locText}</Text>
              {locState === 'denied' && (
                <View className='a-clock__reloc' onClick={() => getLoc()}>
                  <Text className='a-clock__reloc-text'>重新获取</Text>
                </View>
              )}
            </View>

            <View className='a-clock__btns'>
              <View
                className={`a-pbtn ${checkedIn ? 'a-pbtn--done' : 'a-pbtn--solid'}`}
                hoverClass='a-pbtn--hover'
                onClick={() => !checkedIn && doCheck('in')}
              >
                <Text className='a-pbtn__text'>
                  {acting && !checkedIn ? '打卡中...' : checkedIn ? '已上班' : '上班打卡'}
                </Text>
              </View>
              <View
                className={`a-pbtn ${checkedOut ? 'a-pbtn--done' : 'a-pbtn--ghost'}`}
                hoverClass='a-pbtn--hover'
                onClick={() => !checkedOut && checkedIn && doCheck('out')}
              >
                <Text className='a-pbtn__text'>
                  {checkedOut ? '已下班' : checkedIn ? '下班打卡' : '待上班后可下班'}
                </Text>
              </View>
            </View>

            <View className='a-clock__stats'>
              <View className='a-clock__stat'>
                <Text className='a-clock__stat-label'>上班签到</Text>
                <Text className='a-clock__stat-value'>{checkInTime || '--:--'}</Text>
              </View>
              <View className='a-clock__divider' />
              <View className='a-clock__stat'>
                <Text className='a-clock__stat-label'>下班签退</Text>
                <Text className={`a-clock__stat-value ${checkOutTime ? '' : 'a-clock__stat-value--muted'}`}>
                  {checkOutTime || '--:--'}
                </Text>
              </View>
              <View className='a-clock__divider' />
              <View className='a-clock__stat'>
                <Text className='a-clock__stat-label'>今日状态</Text>
                <Text className='a-clock__stat-value'>{todayStatus}</Text>
              </View>
            </View>
          </View>

          {roleNotice && (
            <View className='a-notice'>
              <Text className='a-notice__text'>当前账号无考勤权限，打卡功能仅对经纪与员工开放</Text>
            </View>
          )}

          {/* 本月统计（2×2，数据来自本月真实考勤记录） */}
          <View className='a-month'>
            <View className='a-month__head'>
              <Text className='a-month__title'>本月统计</Text>
              <Text className='a-month__sub'>
                {now.getFullYear()} 年 {now.getMonth() + 1} 月
              </Text>
            </View>
            <View className='a-month__grid'>
              <View className='a-month__cell'>
                <Text className='a-month__num a-month__num--success'>{monthStats.present}</Text>
                <Text className='a-month__label'>出勤 天</Text>
              </View>
              <View className='a-month__cell'>
                <Text className='a-month__num a-month__num--warning'>{monthStats.late}</Text>
                <Text className='a-month__label'>迟到 次</Text>
              </View>
              <View className='a-month__cell'>
                <Text className='a-month__num a-month__num--info'>{monthStats.leave}</Text>
                <Text className='a-month__label'>请假 天</Text>
              </View>
              <View className='a-month__cell'>
                <Text className='a-month__num a-month__num--error'>{monthStats.absent}</Text>
                <Text className='a-month__label'>缺勤 天</Text>
              </View>
            </View>
          </View>

          {/* 考勤记录（本月） */}
          <View className='a-rec'>
            <View className='a-rec__head'>
              <Text className='a-rec__title'>考勤记录</Text>
            </View>
            {monthRecords.length === 0 ? (
              <View className='a-rec__empty'>
                <Text className='a-rec__empty-text'>本月暂无考勤记录</Text>
              </View>
            ) : (
              monthRecords.map((r) => {
                const day = String(r.date || '').slice(8, 10)
                const mon = String(r.date || '').slice(5, 7)
                const stLabel = ATT_STATUS[r.status || ''] || r.status || '-'
                const stCls = ATT_BADGE[r.status || ''] || 'a-badge--neutral'
                const inT = hhmm(r.check_in_time)
                const outT = hhmm(r.check_out_time)
                return (
                  <View key={r.id} className='a-rec__item'>
                    <View className='a-rec__date'>
                      <Text className='a-rec__date-mon'>{mon}月</Text>
                      <Text className='a-rec__date-day'>{day}</Text>
                    </View>
                    <View className='a-rec__body'>
                      <Text className='a-rec__times'>
                        上班 {inT || '--:--'} · 下班 {outT || '--:--'}
                      </Text>
                      {r.notes ? <Text className='a-rec__note'>{r.notes}</Text> : null}
                    </View>
                    <View className={`a-badge ${stCls}`}>
                      <Text>{stLabel}</Text>
                    </View>
                  </View>
                )
              })
            )}
          </View>

          {/* 外勤管理 */}
          <View className='a-trip'>
            <View className='a-trip__bar'>
              <Text className='a-trip__title'>外勤 / 出差申请</Text>
              <View className='a-trip__acts'>
                <Text className='a-trip__link' onClick={loadTrips}>
                  我的记录{showTrips ? ' ▲' : ' ▼'}
                </Text>
                <Text className='a-trip__link a-trip__link--primary' onClick={() => setShowForm((v) => !v)}>
                  新建申请
                </Text>
              </View>
            </View>

            {showForm && (
              <View className='a-form'>
                <View className='a-form__row'>
                  <Text className='a-form__label'>日期</Text>
                  <Picker
                    mode='date'
                    value={tripDate}
                    onChange={(e: any) => setTripDate(e.detail.value)}
                  >
                    <View className='a-form__value'>
                      <Text className='a-form__text'>{tripDate}</Text>
                    </View>
                  </Picker>
                </View>
                <View className='a-form__row a-form__row--col'>
                  <Text className='a-form__label'>事由</Text>
                  <Input
                    className='a-form__input'
                    value={reason}
                    placeholder='请填写外出或外勤事由'
                    onInput={(e: any) => setReason(e.detail.value)}
                  />
                </View>
                <View className='a-form__submit' onClick={submitTrip}>
                  <Text className='a-form__submit-text'>
                    {submitting ? '提交中...' : '提交申请'}
                  </Text>
                </View>
              </View>
            )}

            {showTrips && (
              <View className='a-trips'>
                {trips.length === 0 ? (
                  <View className='a-trips__empty'>
                    <Text className='a-trips__empty-text'>暂无外勤记录</Text>
                  </View>
                ) : (
                  trips.map((t) => {
                    const st = TRIP_STATUS[t.status || ''] || {
                      label: t.status || '-',
                      cls: 'a-badge--neutral'
                    }
                    return (
                      <View key={t.id} className='a-trips__item'>
                        <View className='a-trips__top'>
                          <Text className='a-trips__date'>{t.trip_date || '-'}</Text>
                          <View className={`a-badge ${st.cls}`}>
                            <Text>{st.label}</Text>
                          </View>
                        </View>
                        <Text className='a-trips__reason'>{t.reason || '未填事由'}</Text>
                        {t.reply_note && <Text className='a-trips__reply'>答复：{t.reply_note}</Text>}
                      </View>
                    )
                  })
                )}
              </View>
            )}
          </View>

          {/* 规则提示 */}
          <View className='a-rule'>
            <Text className='a-rule__title'>打卡规则</Text>
            <Text className='a-rule__item'>· 需授权位置权限，系统会校验是否在打卡范围内</Text>
            <Text className='a-rule__item'>· 超出打卡范围时，先提交外勤申请并等审批通过</Text>
            <Text className='a-rule__item'>· 上班后再打卡下班，全天仅各一次</Text>
          </View>
        </ScrollView>
      </View>

      <BottomNav role='employee' active='attendance' />
    </View>
  )
}