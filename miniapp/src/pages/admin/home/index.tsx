import { useState } from 'react'
import { View, Text, Input, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import {
  dashboardApi,
  commissionRulesApi
} from '@/services/api'
import './index.scss'

type Tab = 'overview' | 'recon' | 'commission'

interface ReconRow {
  property?: string
  received: number
  receivable: number
  overdue: number
  count: number
}

interface TrendRow {
  month: string
  revenue: number
  leases_new?: number
  leads_new?: number
  viewings_new?: number
}

interface CommissionRule {
  id: string
  name: string
  deal_type: string
  rate: number
  scope?: string
  is_active?: boolean
  cap_amount?: number
  minimum_amount?: number
  description?: string
}

interface Summary {
  total_properties?: number
  vacant?: number
  rented?: number
  maintenance?: number
  expiring_leases?: number
  upcoming_payments?: number
  monthly_revenue?: number
  active_lease_revenue?: number
  occupancy_rate?: number
  active_leads?: number
  closed_leads?: number
  conversion_rate?: number
  [key: string]: any
}

interface ExpiringLease {
  id: string
  property_name?: string
  tenant_name?: string
  monthly_rent?: number
  currency?: string
  end_date?: string
  days_left?: number
}

const pick = (res: any, key?: string): any => {
  const d = res?.data ?? res
  if (key) return d?.[key] ?? (Array.isArray(d) ? d : [])
  return d
}

const fmtMoney = (v: number | undefined, currency?: string) => {
  const sym: Record<string, string> = { CNY: '¥', THB: '฿', EUR: '€', USD: '$' }
  return `${sym[currency || 'THB'] || '¥'}${Number(v || 0).toLocaleString()}`
}

const DEAL_TYPE: Record<string, string> = {
  new_rental: '新租',
  renewal: '续约',
  purchase: '购房',
  sale: '出租'
}
const SCOPE: Record<string, string> = {
  all_employees: '全体员工',
  department: '部门',
  individual: '个人'
}

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'overview', label: '运营概览', icon: '📊' },
  { key: 'recon', label: '财务对账', icon: '💰' },
  { key: 'commission', label: '佣金规则', icon: '⚙️' },
]

function StateView({
  loading,
  icon,
  title,
  desc
}: {
  loading: boolean
  icon: string
  title: string
  desc: string
}) {
  if (loading) {
    return (
      <View className='adm-state adm-state--loading'>
        <View className='adm-state__spinner' />
        <Text className='adm-state__title'>正在加载</Text>
      </View>
    )
  }
  return (
    <View className='adm-state'>
      <View className='adm-state__icon'>{icon}</View>
      <Text className='adm-state__title'>{title}</Text>
      <Text className='adm-state__desc'>{desc}</Text>
    </View>
  )
}

