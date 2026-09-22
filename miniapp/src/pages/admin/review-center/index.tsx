/**
 * 工单审核中心（管理端）—— 对齐 Web `/system/review-center`。
 *
 * 数据来自后端 `/review-center/todos`（聚合外勤申请 / 报修工单 / 服务订单 / 合同流转）。
 * 各类型的审核动作直接复用既有业务端点，本页只做聚合展示与触发：
 * - 外勤：POST /attendance/external-trips/{id}/approve {action}
 * - 报修：PATCH /maintenance-tickets/{id} {status}
 * - 服务订单：PATCH /service-orders/{id}/status {status}
 * - 合同：跳合同管理页处理（与 Web 提示一致）
 */
import { useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { attendanceApi, maintenanceApi, serviceOrdersApi } from '@/services/api'
import { request } from '@/lib/api'
import './index.scss'

interface TodoItem {
  type?: string
  id?: string
  title?: string
  applicant?: string
  reason?: string
  status?: string
  created_at?: string
}

const TYPE_META: Record<string, { label: string; cls: string }> = {
  trip: { label: '外勤申请', cls: 'info' },
  maintenance: { label: '报修工单', cls: 'warning' },
  service: { label: '服务订单', cls: 'success' },
  contract: { label: '合同流转', cls: 'neutral' }
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  pending: { label: '待处理', cls: 'warning' },
  approved: { label: '已通过', cls: 'success' },
  rejected: { label: '已驳回', cls: 'error' },
  open: { label: '待受理', cls: 'warning' },
  assigned: { label: '已派单', cls: 'info' },
  in_progress: { label: '处理中', cls: 'info' },
  resolved: { label: '已完结', cls: 'success' },
  closed: { label: '已关闭', cls: 'neutral' },
  draft: { label: '草稿', cls: 'neutral' },
  sent: { label: '已发出', cls: 'info' },
  partially_signed: { label: '部分签署', cls: 'warning' }
}

const fmtTime = (x?: string) => (x ? String(x).replace('T', ' ').slice(0, 16) : '—')

export default function AdminReviewCenterPage() {
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)
  const [items, setItems] = useState<TodoItem[]>([])
  const [summary, setSummary] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [busyKey, setBusyKey] = useState<string | null>(null)

  const load = async () => {
    setFailed(false)
    try {
      const res: any = await request({ url: '/review-center/todos', method: 'GET' })
      const d = res?.data ?? res ?? {}
      setItems(Array.isArray(d.items) ? d.items : [])
      setSummary(d.summary && typeof d.summary === 'object' ? d.summary : {})
    } catch (err) {
      console.error('[review-center] 加载失败', err)
      setFailed(true)
      setItems([])
      setSummary({})
    } finally {
      setLoading(false)
    }
  }

  useDidShow(() => {
    Taro.setNavigationBarTitle({ title: '工单审核中心' })
    loadFromStorage()
    if (!useAuthStore.getState().token) {
      Taro.redirectTo({ url: '/pages/login/index' })
      return
    }
    setLoading(true)
    void load()
  })

  const run = async (key: string, fn: () => Promise<unknown>, okMsg: string) => {
    if (busyKey) return
    setBusyKey(key)
    try {
      await fn()
      Taro.showToast({ title: okMsg, icon: 'success' })
      await load()
    } catch (err: any) {
      Taro.showToast({ title: err?.message || '操作失败', icon: 'none' })
    } finally {
      setBusyKey(null)
    }
  }

  const approveTrip = (id: string, action: 'approved' | 'rejected') =>
    run(
      `${id}-${action}`,
      () =>
        attendanceApi.approveExternalTrip(id, {
          action,
          reply_note: action === 'approved' ? '管理员审批通过' : '管理员驳回'
        }),
      action === 'approved' ? '已通过' : '已驳回'
    )

  const rejectTrip = (id: string) => {
    Taro.showModal({
      title: '驳回外勤申请',
      content: '确认驳回该外勤申请？',
      confirmColor: '#ef4444',
      success: (r) => {
        if (r.confirm) void approveTrip(id, 'rejected')
      }
    })
  }

  return (
    <View className='review-page'>
      <View className='page-container'>
        <View className='review-stats'>
          {Object.keys(TYPE_META).map((k) => (
            <View key={k} className='review-stat'>
              <Text className='review-stat__value'>{summary[k] ?? 0}</Text>
              <Text className='review-stat__label'>{TYPE_META[k].label}</Text>
            </View>
          ))}
        </View>

        {loading && items.length === 0 && (
          <View className='empty-tip'>
            <Text>加载中...</Text>
          </View>
        )}
        {!loading && failed && (
          <View className='empty-tip' onClick={() => { setLoading(true); void load() }}>
            <Text>加载失败，点击重试</Text>
          </View>
        )}
        {!loading && !failed && items.length === 0 && (
          <View className='empty-tip'>
            <Text>暂无待办，所有工单已处理完毕</Text>
          </View>
        )}

        {items.map((r, idx) => {
          const tMeta = TYPE_META[String(r.type)] ?? { label: String(r.type ?? '—'), cls: 'neutral' }
          const sMeta = STATUS_META[String(r.status)] ?? { label: String(r.status ?? '—'), cls: 'neutral' }
          const key = `${r.type}-${r.id}-${idx}`
          const id = String(r.id ?? '')
          return (
            <View key={key} className='review-card'>
              <View className='review-card__head'>
                <View className={`tag tag--${tMeta.cls}`}>
                  <Text>{tMeta.label}</Text>
                </View>
                <Text className='review-card__title'>{r.title || '—'}</Text>
              </View>
              <Text className='review-card__meta'>申请人：{r.applicant || '—'}</Text>
              <Text className='review-card__meta'>内容：{r.reason || '—'}</Text>
              <Text className='review-card__meta'>提交：{fmtTime(r.created_at)}</Text>
              <View className='review-card__foot'>
                <View className={`tag tag--${sMeta.cls}`}>
                  <Text>{sMeta.label}</Text>
                </View>
                <View className='review-actions'>
                  {r.type === 'trip' && (
                    <>
                      <View
                        className='btn btn--sm btn--primary'
                        onClick={() => void approveTrip(id, 'approved')}
                      >
                        <Text>通过</Text>
                      </View>
                      <View className='btn btn--sm btn--secondary' onClick={() => rejectTrip(id)}>
                        <Text>驳回</Text>
                      </View>
                    </>
                  )}
                  {r.type === 'maintenance' && (
                    <>
                      <View
                        className='btn btn--sm btn--primary'
                        onClick={() =>
                          void run(`${id}-assigned`, () => maintenanceApi.update(id, { status: 'assigned' }), '工单已受理')
                        }
                      >
                        <Text>受理</Text>
                      </View>
                      <View
                        className='btn btn--sm btn--secondary'
                        onClick={() =>
                          void run(`${id}-resolved`, () => maintenanceApi.update(id, { status: 'resolved' }), '工单已完结')
                        }
                      >
                        <Text>完结</Text>
                      </View>
                    </>
                  )}
                  {r.type === 'service' && (
                    <View
                      className='btn btn--sm btn--primary'
                      onClick={() =>
                        void run(`${id}-assigned`, () => serviceOrdersApi.updateStatus(id, { status: 'assigned' }), '订单已受理')
                      }
                    >
                      <Text>受理</Text>
                    </View>
                  )}
                  {r.type === 'contract' && (
                    <View
                      className='btn btn--sm btn--secondary'
                      onClick={() => Taro.navigateTo({ url: '/pages/admin/leases/index' })}
                    >
                      <Text>去合同管理</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
          )
        })}
      </View>
    </View>
  )
}