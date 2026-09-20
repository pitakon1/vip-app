import { useState } from 'react'
import { View, Text, Input, Textarea } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { serviceOrdersApi, maintenanceApi, ownerApi } from '@/services/api'
import { useSwrCache } from '@/hooks/useSwrCache'
import { iconStyle, type IconKey } from '@/utils/icons'
import BottomNav from '@/components/BottomNav'
import './index.scss'

interface ServiceOrder {
  id: string
  orderer_id?: string
  orderer_type?: string
  property_id?: string
  service_type?: string
  status?: string
  scheduled_at?: string
  completed_at?: string
  amount?: number
  currency?: string
  notes?: string
  rating?: number
  created_at?: string
}

interface RepairTicket {
  id: string
  property_id?: string
  title?: string
  description?: string
  priority?: string
  status?: string
  created_at?: string
}

interface WorkItem {
  kind: 'order' | 'ticket'
  id: string
  status: string
  created_at?: string
  raw: ServiceOrder | RepairTicket
}

interface OwnerProp {
  id?: string | number
  room_number?: string
  display_name?: string
  name?: string
  project_name?: string
  address?: string
}

const pickList = (res: any): any[] => {
  if (Array.isArray(res)) return res
  const d = res?.data ?? res ?? {}
  if (Array.isArray(d)) return d
  if (Array.isArray(d?.items)) return d.items
  if (Array.isArray(d?.list)) return d.list
  if (Array.isArray(d?.data)) return d.data
  return []
}

const fmtDate = (x?: string) => (x ? String(x).replace('T', ' ').slice(0, 10) : '—')

const toTime = (x?: string) => {
  if (!x) return 0
  const t = new Date(String(x).replace(' ', 'T')).getTime()
  return Number.isNaN(t) ? 0 : t
}

// 服务类型（对齐后端 ServiceType 枚举）
const TYPE_META: Record<string, { label: string; icon: IconKey }> = {
  cleaning: { label: '清洁服务', icon: 'home' },
  ac_cleaning: { label: '空调清洗保养', icon: 'gear' },
  wifi_install: { label: '网络安装', icon: 'megaphone' },
  utility_payment: { label: '水电代缴', icon: 'money' },
  insurance: { label: '房屋保险', icon: 'doc' },
  tax_payment: { label: '税务代缴', icon: 'card' },
  annual_management: { label: '年度托管', icon: 'clipboard' },
  aircon: { label: '空调清洗保养', icon: 'gear' },
  management: { label: '房屋托管', icon: 'home' },
  wifi: { label: '网络安装', icon: 'megaphone' },
  utility: { label: '水电代缴', icon: 'money' },
  other: { label: '其他服务', icon: 'clipboard' }
}

const metaOfType = (t?: string) => TYPE_META[t || ''] || TYPE_META.other

// 可购买的服务类型（提交服务订单用）
const PURCHASE_TYPES = [
  'cleaning',
  'ac_cleaning',
  'wifi_install',
  'utility_payment',
  'insurance',
  'tax_payment',
  'annual_management'
]

// 服务商品一句话描述（陈列卡片用）
const SVC_DESC: Record<string, string> = {
  cleaning: '全屋深度清洁，专业人员上门',
  ac_cleaning: '空调深度清洗，出风更清新',
  wifi_install: '光纤宽带上门安装调试',
  utility_payment: '水电燃气费代缴，省心省力',
  insurance: '房屋财产保障，安心托管',
  tax_payment: '房产税务代办，合规省心',
  annual_management: '全年托管，租金收益最大化'
}

// 工单状态（对齐后端 ServiceOrderStatus 枚举），进度由状态推导
const STATUS_META: Record<string, { label: string; cls: string; pct: number }> = {
  pending: { label: '待响应', cls: 'warning', pct: 20 },
  assigned: { label: '已派单', cls: 'info', pct: 40 },
  in_progress: { label: '处理中', cls: 'primary', pct: 60 },
  completed: { label: '已完成', cls: 'success', pct: 100 },
  cancelled: { label: '已取消', cls: 'neutral', pct: 0 }
}

const metaOfStatus = (s?: string) => STATUS_META[s || ''] || STATUS_META.pending

// 报修工单状态（对齐后端 TicketStatus 枚举）
const TICKET_STATUS_META: Record<string, { label: string; cls: string; pct: number }> = {
  open: { label: '待处理', cls: 'warning', pct: 20 },
  assigned: { label: '已派单', cls: 'info', pct: 40 },
  in_progress: { label: '处理中', cls: 'primary', pct: 60 },
  resolved: { label: '已解决', cls: 'success', pct: 100 },
  closed: { label: '已关闭', cls: 'neutral', pct: 100 }
}

