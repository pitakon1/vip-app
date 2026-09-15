import { useCallback, useState } from 'react'
import { View, Text, ScrollView, Button } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { ownerApi } from '@/services/api'
import './index.scss'

interface VacantItem {
  id: string
  title?: string
  address?: string
  monthly_rent?: number
  currency?: string
  property_type?: string
  status?: string
  share_url?: string
}

interface PricingItem {
  property_id: string
  title?: string
  monthly_rent?: number
  currency?: string
  peer_count?: number
  peer_avg?: number
  peer_range?: [number, number] | null
  suggestion?: { direction: string; diff_pct: number; suggested: number }
}

interface AnnualMonth {
  month: string
  received: number
  pending: number
  overdue: number
  count: number
}

const pick = (res: any, key: string, fallback: any[] = []) => {
  const d = res?.data ?? res
  return Array.isArray(d?.[key]) ? d[key] : d?.items ?? fallback
}

const fmtMoney = (v: number | undefined, currency?: string) => {
  const sym: Record<string, string> = { CNY: '¥', THB: '฿', EUR: '€', USD: '$' }
  return `${sym[currency || 'THB'] || '฿'}${Number(v || 0).toLocaleString()}`
}

const DIR: Record<string, { label: string; color: string }> = {
  raise: { label: '建议涨价', color: 'var(--success)' },
  lower: { label: '建议降价', color: 'var(--error)' },
  keep: { label: '维持现价', color: 'var(--primary)' }
}

const propertyTypeText = (t?: string) =>
  t === 'apartment' ? '公寓' : t === 'villa' ? '别墅' : t === 'condo' ? '公寓' : t || '房源'

