import { DETAIL_PAGE_SIZE } from '@/lib/pagination'
/**
 * 我的关注（收藏列表）—— C 端「我的 - 常用功能 - 我的关注」。
 *
 * 数据来自后端 `/favorites`（App 端已在用）。收藏的房源优先跳公开详情（listing_id），
 * 没有在架单时回退站内房源详情。加载失败与「真的没有关注」分开呈现：
 * 请求失败却渲染空态，等于把网络故障说成业务事实。
 */
import { useState } from 'react'
import { View, Text, Image } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { favoritesApi } from '@/services/api'
import { photoUrl } from '@/lib/publicSite'
import { fmtMoney as money } from '@/utils/format'
import { iconStyle } from '@/utils/icons'
import StateBlock from '@/components/StateBlock'
import ShellHeader from '@/components/ShellHeader'
import { useI18n } from '@/i18n'
import './index.scss'

interface FavItem {
  id?: string
  property_id?: string
  listing_id?: string | null
  title?: string | null
  room_number?: string | null
  address?: string | null
  monthly_rent?: number | null
  currency?: string | null
  photo?: string | null
}

export default function FavoritesPage() {
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)
  const { t } = useI18n()
  const [items, setItems] = useState<FavItem[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = async () => {
    setFailed(false)
    try {
      const res: any = await favoritesApi.list({ page: 1, page_size: DETAIL_PAGE_SIZE })
      const payload = res?.data ?? res
      const rows = Array.isArray(payload) ? payload : payload?.items ?? []
      setItems(rows)
    } catch (err) {
      console.error('[favorites] 加载失败', err)
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }

  useDidShow(() => {
    Taro.setNavigationBarTitle({ title: t('nav.favorites') })
    loadFromStorage()
    if (!useAuthStore.getState().token) {
      Taro.redirectTo({ url: '/pages/login/index' })
      return
    }
    setLoading(true)
    void load()
  })

  const openDetail = (item: FavItem) => {
    if (item.listing_id) {
      Taro.navigateTo({ url: `/pages/public/listing-detail/index?id=${item.listing_id}` })
      return
    }
    if (item.property_id) {
      Taro.navigateTo({ url: `/pages/tenant/property-detail/index?id=${item.property_id}` })
    }
  }

  const unfavorite = async (item: FavItem) => {
    if (!item.property_id || busyId) return
    setBusyId(String(item.property_id))
    try {
      await favoritesApi.remove(String(item.property_id))
      setItems((prev) => prev.filter((it) => it.property_id !== item.property_id))
    } catch (err) {
      Taro.showToast({ title: t('fav.unfavoriteFailed'), icon: 'none' })
      console.error('[favorites] 取消关注失败', err)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <View className='fav-page'>
      <ShellHeader title={t('nav.favorites')} />
      <View className='page-container'>
        {loading && items.length === 0 && (
          <StateBlock loading text={t('common.loading')} />
        )}
        {!loading && failed && (
          <StateBlock
            error
            text={t('common.loadFailedTapRetry')}
            retryText={t('common.tapRetry')}
            onRetry={() => {
              setLoading(true)
              void load()
            }}
          />
        )}
        {!loading && !failed && items.length === 0 && (
          <StateBlock empty text={t('fav.empty')} />
        )}
        {items.map((it, idx) => {
          const cover = photoUrl(it.photo) || ''
          const title =
            it.title ||
            it.room_number ||
            t('pub.listingFallback', { id: String(it.property_id ?? '').slice(0, 8) })
          return (
            <View key={it.id ?? idx} className='fav-card' onClick={() => openDetail(it)}>
              {cover ? (
                <Image className='fav-card__cover' src={cover} mode='aspectFill' />
              ) : (
                <View className='fav-card__cover fav-card__cover--empty'>
                  <Text>{t('pub.noPhoto')}</Text>
                </View>
              )}
              <View className='fav-card__body'>
                <Text className='fav-card__title'>{title}</Text>
                {it.address ? <Text className='fav-card__sub'>{it.address}</Text> : null}
                <Text className='fav-card__price'>
                  {money(it.monthly_rent ?? 0, it.currency)}
                  <Text className='fav-card__unit'> {t('rent.perMonth')}</Text>
                </Text>
              </View>
              <View
                className='fav-card__heart'
                onClick={(e) => {
                  e.stopPropagation()
                  void unfavorite(it)
                }}
              >
                <View className='icon-svg' style={iconStyle('heartFill', 32)} />
              </View>
            </View>
          )
        })}
      </View>
    </View>
  )
}