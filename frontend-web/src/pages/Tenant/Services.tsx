import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { message, Modal, Rate, Form, Select, DatePicker, InputNumber, Input, Tag, Empty } from 'antd'
import dayjs from 'dayjs'
import api from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import { useCachedQuery } from '@/lib/queryCache'
import './services.css'

/** GET /billing/pricing → service_catalog 的单项（真实价目，不含税） */
interface CatalogItem {
  code: string
  label_zh?: string
  label_en?: string
  label_th?: string
  unit?: string
  base_price?: number
}

interface Booking {
  id: string
  serviceId: string
  serviceName: string
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
  createdAt: string
  preferredDate?: string
  completedAt?: string
  amount?: number
  notes?: string
  rating?: number
  reviewComment?: string
}

/** 可服务的房源选项（业主取名下房源，租客取生效租约房源） */
interface PropertyOption {
  id: string
  label: string
  monthly_rent?: number
  currency?: string
}

/** GET /service-packages/me 的订阅套餐（业主专享管理合约） */
interface PackageItem {
  id: string
  property_id: string
  type: 'annual_management' | 'full_service'
  commission_rate: number
  management_fee_rate: number
  amount: number
  currency: string
  start_date: string
  end_date: string
  status: string
}

/** GET /maintenance-tickets 的报修工单 */
interface TicketItem {
  id: string
  property_id?: string
  title: string
  description?: string
  priority: string
  status: string
  created_at?: string
}

type IconType = 'cleaning' | 'ac' | 'wifi' | 'utility' | 'other'

// 服务图标（按后端真实服务编码映射）
const ICON_TYPE: Record<string, IconType> = {
  cleaning: 'cleaning',
  ac_cleaning: 'ac',
  wifi_install: 'wifi',
  utility_payment: 'utility',
}

// 商品卡配色/角标（按编码，未列出走默认）
const CARD_META: Record<string, { badgeType: 'primary' | 'info' | 'success' | 'warning'; iconBg: string; iconColor: string }> = {
  cleaning: { badgeType: 'primary', iconBg: 'rgba(20, 184, 166, 0.12)', iconColor: 'var(--rent-primary)' },
  ac_cleaning: { badgeType: 'info', iconBg: 'rgba(14,165,233,0.12)', iconColor: 'var(--state-info)' },
  wifi_install: { badgeType: 'success', iconBg: 'rgba(22,163,74,0.12)', iconColor: 'var(--state-success)' },
  utility_payment: { badgeType: 'warning', iconBg: 'rgba(217,119,6,0.12)', iconColor: 'var(--state-warning)' },
}
const DEFAULT_CARD_META = { badgeType: 'info' as const, iconBg: 'rgba(14,165,233,0.12)', iconColor: 'var(--state-info)' }

// 年度服务套餐价（与 banner 展示价保持一致）
const PROMO_PRICE = 1288

// 接口状态（pending/assigned/in_progress/completed/cancelled）→ 页面展示状态
const normalizeBookingStatus = (status?: string): Booking['status'] => {
  const v = String(status || '').toLowerCase()
  if (v === 'completed') return 'completed'
  if (v === 'cancelled') return 'cancelled'
  if (v === 'in_progress') return 'in_progress'
  return 'pending'
}

const statusClassMap: Record<Booking['status'], string> = {
  pending: 'svc-order-status--warning',
  in_progress: 'svc-order-status--info',
  completed: 'svc-order-status--success',
  cancelled: 'svc-order-status--neutral',
}

// ===== 订阅套餐（业主专享）=====
interface PlanItem {
  id: string
  name: string
  price: string
  unit: string
  features: string[]
  recommended: boolean
}

const PLANS: PlanItem[] = [
  {
    id: 'basic',
    name: 'ownerServices.planBasic',
    price: 'RM 200',
    unit: 'ownerServices.unitPerMonth',
    features: ['ownerServices.planBasicF1', 'ownerServices.planBasicF2', 'ownerServices.planBasicF3'],
    recommended: false,
  },
  {
    id: 'standard',
    name: 'ownerServices.planStandard',
    price: 'RM 450',
    unit: 'ownerServices.unitPerMonth',
    features: [
      'ownerServices.planStandardF1',
      'ownerServices.planStandardF2',
      'ownerServices.planStandardF3',
      'ownerServices.planStandardF4',
    ],
    recommended: true,
  },
  {
    id: 'premium',
    name: 'ownerServices.planPremium',
    price: 'RM 800',
    unit: 'ownerServices.unitPerMonth',
    features: [
      'ownerServices.planPremiumF1',
      'ownerServices.planPremiumF2',
      'ownerServices.planPremiumF3',
      'ownerServices.planPremiumF4',
    ],
    recommended: false,
  },
]

// ===== 我的工单（服务订单 + 报修工单）=====
const ORDER_STATUS_META: Record<string, { label: string; tone: string }> = {
  pending: { label: 'ownerServices.orderStatusPending', tone: 'warning' },
  assigned: { label: 'ownerServices.orderStatusAssigned', tone: 'info' },
  in_progress: { label: 'ownerServices.orderStatusInProgress', tone: 'info' },
  completed: { label: 'ownerServices.orderStatusCompleted', tone: 'success' },
  cancelled: { label: 'ownerServices.orderStatusCancelled', tone: 'neutral' },
}

const TICKET_STATUS_META: Record<string, { label: string; tone: string }> = {
  open: { label: 'ownerServices.ticketStatusOpen', tone: 'warning' },
  assigned: { label: 'ownerServices.orderStatusAssigned', tone: 'info' },
  in_progress: { label: 'ownerServices.ticketStatusInProgress', tone: 'info' },
  resolved: { label: 'ownerServices.ticketStatusResolved', tone: 'success' },
  closed: { label: 'ownerServices.ticketStatusClosed', tone: 'neutral' },
}

