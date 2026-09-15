import { useState } from 'react'
import { View, Text, Input, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import {
  dashboardApi,
  commissionRulesApi,
  brokerApi,
  employeesApi
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
  broker_id?: string
  employee_id?: string
  department?: string
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
  by_department: '部门',
  department: '部门',
  by_employee: '个人',
  individual: '个人',
  by_broker: '按分销商'
}

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'overview', label: '运营概览', icon: '📊' },
  { key: 'recon', label: '财务对账', icon: '💰' },
  { key: 'commission', label: '佣金设置', icon: '⚙️' },
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

interface DropOption {
  key: string
  label: string
}

// 展开式搜索下拉（支持角色层级选择）
function SearchDrop({
  label,
  value,
  options,
  open,
  onToggle,
  onSelect,
  searchable,
  hint
}: {
  label: string
  value: string
  options: DropOption[]
  open: boolean
  onToggle: () => void
  onSelect: (key: string) => void
  searchable?: boolean
  hint?: string
}) {
  const [kw, setKw] = useState('')
  const filtered = kw.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(kw.trim().toLowerCase()))
    : options
  const current = options.find((o) => o.key === value)
  return (
    <View className='adm-form-item'>
      <Text className='adm-form-label'>{label}</Text>
      <View className='adm-select-value' onClick={onToggle}>
        <Text className={current ? 'adm-select-value__text' : 'adm-select-value__text adm-select-value__text--placeholder'}>
          {current ? current.label : `请选择${label}`}
        </Text>
        <Text className='adm-select-value__arrow'>{open ? '▴' : '▾'}</Text>
      </View>
      {hint && <Text className='adm-form-hint'>{hint}</Text>}
      {open && (
        <View className='adm-drop-menu'>
          {searchable && (
            <Input
              className='adm-drop-search'
              placeholder='搜索...'
              value={kw}
              onInput={(e) => setKw(e.detail.value)}
            />
          )}
          {filtered.length === 0 && <Text className='adm-drop-empty'>无匹配选项</Text>}
          {filtered.map((o) => (
            <View
              key={o.key}
              className={`adm-drop-option ${value === o.key ? 'adm-drop-option--active' : ''}`}
              onClick={() => {
                setKw('')
                onSelect(o.key)
                onToggle()
              }}
            >
              <Text>{o.label}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}

export default function AdminHomePage() {
  const user = useAuthStore((state) => state.user)
  // 角色：管理员可选全部层级；分销商管理员仅本渠道 + 本渠道员工
  const isAdmin = user?.role === 'admin'
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
  const [brokers, setBrokers] = useState<any[]>([])
  const [employees, setEmployees] = useState<any[]>([])
  const [openDrop, setOpenDrop] = useState('') // '' | 'scope' | 'broker' | 'employee'
  const [dropKw, setDropKw] = useState('')
  const [ruleForm, setRuleForm] = useState({
    name: '',
    deal_type: 'new_rental',
    rate: '5',
    scope: 'all_employees',
    broker_id: '',
    employee_id: '',
    broker_employee_id: '',
    department: ''
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
      // 分销商/员工列表（按分销商/按员工差异化定价选项）
      const [broRes, empRes]: any[] = await Promise.all([
        brokerApi.list({ page_size: 100 }).catch(() => ({ data: { items: [] } })),
        employeesApi.list({ page: 1, page_size: 100 }).catch(() => ({ data: { items: [] } }))
      ])
      setBrokers((broRes?.data?.items ?? []) as any[])
      const empD = empRes?.data ?? {}
      setEmployees((empD.items ?? empD ?? []) as any[])
    } catch (e) {
      Taro.showToast({ title: '加载佣金设置失败', icon: 'none' })
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
    if (ruleForm.scope === 'by_broker' && isAdmin && !ruleForm.broker_id) {
      Taro.showToast({ title: '请选择分销商', icon: 'none' })
      return
    }
    if (ruleForm.scope === 'by_employee' && isAdmin && !ruleForm.employee_id) {
      Taro.showToast({ title: '请选择员工', icon: 'none' })
      return
    }
    if (ruleForm.scope === 'broker_employee') {
      if (!ruleForm.broker_id) {
        Taro.showToast({ title: '请先选择分销商', icon: 'none' })
        return
      }
      if (!ruleForm.broker_employee_id) {
        Taro.showToast({ title: '请选择该分销商的员工', icon: 'none' })
        return
      }
    }
    if (ruleForm.scope === 'by_department' && !ruleForm.department) {
      Taro.showToast({ title: '请输入部门名称', icon: 'none' })
      return
    }
    try {
      await commissionRulesApi.create({
        name: ruleForm.name,
        deal_type: ruleForm.deal_type,
        rate: Number(ruleForm.rate),
        scope: ruleForm.scope === 'broker_employee' ? 'by_employee' : ruleForm.scope,
        broker_id:
          ruleForm.scope === 'broker_employee'
            ? ruleForm.broker_id
            : ruleForm.scope === 'by_broker' && isAdmin
              ? ruleForm.broker_id
              : undefined,
        employee_id:
          ruleForm.scope === 'broker_employee'
            ? ruleForm.broker_employee_id
            : ruleForm.scope === 'by_employee'
              ? ruleForm.employee_id
              : undefined,
        department: ruleForm.scope === 'by_department' ? ruleForm.department : undefined
      })
      Taro.showToast({ title: '已创建', icon: 'success' })
      setRuleForm({
        name: '',
        deal_type: 'new_rental',
        rate: '5',
        scope: isAdmin ? 'all_employees' : 'by_broker',
        broker_id: '',
        employee_id: '',
        broker_employee_id: '',
        department: ''
      })
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
            onClick={() => Taro.navigateTo({ url: '/pages/admin/ops/index' })}
          >
            <Text className='adm-special__cap-icon'>📊</Text>
            <View className='adm-special__cap-body'>
              <Text className='adm-special__cap-title'>运营看板</Text>
              <Text className='adm-special__cap-desc'>漏斗 · 活跃 · 分国数据</Text>
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
                <Text className='adm-section__title'>新增设置</Text>
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
                {isAdmin ? (
                    <SearchDrop
                      label='适用对象'
                      value={ruleForm.scope}
                      options={[
                        { key: 'all_employees', label: '全体员工' },
                        { key: 'by_department', label: '部门' },
                        { key: 'by_employee', label: '员工' },
                        { key: 'by_broker', label: '分销商' },
                        { key: 'broker_employee', label: '分销商员工' }
                      ]}
                      open={openDrop === 'scope'}
                      onToggle={() => setOpenDrop(openDrop === 'scope' ? '' : 'scope')}
                      onSelect={(k) => {
                        setRuleForm({
                          ...ruleForm,
                          scope: k,
                          broker_id: '',
                          employee_id: '',
                          broker_employee_id: '',
                          department: ''
                        })
                      }}
                    />
                  ) : (
                    <SearchDrop
                      label='适用对象'
                      value={ruleForm.scope}
                      options={[
                        { key: 'by_broker', label: '本渠道（差异化定价）' },
                        { key: 'by_employee', label: '本渠道员工' }
                      ]}
                      open={openDrop === 'scope'}
                      onToggle={() => setOpenDrop(openDrop === 'scope' ? '' : 'scope')}
                      onSelect={(k) => {
                        setRuleForm({ ...ruleForm, scope: k, broker_id: '', employee_id: '' })
                      }}
                      hint='分销商管理员仅可为本渠道及本渠道员工配置差异化费率'
                    />
                  )}
                </View>
                {(ruleForm.scope === 'by_broker' || ruleForm.scope === 'broker_employee') && isAdmin && brokers.length > 0 && (
                  <SearchDrop
                    label='选择分销商'
                    value={ruleForm.broker_id}
                    options={brokers.map((b) => ({ key: b.id, label: b.partner_name || b.name }))}
                    open={openDrop === 'broker'}
                    onToggle={() => setOpenDrop(openDrop === 'broker' ? '' : 'broker')}
                    onSelect={(k) => {
                      setRuleForm({ ...ruleForm, broker_id: k, broker_employee_id: '' })
                    }}
                    searchable
                  />
                )}
                {(ruleForm.scope === 'by_employee' || ruleForm.scope === 'broker_employee') && employees.length > 0 && (
                  <SearchDrop
                    label={
                      ruleForm.scope === 'broker_employee'
                        ? isAdmin
                          ? '该分销商员工'
                          : '本渠道员工'
                        : isAdmin
                          ? '员工'
                          : '本渠道员工'
                    }
                    value={
                      ruleForm.scope === 'broker_employee' ? ruleForm.broker_employee_id : ruleForm.employee_id
                    }
                    options={(ruleForm.scope === 'broker_employee' && isAdmin && ruleForm.broker_id
                      ? employees.filter((e) => e.broker_id === ruleForm.broker_id)
                      : employees
                    ).map((e) => ({ key: e.id, label: e.full_name || e.name }))}
                    open={openDrop === 'employee'}
                    onToggle={() => setOpenDrop(openDrop === 'employee' ? '' : 'employee')}
                    onSelect={(k) => {
                      if (ruleForm.scope === 'broker_employee') {
                        setRuleForm({ ...ruleForm, broker_employee_id: k })
                      } else {
                        setRuleForm({ ...ruleForm, employee_id: k })
                      }
                    }}
                    searchable
                  />
                )}
                {ruleForm.scope === 'by_department' && isAdmin && (
                  <View className='adm-form-item'>
                    <Text className='adm-form-label'>部门名称</Text>
                    <Input
                      className='adm-form-input'
                      placeholder='如：租赁部'
                      value={ruleForm.department}
                      onInput={(e) => setRuleForm({ ...ruleForm, department: e.detail.value })}
                    />
                  </View>
                )}
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
                  <Text className='adm-submit-btn__text'>新增设置</Text>
                </View>
              </View>
            </View>

            <View className='adm-section'>
              <View className='adm-section__head'>
                <Text className='adm-section__title'>已有设置</Text>
                <Text className='adm-section__hint'>共 {rules.length} 条</Text>
              </View>
              {rules.length === 0 ? (
                <StateView loading={loading} icon='⚙️' title='暂无佣金设置' desc='新增一条设置即可生效' />
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
                          <Text className='adm-rule-card__meta-label'>适用对象</Text>
                          <Text className='adm-rule-card__meta-value'>
                            {r.scope === 'by_broker'
                              ? (brokers.find((b) => b.id === r.broker_id)?.partner_name ||
                                brokers.find((b) => b.id === r.broker_id)?.name) || '按分销商'
                              : r.scope === 'by_employee'
                                ? (employees.find((e) => e.id === r.employee_id)?.full_name ||
                                  employees.find((e) => e.id === r.employee_id)?.name) || '个人'
                                : r.scope === 'by_department'
                                  ? r.department || '部门'
                                  : SCOPE[r.scope || ''] || '全体员工'}
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
