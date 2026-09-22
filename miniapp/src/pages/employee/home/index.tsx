import { useMemo, useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { employeesApi, leadsApi, viewingsApi, performanceApi } from '@/services/api'
import { fmtMoney } from '@/utils/format'
import BottomNav from '@/components/BottomNav'
import './index.scss'

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
  pending: { label: '待确认', cls: 'emp-tag--info' },
  confirmed: { label: '待开始', cls: 'emp-tag--info' },
  completed: { label: '已完成', cls: 'emp-tag--success' },
  cancelled: { label: '已取消', cls: 'emp-tag--muted' },
  no_show: { label: '爽约', cls: 'emp-tag--error' }
}

const getVStatus = (status?: string | null) =>
  V_STATUS[status ?? ''] ?? { label: status || '-', cls: 'emp-tag--muted' }

// 线索阶段标签（对齐后端 LeadStage 枚举）
const STAGE_META: Record<string, { label: string; cls: string }> = {
  inquiring: { label: '新线索', cls: 'emp-tag--info' },
  viewing_scheduled: { label: '看房中', cls: 'emp-tag--info' },
  negotiating: { label: '谈判中', cls: 'emp-tag--warning' },
  pending_contract: { label: '待签约', cls: 'emp-tag--info' },
  closed: { label: '已成交', cls: 'emp-tag--success' }
}

