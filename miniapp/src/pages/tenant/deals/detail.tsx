import { View, Text } from '@tarojs/components'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { propertyDealApi } from '@/services/api'
import { useSwrCache } from '@/hooks/useSwrCache'
import { fmtMoney as money } from '@/utils/format'
import './detail.scss'

const fmtDate = (x?: string) => (x ? String(x).slice(0, 10) : '—')

// 交易订单状态（PropertyDealStatus）
const DEAL_STATUS: Record<string, { text: string; cls: string }> = {
  drafted: { text: '洽谈中', cls: 'neutral' },
  escrow_pending: { text: '定金托管中', cls: 'warning' },
  signed: { text: '已签约', cls: 'primary' },
  transferring: { text: '过户中', cls: 'info' },
  completed: { text: '已完成', cls: 'success' },
  failed: { text: '交易失败', cls: 'error' },
  cancelled: { text: '已取消', cls: 'neutral' }
}

export default function TenantDealDetailPage() {
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)
  const router = useRouter()
  const dealId = String(router.params?.deal_id ?? '')

  const { data: deal, loading, refresh } = useSwrCache<any>({
    key: `tenant:deal-detail:${dealId}`,
    fetcher: async () => {
      const res: any = await propertyDealApi.get(dealId)
      return res?.data ?? res ?? null
    },
  })

  useDidShow(() => {
    Taro.setNavigationBarTitle({ title: '订单详情' })
    loadFromStorage()
    if (!useAuthStore.getState().token) {
      Taro.redirectTo({ url: '/pages/login/index' })
      return
    }
    void refresh()
  })

  if (!loading && !deal) {
    return (
      <View className='tenant-deal-detail-page'>
        <View className='page-container'>
          <View className='empty-tip'>
            <Text>订单不存在或已删除</Text>
          </View>
        </View>
      </View>
    )
  }
  if (!deal) {
    return <View className='tenant-deal-detail-page' />
  }

  const meta = DEAL_STATUS[String(deal?.status ?? '')] ?? DEAL_STATUS.drafted
  const title = deal?.listing_title || deal?.property_name || `交易订单 #${String(deal?.id ?? '').slice(0, 8)}`

  // 关键节点（按时间先后）
  const timeline: Array<{ label: string; value: string }> = (
    [
      { label: '创建订单', value: deal?.created_at ?? '' },
      { label: '签约时间', value: deal?.signed_at ?? '' },
      { label: '过户日期', value: deal?.transfer_date ?? '' }
    ] as Array<{ label: string; value: string }>
  ).filter((x) => !!x.value)

  return (
    <View className='tenant-deal-detail-page'>
      <View className='page-container'>
        {/* 金额卡 */}
        <View className='card'>
          <View className='deal-head'>
            <Text className='deal-title'>{title}</Text>
            <View className={`deal-badge deal-badge--${meta.cls}`}>
              <Text>{meta.text}</Text>
            </View>
          </View>
          <Text className='deal-price'>
            {deal?.sale_price ? money(Number(deal.sale_price), deal?.currency) : '—'}
          </Text>
          {deal?.notes && <Text className='deal-notes'>{deal.notes}</Text>}
        </View>

        {/* 关键节点卡 */}
        <View className='card'>
          <Text className='section-label'>交易节点</Text>
          {timeline.map((node) => (
            <View key={node.label} className='timeline-row'>
              <View className='timeline-dot' />
              <Text className='timeline-label'>{node.label}</Text>
              <Text className='timeline-value'>{fmtDate(node.value)}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  )
}
