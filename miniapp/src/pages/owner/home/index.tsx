import { useState } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { ownerApi } from '@/services/api'
import type { Property, PropertyStatus } from '@/types'
import './index.scss'

const STATUS_CLASS: Record<PropertyStatus, string> = {
  vacant: 'property-status--vacant',
  rented: 'property-status--rented',
  reserved: 'property-status--reserved'
}

const STATUS_TEXT: Record<PropertyStatus, string> = {
  vacant: '空置',
  rented: '已出租',
  reserved: '已预订'
}

// 从接口返回中提取房源列表，兼容多种结构
function pickList(res: any): Property[] {
  if (Array.isArray(res)) return res
  if (Array.isArray(res?.data)) return res.data
  if (Array.isArray(res?.items)) return res.items
  if (Array.isArray(res?.list)) return res.list
  if (Array.isArray(res?.data?.items)) return res.data.items
  if (Array.isArray(res?.data?.list)) return res.data.list
  return []
}

interface MonthlyRow {
  month: string
  received: number
  pending?: number
  overdue?: number
  count?: number
}

interface IncomeData {
  monthlyIncome: number
  totalIncome: number
  pendingIncome: number
  overdueIncome: number
}

const pickIncome = (res: any): IncomeData => {
  const d = res?.data ?? res ?? {}
  return {
    monthlyIncome: Number(d.monthlyIncome ?? 0),
    totalIncome: Number(d.totalIncome ?? 0),
    pendingIncome: Number(d.pendingIncome ?? 0),
    overdueIncome: Number(d.overdueIncome ?? 0)
  }
}

const pickMonthly = (res: any): MonthlyRow[] => {
  const d = res?.data ?? res ?? {}
  const arr = Array.isArray(d?.by_month) ? d.by_month : []
  return arr
}