export default function AdminHomePage() {
  const user = useAuthStore((state) => state.user)
  const [tab, setTab] = useState<Tab>('overview')
  const [loading, setLoading] = useState(false)

  // 运营概览
  const [summary, setSummary] = useState<Summary>({})
  const [expiring, setExpiring] = useState<ExpiringLease[]>([])
  // 财务对账
  const [recon, setRecon] = useState<{ totals: any; by_property: ReconRow[]; records: any[] }>({
    totals: {},
    by_property: [],
    records: []
  })
  // 运营趋势（并入运营概览，仅下拉纳入 6 个月迷你图）
  const [homeTrend, setHomeTrend] = useState<TrendRow[]>([])
  // 佣金规则
  const [rules, setRules] = useState<CommissionRule[]>([])
  const [ruleForm, setRuleForm] = useState({
    name: '',
    deal_type: 'new_rental',
    rate: '5'
  })

  const fetchOverview = async () => {
    setLoading(true)
    try {
      const [sumRes, expRes] = await Promise.all([
        dashboardApi.summary().catch(() => ({ data: {} })),
        dashboardApi.expiringLeases().catch(() => ({ data: { items: [] } }))
      ])
      const sumD = pick(sumRes)
      setSummary(Object.keys(sumD).length ? sumD : {})
      const items = pick(expRes, 'items')
      setExpiring(Array.isArray(items) ? items : [])
    } catch (e) {
      Taro.showToast({ title: '加载概览失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  const fetchRecon = async () => {
    setLoading(true)
    try {
      const res = await dashboardApi.financialReconciliation()
      const d = pick(res, 'by_property')
      setRecon({
        totals: pick(res, 'totals') ?? {},
        by_property: Array.isArray(d) ? d : [],
        records: Array.isArray(pick(res, 'records')) ? pick(res, 'records') : []
      })
    } catch (e) {
      Taro.showToast({ title: '加载对账失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  // 首页增强：收入趋势 + 财务对账概要
  const fetchHomeCards = async () => {
    try {
      const [trendRes, reconRes] = await Promise.all([
        dashboardApi.trend({ months: 6 }),
        dashboardApi.financialReconciliation()
      ])
      const s = pick(trendRes, 'series')
      setHomeTrend(Array.isArray(s) ? s.slice(-6) : [])
      const totals = pick(reconRes, 'totals')
      setRecon((r) => ({ ...r, totals: totals ?? {} }))
    } catch (e) {
      console.error('[AdminHome] 加载首页卡片失败', e)
    }
  }

  const fetchRules = async () => {
    setLoading(true)
    try {
      const res: any = await commissionRulesApi.list({})
      const items = pick(res, 'items') ?? (Array.isArray(res?.data) ? res.data : [])
      setRules(items)
    } catch (e) {
      Taro.showToast({ title: '加载佣金规则失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  const switchTab = (t: Tab) => {
    setTab(t)
    if (t === 'overview' && Object.keys(summary).length === 0) fetchOverview()
    if (t === 'recon' && recon.by_property.length === 0) fetchRecon()
    if (t === 'commission' && rules.length === 0) fetchRules()
  }

  useDidShow(() => {
    if (!useAuthStore.getState().token) {
      Taro.redirectTo({ url: '/pages/login/index' })
      return
    }
    fetchOverview()
    fetchHomeCards()
  })

  const homeMaxRevenue = Math.max(...homeTrend.map((r) => Number(r.revenue || 0)), 1)
  const hasHomeChart = homeTrend.some((r) => Number(r.revenue || 0) > 0)
  const shortHomeMonth = (m: string) => `${Number(String(m).split('-').pop() || 0)}月`

  const addRule = async () => {
    if (!ruleForm.name || !ruleForm.rate) {
      Taro.showToast({ title: '请填写完整', icon: 'none' })
      return
    }
    try {
      await commissionRulesApi.create({
        name: ruleForm.name,
        deal_type: ruleForm.deal_type,
        rate: Number(ruleForm.rate)
      })
      Taro.showToast({ title: '已创建', icon: 'success' })
      setRuleForm({ name: '', deal_type: 'new_rental', rate: '5' })
      fetchRules()
    } catch (e) {
      Taro.showToast({ title: '创建失败', icon: 'none' })
    }
  }

  return (
    <View className='adm-home'>
      {/* 顶部欢迎区 */}
      <View className='adm-hero'>
        <View className='adm-hero__left'>
          <Text className='adm-hero__hi'>管理员工作台 👋</Text>
          <Text className='adm-hero__sub'>你好，{user?.name || '管理员'} · 系统管理权限</Text>
        </View>
        <View className='adm-hero__badge'>
          <Text className='adm-hero__badge-text'>ADMIN</Text>
        </View>
      </View>

      {/* Tab 导航 */}
      <ScrollView scrollX className='adm-tabs' showScrollbar={false}>
        {TABS.map((t) => (
          <View
            key={t.key}
            className={`adm-tab ${tab === t.key ? 'adm-tab--active' : ''}`}
            onClick={() => switchTab(t.key)}
          >
            <Text className='adm-tab__icon'>{t.icon}</Text>
            <Text className='adm-tab__label'>{t.label}</Text>
          </View>
        ))}
      </ScrollView>

      {/* 运营专项入口 */}
      <View className='adm-special'>
        <View className='adm-special__head'>
          <Text className='adm-special__title'>运营专项</Text>
          <Text className='adm-special__hint'>深度工具</Text>
        </View>
        <ScrollView scrollX className='adm-special__capsules' showScrollbar={false}>
          <View
            className='adm-special__cap'
            hoverClass='adm-special__cap--hover'
            onClick={() => Taro.navigateTo({ url: '/pages/admin/reconciliation/index' })}
          >
            <Text className='adm-special__cap-icon'>💰</Text>
            <View className='adm-special__cap-body'>
              <Text className='adm-special__cap-title'>财务对账</Text>
              <Text className='adm-special__cap-desc'>实收 逾期 分房源</Text>
            </View>
          </View>
          <View
            className='adm-special__cap'
            hoverClass='adm-special__cap--hover'
            onClick={() => Taro.navigateTo({ url: '/pages/admin/trend/index' })}
          >
            <Text className='adm-special__cap-icon'>📈</Text>
            <View className='adm-special__cap-body'>
              <Text className='adm-special__cap-title'>运营趋势</Text>
              <Text className='adm-special__cap-desc'>12 个月走势</Text>
            </View>
          </View>
          <View
            className='adm-special__cap'
            hoverClass='adm-special__cap--hover'
            onClick={() => Taro.navigateTo({ url: '/pages/admin/review/index' })}
          >
            <Text className='adm-special__cap-icon'>✓</Text>
            <View className='adm-special__cap-body'>
              <Text className='adm-special__cap-title'>工单审核</Text>
              <Text className='adm-special__cap-desc'>外勤 · 报修 · 订单</Text>
            </View>
          </View>
          <View
            className='adm-special__cap'
            hoverClass='adm-special__cap--hover'
            onClick={() => Taro.navigateTo({ url: '/pages/admin/accounts/index' })}
          >
            <Text className='adm-special__cap-icon'>👤</Text>
            <View className='adm-special__cap-body'>
              <Text className='adm-special__cap-title'>账号管理</Text>
              <Text className='adm-special__cap-desc'>启停 · 重置密码</Text>
            </View>
          </View>
        </ScrollView>
      </View>

      <View className='adm-content'>
        {/* ===== 运营概览 ===== */}
        {tab === 'overview' && (
          <View>
            {/* 核心数据 */}
            <View className='adm-stats-primary'>
              <View className='adm-stat-card adm-stat-card--primary'>
                <View className='adm-stat-card__icon'>🏠</View>
                <Text className='adm-stat-card__num'>{summary.total_properties ?? '-'}</Text>
                <Text className='adm-stat-card__label'>房源总数</Text>
              </View>
              <View className='adm-stat-card adm-stat-card--success'>
                <View className='adm-stat-card__icon'>📈</View>
                <Text className='adm-stat-card__num'>{summary.occupancy_rate ?? 0}%</Text>
                <Text className='adm-stat-card__label'>入住率</Text>
              </View>
              <View className='adm-stat-card adm-stat-card--warning'>
                <View className='adm-stat-card__icon'>⏰</View>
                <Text className='adm-stat-card__num'>{summary.expiring_leases ?? 0}</Text>
                <Text className='adm-stat-card__label'>到期合同</Text>
              </View>
            </View>

            {/* 次级数据 */}
            <View className='adm-stats-row'>
              <View className='adm-stat-mini'>
                <Text className='adm-stat-mini__num adm-stat-mini__num--warning'>
                  {summary.vacant ?? '-'}
                </Text>
                <Text className='adm-stat-mini__label'>空置</Text>
              </View>
              <View className='adm-stat-mini'>
                <Text className='adm-stat-mini__num adm-stat-mini__num--success'>
                  {summary.rented ?? '-'}
                </Text>
                <Text className='adm-stat-mini__label'>已出租</Text>
              </View>
              <View className='adm-stat-mini'>
                <Text className='adm-stat-mini__num adm-stat-mini__num--error'>
                  {summary.upcoming_payments ?? '-'}
                </Text>
                <Text className='adm-stat-mini__label'>待收款</Text>
              </View>
              <View className='adm-stat-mini'>
                <Text className='adm-stat-mini__num adm-stat-mini__num--primary'>
                  {summary.maintenance ?? '-'}
                </Text>
                <Text className='adm-stat-mini__label'>维护中</Text>
              </View>
            </View>

            {/* 本月营收 */}
            <View className='adm-revenue-card'>
              <View className='adm-revenue-card__left'>
                <Text className='adm-revenue-card__label'>本月已收租金</Text>
                <Text className='adm-revenue-card__num'>{fmtMoney(summary.monthly_revenue)}</Text>
                <Text className='adm-revenue-card__sub'>
                  在租合同营收 {fmtMoney(summary.active_lease_revenue)}
                </Text>
              </View>
              <View className='adm-revenue-card__icon'>💰</View>
            </View>

            {/* 临期租约 */}
            <View className='adm-section'>
              <View className='adm-section__head'>
                <Text className='adm-section__title'>临期租约</Text>
                <Text className='adm-section__hint'>30 天内到期</Text>
              </View>
              {expiring.length === 0 ? (
                <StateView loading={loading} icon='📋' title='无临期租约' desc='近期到期的租约将在此展示' />
              ) : (
                <View className='adm-expire-list'>
                  {expiring.map((e: any) => {
                    const days = Number(e.days_left ?? 0)
                    const urgent = days <= 7
                    return (
                      <View key={e.id} className='adm-expire-item'>
                        <View className='adm-expire-item__main'>
                          <Text className='adm-expire-item__title'>
                            {e.property_name || '-'}
                          </Text>
                          <Text className='adm-expire-item__sub'>
                            租客：{e.tenant_name || '-'}
                          </Text>
                        </View>
                        <View className='adm-expire-item__right'>
                          <View
                            className={`adm-tag ${urgent ? 'adm-tag--error' : 'adm-tag--warning'}`}
                          >
                            <Text>{days} 天</Text>
                          </View>
                          <Text className='adm-expire-item__rent'>
                            {fmtMoney(e.monthly_rent, e.currency)}
                          </Text>
                        </View>
                      </View>
                    )
                  })}
                </View>
              )}
            </View>

            {/* 收入趋势卡 */}
            <View className='adm-home-trend'>
              <View className='adm-section__head'>
                <Text className='adm-section__title'>收入趋势</Text>
                <Text className='adm-section__hint'>近 6 个月</Text>
              </View>
              {hasHomeChart ? (
                <View className='adm-home-chart'>
                  {homeTrend.map((r, i) => {
                    const h = Math.max((Number(r.revenue || 0) / homeMaxRevenue) * 100, 2)
                    const active = Number(r.revenue || 0) > 0
                    return (
                      <View key={r.month} className='adm-home-chart__col'>
                        <View
                          className={`adm-home-chart__bar ${active ? 'adm-home-chart__bar--active' : ''}`}
                          style={{ height: `${h}%` }}
                        />
                        <Text className='adm-home-chart__label'>{shortHomeMonth(r.month)}</Text>
                      </View>
                    )
                  })}
                </View>
              ) : (
                <View className='adm-home-chart__empty'>运营数据将在积累后展示</View>
              )}
            </View>

            {/* 财务对账概要卡 */}
            <View className='adm-recon' onClick={() => Taro.navigateTo({ url: '/pages/admin/reconciliation/index' })}>
              <View className='adm-section__head'>
                <Text className='adm-section__title'>财务对账概览</Text>
                <Text className='adm-section__hint'>查看明细 ›</Text>
              </View>
              <View className='adm-recon__row'>
                <View className='adm-recon__cell adm-recon__cell--success'>
                  <Text className='adm-recon__num'>{fmtMoney(recon.totals?.received)}</Text>
                  <Text className='adm-recon__label'>实收</Text>
                </View>
                <View className='adm-recon__cell adm-recon__cell--warning'>
                  <Text className='adm-recon__num'>{fmtMoney(recon.totals?.receivable)}</Text>
                  <Text className='adm-recon__label'>待收</Text>
                </View>
                <View className='adm-recon__cell adm-recon__cell--error'>
                  <Text className='adm-recon__num'>{fmtMoney(recon.totals?.overdue)}</Text>
                  <Text className='adm-recon__label'>逾期</Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* ===== 财务对账 ===== */}
        {tab === 'recon' && (
          <View>
            <View className='adm-stats-primary'>
              <View className='adm-stat-card adm-stat-card--success'>
                <Text className='adm-stat-card__num'>{fmtMoney(recon.totals?.received)}</Text>
                <Text className='adm-stat-card__label'>已收款</Text>
              </View>
              <View className='adm-stat-card adm-stat-card--warning'>
                <Text className='adm-stat-card__num'>{fmtMoney(recon.totals?.receivable)}</Text>
                <Text className='adm-stat-card__label'>应收未收</Text>
              </View>
              <View className='adm-stat-card adm-stat-card--error'>
                <Text className='adm-stat-card__num'>{fmtMoney(recon.totals?.overdue)}</Text>
                <Text className='adm-stat-card__label'>逾期</Text>
              </View>
            </View>

            <View className='adm-section'>
              <View className='adm-section__head'>
                <Text className='adm-section__title'>按房源对账</Text>
              </View>
              {recon.by_property.length === 0 ? (
                <StateView loading={loading} icon='📊' title='暂无数据' desc='完成房源收款后在此对账' />
              ) : (
                <View className='adm-table'>
                  <View className='adm-table__row adm-table__row--head'>
                    <Text className='adm-table__cell adm-table__cell--left'>房源</Text>
                    <Text className='adm-table__cell'>已收</Text>
                    <Text className='adm-table__cell'>逾期</Text>
                  </View>
                  {recon.by_property.map((r: any, i: number) => (
                    <View key={i} className='adm-table__row'>
                      <Text className='adm-table__cell adm-table__cell--left'>{r.property || '-'}</Text>
                      <Text className='adm-table__cell'>{fmtMoney(r.received)}</Text>
                      <Text className='adm-table__cell adm-table__cell--error'>
                        {fmtMoney(r.overdue)}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </View>
        )}

        {/* ===== 佣金规则 ===== */}
        {tab === 'commission' && (
          <View>
            <View className='adm-section'>
              <View className='adm-section__head'>
                <Text className='adm-section__title'>新增规则</Text>
              </View>
              <View className='adm-form-card'>
                <View className='adm-form-item'>
                  <Text className='adm-form-label'>规则名称</Text>
                  <Input
                    className='adm-form-input'
                    placeholder='如：新签成交佣'
                    value={ruleForm.name}
                    onInput={(e) => setRuleForm({ ...ruleForm, name: e.detail.value })}
                  />
                </View>
                <View className='adm-form-item'>
                  <Text className='adm-form-label'>交易类型</Text>
                  <View className='adm-chip-row'>
                    {Object.keys(DEAL_TYPE).map((k) => (
                      <View
                        key={k}
                        className={`adm-chip ${ruleForm.deal_type === k ? 'adm-chip--active' : ''}`}
                        onClick={() => setRuleForm({ ...ruleForm, deal_type: k })}
                      >
                        <Text>{DEAL_TYPE[k]}</Text>
                      </View>
                    ))}
                  </View>
                </View>
                <View className='adm-form-item'>
                  <Text className='adm-form-label'>佣金比例 %</Text>
                  <Input
                    className='adm-form-input'
                    type='digit'
                    placeholder='请输入比例'
                    value={ruleForm.rate}
                    onInput={(e) => setRuleForm({ ...ruleForm, rate: e.detail.value })}
                  />
                </View>
                <View className='adm-submit-btn' onClick={addRule}>
                  <Text className='adm-submit-btn__text'>新增规则</Text>
                </View>
              </View>
            </View>

            <View className='adm-section'>
              <View className='adm-section__head'>
                <Text className='adm-section__title'>已有规则</Text>
                <Text className='adm-section__hint'>共 {rules.length} 条</Text>
              </View>
              {rules.length === 0 ? (
                <StateView loading={loading} icon='⚙️' title='暂无佣金规则' desc='新增一条规则即可生效' />
              ) : (
                <View className='adm-rule-list'>
                  {rules.map((r) => (
                    <View key={r.id} className='adm-rule-card'>
                      <View className='adm-rule-card__head'>
                        <Text className='adm-rule-card__name'>{r.name}</Text>
                        <View
                          className={`adm-tag ${r.is_active === false ? 'adm-tag--warning' : 'adm-tag--success'}`}
                        >
                          <Text>{r.is_active === false ? '停用' : '启用'}</Text>
                        </View>
                      </View>
                      <View className='adm-rule-card__meta'>
                        <View className='adm-rule-card__meta-item'>
                          <Text className='adm-rule-card__meta-label'>类型</Text>
                          <Text className='adm-rule-card__meta-value'>
                            {DEAL_TYPE[r.deal_type] || r.deal_type}
                          </Text>
                        </View>
                        <View className='adm-rule-card__meta-item'>
                          <Text className='adm-rule-card__meta-label'>比例</Text>
                          <Text className='adm-rule-card__meta-value adm-rule-card__meta-value--primary'>
                            {r.rate}%
                          </Text>
                        </View>
                        <View className='adm-rule-card__meta-item'>
                          <Text className='adm-rule-card__meta-label'>范围</Text>
                          <Text className='adm-rule-card__meta-value'>
                            {SCOPE[r.scope || ''] || '全体员工'}
                          </Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </View>
        )}
      </View>
    </View>
  )
}
