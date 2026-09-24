import { useCallback, useMemo, useRef, useState } from 'react'
import { message, Modal, Form, Select, DatePicker, InputNumber, Input, Rate, Tag, Empty } from 'antd'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import type { ReactNode } from 'react'
import api from '@/lib/api'
import useAuthStore from '@/stores/auth'
import { useCachedQuery } from '@/lib/queryCache'
import './services.css'

interface ServiceItem {
  id: string
  name: string
  description: string
  icon: ReactNode
  iconBg: string
  ratingFilled: number
  ratingLabel: string
  price: string
  priceUnit: string
}

interface ServiceOrderItem {
  id: string
  property_id?: string
  service_type: string
  status: string
  scheduled_at?: string
  created_at?: string
  completed_at?: string
  amount: number
  currency: string
  notes?: string
  rating?: number | null
  review_comment?: string | null
  reviewed_at?: string | null
}

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

interface PropertyOption {
  id: string
  room_number: string
  address: string
  monthly_rent: number
  currency: string
}

interface MaintenanceTicketItem {
  id: string
  property_id?: string
  title: string
  description?: string
  priority: string
  status: string
  created_at?: string
}

// 服务卡片数据（与原型 owner-services 一致）
const services: ServiceItem[] = [
  {
    id: 'cleaning',
    name: 'ownerServices.svcCleaningName',
    description: 'ownerServices.svcCleaningDesc',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
        <path d="M19 14l.95 2.55L22.5 17.5l-2.55.95L19 21l-.95-2.55L15.5 17.5l2.55-.95L19 14z" />
      </svg>
    ),
    iconBg: 'rgba(14,165,233,0.12)',
    ratingFilled: 5,
    ratingLabel: '4.9/5',
    price: 'RM 150',
    priceUnit: 'ownerServices.unitPerTime',
  },
  {
    id: 'ac',
    name: 'ownerServices.svcAcName',
    description: 'ownerServices.svcAcDesc',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#14b8a6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9.59 4.59A2 2 0 1 1 11 8H2" />
        <path d="M17.73 2.27A2.5 2.5 0 1 1 19.5 6.5H2" />
        <path d="M9.59 19.41A2 2 0 1 0 11 16H2" />
      </svg>
    ),
    iconBg: 'rgba(20,184,166,0.12)',
    ratingFilled: 5,
    ratingLabel: '4.8/5',
    price: 'RM 180',
    priceUnit: 'ownerServices.unitPerTime',
  },
  {
    id: 'tax',
    name: 'ownerServices.svcTaxName',
    description: 'ownerServices.svcTaxDesc',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="9" y1="13" x2="15" y2="13" />
        <line x1="9" y1="17" x2="15" y2="17" />
        <line x1="9" y1="9" x2="11" y2="9" />
      </svg>
    ),
    iconBg: 'rgba(22,163,74,0.12)',
    ratingFilled: 4,
    ratingLabel: '4.7/5',
    price: 'RM 200',
    priceUnit: 'ownerServices.unitPerTime',
  },
  {
    id: 'insurance',
    name: 'ownerServices.svcInsuranceName',
    description: 'ownerServices.svcInsuranceDesc',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <polyline points="9 12 11 14 15 10" />
      </svg>
    ),
    iconBg: 'rgba(217,119,6,0.12)',
    ratingFilled: 5,
    ratingLabel: '4.8/5',
    price: 'RM 800',
    priceUnit: 'ownerServices.unitPerYear',
  },
  {
    id: 'plumbing',
    name: 'ownerServices.svcPlumbingName',
    description: 'ownerServices.svcPlumbingDesc',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
      </svg>
    ),
    iconBg: 'rgba(14,165,233,0.12)',
    ratingFilled: 4,
    ratingLabel: '4.6/5',
    price: 'RM 120',
    priceUnit: 'ownerServices.unitPerTime',
  },
  {
    id: 'garden',
    name: 'ownerServices.svcGardenName',
    description: 'ownerServices.svcGardenDesc',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19.2 2.96c1.4 3.3 1.4 6.3.7 9.2-1 4-4 6.5-9 7.84" />
        <path d="M2 21c0-3 1.85-5.36 5.08-6" />
      </svg>
    ),
    iconBg: 'rgba(22,163,74,0.12)',
    ratingFilled: 5,
    ratingLabel: '4.9/5',
    price: 'RM 250',
    priceUnit: 'ownerServices.unitPerMonth',
  },
]

