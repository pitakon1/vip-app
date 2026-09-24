import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { propertyDealApi, saleListingApi } from '@/services/api'
import { useSwrCache } from '@/hooks/useSwrCache'
import { fmtMoney as money } from '@/utils/format'
import StateBlock from '@/components/StateBlock'
import { useI18n } from '@/i18n'
import './index.scss'

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

const pickList = (res: any): any[] => {
  const d = res?.data ?? res
  if (Array.isArray(d)) return d
  if (Array.isArray(d?.items)) return d.items
  if (Array.isArray(d?.list)) return d.list
  return []
}

export default function TenantDealsPage() {
  const { t } = useI18n()
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)
  const uid = useAuthStore((state) => state.user?.id) ?? 'anon'
  const DEAL_STATUS = buildDealStatus(t)

  const { data, loading, refresh } = useSwrCache<any[]>({
    key: `tenant:deals:${uid}`,
    fetcher: async () => {
      const [dRes, lRes]: [any, any] = await Promise.all([
        propertyDealApi.list({ page: 1, page_size: 50 }),
        saleListingApi.list({ page: 1, page_size: 50 }).catch(() => null)
      ])
      const titles: Record<string, string> = {}
      pickList(lRes).forEach((r) => {
        if (r?.id) titles[String(r.id)] = r.title ?? ''
      })
      return pickList(dRes).map((r) => ({
        ...r,
        listing_title: titles[String(r.sale_listing_id ?? '')] ?? ''
      }))
    },
  })
  const deals = data ?? []

  useDidShow(() => {
    Taro.setNavigationBarTitle({ title: t('deals.listTitle') })
    loadFromStorage()
    if (!useAuthStore.getState().token) {
      Taro.redirectTo({ url: '/pages/login/index' })
      return
    }
    void refresh()
  })

  return (
    <View className='tenant-deals-page'>
      <View className='page-container'>
        <View className='card card--list'>
          {loading && deals.length === 0 && (
            <StateBlock loading text={t('common.loading')} />
          )}
          {!loading && deals.length === 0 && (
            <View className='empty-tip'>
              <Text>{t('deals.empty')}</Text>
            </View>
          )}
          {deals.map((d, idx) => {
            const meta = DEAL_STATUS[String(d?.status ?? '')] ?? DEAL_STATUS.drafted
            return (
              <View
                key={d?.id ?? idx}
                className='deal-row'
                onClick={() =>
                  Taro.navigateTo({
                    url: `/pages/tenant/deals/detail?deal_id=${d?.id}`
                  })
                }
              >
                <View className='deal-row__left'>
                  <Text className='deal-row__title'>
                    {d?.listing_title || `${t('deals.orderFallback')} ${String(d?.id ?? '').slice(0, 8)}`}
                  </Text>
                  <Text className='deal-row__meta'>
                    {d?.sale_price ? `${money(Number(d.sale_price), d?.currency)} · ` : ''}
                    {fmtDate(d?.created_at)}
                  </Text>
                </View>
                <View className={`deal-row__badge deal-row__badge--${meta.cls}`}>
                  <Text>{meta.text}</Text>
                </View>
                <View className='chevron' />
              </View>
            )
          })}
        </View>
      </View>
    </View>
  )
}