const metaOfTicketStatus = (s?: string) => TICKET_STATUS_META[s || ''] || TICKET_STATUS_META.open

// 报修优先级（对齐后端 TicketPriority 枚举）
const PRIORITY_META: Record<string, string> = {
  low: '低',
  medium: '中',
  high: '高',
  urgent: '紧急'
}

// 我的工单状态筛选
type FilterKey = 'all' | 'processing' | 'completed' | 'pending'

const FILTER_CHIPS: Array<{ key: FilterKey; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'processing', label: '处理中' },
  { key: 'completed', label: '已完成' },
  { key: 'pending', label: '待响应' }
]

export default function OwnerServicesPage() {
  const user = useAuthStore((state) => state.user)
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)
  const [tab, setTab] = useState<'services' | 'repairs'>('services')
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all')

  // 提交报修弹窗
  const [ticketModal, setTicketModal] = useState(false)
  const [ticketProp, setTicketProp] = useState<string | null>(null)
  const [ticketTitle, setTicketTitle] = useState('')
  const [ticketDesc, setTicketDesc] = useState('')
  const [ticketPriority, setTicketPriority] = useState('medium')
  const [submitting, setSubmitting] = useState(false)

  // 购买服务弹窗
  const [buyModal, setBuyModal] = useState(false)
  const [buyProp, setBuyProp] = useState<string | null>(null)
  const [buyType, setBuyType] = useState<string | null>(null)
  const [buying, setBuying] = useState(false)

  interface ServicesPayload {
    orders: ServiceOrder[]
    tickets: RepairTicket[]
    properties: OwnerProp[]
  }

  const uid = user?.id ?? 'anon'
  const { data, loading, refresh } = useSwrCache<ServicesPayload>({
    key: `owner:services:${uid}`,
    fetcher: async (): Promise<ServicesPayload> => {
      const [orderRes, ticketRes, propRes]: [any, any, any] = await Promise.all([
        serviceOrdersApi.list({ page: 1, limit: 100 }),
        maintenanceApi.list({ page: 1, limit: 100 }),
        ownerApi.properties().catch(() => null)
      ])
      return {
        orders: pickList(orderRes) as ServiceOrder[],
        tickets: pickList(ticketRes) as RepairTicket[],
        properties: pickList(propRes) as OwnerProp[]
      }
    },
  })
  const orders = data?.orders ?? []
  const tickets = data?.tickets ?? []
  const properties = data?.properties ?? []

  useDidShow(() => {
    loadFromStorage()
    if (!useAuthStore.getState().token) {
      Taro.redirectTo({ url: '/pages/login/index' })
      return
    }
    refresh()
  })

  const propertyName = (id?: string) => {
    if (!id) return ''
    const p = properties.find((x) => String(x.id) === String(id))
    return p?.display_name || p?.name || [p?.project_name, p?.room_number].filter(Boolean).join(' ') || p?.address || ''
  }

  // 合并工单：服务单 + 报修单按 created_at 倒序混合
  const workItems: WorkItem[] = [
    ...orders.map((o) => ({
      kind: 'order' as const,
      id: String(o.id),
      status: String(o.status || ''),
      created_at: o.created_at,
      raw: o
    })),
    ...tickets.map((t) => ({
      kind: 'ticket' as const,
      id: String(t.id),
      status: String(t.status || ''),
      created_at: t.created_at,
      raw: t
    }))
  ].sort((a, b) => toTime(b.created_at) - toTime(a.created_at))

  // 状态分组：处理中 / 已完成 / 待响应（其余不归属任何筛选，仅在「全部」可见）
  const groupOf = (kind: WorkItem['kind'], status: string): FilterKey => {
    if (kind === 'order') {
      if (status === 'assigned' || status === 'in_progress') return 'processing'
      if (status === 'completed') return 'completed'
      if (status === 'pending') return 'pending'
      return 'all'
    }
    if (status === 'assigned' || status === 'in_progress') return 'processing'
    if (status === 'resolved' || status === 'closed') return 'completed'
    if (status === 'open') return 'pending'
    return 'all'
  }

  const countOf = (key: FilterKey) =>
    key === 'all' ? workItems.length : workItems.filter((it) => groupOf(it.kind, it.status) === key).length

  const merged = workItems.filter((it) => activeFilter === 'all' || groupOf(it.kind, it.status) === activeFilter)

  /* ===== 提交报修 ===== */
  const submitTicket = async () => {
    if (!ticketProp) {
      Taro.showToast({ title: '请选择报修房源', icon: 'none' })
      return
    }
    if (!ticketTitle.trim()) {
      Taro.showToast({ title: '请填写报修标题', icon: 'none' })
      return
    }
    setSubmitting(true)
    Taro.showLoading({ title: '提交中...', mask: true })
    try {
      await maintenanceApi.create({
        property_id: ticketProp,
        title: ticketTitle.trim(),
        description: ticketDesc.trim() || ticketTitle.trim(),
        priority: ticketPriority
      })
      Taro.hideLoading()
      setTicketModal(false)
      setTicketProp(null)
      setTicketTitle('')
      setTicketDesc('')
      setTicketPriority('medium')
      Taro.showModal({
        title: '提交成功',
        content: '报修工单已提交，工作人员将尽快处理',
        showCancel: false
      })
      refresh(true)
    } catch (err: any) {
      console.error('[OwnerServices] 提交报修失败', err)
      Taro.hideLoading()
      Taro.showToast({ title: err?.response?.data?.message || '提交失败，请重试', icon: 'none' })
    } finally {
      setSubmitting(false)
    }
  }

  /* ===== 购买服务 ===== */
  const submitBuy = async () => {
    if (!buyProp) {
      Taro.showToast({ title: '请选择服务房源', icon: 'none' })
      return
    }
    if (!buyType) {
      Taro.showToast({ title: '请选择服务类型', icon: 'none' })
      return
    }
    setBuying(true)
    Taro.showLoading({ title: '提交中...', mask: true })
    try {
      await serviceOrdersApi.create({
        orderer_id: user?.id,
        orderer_type: 'owner',
        property_id: buyProp,
        service_type: buyType,
        amount: 0,
        currency: 'THB',
        notes: metaOfType(buyType).label
      })
      Taro.hideLoading()
      setBuyModal(false)
      setBuyProp(null)
      setBuyType(null)
      Taro.showModal({
        title: '购买成功',
        content: '服务订单已创建，工作人员将尽快联系您',
        showCancel: false
      })
      refresh(true)
    } catch (err: any) {
      console.error('[OwnerServices] 购买服务失败', err)
      Taro.hideLoading()
      Taro.showToast({ title: err?.response?.data?.message || '下单失败，请重试', icon: 'none' })
    } finally {
      setBuying(false)
    }
  }

  const resetTicketModal = () => {
    setTicketModal(false)
    setTicketProp(null)
    setTicketTitle('')
    setTicketDesc('')
    setTicketPriority('medium')
  }

  const resetBuyModal = () => {
    setBuyModal(false)
    setBuyProp(null)
    setBuyType(null)
  }

  // 房源选择 chips（无房源时引导去委托挂牌）
  const renderPropertyPicker = (selected: string | null, onSelect: (id: string) => void) => {
    if (properties.length === 0) {
      return (
        <View
          className='sheet-empty-prop'
          hoverClass='sheet-empty-prop--hover'
          onClick={() => Taro.navigateTo({ url: '/pages/owner/marketing/index' })}
        >
          <Text>暂无房源，去委托挂牌 ›</Text>
        </View>
      )
    }
    return (
      <View className='pick-wrap'>
        {properties.map((p) => {
          const active = String(p.id) === selected
          const label = p.display_name || p.name || [p.project_name, p.room_number].filter(Boolean).join(' ') || p.address || '房源'
          return (
            <View
              key={String(p.id)}
              className={`pick-chip${active ? ' pick-chip--active' : ''}`}
              hoverClass='pick-chip--hover'
              onClick={() => onSelect(String(p.id))}
            >
              <Text className={`pick-chip__text${active ? ' pick-chip__text--active' : ''}`}>{label}</Text>
            </View>
          )
        })}
      </View>
    )
  }

  return (
    <View className='owner-services-page'>
      <View className='page-container'>
        {/* 分类 Tab：服务商城 / 我的工单 */}
        <View className='tab-row'>
          {[
            { key: 'services' as const, label: '服务商城' },
            { key: 'repairs' as const, label: '我的工单' }
          ].map((t) => {
            const active = tab === t.key
            return (
              <View
                key={t.key}
                className={`tab-btn${active ? ' tab-btn--active' : ''}`}
                hoverClass='tab-btn--hover'
                onClick={() => setTab(t.key)}
              >
                <Text className={`tab-btn__text${active ? ' tab-btn__text--active' : ''}`}>{t.label}</Text>
              </View>
            )
          })}
        </View>

        {/* services Tab：服务商品陈列 */}
        {tab === 'services' && (
          <>
            <View className='section-title'>
              <Text>服务商品</Text>
              <Text className='section-hint'>按需购买 · 专人上门</Text>
            </View>
            <View className='svc-grid'>
              {PURCHASE_TYPES.map((t) => {
                const meta = metaOfType(t)
                return (
                  <View
                    key={t}
                    className='svc-card'
                    hoverClass='svc-card--hover'
                    onClick={() => {
                      setBuyType(t)
                      setBuyModal(true)
                    }}
                  >
                    <View className='svc-card__icon'>
                      <View className='icon-svg' style={iconStyle(meta.icon, 44)} />
                    </View>
                    <Text className='svc-card__name'>{meta.label}</Text>
                    <Text className='svc-card__desc'>{SVC_DESC[t]}</Text>
                    <View className='svc-card__buy'>
                      <Text className='svc-card__buy-text'>去购买</Text>
                      <Text className='svc-card__buy-arrow'>›</Text>
                    </View>
                  </View>
                )
              })}
            </View>
          </>
        )}

        {/* 我的工单 Tab：提交报修 + 状态筛选 + 合并列表 */}
        {tab === 'repairs' && (
          <>
            <View
              className='repair-btn'
              hoverClass='repair-btn--hover'
              onClick={() => setTicketModal(true)}
            >
              <View className='icon-svg' style={iconStyle('gear', 32)} />
              <Text className='repair-btn__text'>提交报修</Text>
            </View>

            {/* 状态筛选 chips */}
            <View className='filter-chips'>
              {FILTER_CHIPS.map((c) => {
                const active = activeFilter === c.key
                const count = countOf(c.key)
                return (
                  <View
                    key={c.key}
                    className={`filter-chip${active ? ' filter-chip--active' : ''}`}
                    hoverClass='filter-chip--hover'
                    onClick={() => setActiveFilter(c.key)}
                  >
                    <Text className={`filter-chip__text${active ? ' filter-chip__text--active' : ''}`}>
                      {c.label}
                      {count > 0 ? ` ${count}` : ''}
                    </Text>
                  </View>
                )
              })}
            </View>

            <View className='section-title'>
              <Text>我的工单</Text>
              <Text className='section-hint'>{merged.length} 单</Text>
            </View>

            {loading && merged.length === 0 && (
              <View className='empty-tip'>
                <Text>加载中...</Text>
              </View>
            )}

            {!loading && merged.length === 0 && (
              <View className='empty-tip'>
                <View className='empty-tip__icon icon-svg' style={iconStyle('gear', 48)} />
                <Text>暂无工单</Text>
              </View>
            )}

            {/* 合并列表：服务单 / 报修单 */}
            {!loading && merged.length > 0 && (
              <View className='order-list'>
                {merged.map((it) => {
                  if (it.kind === 'order') {
                    const o = it.raw as ServiceOrder
                    const meta = metaOfType(o.service_type)
                    const statusMeta = metaOfStatus(o.status)
                    const prop = propertyName(o.property_id)
                    return (
                      <View key={o.id} className='order'>
                        <View className='order__head'>
                          <View className={`order__icon order__icon--${statusMeta.cls}`}>
                            <View className='icon-svg' style={iconStyle(meta.icon, 36)} />
                          </View>
                          <View className='order__body'>
                            <View className='order__title-row'>
                              <Text className='order__title'>{meta.label}</Text>
                              <Text className={`order__badge order__badge--${statusMeta.cls}`}>{statusMeta.label}</Text>
                            </View>
                            <View className='order__meta'>
                              {!!prop && <Text className='order__prop'>{prop}</Text>}
                              {!!prop && <Text className='order__dot'>·</Text>}
                              <Text>{fmtDate(o.created_at)}</Text>
                            </View>
                          </View>
                        </View>
                      </View>
                    )
                  }
                  const t = it.raw as RepairTicket
                  const statusMeta = metaOfTicketStatus(t.status)
                  const prio = PRIORITY_META[String(t.priority || 'medium')] || '中'
                  const prop = propertyName(t.property_id)
                  return (
                    <View key={t.id} className='order'>
                      <View className='order__head'>
                        <View className='order__icon order__icon--warning'>
                          <View className='icon-svg' style={iconStyle('gear', 36)} />
                        </View>
                        <View className='order__body'>
                          <View className='order__title-row'>
                            <Text className='order__prio'>优先级 {prio}</Text>
                            <Text className='order__title'>{t.title || '报修工单'}</Text>
                            <Text className={`order__badge order__badge--${statusMeta.cls}`}>{statusMeta.label}</Text>
                          </View>
                          <View className='order__meta'>
                            {!!prop && <Text className='order__prop'>{prop}</Text>}
                            {!!prop && <Text className='order__dot'>·</Text>}
                            <Text>{fmtDate(t.created_at)}</Text>
                          </View>
                        </View>
                      </View>
                    </View>
                  )
                })}
              </View>
            )}
          </>
        )}
      </View>

      {/* 提交报修弹窗 */}
      {ticketModal && (
        <View className='sheet-mask' onClick={resetTicketModal}>
          <View className='sheet' onClick={(e) => e.stopPropagation()}>
            <View className='sheet__head'>
              <Text className='sheet__title'>提交报修</Text>
              <View className='sheet__close icon-svg' style={iconStyle('close', 36)} onClick={resetTicketModal} />
            </View>
            <View className='sheet__body'>
              <Text className='field-label'>报修房源</Text>
              {renderPropertyPicker(ticketProp, (id) => setTicketProp(id))}

              <Text className='field-label'>优先级</Text>
              <View className='pick-wrap'>
                {(['low', 'medium', 'high', 'urgent'] as const).map((p) => {
                  const active = ticketPriority === p
                  return (
                    <View
                      key={p}
                      className={`pick-chip${active ? ' pick-chip--active' : ''}`}
                      hoverClass='pick-chip--hover'
                      onClick={() => setTicketPriority(p)}
                    >
                      <Text className={`pick-chip__text${active ? ' pick-chip__text--active' : ''}`}>
                        {PRIORITY_META[p]}
                      </Text>
                    </View>
                  )
                })}
              </View>

              <Text className='field-label'>报修标题</Text>
              <Input
                className='input'
                value={ticketTitle}
                onInput={(e) => setTicketTitle(e.detail.value)}
                placeholder='如：空调不制冷 / 水管漏水'
                maxlength={60}
              />

              <Text className='field-label'>问题描述</Text>
              <Textarea
                className='input input--area'
                value={ticketDesc}
                onInput={(e) => setTicketDesc(e.detail.value)}
                placeholder='请描述具体问题，便于工作人员准备工具（选填）'
                maxlength={300}
              />

              <View
                className={`submit-btn${submitting ? ' submit-btn--disabled' : ''}`}
                hoverClass='submit-btn--hover'
                onClick={submitTicket}
              >
                <Text className='submit-btn__text'>{submitting ? '提交中…' : '提交工单'}</Text>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* 购买服务弹窗 */}
      {buyModal && (
        <View className='sheet-mask' onClick={resetBuyModal}>
          <View className='sheet' onClick={(e) => e.stopPropagation()}>
            <View className='sheet__head'>
              <Text className='sheet__title'>购买服务</Text>
              <View className='sheet__close icon-svg' style={iconStyle('close', 36)} onClick={resetBuyModal} />
            </View>
            <View className='sheet__body'>
              <Text className='field-label'>服务房源</Text>
              {renderPropertyPicker(buyProp, (id) => setBuyProp(id))}

              <Text className='field-label'>服务类型</Text>
              <View className='pick-wrap'>
                {PURCHASE_TYPES.map((t) => {
                  const meta = metaOfType(t)
                  const active = buyType === t
                  return (
                    <View
                      key={t}
                      className={`pick-chip${active ? ' pick-chip--active' : ''}`}
                      hoverClass='pick-chip--hover'
                      onClick={() => setBuyType(t)}
                    >
                      <View className='icon-svg' style={iconStyle(meta.icon, 28)} />
                      <Text className={`pick-chip__text${active ? ' pick-chip__text--active' : ''}`}>
                        {meta.label}
                      </Text>
                    </View>
                  )
                })}
              </View>

              <View
                className={`submit-btn${buying ? ' submit-btn--disabled' : ''}`}
                hoverClass='submit-btn--hover'
                onClick={submitBuy}
              >
                <Text className='submit-btn__text'>{buying ? '提交中…' : '确认购买'}</Text>
              </View>
            </View>
          </View>
        </View>
      )}

      <BottomNav role='owner' active='services' />
    </View>
  )
}