// 服务卡片 → 后端 ServiceType 枚举。枚举取值固定（保洁/空调/网络/水电/保险/税费/年度托管），
// 卡片中的「管道疏通」归入 utility_payment、「园艺养护」归入 annual_management（按月养护托管）。
const SERVICE_TYPE_BY_CARD: Record<string, string> = {
  cleaning: 'cleaning',
  ac: 'ac_cleaning',
  tax: 'tax_payment',
  insurance: 'insurance',
  plumbing: 'utility_payment',
  garden: 'annual_management',
}

// 后端 ServiceType → 展示文案 key（订单列表按枚举反查）
const SERVICE_TYPE_LABEL: Record<string, string> = {
  cleaning: 'ownerServices.typeCleaning',
  ac_cleaning: 'ownerServices.typeAcCleaning',
  wifi_install: 'ownerServices.typeWifiInstall',
  utility_payment: 'ownerServices.typeUtilityPayment',
  insurance: 'ownerServices.typeInsurance',
  tax_payment: 'ownerServices.typeTaxPayment',
  annual_management: 'ownerServices.typeAnnualManagement',
}

// 服务订单状态 → 展示文案 key 与徽章色调
const ORDER_STATUS_META: Record<string, { label: string; tone: string }> = {
  pending: { label: 'ownerServices.orderStatusPending', tone: 'warning' },
  assigned: { label: 'ownerServices.orderStatusAssigned', tone: 'info' },
  in_progress: { label: 'ownerServices.orderStatusInProgress', tone: 'info' },
  completed: { label: 'ownerServices.orderStatusCompleted', tone: 'success' },
  cancelled: { label: 'ownerServices.orderStatusCancelled', tone: 'neutral' },
}

// 报修工单状态 → 展示文案 key 与徽章色调
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

// 「我的工单」状态筛选 chips
const TICKET_FILTERS: { value: 'all' | 'processing' | 'completed' | 'pending'; label: string }[] = [
  { value: 'all', label: 'ownerServices.filterAll' },
  { value: 'processing', label: 'ownerServices.filterProcessing' },
  { value: 'completed', label: 'ownerServices.filterCompleted' },
  { value: 'pending', label: 'ownerServices.filterPending' },
]

// 状态徽章色调 → antd Tag color
const tagColorOf = (tone: string) =>
  tone === 'success' ? 'success' : tone === 'warning' ? 'warning' : tone === 'info' ? 'processing' : 'default'

// 「我的工单」合并列表行
interface TicketRow {
  id: string
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

// 从卡片价格文案（如 "RM 150"）解析出金额数值
const parseAmount = (price: string) => Number(String(price).replace(/[^\d.]/g, '')) || 0

// 订阅套餐（与原型一致）
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
    features: [
      'ownerServices.planBasicF1',
      'ownerServices.planBasicF2',
      'ownerServices.planBasicF3',
    ],
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

const Star = ({ filled }: { filled: boolean }) =>
  filled ? (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="#f59e0b">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  ) : (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="2">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )

const checkIcon = (color: string) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
)

const arrowIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </svg>
)

const trashIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
)

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

