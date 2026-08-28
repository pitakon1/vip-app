import { useState } from 'react'
import { View, Text, Input, Textarea, Button, ScrollView, Picker } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { maintenanceApi } from '@/services/api'
import type { MaintenanceTicket, MaintenanceStatus, MaintenancePriority } from '@/types'
import './index.scss'

const STATUS_MAP: Record<MaintenanceStatus, { text: string; color: string }> = {
  pending: { text: '待处理', color: '#faad14' },
  processing: { text: '处理中', color: '#1677ff' },
  completed: { text: '已完成', color: '#52c41a' },
  cancelled: { text: '已取消', color: '#999999' }
}

const PRIORITY_OPTIONS: MaintenancePriority[] = ['low', 'medium', 'high']
const PRIORITY_LABELS = ['低', '中', '高']

function pickList(res: any): MaintenanceTicket[] {
  if (Array.isArray(res)) return res
  if (Array.isArray(res?.data)) return res.data
  if (Array.isArray(res?.items)) return res.items
  if (Array.isArray(res?.list)) return res.list
  if (Array.isArray(res?.data?.items)) return res.data.items
  if (Array.isArray(res?.data?.list)) return res.data.list
  return []
}

export default function TenantMaintenancePage() {
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)
  const [tickets, setTickets] = useState<MaintenanceTicket[]>([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<MaintenancePriority>('medium')

  const fetchTickets = async () => {
    setLoading(true)
    try {
      const res = await maintenanceApi.list()
      setTickets(pickList(res))
    } catch (error) {
      console.error('[Maintenance] 获取报修列表失败', error)
      Taro.showToast({ title: '加载报修列表失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  useDidShow(() => {
    loadFromStorage()
    if (!useAuthStore.getState().token) {
      Taro.redirectTo({ url: '/pages/login/index' })
      return
    }
    fetchTickets()
  })

  const resetForm = () => {
    setTitle('')
    setDescription('')
    setPriority('medium')
  }

  const handleSubmit = async () => {
    if (!title || !description) {
      Taro.showToast({ title: '请填写标题和描述', icon: 'none' })
      return
    }

    setSubmitting(true)
    Taro.showLoading({ title: '提交中...', mask: true })
    try {
      const res = await maintenanceApi.create({ title, description, priority })
      // 乐观更新：把新工单插到列表头部
      const created = (res as any)?.data || res
      const newTicket: MaintenanceTicket = {
        id: created?.id ?? Date.now(),
        propertyId: created?.propertyId ?? 0,
        tenantId: created?.tenantId ?? 0,
        title,
        description,
        status: created?.status ?? 'pending',
        priority,
        createdAt:
          created?.createdAt ?? new Date().toISOString().split('T')[0]
      }
      setTickets([newTicket, ...tickets])
      resetForm()
      setShowForm(false)
      Taro.hideLoading()
      Taro.showToast({ title: '提交成功', icon: 'success' })
    } catch (error) {
      console.error('[Maintenance] 提交报修失败', error)
      Taro.hideLoading()
      Taro.showToast({ title: '提交失败，请重试', icon: 'none' })
    } finally {
      setSubmitting(false)
    }
  }

  const priorityIndex = PRIORITY_OPTIONS.indexOf(priority)

  return (
    <View className='tenant-maintenance-page'>
      <View className='page-container'>
        <View className='action-section'>
          <Button
            className='create-btn'
            type='primary'
            onClick={() => setShowForm(!showForm)}
          >
            {showForm ? '取消报修' : '+ 新建报修'}
          </Button>
        </View>

        {showForm && (
          <View className='form-card'>
            <View className='form-item'>
              <Text className='form-label'>标题</Text>
              <Input
                className='form-input'
                type='text'
                placeholder='请输入报修标题'
                value={title}
                onInput={(e) => setTitle(e.detail.value)}
              />
            </View>

            <View className='form-item'>
              <Text className='form-label'>问题描述</Text>
              <Textarea
                className='form-textarea'
                placeholder='请详细描述问题'
                value={description}
                onInput={(e) => setDescription(e.detail.value)}
              />
            </View>

            <View className='form-item'>
              <Text className='form-label'>优先级</Text>
              <Picker
                mode='selector'
                range={PRIORITY_LABELS}
                value={priorityIndex}
                onChange={(e) =>
                  setPriority(PRIORITY_OPTIONS[Number(e.detail.value)])
                }
              >
                <View className='priority-picker'>
                  <Text className='picker-text'>
                    {PRIORITY_LABELS[priorityIndex]}
                  </Text>
                  <Text className='picker-arrow'>›</Text>
                </View>
              </Picker>
            </View>

            <Button
              className='submit-btn'
              type='primary'
              loading={submitting}
              disabled={submitting}
              onClick={handleSubmit}
            >
              提交报修
            </Button>
          </View>
        )}

        <View className='section-title'>
          <Text>报修记录</Text>
        </View>

        <ScrollView scrollY className='ticket-list'>
          {loading && tickets.length === 0 && (
            <View className='empty-tip'>
              <Text>加载中...</Text>
            </View>
          )}
          {!loading && tickets.length === 0 && (
            <View className='empty-tip'>
              <Text>暂无报修记录</Text>
            </View>
          )}
          {tickets.map((ticket) => {
            const statusInfo = STATUS_MAP[ticket.status] || STATUS_MAP.pending
            const priorityLabel =
              PRIORITY_LABELS[PRIORITY_OPTIONS.indexOf(ticket.priority)] ?? '中'
            return (
              <View key={ticket.id} className='ticket-card'>
                <View className='ticket-header'>
                  <Text className='ticket-title'>{ticket.title}</Text>
                  <Text className='ticket-status' style={{ color: statusInfo.color }}>
                    {statusInfo.text}
                  </Text>
                </View>
                <Text className='ticket-desc'>{ticket.description}</Text>
                <View className='ticket-footer'>
                  <Text className='ticket-priority'>
                    优先级：{priorityLabel}
                  </Text>
                  <Text className='ticket-date'>{ticket.createdAt}</Text>
                </View>
              </View>
            )
          })}
        </ScrollView>
      </View>
    </View>
  )
}
