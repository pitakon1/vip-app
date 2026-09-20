import { useMemo, useState } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { listingApi, authApi } from '@/services/api'
import './index.scss'

// 上架单状态（ListingStatus）
const STATUS_META: Record<string, { label: string; cls: string }> = {
  pending: { label: '待审核', cls: 'st-badge st-badge--warning' },
  active: { label: '已上架', cls: 'st-badge st-badge--success' },
  rejected: { label: '已驳回', cls: 'st-badge st-badge--error' },
  closed: { label: '已关闭', cls: 'st-badge st-badge--neutral' },
  sold: { label: '已成交', cls: 'st-badge st-badge--success' },
  rented: { label: '已出租', cls: 'st-badge st-badge--success' }
}
const getStatus = (s?: string) => STATUS_META[s ?? ''] ?? STATUS_META.pending

// 去重状态（DedupeState）
const DEDUPE_META: Record<string, string> = {
  new: '正常',
  suspect: '疑似重复',
  blocked: '重复阻断',
  merged: '已合并'
}
const getDedupe = (s?: string) => DEDUPE_META[s ?? ''] ?? '-'

const pickList = (res: any): any[] => {
  if (Array.isArray(res)) return res
  if (Array.isArray(res?.items)) return res.items
  if (Array.isArray(res?.data)) return res.data
  if (Array.isArray(res?.data?.items)) return res.data.items
  return []
}

const fmtMoney = (v?: number) => Number(v || 0).toLocaleString()

export default function StaffListingsPage() {
  const user = useAuthStore((s) => s.user)
  const [listings, setListings] = useState<any[]>([])
  const [meId, setMeId] = useState('')
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<'mine' | 'all'>('mine')

  const fetchAll = async () => {
    setLoading(true)
    try {
      const [lk, me] = await Promise.all([
        listingApi.list({ page: 1, page_size: 100 }).catch(() => []),
        authApi.me().catch(() => null)
      ])
      setListings(pickList(lk))
      const md = (me as any)?.data ?? me
      setMeId(md?.id ? String(md.id) : user?.id ? String(user.id) : '')
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

  const onEdit = (l: any) => {
    Taro.navigateTo({ url: `/pages/staff/listing-edit/index?id=${l.id}` })
  }

  const onClose = (l: any) => {
    const isSell = l.listing_type === 'sell'
    const sold = isSell
    Taro.showModal({
      title: '关闭上架',
      content: isSell ? '确认该房源已成交并关闭上架？' : '确认关闭该上架单？',
      success: async (r) => {
        if (!r.confirm) return
        try {
          await listingApi.close(l.id, isSell ? { sold: true } : {})
          Taro.showToast({ title: '已关闭', icon: 'success' })
          fetchAll()
        } catch (e: any) {
          Taro.showToast({ title: e?.message || '操作失败', icon: 'none' })
        }
      }
    })
  }

  const onCardTap = (l: any) => {
    Taro.showActionSheet({
      itemList: ['编辑上架单', '关闭/成交'],
      success: (r) => {
        if (r.tapIndex === 0) onEdit(l)
        else if (r.tapIndex === 1) onClose(l)
      }
    })
  }

  return (
    <View className='st-page'>
      <View className='st-tabs'>
        <View
          className={`st-tab ${tab === 'mine' ? 'st-tab--active' : ''}`}
          onClick={() => setTab('mine')}
        >
          <Text className='st-tab__text'>我的上架单</Text>
        </View>
        <View
          className={`st-tab ${tab === 'all' ? 'st-tab--active' : ''}`}
          onClick={() => setTab('all')}
        >
          <Text className='st-tab__text'>全部</Text>
        </View>
      </View>

      <View className='st-head'>
        <Text className='st-head__title'>共 {visible.length} 条</Text>
        <View className='st-head__add' onClick={() => Taro.navigateTo({ url: '/pages/staff/listing-edit/index' })}>
          <Text className='st-head__add-text'>＋ 发布房源</Text>
        </View>
      </View>

      <ScrollView scrollY className='st-list'>
        {loading && visible.length === 0 && (
          <View className='st-state'><Text className='st-state__text'>加载中...</Text></View>
        )}
        {!loading && visible.length === 0 && (
          <View className='st-state'><Text className='st-state__text'>暂无上架单</Text></View>
        )}
        {visible.map((l) => {
          const st = getStatus(l.status)
          return (
            <View key={l.id} className='st-card' onClick={() => onCardTap(l)}>
              <View className='st-card__top'>
                <Text className='st-card__name'>{l.room_number || l.property_id || '房源'}</Text>
                <View className={st.cls}><Text className='st-badge__text'>{st.label}</Text></View>
              </View>
              <View className='st-card__addr'>{l.address || '暂无地址'}</View>
              <View className='st-card__price'>
                {l.listing_type === 'sell'
                  ? `售价 ${fmtMoney(l.asking_price)} ${l.currency}`
                  : `月租 ${fmtMoney(l.monthly_rent)} ${l.currency}`}
              </View>
              <View className='st-card__tags'>
                <Text className='st-meta'>委托：{l.mandate_type === 'exclusive' ? '独家' : '非独家'}</Text>
                <Text className='st-meta'>
                  分成：客源方 {l.buyer_side_rate ?? '-'}% / 房源方 {l.listing_side_rate ?? '-'}%
                </Text>
                {l.sale_commission_rate != null && (
                  <Text className='st-meta'>卖房佣金 {l.sale_commission_rate}%</Text>
                )}
                {l.rental_commission_months != null && (
                  <Text className='st-meta'>租房佣金 {l.rental_commission_months} 个月</Text>
                )}
              </View>
              <View className='st-card__foot'>
                <Text className={`st-meta st-meta--dedup st-meta--${l.dedupe_state || 'new'}`}>
                  去重：{getDedupe(l.dedupe_state)}
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