const PRIORITY_LABEL: Record<string, string> = {
  low: 'ownerServices.priorityLow',
  medium: 'ownerServices.priorityMedium',
  high: 'ownerServices.priorityHigh',
  urgent: 'ownerServices.priorityUrgent',
}

const TICKET_FILTERS: { value: 'all' | 'processing' | 'completed' | 'pending'; label: string }[] = [
  { value: 'all', label: 'ownerServices.filterAll' },
  { value: 'processing', label: 'ownerServices.filterProcessing' },
  { value: 'completed', label: 'ownerServices.filterCompleted' },
  { value: 'pending', label: 'ownerServices.filterPending' },
]

const tagColorOf = (tone: string) =>
  tone === 'success' ? 'success' : tone === 'warning' ? 'warning' : tone === 'info' ? 'processing' : 'default'

interface TicketRow {
  id: string
  orderId?: string
  kind: 'service' | 'repair'
  title: string
  status: string
  badgeLabel: string
  badgeTone: string
  date: string
  property: string
  priorityLabel: string
  canReview: boolean
}

const packageTypeLabel = (t: (k: string) => string, type: string) =>
  type === 'full_service' ? t('ownerServices.pkgFullService') : t('ownerServices.pkgAnnualManagement')
const packageStatusLabel = (t: (k: string) => string, s: string) => {
  const map: Record<string, { label: string; tone: 'success' | 'info' | 'warning' | 'neutral' }> = {
    active: { label: t('ownerServices.pkgStatusActive'), tone: 'success' },
    pending: { label: t('ownerServices.pkgStatusPending'), tone: 'warning' },
    expired: { label: t('ownerServices.pkgStatusExpired'), tone: 'neutral' },
    cancelled: { label: t('ownerServices.pkgStatusCancelled'), tone: 'neutral' },
  }
  return map[s] || { label: s, tone: 'neutral' as const }
}

const fmtMoney = (v: number, currency = 'THB') => {
  const sym = currency === 'THB' ? '฿' : currency === 'MYR' || currency === 'RM' ? 'RM' : currency
  return `${sym} ${Number(v || 0).toLocaleString()}`
}

const checkIcon = (color: string) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
)

const ServiceIcon = ({ type }: { type: IconType }) => {
  if (type === 'ac') {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20"/><path d="M2 12h20"/><path d="M4.93 4.93l14.14 14.14"/><path d="M19.07 4.93L4.93 19.07"/></svg>
    )
  }
  if (type === 'wifi') {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>
    )
  }
  if (type === 'utility') {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
    )
  }
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/></svg>
  )
}

interface ServicesPayload {
  catalog: CatalogItem[]
  orders: any[]
  leaseProperty: PropertyOption | null
  packages: PackageItem[]
  tickets: TicketItem[]
  ownerProperties: PropertyOption[]
}

