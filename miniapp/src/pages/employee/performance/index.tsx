import { useMemo, useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { employeesApi, performanceApi, commissionsApi, leasesApi, propertiesApi, viewingsApi } from '@/services/api'
import './index.scss'
import { useI18n } from '@/i18n'

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
  month_deals?: number
  month_total?: number
  month_commission?: number
  deals_total?: number
  commission_total?: number
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
  const [leaderboard, setLeaderboard] = useState<RankItem[]>([])
  const [employee, setEmployee] = useState<EmployeeInfo | null>(null)
  const [summary, setSummary] = useState<PerfSummary>({})
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
      const [lbRes, meRes, pfRes, cmRes, vwRes, lsRes, ppRes]: any[] = await Promise.all([
        employeesApi.leaderboard().catch(() => ({ data: [] })),
        employeesApi.me().catch(() => ({ data: {} })),
        performanceApi.me().catch(() => ({ data: {} })),
        commissionsApi.mine({ page: 1, page_size: 100 }).catch(() => ({ data: [] })),
        viewingsApi.list({ page_size: 100 }).catch(() => ({ data: [] })),
        leasesApi.list({ page: 1, page_size: 100 }).catch(() => ({ data: [] })),
        propertiesApi.list({ page: 1, page_size: 100 }).catch(() => ({ data: [] }))
      ])

      const lb = pick(lbRes)
      setLeaderboard(Array.isArray(lb) ? lb : [])
      const me = pick(meRes)
      setEmployee(me && typeof me === 'object' ? me : null)

      const sum = pick(pfRes, 'summary')
      setSummary(sum && typeof sum === 'object' ? sum : {})

      setCommissions(pickList(cmRes))

      const ls = pickList(lsRes)
      const lMap: Record<string, any> = {}
      ls.forEach((l: any) => {
        lMap[String(l.id)] = l
      })
      setLeaseMap(lMap)

      const pp = pickList(ppRes)
      const pMap: Record<string, any> = {}
      pp.forEach((p: any) => {
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

  return (
    <View className='perf-page'>
      <View className='page-container'>
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
      </View>
    </View>
  )
}