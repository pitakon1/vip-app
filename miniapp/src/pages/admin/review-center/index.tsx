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
import StateBlock from '@/components/StateBlock'
import { useI18n } from '@/i18n'
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

const buildTypeMeta = (
  t: (k: string, p?: Record<string, string | number>) => string
): Record<string, { label: string; cls: string }> => ({
  trip: { label: t('review.typeTrip'), cls: 'info' },
  maintenance: { label: t('review.typeMaintenance'), cls: 'warning' },
  service: { label: t('review.typeService'), cls: 'success' },
  contract: { label: t('review.typeContract'), cls: 'neutral' }
})

const buildStatusMeta = (
  t: (k: string, p?: Record<string, string | number>) => string
): Record<string, { label: string; cls: string }> => ({
  pending: { label: t('maint.stOpen'), cls: 'warning' },
  approved: { label: t('att.tripApproved'), cls: 'success' },
  rejected: { label: t('att.tripRejected'), cls: 'error' },
  open: { label: t('svc.stPending'), cls: 'warning' },
  assigned: { label: t('maint.stAssigned'), cls: 'info' },
  in_progress: { label: t('maint.stInProgress'), cls: 'info' },
  resolved: { label: t('review.stResolved'), cls: 'success' },
  closed: { label: t('maint.stClosed'), cls: 'neutral' },
  draft: { label: t('review.stDraft'), cls: 'neutral' },
  sent: { label: t('review.stSent'), cls: 'info' },
  partially_signed: { label: t('review.stPartialSigned'), cls: 'warning' }
})

const fmtTime = (x?: string) => (x ? String(x).replace('T', ' ').slice(0, 16) : '—')

export default function AdminReviewCenterPage() {
  const { t } = useI18n()
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)
  const [items, setItems] = useState<TodoItem[]>([])
  const [summary, setSummary] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const TYPE_META = buildTypeMeta(t)
  const STATUS_META = buildStatusMeta(t)

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
    Taro.setNavigationBarTitle({ title: t('review.title') })
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
      Taro.showToast({ title: err?.message || t('common.opFailed'), icon: 'none' })
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
          reply_note: action === 'approved' ? t('review.tripApprovedNote') : t('review.tripRejectedNote')
        }),
      action === 'approved' ? t('att.tripApproved') : t('att.tripRejected')
    )

  const rejectTrip = (id: string) => {
    Taro.showModal({
      title: t('review.rejectTripTitle'),
      content: t('review.rejectTripConfirm'),
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
          <StateBlock loading text={t('common.loading')} />
        )}
        {!loading && failed && (
          <View className='empty-tip' onClick={() => { setLoading(true); void load() }}>
            <Text>{t('common.loadFailedTapRetry')}</Text>
          </View>
        )}
        {!loading && !failed && items.length === 0 && (
          <View className='empty-tip'>
            <Text>{t('review.empty')}</Text>
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
              <Text className='review-card__meta'>{t('review.applicant')}{r.applicant || '—'}</Text>
              <Text className='review-card__meta'>{t('review.content')}{r.reason || '—'}</Text>
              <Text className='review-card__meta'>{t('review.submitted')}{fmtTime(r.created_at)}</Text>
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
                        <Text>{t('review.approve')}</Text>
                      </View>
                      <View className='btn btn--sm btn--secondary' onClick={() => rejectTrip(id)}>
                        <Text>{t('review.reject')}</Text>
                      </View>
                    </>
                  )}
                  {r.type === 'maintenance' && (
                    <>
                      <View
                        className='btn btn--sm btn--primary'
                        onClick={() =>
                          void run(`${id}-assigned`, () => maintenanceApi.update(id, { status: 'assigned' }), t('review.ticketAccepted'))
                        }
                      >
                        <Text>{t('review.accept')}</Text>
                      </View>
                      <View
                        className='btn btn--sm btn--secondary'
                        onClick={() =>
                          void run(`${id}-resolved`, () => maintenanceApi.update(id, { status: 'resolved' }), t('review.ticketResolved'))
                        }
                      >
                        <Text>{t('review.finish')}</Text>
                      </View>
                    </>
                  )}
                  {r.type === 'service' && (
                    <View
                      className='btn btn--sm btn--primary'
                      onClick={() =>
                        void run(`${id}-assigned`, () => serviceOrdersApi.updateStatus(id, { status: 'assigned' }), t('review.orderAccepted'))
                      }
                    >
                      <Text>{t('review.accept')}</Text>
                    </View>
                  )}
                  {r.type === 'contract' && (
                    <View
                      className='btn btn--sm btn--secondary'
                      onClick={() => Taro.navigateTo({ url: '/pages/admin/leases/index' })}
                    >
                      <Text>{t('review.goContracts')}</Text>
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