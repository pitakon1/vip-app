import { useEffect, useState } from 'react'
import { View, Text, ScrollView, Input } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { dedupeReviewApi, listingApi } from '@/services/api'
import './index.scss'

const pickList = (res: any): any[] => {
  if (Array.isArray(res)) return res
  if (Array.isArray(res?.items)) return res.items
  if (Array.isArray(res?.data)) return res.data
  if (Array.isArray(res?.data?.items)) return res.data.items
  return []
}

const fmtScore = (s?: number) => (s === null || s === undefined ? '-' : `${Math.round(Number(s) * 100)}%`)

interface Row {
  id: string
  candidate_listing_id?: string | null
  matched_property_id?: string | null
  matched_listing_id?: string | null
  match_type?: string | null
  match_key?: string | null
  score?: number | null
  status?: string | null
  // 候选上架单富化
  _room?: string
  _address?: string
}

export default function StaffDedupeReviewPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [note, setNote] = useState('')
  const [activeId, setActiveId] = useState('')

  const enrich = async (r: Row): Promise<Row> => {
    if (!r.candidate_listing_id) return r
    try {
      const res: any = await listingApi.get(r.candidate_listing_id)
      const d = res?.data ?? res
      return { ...r, _room: d?.room_number || r.match_key || '', _address: d?.address || '' }
    } catch {
      return r
    }
  }

  const load = async () => {
    setLoading(true)
    try {
      const res: any = await dedupeReviewApi.list({ status: 'pending', page: 1, page_size: 50 })
      const list = pickList(res)
      const enriched = await Promise.all(list.map(enrich))
      setRows(enriched)
    } catch (e: any) {
      Taro.showToast({ title: e?.message || '加载去重队列失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const doMerge = async (r: Row) => {
    Taro.showModal({
      title: '确认合并',
      content: '确认该候选与匹配房源为重复，将候选停用合并？',
      success: async (m) => {
        if (!m.confirm) return
        try {
          await dedupeReviewApi.merge(r.id, note.trim() || undefined)
          Taro.showToast({ title: '已合并', icon: 'success' })
          setNote('')
          setActiveId('')
          load()
        } catch (e: any) {
          Taro.showToast({ title: e?.message || '操作失败', icon: 'none' })
        }
      }
    })
  }

  const doDismiss = async (r: Row) => {
    Taro.showModal({
      title: '确认驳回',
      content: '确认该候选与匹配房源不重复，取消去重标记并继续上架审核？',
      success: async (m) => {
        if (!m.confirm) return
        try {
          await dedupeReviewApi.dismiss(r.id, note.trim() || undefined)
          Taro.showToast({ title: '已驳回', icon: 'success' })
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
    <View className='dr-page'>
      <View className='dr-hint'>疑似重复房源人工审核：比对候选与匹配方信息，确认「合并」或「驳回（非重复）」。</View>

      <ScrollView scrollY className='dr-list'>
        {loading && rows.length === 0 && (
          <View className='dr-state'><Text className='dr-state__text'>加载中...</Text></View>
        )}
        {!loading && rows.length === 0 && (
          <View className='dr-state'><Text className='dr-state__text'>暂无待审核的疑似重复</Text></View>
        )}

        {rows.map((r) => (
          <View key={r.id} className='dr-card'>
            <View className='dr-card__head'>
              <Text className='dr-card__tag'>疑似重复 · {fmtScore(r.score)}</Text>
              <Text className='dr-card__type'>{r.match_type === 'fuzzy' ? '相似度命中' : '强命中'}</Text>
            </View>

            <View className='dr-cmp'>
              <View className='dr-cmp__side dr-cmp__side--cand'>
                <Text className='dr-cmp__label'>候选上架单</Text>
                <Text className='dr-cmp__room'>{r._room || '—'}</Text>
                <Text className='dr-cmp__addr'>{r._address || r.match_key || ''}</Text>
                <Text className='dr-cmp__id'>#{r.candidate_listing_id ? r.candidate_listing_id.slice(0, 8) : '-'}</Text>
              </View>
              <View className='dr-cmp__arrow'>→</View>
              <View className='dr-cmp__side'>
                <Text className='dr-cmp__label'>匹配房源</Text>
                <Text className='dr-cmp__room'>#{r.matched_property_id ? r.matched_property_id.slice(0, 8) : '-'}</Text>
                <Text className='dr-cmp__addr'>匹配键：{r.match_key || '—'}</Text>
                <Text className='dr-cmp__id'>
                  {r.matched_listing_id ? `上架单 #${r.matched_listing_id.slice(0, 8)}` : '档案匹配'}
                </Text>
              </View>
            </View>

            {activeId === r.id && (
              <View className='dr-note'>
                <Input
                  className='dr-note__input'
                  value={note}
                  placeholder='备注（可选）'
                  placeholderStyle='color:#98a1ab'
                  onInput={(e) => setNote(e.detail.value)}
                />
              </View>
            )}

            <View className='dr-actions'>
              <View className='dr-btn dr-btn--merge' onClick={() => doMerge(r)}>
                <Text className='dr-btn__text'>合并</Text>
              </View>
              <View className='dr-btn dr-btn--dismiss' onClick={() => doDismiss(r)}>
                <Text className='dr-btn__text'>驳回</Text>
              </View>
              <View className='dr-btn dr-btn--ghost' onClick={() => setActiveId(activeId === r.id ? '' : r.id)}>
                <Text className='dr-btn__text'>备注</Text>
              </View>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  )
}