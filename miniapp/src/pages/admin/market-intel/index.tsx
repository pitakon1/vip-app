import { useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { marketDataApi } from '@/services/api'
import '../_shared.scss'
import './index.scss'

type Tab = 'index' | 'report' | 'churn'

interface IndexItem {
  id: string
  market_code?: string
  index_type?: string
  period?: string
  value?: number
  sample_count?: number
  currency?: string
}

interface ReportItem {
  id: string
  market_code?: string
  report_type?: string
  period?: string
  title?: string
  currency?: string
}

interface ChurnSignal {
  id: string
  tenant_id?: string
  signal_type?: string
  level?: string
  detail?: string
  suggested_action?: string
  is_resolved?: boolean
  assigned_to?: string | null
  assigned_to_name?: string | null
  triggered_at?: string
}

const SIGNAL_LEVEL: Record<string, string> = {
  info: '提示',
  warning: '警告',
  high: '高危'
}

const INDEX_TYPE: Record<string, string> = {
  sale: '售价',
  rent: '租金',
  yield: '收益率'
}

const pick = (res: any): any[] => {
  const d = res?.data ?? res
  if (Array.isArray(d)) return d
  return Array.isArray(d?.items) ? d.items : []
}

export default function MarketIntelPage() {
  const [tab, setTab] = useState<Tab>('index')
  const [indices, setIndices] = useState<IndexItem[]>([])
  const [reports, setReports] = useState<ReportItem[]>([])
  const [churn, setChurn] = useState<ChurnSignal[]>([])
  const [loading, setLoading] = useState(false)

  const fetchIndices = async () => {
    setLoading(true)
    try {
      const res: any = await marketDataApi.indices({})
      setIndices(pick(res))
    } catch (e) {
      Taro.showToast({ title: '加载指数失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  const fetchReports = async () => {
    setLoading(true)
    try {
      const res: any = await marketDataApi.reports({ page_size: 100 })
      setReports(pick(res))
    } catch (e) {
      Taro.showToast({ title: '加载报告失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  const fetchChurn = async () => {
    setLoading(true)
    try {
      const res: any = await marketDataApi.churnSignals({})
      setChurn(pick(res))
    } catch (e) {
      Taro.showToast({ title: '加载流失预警失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  const switchTab = (t: Tab) => {
    setTab(t)
    if (t === 'index' && indices.length === 0) fetchIndices()
    if (t === 'report' && reports.length === 0) fetchReports()
    if (t === 'churn' && churn.length === 0) fetchChurn()
  }

  useDidShow(() => {
    if (!useAuthStore.getState().token) {
      Taro.redirectTo({ url: '/pages/login/index' })
      return
    }
    fetchIndices()
  })

  const resolve = async (id: string) => {
    try {
      await marketDataApi.resolveChurnSignal(id)
      Taro.showToast({ title: '已标记处理', icon: 'success' })
      fetchChurn()
    } catch (e) {
      Taro.showToast({ title: '操作失败', icon: 'none' })
    }
  }

  // 派发跟进：默认派发给该租约的负责员工，失败时提示后端原因
  const assign = async (id: string) => {
    try {
      await marketDataApi.assignChurnSignal(id, {})
      Taro.showToast({ title: '已派发跟进', icon: 'success' })
      fetchChurn()
    } catch (e: any) {
      Taro.showToast({ title: e?.message || '派发失败', icon: 'none' })
    }
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: 'index', label: '市场指数' },
    { key: 'report', label: '研究报告' },
    { key: 'churn', label: '租客流失预警' }
  ]

  return (
    <View className='admin-page'>
      <View className='page-container'>
        <Text className='page-title'>数据决策</Text>

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

        {tab === 'index' && (
          <View>
            <View className='section-title'><Text>各市场房价 / 租金指数</Text></View>
            {indices.length === 0 ? (
              <View className='empty-tip'><Text>{loading ? '加载中...' : '暂无指数数据'}</Text></View>
            ) : (
              indices.map((i) => (
                <View key={i.id} className='card-item'>
                  <View className='card-item__head'>
                    <Text className='card-item__title'>{i.market_code} · {INDEX_TYPE[i.index_type || ''] || i.index_type}</Text>
                    <View className='badge badge--ok'><Text>{i.period}</Text></View>
                  </View>
                  <Text className='card-item__sub'>指数值：{i.value}</Text>
                  <Text className='card-item__sub'>样本：{i.sample_count ?? 0} · {i.currency}</Text>
                </View>
              ))
            )}
          </View>
        )}

        {tab === 'report' && (
          <View>
            <View className='section-title'><Text>市场报告</Text></View>
            {reports.length === 0 ? (
              <View className='empty-tip'><Text>{loading ? '加载中...' : '暂无报告'}</Text></View>
            ) : (
              reports.map((r) => (
                <View key={r.id} className='card-item'>
                  <View className='card-item__head'>
                    <Text className='card-item__title'>{r.title || r.report_type}</Text>
                  </View>
                  <Text className='card-item__sub'>{r.market_code} · {r.report_type} · {r.period}</Text>
                </View>
              ))
            )}
          </View>
        )}

        {tab === 'churn' && (
          <View>
            <View className='section-title'><Text>租客流失预警</Text></View>
            {churn.length === 0 ? (
              <View className='empty-tip'><Text>{loading ? '加载中...' : '暂无流失预警'}</Text></View>
            ) : (
              churn.map((s) => (
                <View key={s.id} className='card-item'>
                  <View className='card-item__head'>
                    <Text className='card-item__title'>租客 {s.tenant_id ? s.tenant_id.slice(0, 8) : '-'}</Text>
                    <View className={`badge ${s.is_resolved ? 'badge--ok' : 'badge--warn'}`}>
                      <Text>{s.is_resolved ? '已处理' : (SIGNAL_LEVEL[s.level || 'info'] || '提示')}</Text>
                    </View>
                  </View>
                  {s.detail ? <Text className='card-item__sub'>原因：{s.detail}</Text> : null}
                  {s.suggested_action ? <Text className='card-item__sub'>建议动作：{s.suggested_action}</Text> : null}
                  <Text className='card-item__sub'>跟进人：{s.assigned_to_name || (s.assigned_to ? s.assigned_to.slice(0, 8) : '未派发')}</Text>
                  {!s.is_resolved && (
                    <View className='action-row'>
                      <Text className='mini-btn' onClick={() => assign(s.id)}>派发跟进</Text>
                      <Text className='mini-btn mini-btn--primary' onClick={() => resolve(s.id)}>标记已处理</Text>
                    </View>
                  )}
                </View>
              ))
            )}
          </View>
        )}
      </View>
    </View>
  )
}