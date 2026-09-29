import { useMemo, useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { employeesApi, performanceApi, commissionsApi, leasesApi, propertiesApi, viewingsApi } from '@/services/api'
import './index.scss'
import { useI18n } from '@/i18n'
import ShellHeader from '@/components/ShellHeader'

interface RankItem {
  id: string
  full_name?: string | null
  department?: string | null
  position?: string | null
  performance: number
  deals: number
  is_self?: boolean
}

interface EmployeeInfo {
  department?: string | null
  position?: string | null
}

interface PerfSummary {
  year?: number
  month?: number
  year_total?: number
  month_total?: number
  commission_total?: number
  month_commission?: number
  deals_total?: number
  month_deals?: number
  new_rentals?: number
  renewals?: number
  management?: number
  currency?: string
  [key: string]: any
}

interface MonthlyItem {
  year?: number
  month?: number
  revenue?: number
  commission?: number
  deals?: number
}

interface AgentRow {
  employee_id?: string
  employee_name?: string | null
  total_commission?: number | null
  total_revenue?: number | null
  deals?: number
}

interface PartnerRow {
  partner_id?: string
  partner_name?: string | null
  total_commission?: number | null
  total_revenue?: number | null
  deals?: number
}

interface Commission {
  id: string
  lease_id?: string
  deal_type?: string
  commission_base?: number
  commission_rate?: number
  commission_amount?: number
  currency?: string
  status?: string
  created_at?: string
}

type ViewKey = 'mine' | 'agents' | 'partners'

const buildDealTypeLabels = (
  t: (k: string, p?: Record<string, string | number>) => string
): Record<string, string> => ({
  new_rental: t('perf.dealNewRental'),
  renewal: t('perf.dealRenewal'),
  management: t('perf.dealManagement')
})

// 结算状态（对齐后端 SettlementStatus: pending/approved/paid）
const buildSettleMeta = (
  t: (k: string, p?: Record<string, string | number>) => string
): Record<string, { label: string; cls: string }> => ({
  pending: { label: t('perf.stPending'), cls: 'perf-tag--warning' },
  approved: { label: t('perf.stApproved'), cls: 'perf-tag--info' },
  paid: { label: t('perf.stPaid'), cls: 'perf-tag--success' }
})

const fmtMoney = (v?: number, currency?: string) => {
  const sym: Record<string, string> = { CNY: '¥', THB: '', USD: '$', EUR: '€' }
  return `${sym[currency || 'THB'] || '฿'}${Number(v || 0).toLocaleString()}`
}

// 佣金比例：后端 rate>1 视为百分比，否则视为月租倍数
const fmtRate = (rate?: number) => {
  const r = Number(rate || 0)
  if (!r) return '-'
  return r > 1 ? `${r}%` : `${Math.round(r * 100)}%`
}

function pickList(res: any): any[] {
  if (Array.isArray(res)) return res
  if (Array.isArray(res?.items)) return res.items
  if (Array.isArray(res?.data)) return res.data
  if (Array.isArray(res?.data?.items)) return res.data.items
  return []
}

const pick = (res: any, key?: string): any => {
  const d = res?.data ?? res
  if (key) return d?.[key]
  return d
}

export default function EmployeePerformancePage() {
  const { t } = useI18n()
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)
  // 合作公司分佣汇总（/performance/partners）仅管理员/合作公司管理员可见
  const currentUser = useAuthStore((state) => state.user as any)
  const isAdminLike = currentUser?.role === 'admin' || currentUser?.role === 'partner_admin'

  const [view, setView] = useState<ViewKey>('mine')
  const [leaderboard, setLeaderboard] = useState<RankItem[]>([])
  const [employee, setEmployee] = useState<EmployeeInfo | null>(null)
  const [summary, setSummary] = useState<PerfSummary>({})
  const [monthly, setMonthly] = useState<MonthlyItem[]>([])
  const [agents, setAgents] = useState<AgentRow[]>([])
  const [partners, setPartners] = useState<PartnerRow[]>([])
  const [commissions, setCommissions] = useState<Commission[]>([])
  const [leaseMap, setLeaseMap] = useState<Record<string, any>>({})
  const [propMap, setPropMap] = useState<Record<string, any>>({})
  const [viewingCount, setViewingCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const DEAL_TYPE_LABELS = buildDealTypeLabels(t)
  const SETTLE_META = buildSettleMeta(t)

  const fetchAll = async () => {
    setLoading(true)
    try {
      const [lbRes, meRes, pfRes, cmRes, vwRes, lsRes, ppRes, agRes, ptRes]: any[] =
        await Promise.all([
          employeesApi.leaderboard().catch(() => ({ data: [] })),
          employeesApi.me().catch(() => ({ data: {} })),
          performanceApi.me().catch(() => ({ data: {} })),
          commissionsApi.mine({ page: 1, page_size: 100 }).catch(() => ({ data: [] })),
          viewingsApi.list({ page_size: 100 }).catch(() => ({ data: [] })),
          leasesApi.list({ page: 1, page_size: 100 }).catch(() => ({ data: [] })),
          propertiesApi.list({ page: 1, page_size: 100 }).catch(() => ({ data: [] })),
          performanceApi.agents().catch(() => ({ data: [] })),
          isAdminLike ? performanceApi.partners().catch(() => ({ data: [] })) : Promise.resolve({ data: [] })
        ])

      const lb = pick(lbRes)
      setLeaderboard(Array.isArray(lb) ? lb : [])
      const me = pick(meRes)
      setEmployee(me && typeof me === 'object' ? me : null)

      const pf = pick(pfRes)
      const sum = pf?.summary ?? {}
      setSummary(sum && typeof sum === 'object' ? sum : {})
      setMonthly(Array.isArray(pf?.monthly) ? pf.monthly : [])

      setAgents(pickList(agRes))
      if (isAdminLike) setPartners(pickList(ptRes))

      setCommissions(pickList(cmRes))

      const ls = pickList(lsRes)
      const lMap: Record<string, any> = {}
      ls.forEach((l: any) => {
        lMap[String(l.id)] = l
      })
      setLeaseMap(lMap)

      const pl = pickList(ppRes)
      const pMap: Record<string, any> = {}
      pl.forEach((p: any) => {
        pMap[String(p.id)] = p
      })
      setPropMap(pMap)

      // 本月带看次数（由真实带看记录聚合）
      const now = new Date()
      const vw = pickList(vwRes).filter((v: any) => {
        const d = new Date(String(v.scheduled_at || ''))
        return (
          !Number.isNaN(d.getTime()) &&
          d.getFullYear() === now.getFullYear() &&
          d.getMonth() === now.getMonth()
        )
      })
      setViewingCount(vw.length)
    } catch (error) {
      console.error('[Performance] 加载失败', error)
      Taro.showToast({ title: t('common.loadFailed'), icon: 'none' })
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

  const myIndex = leaderboard.findIndex((r) => r.is_self)
  const myRank = myIndex >= 0 ? myIndex + 1 : 0
  const selfRow = myIndex >= 0 ? leaderboard[myIndex] : undefined

  const now = new Date()
  const periodLabel = t('perf.yearMonth', { y: now.getFullYear(), m: now.getMonth() + 1 })
  const subline = [periodLabel, employee?.position || employee?.department].filter(Boolean).join(' · ')

  // 本月佣金明细：口径对齐 App——仅统计本月（created_at 当月）佣金，
  // 本月无记录时回落到最近记录，避免空白（对齐 App 的 monthSettlements/detailRows）
  const monthCommissions = useMemo(
    () =>
      commissions.filter((c) => {
        const d = new Date(String(c.created_at || ''))
        return (
          !Number.isNaN(d.getTime()) &&
          d.getFullYear() === now.getFullYear() &&
          d.getMonth() === now.getMonth()
        )
      }),
    [commissions]
  )
  const detailRows = useMemo(
    () => (monthCommissions.length > 0 ? monthCommissions : commissions).slice(0, 10),
    [monthCommissions, commissions]
  )

  // 本月佣金合计：对齐 App 的 settled/pending 口径，按结算状态在本月范围内真实汇总
  const totals = useMemo(() => {
    let paid = 0
    let pending = 0
    monthCommissions.forEach((c) => {
      const amt = Number(c.commission_amount || 0)
      if (c.status === 'paid') paid += amt
      else pending += amt
    })
    return { paid, pending, total: paid + pending }
  }, [monthCommissions])

  // 房源名：佣金 → 租约 → 房源
  const propNameOf = (c: Commission) => {
    const lease = leaseMap[String(c.lease_id || '')]
    const prop = lease ? propMap[String(lease.property_id || '')] : undefined
    if (!prop) return t('perf.propUnavailable')
    return prop.room_number || prop.address || t('prop.unnamed')
  }
  const leaseOf = (c: Commission) => leaseMap[String(c.lease_id || '')]

  // 年度汇总 & 月度趋势
  const yearRevenue = Number(summary.year_total || 0)
  const yearCommission = Number(summary.commission_total || 0)
  const yearDeals = Number(summary.deals_total || 0)
  const breakdown = [
    { key: 'new_rental', count: summary.new_rentals },
    { key: 'renewal', count: summary.renewals },
    { key: 'management', count: summary.management }
  ].filter((b) => Number(b.count || 0) > 0)
  const trendMax = Math.max(1, ...monthly.map((m) => Number(m.revenue || 0)))
  const BAR_MAX_H = 130

  const segItems: { key: ViewKey; label: string }[] = [
    { key: 'mine', label: t('perf.viewMine') },
    { key: 'agents', label: t('perf.agentsView') }
  ]
  if (isAdminLike) segItems.push({ key: 'partners', label: t('perf.partnersView') })

  const renderSeg = () => (
    <View className='perf-seg'>
      {segItems.map((s) => (
        <View
          key={s.key}
          className={`perf-seg__btn ${view === s.key ? 'perf-seg__btn--active' : ''}`}
          onClick={() => setView(s.key)}
        >
          <Text className={`perf-seg__text ${view === s.key ? 'perf-seg__text--active' : ''}`}>
            {s.label}
          </Text>
        </View>
      ))}
    </View>
  )

  const renderYear = () => (
    <View className='perf-year'>
      <View className='perf-year__head'>
        <Text className='perf-year__title'>{t('perf.yearSection')}</Text>
      </View>
      <View className='perf-year__stats'>
        <View className='perf-year__stat'>
          <Text className='perf-year__label'>{t('perf.yearRevenue')}</Text>
          <Text className='perf-year__value'>{fmtMoney(yearRevenue, summary.currency)}</Text>
        </View>
        <View className='perf-year__stat'>
          <Text className='perf-year__label'>{t('perf.yearCommission')}</Text>
          <Text className='perf-year__value'>{fmtMoney(yearCommission, summary.currency)}</Text>
        </View>
        <View className='perf-year__stat'>
          <Text className='perf-year__label'>{t('perf.yearDeals')}</Text>
          <Text className='perf-year__value'>{yearDeals}</Text>
        </View>
      </View>
      {breakdown.length > 0 && (
        <View className='perf-year__chips'>
          {breakdown.map((b) => (
            <View key={b.key} className='perf-year__chip'>
              <Text className='perf-year__chip-text'>{DEAL_TYPE_LABELS[b.key] || b.key} {b.count}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  )

  const renderTrend = () => {
    if (monthly.length === 0) return null
    return (
      <View className='perf-trend'>
        <Text className='perf-trend__title'>{t('perf.monthTrend')}</Text>
        <View className='perf-trend__row'>
          {monthly.map((m) => {
            const val = Number(m.revenue || 0)
            const h = Math.max(8, (val / trendMax) * BAR_MAX_H)
            const active =
              m.year === now.getFullYear() && m.month === now.getMonth() + 1
            return (
              <View key={`${m.year}-${m.month}`} className='perf-trend__col'>
                <View className='perf-trend__track'>
                  <View
                    className={`perf-trend__bar ${active ? 'perf-trend__bar--active' : ''}`}
                    style={{ height: `${h}rpx` }}
                  />
                </View>
                <Text className='perf-trend__month'>{t('perf.monthLabel', { m: m.month || 0 })}</Text>
                <Text className='perf-trend__deals'>{m.deals || 0}</Text>
              </View>
            )
          })}
        </View>
      </View>
    )
  }

  const renderAgentCard = (a: AgentRow) => (
    <View key={a.employee_id ?? a.employee_name} className='perf-agent'>
      <Text className='perf-agent__name'>{a.employee_name || '-'}</Text>
      <View className='perf-agent__stats'>
        <View className='perf-agent__stat'>
          <Text className='perf-agent__label'>{t('perf.agentRevenue')}</Text>
          <Text className='perf-agent__value'>{fmtMoney(a.total_revenue)}</Text>
        </View>
        <View className='perf-agent__stat'>
          <Text className='perf-agent__label'>{t('perf.agentCommission')}</Text>
          <Text className='perf-agent__value'>{fmtMoney(a.total_commission)}</Text>
        </View>
        <View className='perf-agent__stat'>
          <Text className='perf-agent__label'>{t('perf.agentDeals')}</Text>
          <Text className='perf-agent__value'>{Number(a.deals || 0)}</Text>
        </View>
      </View>
    </View>
  )

  const renderPartnerCard = (p: PartnerRow) => (
    <View key={p.partner_id ?? p.partner_name} className='perf-agent'>
      <Text className='perf-agent__name'>{p.partner_name || '-'}</Text>
      <View className='perf-agent__stats'>
        <View className='perf-agent__stat'>
          <Text className='perf-agent__label'>{t('perf.partnerRevenue')}</Text>
          <Text className='perf-agent__value'>{fmtMoney(p.total_revenue)}</Text>
        </View>
        <View className='perf-agent__stat'>
          <Text className='perf-agent__label'>{t('perf.partnerCommission')}</Text>
          <Text className='perf-agent__value'>{fmtMoney(p.total_commission)}</Text>
        </View>
        <View className='perf-agent__stat'>
          <Text className='perf-agent__label'>{t('perf.agentDeals')}</Text>
          <Text className='perf-agent__value'>{Number(p.deals || 0)}</Text>
        </View>
      </View>
    </View>
  )

  return (
    <View className='perf-page'>
      <ShellHeader title={t('nav.performance')} />
      <View className='page-container'>
        {renderSeg()}

        {view === 'agents' ? (
          agents.length === 0 ? (
            <View className='perf-state'>
              <Text className='perf-state__title'>{t('perf.noAgents')}</Text>
              <Text className='perf-state__desc'>{t('perf.noAgentsDesc')}</Text>
            </View>
          ) : (
            agents.map((a) => renderAgentCard(a))
          )
        ) : view === 'partners' ? (
          partners.length === 0 ? (
            <View className='perf-state'>
              <Text className='perf-state__title'>{t('perf.noPartners')}</Text>
              <Text className='perf-state__desc'>{t('perf.noPartnersDesc')}</Text>
            </View>
          ) : (
            partners.map((p) => renderPartnerCard(p))
          )
        ) : (
          <>
            {renderYear()}

            {/* 业绩概览 hero（4 项，均为真实数据） */}
            <View className='perf-hero'>
              <Text className='perf-hero__title'>{t('perf.monthPerf')}</Text>
              <Text className='perf-hero__sub'>{subline}</Text>
              <View className='perf-hero__stats'>
                <View className='perf-hero__stat'>
                  <Text className='perf-hero__stat-label'>{t('perf.monthDeals')}</Text>
                  <Text className='perf-hero__stat-value'>
                    {summary.month_deals ?? selfRow?.deals ?? '—'}
                    <Text className='perf-hero__stat-unit'>{t('home.dealUnit')}</Text>
                  </Text>
                </View>
                <View className='perf-hero__stat'>
                  <Text className='perf-hero__stat-label'>{t('perf.monthViewings')}</Text>
                  <Text className='perf-hero__stat-value'>
                    {viewingCount ?? '—'}
                    <Text className='perf-hero__stat-unit'>{t('perf.viewingUnit')}</Text>
                  </Text>
                </View>
                <View className='perf-hero__stat'>
                  <Text className='perf-hero__stat-label'>{t('perf.monthPerf')}</Text>
                  <Text className='perf-hero__stat-value'>
                    {summary.month_total !== undefined ? fmtMoney(summary.month_total) : '—'}
                  </Text>
                </View>
                <View className='perf-hero__stat'>
                  <Text className='perf-hero__stat-label'>{t('perf.myRank')}</Text>
                  <Text className='perf-hero__stat-value'>
                    {myRank > 0 ? myRank : '—'}
                    {myRank > 0 && leaderboard.length > 0 ? (
                      <Text className='perf-hero__stat-unit'>/{leaderboard.length}</Text>
                    ) : null}
                  </Text>
                </View>
              </View>
            </View>

            {renderTrend()}

            {/* 佣金明细 */}
            <View className='perf-section'>
              <View className='perf-section__head'>
                <Text className='perf-section__title'>{t('perf.commissionDetail')}</Text>
                <Text className='perf-section__sub'>{t('common.countBi', { n: detailRows.length })}</Text>
              </View>

              {loading && detailRows.length === 0 ? (
                <View className='perf-state perf-state--loading'>
                  <View className='perf-state__spinner' />
                  <Text className='perf-state__title'>{t('perf.loading')}</Text>
                </View>
              ) : detailRows.length === 0 ? (
                <View className='perf-state'>
                  <Text className='perf-state__title'>{t('perf.noCommissions')}</Text>
                  <Text className='perf-state__desc'>{t('perf.noCommissionsDesc')}</Text>
                </View>
              ) : (
                detailRows.map((c) => {
                  const st = SETTLE_META[c.status || ''] || {
                    label: c.status || '-',
                    cls: 'perf-tag--muted'
                  }
                  const lease = leaseOf(c)
                  return (
                    <View key={c.id} className='perf-com'>
                      <View className='perf-com__top'>
                        <Text className='perf-com__prop'>{propNameOf(c)}</Text>
                        <View className={`perf-tag ${st.cls}`}>
                          <Text>{st.label}</Text>
                        </View>
                      </View>
                      <Text className='perf-com__meta'>
                        {DEAL_TYPE_LABELS[c.deal_type || ''] || c.deal_type || t('perf.dealFallback')} ·{' '}
                        {lease?.monthly_rent
                          ? `${t('lease.monthlyRent')} ${fmtMoney(lease.monthly_rent, lease.currency)}`
                          : `${t('perf.commissionBase')} ${fmtMoney(c.commission_base, c.currency)}`}
                      </Text>
                      <View className='perf-com__bottom'>
                        <Text className='perf-com__rate'>{t('perf.commissionRate', { rate: fmtRate(c.commission_rate) })}</Text>
                        <Text className='perf-com__amount'>
                          {fmtMoney(c.commission_amount, c.currency)}
                        </Text>
                      </View>
                    </View>
                  )
                })
              )}
            </View>

            {/* 本月佣金合计 */}
            {monthCommissions.length > 0 && (
              <View className='perf-total'>
                <View className='perf-total__cells'>
                  <View className='perf-total__cell'>
                    <Text className='perf-total__label'>{t('perf.stPaid')}</Text>
                    <Text className='perf-total__value perf-total__value--paid'>
                      {fmtMoney(totals.paid, commissions[0]?.currency)}
                    </Text>
                  </View>
                  <View className='perf-total__cell'>
                    <Text className='perf-total__label'>{t('perf.stPending')}</Text>
                    <Text className='perf-total__value perf-total__value--pending'>
                      {fmtMoney(totals.pending, commissions[0]?.currency)}
                    </Text>
                  </View>
                </View>
                <View className='perf-total__sum'>
                  <Text className='perf-total__sum-label'>{t('perf.total')}</Text>
                  <Text className='perf-total__sum-value'>
                    {fmtMoney(totals.total, commissions[0]?.currency)}
                  </Text>
                </View>
              </View>
            )}

            {/* 业绩排行榜（原型无此区块，保留真实功能） */}
            <View className='perf-section'>
              <View className='perf-section__head'>
                <Text className='perf-section__title'>{t('perf.leaderboard')}</Text>
              </View>

              {leaderboard.length === 0 ? (
                <View className='perf-state'>
                  <Text className='perf-state__title'>{t('perf.noPerfData')}</Text>
                  <Text className='perf-state__desc'>{t('perf.noPerfDataDesc')}</Text>
                </View>
              ) : (
                leaderboard.map((item, index) => {
                  const rank = index + 1
                  return (
                    <View key={item.id} className={`rank-item ${item.is_self ? 'rank-item--self' : ''}`}>
                      <View className={`rank-badge ${rank <= 3 ? 'rank-badge--top' : ''}`}>
                        <Text className='rank-num'>{rank}</Text>
                      </View>
                      <View className='rank-info'>
                        <Text className='rank-name'>
                          {item.full_name || '—'}
                          {item.is_self ? t('perf.selfMark') : ''}
                        </Text>
                        <Text className='rank-deals'>
                          {item.position || item.department || ''} · {t('perf.dealCount', { n: item.deals })}
                        </Text>
                      </View>
                      <Text className={`rank-amount ${item.is_self ? 'rank-amount--self' : ''}`}>
                        {fmtMoney(item.performance)}
                      </Text>
                    </View>
                  )
                })
              )}
            </View>
          </>
        )}
      </View>
    </View>
  )
}