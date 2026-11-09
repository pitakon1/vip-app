import { collectAllPages } from '@/lib/pagination'
import { useMemo, useState } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { listingApi, authApi } from '@/services/api'
import StateBlock from '@/components/StateBlock'
import ShellHeader from '@/components/ShellHeader'
import './index.scss'
import { useI18n } from '@/i18n'
import { errorText } from '@/lib/errorText'

// 上架单状态（ListingStatus）
const buildStatusMeta = (
  t: (k: string, p?: Record<string, string | number>) => string
): Record<string, { label: string; cls: string }> => ({
  pending: { label: t('staff.stPending'), cls: 'st-badge st-badge--warning' },
  active: { label: t('staff.stActive'), cls: 'st-badge st-badge--success' },
  rejected: { label: t('staff.stRejected'), cls: 'st-badge st-badge--error' },
  closed: { label: t('staff.stClosed'), cls: 'st-badge st-badge--neutral' },
  sold: { label: t('staff.stSold'), cls: 'st-badge st-badge--success' },
  rented: { label: t('staff.stRented'), cls: 'st-badge st-badge--success' }
})
const getStatus = (map: Record<string, { label: string; cls: string }>, s?: string) =>
  map[s ?? ''] ?? map.pending

// 去重状态（DedupeState）
const buildDedupeMeta = (
  t: (k: string, p?: Record<string, string | number>) => string
): Record<string, string> => ({
  new: t('staff.dedupeNew'),
  suspect: t('staff.dedupeSuspect'),
  blocked: t('staff.dedupeBlocked'),
  merged: t('staff.dedupeMerged')
})
const getDedupe = (map: Record<string, string>, s?: string) => map[s ?? ''] ?? '-'

const pickList = (res: any): any[] => {
  if (Array.isArray(res)) return res
  if (Array.isArray(res?.items)) return res.items
  if (Array.isArray(res?.data)) return res.data
  if (Array.isArray(res?.data?.items)) return res.data.items
  return []
}

const fmtMoney = (v?: number) => Number(v || 0).toLocaleString()

