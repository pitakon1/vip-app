import { View, Text } from '@tarojs/components'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { propertyDealApi } from '@/services/api'
import { useSwrCache } from '@/hooks/useSwrCache'
import { fmtMoney as money } from '@/utils/format'
import { useI18n } from '@/i18n'
import './detail.scss'

const fmtDate = (x?: string) => (x ? String(x).slice(0, 10) : '—')

// 交易订单状态（PropertyDealStatus）
const buildDealStatus = (
  t: (k: string, p?: Record<string, string | number>) => string
): Record<string, { text: string; cls: string }> => ({
  drafted: { text: t('deals.stDrafted'), cls: 'neutral' },
  escrow_pending: { text: t('deals.stEscrowPending'), cls: 'warning' },
  signed: { text: t('deals.stSigned'), cls: 'primary' },
  transferring: { text: t('deals.stTransferring'), cls: 'info' },
  completed: { text: t('deals.stCompleted'), cls: 'success' },
  failed: { text: t('deals.stFailed'), cls: 'error' },
  cancelled: { text: t('deals.stCancelled'), cls: 'neutral' }
})

export default function TenantDealDetailPage() {
  const { t } = useI18n()
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)
  const router = useRouter()
  const dealId = String(router.params?.deal_id ?? '')
  const DEAL_STATUS = buildDealStatus(t)

  const { data: deal, loading, refresh } = useSwrCache<any>({
    key: `tenant:deal-detail:${dealId}`,
    fetcher: async () => {
      const res: any = await propertyDealApi.get(dealId)
      return res?.data ?? res ?? null
    },
  })

  useDidShow(() => {
    Taro.setNavigationBarTitle({ title: t('deals.detailTitle') })
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
            <Text>{t('deals.notFound')}</Text>
          </View>
        </View>
      </View>
    )
  }
  if (!deal) {
    return <View className='tenant-deal-detail-page' />
  }

  const meta = DEAL_STATUS[String(deal?.status ?? '')] ?? DEAL_STATUS.drafted
  const title = deal?.listing_title || deal?.property_name || `${t('deals.orderFallback')} #${String(deal?.id ?? '').slice(0, 8)}`

  // 关键节点（按时间先后）
  const timeline: Array<{ label: string; value: string }> = (
    [
      { label: t('deals.nodeCreated'), value: deal?.created_at ?? '' },
      { label: t('deals.nodeSigned'), value: deal?.signed_at ?? '' },
      { label: t('deals.nodeTransfer'), value: deal?.transfer_date ?? '' }
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
          <Text className='section-label'>{t('deals.nodesSection')}</Text>
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