const Services = () => {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const uid = user?.id ?? 'anon'
  const queryClient = useQueryClient()
  const servicesQueryKey: string[] = ['owner-services', 'dashboard', uid]

  const q = useCachedQuery<{
    packages: PackageItem[]
    orders: ServiceOrderItem[]
    tickets: MaintenanceTicketItem[]
    properties: PropertyOption[]
  }>({
    queryKey: servicesQueryKey,
    cacheKey: `owner-services:dashboard:${uid}`,
    queryFn: async () => {
      const [pkgRes, ordersRes, ticketsRes, propsRes] = await Promise.all([
        api.get('/service-packages/me').catch(() => ({ data: [] })),
        api.get('/service-orders', { params: { page_size: 50 } }).catch(() => ({ data: [] })),
        api.get('/maintenance-tickets', { params: { page_size: 50 } }).catch(() => ({ data: [] })),
        api.get('/owners/me/properties').catch(() => ({ data: [] })),
      ])
      return {
        packages: Array.isArray(pkgRes.data) ? pkgRes.data : (pkgRes.data?.items ?? []),
        orders: Array.isArray(ordersRes.data) ? ordersRes.data : (ordersRes.data?.items ?? []),
        tickets: Array.isArray(ticketsRes.data) ? ticketsRes.data : (ticketsRes.data?.items ?? []),
        properties: Array.isArray(propsRes.data) ? propsRes.data : (propsRes.data?.items ?? []),
      }
    },
  })
  const payload = q.data
  const packages = payload?.packages ?? []
  const orders = payload?.orders ?? []
  const tickets = payload?.tickets ?? []
  const properties = payload?.properties ?? []
  const refresh = useCallback(() => {
    void q.refetch({ cancelRefetch: false })
  }, [q])

  const [modalOpen, setModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form] = Form.useForm()
  const plansRef = useRef<HTMLDivElement>(null)
  // 预约弹窗（提交到后端 service-orders，形成可评价的服务订单）
  const [bookingService, setBookingService] = useState<ServiceItem | null>(null)
  const [bookingSubmitting, setBookingSubmitting] = useState(false)
  const [bookingForm] = Form.useForm()
  // 服务详情弹窗
  const [detailService, setDetailService] = useState<ServiceItem | null>(null)
  // 评价弹窗
  const [reviewOrder, setReviewOrder] = useState<ServiceOrderItem | null>(null)
  const [reviewSubmitting, setReviewSubmitting] = useState(false)
  const [reviewForm] = Form.useForm()
  // 提交报修弹窗
  const [repairOpen, setRepairOpen] = useState(false)
  const [repairSubmitting, setRepairSubmitting] = useState(false)
  const [repairForm] = Form.useForm()
  // 双 Tab：服务商城 | 我的工单
  const [activeTab, setActiveTab] = useState<'mall' | 'tickets'>('mall')
  const [ticketFilter, setTicketFilter] = useState<'all' | 'processing' | 'completed' | 'pending'>('all')

  const openBooking = (service: ServiceItem) => {
    if (!properties.length) {
      message.warning(t('ownerServices.warnNoBookableProperty'))
      return
    }
    bookingForm.setFieldsValue({
      property_id: properties[0]?.id,
      scheduled_at: dayjs().add(1, 'day').hour(10).minute(0).second(0),
      notes: '',
    })
    setBookingService(service)
  }

  const handleBookingSubmit = async () => {
    if (!bookingService) return
    try {
      const values = await bookingForm.validateFields()
      setBookingSubmitting(true)
      await api.post('/service-orders', {
        orderer_id: user?.id,
        orderer_type: 'owner',
        property_id: values.property_id,
        service_type: SERVICE_TYPE_BY_CARD[bookingService.id] || 'cleaning',
        scheduled_at: values.scheduled_at.format('YYYY-MM-DDTHH:mm:ss'),
        amount: parseAmount(bookingService.price),
        currency: 'MYR',
        notes: values.notes || undefined,
      })
      message.success(t('ownerServices.bookSuccess'))
      setBookingService(null)
      bookingForm.resetFields()
      refresh()
    } catch (err: any) {
      if (err?.response) {
        message.error(err?.response?.data?.detail || t('ownerServices.bookFailed'))
      }
      // validateFields 失败时静默
    } finally {
      setBookingSubmitting(false)
    }
  }

  const openReview = (order: ServiceOrderItem) => {
    reviewForm.setFieldsValue({ rating: 5, comment: '' })
    setReviewOrder(order)
  }

  const handleReviewSubmit = async () => {
    if (!reviewOrder) return
    try {
      const values = await reviewForm.validateFields()
      setReviewSubmitting(true)
      await api.post(`/service-orders/${reviewOrder.id}/review`, {
        rating: values.rating,
        comment: values.comment || undefined,
      })
      message.success(t('ownerServices.reviewSuccess'))
      setReviewOrder(null)
      reviewForm.resetFields()
      refresh()
    } catch (err: any) {
      if (err?.response) {
        message.error(err?.response?.data?.detail || t('ownerServices.reviewFailed'))
      }
    } finally {
      setReviewSubmitting(false)
    }
  }

  const openSubscribe = () => {
    if (!properties.length) {
      message.warning(t('ownerServices.warnNoSubscribableProperty'))
      return
    }
    form.setFieldsValue({
      property_id: properties[0]?.id,
      type: 'annual_management',
      start_date: dayjs(),
      commission_rate: 1,
      management_fee_rate: 0.5,
    })
    setModalOpen(true)
  }

  const handleSubscribe = async () => {
    try {
      const values = await form.validateFields()
      setSubmitting(true)
      const payload = {
        ...values,
        start_date: values.start_date.format('YYYY-MM-DDTHH:mm:ss'),
      }
      const res = await api.post('/service-packages', payload)
      message.success(t('ownerServices.subscribeSuccess'))
      setModalOpen(false)
      if (res.data) {
        queryClient.setQueryData<{
          packages: PackageItem[]
          orders: ServiceOrderItem[]
          tickets: MaintenanceTicketItem[]
          properties: PropertyOption[]
        }>(servicesQueryKey, (old) =>
          old ? { ...old, packages: [res.data, ...old.packages] } : old,
        )
      }
    } catch (err: any) {
      if (err?.response) {
        message.error(err?.response?.data?.detail || t('ownerServices.subscribeFailed'))
      }
      // validateFields 失败时静默
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancelPackage = async (pkg: PackageItem) => {
    try {
      await api.patch(`/service-packages/${pkg.id}`, { status: 'cancelled' })
      message.success(t('ownerServices.unsubscribeSuccess'))
      queryClient.setQueryData<{
        packages: PackageItem[]
        orders: ServiceOrderItem[]
        tickets: MaintenanceTicketItem[]
        properties: PropertyOption[]
      }>(servicesQueryKey, (old) =>
        old
          ? {
              ...old,
              packages: old.packages.map((p) =>
                String(p.id) === String(pkg.id) ? { ...p, status: 'cancelled' } : p,
              ),
            }
          : old,
      )
    } catch (err: any) {
      message.error(err?.response?.data?.detail || t('ownerServices.unsubscribeFailed'))
    }
  }

  const openRepair = () => {
    if (!properties.length) {
      message.warning(t('ownerServices.warnNoRepairableProperty'))
      return
    }
    repairForm.setFieldsValue({
      property_id: properties[0]?.id,
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
      if (err?.response) {
        message.error(err?.response?.data?.detail || t('ownerServices.repairFailed'))
      }
      // validateFields 失败时静默
    } finally {
      setRepairSubmitting(false)
    }
  }

  const scrollToPlans = () => {
    plansRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // 「我的工单」合并列表：服务订单 + 报修工单，按 created_at 倒序混合排序
  const mergedTickets = useMemo(() => {
    const rows: TicketRow[] = []
    orders.forEach((o) => {
      const st = ORDER_STATUS_META[o.status] || { label: o.status, tone: 'neutral' }
      const property = properties.find((p) => p.id === o.property_id)
      rows.push({
        id: `svc-${o.id}`,
        kind: 'service',
        title: SERVICE_TYPE_LABEL[o.service_type] || o.service_type,
        status: o.status,
        badgeLabel: st.label,
        badgeTone: st.tone,
        date: o.created_at || o.scheduled_at || '',
        property: property ? property.room_number : '',
        priorityLabel: '',
        canReview: o.status === 'completed' && !o.reviewed_at,
      })
    })
    tickets.forEach((t) => {
      const st = TICKET_STATUS_META[t.status] || { label: t.status, tone: 'neutral' }
      const property = properties.find((p) => p.id === t.property_id)
      rows.push({
        id: `repair-${t.id}`,
        kind: 'repair',
        title: t.title,
        status: t.status,
        badgeLabel: st.label,
        badgeTone: st.tone,
        date: t.created_at || '',
        property: property ? property.room_number : '',
        priorityLabel: PRIORITY_LABEL[t.priority] || t.priority || '',
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
  }, [orders, tickets, properties, ticketFilter])

  return (
    <div className="rent-main">
      {/* Page Header */}
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title">{t('ownerServices.title')}</h2>
          <p className="rent-page-header__subtitle">{t('ownerServices.subtitle')}</p>
        </div>
        <div className="rent-page-header__actions">
          <button type="button" className="rent-btn rent-btn--primary" onClick={openRepair}>
            {t('ownerServices.submitRepair')}
          </button>
          <button type="button" className="rent-btn rent-btn--secondary" onClick={() => { setActiveTab('mall'); setTimeout(scrollToPlans, 0) }}>
            {trashIcon}
            {t('ownerServices.mySubscriptions')}
          </button>
        </div>
      </div>

      {/* 双 Tab：服务商城 | 我的工单 */}
      <div className="rent-tabs">
        <button
          type="button"
          className="rent-tab"
          data-active={activeTab === 'mall'}
          onClick={() => setActiveTab('mall')}
        >
          {t('ownerServices.tabMall')}
        </button>
        <button
          type="button"
          className="rent-tab"
          data-active={activeTab === 'tickets'}
          onClick={() => setActiveTab('tickets')}
        >
          {t('ownerServices.tabTickets')}
        </button>
      </div>

      {activeTab === 'mall' ? (
        <>
      {/* Featured Banner */}
      <div
        className="rent-card rent-mb-5"
        style={{ background: 'var(--rent-primary)', border: 'none' }}
      >
        <div
          className="rent-card__body"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}
        >
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span className="rent-badge" style={{ background: 'rgba(255,255,255,0.2)', color: 'var(--rent-primary-foreground)' }}>{t('ownerServices.limitedOffer')}</span>
              <span className="rent-badge" style={{ background: 'rgba(255,255,255,0.2)', color: 'var(--rent-primary-foreground)' }}>{t('ownerServices.twentyOff')}</span>
            </div>
            <h3 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 6px', color: 'var(--rent-primary-foreground)', letterSpacing: '-0.01em' }}>
              {t('ownerServices.bannerTitle')}
            </h3>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.88)', margin: 0 }}>
              {t('ownerServices.bannerDesc')}
            </p>
          </div>
          <button
            type="button"
            className="rent-btn"
            style={{ background: 'var(--rent-card)', color: 'var(--rent-primary)', fontWeight: 600, boxShadow: 'var(--rent-shadow-2)', padding: '11px 22px' }}
            onClick={openSubscribe}
          >
            {t('ownerServices.subscribeNow')}
            {arrowIcon}
          </button>
        </div>
      </div>

      {/* Service Cards Grid */}
      <div className="rent-grid rent-grid--3 rent-mb-5">
        {services.map((s) => (
          <div className="rent-card" key={s.id}>
            <div className="rent-card__body">
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 'var(--rent-radius-md)',
                    background: s.iconBg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {s.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <h4 style={{ fontSize: 15, fontWeight: 600, color: 'var(--rent-ink)', margin: '0 0 4px' }}>{t(s.name)}</h4>
                  <p className="rent-text-sm rent-text-muted" style={{ margin: 0, lineHeight: 1.5 }}>{t(s.description)}</p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} filled={i < s.ratingFilled} />
                ))}
                <span className="rent-text-sm rent-text-muted">{s.ratingLabel}</span>
              </div>
              <div style={{ marginBottom: 14 }}>
                <span className="rent-text-sm rent-text-muted">{t('ownerServices.startingPrice')}</span>
                <span className="rent-num" style={{ fontSize: 20, color: 'var(--rent-ink)', marginLeft: 4 }}>{s.price}</span>
                <span className="rent-text-sm rent-text-muted">{t(s.priceUnit)}</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="rent-btn rent-btn--primary rent-btn--sm" onClick={() => openBooking(s)}>
                  {t('ownerServices.bookNow')}
                </button>
                <button
                  type="button"
                  className="rent-btn rent-btn--ghost rent-btn--sm"
                  onClick={() => setDetailService(s)}
                >
                  {t('ownerServices.learnMore')}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Subscription Plans */}
      <div className="rent-card" ref={plansRef}>
        <div className="rent-card__header">
          <h3 className="rent-card__title">{t('ownerServices.plansTitle')}</h3>
          <span className="rent-text-sm rent-text-muted">{t('ownerServices.plansSubtitle')}</span>
        </div>
        <div className="rent-card__body">
          <div className="rent-grid rent-grid--3">
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

          {/* 我的订阅（API 数据） */}
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
                        <span className={`rent-badge rent-badge--${st.tone === 'info' ? 'info' : st.tone}`}>{st.label}</span>
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
        </div>
      </div>
        </>
      ) : (
        <>
          {/* 我的工单 Tab：服务订单 + 报修工单 合并列表 */}
          <div className="rent-card rent-mb-5">
            <div className="rent-card__header">
              <h3 className="rent-card__title">{t('ownerServices.tabTickets')}</h3>
              <button type="button" className="rent-btn rent-btn--primary rent-btn--sm" onClick={openRepair}>
                {t('ownerServices.submitRepair')}
              </button>
            </div>
            <div className="rent-card__body">
              <div className="rent-chips">
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
                          {t(row.title)}
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
                        <Tag color={tagColorOf(row.badgeTone)}>{t(row.badgeLabel)}</Tag>
                        {row.kind === 'service' && row.canReview && (
                          <button
                            type="button"
                            className="rent-btn rent-btn--secondary rent-btn--sm"
                            onClick={() => {
                              const o = orders.find((x) => `svc-${x.id}` === row.id)
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
            </div>
          </div>
        </>
      )}

      {/* ===== Subscribe Modal ===== */}
      <Modal
        title={t('ownerServices.subscribeModalTitle')}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSubscribe}
        confirmLoading={submitting}
        okText={t('ownerServices.confirmSubscribe')}
        cancelText={t('common.cancel')}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="property_id" label={t('ownerServices.labelSelectProperty')} rules={[{ required: true, message: t('ownerServices.msgSelectProperty') }]}>
            <Select
              placeholder={t('ownerServices.msgSelectProperty')}
              options={properties.map((p) => ({
                value: p.id,
                label: `${p.room_number} · ${fmtMoney(p.monthly_rent, p.currency)}${t('ownerServices.perMonthSuffix')}`,
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

      {/* ===== 服务详情 Modal ===== */}
      <Modal
        title={detailService ? t(detailService.name) : undefined}
        open={!!detailService}
        onCancel={() => setDetailService(null)}
        footer={
          <button
            type="button"
            className="rent-btn rent-btn--primary"
            onClick={() => {
              const s = detailService
              setDetailService(null)
              if (s) openBooking(s)
            }}
          >
            {t('ownerServices.bookNow')}
          </button>
        }
      >
        {detailService && (
          <div style={{ marginTop: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 'var(--rent-radius-md)',
                  background: detailService.iconBg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {detailService.icon}
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Rate disabled value={detailService.ratingFilled} style={{ fontSize: 12 }} />
                  <span className="rent-text-sm rent-text-muted">{detailService.ratingLabel}</span>
                </div>
                <div style={{ marginTop: 4 }}>
                  <span className="rent-text-sm rent-text-muted">{t('ownerServices.startingPrice')}</span>
                  <span className="rent-num" style={{ fontSize: 18, color: 'var(--rent-ink)', marginLeft: 4 }}>
                    {detailService.price}
                  </span>
                  <span className="rent-text-sm rent-text-muted">{t(detailService.priceUnit)}</span>
                </div>
              </div>
            </div>
            <p className="rent-text-sm rent-text-muted" style={{ margin: 0, lineHeight: 1.7 }}>
              {t(detailService.description)}
            </p>
            <ul className="rent-text-sm rent-text-muted" style={{ margin: '12px 0 0', paddingLeft: 18, lineHeight: 1.8 }}>
              <li>{t('ownerServices.detailPoint1')}</li>
              <li>{t('ownerServices.detailPoint2')}</li>
              <li>{t('ownerServices.detailPoint3')}</li>
            </ul>
          </div>
        )}
      </Modal>

      {/* ===== 预约服务 Modal ===== */}
      <Modal
        title={bookingService ? `${t('ownerServices.bookingTitlePrefix')} · ${t(bookingService.name)}` : t('ownerServices.bookingTitle')}
        open={!!bookingService}
        onCancel={() => !bookingSubmitting && setBookingService(null)}
        onOk={handleBookingSubmit}
        confirmLoading={bookingSubmitting}
        okText={t('ownerServices.confirmBooking')}
        cancelText={t('common.cancel')}
      >
        <Form form={bookingForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="property_id" label={t('ownerServices.labelServiceProperty')} rules={[{ required: true, message: t('ownerServices.msgSelectProperty') }]}>
            <Select
              placeholder={t('ownerServices.msgSelectProperty')}
              options={properties.map((p) => ({
                value: p.id,
                label: `${p.room_number} · ${p.address || ''}`,
              }))}
            />
          </Form.Item>
          <Form.Item name="scheduled_at" label={t('ownerServices.labelExpectedTime')} rules={[{ required: true, message: t('ownerServices.msgSelectVisitTime') }]}>
            <DatePicker showTime style={{ width: '100%' }} format="YYYY-MM-DD HH:mm" />
          </Form.Item>
          <Form.Item name="notes" label={t('ownerServices.labelNotes')}>
            <Input.TextArea rows={3} maxLength={200} placeholder={t('ownerServices.notesPlaceholder')} />
          </Form.Item>
        </Form>
      </Modal>

      {/* ===== 提交报修 Modal ===== */}
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
              options={properties.map((p) => ({
                value: p.id,
                label: `${p.room_number} · ${p.address || ''}`,
              }))}
            />
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
          <Form.Item name="title" label={t('ownerServices.labelRepairTitle')} rules={[{ required: true, message: t('ownerServices.msgRepairTitle') }]}>
            <Input maxLength={60} placeholder={t('ownerServices.repairTitlePlaceholder')} />
          </Form.Item>
          <Form.Item name="description" label={t('ownerServices.labelProblemDesc')}>
            <Input.TextArea rows={3} maxLength={300} placeholder={t('ownerServices.problemDescPlaceholder')} />
          </Form.Item>
        </Form>
      </Modal>

      {/* ===== 服务评价 Modal ===== */}
      <Modal
        title={t('ownerServices.reviewTitle')}
        open={!!reviewOrder}
        onCancel={() => !reviewSubmitting && setReviewOrder(null)}
        onOk={handleReviewSubmit}
        confirmLoading={reviewSubmitting}
        okText={t('ownerServices.submitReview')}
        cancelText={t('common.cancel')}
      >
        <Form form={reviewForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="rating" label={t('ownerServices.labelServiceRating')} rules={[{ required: true, message: t('ownerServices.msgSelectRating') }]}>
            <Rate />
          </Form.Item>
          <Form.Item name="comment" label={t('ownerServices.labelServiceFeedback')}>
            <Input.TextArea rows={3} maxLength={1000} placeholder={t('ownerServices.feedbackPlaceholder')} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default Services
