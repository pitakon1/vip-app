import { useCallback, useState } from 'react'
import { View, Text, ScrollView, Input } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { listingApi } from '@/services/api'
import './index.scss'

const pickList = (res: any): any[] => {
  if (Array.isArray(res)) return res
  if (Array.isArray(res?.items)) return res.items
  if (Array.isArray(res?.data)) return res.data
  if (Array.isArray(res?.data?.items)) return res.data.items
  return []
}

const STATUS_LABEL: Record<string, string> = {
  pending: '待审核',
  active: '已上架',
  rejected: '已驳回',
  closed: '已关闭',
  sold: '已成交',
  rented: '已出租'
}

const TABS = [
  { key: 'pending', label: '待审核' },
  { key: 'active', label: '已上架' },
  { key: 'rejected', label: '已驳回' }
]

const fmtMoney = (v?: number) => Number(v || 0).toLocaleString()

export default function StaffListingReviewPage() {
  const [tab, setTab] = useState('pending')
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [note, setNote] = useState('')
  const [activeId, setActiveId] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res: any = await listingApi.list({ status: tab, page: 1, page_size: 100 })
      setRows(pickList(res))
    } catch (e: any) {
      Taro.showToast({ title: e?.message || '加载上架单失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }, [tab])

  useDidShow(() => {
    load()
  })

  const onReview = (l: any, decision: 'approved' | 'rejected') => {
    if (decision === 'rejected' && !note.trim()) {
      return Taro.showToast({ title: '驳回请填写理由', icon: 'none' })
    }
    Taro.showModal({
      title: decision === 'approved' ? '通过上架' : '驳回上架',
      content:
        decision === 'approved'
          ? '确认通过该房源上架审核并对外展示？'
          : '确认驳回该上架单？',
      success: async (m) => {
        if (!m.confirm) return
        try {
          await listingApi.review(l.id, { decision, note: note.trim() })
          Taro.showToast({ title: decision === 'approved' ? '已上架' : '已驳回', icon: 'success' })
          setNote('')
          setActiveId('')
          load()
        } catch (e: any) {
          Taro.showToast({ title: e?.message || '操作失败', icon: 'none' })
        }
      }
    })
  }

  return (
    <View className='lr-page'>
      <View className='lr-tabs'>
        {TABS.map((t) => (
          <View
            key={t.key}
            className={`lr-tab ${tab === t.key ? 'lr-tab--active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            <Text className='lr-tab__text'>{t.label}</Text>
          </View>
        ))}
      </View>

      <ScrollView scrollY className='lr-list'>
        {loading && rows.length === 0 && (
          <View className='lr-state'><Text className='lr-state__text'>加载中...</Text></View>
        )}
        {!loading && rows.length === 0 && (
          <View className='lr-state'><Text className='lr-state__text'>暂无{STATUS_LABEL[tab] || ''}上架单</Text></View>
        )}

        {rows.map((l) => (
          <View key={l.id} className='lr-card'>
            <View className='lr-card__head'>
              <Text className='lr-card__name'>{l.room_number || l.property_id || '房源'}</Text>
              <View className='lr-card__badge'>
                <Text className='lr-card__badge-text'>{STATUS_LABEL[l.status] || l.status}</Text>
              </View>
            </View>
            <Text className='lr-card__addr'>{l.address || '暂无地址'}</Text>
            <Text className='lr-card__price'>
              {l.listing_type === 'sell'
                ? `售价 ${fmtMoney(l.asking_price)} ${l.currency} · 佣金 ${l.sale_commission_rate ?? '-'}%`
                : `月租 ${fmtMoney(l.monthly_rent)} ${l.currency} · 佣金 ${l.rental_commission_months ?? '-'}月`}
            </Text>
            <View className='lr-card__meta'>
              <Text>委托 {l.mandate_type === 'exclusive' ? '独家' : '非独家'}</Text>
              <Text>客源方 {l.buyer_side_rate ?? '-'}% / 房源方 {l.listing_side_rate ?? '-'}%</Text>
              <Text>去重 {l.dedupe_state || '-'}</Text>
            </View>
            {l.reject_reason && (
              <View className='lr-reason'>
                <Text className='lr-reason__text'>驳回原因：{l.reject_reason}</Text>
              </View>
            )}

            {tab === 'pending' && (
              <>
                {activeId === l.id && (
                  <View className='lr-note'>
                    <Input
                      className='lr-note__input'
                      value={note}
                      placeholder='审核意见 / 驳回理由（必填时）'
                      placeholderStyle='color:#98a1ab'
                      onInput={(e) => setNote(e.detail.value)}
                    />
                  </View>
                )}
                <View className='lr-actions'>
                  <View className='lr-btn lr-btn--reject' onClick={() => onReview(l, 'rejected')}>
                    <Text className='lr-btn__text'>驳回</Text>
                  </View>
                  <View className='lr-btn lr-btn--ghost' onClick={() => setActiveId(activeId === l.id ? '' : l.id)}>
                    <Text className='lr-btn__text'>意见</Text>
                  </View>
                  <View className='lr-btn lr-btn--approve' onClick={() => onReview(l, 'approved')}>
                    <Text className='lr-btn__text'>通过上架</Text>
                  </View>
                </View>
              </>
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  )
}