const TenantServices = () => {
  const { t, i18n } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const uid = user?.id ?? 'anon'
  const isOwner = user?.role === 'owner'
  const lang = (i18n.language || 'zh').slice(0, 2)

  // 下单确认弹窗 / 详情弹窗 / 评价弹窗 / 订阅弹窗 / 报修弹窗
  const [bookItem, setBookItem] = useState<CatalogItem | null>(null)
  const [bookPropertyId, setBookPropertyId] = useState<string | undefined>(undefined)
  const [detailOrder, setDetailOrder] = useState<Booking | null>(null)
  const [reviewOrder, setReviewOrder] = useState<Booking | null>(null)
  const [reviewRating, setReviewRating] = useState(5)
  const [reviewComment, setReviewComment] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [subscribeOpen, setSubscribeOpen] = useState(false)
  const [subscribeSubmitting, setSubscribeSubmitting] = useState(false)
  const [subscribeForm] = Form.useForm()

  const [repairOpen, setRepairOpen] = useState(false)
  const [repairSubmitting, setRepairSubmitting] = useState(false)
  const [repairForm] = Form.useForm()
  const [ticketFilter, setTicketFilter] = useState<'all' | 'processing' | 'completed' | 'pending'>('all')

  const statusLabelMap: Record<Booking['status'], string> = {
    pending: t('tenantServices.bookStatus.pending'),
    in_progress: t('tenantServices.bookStatus.in_progress'),
    completed: t('tenantServices.bookStatus.completed'),
    cancelled: t('tenantServices.bookStatus.cancelled'),
  }

  // 服务展示名：优先语言包（服务名已本地化），退回价目表标签，最后退回编码
  const serviceNameOf = useCallback(
    (code: string, catalog: CatalogItem[]) => {
      const key = `tenantServices.serviceType.${code}`
      const translated = t(key)
      if (translated && translated !== key) return translated
      const item = catalog.find((c) => c.code === code)
      const label = lang === 'en' ? item?.label_en : lang === 'th' ? item?.label_th : item?.label_zh
      return label || code || t('tenantServices.otherService')
    },
    [t, lang],
  )

  const unitOf = useCallback(
    (code: string, catalog: CatalogItem[]) => {
      const key = `tenantServices.serviceUnit.${code}`
      const unit = catalog.find((c) => c.code === code)?.unit || ''
      return t(key, { defaultValue: unit })
    },
    [t],
  )

  const q = useCachedQuery<ServicesPayload>({
    queryKey: ['tenant-services', uid],
    cacheKey: `tenant-services:${uid}`,
    queryFn: async () => {
      const [cRes, oRes, lRes, pkgRes, tkRes, opRes] = await Promise.allSettled([
        api.get('/billing/pricing'),
        api.get('/service-orders'),
        api.get('/leases'),
        api.get('/service-packages/me'),
        api.get('/maintenance-tickets', { params: { page_size: 50 } }),
        api.get('/owners/me/properties'),
      ])

      // 真实价目表（不含税基准价），页面不再使用硬编码假价格
      let catalog: CatalogItem[] = []
      if (cRes.status === 'fulfilled') {
        const cPayload = cRes.value.data?.data ?? cRes.value.data
        const cat: Record<string, any> = cPayload?.service_catalog ?? {}
        catalog = Object.entries(cat).map(([code, v]) => ({ code, ...(v as object) }))
      }

      let orders: any[] = []
      if (oRes.status === 'fulfilled') {
        const payload = oRes.value.data?.data ?? oRes.value.data
        orders = payload?.items ?? []
      }

      // 服务订单/报修必须挂到具体 property_id：租客取生效租约房源
      let leaseProperty: PropertyOption | null = null
      if (lRes.status === 'fulfilled') {
        const lPayload = lRes.value.data?.data ?? lRes.value.data
        const leases: any[] = lPayload?.items ?? []
        const lease = leases.find((l) => l.status === 'active') || leases[0]
        const pid = lease?.property_id || lease?.property?.id
        if (pid) {
          const p = lease?.property || {}
          leaseProperty = {
            id: pid,
            label: [p.room_number, p.address].filter(Boolean).join(' · ') || pid,
            monthly_rent: p.monthly_rent,
            currency: p.currency,
          }
        }
      }

      // 业主订阅套餐（租客无档案时后端返回空数组）
      let packages: PackageItem[] = []
      if (pkgRes.status === 'fulfilled') {
        const payload = pkgRes.value.data?.data ?? pkgRes.value.data
        packages = Array.isArray(payload) ? payload : (payload?.items ?? [])
      }

      // 报修工单（租客只见自己的，业主只见自己房源的）
      let tickets: TicketItem[] = []
      if (tkRes.status === 'fulfilled') {
        const payload = tkRes.value.data?.data ?? tkRes.value.data
        tickets = payload?.items ?? (Array.isArray(payload) ? payload : [])
      }

      // 业主名下房源（租客无档案时后端返回空数组）
      let ownerProperties: PropertyOption[] = []
      if (opRes.status === 'fulfilled') {
        const payload = opRes.value.data?.data ?? opRes.value.data
        const list: any[] = Array.isArray(payload) ? payload : (payload?.items ?? [])
        ownerProperties = list.map((p) => ({
          id: p.id,
          label: [p.room_number, p.address].filter(Boolean).join(' · ') || p.id,
          monthly_rent: p.monthly_rent,
          currency: p.currency,
        }))
      }

      return { catalog, orders, leaseProperty, packages, tickets, ownerProperties }
    },
  })

  const catalog = q.data?.catalog ?? []
  const leaseProperty = q.data?.leaseProperty ?? null
  const packages = q.data?.packages ?? []
  const tickets = q.data?.tickets ?? []
  const ownerProperties = q.data?.ownerProperties ?? []
  const refresh = useCallback(() => {
    void q.refetch({ cancelRefetch: false })
  }, [q])

  // 可服务房源：业主用名下房源选择器；租客用生效租约房源
  const propertyOptions = useMemo<PropertyOption[]>(
    () => (isOwner ? ownerProperties : leaseProperty ? [leaseProperty] : []),
    [isOwner, ownerProperties, leaseProperty],
  )

  const bookings: Booking[] = useMemo(
    () =>
      (q.data?.orders ?? []).map((o: any) => ({
        id: o.id,
        serviceId: o.service_type,
        serviceName: serviceNameOf(o.service_type, catalog),
        status: normalizeBookingStatus(o.status),
        createdAt: o.created_at,
        preferredDate: o.scheduled_at,
        completedAt: o.completed_at,
        amount: Number(o.amount || 0),
        notes: o.notes,
        rating: typeof o.rating === 'number' ? o.rating : undefined,
        reviewComment: o.review_comment,
      })),
    [q.data?.orders, catalog, serviceNameOf],
  )

  // 「我的工单」= 服务订单 + 报修工单，按 created_at 倒序混合；仅业主展示（租客在「我的订单」看服务单）
  const mergedTickets = useMemo<TicketRow[]>(() => {
    const rows: TicketRow[] = []
    bookings.forEach((o) => {
      const meta = ORDER_STATUS_META[String(o.status)] || { label: '', tone: 'neutral' }
      rows.push({
        id: `svc-${o.id}`,
        orderId: o.id,
        kind: 'service',
        title: o.serviceName,
        status: o.status,
        badgeLabel: statusLabelMap[o.status],
        badgeTone: meta.tone,
        date: o.createdAt || o.preferredDate || '',
        property: '',
        priorityLabel: '',
        canReview: o.status === 'completed' && !o.rating,
      })
    })
    tickets.forEach((tk) => {
      const meta = TICKET_STATUS_META[tk.status] || { label: tk.status, tone: 'neutral' }
      rows.push({
        id: `repair-${tk.id}`,
        kind: 'repair',
        title: tk.title,
        status: tk.status,
        badgeLabel: t(meta.label),
        badgeTone: meta.tone,
        date: tk.created_at || '',
        property: propertyOptions.find((p) => p.id === tk.property_id)?.label || '',
        priorityLabel: PRIORITY_LABEL[tk.priority] || '',
        canReview: false,
      })
    })
    const inStatus = (r: TicketRow, list: string[]) => list.includes(r.status)
    let filtered = rows
    if (ticketFilter === 'processing') filtered = rows.filter((r) => inStatus(r, ['assigned', 'in_progress']))
    else if (ticketFilter === 'completed') filtered = rows.filter((r) => inStatus(r, ['completed', 'resolved', 'closed']))
    else if (ticketFilter === 'pending') filtered = rows.filter((r) => inStatus(r, ['pending', 'open']))
    const ts = (d: string) => (d ? dayjs(d).valueOf() : 0)
    return filtered.sort((a, b) => ts(b.date) - ts(a.date))
  }, [bookings, tickets, propertyOptions, ticketFilter, statusLabelMap, t])

  // 真实下单：POST /service-orders（必须关联房源，失败即失败，不伪造本地记录）
  const openBooking = (item: CatalogItem) => {
    if (!user?.id) {
      message.warning(t('tenantServices.loginWarn'))
      return
    }
    if (!propertyOptions.length) {
      message.warning(t('tenantServices.noLeaseWarn'))
      return
    }
    setBookPropertyId(propertyOptions[0]?.id)
    setBookItem(item)
  }

  const submitBooking = async () => {
    if (!bookItem) return
    if (!user?.id) {
      message.warning(t('tenantServices.loginWarn'))
      return
    }
    if (!bookPropertyId) {
      message.warning(t('tenantServices.noLeaseWarn'))
      return
    }
    setSubmitting(true)
    try {
      await api.post('/service-orders', {
        orderer_id: user.id,
        orderer_type: isOwner ? 'owner' : 'tenant',
        property_id: bookPropertyId,
        service_type: bookItem.code,
        amount: Number(bookItem.base_price || 0),
        currency: 'THB',
        notes: t('tenantServices.bookNotes'),
        billing_model: 'per_use',
        billing_amount: Number(bookItem.base_price || 0),
      })
      message.success(t('tenantServices.bookedSuccess'))
      setBookItem(null)
      refresh()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || err?.response?.data?.message || t('tenantServices.bookFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  // 年度服务套餐：同样落到真实服务订单（annual_management），不再只弹「购买成功」
  const buyPromo = async () => {
    if (!user?.id) {
      message.warning(t('tenantServices.loginWarn'))
      return
    }
    if (!propertyOptions.length) {
      message.warning(t('tenantServices.noLeaseWarn'))
      return
    }
    try {
      await api.post('/service-orders', {
        orderer_id: user.id,
        orderer_type: isOwner ? 'owner' : 'tenant',
        property_id: propertyOptions[0].id,
        service_type: 'annual_management',
        amount: PROMO_PRICE,
        currency: 'THB',
        notes: t('tenantServices.promoTitle'),
      })
      message.success(t('tenantServices.purchaseSuccess'))
      refresh()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || err?.response?.data?.message || t('tenantServices.bookFailed'))
    }
  }

  const openReview = (item: Booking) => {
    setReviewOrder(item)
    setReviewRating(5)
    setReviewComment('')
  }

  const submitReview = async () => {
    if (!reviewOrder) return
    setSubmitting(true)
    try {
      await api.post(`/service-orders/${reviewOrder.id}/review`, {
        rating: reviewRating,
        comment: reviewComment.trim() || undefined,
      })
      message.success(t('tenantServices.reviewSuccess'))
      setReviewOrder(null)
      refresh()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || err?.response?.data?.message || t('tenantServices.reviewFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  // ===== 订阅套餐（业主专享）=====
  const openSubscribe = () => {
    if (!ownerProperties.length) {
      message.warning(t('ownerServices.warnNoSubscribableProperty'))
      return
    }
    subscribeForm.setFieldsValue({
      property_id: ownerProperties[0]?.id,
      type: 'annual_management',
      start_date: dayjs(),
      commission_rate: 1,
      management_fee_rate: 0.5,
    })
    setSubscribeOpen(true)
  }

  const handleSubscribe = async () => {
    try {
      const values = await subscribeForm.validateFields()
      setSubscribeSubmitting(true)
      await api.post('/service-packages', {
        ...values,
        start_date: values.start_date.format('YYYY-MM-DDTHH:mm:ss'),
      })
      message.success(t('ownerServices.subscribeSuccess'))
      setSubscribeOpen(false)
      subscribeForm.resetFields()
      refresh()
    } catch (err: any) {
      if (err?.errorFields) {
        subscribeForm.scrollToField(err.errorFields[0].name)
        return
      }
      if (err?.response) {
        message.error(err?.response?.data?.detail || t('ownerServices.subscribeFailed'))
      }
    } finally {
      setSubscribeSubmitting(false)
    }
  }

  const handleCancelPackage = async (pkg: PackageItem) => {
    try {
      await api.patch(`/service-packages/${pkg.id}`, { status: 'cancelled' })
      message.success(t('ownerServices.unsubscribeSuccess'))
      refresh()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || t('ownerServices.unsubscribeFailed'))
    }
  }

  // ===== 报修工单 =====
  const openRepair = () => {
    if (!propertyOptions.length) {
      message.warning(t('ownerServices.warnNoRepairableProperty'))
      return
    }
    repairForm.setFieldsValue({
      property_id: propertyOptions[0]?.id,
      priority: 'medium',
      title: '',
      description: '',
    })
    setRepairOpen(true)
  }

  const handleRepairSubmit = async () => {
    try {
      const values = await repairForm.validateFields()
      setRepairSubmitting(true)
      await api.post('/maintenance-tickets', {
        property_id: values.property_id,
        title: values.title,
        description: values.description || values.title,
        priority: values.priority,
      })
      message.success(t('ownerServices.repairSuccess'))
      setRepairOpen(false)
      repairForm.resetFields()
      refresh()
    } catch (err: any) {
      if (err?.errorFields) {
        repairForm.scrollToField(err.errorFields[0].name)
        return
      }
      if (err?.response) {
        message.error(err?.response?.data?.detail || t('ownerServices.repairFailed'))
      }
    } finally {
      setRepairSubmitting(false)
    }
  }

  const formatAmount = (amount?: number) => `฿${Number(amount || 0).toLocaleString()}`
  const formatDateTime = (v?: string) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '—')

  const completedCount = bookings.filter((b) => b.status === 'completed').length
  const ratedBookings = bookings.filter((b) => typeof b.rating === 'number' && Number(b.rating) > 0)
  const avgRating = ratedBookings.length
    ? (ratedBookings.reduce((sum, b) => sum + Number(b.rating), 0) / ratedBookings.length).toFixed(1)
    : null

  const heroStats = [
    { value: String(catalog.length), label: t('tenantServices.itemCount') },
    { value: String(completedCount), label: t('tenantServices.completedOrders') },
    { value: avgRating ?? '—', label: t('tenantServices.avgRating') },
  ]

  return (
    <>
      {/* Hero */}
      <section className="svc-hero">
        <div className="svc-hero__decor svc-hero__decor--1"></div>
        <div className="svc-hero__decor svc-hero__decor--2"></div>
        <div className="svc-hero__decor svc-hero__decor--3"></div>
        <div className="svc-hero__content">
          {!isOwner && (
            <span className="svc-hero__eyebrow">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .587l3.668 7.431L24 9.75l-6 5.847 1.417 8.265L12 19.771l-7.417 4.091L6 15.597 0 9.75l8.332-1.732z"/></svg>
              {t('tenantServices.tenantExclusive')}
            </span>
          )}
          <h2 className="svc-hero__title">{t('tenantServices.recommendedTitle')}</h2>
          <p className="svc-hero__subtitle">{t('tenantServices.recommendedSubtitle')}</p>
          <button
            className="svc-hero__action"
            onClick={() => {
              const el = document.getElementById('svc-categories')
              if (el) el.scrollIntoView({ behavior: 'smooth' })
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            {t('tenantServices.startBooking')}
          </button>
        </div>
        <div className="svc-hero__stats">
          {heroStats.map((s) => (
            <div key={s.label} className="svc-hero__stat">
              <div className="svc-hero__stat-value">{s.value}</div>
              <div className="svc-hero__stat-label">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Service Categories（真实价目表） */}
      <section className="svc-section" id="svc-categories">
        <div className="svc-section__head">
          <h3 className="svc-section__title">{t('tenantServices.categoryTitle')}</h3>
          <span className="svc-section__hint">{t('tenantServices.categoryHint')}</span>
        </div>
        {catalog.length === 0 ? (
          <div className="rent-empty">{t('tenantServices.emptyCatalog')}</div>
        ) : (
          <div className="svc-category-grid">
            {catalog.map((item) => {
              const meta = CARD_META[item.code] ?? DEFAULT_CARD_META
              const badge = t(`tenantServices.serviceBadge.${item.code}`, { defaultValue: '' })
              const desc = t(`tenantServices.serviceDesc.${item.code}`, { defaultValue: '' })
              const price = Number(item.base_price || 0)
              return (
                <div key={item.code} className="svc-category-card">
                  <div className="svc-category-card__top">
                    <div className="svc-category-card__icon" style={{ background: meta.iconBg, color: meta.iconColor }}>
                      <ServiceIcon type={ICON_TYPE[item.code] ?? 'other'} />
                    </div>
                    {badge && <span className={`svc-pill-badge svc-pill-badge--${meta.badgeType}`}>{badge}</span>}
                  </div>
                  <h4 className="svc-category-card__title">{serviceNameOf(item.code, catalog)}</h4>
                  {desc && <p className="svc-category-card__desc">{desc}</p>}
                  <div className="svc-category-card__footer">
                    <div>
                      <span className="svc-category-card__price-label">
                        {price > 0 ? t('tenantServices.priceFrom') : t('tenantServices.priceLabel')}
                      </span>
                      {price > 0 ? (
                        <span className="svc-category-card__price">
                          ฿{price.toLocaleString()}
                          <span className="svc-category-card__price-unit">
                            /{unitOf(item.code, catalog)}
                          </span>
                        </span>
                      ) : (
                        <span className="svc-category-card__price" style={{ color: 'var(--state-success)' }}>
                          {t('tenantServices.freeService')}
                        </span>
                      )}
                    </div>
                    <button className="svc-category-card__btn" onClick={() => openBooking(item)}>
                      {t('tenantServices.bookService')}
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* 订阅套餐（业主专享数据块） */}
      {isOwner && (
        <section className="svc-section">
          <div className="svc-section__head">
            <h3 className="svc-section__title">{t('ownerServices.plansTitle')}</h3>
            <span className="svc-section__hint">{t('ownerServices.plansSubtitle')}</span>
          </div>
          <div className="rent-grid rent-grid--3" style={{ marginBottom: 20 }}>
            {PLANS.map((plan) => {
              const checkColor = plan.recommended ? 'var(--rent-primary)' : 'var(--state-success)'
              return (
                <div
                  className="rent-card"
                  key={plan.id}
                  style={
                    plan.recommended
                      ? { border: '2px solid var(--rent-primary)', position: 'relative', boxShadow: 'var(--rent-shadow-2)' }
                      : { border: '1px solid var(--rent-border)' }
                  }
                >
                  {plan.recommended && (
                    <div
                      style={{
                        position: 'absolute',
                        top: -1,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        background: 'var(--rent-primary)',
                        color: 'var(--rent-primary-foreground)',
                        fontSize: 11,
                        fontWeight: 600,
                        padding: '3px 14px',
                        borderRadius: '0 0 var(--rent-radius-md) var(--rent-radius-md)',
                      }}
                    >
                      {t('ownerServices.recommended')}
                    </div>
                  )}
                  <div className="rent-card__body" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                    <div style={{ textAlign: 'center', marginBottom: 16 }}>
                      <h4
                        style={{
                          fontSize: 16,
                          fontWeight: 600,
                          color: plan.recommended ? 'var(--rent-primary)' : 'var(--rent-ink)',
                          margin: '0 0 10px',
                        }}
                      >
                        {t(plan.name)}
                      </h4>
                      <div>
                        <span className="rent-num" style={{ fontSize: 30, color: 'var(--rent-ink)' }}>{plan.price}</span>
                        <span className="rent-text-sm rent-text-muted">{t(plan.unit)}</span>
                      </div>
                    </div>
                    <hr className="rent-divider" />
                    <ul
                      style={{
                        listStyle: 'none',
                        padding: 0,
                        margin: '0 0 20px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 12,
                        flex: 1,
                      }}
                    >
                      {plan.features.map((f) => (
                        <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--rent-ink-2)' }}>
                          {checkIcon(checkColor)}
                          {t(f)}
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      className={`rent-btn rent-btn--${plan.recommended ? 'primary' : 'secondary'} rent-btn--block`}
                      onClick={openSubscribe}
                    >
                      {t('ownerServices.choose')}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {/* 我的订阅（真实数据） */}
          {packages.length > 0 && (
            <div className="rent-sub-section">
              <h4 className="rent-sub-title">{t('ownerServices.mySubscriptions')}</h4>
              <div className="rent-sub-list">
                {packages.map((pkg) => {
                  const st = packageStatusLabel(t, pkg.status)
                  return (
                    <div className="rent-sub-item" key={pkg.id}>
                      <div className="rent-sub-item__main">
                        <div className="rent-sub-item__name">{packageTypeLabel(t, pkg.type)}</div>
                        <div className="rent-sub-item__meta">
                          {t('ownerServices.propertyLabel')} {pkg.property_id} · {dayjs(pkg.start_date).format('YYYY-MM-DD')} ~ {dayjs(pkg.end_date).format('YYYY-MM-DD')}
                        </div>
                      </div>
                      <div className="rent-sub-item__right">
                        <span className="rent-sub-item__amount">{fmtMoney(pkg.amount, pkg.currency)}</span>
                        <span className={`rent-badge rent-badge--${st.tone}`}>{st.label}</span>
                        {pkg.status === 'active' && (
                          <button
                            type="button"
                            className="rent-btn rent-btn--secondary rent-btn--sm"
                            onClick={() => handleCancelPackage(pkg)}
                          >
                            {t('ownerServices.cancelSubscription')}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </section>
      )}

      {/* 我的订单（租客）/ 我的工单（业主，含服务订单 + 报修工单） */}
      {isOwner ? (
        <section className="svc-section">
          <div className="svc-section__head">
            <h3 className="svc-section__title">{t('ownerServices.tabTickets')}</h3>
            <button type="button" className="rent-btn rent-btn--primary rent-btn--sm" onClick={openRepair}>
              {t('ownerServices.submitRepair')}
            </button>
          </div>
          <div className="rent-chips" style={{ marginBottom: 16 }}>
            {TICKET_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                className="rent-chip"
                data-active={ticketFilter === f.value}
                onClick={() => setTicketFilter(f.value)}
              >
                {t(f.label)}
              </button>
            ))}
          </div>
          {mergedTickets.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('ownerServices.emptyTickets')} style={{ padding: '32px 0' }} />
          ) : (
            <div className="rent-sub-list">
              {mergedTickets.map((row) => (
                <div className="rent-sub-item" key={row.id}>
                  <div className="rent-sub-item__main">
                    <div className="rent-sub-item__name">
                      <span className={`rent-badge ${row.kind === 'service' ? 'rent-badge--primary' : 'rent-badge--info'}`}>
                        {row.kind === 'service' ? t('ownerServices.kindService') : t('ownerServices.kindRepair')}
                      </span>
                      {row.title}
                      {row.kind === 'repair' && row.priorityLabel && (
                        <span className="rent-badge rent-badge--warning" style={{ marginLeft: 8 }}>
                          {t(row.priorityLabel)}{t('ownerServices.prioritySuffix')}
                        </span>
                      )}
                    </div>
                    <div className="rent-sub-item__meta">
                      {row.property ? `${t('ownerServices.propertyLabel')} ${row.property}` : ''}
                      {row.date ? ` · ${dayjs(row.date).format('YYYY-MM-DD')}` : ''}
                    </div>
                  </div>
                  <div className="rent-sub-item__right">
                    <Tag color={tagColorOf(row.badgeTone)}>{row.badgeLabel}</Tag>
                    {row.kind === 'service' && row.canReview && (
                      <button
                        type="button"
                        className="rent-btn rent-btn--secondary rent-btn--sm"
                        onClick={() => {
                          const o = bookings.find((x) => x.id === row.orderId)
                          if (o) openReview(o)
                        }}
                      >
                        {t('ownerServices.review')}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : (
        <section className="svc-section">
          <div className="svc-section__head">
            <h3 className="svc-section__title">{t('tenantServices.myOrders')}</h3>
            <span className="svc-section__hint">{t('tenantServices.orderCount', { count: bookings.length })}</span>
          </div>
          <div className="svc-order-list">
            {bookings.length ? (
              bookings.map((item) => {
                const dateStr = item.preferredDate
                  ? formatDateTime(item.preferredDate)
                  : formatDateTime(item.createdAt)
                const stClass = statusClassMap[item.status]
                const stLabel = statusLabelMap[item.status]
                return (
                  <div key={item.id} className="svc-order-item">
                    <div className="svc-order-item__left">
                      <span className="svc-order-item__no">#{item.id.slice(-6)}</span>
                      <div className="svc-order-item__name">{item.serviceName}</div>
                    </div>
                    <div className="svc-order-item__mid">
                      <span className="svc-order-item__date">{dateStr}</span>
                      <span className="svc-order-item__amount">{formatAmount(item.amount)}</span>
                    </div>
                    <div className="svc-order-item__right">
                      <span className={`svc-order-status ${stClass}`}>
                        <span className="svc-order-status__dot"></span>
                        {stLabel}
                      </span>
                      {item.status === 'completed' && !item.rating ? (
                        <button className="rent-btn rent-btn--primary rent-btn--sm" onClick={() => openReview(item)}>
                          {t('tenantServices.review')}
                        </button>
                      ) : (
                        <button className="rent-btn rent-btn--secondary rent-btn--sm" onClick={() => setDetailOrder(item)}>
                          {t('tenantServices.detail')}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="rent-empty">{t('tenantServices.emptyOrders')}</div>
            )}
          </div>
        </section>
      )}

      {/* Service Reviews（只展示真实已评价订单） */}
      <section className="svc-section">
        <div className="svc-section__head">
          <h3 className="svc-section__title">{t('tenantServices.reviewsTitle')}</h3>
          <span className="svc-section__hint">{t('tenantServices.reviewCount', { count: ratedBookings.length })}</span>
        </div>
        <div className="svc-reviews">
          {ratedBookings.length ? (
            ratedBookings.map((item) => (
              <div key={item.id} className="svc-review">
                <div className="svc-review__head">
                  <div className="svc-review__user">
                    <div className="svc-review__avatar" style={{ background: 'var(--rent-primary)' }}>
                      {item.serviceName.slice(0, 1)}
                    </div>
                    <div>
                      <div className="svc-review__name">{item.serviceName}</div>
                      <div className="svc-review__meta">
                        {t('tenantServices.myReview')} · {formatDateTime(item.completedAt || item.createdAt)}
                      </div>
                    </div>
                  </div>
                  <div className="svc-review__rating">
                    <span className="svc-review__stars">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <span key={n} style={{ opacity: n <= Number(item.rating) ? 1 : 0.25 }}>★</span>
                      ))}
                    </span>
                    <span className="svc-review__score">{Number(item.rating).toFixed(1)}</span>
                  </div>
                </div>
                {item.reviewComment && <p className="svc-review__text">{item.reviewComment}</p>}
              </div>
            ))
          ) : (
            <div className="rent-empty">{t('tenantServices.emptyReviews')}</div>
          )}
        </div>
      </section>

      {/* Promo Banner */}
      <section className="svc-promo">
        <div className="svc-promo__decor"></div>
        <div className="svc-promo__decor svc-promo__decor--2"></div>
        <div className="svc-promo__body">
          <div className="svc-promo__icon">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M20 12v9H4v-9"/><rect x="2" y="7" width="20" height="5" rx="1"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>
          </div>
          <div>
            <h3 className="svc-promo__title">{t('tenantServices.promoTitle')}</h3>
            <p className="svc-promo__desc">{t('tenantServices.promoDesc')}</p>
            <div className="svc-promo__price-row">
              <span className="svc-promo__price">฿{PROMO_PRICE.toLocaleString()}</span>
              <span className="svc-promo__price-old">฿1,680</span>
              <span className="svc-promo__save">{t('tenantServices.saveLabel')}</span>
            </div>
          </div>
        </div>
        <button
          className="svc-promo__btn"
          onClick={() =>
            Modal.confirm({
              title: t('tenantServices.promoTitle'),
              content: t('tenantServices.promoConfirm', { price: formatAmount(PROMO_PRICE) }),
              okText: t('tenantServices.buyNow'),
              cancelText: t('tenantServices.cancel'),
              onOk: buyPromo,
            })
          }
        >
          {t('tenantServices.buyNow')}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
        </button>
      </section>

      {/* 下单确认（真实创建服务订单） */}
      <Modal
        title={t('tenantServices.bookTitle')}
        open={!!bookItem}
        onCancel={() => setBookItem(null)}
        onOk={submitBooking}
        confirmLoading={submitting}
        okText={t('tenantServices.bookConfirm')}
        cancelText={t('tenantServices.cancel')}
      >
        <div className="mt-detail__rows">
          <div className="mt-detail__row">
            <span className="mt-detail__label">{t('tenantServices.detailService')}</span>
            <span className="mt-detail__value">{bookItem ? serviceNameOf(bookItem.code, catalog) : '—'}</span>
          </div>
          <div className="mt-detail__row">
            <span className="mt-detail__label">{t('ownerServices.labelServiceProperty')}</span>
            <span className="mt-detail__value">
              <Select
                style={{ width: '100%' }}
                placeholder={t('ownerServices.msgSelectProperty')}
                value={bookPropertyId}
                onChange={setBookPropertyId}
                options={propertyOptions.map((p) => ({ value: p.id, label: p.label }))}
              />
            </span>
          </div>
          <div className="mt-detail__row">
            <span className="mt-detail__label">{t('tenantServices.bookUnitPrice')}</span>
            <span className="mt-detail__value">
              {formatAmount(Number(bookItem?.base_price || 0))}
              {bookItem ? ` / ${unitOf(bookItem.code, catalog)}` : ''}
            </span>
          </div>
          <div className="mt-detail__row">
            <span className="mt-detail__label">{t('tenantServices.bookTotal')}</span>
            <span className="mt-detail__value">{formatAmount(Number(bookItem?.base_price || 0))}</span>
          </div>
          <div className="mt-detail__row">
            <span className="mt-detail__label">{t('tenantServices.bookTax')}</span>
            <span className="mt-detail__value">{t('tenantServices.bookTaxNote')}</span>
          </div>
        </div>
        {!propertyOptions.length && <p className="mt-detail__desc">{t('tenantServices.noLeaseWarn')}</p>}
      </Modal>

      {/* 订单详情 */}
      <Modal
        title={t('tenantServices.detailTitle')}
        open={!!detailOrder}
        onCancel={() => setDetailOrder(null)}
        footer={null}
        width={520}
      >
        {detailOrder && (
          <div className="mt-detail__rows">
            <div className="mt-detail__row">
              <span className="mt-detail__label">{t('tenantServices.detailNo')}</span>
              <span className="mt-detail__value">#{detailOrder.id.slice(-6)}</span>
            </div>
            <div className="mt-detail__row">
              <span className="mt-detail__label">{t('tenantServices.detailService')}</span>
              <span className="mt-detail__value">{detailOrder.serviceName}</span>
            </div>
            <div className="mt-detail__row">
              <span className="mt-detail__label">{t('tenantServices.detailStatus')}</span>
              <span className="mt-detail__value">{statusLabelMap[detailOrder.status]}</span>
            </div>
            <div className="mt-detail__row">
              <span className="mt-detail__label">{t('tenantServices.detailCreated')}</span>
              <span className="mt-detail__value">{formatDateTime(detailOrder.createdAt)}</span>
            </div>
            <div className="mt-detail__row">
              <span className="mt-detail__label">{t('tenantServices.detailScheduled')}</span>
              <span className="mt-detail__value">{formatDateTime(detailOrder.preferredDate)}</span>
            </div>
            <div className="mt-detail__row">
              <span className="mt-detail__label">{t('tenantServices.detailCompleted')}</span>
              <span className="mt-detail__value">{formatDateTime(detailOrder.completedAt)}</span>
            </div>
            <div className="mt-detail__row">
              <span className="mt-detail__label">{t('tenantServices.detailAmount')}</span>
              <span className="mt-detail__value">{formatAmount(detailOrder.amount)}</span>
            </div>
            <div className="mt-detail__row">
              <span className="mt-detail__label">{t('tenantServices.detailNotes')}</span>
              <span className="mt-detail__value">{detailOrder.notes || '—'}</span>
            </div>
            <div className="mt-detail__row">
              <span className="mt-detail__label">{t('tenantServices.myReview')}</span>
              <span className="mt-detail__value">
                {detailOrder.rating ? (
                  <Rate disabled value={Number(detailOrder.rating)} style={{ fontSize: 14 }} />
                ) : (
                  t('tenantServices.notReviewed')
                )}
              </span>
            </div>
            {detailOrder.reviewComment && (
              <div className="mt-detail__block">
                <div className="mt-detail__label">{t('tenantServices.detailFeedback')}</div>
                <p className="mt-detail__desc">{detailOrder.reviewComment}</p>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* 评价服务 */}
      <Modal
        title={t('tenantServices.reviewTitle')}
        open={!!reviewOrder}
        onCancel={() => setReviewOrder(null)}
        onOk={submitReview}
        confirmLoading={submitting}
        okText={t('tenantServices.reviewSubmit')}
        cancelText={t('tenantServices.cancel')}
      >
        {reviewOrder && (
          <div className="mt-detail__rows">
            <div className="mt-detail__row">
              <span className="mt-detail__label">{t('tenantServices.detailService')}</span>
              <span className="mt-detail__value">{reviewOrder.serviceName}</span>
            </div>
            <div className="mt-detail__row">
              <span className="mt-detail__label">{t('tenantServices.reviewRatingLabel')}</span>
              <span className="mt-detail__value">
                <Rate value={reviewRating} onChange={setReviewRating} />
              </span>
            </div>
            <div className="mt-detail__block">
              <div className="mt-detail__label">{t('tenantServices.reviewFeedbackLabel')}</div>
              <textarea
                className="mt-detail__textarea"
                rows={3}
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                placeholder={t('tenantServices.reviewFeedbackPlaceholder')}
              />
            </div>
          </div>
        )}
      </Modal>

      {/* 订阅套餐（业主专享） */}
      <Modal
        title={t('ownerServices.subscribeModalTitle')}
        open={subscribeOpen}
        onCancel={() => setSubscribeOpen(false)}
        onOk={handleSubscribe}
        confirmLoading={subscribeSubmitting}
        okText={t('ownerServices.confirmSubscribe')}
        cancelText={t('common.cancel')}
      >
        <Form form={subscribeForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="property_id" label={t('ownerServices.labelSelectProperty')} rules={[{ required: true, message: t('ownerServices.msgSelectProperty') }]}>
            <Select
              placeholder={t('ownerServices.msgSelectProperty')}
              options={ownerProperties.map((p) => ({
                value: p.id,
                label: `${p.label}${p.monthly_rent ? ` · ${fmtMoney(p.monthly_rent, p.currency)}${t('ownerServices.perMonthSuffix')}` : ''}`,
              }))}
            />
          </Form.Item>
          <Form.Item name="type" label={t('ownerServices.labelPackageType')} rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'annual_management', label: t('ownerServices.packageTypeAnnual') },
                { value: 'full_service', label: t('ownerServices.packageTypeFull') },
              ]}
            />
          </Form.Item>
          <Form.Item name="start_date" label={t('ownerServices.labelStartDate')} rules={[{ required: true, message: t('ownerServices.msgSelectStartDate') }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <div className="rent-grid rent-grid--2">
            <Form.Item name="commission_rate" label={t('ownerServices.labelCommissionRate')} rules={[{ required: true }]}>
              <InputNumber min={0.5} max={3} step={0.5} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="management_fee_rate" label={t('ownerServices.labelManagementFeeRate')} rules={[{ required: true }]}>
              <InputNumber min={0} max={3} step={0.25} style={{ width: '100%' }} />
            </Form.Item>
          </div>
        </Form>
      </Modal>

      {/* 提交报修（租客 / 业主均可） */}
      <Modal
        title={t('ownerServices.submitRepair')}
        open={repairOpen}
        onCancel={() => !repairSubmitting && setRepairOpen(false)}
        onOk={handleRepairSubmit}
        confirmLoading={repairSubmitting}
        okText={t('ownerServices.submitTicket')}
        cancelText={t('common.cancel')}
      >
        <Form form={repairForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="property_id" label={t('ownerServices.labelRepairProperty')} rules={[{ required: true, message: t('ownerServices.msgSelectProperty') }]}>
            <Select
              placeholder={t('ownerServices.msgSelectProperty')}
              options={propertyOptions.map((p) => ({ value: p.id, label: p.label }))}
            />
          </Form.Item>
          <Form.Item name="title" label={t('ownerServices.labelRepairTitle')} rules={[{ required: true, message: t('ownerServices.msgRepairTitle') }]}>
            <Input maxLength={60} placeholder={t('ownerServices.repairTitlePlaceholder')} />
          </Form.Item>
          <Form.Item name="description" label={t('ownerServices.labelProblemDesc')}>
            <Input.TextArea rows={3} maxLength={300} placeholder={t('ownerServices.problemDescPlaceholder')} />
          </Form.Item>
          <Form.Item name="priority" label={t('ownerServices.labelPriority')} rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'low', label: t('ownerServices.priorityLow') },
                { value: 'medium', label: t('ownerServices.priorityMedium') },
                { value: 'high', label: t('ownerServices.priorityHigh') },
                { value: 'urgent', label: t('ownerServices.priorityUrgent') },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}

export default TenantServices
