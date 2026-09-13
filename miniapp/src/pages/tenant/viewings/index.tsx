import { useState } from 'react'
import { View, Text, ScrollView, Input, Picker } from '@tarojs/components'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { propertiesApi, viewingsApi } from '@/services/api'
import './index.scss'

interface Viewing {
  id: string
  property_id: string
  property_title?: string
  property_address?: string
  scheduled_at?: string
  status?: string
}

interface Property {
  id: string
  title?: string
  address?: string
}

const STATUS_MAP: Record<string, { text: string; color: string }> = {
  pending: { text: '待确认', color: '#d97706' },
  confirmed: { text: '已确认', color: '#16a34a' },
  completed: { text: '已完成', color: '#0ea5e9' },
  cancelled: { text: '已取消', color: '#999999' },
  no_show: { text: '爽约', color: '#dc2626' }
}

function pickList(res: any): any[] {
  if (Array.isArray(res)) return res
  if (Array.isArray(res?.data)) return res.data
  if (Array.isArray(res?.items)) return res.items
  if (Array.isArray(res?.data?.items)) return res.data.items
  if (Array.isArray(res?.data?.list)) return res.data.list
  return []
}

const formatDate = (x?: string) => (x ? x.replace('T', ' ').slice(0, 16) : '—')

const MANAGER_ROLES = ['admin', 'employee', 'agent']