const fmtMoney = (v: number) =>
  Number(v || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// 快捷入口
const QUICK_ENTRIES = [
  { icon: '💳', label: '我的付款', desc: '账单到账', url: '/pages/owner/payments/index' },
  { icon: '📊', label: '收益分析', desc: '收支汇总', url: '/pages/owner/income/index' },
  { icon: '📋', label: '委托挂牌', desc: '发布房源', url: '/pages/owner/marketing/index' },
  { icon: '📢', label: '房产营销', desc: '推广定价', url: '/pages/owner/marketing/index' }
]

export default function OwnerHomePage() {
  const user = useAuthStore((state) => state.user)
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)
  const [properties, setProperties] = useState<Property[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [income, setIncome] = useState<IncomeData>({
    monthlyIncome: 0,
    totalIncome: 0,
    pendingIncome: 0,
    overdueIncome: 0
  })
  const [monthly, setMonthly] = useState<MonthlyRow[]>([])

  const fetchProperties = async () => {
    setLoading(true)
    try {
      const res = await ownerApi.properties()
      setProperties(pickList(res))
    } catch (error) {
      console.error('[OwnerHome] 获取房源失败', error)
      Taro.showToast({ title: '加载房源失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  const fetchFinance = async () => {
    try {
      const [incRes, annRes] = await Promise.all([
        ownerApi.income(),
        ownerApi.annualFinancialSummary()
      ])
      setIncome(pickIncome(incRes))
      setMonthly(pickMonthly(annRes).slice(-6))
    } catch (error) {
      console.error('[OwnerHome] 获取财务概览失败', error)
    }
  }

  useDidShow(() => {
    loadFromStorage()
    if (!useAuthStore.getState().token) {
      Taro.redirectTo({ url: '/pages/login/index' })
      return
    }
    fetchProperties()
    fetchFinance()
  })

  const onRefresh = async () => {
    setRefreshing(true)
    try {
      const res = await ownerApi.properties()
      setProperties(pickList(res))
      Taro.showToast({ title: '刷新成功', icon: 'success' })
    } catch (error) {
      console.error('[OwnerHome] 刷新失败', error)
      Taro.showToast({ title: '刷新失败', icon: 'none' })
    } finally {
      setRefreshing(false)
    }
  }

  const stats = {
    total: properties.length,
    rented: properties.filter((p) => p.status === 'rented').length,
    vacant: properties.filter((p) => p.status === 'vacant').length,
    reserved: properties.filter((p) => p.status === 'reserved').length
  }

  // 柱状图计算
  const maxRevenue = Math.max(...monthly.map((m) => Number(m.received || 0)), 1)
  const hasChart = monthly.some((m) => Number(m.received || 0) > 0)
  const shortMonth = (m: string) => `${Number(String(m).split('-').pop() || 0)}月`

  return (
    <View className='owner-home-page'>
      <View className='page-container'>
        <View className='welcome-section'>
          <Text className='welcome-text'>欢迎回来，{user?.name || '业主'}</Text>
          <Text className='welcome-sub'>您名下共有 {stats.total} 套房产</Text>
        </View>

        {/* 快捷入口宫格 */}
        <View className='quick-grid'>
          {QUICK_ENTRIES.map((q) => (
            <View
              key={q.label}
              className='quick-grid__cell'
              hoverClass='quick-grid__cell--hover'
              onClick={() => Taro.navigateTo({ url: q.url })}
            >
              <View className='quick-grid__badge'>
                <Text className='quick-grid__icon'>{q.icon}</Text>
              </View>
              <Text className='quick-grid__title'>{q.label}</Text>
              <Text className='quick-grid__desc'>{q.desc}</Text>
            </View>
          ))}
        </View>

        {/* 财务概览卡 */}
        <View className='finance-card'>
          <Text className='finance-card__label'>本月收入</Text>
          <Text className='finance-card__amount'>¥{fmtMoney(income.monthlyIncome)}</Text>

          <View className='finance-kpis'>
            <View className='finance-kpi finance-kpi--success'>
              <Text className='finance-kpi__num'>¥{fmtMoney(income.totalIncome)}</Text>
              <Text className='finance-kpi__label'>总收入</Text>
            </View>
            <View className='finance-kpi finance-kpi--warning'>
              <Text className='finance-kpi__num'>¥{fmtMoney(income.pendingIncome)}</Text>
              <Text className='finance-kpi__label'>待收</Text>
            </View>
            <View className='finance-kpi finance-kpi--error'>
              <Text className='finance-kpi__num'>¥{fmtMoney(income.overdueIncome)}</Text>
              <Text className='finance-kpi__label'>逾期</Text>
            </View>
          </View>

          <View className='finance-chart__head'>
            <Text className='finance-chart__title'>近 6 个月收入</Text>
          </View>
          {hasChart ? (
            <View className='finance-chart'>
              {monthly.map((m, i) => {
                const h = Math.max((Number(m.received || 0) / maxRevenue) * 100, 2)
                const isCurrent = i === monthly.length - 1
                return (
                  <View key={m.month} className='finance-chart__col'>
                    <View
                      className={`finance-chart__bar ${isCurrent ? 'finance-chart__bar--current' : ''}`}
                      style={{ height: `${h}%` }}
                    />
                    <Text className='finance-chart__label'>{shortMonth(m.month)}</Text>
                  </View>
                )
              })}
            </View>
          ) : (
            <View className='finance-chart__empty'>入账后将在此累计展示</View>
          )}
        </View>

        {/* 房产状态 */}
        <View className='stats-grid'>
          <View className='stat-card stat-card--success'>
            <View className='stat-dot' />
            <Text className='stat-num'>{stats.rented}</Text>
            <Text className='stat-label'>已出租</Text>
          </View>
          <View className='stat-card stat-card--warning'>
            <View className='stat-dot' />
            <Text className='stat-num'>{stats.vacant}</Text>
            <Text className='stat-label'>空置中</Text>
          </View>
          <View className='stat-card stat-card--neutral'>
            <View className='stat-dot' />
            <Text className='stat-num'>{stats.reserved}</Text>
            <Text className='stat-label'>已预订</Text>
          </View>
        </View>

        <View className='section-title'>
          <Text>房屋状态列表</Text>
          <Text className='section-hint'>下拉刷新</Text>
        </View>

        <ScrollView
          scrollY
          className='property-list'
          refresherEnabled
          refresherTriggered={refreshing}
          onRefresherRefresh={onRefresh}
        >
          {loading && properties.length === 0 && (
            <View className='state state--loading'>
              <View className='state__spinner' />
              <Text className='state__title'>正在加载</Text>
            </View>
          )}
          {!loading && properties.length === 0 && (
            <View className='state'>
              <View className='state__icon'>
                <Text className='state__glyph'>房</Text>
              </View>
              <Text className='state__title'>暂无房源数据</Text>
              <Text className='state__desc'>下拉页面即可刷新</Text>
            </View>
          )}
          {properties.map((item) => {
            const statusClass = STATUS_CLASS[item.status] || STATUS_CLASS.vacant
            return (
              <View key={item.id} className='property-card'>
                <View className='property-header'>
                  <Text className='property-code'>{item.code}</Text>
                  <Text
                    className={`property-status ${statusClass}`}
                  >
                    {STATUS_TEXT[item.status] || '空置'}
                  </Text>
                </View>
                <View className='property-info'>
                  {item.projectName && (
                    <Text className='info-item'>小区：{item.projectName}</Text>
                  )}
                  {item.layout && <Text className='info-item'>户型：{item.layout}</Text>}
                  <Text className='info-item'>面积：{item.area}㎡</Text>
                  {item.floor && <Text className='info-item'>楼层：{item.floor}</Text>}
                  {item.rentPrice != null && (
                    <Text className='info-item rent-price'>月租：¥{item.rentPrice}/月</Text>
                  )}
                </View>
              </View>
            )
          })}
        </ScrollView>
      </View>
    </View>
  )
}