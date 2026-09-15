import { useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { dashboardApi } from '@/services/api'
import './index.scss'
import { iconStyle } from '@/utils/icons'

interface TrendRow {
  month: string
  revenue?: number
  leases_new?: number
  leads_new?: number
  viewings_new?: number
}

const pick = (res: any): TrendRow[] => {
  const d = res?.data ?? res ?? {}
  const series = Array.isArray(d?.series) ? d.series : []
  return series.slice(-12)
}

const fmtMoney = (v: number | undefined) => `฿${Number(v || 0).toLocaleString()}`
const fmtNum = (v: number | undefined) => Number(v || 0).toLocaleString()

export default function TrendPage() {
  const [series, setSeries] = useState<TrendRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  const fetch = async () => {
    setLoading(true)
    setError(false)
    try {
      const res = await dashboardApi.trend({ months: 12 })
      setSeries(pick(res))
    } catch (e) {
      console.error('[Trend] 加载趋势失败', e)
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  useDidShow(() => {
    if (!useAuthStore.getState().token) {
      Taro.redirectTo({ url: '/pages/login/index' })
      return
    }
    fetch()
  })

  const totalRevenue = series.reduce((s, r) => s + Number(r.revenue || 0), 0)
  const totalLeases = series.reduce((s, r) => s + Number(r.leases_new || 0), 0)
  const totalLeads = series.reduce((s, r) => s + Number(r.leads_new || 0), 0)
  const totalViewings = series.reduce((s, r) => s + Number(r.viewings_new || 0), 0)

  const maxRevenue = Math.max(...series.map((r) => Number(r.revenue || 0)), 1)
  const hasChart = series.some((r) => Number(r.revenue || 0) > 0)

  const shortMonth = (m: string) => m.replace(/-\d+$/, '')

  return (
    <View className='admin-page'>
      <View className='page-container'>
        <View className='section-header'>
          <Text className='section-header__title'>运营趋势</Text>
          <Text className='section-header__hint'>近 12 个月</Text>
        </View>

        {/* 月度 KPI */}
        <View className='trend-kpis'>
          <View className='trend-kpi trend-kpi--primary'>
            <Text className='trend-kpi__num'>{fmtMoney(totalRevenue)}</Text>
            <Text className='trend-kpi__label'>累计收入</Text>
          </View>
          <View className='trend-kpi trend-kpi--neutral'>
            <Text className='trend-kpi__num'>{fmtNum(totalLeases)}</Text>
            <Text className='trend-kpi__label'>新增租约</Text>
          </View>
          <View className='trend-kpi trend-kpi--neutral'>
            <Text className='trend-kpi__num'>{fmtNum(totalLeads)}</Text>
            <Text className='trend-kpi__label'>新增线索</Text>
          </View>
          <View className='trend-kpi trend-kpi--neutral'>
            <Text className='trend-kpi__num'>{fmtNum(totalViewings)}</Text>
            <Text className='trend-kpi__label'>新增带看</Text>
          </View>
        </View>

        {/* 柱状图 */}
        <View className='trend-chart-card'>
          <View className='section-header'>
            <Text className='section-header__title'>月度收入</Text>
          </View>
          {loading && (
            <View className='state state--loading'>
              <View className='state__spinner' />
              <Text className='state__title'>正在加载</Text>
            </View>
          )}
          {!loading && error && (
            <View className='state'>
              <View className='state__icon'>!</View>
              <Text className='state__title'>加载失败</Text>
              <Text className='state__desc'>未能获取趋势数据，请重试</Text>
              <View className='state__btn' onClick={fetch} hoverClass='state__btn--hover'>
                <Text>重新加载</Text>
              </View>
            </View>
          )}
          {!loading && !error && !hasChart && (
            <View className='state'>
              <View className='state__icon icon-svg' style={iconStyle('trend')} />
              <Text className='state__title'>暂无收入数据</Text>
              <Text className='state__desc'>入账后将在此累计展示</Text>
            </View>
          )}
          {!loading && !error && hasChart && (
            <View className='trend-chart'>
              {series.map((r) => {
                const h = Math.max((Number(r.revenue || 0) / maxRevenue) * 100, 2)
                const active = Number(r.revenue || 0) > 0
                return (
                  <View key={r.month} className='trend-bar-col'>
                    <View
                      className={`trend-bar ${active ? 'trend-bar--active' : ''}`}
                      style={{ height: `${h}%` }}
                    />
                    <Text className='trend-bar-label'>{shortMonth(r.month)}</Text>
                  </View>
                )
              })}
            </View>
          )}
        </View>

        {/* 月度明细 */}
        <View className='section-header trend-section-head'>
          <Text className='section-header__title'>月度明细</Text>
        </View>
        {!loading && series.length === 0 && !error && (
          <View className='state'>
            <View className='state__icon icon-svg' style={iconStyle('clipboard')} />
            <Text className='state__title'>暂无明细</Text>
            <Text className='state__desc'>运营数据将在积累后展示</Text>
          </View>
        )}
        {!loading && series.length > 0 && (
          <View className='trend-list'>
            {series.map((r, i) => (
              <View key={r.month} className='trend-item'>
                <View className='trend-item__left'>
                  <Text className='trend-item__month'>{r.month.replace('-', '.')}</Text>
                  <Text className='trend-item__meta'>
                    租约 {fmtNum(r.leases_new)} · 线索 {fmtNum(r.leads_new)} · 带看 {fmtNum(r.viewings_new)}
                  </Text>
                </View>
                <Text className='trend-item__amount'>{fmtMoney(r.revenue)}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  )
}