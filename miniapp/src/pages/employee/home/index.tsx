import { OPTION_PAGE_SIZE } from '@/lib/pagination'
import { useMemo, useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { employeesApi, leadsApi, viewingsApi, performanceApi } from '@/services/api'
import { fmtMoney } from '@/utils/format'
import BottomNav from '@/components/BottomNav'
import StatusTop from '@/components/StatusTop'
import StateBlock from '@/components/StateBlock'
import { useI18n } from '@/i18n'
import './index.scss'
import { errorText } from '@/lib/errorText'

interface ViewingItem {
  id: string
  property_id?: string
  property_title?: string | null
  property_address?: string | null
  scheduled_at?: string | null
  visitor_name?: string | null
  status?: string | null
}

interface Lead {
  id: string
  name?: string
  stage?: string
  notes?: string
  created_at?: string
  updated_at?: string
  [key: string]: any
}

interface LeaderRow {
  id: string
  full_name?: string
  performance?: number
  deals?: number
  is_self?: boolean
}

interface PerfSummary {
  month_deals?: number
  month_commission?: number
}

// 月度业绩行（/performance/mine 返回的 monthly 序列）
interface MonthPerf {
  year: number
  month: number
  revenue?: number
  commission?: number
  deals?: number
}

const pick = (res: any, key?: string): any => {
  const d = res?.data ?? res
  if (key) return d?.[key]
  return d
}

function pickList(res: any): any[] {
  if (Array.isArray(res)) return res
  if (Array.isArray(res?.items)) return res.items
  if (Array.isArray(res?.data)) return res.data
  if (Array.isArray(res?.data?.items)) return res.data.items
  return []
}

// 柱图值紧凑展示：28400 -> 28.4k
const fmtCompact = (v: number | undefined) => {
  const n = Number(v || 0)
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}

// 带看状态标签
const V_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: 'home.vPending', cls: 'emp-tag--info' },
  confirmed: { label: 'home.vConfirmed', cls: 'emp-tag--info' },
  completed: { label: 'home.vCompleted', cls: 'emp-tag--success' },
  cancelled: { label: 'home.vCancelled', cls: 'emp-tag--muted' },
  no_show: { label: 'home.vNoShow', cls: 'emp-tag--error' }
}

const getVStatus = (status?: string | null) =>
  V_STATUS[status ?? ''] ?? { label: status || '-', cls: 'emp-tag--muted' }

// 线索阶段标签（对齐后端 LeadStage 枚举）
const STAGE_META: Record<string, { label: string; cls: string }> = {
  inquiring: { label: 'home.stInquiring', cls: 'emp-tag--info' },
  viewing_scheduled: { label: 'home.stViewing', cls: 'emp-tag--info' },
  negotiating: { label: 'home.stNegotiating', cls: 'emp-tag--warning' },
  pending_contract: { label: 'home.stPendingContract', cls: 'emp-tag--info' },
  closed: { label: 'home.stClosed', cls: 'emp-tag--success' }
}

const getStage = (s?: string) =>
  STAGE_META[s ?? ''] ?? { label: s || 'home.unknown', cls: 'emp-tag--muted' }

// 高意向线索阶段（用于「待跟进客户」角标）
const HOT_STAGES = ['negotiating', 'pending_contract']

