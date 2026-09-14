import { useState } from 'react'
import { View, Text, ScrollView, Input, Picker } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { attendanceApi } from '@/services/api'
import './index.scss'

interface Trip {
  id: string
  trip_date?: string
  to_location?: string
  reason?: string
  status?: string
  reply_note?: string | null
}

const TRIP_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: '待审批', cls: 'a-badge--warning' },
  approved: { label: '已通过', cls: 'a-badge--success' },
  rejected: { label: '已驳回', cls: 'a-badge--error' }
}

const todayStr = () => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

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
  const [stateLoaded, setStateLoaded] = useState(false)
  const [roleNotice, setRoleNotice] = useState(false)
  const [acting, setActing] = useState(false)

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
      setRoleNotice(false)
    } catch (err: any) {
      // 非员工角色无考勤数据，静默降级
      setCheckedIn(false)
      setCheckedOut(false)
      setRoleNotice(true)
    } finally {
      setStateLoaded(true)
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

  return (
    <View className='a-page'>
      <View className='page-container'>
        <ScrollView scrollY className='a-scroll'>
          {/* 定位卡片 */}
          <View className='a-loc'>
            <View className={`a-loc__pin ${locState === 'ready' ? 'a-loc__pin--ok' : ''}`}>
              <Text className='a-loc__pin-text'>位</Text>
            </View>
            <Text className='a-loc__title'>GPS 定位打卡</Text>
            <Text className='a-loc__coords'>{locText}</Text>
            {locState === 'denied' && (
              <View className='a-loc__open' onClick={() => getLoc()}>
                <Text className='a-loc__open-text'>重新获取定位</Text>
              </View>
            )}
          </View>

          {roleNotice && (
            <View className='a-notice'>
              <Text className='a-notice__text'>当前账号无考勤权限，打卡功能仅对经纪与员工开放</Text>
            </View>
          )}

          {/* 打卡按钮 */}
          <View className='a-punch'>
            <View
              className={`a-btn ${checkedIn ? 'a-btn--done' : 'a-btn--primary'}`}
              onClick={() => !checkedIn && doCheck('in')}
            >
              <Text className='a-btn__text'>
                {acting && !checkedIn ? '打卡中...' : checkedIn ? '已上班' : '上班打卡'}
              </Text>
            </View>
            <View
              className={`a-btn ${checkedOut ? 'a-btn--done' : 'a-btn--ghost'}`}
              onClick={() => !checkedOut && checkedIn && doCheck('out')}
            >
              <Text className='a-btn__text'>
                {checkedOut ? '已下班' : checkedIn ? '下班打卡' : '待上班后可下班'}
              </Text>
            </View>
          </View>

          {stateLoaded && (
            <View className='a-status'>
              <Text className='a-status__label'>
                {checkedOut
                  ? '今日考勤已完成'
                  : checkedIn
                  ? '已上班，等待下班打卡'
                  : '今日尚未打卡'}
              </Text>
            </View>
          )}

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
    </View>
  )
}