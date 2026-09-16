import { useMemo, useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { paymentsApi, leasesApi, viewingsApi, propertiesApi } from '@/services/api'
import { ICONS, IconKey } from '@/utils/icons'
import './index.scss'

interface Viewing {
  id: string
  scheduled_at?: string
  visitor_name?: string | null
  property_id?: string | null
  property_title?: string | null
  property_address?: string | null
  status?: string
}

interface Payment {
  id: string
  lease_id?: string | null
  property_id?: string | null
  amount?: number
  currency?: string
  payment_type?: string
  status?: string
  due_date?: string | null
}

interface Lease {
  id: string
  property_id?: string | null
  start_date?: string
  end_date?: string
  monthly_rent?: number
  currency?: string
  status?: string
}

// 今日待跟进条目
interface TodayItem {
  key: string
  icon: IconKey
  tone: 'warning' | 'error' | 'info'
  title: string
  badge: string
  sub: string
  action: string
  /** 跳转目标；缺省表示原型中该按钮为占位，点击提示未开放 */
  url?: string
}

// 月历/列表中的日程条目
interface AgendaItem {
  key: string
  dateKey: string
  type: 'view' | 'rent' | 'contract'
  chip: string
  title: string
  sub: string
}

const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

const pad2 = (n: number) => String(n).padStart(2, '0')
const dayKey = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const fmtMD = (d: Date) => `${d.getMonth() + 1}月${d.getDate()}日`
const parseDate = (v?: string | null): Date | null => {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}
const hhmm = (v?: string | null) => {
  const d = parseDate(v)
  return d ? `${pad2(d.getHours())}:${pad2(d.getMinutes())}` : ''
}
// 相差天数（按自然日）
const dayDiff = (from: Date, to: Date) =>
  Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86400000)

const fmtMoney = (v?: number, currency?: string) => {
  const sym: Record<string, string> = { CNY: '¥', THB: '', USD: '$', EUR: '€' }
  return `${sym[currency || 'THB'] || '฿'}${Number(v || 0).toLocaleString()}`
}

function pickList(res: any): any[] {
  if (Array.isArray(res)) return res
  if (Array.isArray(res?.items)) return res.items
  if (Array.isArray(res?.data)) return res.data
  if (Array.isArray(res?.data?.items)) return res.data.items
  return []
}

const pick = (res: any): any => res?.data ?? res