export default function TenantViewingsPage() {
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)
  const user = useAuthStore((state) => state.user)
  const isManager = !!user && MANAGER_ROLES.includes(user.role)
  const [viewings, setViewings] = useState<Viewing[]>([])
  const [loading, setLoading] = useState(false)

  const [properties, setProperties] = useState<Property[]>([])
  const [propIndex, setPropIndex] = useState(0)
  const [timeText, setTimeText] = useState('')
  const [noteText, setNoteText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const router = useRouter()
  const routerPropertyId = router.params?.property_id

  const fetchViewings = async () => {
    setLoading(true)
    try {
      const calls: any[] = [
        isManager
          ? viewingsApi.list().catch(() => ({ data: { items: [] } }))
          : viewingsApi.mine().catch(() => ({ data: { items: [] } })),
        propertiesApi.list({ available: true })
      ]
      const [vRes, pRes]: any[] = await Promise.allSettled(calls)
      if (vRes.status === 'fulfilled') {
        const reqData = vRes.value?.data ?? vRes.value
        const list = pickList(reqData)
        setViewings(list as Viewing[])
      } else {
        setViewings([])
      }
      if (pRes.status === 'fulfilled') {
        const props = pickList(pRes.value)
        if (props.length) {
          setProperties(props)
          // 支持从收藏页跳转时按 property_id 预选房源
          const idx = routerPropertyId
            ? props.findIndex((p: any) => String(p.id) === String(routerPropertyId))
            : -1
          setPropIndex(idx >= 0 ? idx : 0)
        }
      }
    } catch (error) {
      console.error('[Viewings] 加载失败', error)
      Taro.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  const changeStatus = async (id: string, status: string) => {
    try {
      await viewingsApi.updateStatus(id, { status })
      Taro.showToast({ title: '状态已更新', icon: 'success' })
      fetchViewings()
    } catch (e: any) {
      console.error('[Viewings] 更新状态失败', e)
      Taro.showToast({ title: '更新失败', icon: 'none' })
    }
  }

  useDidShow(() => {
    loadFromStorage()
    if (!useAuthStore.getState().token) {
      Taro.redirectTo({ url: '/pages/login/index' })
      return
    }
    fetchViewings()
  })

  const handleSubmit = async () => {
    const prop = properties[propIndex]
    if (!prop) {
      Taro.showToast({ title: '请选择房源', icon: 'none' })
      return
    }
    if (!timeText.trim()) {
      Taro.showToast({ title: '请填写看房时间', icon: 'none' })
      return
    }
    setSubmitting(true)
    try {
      await viewingsApi.create({
        property_id: prop.id,
        scheduled_at: timeText.trim().replace(' ', 'T'),
        notes: noteText.trim() || undefined
      })
      Taro.showToast({ title: '预约已提交', icon: 'success' })
      setTimeText('')
      setNoteText('')
      fetchViewings()
    } catch (error) {
      console.error('[Viewings] 提交失败', error)
      Taro.showToast({ title: '提交失败', icon: 'none' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <View className='tenant-viewings-page'>
      <View className='page-container'>
        {!isManager && (
          <View className='form-card'>
            <Text className='form-title'>预约看房</Text>
            <Text className='form-label'>选择房源</Text>
            {properties.length > 0 ? (
              <Picker
                mode='selector'
                range={properties.map((p) => p.title || '房源')}
                value={propIndex}
                onChange={(e) => setPropIndex(Number((e as any).detail.value))}
              >
                <View className='form-value'>
                  <Text className='form-value-text'>
                    {properties[propIndex]?.title || '房源'}
                  </Text>
                  <Text className='form-value-arrow'>▾</Text>
                </View>
              </Picker>
            ) : (
              <Text className='form-empty'>暂无可预约房源</Text>
            )}
            <Text className='form-label'>希望时间</Text>
            <Input
              className='form-input'
              value={timeText}
              placeholder='如 2026-09-20 10:00'
              onInput={((e: any) => setTimeText((e as any).detail.value)) as any}
            />
            <Text className='form-label'>备注（可选）</Text>
            <Input
              className='form-input'
              value={noteText}
              placeholder='如：希望看白天时段'
              onInput={((e: any) => setNoteText((e as any).detail.value)) as any}
            />
            <View
              className={`form-btn ${submitting ? 'disabled' : ''}`}
              onClick={handleSubmit}
            >
              <Text className='form-btn-text'>
                {submitting ? '提交中...' : '提交预约'}
              </Text>
            </View>
          </View>
        )}

        <View className='section-title'>
          <Text>{isManager ? '全部看房预约' : '我的预约'}</Text>
        </View>

        <ScrollView scrollY className='viewing-list'>
          {loading && viewings.length === 0 && (
            <View className='empty-tip'>
              <Text>加载中...</Text>
            </View>
          )}
          {!loading && viewings.length === 0 && (
            <View className='empty-tip'>
              <Text>暂无预约记录</Text>
            </View>
          )}
          {viewings.map((v) => {
            const info = STATUS_MAP[v.status || 'pending'] || STATUS_MAP.pending
            return (
              <View key={v.id} className='viewing-card'>
                <View className='viewing-card-header'>
                  <Text className='viewing-card-title'>{v.property_title || '房源'}</Text>
                  <Text className='viewing-card-status' style={{ color: info.color }}>
                    {info.text}
                  </Text>
                </View>
                {!!v.property_address && (
                  <Text className='viewing-card-address'>{v.property_address}</Text>
                )}
                <Text className='viewing-card-time'>{formatDate(v.scheduled_at)}</Text>
                {isManager && (
                  <>
                    {(v.visitor_name || v.visitor_phone) && (
                      <Text className='viewing-card-time'>
                        访客：{v.visitor_name || '—'} {v.visitor_phone || ''}
                      </Text>
                    )}
                    <View className='viewing-actions'>
                      {(v.status === 'pending' || v.status === 'confirmed') && (
                        <View
                          className='viewing-btn viewing-btn--primary'
                          onClick={() => changeStatus(v.id, v.status === 'pending' ? 'confirmed' : 'completed')}
                        >
                          <Text className='viewing-btn-text'>
                            {v.status === 'pending' ? '确认' : '完成'}
                          </Text>
                        </View>
                      )}
                      {(v.status === 'pending' || v.status === 'confirmed') && (
                        <View
                          className='viewing-btn viewing-btn--warn'
                          onClick={() => changeStatus(v.id, 'no_show')}
                        >
                          <Text className='viewing-btn-text'>爽约</Text>
                        </View>
                      )}
                      {v.status === 'pending' && (
                        <View
                          className='viewing-btn viewing-btn--ghost'
                          onClick={() => changeStatus(v.id, 'cancelled')}
                        >
                          <Text className='viewing-btn-text'>取消</Text>
                        </View>
                      )}
                    </View>
                  </>
                )}
              </View>
            )
          })}
        </ScrollView>
      </View>
    </View>
  )
}