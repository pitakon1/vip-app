import { useState } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { request } from '@/lib/api'
import './index.scss'

interface ReviewItem {
  type: string
  id: string
  title: string
  applicant: string
  reason: string
  status: string
  created_at?: string
}

const TYPES: { key: string; label: string }[] = [
  { key: 'trip', label: '外勤申请' },
  { key: 'maintenance', label: '报修工单' },
  { key: 'service', label: '服务订单' },
  { key: 'contract', label: '合同流转' },
]
const TYPE_CARD: Record<string, string> = {
  trip: 'rv-type rv-type--warn',
  maintenance: 'rv-type rv-type--info',
  service: 'rv-type rv-type--ok',
  contract: 'rv-type rv-type--violet',
}

export default function ReviewPage() {
  const [items, setItems] = useState<ReviewItem[]>([])
  const [summary, setSummary] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(false)

  const fetchData = async () => {
    setLoading(true)
    try {
      const res: any = await request({ url: '/review-center/todos', method: 'GET' })
      const d = res ?? {}
      setItems(d.items ?? [])
      setSummary(d.summary ?? {})
    } catch (e) {
      console.error('[Review] 加载失败', e)
    } finally {
      setLoading(false)
    }
  }

  useDidShow(() => {
    fetchData()
  })

  const act = async (label: string, url: string, method: 'POST' | 'PATCH', data: any) => {
    try {
      await request({ url, method, data })
      Taro.showToast({ title: `${label}成功`, icon: 'success' })
      fetchData()
    } catch (e: any) {
      Taro.showToast({ title: e?.message || `${label}失败`, icon: 'none' })
    }
  }

  const confirmTrip = (item: ReviewItem, action: string) => {
    Taro.showModal({
      title: action === 'approved' ? '通过申请' : '驳回申请',
      content: item.title,
      confirmText: action === 'approved' ? '通过' : '驳回',
      confirmColor: action === 'approved' ? 'var(--primary)' : 'var(--error)',
      success: (r) => {
        if (r.confirm) {
          act('审批', `/attendance/external-trips/${item.id}/approve`, 'POST', {
            action,
            reply_note: action === 'approved' ? '管理员审批通过' : '管理员驳回',
          })
        }
      },
    })
  }

  return (
    <View className='rv-page'>
      <View className='rv-page__head'>
        <Text className='rv-page__title'>工单审核中心</Text>
        <Text className='rv-page__sub'>统一处理外勤/报修/服务/合同待办</Text>
      </View>

      {/* 汇总 */}
      <View className='rv-summary'>
        {TYPES.map((t) => (
          <View key={t.key} className='rv-summary__item'>
            <Text className='rv-summary__num'>{summary[t.key] ?? 0}</Text>
            <Text className='rv-summary__label'>{t.label}</Text>
          </View>
        ))}
      </View>

      {/* 列表 */}
      <View className='rv-section'>
        <View className='rv-section__head'>
          <Text className='rv-section__title'>待办审核</Text>
          <Text className='rv-section__hint'>{items.length} 项</Text>
        </View>

        {loading && items.length === 0 ? (
          <View className='rv-state'>
            <Text className='rv-state__title'>正在加载</Text>
          </View>
        ) : items.length === 0 ? (
          <View className='rv-state'>
            <Text className='rv-state__title'>暂无待办</Text>
            <Text className='rv-state__desc'>所有工单已处理完毕</Text>
          </View>
        ) : (
          items.map((item) => (
            <View key={`${item.type}-${item.id}`} className='rv-card'>
              <View className='rv-card__top'>
                <Text className={`rv-type ${TYPE_CARD[item.type] || ''}`}>
                  {TYPES.find((t) => t.key === item.type)?.label || item.type}
                </Text>
                <Text className='rv-card__time'>
                  {item.created_at ? String(item.created_at).replace('T', ' ').slice(5, 16) : ''}
                </Text>
              </View>
              <Text className='rv-card__title'>{item.title}</Text>
              <Text className='rv-card__reason'>申请人：{item.applicant} · {item.reason}</Text>
              <View className='rv-card__actions'>
                {item.type === 'trip' && (
                  <>
                    <View className='rv-btn rv-btn--primary' onClick={() => confirmTrip(item, 'approved')}>
                      <Text className='rv-btn--primary__text'>通过</Text>
                    </View>
                    <View className='rv-btn rv-btn--danger' onClick={() => confirmTrip(item, 'rejected')}>
                      <Text className='rv-btn--danger__text'>驳回</Text>
                    </View>
                  </>
                )}
                {item.type === 'maintenance' && (
                  <>
                    <View
                      className='rv-btn rv-btn--primary'
                      onClick={() => act('受理', `/maintenance-tickets/${item.id}`, 'PATCH', { status: 'assigned' })}
                    >
                      <Text className='rv-btn--primary__text'>受理</Text>
                    </View>
                    <View
                      className='rv-btn rv-btn--ghost'
                      onClick={() => act('完结', `/maintenance-tickets/${item.id}`, 'PATCH', { status: 'resolved' })}
                    >
                      <Text className='rv-btn--ghost__text'>完结</Text>
                    </View>
                  </>
                )}
                {item.type === 'service' && (
                  <View
                    className='rv-btn rv-btn--primary'
                    onClick={() => act('受理', `/service-orders/${item.id}/status`, 'PATCH', { status: 'assigned' })}
                  >
                    <Text className='rv-btn--primary__text'>受理</Text>
                  </View>
                )}
                {item.type === 'contract' && <Text className='rv-card__hint'>请在 Web 合同管理处理</Text>}
              </View>
            </View>
          ))
        )}
      </View>
    </View>
  )
}