const getStage = (s?: string) =>
  STAGE_META[s ?? ''] ?? { label: s || '未知', cls: 'emp-tag--muted' }

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
  if (sameDay(d, now)) return `今天 ${pad(d.getHours())}:${pad(d.getMinutes())}`
  const yesterday = new Date(now.getTime() - 86400000)
  if (sameDay(d, yesterday)) return `昨天 ${pad(d.getHours())}:${pad(d.getMinutes())}`
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export default function EmployeeHomePage() {
  const user = useAuthStore((state) => state.user)
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)
  const [viewings, setViewings] = useState<ViewingItem[]>([])
  const [leads, setLeads] = useState<Lead[]>([])
  const [board, setBoard] = useState<LeaderRow[]>([])
  const [perf, setPerf] = useState<PerfSummary>({})
  const [monthly, setMonthly] = useState<MonthPerf[]>([])
  const [loading, setLoading] = useState(false)

  const fetchAll = async () => {
    setLoading(true)
    try {
      const [vw, ld, lb, pf] = await Promise.all([
        viewingsApi.list({ page_size: 100 }).catch(() => ({ data: { items: [] } })),
        leadsApi.list({ page: 1, page_size: 100 }).catch(() => ({ data: { items: [] } })),
        employeesApi.leaderboard().catch(() => ({ data: [] })),
        performanceApi.me().catch(() => ({ data: {} }))
      ])
      setViewings(pickList(pick(vw)))
      const ldList = pickList(ld)
      setLeads(ldList)
      const lbRaw: any = pick(lb)
      setBoard(Array.isArray(lbRaw) ? lbRaw : [])
      const sum = pick(pf, 'summary') as PerfSummary | undefined
      setPerf(sum && typeof sum === 'object' ? sum : {})
      const mon = pick(pf, 'monthly')
      setMonthly(Array.isArray(mon) ? mon : [])
    } catch (error) {
      console.error('[EmployeeHome] 加载失败', error)
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

  // 柱图数据：近 6 个月佣金走势
  const barData = useMemo(() => {
    const six = monthly.slice(-6)
    const max = Math.max(1, ...six.map((m) => Number(m.commission ?? 0)))
    const now = new Date()
    return six.map((m) => ({
      label: `${m.month}月`,
      value: fmtCompact(Number(m.commission ?? 0)),
      height: `${Math.max(4, Math.round((Number(m.commission ?? 0) / max) * 64))}px`,
      active: m.year === now.getFullYear() && m.month === now.getMonth() + 1
    }))
  }, [monthly])

  return (
    <View className='emp-home'>
      {/* 今日概览卡 */}
      <View className='emp-hero'>
        <View className='emp-hero__main'>
          <Text className='emp-hero__meta'>
            今日 {todayList.length} 场带看 · 本月成交 {monthDeals ?? 0} 单 · 佣金{' '}
            {fmtMoney(monthCommission)}
          </Text>
        </View>
        <View className='emp-hero__avatar'>
          <Text className='emp-hero__avatar-text'>
            {(user?.name || '员').charAt(0).toUpperCase()}
          </Text>
        </View>
      </View>

      <View className='emp-content'>
        {/* 房源上架入口（对齐 App：移除独立 workbench，直达发布房源） */}
        <View className='emp-section'>
          <View className='emp-quick' onClick={() => Taro.navigateTo({ url: '/pages/staff/listing-edit/index' })}>
            <View className='emp-quick__icon'>
              <Text className='emp-quick__icon-text'>上</Text>
            </View>
            <View className='emp-quick__body'>
              <Text className='emp-quick__title'>发布房源</Text>
              <Text className='emp-quick__desc'>完整信息 + 分佣配置</Text>
            </View>
            <Text className='emp-quick__arrow'>›</Text>
          </View>

          {/* 日历/日程排期入口 */}
          <View className='emp-quick' onClick={() => Taro.navigateTo({ url: '/pages/employee/calendar/index' })}>
            <View className='emp-quick__icon emp-quick__icon--calendar'>
              <Text className='emp-quick__icon-text'>历</Text>
            </View>
            <View className='emp-quick__body'>
              <Text className='emp-quick__title'>日程排期</Text>
              <Text className='emp-quick__desc'>月历 · 带看/租金/合同到期提醒</Text>
            </View>
            <Text className='emp-quick__arrow'>›</Text>
          </View>
        </View>

        {/* 今日工作台：带看时间线 */}
        <View className='emp-section'>
          <View className='emp-section__head'>
            <View className='emp-section__title-row'>
              <Text className='emp-section__title'>今日工作台</Text>
              <View className='emp-badge emp-badge--info'>
                <Text>{todayList.length} 场带看</Text>
              </View>
            </View>
            <View
              className='emp-section__action'
              onClick={() => Taro.showToast({ title: '「新建带看」暂未开放', icon: 'none' })}
            >
              <Text className='emp-section__action-text'>+ 新建带看</Text>
            </View>
          </View>

          <View className='emp-wb'>
            {loading && todayList.length === 0 ? (
              <View className='emp-state emp-state--loading'>
                <View className='emp-state__spinner' />
                <Text className='emp-state__title'>正在加载</Text>
              </View>
            ) : todayList.length === 0 ? (
              <View className='emp-state'>
                <Text className='emp-state__title'>今天暂无带看安排</Text>
                <Text className='emp-state__desc'>新的预约将自动出现在这里</Text>
              </View>
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
                        {idx === nextIdx ? '下一场' : past ? '已过' : ''}
                      </Text>
                    </View>
                    <View className='emp-wb-item__body'>
                      <Text className='emp-wb-item__name'>{item.visitor_name || '待定客户'}</Text>
                      <Text className='emp-wb-item__prop'>
                        {item.property_title || item.property_address || '房源'}
                      </Text>
                    </View>
                    <View className={`emp-tag ${st.cls}`}>
                      <Text>{st.label}</Text>
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
              <Text className='emp-section__title'>待跟进客户</Text>
              {hotLeads.length > 0 && (
                <View className='emp-badge emp-badge--warning'>
                  <Text>{hotLeads.length} 位高意向</Text>
                </View>
              )}
            </View>
          </View>

          <View className='emp-card emp-card--flush'>
            {loading && leads.length === 0 ? (
              <View className='emp-state emp-state--loading'>
                <View className='emp-state__spinner' />
                <Text className='emp-state__title'>正在加载</Text>
              </View>
            ) : leads.length === 0 ? (
              <View className='emp-state'>
                <Text className='emp-state__title'>暂无待跟进客户</Text>
                <Text className='emp-state__desc'>新的咨询会自动汇总到这里</Text>
              </View>
            ) : (
              leads.slice(0, 4).map((lead) => {
                const st = getStage(lead.stage)
                return (
                  <View key={lead.id} className='emp-lead'>
                    <View className='emp-lead__avatar'>
                      <Text className='emp-lead__avatar-text'>
                        {(lead.name || '客').charAt(0)}
                      </Text>
                    </View>
                    <View className='emp-lead__body'>
                      <View className='emp-lead__top'>
                        <Text className='emp-lead__name'>{lead.name || '未命名客户'}</Text>
                        <View className={`emp-tag ${st.cls}`}>
                          <Text>{st.label}</Text>
                        </View>
                      </View>
                      <Text className='emp-lead__meta'>
                        {lead.notes || '暂无需求备注'} · {relTime(lead.updated_at || lead.created_at)}
                      </Text>
                    </View>
                    <View
                      className='emp-lead__btn'
                      onClick={() => Taro.showToast({ title: '「去跟进」暂未开放', icon: 'none' })}
                    >
                      <Text className='emp-lead__btn-text'>去跟进</Text>
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
                <Text className='emp-section__title'>业绩摘要</Text>
              </View>
              <View
                className='emp-section__action'
                onClick={() => Taro.navigateTo({ url: '/pages/employee/performance/index' })}
              >
                <Text className='emp-section__action-text'>查看详情 ›</Text>
              </View>
            </View>
            <View className='emp-strip'>
              <View className='emp-strip__cell'>
                <Text className='emp-strip__value'>
                  {monthDeals ?? '-'}
                  <Text className='emp-strip__unit'> 单</Text>
                </Text>
                <Text className='emp-strip__label'>本月成交</Text>
              </View>
              <View className='emp-strip__cell'>
                <Text className='emp-strip__value emp-strip__value--md'>
                  {monthCommission !== undefined ? fmtMoney(monthCommission) : '-'}
                </Text>
                <Text className='emp-strip__label'>佣金收入</Text>
              </View>
              <View className='emp-strip__cell'>
                <Text className='emp-strip__value'>
                  {selfIndex >= 0 ? `第 ${selfIndex + 1}` : '-'}
                </Text>
                <Text className='emp-strip__label'>团队排名</Text>
              </View>
            </View>
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