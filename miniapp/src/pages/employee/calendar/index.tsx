import { useMemo, useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { employeesApi, viewingsApi, leasesApi, propertiesApi } from '@/services/api'
import './index.scss'

/* =========================================================
   员工端 日历/日程排期（对齐 App CalendarScreen）
   月历视图 + 列表视图 ｜ 今日待跟进 ｜ 本月重点 ｜ 下月到期预告 ｜ 近期带看
   事件来源：带看 viewingsApi / 租金应收 employeesApi.workbench / 合同 leasesApi
   ========================================================= */

type EventKind = 'viewing' | 'rent' | 'contract'

interface CalEvent {
  id: string
  kind: EventKind
  title: string
  sub: string
  date: Date
  timeLabel?: string
  statusLabel?: string
}

const KIND_META: Record<EventKind, { label: string; color: string; bg: string }> = {
  viewing: { label: '带看', color: 'var(--primary)', bg: 'rgba(var(--primary-rgb), 0.12)' },
  rent: { label: '租金', color: 'var(--warning)', bg: 'rgba(var(--warning-rgb), 0.12)' },
  contract: { label: '合同', color: 'var(--info, #0ea5e9)', bg: 'rgba(14, 165, 233, 0.12)' }
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']
const MONTH_NAMES = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']

const pad = (n: number) => String(n).padStart(2, '0')
const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const dateLabel = (d: Date) => `${d.getMonth() + 1}月${d.getDate()}日`
const hhmm = (iso?: string | null) => {
  if (!iso) return '--:--'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '--:--' : `${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const symOf = (c?: string | null) => (c === 'USD' ? '$' : c === 'CNY' ? '¥' : c === 'MYR' ? 'RM ' : '฿')

interface ViewingItem {
  id: string
  property_title?: string | null
  property_address?: string | null
  scheduled_at?: string | null
  visitor_name?: string | null
  status?: string | null
}

interface LeaseItem {
  id: string
  property_id?: string | null
  agent_id?: string | null
  monthly_rent?: number
  currency?: string | null
  end_date?: string | null
  status?: string | null
}

interface ReceivableItem {
  payment_id: string
  amount?: number
  currency?: string | null
  due_date?: string | null
  is_overdue?: boolean
}

function pickList(res: any): any[] {
  if (Array.isArray(res)) return res
  if (Array.isArray(res?.items)) return res.items
  if (Array.isArray(res?.data)) return res.data
  if (Array.isArray(res?.data?.items)) return res.data.items
  return []
}

// 生成月历日期（含上下月补位）
const generateMonthDays = (year: number, month: number) => {
  const firstDay = new Date(year, month, 1)
  const startWeekday = firstDay.getDay()
  const totalDays = new Date(year, month + 1, 0).getDate()
  const today = new Date()
  const days: { date: Date; day: number; isCurrentMonth: boolean; isToday: boolean }[] = []

  const prevMonthLast = new Date(year, month, 0).getDate()
  for (let i = startWeekday - 1; i >= 0; i--) {
    days.push({
      date: new Date(year, month - 1, prevMonthLast - i),
      day: prevMonthLast - i,
      isCurrentMonth: false,
      isToday: false
    })
  }
  for (let i = 1; i <= totalDays; i++) {
    const d = new Date(year, month, i)
    days.push({
      date: d,
      day: i,
      isCurrentMonth: true,
      isToday:
        d.getFullYear() === today.getFullYear() &&
        d.getMonth() === today.getMonth() &&
        d.getDate() === today.getDate()
    })
  }
  const remaining = 42 - days.length
  for (let i = 1; i <= remaining; i++) {
    days.push({ date: new Date(year, month + 1, i), day: i, isCurrentMonth: false, isToday: false })
  }
  return days
}

export default function EmployeeCalendarPage() {
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)
  const now = new Date()
  const [currentYear, setCurrentYear] = useState(now.getFullYear())
  const [currentMonth, setCurrentMonth] = useState(now.getMonth())
  const [selectedDate, setSelectedDate] = useState<Date>(now)
  const [viewMode, setViewMode] = useState<'month' | 'list'>('month')

  const [viewings, setViewings] = useState<ViewingItem[]>([])
  const [leases, setLeases] = useState<LeaseItem[]>([])
  const [receivables, setReceivables] = useState<ReceivableItem[]>([])
  const [propNames, setPropNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const [meRes, vwRes, lsRes, wbRes, pvRes]: any[] = await Promise.all([
        employeesApi.me().catch(() => ({ data: {} })),
        viewingsApi.list({ page_size: 100 }).catch(() => ({ data: { items: [] } })),
        leasesApi.list({ page: 1, page_size: 100 }).catch(() => ({ data: { items: [] } })),
        employeesApi.workbench().catch(() => ({ data: {} })),
        propertiesApi.list({ page: 1, page_size: 100 }).catch(() => ({ data: { items: [] } }))
      ])

      const pv = pickList(pvRes)
      const pMap: Record<string, string> = {}
      pv.forEach((p: any) => {
        if (p?.id) pMap[p.id] = p.room_number || p.address || ''
      })
      setPropNames(pMap)

      setViewings(pickList(vwRes) as ViewingItem[])

      // 仅保留当前员工负责的租约（对齐 App：lease.agent_id === 我的 id）
      const myId: any = meRes?.data?.id ?? meRes?.id
      const ls = pickList(lsRes) as LeaseItem[]
      const mine = myId ? ls.filter((l) => l.agent_id === myId) : ls
      setLeases(mine)

      // 租金应收：workbench.receivables 的 pending + overdue
      const wb = wbRes?.data ?? wbRes ?? {}
      const recv = wb?.receivables ?? {}
      const pending: ReceivableItem[] = recv?.pending ?? []
      const overdue: ReceivableItem[] = recv?.overdue ?? []
      setReceivables([...pending, ...overdue])
    } catch (e) {
      console.error('[EmployeeCalendar] 加载失败', e)
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
    load()
  })

  const today = useMemo(() => new Date(), [])

  const leaseName = (l: LeaseItem) => {
    const fromMap = l.property_id ? propNames[l.property_id] : ''
    return fromMap || (l.property_id ? `房源 ${String(l.property_id).slice(0, 6)}` : '房源')
  }

  // 全部日程事件（带看 / 租金到期 / 合同到期）
  const events = useMemo<CalEvent[]>(() => {
    const list: CalEvent[] = []

    viewings.forEach((v) => {
      if (!v.scheduled_at) return
      const d = new Date(v.scheduled_at)
      if (Number.isNaN(d.getTime())) return
      list.push({
        id: `viewing-${v.id}`,
        kind: 'viewing',
        title: `${v.visitor_name || '待定客户'} 看房`,
        sub: v.property_title || v.property_address || '房源',
        date: d,
        timeLabel: hhmm(v.scheduled_at),
        statusLabel: v.status || undefined
      })
    })

    receivables.forEach((r) => {
      if (!r.due_date) return
      const d = new Date(r.due_date)
      if (Number.isNaN(d.getTime())) return
      list.push({
        id: `rent-${r.payment_id}`,
        kind: 'rent',
        title: r.is_overdue ? '租金催收' : '租金到期',
        sub: `${symOf(r.currency)}${Number(r.amount || 0).toLocaleString()} · ${dateLabel(d)}到期`,
        date: d,
        statusLabel: r.is_overdue ? '已逾期' : '待收'
      })
    })

    leases.forEach((l) => {
      if (!l.end_date) return
      const d = new Date(l.end_date)
      if (Number.isNaN(d.getTime())) return
      const days = Math.ceil((d.getTime() - today.getTime()) / 86400000)
      list.push({
        id: `contract-${l.id}`,
        kind: 'contract',
        title: '合同到期提醒',
        sub: `${leaseName(l)} · ${dateLabel(d)}到期${days >= 0 ? `（剩 ${days} 天）` : `（已过期 ${-days} 天）`}`,
        date: d,
        statusLabel: days >= 0 ? `${days} 天后` : '已到期'
      })
    })

    return list.sort((a, b) => a.date.getTime() - b.date.getTime())
  }, [viewings, receivables, leases, propNames, today])

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalEvent[]> = {}
    events.forEach((e) => {
      const k = keyOf(e.date)
      if (!map[k]) map[k] = []
      map[k].push(e)
    })
    return map
  }, [events])

  // 今日待跟进（逾期/7 日内到期/今日带看）
  const todayFollowUps = useMemo(() => {
    const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
    const dayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59).getTime()
    const weekLater = dayEnd + 7 * 86400000
    return events.filter((e) => {
      const t = e.date.getTime()
      if (e.kind === 'viewing') return t <= dayEnd && t >= dayStart
      return t <= weekLater
    })
  }, [events, today])

  // 本月 / 下月合同到期
  const stats = useMemo(() => {
    const pending = receivables.filter((r) => !r.is_overdue).length
    const overdue = receivables.filter((r) => r.is_overdue).length
    const total = pending + overdue
    const onTimeRate = total > 0 ? Math.round(((total - overdue) / total) * 100) : 0
    const inMonth = (d: Date, y: number, m: number) =>
      d.getFullYear() === y && d.getMonth() === m
    const contractsThisMonth = leases.filter((l) => l.end_date && inMonth(new Date(l.end_date), currentYear, currentMonth)).length
    const nextMonth = currentMonth === 11 ? 0 : currentMonth + 1
    const nextYear = currentMonth === 11 ? currentYear + 1 : currentYear
    const contractsNextMonth = leases.filter((l) => l.end_date && inMonth(new Date(l.end_date), nextYear, nextMonth)).length
    const nextExpiries = leases
      .filter((l) => l.end_date && inMonth(new Date(l.end_date), nextYear, nextMonth))
      .sort((a, b) => String(a.end_date).localeCompare(String(b.end_date)))
    return { pending, overdue, total, onTimeRate, contractsThisMonth, contractsNextMonth, nextExpiries }
  }, [receivables, leases, currentYear, currentMonth])

  // 近期带看（未开始最近 3 场）
  const upcomingViewings = useMemo(
    () =>
      events
        .filter((e) => e.kind === 'viewing' && e.date.getTime() >= new Date(today.toDateString()).getTime())
        .slice(0, 3),
    [events, today]
  )

  const days = useMemo(() => generateMonthDays(currentYear, currentMonth), [currentYear, currentMonth])
  const selectedItems = eventsByDate[keyOf(selectedDate)] ?? []

  const dayKinds = (k: string) => Array.from(new Set((eventsByDate[k] ?? []).map((e) => e.kind)))

  const prevMonth = () => {
    if (currentMonth === 0) {
      setCurrentYear(currentYear - 1)
      setCurrentMonth(11)
    } else {
      setCurrentMonth(currentMonth - 1)
    }
  }
  const nextMonth = () => {
    if (currentMonth === 11) {
      setCurrentYear(currentYear + 1)
      setCurrentMonth(0)
    } else {
      setCurrentMonth(currentMonth + 1)
    }
  }
  const goToday = () => {
    const t = new Date()
    setCurrentYear(t.getFullYear())
    setCurrentMonth(t.getMonth())
    setSelectedDate(t)
  }
  const isSelected = (d: Date) =>
    d.getFullYear() === selectedDate.getFullYear() &&
    d.getMonth() === selectedDate.getMonth() &&
    d.getDate() === selectedDate.getDate()

  const renderEventItem = (e: CalEvent) => {
    const meta = KIND_META[e.kind]
    return (
      <View key={e.id} className='cal-follow-item'>
        <View className='cal-follow-item__icon' style={{ background: meta.bg }}>
          <Text className='cal-follow-item__icon-text' style={{ color: meta.color }}>
            {e.kind === 'viewing' ? '看' : e.kind === 'rent' ? '租' : '合'}
          </Text>
        </View>
        <View className='cal-follow-item__body'>
          <View className='cal-follow-item__top'>
            <Text className='cal-follow-item__title'>{e.title}</Text>
            {e.statusLabel ? (
              <Text className='cal-follow-item__badge' style={{ color: meta.color, background: meta.bg }}>
                {e.statusLabel}
              </Text>
            ) : null}
          </View>
          <Text className='cal-follow-item__sub'>
            {e.timeLabel ? `${e.timeLabel} · ` : ''}
            {e.sub}
          </Text>
        </View>
      </View>
    )
  }

  const renderListEvent = (e: CalEvent) => {
    const meta = KIND_META[e.kind]
    return (
      <View key={e.id} className='cal-list-row'>
        <Text className='cal-list-row__tag' style={{ color: meta.color, background: meta.bg }}>
          {meta.label}
        </Text>
        <View className='cal-list-row__body'>
          <Text className='cal-list-row__title'>
            {e.timeLabel ? `${e.timeLabel} ` : ''}
            {e.title}
          </Text>
          <Text className='cal-list-row__sub'>
            {dateLabel(e.date)} · {e.sub}
          </Text>
        </View>
      </View>
    )
  }

  return (
    <View className='cal-page'>
      <View className='page-container'>
        {/* 顶部月份导航 */}
        <View className='cal-header'>
          <View className='cal-nav-btn' hoverClass='cal-nav-btn--hover' onClick={prevMonth}>
            <Text className='cal-nav-btn__text'>‹</Text>
          </View>
          <View className='cal-header__info'>
            <Text className='cal-header__month'>{MONTH_NAMES[currentMonth]}</Text>
            <Text className='cal-header__year'>{currentYear}</Text>
          </View>
          <View className='cal-nav-btn' hoverClass='cal-nav-btn--hover' onClick={nextMonth}>
            <Text className='cal-nav-btn__text'>›</Text>
          </View>
        </View>

        {/* 日历提醒 hero */}
        <View className='cal-hero'>
          <View className='cal-hero__left'>
            <Text className='cal-hero__title'>日历提醒</Text>
            <Text className='cal-hero__sub'>
              {currentYear} 年 {currentMonth + 1} 月 · 今日 {todayFollowUps.length} 项待跟进 · 本月租金到期 {stats.total} 户
            </Text>
          </View>
          <View className='cal-hero__avatar'>
            <Text className='cal-hero__avatar-text'>历</Text>
          </View>
        </View>

        {/* 今日待跟进 */}
        <View className='cal-follow-card'>
          <View className='cal-follow-card__head'>
            <View className='cal-follow-card__head-left'>
              <Text className='cal-follow-card__title'>今日待跟进</Text>
              <Text className='cal-follow-card__warn'>{todayFollowUps.length} 项</Text>
            </View>
            <Text className='cal-follow-card__date'>{dateLabel(today)}</Text>
          </View>
          {loading && todayFollowUps.length === 0 ? (
            <View className='cal-state cal-state--loading'>
              <View className='cal-state__spinner' />
              <Text className='cal-state__title'>正在加载</Text>
            </View>
          ) : todayFollowUps.length === 0 ? (
            <View className='cal-state'>
              <Text className='cal-state__title'>今天没有待跟进事项</Text>
              <Text className='cal-state__desc'>逾期租金、近期到期合同与今日带看会集中在这里</Text>
            </View>
          ) : (
            todayFollowUps.map(renderEventItem)
          )}
        </View>

        {/* 月历卡片 */}
        <View className='cal-card'>
          <View className='cal-card__head'>
            <Text className='cal-card__title'>
              {currentYear} 年 {currentMonth + 1} 月
            </Text>
            <View className='cal-tabs'>
              <View
                className={`cal-tabs__tab${viewMode === 'month' ? ' cal-tabs__tab--active' : ''}`}
                onClick={() => setViewMode('month')}
              >
                <Text className={`cal-tabs__text${viewMode === 'month' ? ' cal-tabs__text--active' : ''}`}>月视图</Text>
              </View>
              <View
                className={`cal-tabs__tab${viewMode === 'list' ? ' cal-tabs__tab--active' : ''}`}
                onClick={() => setViewMode('list')}
              >
                <Text className={`cal-tabs__text${viewMode === 'list' ? ' cal-tabs__text--active' : ''}`}>列表</Text>
              </View>
            </View>
          </View>

          {viewMode === 'month' ? (
            <View className='cal-body'>
              <View className='cal-today-row'>
                <View className='cal-today-btn' hoverClass='cal-today-btn--hover' onClick={goToday}>
                  <Text className='cal-today-btn__text'>今天</Text>
                </View>
                <View className='cal-legend'>
                  {(['rent', 'contract', 'viewing'] as EventKind[]).map((k) => (
                    <View key={k} className='cal-legend__item'>
                      <View className='cal-legend__dot' style={{ background: KIND_META[k].color }} />
                      <Text className='cal-legend__label'>
                        {k === 'rent' ? '租金到期' : k === 'contract' ? '合同到期' : '带看 / 催收'}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>

              <View className='cal-week'>
                {WEEKDAYS.map((w, i) => (
                  <Text key={i} className='cal-week__day'>{w}</Text>
                ))}
              </View>

              <View className='cal-grid'>
                {days.map((d, idx) => {
                  const k = keyOf(d.date)
                  const selected = isSelected(d.date)
                  const kinds = dayKinds(k)
                  return (
                    <View
                      key={idx}
                      className={`cal-day${selected ? ' cal-day--selected' : ''}`}
                      onClick={() => setSelectedDate(d.date)}
                    >
                      <Text
                        className={`cal-day__num${
                          !d.isCurrentMonth ? ' cal-day__num--muted' : ''
                        }${selected ? ' cal-day__num--selected' : ''}${
                          d.isToday && !selected ? ' cal-day__num--today' : ''
                        }`}
                      >
                        {d.day}
                      </Text>
                      {d.isCurrentMonth && kinds.length > 0 && (
                        <View className='cal-day__dots'>
                          {kinds.slice(0, 3).map((kind, i) => (
                            <View
                              key={i}
                              className='cal-day__dot'
                              style={{ background: selected ? '#fff' : KIND_META[kind].color }}
                            />
                          ))}
                        </View>
                      )}
                    </View>
                  )
                })}
              </View>

              {/* 选中日期安排 */}
              <View className='cal-selected-head'>
                <Text className='cal-selected-head__title'>
                  {selectedDate.getMonth() + 1}月{selectedDate.getDate()}日 安排
                </Text>
                <Text className='cal-selected-head__count'>{selectedItems.length} 项</Text>
              </View>
              {selectedItems.length === 0 ? (
                <Text className='cal-selected-empty'>这一天没有带看与到期跟进</Text>
              ) : (
                selectedItems.map(renderEventItem)
              )}
            </View>
          ) : events.filter((e) => e.date.getFullYear() === currentYear && e.date.getMonth() === currentMonth).length === 0 ? (
            <View className='cal-state'>
              <Text className='cal-state__title'>本月暂无安排</Text>
              <Text className='cal-state__desc'>带看、租金与合同到期会按日期汇总在这里</Text>
            </View>
          ) : (
            <View className='cal-body'>
              {events
                .filter((e) => e.date.getFullYear() === currentYear && e.date.getMonth() === currentMonth)
                .map(renderListEvent)}
            </View>
          )}
        </View>

        {/* 本月重点 */}
        <Text className='cal-section-title'>本月重点</Text>
        <View className='cal-strip'>
          <View className='cal-strip__cell'>
            <Text className='cal-strip__value'>
              {stats.total}
              <Text className='cal-strip__unit'> 户</Text>
            </Text>
            <Text className='cal-strip__label'>本月租金到期</Text>
            <Text className='cal-strip__sub'>待收 {stats.pending} · 逾期 {stats.overdue}</Text>
          </View>
          <View className='cal-strip__cell'>
            <Text className='cal-strip__value'>{stats.total > 0 ? `${stats.onTimeRate}%` : '—'}</Text>
            <Text className='cal-strip__label'>按时率</Text>
            <Text className='cal-strip__sub'>{stats.total > 0 ? `逾期 ${stats.overdue} 单` : '暂无待收租金单'}</Text>
          </View>
          <View className='cal-strip__cell'>
            <Text className='cal-strip__value'>
              {stats.contractsThisMonth}
              <Text className='cal-strip__unit'> 份</Text>
            </Text>
            <Text className='cal-strip__label'>本月合同到期</Text>
            <Text className='cal-strip__sub'>下月预告 {stats.contractsNextMonth} 份</Text>
          </View>
        </View>

        {/* 下月到期预告 */}
        <View className='cal-section-head'>
          <Text className='cal-section-head__title'>下月到期预告</Text>
          {stats.nextExpiries.length > 0 ? (
            <Text className='cal-section-head__badge'>{stats.nextExpiries.length} 份</Text>
          ) : null}
        </View>
        {stats.nextExpiries.length === 0 ? (
          <View className='cal-state cal-state--card'>
            <Text className='cal-state__title'>下月暂无到期合同</Text>
            <Text className='cal-state__desc'>负责租约的到期日会提前在这里汇总</Text>
          </View>
        ) : (
          <View className='cal-list-card'>
            {(stats.nextExpiries as unknown as LeaseItem[]).map((l, idx) => {
              const d = new Date(String(l.end_date))
              const daysLeft = Math.ceil((d.getTime() - today.getTime()) / 86400000)
              return (
                <View key={l.id} className={`cal-simple-row${idx > 0 ? ' cal-simple-row--divided' : ''}`}>
                  <View className='cal-simple-row__body'>
                    <Text className='cal-simple-row__title'>{leaseName(l)}</Text>
                    <Text className='cal-simple-row__sub'>
                      {dateLabel(d)} 到期 · {symOf(l.currency)}
                      {Number(l.monthly_rent || 0).toLocaleString()}/月
                    </Text>
                  </View>
                  <Text className={`cal-simple-row__badge${daysLeft <= 30 ? ' cal-simple-row__badge--warn' : ''}`}>
                    {daysLeft >= 0 ? `${daysLeft} 天后` : '已到期'}
                  </Text>
                </View>
              )
            })}
          </View>
        )}

        {/* 近期带看 */}
        <Text className='cal-section-title'>近期带看</Text>
        {upcomingViewings.length === 0 ? (
          <View className='cal-state cal-state--card'>
            <Text className='cal-state__title'>暂无近期带看</Text>
            <Text className='cal-state__desc'>客户预约的看房行程会展示在这里</Text>
          </View>
        ) : (
          <View className='cal-list-card'>
            {upcomingViewings.map((e, idx) => (
              <View key={e.id} className={`cal-simple-row${idx > 0 ? ' cal-simple-row--divided' : ''}`}>
                <View className='cal-simple-row__body'>
                  <Text className='cal-simple-row__title'>
                    {dateLabel(e.date)} {e.timeLabel} · {e.title}
                  </Text>
                  <Text className='cal-simple-row__sub'>{e.sub}</Text>
                </View>
                {e.statusLabel ? (
                  <Text className='cal-simple-row__badge'>{e.statusLabel}</Text>
                ) : null}
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  )
}