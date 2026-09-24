/**
 * 降价提醒 —— C 端「我的 - 常用功能 - 降价提醒」。
 *
 * 数据来自后端 `/price-alerts`（App 端已在用）。展示订阅时的价格与当前挂牌价，
 * 两者有差即为已触达降价；可逐条取消订阅。加载失败与「没有订阅」分开呈现。
 */
import { useState } from 'react'
import { View, Text, Image } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { priceAlertsApi } from '@/services/api'
import { photoUrl } from '@/lib/publicSite'
import { fmtMoney as money } from '@/utils/format'
import { useI18n } from '@/i18n'
import './index.scss'

interface AlertItem {
  id?: string
  property_id?: string
  listing_id?: string | null
  title?: string | null
  room_number?: string | null
  address?: string | null
  subscribed_price?: number | null
  current_price?: number | null
  currency?: string | null
  photo?: string | null
  notified_at?: string | null
}

export default function PriceAlertsPage() {
  const { t } = useI18n()
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)
  const [items, setItems] = useState<AlertItem[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = async () => {
    setFailed(false)
    try {
      const res: any = await priceAlertsApi.list({ page: 1, page_size: 50 })
      const payload = res?.data ?? res
      const rows = Array.isArray(payload) ? payload : payload?.items ?? []
      setItems(rows)
    } catch (err) {
      console.error('[price-alerts] 加载失败', err)
      setFailed(true)
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useDidShow(() => {
    Taro.setNavigationBarTitle({ title: t('priceAlert.title') })
    loadFromStorage()
    if (!useAuthStore.getState().token) {
      Taro.redirectTo({ url: '/pages/login/index' })
      return
    }
    setLoading(true)
    void load()
  })

  const openDetail = (item: AlertItem) => {
    if (item.listing_id) {
      Taro.navigateTo({ url: `/pages/public/listing-detail/index?id=${item.listing_id}` })
      return
    }
    if (item.property_id) {
      Taro.navigateTo({ url: `/pages/tenant/property-detail/index?id=${item.property_id}` })
    }
  }

  const unsubscribe = async (item: AlertItem) => {
    if (!item.property_id || busyId) return
    setBusyId(String(item.property_id))
    try {
      await priceAlertsApi.unsubscribe(String(item.property_id))
      setItems((prev) => prev.filter((it) => it.property_id !== item.property_id))
    } catch (err) {
      Taro.showToast({ title: t('priceAlert.unsubFailed'), icon: 'none' })
      console.error('[price-alerts] 取消订阅失败', err)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <View className='alert-page'>
      <View className='page-container'>
        {loading && items.length === 0 && (
          <View className='empty-tip'>
            <Text>{t('common.loading')}</Text>
          </View>
        )}
        {!loading && failed && (
          <View className='empty-tip' onClick={() => { setLoading(true); void load() }}>
            <Text>{t('common.loadFailedTapRetry')}</Text>
          </View>
        )}
        {!loading && !failed && items.length === 0 && (
          <View className='empty-tip'>
            <Text>{t('priceAlert.empty')}</Text>
          </View>
        )}
        {items.map((it, idx) => {
          const cover = photoUrl(it.photo) || ''
          const title = it.title || it.room_number || `${t('common.listingFallback')} #${String(it.property_id ?? '').slice(0, 8)}`
          const subscribed = Number(it.subscribed_price ?? 0)
          const current = Number(it.current_price ?? subscribed)
          const diff = subscribed - current
          const dropped = diff > 0
          return (
            <View key={it.id ?? idx} className='alert-card' onClick={() => openDetail(it)}>
              {cover ? (
                <Image className='alert-card__cover' src={cover} mode='aspectFill' />
              ) : (
                <View className='alert-card__cover alert-card__cover--empty'>
                  <Text>{t('pub.noPhoto')}</Text>
                </View>
              )}
              <View className='alert-card__body'>
                <Text className='alert-card__title'>{title}</Text>
                {it.address ? <Text className='alert-card__sub'>{it.address}</Text> : null}
                <View className='alert-card__prices'>
                  <Text className='alert-card__price'>{money(current, it.currency)}</Text>
                  {subscribed > 0 && subscribed !== current ? (
                    <Text className='alert-card__was'>{t('priceAlert.subscribedPrice', { price: money(subscribed, it.currency) })}</Text>
                  ) : null}
                </View>
                {dropped ? (
                  <Text className='alert-card__badge'>
                    {t('priceAlert.dropped', { amount: money(diff, it.currency) })}
                  </Text>
                ) : (
                  <Text className='alert-card__hint'>
                    {it.notified_at ? t('priceAlert.notified') : t('priceAlert.waiting')}
                  </Text>
                )}
              </View>
              <View
                className='alert-card__cancel'
                onClick={(e) => {
                  e.stopPropagation()
                  void unsubscribe(it)
                }}
              >
                <Text className='alert-card__cancel-text'>{t('common.cancel')}</Text>
              </View>
            </View>
          )
        })}
      </View>
    </View>
  )
}