const pad = (n: number) => String(n).padStart(2, '0')
const toTime = (iso?: string | null) => {
  if (!iso) return '--:--'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '--:--' : `${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const isToday = (iso?: string | null) => {
  if (!iso) return false
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return false
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
}

// 相对时间：今天 HH:MM / 昨天 HH:MM / MM-DD
const relTime = (iso?: string) => {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  const now = new Date()
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  if (sameDay(d, now)) return useI18n.getState().t('home.todayTime', { time })
  const yesterday = new Date(now.getTime() - 86400000)
  if (sameDay(d, yesterday)) return useI18n.getState().t('home.yesterdayTime', { time })
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export default function EmployeeHomePage() {
  const { t } = useI18n()
  const user = useAuthStore((state) => state.user)
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)
  const [viewings, setViewings] = useState<ViewingItem[]>([])
  const [leads, setLeads] = useState<Lead[]>([])
  const [board, setBoard] = useState<LeaderRow[]>([])
  const [perf, setPerf] = useState<PerfSummary>({})
  const [monthly, setMonthly] = useState<MonthPerf[]>([])
  const [loading, setLoading] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)

  const fetchAll = async () => {
    setLoading(true)
    try {
      // 带看必须按「本人 + 今天」服务端筛选：默认列表会混入其他经纪人的预约，
      // 且当天预约多时固定条数会被截断
      const meRes: any = await employeesApi.me().catch(() => null)
      const myEmpId = pick(meRes)?.id
      const dayStart = new Date()
      dayStart.setHours(0, 0, 0, 0)
      const dayEnd = new Date(dayStart)
      dayEnd.setDate(dayEnd.getDate() + 1)
      dayEnd.setMilliseconds(-1)
      const [vwRes, ldRes, lbRes, pfRes] = await Promise.allSettled([
        viewingsApi.list({
          page_size: OPTION_PAGE_SIZE,
          ...(myEmpId ? { assigned_to: String(myEmpId) } : {}),
          scheduled_from: dayStart.toISOString(),
          scheduled_to: dayEnd.toISOString()
        }),
        // 线索只取本人负责的：不带 mine 时后端对员工返回全平台线索
        leadsApi.list({ page: 1, page_size: OPTION_PAGE_SIZE, mine: true }),
        employeesApi.leaderboard(),
        performanceApi.me()
      ])
      if (vwRes.status === 'fulfilled') setViewings(pickList(pick(vwRes.value)))
      if (ldRes.status === 'fulfilled') setLeads(pickList(pick(ldRes.value)))
      if (lbRes.status === 'fulfilled') {
        const lbRaw: any = pick(lbRes.value)
        setBoard(Array.isArray(lbRaw) ? lbRaw : [])
      }
      if (pfRes.status === 'fulfilled') {
        const pf: any = pick(pfRes.value)
        const sum = pf?.summary as PerfSummary | undefined
        setPerf(sum && typeof sum === 'object' ? sum : {})
        setMonthly(Array.isArray(pf?.monthly) ? pf.monthly : [])
      }
      // 失败不能当成 0 数据：否则「今日 0 场带看 / 暂无待跟进」会误导
      // 取不到本人 employee id 时带看会退回团队列表，同样视为降级
      setLoadFailed(
        !myEmpId || [vwRes, ldRes, lbRes, pfRes].some((r) => r.status === 'rejected')
      )
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

  // 今日日程：当天带看按时间升序
  const todayList = viewings
    .filter((v) => isToday(v.scheduled_at))
    .sort((a, b) => String(a.scheduled_at).localeCompare(String(b.scheduled_at)))

  // 去跟进：选一个阶段推进线索（真实写 PATCH /leads/{id}），此前只弹「暂未开放」
  const STAGE_ORDER = ['inquiring', 'viewing_scheduled', 'negotiating', 'pending_contract', 'closed']
  const goFollowUp = async (lead: Lead) => {
    const labels = STAGE_ORDER.map((s) => t(STAGE_META[s].label))
    try {
      const res = await Taro.showActionSheet({ itemList: labels })
      const stage = STAGE_ORDER[res.tapIndex]
      if (!stage || stage === lead.stage) return
      await leadsApi.update(String(lead.id), { stage })
      Taro.showToast({ title: t('crm.stageUpdated'), icon: 'success' })
      fetchAll()
    } catch (err: any) {
      // 用户取消选择时 tapIndex 不存在，静默返回
      if (err?.errMsg && String(err.errMsg).includes('cancel')) return
      Taro.showToast({ title:errorText(err, t('crm.updateFailed')), icon: 'none' })
    }
  }

  // 下一场：今天首个尚未开始的场次（用于「已过 / 下一场」标记）
  const nowTs = Date.now()
  const nextIdx = todayList.findIndex((v) => new Date(String(v.scheduled_at)).getTime() >= nowTs)

  // 高意向客户
  const hotLeads = leads.filter((l) => HOT_STAGES.includes(String(l.stage)))

  // 业绩：优先取本月业绩接口，缺失时退回排行榜本人行
  const selfIndex = board.findIndex((b) => b.is_self)
  const selfRow = selfIndex >= 0 ? board[selfIndex] : undefined
  const monthDeals = perf.month_deals ?? selfRow?.deals
  const monthCommission = perf.month_commission ?? selfRow?.performance
  const hasPerf = monthDeals !== undefined || monthCommission !== undefined

  // 环比：以上月月度序列为基数（无上月记录时不展示）
  const prevMonthRow = useMemo(() => {
    const now = new Date()
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    return monthly.find((m) => m.year === d.getFullYear() && m.month === d.getMonth() + 1)
  }, [monthly])
  const dealsDelta =
    prevMonthRow && monthDeals !== undefined ? monthDeals - Number(prevMonthRow.deals || 0) : null
  const prevCommission = Number(prevMonthRow?.commission || 0)
  const commissionDelta =
    prevCommission > 0 && monthCommission !== undefined
      ? ((monthCommission - prevCommission) / prevCommission) * 100
      : null

  // 柱图数据：固定取最近 6 个自然月，缺失月份补 0（与 App 口径一致）
  const barData = useMemo(() => {
    const now = new Date()
    const rows: { label: string; value: string; commission: number; active: boolean }[] = []
    let max = 1
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const row = monthly.find((m) => m.year === d.getFullYear() && m.month === d.getMonth() + 1)
      const commission = Number(row?.commission ?? 0)
      if (commission > max) max = commission
      rows.push({
        label: t('common.monthN', { n: d.getMonth() + 1 }),
        value: commission > 0 ? fmtCompact(commission) : '',
        commission,
        active: i === 0
      })
    }
    return rows.map((r) => ({
      label: r.label,
      value: r.value,
      active: r.active,
      height: `${Math.max(4, Math.round((r.commission / max) * 64))}px`
    }))
  }, [monthly, t])

  return (
    <View className='emp-home'>
      <StatusTop />
      {/* 加载失败提示：避免接口异常被当成「今天没有安排」 */}
      {loadFailed && (
        <View className='inline-error-bar' onClick={fetchAll}>
          <Text className='inline-error-bar__text'>{t('emp.workbenchFail')}</Text>
          <Text className='inline-error-bar__retry'>{t('common.retry')}</Text>
        </View>
      )}
      {/* 今日概览卡 */}
      <View className='emp-hero'>
        <View className='emp-hero__main'>
          <Text className='emp-hero__meta'>
            {t('home.heroMeta', {
              v: todayList.length,
              d: monthDeals ?? 0,
              c: fmtMoney(monthCommission)
            })}
          </Text>
        </View>
        <View className='emp-hero__avatar'>
          <Text className='emp-hero__avatar-text'>
            {(user?.full_name || t('home.avatarFallback')).charAt(0).toUpperCase()}
          </Text>
        </View>
      </View>

      <View className='emp-content'>
        {/* 日历/日程排期入口（上架入口已收敛到「房源管理」页，首页不再放快捷位） */}
        <View className='emp-section'>
          <View className='emp-quick' onClick={() => Taro.navigateTo({ url: '/pages/employee/calendar/index' })}>
            <View className='emp-quick__icon emp-quick__icon--calendar'>
              <Text className='emp-quick__icon-text'>{t('home.iconCalendar')}</Text>
            </View>
            <View className='emp-quick__body'>
              <Text className='emp-quick__title'>{t('home.schedule')}</Text>
              <Text className='emp-quick__desc'>{t('home.scheduleDesc')}</Text>
            </View>
            <Text className='emp-quick__arrow'>›</Text>
          </View>
        </View>

        {/* 今日工作台：带看时间线 */}
        <View className='emp-section'>
          <View className='emp-section__head'>
            <View className='emp-section__title-row'>
              <Text className='emp-section__title'>{t('home.todayWorkbench')}</Text>
              <View className='emp-badge emp-badge--info'>
                <Text>{t('home.viewingsCount', { n: todayList.length })}</Text>
              </View>
            </View>
            <View
              className='emp-section__action'
              onClick={() => Taro.navigateTo({ url: '/pages/employee/property-browse/index' })}
            >
              <Text className='emp-section__action-text'>{t('home.newViewing')}</Text>
            </View>
          </View>

          <View className='emp-wb'>
            {loading && todayList.length === 0 ? (
              <StateBlock loading text={t('common.loading')} />
            ) : todayList.length === 0 ? (
              <StateBlock empty text={`${t('home.noViewingsToday')} · ${t('home.viewingsHint')}`} />
            ) : (
              todayList.map((item, idx) => {
                const st = getVStatus(item.status)
                // 全部场次已开始（无下一场）时，所有条目都算「已过」
                const past = nextIdx === -1 || idx < nextIdx
                return (
                  <View key={item.id} className='emp-wb-item'>
                    <View className='emp-wb-item__time'>
                      <Text
                        className={`emp-wb-item__range ${
                          idx === nextIdx ? 'emp-wb-item__range--next' : ''
                        }`}
                      >
                        {toTime(item.scheduled_at)}
                      </Text>
                      <Text className='emp-wb-item__flag'>
                        {idx === nextIdx ? t('home.nextUp') : past ? t('home.past') : ''}
                      </Text>
                    </View>
                    <View className='emp-wb-item__body'>
                      <Text className='emp-wb-item__name'>{item.visitor_name || t('home.pendingClient')}</Text>
                      <Text className='emp-wb-item__prop'>
                        {item.property_title || item.property_address || t('home.propertyFallback')}
                      </Text>
                    </View>
                    <View className={`emp-tag ${st.cls}`}>
                      <Text>{t(st.label)}</Text>
                    </View>
                  </View>
                )
              })
            )}
          </View>
        </View>

        {/* 待跟进客户 */}
        <View className='emp-section'>
          <View className='emp-section__head'>
            <View className='emp-section__title-row'>
              <Text className='emp-section__title'>{t('home.followUpLeads')}</Text>
              {hotLeads.length > 0 && (
                <View className='emp-badge emp-badge--warning'>
                  <Text>{t('home.hotLeadsCount', { n: hotLeads.length })}</Text>
                </View>
              )}
            </View>
          </View>

          <View className='emp-card emp-card--flush'>
            {loading && leads.length === 0 ? (
              <StateBlock loading text={t('common.loading')} />
            ) : leads.length === 0 ? (
              <StateBlock empty text={`${t('home.noLeads')} · ${t('home.leadsHint')}`} />
            ) : (
              leads.slice(0, 4).map((lead) => {
                const st = getStage(lead.stage)
                return (
                  <View key={lead.id} className='emp-lead'>
                    <View className='emp-lead__avatar'>
                      <Text className='emp-lead__avatar-text'>
                        {(lead.name || t('home.leadAvatarFallback')).charAt(0)}
                      </Text>
                    </View>
                    <View className='emp-lead__body'>
                      <View className='emp-lead__top'>
                        <Text className='emp-lead__name'>{lead.name || t('home.unnamedClient')}</Text>
                        <View className={`emp-tag ${st.cls}`}>
                          <Text>{t(st.label)}</Text>
                        </View>
                      </View>
                      <Text className='emp-lead__meta'>
                        {lead.notes || t('home.noNotes')} · {relTime(lead.updated_at || lead.created_at)}
                      </Text>
                    </View>
                    <View
                      className='emp-lead__btn'
                      onClick={() => goFollowUp(lead)}
                    >
                      <Text className='emp-lead__btn-text'>{t('home.goFollowUp')}</Text>
                    </View>
                  </View>
                )
              })
            )}
          </View>
        </View>

        {/* 业绩摘要：本月三格 + 近 6 个月佣金柱图 */}
        {hasPerf && (
          <View className='emp-section'>
            <View className='emp-section__head'>
              <View className='emp-section__title-row'>
                <Text className='emp-section__title'>{t('home.perfSummary')}</Text>
              </View>
              <View
                className='emp-section__action'
                onClick={() => Taro.navigateTo({ url: '/pages/employee/performance/index' })}
              >
                <Text className='emp-section__action-text'>{t('home.viewDetailMore')}</Text>
              </View>
            </View>
            <View className='emp-strip'>
              <View className='emp-strip__cell'>
                <Text className='emp-strip__value'>
                  {monthDeals ?? '-'}
                  <Text className='emp-strip__unit'>{t('home.dealUnit')}</Text>
                </Text>
                <Text className='emp-strip__label'>{t('home.monthDeals')}</Text>
              </View>
              <View className='emp-strip__cell'>
                <Text className='emp-strip__value emp-strip__value--md'>
                  {monthCommission !== undefined ? fmtMoney(monthCommission) : '-'}
                </Text>
                <Text className='emp-strip__label'>{t('home.commissionIncome')}</Text>
              </View>
              <View className='emp-strip__cell'>
                <Text className='emp-strip__value'>
                  {selfIndex >= 0 ? t('home.rankNo', { n: selfIndex + 1 }) : '-'}
                </Text>
                <Text className='emp-strip__label'>{t('home.teamRank')}</Text>
              </View>
            </View>
            {(dealsDelta !== null || commissionDelta !== null) && (
              <View className='emp-delta'>
                {dealsDelta !== null && (
                  <Text className='emp-delta__text'>
                    {t('home.monthDeals')}{' '}
                    {t('emp.vsLastMonth', {
                      value: `${dealsDelta >= 0 ? '+' : ''}${dealsDelta}${t('home.dealUnit')}`
                    })}
                  </Text>
                )}
                {commissionDelta !== null && (
                  <Text className='emp-delta__text'>
                    {t('home.commissionIncome')}{' '}
                    {t('emp.vsLastMonth', {
                      value: `${commissionDelta >= 0 ? '+' : ''}${commissionDelta.toFixed(1)}%`
                    })}
                  </Text>
                )}
              </View>
            )}
            <View className='emp-chart-card'>
              <View className='emp-chart'>
                {barData.map((b) => (
                  <View key={b.label} className='emp-chart__col'>
                    <Text className={`emp-chart__val${b.active ? ' emp-chart__val--active' : ''}`}>
                      {b.value}
                    </Text>
                    <View
                      className={`emp-chart__bar${b.active ? ' emp-chart__bar--active' : ''}`}
                      style={{ height: b.height }}
                    />
                  </View>
                ))}
              </View>
              <View className='emp-chart__labels'>
                {barData.map((b) => (
                  <Text
                    key={b.label}
                    className={`emp-chart__label${b.active ? ' emp-chart__label--active' : ''}`}
                  >
                    {b.label}
                  </Text>
                ))}
              </View>
            </View>
          </View>
        )}
      </View>

      <BottomNav role='employee' active='dashboard' />
    </View>
  )
}