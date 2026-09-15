import { useState } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { employeesApi } from '@/services/api'
import './index.scss'

interface RankItem {
  id: string
  full_name?: string | null
  department?: string | null
  position?: string | null
  performance: number
  deals: number
  is_self?: boolean
}

interface Summary {
  month_deals?: number
  month_total?: number
  month_commission?: number
  commission_total?: number
  deals_total?: number
}

export default function EmployeePerformancePage() {
  const [leaderboard, setLeaderboard] = useState<RankItem[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(false)

  const fetchAll = async () => {
    setLoading(true)
    try {
      const [lbRes, pfRes]: any[] = await Promise.all([
        employeesApi.leaderboard().catch(() => ({ data: [] })),
        employeesApi.mine().catch(() => ({ data: {} }))
      ])
      const lb = lbRes?.data ?? lbRes
      setLeaderboard(Array.isArray(lb) ? lb : [])
      const mine = pfRes?.data ?? {}
      setSummary(mine?.summary ?? null)
    } catch (error) {
      console.error('[Performance] 加载失败', error)
      Taro.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  useDidShow(() => {
    if (!useAuthStore.getState().token) {
      Taro.redirectTo({ url: '/pages/login/index' })
      return
    }
    fetchAll()
  })

  const myIndex = leaderboard.findIndex((r) => r.is_self)
  const myRank = myIndex >= 0 ? myIndex + 1 : 0
  const fmt = (v?: number) => `฿${Number(v || 0).toLocaleString()}`

  return (
    <View className='perf-page'>
      <View className='page-container'>
        <ScrollView scrollY className='perf-scroll'>
          <View className='summary-card'>
            <View className='summary-item'>
              <Text className='summary-label'>本月成交</Text>
              <Text className='summary-value'>{summary?.month_deals ?? 0} 单</Text>
            </View>
            <View className='summary-divider' />
            <View className='summary-item'>
              <Text className='summary-label'>本月业绩</Text>
              <Text className='summary-value'>{fmt(summary?.month_total)}</Text>
            </View>
            <View className='summary-divider' />
            <View className='summary-item'>
              <Text className='summary-label'>累计佣金</Text>
              <Text className='summary-value'>{fmt(summary?.commission_total)}</Text>
            </View>
          </View>

          <Text className='rank-line'>{myRank > 0 ? `我的排名：第 ${myRank} 名` : '暂无排行榜数据'}</Text>
          <Text className='section-title'>业绩排行榜</Text>

          {loading && leaderboard.length === 0 ? (
            <View className='state state--loading'>
              <View className='state__spinner' />
              <Text className='state__title'>正在加载</Text>
            </View>
          ) : leaderboard.length === 0 ? (
            <View className='state'>
              <View className='state__icon'>
                <Text className='state__glyph'>榜</Text>
              </View>
              <Text className='state__title'>暂无业绩数据</Text>
              <Text className='state__desc'>完成首单后即可上榜</Text>
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
                      {item.is_self ? '（我）' : ''}
                    </Text>
                    <Text className='rank-deals'>
                      {item.position || item.department || ''} · 成交 {item.deals} 单
                    </Text>
                  </View>
                  <Text className={`rank-amount ${item.is_self ? 'rank-amount--self' : ''}`}>
                    {fmt(item.performance)}
                  </Text>
                </View>
              )
            })
          )}
        </ScrollView>
      </View>
    </View>
  )
}