export default function OwnerMarketingPage() {
  const [loading, setLoading] = useState(false)
  const [vacants, setVacants] = useState<VacantItem[]>([])
  const [totalVacant, setTotalVacant] = useState(0)
  const [totalProperties, setTotalProperties] = useState(0)
  const [pricing, setPricing] = useState<PricingItem[]>([])
  const [year, setYear] = useState<number>(new Date().getFullYear())
  const [annual, setAnnual] = useState<AnnualMonth[]>([])
  const [annualTotals, setAnnualTotals] = useState({
    received: 0,
    pending: 0,
    overdue: 0,
    count: 0
  })

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [mk, pr, ann]: [any, any, any] = await Promise.all([
        ownerApi.marketing(),
        ownerApi.pricingSuggestion(),
        ownerApi.annualFinancialSummary(year)
      ])
      const mkD = mk?.data ?? mk
      setVacants(pick(mkD, 'items'))
      setTotalVacant(Number(mkD?.total_vacant ?? 0))
      setTotalProperties(Number(mkD?.total_properties ?? 0))
      setPricing(pick(pr?.data ?? pr, 'items'))
      const annD = ann?.data ?? ann
      setAnnual(pick(annD, 'by_month'))
      setAnnualTotals(annD?.totals ?? { received: 0, pending: 0, overdue: 0, count: 0 })
    } catch (error) {
      Taro.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }, [year])

  useDidShow(() => {
    if (!useAuthStore.getState().token) {
      Taro.redirectTo({ url: '/pages/login/index' })
      return
    }
    fetchAll()
  })

  const copyLink = (item: VacantItem) => {
    Taro.setClipboardData({
      data: item.share_url || `/pages/tenant/listings/index`,
      success: () => Taro.showToast({ title: '链接已复制', icon: 'success' })
    })
  }

  const exportCsv = () => {
    const rows = [
      ['月份', '已收', '应收未收', '逾期', '笔数'],
      ...annual.map((m) => [m.month, m.received, m.pending, m.overdue, m.count])
    ]
    rows.push(['合计', annualTotals.received, annualTotals.pending, annualTotals.overdue, annualTotals.count])
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n')
    Taro.showModal({
      title: '导出年度财务',
      content: `${year} 年：已收 ${fmtMoney(annualTotals.received)}，逾期 ${fmtMoney(annualTotals.overdue)}。导出 CSV 文件。`,
      confirmText: '确认',
      success: (res) => {
        if (res.confirm) {
          // 小程序无法直接下载文件，将数据写入剪贴板
          Taro.setClipboardData({
            data: `\ufeff${csv}`,
            success: () => Taro.showToast({ title: 'CSV 数据已复制', icon: 'success' })
          })
        }
      }
    })
  }

  const occupancy =
    totalProperties > 0
      ? Math.round(((totalProperties - totalVacant) / totalProperties) * 100)
      : 0

  return (
    <View className='owner-marketing-page'>
      <View className='page-container'>
        <Text className='page-title'>房源营销</Text>
        <Text className='page-subtitle'>空置房源推广、自动定价建议与年度财务导出</Text>

        <View className='stats-grid'>
          <View className='stat-card'>
            <Text className='stat-num'>{totalProperties}</Text>
            <Text className='stat-label'>名下房源</Text>
          </View>
          <View className='stat-card'>
            <Text className='stat-num'>{totalVacant}</Text>
            <Text className='stat-label'>空置待租</Text>
          </View>
          <View className='stat-card'>
            <Text className='stat-num'>{occupancy}%</Text>
            <Text className='stat-label'>入住率</Text>
          </View>
        </View>

        {/* 空置推广 */}
        <View className='section-title'>
          <Text>空置房源推广</Text>
        </View>
        {vacants.length === 0 ? (
          <View className='empty-tip'><Text>暂无空置房源</Text></View>
        ) : (
          vacants.map((v) => (
            <View key={v.id} className='card-item'>
              <View className='card-item__head'>
                <Text className='card-item__title'>{v.title || '未命名房源'}</Text>
                <View className='badge badge--warn'><Text>空置</Text></View>
              </View>
              {v.address && <Text className='card-item__sub'>{v.address}</Text>}
              <Text className='card-item__type'>{propertyTypeText(v.property_type)} · {fmtMoney(v.monthly_rent, v.currency)}/月</Text>
              <Button className='share-btn' size='mini' onClick={() => copyLink(v)}>复制推广链接</Button>
            </View>
          ))
        )}

        {/* 定价建议 */}
        <View className='section-title'>
          <Text>自动定价建议</Text>
        </View>
        {pricing.length === 0 ? (
          <View className='empty-tip'><Text>暂无定价建议</Text></View>
        ) : (
          pricing.map((p) => {
            const sug = p.suggestion
            const meta = sug ? DIR[sug.direction] || DIR.keep : DIR.keep
            const range = p.peer_range
              ? `${fmtMoney(p.peer_range[0], p.currency)} ~ ${fmtMoney(p.peer_range[1], p.currency)}`
              : '数据不足'
            return (
              <View key={p.property_id} className='card-item'>
                <View className='card-item__head'>
                  <Text className='card-item__title'>{p.title || '未命名房源'}</Text>
                  <Text className='card-item__rent'>{fmtMoney(p.monthly_rent, p.currency)}</Text>
                </View>
                <Text className='card-item__sub'>市场区间：{range}（{p.peer_count || 0} 套可比）</Text>
                {sug ? (
                  <View className='pricing-row'>
                    <View className='badge' style={{ backgroundColor: meta.color }}><Text style={{ color: '#fff' }}>{meta.label}</Text></View>
                    <Text className='card-item__sub'>{sug.diff_pct > 0 ? '+' : ''}{sug.diff_pct}% · 建议 {fmtMoney(sug.suggested, p.currency)}</Text>
                  </View>
                ) : (
                  <Text className='card-item__sub'>同类数据不足，暂无法定价建议</Text>
                )}
              </View>
            )
          })
        )}

        {/* 年度财务导出 */}
        <View className='section-title'>
          <Text>年度财务汇总</Text>
        </View>
        <View className='year-row'>
          {[new Date().getFullYear(), new Date().getFullYear() - 1].map((y) => (
            <View
              key={y}
              className={`year-chip ${y === year ? 'year-chip--active' : ''}`}
              onClick={() => setYear(y)}
            >
              <Text>{y}</Text>
            </View>
          ))}
        </View>
        {annual.length === 0 ? (
          <View className='empty-tip'><Text>暂无年度财务数据</Text></View>
        ) : (
          <View className='ann-table'>
            <View className='ann-row ann-row--head'>
              <Text className='ann-cell'>月份</Text>
              <Text className='ann-cell'>已收</Text>
              <Text className='ann-cell'>应收未收</Text>
              <Text className='ann-cell'>逾期</Text>
            </View>
            {annual.map((m) => (
              <View key={m.month} className='ann-row'>
                <Text className='ann-cell'>{m.month.replace('-', '.')}</Text>
                <Text className='ann-cell'>{fmtMoney(m.received)}</Text>
                <Text className='ann-cell'>{fmtMoney(m.pending)}</Text>
                <Text className='ann-cell'>{fmtMoney(m.overdue)}</Text>
              </View>
            ))}
            <View className='ann-row ann-row--total'>
              <Text className='ann-cell'>合计</Text>
              <Text className='ann-cell'>{fmtMoney(annualTotals.received)}</Text>
              <Text className='ann-cell'>{fmtMoney(annualTotals.pending)}</Text>
              <Text className='ann-cell'>{fmtMoney(annualTotals.overdue)}</Text>
            </View>
          </View>
        )}
        <Button className='export-btn' onClick={exportCsv}>导出年度财务 CSV</Button>
        {loading && <View className='empty-tip'><Text>加载中...</Text></View>}
      </View>
    </View>
  )
}