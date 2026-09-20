import { useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { propertyDealApi, saleListingApi } from '@/services/api'
import { fmtMoney as money } from '@/utils/format'
import './index.scss'

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

const pickList = (res: any): any[] => {
  const d = res?.data ?? res
  if (Array.isArray(d)) return d
  if (Array.isArray(d?.items)) return d.items
  if (Array.isArray(d?.list)) return d.list
  return []
}

export default function TenantDealsPage() {
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)
  const [deals, setDeals] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const fetchDeals = async () => {
    setLoading(true)
    try {
      const [dRes, lRes]: [any, any] = await Promise.all([
        propertyDealApi.list({ page: 1, page_size: 50 }),
        saleListingApi.list({ page: 1, page_size: 50 }).catch(() => null)
      ])
      const titles: Record<string, string> = {}
      pickList(lRes).forEach((r) => {
        if (r?.id) titles[String(r.id)] = r.title ?? ''
      })
      setDeals(
        pickList(dRes).map((r) => ({
          ...r,
          listing_title: titles[String(r.sale_listing_id ?? '')] ?? ''
        }))
      )
    } catch (e) {
      console.warn('[Deals] 获取交易订单失败', e)
      setDeals([])
    } finally {
      setLoading(false)
    }
  }

  useDidShow(() => {
    Taro.setNavigationBarTitle({ title: '我的交易订单' })
    loadFromStorage()
    if (!useAuthStore.getState().token) {
      Taro.redirectTo({ url: '/pages/login/index' })
      return
    }
    fetchDeals()
  })

  return (
    <View className='tenant-deals-page'>
      <View className='page-container'>
        <View className='card card--list'>
          {loading && deals.length === 0 && (
            <View className='empty-tip'>
              <Text>加载中...</Text>
            </View>
          )}
          {!loading && deals.length === 0 && (
            <View className='empty-tip'>
              <Text>暂无交易订单，提交看房约谈或认购后在这里跟进进度</Text>
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
                    {d?.listing_title || `交易订单 ${String(d?.id ?? '').slice(0, 8)}`}
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
