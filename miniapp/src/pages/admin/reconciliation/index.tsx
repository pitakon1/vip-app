import { useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { dashboardApi } from '@/services/api'
import './index.scss'

interface ReconTotals {
  received?: number
  receivable?: number
  overdue?: number
  count?: number
}

interface ReconRow {
  property_id?: string
  property?: string
  received?: number
  receivable?: number
  overdue?: number
  count?: number
}

interface ReconData {
  totals: ReconTotals
  by_property: ReconRow[]
}

const pick = (res: any): ReconData => {
  const d = res?.data ?? res ?? {}
  const totals = d?.totals ?? {}
  const by_property = Array.isArray(d?.by_property) ? d.by_property : []
  return { totals, by_property }
}

const fmtMoney = (v: number | undefined, currency?: string) => {
  const sym: Record<string, string> = { CNY: '¥', THB: '฿', EUR: '€', USD: '$' }
  return `${sym[currency || 'THB'] || '¥'}${Number(v || 0).toLocaleString()}`
}

const fmtCount = (v: number | undefined) => `${Number(v || 0).toLocaleString()}`

export default function ReconcilPage() {
  const [data, setData] = useState<ReconData>({ totals: {}, by_property: [] })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  const fetch = async () => {
    setLoading(true)
    setError(false)
    try {
      const res = await dashboardApi.financialReconciliation()
      setData(pick(res))
    } catch (e) {
      console.error('[Recon] 加载对账失败', e)
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

  const { totals, by_property } = data
  const totalReceivable = Number(totals.receivable || 0) + Number(totals.overdue || 0)
  const currency = 'THB'

  return (
    <View className='admin-page'>
      <View className='page-container'>
        <View className='section-header'>
          <Text className='section-header__title'>财务对账</Text>
        </View>

        {/* KPI 卡 */}
        <View className='recon-kpis'>
          <View className='recon-kpi recon-kpi--success'>
            <Text className='recon-kpi__num'>{fmtMoney(totals.received, currency)}</Text>
            <Text className='recon-kpi__label'>实收</Text>
          </View>
          <View className='recon-kpi recon-kpi--warning'>
            <Text className='recon-kpi__num'>{fmtMoney(totals.receivable, currency)}</Text>
            <Text className='recon-kpi__label'>待收</Text>
          </View>
          <View className='recon-kpi recon-kpi--error'>
            <Text className='recon-kpi__num'>{fmtMoney(totals.overdue, currency)}</Text>
            <Text className='recon-kpi__label'>逾期</Text>
          </View>
          <View className='recon-kpi recon-kpi--neutral'>
            <Text className='recon-kpi__num'>{fmtMoney(totalReceivable, currency)}</Text>
            <Text className='recon-kpi__label'>总应收</Text>
          </View>
        </View>

        {/* 明细 */}
        <View className='section-header recon-section-head'>
          <Text className='section-header__title'>按房源对账</Text>
          <Text className='section-header__hint'>共 {by_property.length} 处</Text>
        </View>

        {loading && by_property.length === 0 && (
          <View className='state state--loading'>
            <View className='state__spinner' />
            <Text className='state__title'>正在加载</Text>
          </View>
        )}

        {!loading && error && by_property.length === 0 && (
          <View className='state'>
            <View className='state__icon'>!</View>
            <Text className='state__title'>加载失败</Text>
            <Text className='state__desc'>未能获取对账数据，请重试</Text>
            <View className='state__btn' onClick={fetch} hoverClass='state__btn--hover'>
              <Text>重新加载</Text>
            </View>
          </View>
        )}

        {!loading && !error && by_property.length === 0 && (
          <View className='state'>
            <View className='state__icon'>💰</View>
            <Text className='state__title'>暂无对账数据</Text>
            <Text className='state__desc'>完成房源收款后在此对账</Text>
          </View>
        )}

        {!loading && by_property.length > 0 && (
          <View className='recon-table'>
            <View className='recon-table__head'>
              <Text className='recon-table__cell recon-table__cell--name'>房源</Text>
              <Text className='recon-table__cell recon-table__cell--amount'>应收</Text>
              <Text className='recon-table__cell recon-table__cell--amount'>实收</Text>
              <Text className='recon-table__cell recon-table__cell--amount'>逾期</Text>
              <Text className='recon-table__cell recon-table__cell--count'>笔数</Text>
            </View>
            {by_property.map((r: ReconRow, i: number) => {
              const recvAmt = Number(r.receivable || 0) + Number(r.overdue || 0)
              return (
                <View key={r.property_id || i} className='recon-table__row'>
                  <Text className='recon-table__cell recon-table__cell--name'>{r.property || '未命名房源'}</Text>
                  <Text className='recon-table__cell recon-table__cell--amount'>{fmtMoney(recvAmt)}</Text>
                  <Text className='recon-table__cell recon-table__cell--amount recon-table__cell--success'>
                    {fmtMoney(r.received)}
                  </Text>
                  <Text className='recon-table__cell recon-table__cell--amount recon-table__cell--error'>
                    {fmtMoney(r.overdue)}
                  </Text>
                  <Text className='recon-table__cell recon-table__cell--count'>{fmtCount(r.count)}</Text>
                </View>
              )
            })}
          </View>
        )}
      </View>
    </View>
  )
}