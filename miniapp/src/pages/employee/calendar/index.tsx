import { useMemo, useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { employeesApi, viewingsApi, leasesApi, propertiesApi } from '@/services/api'
import './index.scss'
import { useI18n } from '@/i18n'

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

const buildKindMeta = (
  t: (k: string, p?: Record<string, string | number>) => string
): Record<EventKind, { label: string; color: string; bg: string }> => ({
  viewing: { label: t('cal.kindViewing'), color: 'var(--primary)', bg: 'rgba(var(--primary-rgb), 0.12)' },
  rent: { label: t('cal.kindRent'), color: 'var(--warning)', bg: 'rgba(var(--warning-rgb), 0.12)' },
  contract: { label: t('cal.kindContract'), color: 'var(--info, #0ea5e9)', bg: 'rgba(14, 165, 233, 0.12)' }
})

const buildWeekdays = (t: (k: string, p?: Record<string, string | number>) => string): string[] =>
  t('cal.weekdays').split(',')
const buildMonthNames = (t: (k: string, p?: Record<string, string | number>) => string): string[] =>
  t('cal.monthNames').split(',')

const pad = (n: number) => String(n).padStart(2, '0')
const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const dateLabel = (d: Date, t: (k: string, p?: Record<string, string | number>) => string) =>
  t('cal.dateMD', { m: d.getMonth() + 1, d: d.getDate() })
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
  const { t } = useI18n()
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
  const KIND_META = buildKindMeta(t)
  const WEEKDAYS = buildWeekdays(t)
  const MONTH_NAMES = buildMonthNames(t)

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
    return fromMap || (l.property_id ? t('cal.propertyShort', { id: String(l.property_id).slice(0, 6) }) : t('common.listingFallback'))
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
        title: t('cal.viewingTitle', { name: v.visitor_name || t('home.pendingClient') }),
        sub: v.property_title || v.property_address || t('common.listingFallback'),
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
        title: r.is_overdue ? t('cal.rentOverdue') : t('cal.rentDue'),
        sub: `${symOf(r.currency)}${Number(r.amount || 0).toLocaleString()} · ${t('cal.dueOn', { date: dateLabel(d, t) })}`,
        date: d,
        statusLabel: r.is_overdue ? t('cal.overdue') : t('cal.toCollect')
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
        title: t('cal.contractReminder'),
        sub: `${leaseName(l)} · ${t('cal.dueOn', { date: dateLabel(d, t) })}${days >= 0 ? t('cal.daysLeft', { n: days }) : t('cal.daysExpired', { n: -days })}`,
        date: d,
        statusLabel: days >= 0 ? t('cal.inDays', { n: days }) : t('cal.expired')
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
            {e.kind === 'viewing' ? t('cal.iconViewing') : e.kind === 'rent' ? t('cal.iconRent') : t('cal.iconContract')}
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
            {dateLabel(e.date, t)} · {e.sub}
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
            <Text className='cal-hero__title'>{t('cal.reminderTitle')}</Text>
            <Text className='cal-hero__sub'>
              {t('cal.heroSub', { y: currentYear, m: currentMonth + 1, n: todayFollowUps.length, total: stats.total })}
            </Text>
          </View>
          <View className='cal-hero__avatar'>
            <Text className='cal-hero__avatar-text'>{t('cal.heroAvatar')}</Text>
          </View>
        </View>

        {/* 今日待跟进 */}
        <View className='cal-follow-card'>
          <View className='cal-follow-card__head'>
            <View className='cal-follow-card__head-left'>
              <Text className='cal-follow-card__title'>{t('cal.todayFollowUp')}</Text>
              <Text className='cal-follow-card__warn'>{t('cal.countItems', { n: todayFollowUps.length })}</Text>
            </View>
            <Text className='cal-follow-card__date'>{dateLabel(today, t)}</Text>
          </View>
          {loading && todayFollowUps.length === 0 ? (
            <View className='cal-state cal-state--loading'>
              <View className='cal-state__spinner' />
              <Text className='cal-state__title'>{t('cal.loading')}</Text>
            </View>
          ) : todayFollowUps.length === 0 ? (
            <View className='cal-state'>
              <Text className='cal-state__title'>{t('cal.noFollowUp')}</Text>
              <Text className='cal-state__desc'>{t('cal.noFollowUpDesc')}</Text>
            </View>
          ) : (
            todayFollowUps.map(renderEventItem)
          )}
        </View>

        {/* 月历卡片 */}
        <View className='cal-card'>
          <View className='cal-card__head'>
            <Text className='cal-card__title'>
              {t('cal.yearMonth', { y: currentYear, m: currentMonth + 1 })}
            </Text>
            <View className='cal-tabs'>
              <View
                className={`cal-tabs__tab${viewMode === 'month' ? ' cal-tabs__tab--active' : ''}`}
                onClick={() => setViewMode('month')}
              >
                <Text className={`cal-tabs__text${viewMode === 'month' ? ' cal-tabs__text--active' : ''}`}>{t('cal.monthView')}</Text>
              </View>
              <View
                className={`cal-tabs__tab${viewMode === 'list' ? ' cal-tabs__tab--active' : ''}`}
                onClick={() => setViewMode('list')}
              >
                <Text className={`cal-tabs__text${viewMode === 'list' ? ' cal-tabs__text--active' : ''}`}>{t('cal.listView')}</Text>
              </View>
            </View>
          </View>

          {viewMode === 'month' ? (
            <View className='cal-body'>
              <View className='cal-today-row'>
                <View className='cal-today-btn' hoverClass='cal-today-btn--hover' onClick={goToday}>
                  <Text className='cal-today-btn__text'>{t('cal.today')}</Text>
                </View>
                <View className='cal-legend'>
                  {(['rent', 'contract', 'viewing'] as EventKind[]).map((k) => (
                    <View key={k} className='cal-legend__item'>
                      <View className='cal-legend__dot' style={{ background: KIND_META[k].color }} />
                      <Text className='cal-legend__label'>
                        {k === 'rent' ? t('cal.rentDue') : k === 'contract' ? t('cal.contractDue') : t('cal.viewingCollect')}
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
                  {t('cal.scheduleOf', { date: dateLabel(selectedDate, t) })}
                </Text>
                <Text className='cal-selected-head__count'>{t('cal.countItems', { n: selectedItems.length })}</Text>
              </View>
              {selectedItems.length === 0 ? (
                <Text className='cal-selected-empty'>{t('cal.noDayEvents')}</Text>
              ) : (
                selectedItems.map(renderEventItem)
              )}
            </View>
          ) : events.filter((e) => e.date.getFullYear() === currentYear && e.date.getMonth() === currentMonth).length === 0 ? (
            <View className='cal-state'>
              <Text className='cal-state__title'>{t('cal.noMonthEvents')}</Text>
              <Text className='cal-state__desc'>{t('cal.noMonthEventsDesc')}</Text>
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
        <Text className='cal-section-title'>{t('cal.monthHighlights')}</Text>
        <View className='cal-strip'>
          <View className='cal-strip__cell'>
            <Text className='cal-strip__value'>
              {stats.total}
              <Text className='cal-strip__unit'>{t('cal.unitHouseholds')}</Text>
            </Text>
            <Text className='cal-strip__label'>{t('cal.monthRentDue')}</Text>
            <Text className='cal-strip__sub'>{t('cal.pendingOverdue', { a: stats.pending, b: stats.overdue })}</Text>
          </View>
          <View className='cal-strip__cell'>
            <Text className='cal-strip__value'>{stats.total > 0 ? `${stats.onTimeRate}%` : '—'}</Text>
            <Text className='cal-strip__label'>{t('cal.onTimeRate')}</Text>
            <Text className='cal-strip__sub'>{stats.total > 0 ? t('cal.overdueOrders', { n: stats.overdue }) : t('cal.noReceivables')}</Text>
          </View>
          <View className='cal-strip__cell'>
            <Text className='cal-strip__value'>
              {stats.contractsThisMonth}
              <Text className='cal-strip__unit'>{t('cal.unitContracts')}</Text>
            </Text>
            <Text className='cal-strip__label'>{t('cal.monthContractDue')}</Text>
            <Text className='cal-strip__sub'>{t('cal.nextMonthPreview', { n: stats.contractsNextMonth })}</Text>
          </View>
        </View>

        {/* 下月到期预告 */}
        <View className='cal-section-head'>
          <Text className='cal-section-head__title'>{t('cal.nextExpiryTitle')}</Text>
          {stats.nextExpiries.length > 0 ? (
            <Text className='cal-section-head__badge'>{t('cal.countContracts', { n: stats.nextExpiries.length })}</Text>
          ) : null}
        </View>
        {stats.nextExpiries.length === 0 ? (
          <View className='cal-state cal-state--card'>
            <Text className='cal-state__title'>{t('cal.noNextExpiry')}</Text>
            <Text className='cal-state__desc'>{t('cal.noNextExpiryDesc')}</Text>
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
                      {t('cal.dueOn', { date: dateLabel(d, t) })} · {symOf(l.currency)}
                      {Number(l.monthly_rent || 0).toLocaleString()}{t('cal.perMonth')}
                    </Text>
                  </View>
                  <Text className={`cal-simple-row__badge${daysLeft <= 30 ? ' cal-simple-row__badge--warn' : ''}`}>
                    {daysLeft >= 0 ? t('cal.inDays', { n: daysLeft }) : t('cal.expired')}
                  </Text>
                </View>
              )
            })}
          </View>
        )}

        {/* 近期带看 */}
        <Text className='cal-section-title'>{t('cal.recentViewings')}</Text>
        {upcomingViewings.length === 0 ? (
          <View className='cal-state cal-state--card'>
            <Text className='cal-state__title'>{t('cal.noRecentViewings')}</Text>
            <Text className='cal-state__desc'>{t('cal.noRecentViewingsDesc')}</Text>
          </View>
        ) : (
          <View className='cal-list-card'>
            {upcomingViewings.map((e, idx) => (
              <View key={e.id} className={`cal-simple-row${idx > 0 ? ' cal-simple-row--divided' : ''}`}>
                <View className='cal-simple-row__body'>
                  <Text className='cal-simple-row__title'>
                    {dateLabel(e.date, t)} {e.timeLabel} · {e.title}
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