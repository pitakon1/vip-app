import { useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { marketApi } from '@/services/api'
import '../_shared.scss'
import './index.scss'

type Tab = 'market' | 'channel' | 'compliance'

interface Market {
  id: string
  market_code?: string
  country_name?: string
  currency?: string
  default_language?: string
  timezone?: string
  status?: string
}

interface Channel {
  id: string
  market_code?: string
  channel_code?: string
  channel_name?: string
  channel_type?: string
  supported_currency?: string
  status?: string
}

interface ComplianceDoc {
  id: string
  market_code?: string
  doc_type?: string
  title?: string
  language?: string
  version?: string
}

const pick = (res: any): any[] => {
  const d = res?.data ?? res
  if (Array.isArray(d)) return d
  return Array.isArray(d?.items) ? d.items : []
}

export default function MarketsPage() {
  const [tab, setTab] = useState<Tab>('market')
  const [markets, setMarkets] = useState<Market[]>([])
  const [channels, setChannels] = useState<Channel[]>([])
  const [compliance, setCompliance] = useState<ComplianceDoc[]>([])
  const [loading, setLoading] = useState(false)

  const fetchMarkets = async () => {
    setLoading(true)
    try {
      const res: any = await marketApi.list({ page_size: 100 })
      setMarkets(pick(res))
    } catch (e) {
      Taro.showToast({ title: '加载市场失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  const fetchChannels = async () => {
    setLoading(true)
    try {
      const res: any = await marketApi.channels()
      setChannels(pick(res))
    } catch (e) {
      Taro.showToast({ title: '加载支付渠道失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  const fetchCompliance = async () => {
    setLoading(true)
    try {
      const res: any = await marketApi.compliance()
      setCompliance(pick(res))
    } catch (e) {
      Taro.showToast({ title: '加载合规文档失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  const switchTab = (t: Tab) => {
    setTab(t)
    if (t === 'market' && markets.length === 0) fetchMarkets()
    if (t === 'channel' && channels.length === 0) fetchChannels()
    if (t === 'compliance' && compliance.length === 0) fetchCompliance()
  }

  useDidShow(() => {
    if (!useAuthStore.getState().token) {
      Taro.redirectTo({ url: '/pages/login/index' })
      return
    }
    fetchMarkets()
  })

  const TABS: { key: Tab; label: string }[] = [
    { key: 'market', label: '国家市场' },
    { key: 'channel', label: '支付渠道' },
    { key: 'compliance', label: '合规文档' }
  ]

  return (
    <View className='admin-page'>
      <View className='page-container'>
        <Text className='page-title'>多国市场</Text>

        <View className='tab-row'>
          {TABS.map((t) => (
            <View
              key={t.key}
              className={`tab-chip ${tab === t.key ? 'tab-chip--active' : ''}`}
              onClick={() => switchTab(t.key)}
            >
              <Text>{t.label}</Text>
            </View>
          ))}
        </View>

        {tab === 'market' && (
          <View>
            <View className='section-title'><Text>已开通国家市场</Text></View>
            {markets.length === 0 ? (
              <View className='empty-tip'><Text>{loading ? '加载中...' : '暂无市场配置'}</Text></View>
            ) : (
              markets.map((m) => (
                <View key={m.id} className='card-item'>
                  <View className='card-item__head'>
                    <Text className='card-item__title'>{m.country_name || m.market_code}</Text>
                    <View className='badge badge--ok'><Text>{m.status || '-'}</Text></View>
                  </View>
                  <Text className='card-item__sub'>代码：{m.market_code} · 币种：{m.currency}</Text>
                  <Text className='card-item__sub'>语言：{m.default_language} · 时区：{m.timezone}</Text>
                </View>
              ))
            )}
          </View>
        )}

        {tab === 'channel' && (
          <View>
            <View className='section-title'><Text>本地支付渠道</Text></View>
            {channels.length === 0 ? (
              <View className='empty-tip'><Text>{loading ? '加载中...' : '暂无支付渠道'}</Text></View>
            ) : (
              channels.map((c) => (
                <View key={c.id} className='card-item'>
                  <View className='card-item__head'>
                    <Text className='card-item__title'>{c.channel_name || c.channel_code}</Text>
                    <View className='badge badge--ok'><Text>{c.status || '-'}</Text></View>
                  </View>
                  <Text className='card-item__sub'>{c.market_code} · {c.channel_type} · 支持 {c.supported_currency}</Text>
                </View>
              ))
            )}
          </View>
        )}

        {tab === 'compliance' && (
          <View>
            <View className='section-title'><Text>合规条款 / 合同模板</Text></View>
            {compliance.length === 0 ? (
              <View className='empty-tip'><Text>{loading ? '加载中...' : '暂无合规文档'}</Text></View>
            ) : (
              compliance.map((d) => (
                <View key={d.id} className='card-item'>
                  <View className='card-item__head'>
                    <Text className='card-item__title'>{d.title || d.doc_type}</Text>
                  </View>
                  <Text className='card-item__sub'>{d.market_code} · {d.doc_type} · v{d.version}</Text>
                </View>
              ))
            )}
          </View>
        )}
      </View>
    </View>
  )
}