export default function StaffListingsPage() {
  const { t } = useI18n()
  const user = useAuthStore((s) => s.user)
  const [listings, setListings] = useState<any[]>([])
  const [meId, setMeId] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [tab, setTab] = useState<'mine' | 'all'>('mine')
  const STATUS_META = buildStatusMeta(t)
  const DEDUPE_META = buildDedupeMeta(t)

  const fetchAll = async () => {
    setLoading(true)
    setLoadError(false)
    try {
      // 「我的/全部」切换与统计都在前端完成，必须按页累加取全量上架单。
      const [items, me] = await Promise.all([
        collectAllPages<any>(async (page, pageSize) => {
          const res: any = await listingApi.list({ page, page_size: pageSize })
          return pickList(res)
        }),
        authApi.me().catch(() => null)
      ])
      setListings(items)
      const md = (me as any)?.data ?? me
      setMeId(md?.id ? String(md.id) : user?.id ? String(user.id) : '')
    } catch (error) {
      console.error('[StaffListings] 获取房源失败', error)
      setLoadError(true)
      Taro.showToast({ title: t('common.loadFailed'), icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  useDidShow(() => {
    fetchAll()
  })

  const visible = useMemo(
    () =>
      tab === 'mine' ? listings.filter((l) => l && String(l.publisher_user_id) === meId) : listings,
    [listings, tab, meId]
  )

  const onClose = (l: any) => {
    const isSell = l.listing_type === 'sell'
    const sold = isSell
    Taro.showModal({
      title: t('staff.closeTitle'),
      content: isSell ? t('staff.closeConfirmSold') : t('staff.closeConfirm'),
      success: async (r) => {
        if (!r.confirm) return
        try {
          await listingApi.close(l.id, isSell ? { sold: true } : {})
          Taro.showToast({ title: t('staff.stClosed'), icon: 'success' })
          fetchAll()
        } catch (e: any) {
          Taro.showToast({ title:errorText(e, t('common.opFailed')), icon: 'none' })
        }
      }
    })
  }

  // 点击卡片：直接进入下架确认（唯一可操作项）
  const onCardTap = (l: any) => {
    onClose(l)
  }

  return (
    <View className='st-page'>
      <ShellHeader title={t('nav.listings')} />
      <View className='st-tabs'>
        <View
          className={`st-tab ${tab === 'mine' ? 'st-tab--active' : ''}`}
          onClick={() => setTab('mine')}
        >
          <Text className='st-tab__text'>{t('staff.mineTitle')}</Text>
        </View>
        <View
          className={`st-tab ${tab === 'all' ? 'st-tab--active' : ''}`}
          onClick={() => setTab('all')}
        >
          <Text className='st-tab__text'>{t('common.all')}</Text>
        </View>
      </View>

      <View className='st-head'>
        <Text className='st-head__title'>{t('staff.countItems', { n: visible.length })}</Text>
      </View>

      <ScrollView scrollY className='st-list'>
        {loading && visible.length === 0 && (
          <StateBlock loading text={t('common.loading')} />
        )}
        {!loading && loadError && visible.length > 0 && (
          <View className='inline-error-bar' onClick={fetchAll}>
            <Text className='inline-error-bar__text'>{t('common.loadFailed')}</Text>
            <Text className='inline-error-bar__retry'>{t('acc.retry')}</Text>
          </View>
        )}
        {!loading && loadError && listings.length === 0 && (
          <StateBlock
            error
            text={t('common.loadFailed')}
            retryText={t('acc.retry')}
            onRetry={fetchAll}
          />
        )}
        {!loading && !loadError && visible.length === 0 && (
          <StateBlock empty text={t('staff.empty')} />
        )}
        {visible.map((l) => {
          const st = getStatus(STATUS_META, l.status)
          return (
            <View key={l.id} className='st-card' onClick={() => onCardTap(l)}>
              <View className='st-card__top'>
                <Text className='st-card__name'>{l.room_number || l.property_id || t('common.listingFallback')}</Text>
                <View className={st.cls}><Text className='st-badge__text'>{st.label}</Text></View>
              </View>
              <View className='st-card__addr'>{l.address || t('prop.noAddress')}</View>
              <View className='st-card__price'>
                {l.listing_type === 'sell'
                  ? `${t('pub.salePrice')} ${fmtMoney(l.asking_price)} ${l.currency}`
                  : `${t('lease.monthlyRent')} ${fmtMoney(l.monthly_rent)} ${l.currency}`}
              </View>
              <View className='st-card__tags'>
                <Text className='st-meta'>{t('staff.mandateLabel', { v: l.mandate_type === 'exclusive' ? t('staff.exclusive') : t('staff.nonExclusive') })}</Text>
                <Text className='st-meta'>
                  {t('staff.splitLabel', { a: l.buyer_side_rate ?? '-', b: l.listing_side_rate ?? '-' })}
                </Text>
                {l.sale_commission_rate != null && (
                  <Text className='st-meta'>{t('staff.saleCommission', { rate: l.sale_commission_rate })}</Text>
                )}
                {l.rental_commission_months != null && (
                  <Text className='st-meta'>{t('staff.rentalCommission', { n: l.rental_commission_months })}</Text>
                )}
              </View>
              <View className='st-card__foot'>
                <Text className={`st-meta st-meta--dedup st-meta--${l.dedupe_state || 'new'}`}>
                  {t('staff.dedupeLabel', { v: getDedupe(DEDUPE_META, l.dedupe_state) })}
                </Text>
                <Text className='st-meta'>{l.created_at ? String(l.created_at).slice(0, 10) : ''}</Text>
              </View>
            </View>
          )
        })}
      </ScrollView>
    </View>
  )
}