import { useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { request } from '@/lib/api'
import './index.scss'

interface FunnelRow { stage: string; key: string; value: number; rate: number }
interface CountryRow { country: string; properties: number; rented: number; occupancy: number }

export default function OpsPage() {
  const [funnel, setFunnel] = useState<FunnelRow[]>([])
  const [activity, setActivity] = useState<any>(null)
  const [revenue, setRevenue] = useState(0)
  const [countries, setCountries] = useState<CountryRow[]>([])
  const [loading, setLoading] = useState(false)

  const fetchData = async () => {
    setLoading(true)
    try {
      const res: any = await request({ url: '/operations/overview', method: 'GET' })
      const d = res ?? {}
      setFunnel(d.funnel ?? [])
      setActivity(d.activity ?? null)
      setRevenue(Number(d.revenue?.month_paid ?? 0))
      setCountries(d.by_country ?? [])
    } catch (e) {
      console.error('[Ops] 加载失败', e)
    } finally {
      setLoading(false)
    }
  }

  useDidShow(() => {
    fetchData()
  })

  const maxFunnel = Math.max(...funnel.map((f) => f.value), 1)

  return (
    <View className='ops-page'>
      <View className='ops-head'>
        <Text className='ops-title'>运营数据看板</Text>
        <Text className='ops-sub'>转化漏斗 · 活跃度 · 分国家数据</Text>
      </View>

      {/* 活跃度 */}
      <View className='ops-stats'>
        {[
          { label: '日活 DAU', value: `${activity?.dau ?? 0}` },
          { label: '周活 WAU', value: `${activity?.wau ?? 0}` },
          { label: '月活 MAU', value: `${activity?.mau ?? 0}` },
          { label: '本月实收', value: revenue.toLocaleString() },
        ].map((c) => (
          <View key={c.label} className='ops-stat'>
            <Text className='ops-stat__num'>{c.value}</Text>
            <Text className='ops-stat__label'>{c.label}</Text>
          </View>
        ))}
      </View>

      {/* 漏斗 */}
      <View className='ops-section'>
        <View className='ops-section__head'>
          <Text className='ops-section__title'>流程转化漏斗</Text>
          <Text className='ops-section__hint'>线索 → 带看 → 成交 → 签约</Text>
        </View>
        <View className='ops-card'>
          {loading && funnel.length === 0 ? (
            <Text className='ops-empty'>正在加载</Text>
          ) : funnel.length === 0 ? (
            <Text className='ops-empty'>暂无漏斗数据，线索累计后展示</Text>
          ) : (
            funnel.map((f, i) => (
              <View key={f.key} className='ops-funnel'>
                <View className='ops-funnel__top'>
                  <Text className='ops-funnel__stage'>{f.stage}</Text>
                  <Text className='ops-funnel__val'>
                    {f.value}{i > 0 ? ` · ${f.rate}%` : ''}
                  </Text>
                </View>
                <View className='ops-bar'>
                  <View
                    className='ops-bar__fill'
                    style={{ width: `${i === 0 ? 100 : Math.round((f.value / maxFunnel) * 100)}%` }}
                  />
                </View>
              </View>
            ))
          )}
        </View>
      </View>

      {/* 国家 */}
      <View className='ops-section'>
        <View className='ops-section__head'>
          <Text className='ops-section__title'>按国家分布</Text>
          <Text className='ops-section__hint'>{countries.length} 个国家</Text>
        </View>
        <View className='ops-card'>
          {countries.length === 0 ? (
            <Text className='ops-empty'>暂无国家维度数据</Text>
          ) : (
            countries.map((c) => (
              <View key={c.country} className='ops-country'>
                <View className='ops-country__body'>
                  <Text className='ops-country__name'>{c.country}</Text>
                  <Text className='ops-country__meta'>
                    {c.properties} 套房源 · 在租 {c.rented} · 出租率 {c.occupancy}%
                  </Text>
                </View>
                <View className='ops-bar ops-bar--auto'>
                  <View className='ops-bar__fill ops-bar__fill--green' style={{ width: `${c.occupancy}%` }} />
                </View>
              </View>
            ))
          )}
        </View>
      </View>
    </View>
  )
}