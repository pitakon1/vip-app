import { useState } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { saleListingApi, propertyDealApi } from '@/services/api'
import '../_shared.scss'
import './index.scss'

type Tab = 'listing' | 'deal'

interface ListingItem {
  id: string
  title?: string
  sale_type?: string
  asking_price?: number
  currency?: string
  status?: string
  address?: string
}

interface DealItem {
  id: string
  buyer_user_id?: string
  property_id?: string
  price?: number
  currency?: string
  status?: string
}

const LISTING_STATUS: Record<string, string> = {
  active: '在售',
  pending: '待审核',
  contracted: '已签约',
  closed: '已成交',
  cancelled: '已取消',
  expired: '已过期'
}
const DEAL_STATUS: Record<string, string> = {
  negotiating: '洽谈中',
  contracted: '已签约',
  closed: '已成交',
  cancelled: '已取消'
}

const pick = (res: any): any[] => {
  const d = res?.data ?? res
  if (Array.isArray(d)) return d
  return Array.isArray(d?.items) ? d.items : []
}

const fmtMoney = (v: number | undefined, currency?: string) => {
  const sym: Record<string, string> = { CNY: '¥', THB: '฿', EUR: '€', USD: '$' }
  return `${sym[currency || 'THB'] || '฿'}${Number(v || 0).toLocaleString()}`
}

export default function SaleDealsPage() {
  const [tab, setTab] = useState<Tab>('listing')
  const [listings, setListings] = useState<ListingItem[]>([])
  const [deals, setDeals] = useState<DealItem[]>([])
  const [loading, setLoading] = useState(false)

  const fetchListings = async () => {
    setLoading(true)
    try {
      const res: any = await saleListingApi.list({ page_size: 100 })
      setListings(pick(res))
    } catch (e) {
      Taro.showToast({ title: '加载挂牌失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  const fetchDeals = async () => {
    setLoading(true)
    try {
      const res: any = await propertyDealApi.list({ page_size: 100 })
      setDeals(pick(res))
    } catch (e) {
      Taro.showToast({ title: '加载成交失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  const switchTab = (t: Tab) => {
    setTab(t)
    if (t === 'listing' && listings.length === 0) fetchListings()
    if (t === 'deal' && deals.length === 0) fetchDeals()
  }

  useDidShow(() => {
    if (!useAuthStore.getState().token) {
      Taro.redirectTo({ url: '/pages/login/index' })
      return
    }
    fetchListings()
  })

  const changeListingStatus = async (id: string, status: string) => {
    try {
      await saleListingApi.updateStatus(id, status)
      Taro.showToast({ title: '已更新', icon: 'success' })
      fetchListings()
    } catch (e) {
      Taro.showToast({ title: '更新失败', icon: 'none' })
    }
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: 'listing', label: '买卖挂牌' },
    { key: 'deal', label: '成交管理' }
  ]

  return (
    <View className='admin-page'>
      <View className='page-container'>
        <Text className='page-title'>买卖交易闭环</Text>

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

        {tab === 'listing' && (
          <View>
            <View className='section-title'><Text>挂牌房源</Text></View>
            {listings.length === 0 ? (
              <View className='empty-tip'><Text>{loading ? '加载中...' : '暂无挂牌，可在 App / Web 端新增'}</Text></View>
            ) : (
              listings.map((l) => (
                <View key={l.id} className='card-item'>
                  <View className='card-item__head'>
                    <Text className='card-item__title'>{l.title || '未命名房源'}</Text>
                    <View className={`badge ${l.status === 'active' ? 'badge--ok' : 'badge--warn'}`}>
                      <Text>{LISTING_STATUS[l.status || ''] || l.status}</Text>
                    </View>
                  </View>
                  <Text className='card-item__sub'>{l.sale_type === 'buy' ? '求购' : '求售'} · {fmtMoney(l.asking_price, l.currency)}</Text>
                  {l.address ? <Text className='card-item__sub'>{l.address}</Text> : null}
                  <View className='action-row'>
                    {l.status === 'pending' && (
                      <Text className='mini-btn mini-btn--primary' onClick={() => changeListingStatus(l.id, 'active')}>上架</Text>
                    )}
                    {l.status === 'active' && (
                      <Text className='mini-btn mini-btn--warn' onClick={() => changeListingStatus(l.id, 'closed')}>标记成交</Text>
                    )}
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {tab === 'deal' && (
          <View>
            <View className='section-title'><Text>产权成交</Text></View>
            {deals.length === 0 ? (
              <View className='empty-tip'><Text>{loading ? '加载中...' : '暂无成交记录'}</Text></View>
            ) : (
              deals.map((d) => (
                <View key={d.id} className='card-item'>
                  <View className='card-item__head'>
                    <Text className='card-item__title'>成交 {fmtMoney(d.price, d.currency)}</Text>
                    <View className='badge badge--ok'>
                      <Text>{DEAL_STATUS[d.status || ''] || d.status}</Text>
                    </View>
                  </View>
                  <Text className='card-item__sub'>买家ID：{d.buyer_user_id || '-'}</Text>
                  <Text className='card-item__sub'>房源ID：{d.property_id || '-'}</Text>
                </View>
              ))
            )}
          </View>
        )}
      </View>
    </View>
  )
}