export default function EmployeeCalendarPage() {
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)
  const [viewings, setViewings] = useState<Viewing[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [leases, setLeases] = useState<Lease[]>([])
  const [propMap, setPropMap] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(false)
  // 当前查看的月份（取该月 1 日）
  const today = startOfDay(new Date())
  const [cursor, setCursor] = useState<Date>(new Date(today.getFullYear(), today.getMonth(), 1))
  const [tab, setTab] = useState<'month' | 'list'>('month')

  const fetchAll = async () => {
    setLoading(true)
    try {
      const [vwRes, pmRes, lsRes, ppRes]: any[] = await Promise.all([
        viewingsApi.list({ page_size: 100 }).catch(() => ({ data: [] })),
        paymentsApi.list({ page: 1, page_size: 100 }).catch(() => ({ data: [] })),
        leasesApi.list({ page: 1, page_size: 100 }).catch(() => ({ data: [] })),
        propertiesApi.list({ page: 1, page_size: 100 }).catch(() => ({ data: [] }))
      ])
      setViewings(pickList(vwRes))
      setPayments(pickList(pmRes))
      setLeases(pickList(lsRes))
      const map: Record<string, any> = {}
      pickList(ppRes).forEach((p: any) => {
        map[String(p.id)] = p
      })
      setPropMap(map)
    } catch (error) {
      console.error('[Calendar] 加载失败', error)
      Taro.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  useDidShow(() => {
    loadFromStorage()
    if (!useAuthStore.getState().token) {
      Taro.redirectTo({ url: '/pages/login/index' })
      return
    }
    fetchAll()
  })

  // 房源名：优先取带看接口自带标题，其次按 property_id 反查
  const propNameOf = (propertyId?: string | null, fallback?: string | null) => {
    if (fallback) return fallback
    const p = propMap[String(propertyId || '')]
    if (!p) return '房源信息不可用'
    return p.room_number || p.address || '未命名房源'
  }

  // 租金收款（未收讫）——催收口径
  const rentPayments = useMemo(
    () => payments.filter((p) => p.payment_type === 'rent' && p.due_date),
    [payments]
  )
  const unpaidRent = useMemo(
    () => rentPayments.filter((p) => p.status !== 'succeeded' && p.status !== 'refunded'),
    [rentPayments]
  )

  // 本月租金到期 / 已收率
  const monthRent = useMemo(() => {
    const y = cursor.getFullYear()
    const m = cursor.getMonth()
    return rentPayments.filter((p) => {
      const d = parseDate(p.due_date)
      return d && d.getFullYear() === y && d.getMonth() === m
    })
  }, [rentPayments, cursor])

  const paidCount = monthRent.filter((p) => p.status === 'succeeded').length
  const paidRate = monthRent.length ? Math.round((paidCount / monthRent.length) * 100) : 0

  // 本月合同到期 / 下月到期预告
  const monthLeaseEnd = useMemo(() => {
    const y = cursor.getFullYear()
    const m = cursor.getMonth()
    return leases
      .filter((l) => {
        const d = parseDate(l.end_date)
        return d && d.getFullYear() === y && d.getMonth() === m
      })
      .sort((a, b) => String(a.end_date).localeCompare(String(b.end_date)))
  }, [leases, cursor])

  const nextMonthLeaseEnd = useMemo(() => {
    const n = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
    return leases
      .filter((l) => {
        const d = parseDate(l.end_date)
        return d && d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth()
      })
      .sort((a, b) => String(a.end_date).localeCompare(String(b.end_date)))
      .slice(0, 3)
  }, [leases, cursor])

  // 今日带看 / 近期带看
  const todayViewings = useMemo(
    () =>
      viewings
        .filter((v) => {
          const d = parseDate(v.scheduled_at)
          return d && dayKey(d) === dayKey(today)
        })
        .sort((a, b) => String(a.scheduled_at).localeCompare(String(b.scheduled_at))),
    [viewings, today]
  )

  const upcomingViewings = useMemo(
    () =>
      viewings
        .filter((v) => {
          const d = parseDate(v.scheduled_at)
          return d && startOfDay(d).getTime() >= today.getTime()
        })
        .sort((a, b) => String(a.scheduled_at).localeCompare(String(b.scheduled_at)))
        .slice(0, 3),
    [viewings, today]
  )

  // 今日待跟进：租金催收（逾期或 15 天内到期）+ 合同到期（60 天内）+ 今日带看
  const todayItems = useMemo<TodayItem[]>(() => {
    const items: TodayItem[] = []

    unpaidRent
      .map((p) => ({ p, d: parseDate(p.due_date) as Date }))
      .filter(({ d }) => dayDiff(today, d) <= 15)
      .sort((a, b) => a.d.getTime() - b.d.getTime())
      .slice(0, 2)
      .forEach(({ p, d }) => {
        const diff = dayDiff(today, d)
        items.push({
          key: `rent-${p.id}`,
          icon: 'money',
          tone: diff < 0 ? 'error' : 'warning',
          title: '租金催收',
          badge: diff < 0 ? `已逾期 ${Math.abs(diff)} 天` : `剩 ${diff} 天`,
          sub: `${propNameOf(p.property_id)} · ${fmtMD(d)}到期 · ${fmtMoney(p.amount, p.currency)}`,
          action: '去催收',
          // 员工端暂无收款页，跳消息列表联系租客
          url: '/pages/chat/list/index'
        })
      })

    leases
      .map((l) => ({ l, d: parseDate(l.end_date) as Date }))
      .filter(({ d }) => d && dayDiff(today, d) >= 0 && dayDiff(today, d) <= 60)
      .sort((a, b) => a.d.getTime() - b.d.getTime())
      .slice(0, 2)
      .forEach(({ l, d }) => {
        items.push({
          key: `lease-${l.id}`,
          icon: 'doc',
          tone: 'error',
          title: '合同到期提醒',
          badge: `${dayDiff(today, d)} 天后`,
          sub: `${propNameOf(l.property_id)} · ${fmtMD(d)}到期 · 需提前续约沟通`,
          action: '续约沟通'
        })
      })

    todayViewings.slice(0, 2).forEach((v) => {
      items.push({
        key: `view-${v.id}`,
        icon: 'calendar',
        tone: 'info',
        title: '带看安排',
        badge: `今日 ${hhmm(v.scheduled_at)}`,
        sub: `${hhmm(v.scheduled_at)} ${v.visitor_name || '客户'}看房 · ${propNameOf(
          v.property_id,
          v.property_title || v.property_address
        )}`,
        action: '查看行程'
      })
    })

    return items
  }, [unpaidRent, leases, todayViewings, propMap, today])

  // 月历网格：周一起始
  const grid = useMemo(() => {
    const y = cursor.getFullYear()
    const m = cursor.getMonth()
    const first = new Date(y, m, 1)
    const offset = (first.getDay() + 6) % 7
    const daysInMonth = new Date(y, m + 1, 0).getDate()
    const cells: { key: string; day: number; muted: boolean; isToday: boolean; chips: string[] }[] = []

    const chipsOf = (key: string) => {
      const chips: string[] = []
      const vs = viewings.filter((v) => {
        const d = parseDate(v.scheduled_at)
        return d && dayKey(d) === key
      })
      if (vs.length) chips.push(vs.length > 1 ? `带看 ×${vs.length}` : `带看 ${hhmm(vs[0].scheduled_at)}`)
      const rents = unpaidRent.filter((p) => {
        const d = parseDate(p.due_date)
        return d && dayKey(d) === key
      })
      if (rents.length) chips.push(`租 ×${rents.length}`)
      const ends = leases.filter((l) => {
        const d = parseDate(l.end_date)
        return d && dayKey(d) === key
      })
      if (ends.length) chips.push(`合 ×${ends.length}`)
      return chips.slice(0, 2)
    }

    for (let i = 0; i < offset; i += 1) {
      const d = new Date(y, m, i - offset + 1)
      cells.push({ key: dayKey(d), day: d.getDate(), muted: true, isToday: false, chips: [] })
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      const d = new Date(y, m, day)
      const key = dayKey(d)
      cells.push({
        key,
        day,
        muted: false,
        isToday: key === dayKey(today),
        chips: chipsOf(key)
      })
    }
    // 补齐到整周
    while (cells.length % 7 !== 0) {
      const d = new Date(y, m + 1, cells.length - offset - daysInMonth + 1)
      cells.push({ key: dayKey(d), day: d.getDate(), muted: true, isToday: false, chips: [] })
    }
    return cells
  }, [cursor, viewings, unpaidRent, leases, today])

  // 列表视图：本月全部日程
  const agenda = useMemo<AgendaItem[]>(() => {
    const y = cursor.getFullYear()
    const m = cursor.getMonth()
    const inMonth = (d: Date | null) => !!d && d.getFullYear() === y && d.getMonth() === m
    const items: AgendaItem[] = []

    viewings.forEach((v) => {
      const d = parseDate(v.scheduled_at)
      if (!inMonth(d)) return
      items.push({
        key: `v-${v.id}`,
        dateKey: dayKey(d as Date),
        type: 'view',
        chip: '带看',
        title: `${hhmm(v.scheduled_at)} ${v.visitor_name || '客户'}看房 · ${propNameOf(
          v.property_id,
          v.property_title || v.property_address
        )}`,
        sub: `${fmtMD(d as Date)} ${WEEKDAYS[(d as Date).getDay() === 0 ? 6 : (d as Date).getDay() - 1]}`
      })
    })
    unpaidRent.forEach((p) => {
      const d = parseDate(p.due_date)
      if (!inMonth(d)) return
      items.push({
        key: `r-${p.id}`,
        dateKey: dayKey(d as Date),
        type: 'rent',
        chip: '催收',
        title: `租金催收：${propNameOf(p.property_id)}`,
        sub: `${fmtMD(d as Date)} 到期 · ${fmtMoney(p.amount, p.currency)}`
      })
    })
    leases.forEach((l) => {
      const d = parseDate(l.end_date)
      if (!inMonth(d)) return
      items.push({
        key: `c-${l.id}`,
        dateKey: dayKey(d as Date),
        type: 'contract',
        chip: '合同',
        title: `续约沟通：${propNameOf(l.property_id)}`,
        sub: `${fmtMD(d as Date)} 到期 · 月租 ${fmtMoney(l.monthly_rent, l.currency)}`
      })
    })

    return items.sort((a, b) => a.dateKey.localeCompare(b.dateKey))
  }, [cursor, viewings, unpaidRent, leases, propMap])

  const monthLabel = `${cursor.getFullYear()} 年 ${cursor.getMonth() + 1} 月`
  const shiftMonth = (step: number) => {
    const next = new Date(cursor.getFullYear(), cursor.getMonth() + step, 1)
    setCursor(next)
  }

  const todayBadge = `${today.getMonth() + 1}月${today.getDate()}日 ${
    WEEKDAYS[today.getDay() === 0 ? 6 : today.getDay() - 1]
  }`

  const go = (url: string) => {
    Taro.navigateTo({ url })
  }

  return (
    <View className='cal-page'>
      <View className='page-container'>
        {/* 今日待跟进 */}
        <View className='cal-card cal-card--accent'>
          <View className='cal-card__head'>
            <View className='cal-card__head-left'>
              <Text className='cal-card__title'>今日待跟进</Text>
              <View className='cal-badge cal-badge--warning'>
                <Text>{todayItems.length} 项</Text>
              </View>
            </View>
            <View className='cal-badge cal-badge--primary'>
              <Text>{todayBadge}</Text>
            </View>
          </View>

          {todayItems.length === 0 ? (
            <View className='cal-empty'>
              <Text>{loading ? '正在加载...' : '今日暂无待跟进事项'}</Text>
            </View>
          ) : (
            todayItems.map((it) => (
              <View key={it.key} className='cal-today-item'>
                <View className={`cal-today-item__icon cal-today-item__icon--${it.tone}`}>
                  <View
                    className='icon-svg icon-svg--sm'
                    style={{ backgroundImage: `url("${ICONS[it.icon]}")` }}
                  />
                </View>
                <View className='cal-today-item__body'>
                  <View className='cal-today-item__top'>
                    <Text className='cal-today-item__name'>{it.title}</Text>
                    <View className={`cal-badge cal-badge--${it.tone}`}>
                      <Text>{it.badge}</Text>
                    </View>
                  </View>
                  <Text className='cal-today-item__sub'>{it.sub}</Text>
                </View>
                <View
                  className={`cal-btn cal-btn--${it.tone === 'info' ? 'ghost' : 'primary'}`}
                  onClick={() =>
                    it.url
                      ? go(it.url)
                      : Taro.showToast({ title: `「${it.action}」暂未开放`, icon: 'none' })
                  }
                >
                  <Text>{it.action}</Text>
                </View>
              </View>
            ))
          )}
        </View>

        {/* 月历卡片 */}
        <View className='cal-card'>
          <View className='cal-card__head'>
            <View className='cal-nav'>
              <View className='cal-nav__btn' onClick={() => shiftMonth(-1)}>
                <Text>‹</Text>
              </View>
              <Text className='cal-nav__title'>{monthLabel}</Text>
              <View className='cal-nav__btn' onClick={() => shiftMonth(1)}>
                <Text>›</Text>
              </View>
            </View>
            <View className='cal-tabs'>
              <View
                className={`cal-tabs__btn ${tab === 'month' ? 'cal-tabs__btn--active' : ''}`}
                onClick={() => setTab('month')}
              >
                <Text>月视图</Text>
              </View>
              <View
                className={`cal-tabs__btn ${tab === 'list' ? 'cal-tabs__btn--active' : ''}`}
                onClick={() => setTab('list')}
              >
                <Text>列表</Text>
              </View>
            </View>
          </View>

          {tab === 'month' ? (
            <View className='cal-body'>
              <View className='cal-grid'>
                {WEEKDAYS.map((w) => (
                  <View key={w} className='cal-weekday'>
                    <Text>{w}</Text>
                  </View>
                ))}
                {grid.map((c) => (
                  <View
                    key={c.key}
                    className={`cal-cell ${c.muted ? 'cal-cell--muted' : ''} ${
                      c.isToday ? 'cal-cell--today' : ''
                    }`}
                  >
                    <Text className='cal-cell__num'>{c.day}</Text>
                    {c.chips.map((chip) => (
                      <View key={chip} className={`cal-chip cal-chip--${chipType(chip)}`}>
                        <Text>{chip}</Text>
                      </View>
                    ))}
                  </View>
                ))}
              </View>
              <View className='cal-legend'>
                <View className='cal-legend__item'>
                  <View className='cal-dot cal-dot--rent' />
                  <Text>租金到期</Text>
                </View>
                <View className='cal-legend__item'>
                  <View className='cal-dot cal-dot--contract' />
                  <Text>合同到期</Text>
                </View>
                <View className='cal-legend__item'>
                  <View className='cal-dot cal-dot--view' />
                  <Text>带看 / 催收</Text>
                </View>
              </View>
            </View>
          ) : (
            <View className='cal-body'>
              {agenda.length === 0 ? (
                <View className='cal-empty'>
                  <Text>{loading ? '正在加载...' : '本月暂无日程'}</Text>
                </View>
              ) : (
                agenda.map((a) => (
                  <View key={a.key} className='cal-list-item'>
                    <View className={`cal-chip cal-chip--${a.type}`}>
                      <Text>{a.chip}</Text>
                    </View>
                    <View className='cal-list-item__body'>
                      <Text className='cal-list-item__title'>{a.title}</Text>
                      <Text className='cal-list-item__sub'>{a.sub}</Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          )}
        </View>

        {/* 问候行（渐变） */}
        <View className='cal-hero'>
          <View className='cal-hero__main'>
            <Text className='cal-hero__title'>日历提醒</Text>
            <Text className='cal-hero__sub'>
              {cursor.getFullYear()} 年 {cursor.getMonth() + 1} 月 · 今日 {todayItems.length} 项待跟进 ·
              本月租金到期 {monthRent.length} 户
            </Text>
          </View>
          <View className='cal-hero__avatar'>
            <Text className='cal-hero__avatar-text'>员</Text>
          </View>
        </View>

        {/* 本月重点 */}
        <Text className='cal-section-title'>本月重点</Text>
        <View className='cal-card cal-card--flush'>
          <View className='cal-strip'>
            <View className='cal-stat'>
              <Text className='cal-stat__value'>
                {monthRent.length}
                <Text className='cal-stat__unit'> 户</Text>
              </Text>
              <Text className='cal-stat__label'>本月租金到期</Text>
              <Text className='cal-stat__sub'>
                已收 {paidCount} · 待收 {monthRent.length - paidCount}
              </Text>
            </View>
            <View className='cal-stat'>
              <Text className='cal-stat__value'>{paidRate}%</Text>
              <Text className='cal-stat__label'>已收率</Text>
              <Text className='cal-stat__sub'>本月租金收款进度</Text>
            </View>
            <View className='cal-stat'>
              <Text className='cal-stat__value'>
                {monthLeaseEnd.length}
                <Text className='cal-stat__unit'> 份</Text>
              </Text>
              <Text className='cal-stat__label'>本月合同到期</Text>
              <Text className='cal-stat__sub'>下月预告 {nextMonthLeaseEnd.length} 份</Text>
            </View>
          </View>
          <View className='cal-progress'>
            <View className='cal-progress__bar' style={{ width: `${paidRate}%` }} />
          </View>
          <Text className='cal-progress__note'>
            本月租金已收率 {paidRate}% · 待收 {monthRent.length - paidCount} 户
          </Text>
        </View>

        {/* 下月到期预告 */}
        <Text className='cal-section-title'>
          下月到期预告
          <Text className='cal-section-title__badge'> {nextMonthLeaseEnd.length} 份</Text>
        </Text>
        <View className='cal-card cal-card--list'>
          {nextMonthLeaseEnd.length === 0 ? (
            <View className='cal-empty'>
              <Text>暂无下月到期合同</Text>
            </View>
          ) : (
            nextMonthLeaseEnd.map((l) => {
              const d = parseDate(l.end_date) as Date
              return (
                <View key={l.id} className='cal-row'>
                  <View className='cal-row__body'>
                    <Text className='cal-row__title'>{propNameOf(l.property_id)}</Text>
                    <Text className='cal-row__sub'>{fmtMD(d)} 到期 · 建议提前续约沟通</Text>
                  </View>
                  <View className='cal-badge cal-badge--error'>
                    <Text>{dayDiff(today, d)} 天后</Text>
                  </View>
                </View>
              )
            })
          )}
        </View>

        {/* 近期带看 */}
        <Text className='cal-section-title'>近期带看</Text>
        <View className='cal-card cal-card--list'>
          {upcomingViewings.length === 0 ? (
            <View className='cal-empty'>
              <Text>暂无待进行的带看</Text>
            </View>
          ) : (
            upcomingViewings.map((v) => {
              const d = parseDate(v.scheduled_at) as Date
              const isToday = dayKey(d) === dayKey(today)
              return (
                <View key={v.id} className='cal-row'>
                  <View className='cal-row__body'>
                    <View className='cal-row__top'>
                      <Text className='cal-row__title'>
                        {isToday ? '今日' : `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`}{' '}
                        {hhmm(v.scheduled_at)} · {v.visitor_name || '客户'}
                      </Text>
                      {isToday ? (
                        <View className='cal-badge cal-badge--info'>
                          <Text>待开始</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text className='cal-row__sub'>
                      {propNameOf(v.property_id, v.property_title || v.property_address)}
                    </Text>
                  </View>
                </View>
              )
            })
          )}
        </View>
      </View>
    </View>
  )
}

// 月历 chips 样式：按文案前缀判定类型
function chipType(chip: string) {
  if (chip.startsWith('租')) return 'rent'
  if (chip.startsWith('合')) return 'contract'
  return 'view'
}