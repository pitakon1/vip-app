/**
 * 租客/业主服务页的页面私有常量与纯函数。
 * 纯结构拆分自 pages/Tenant/Services.tsx，取值、映射与格式化保持不变。
 */
import dayjs from 'dayjs'
import type { Booking, IconType, PlanItem, TicketFilter } from './types'

// 服务图标（按后端真实服务编码映射）
export const ICON_TYPE: Record<string, IconType> = {
  cleaning: 'cleaning',
  ac_cleaning: 'ac',
  wifi_install: 'wifi',
  utility_payment: 'utility',
}

// 商品卡配色/角标（按编码，未列出走默认）
export const CARD_META: Record<
  string,
  { badgeType: 'primary' | 'info' | 'success' | 'warning'; iconBg: string; iconColor: string }
> = {
  cleaning: { badgeType: 'primary', iconBg: 'rgba(20, 184, 166, 0.12)', iconColor: 'var(--rent-primary)' },
  ac_cleaning: { badgeType: 'info', iconBg: 'rgba(14,165,233,0.12)', iconColor: 'var(--state-info)' },
  wifi_install: { badgeType: 'primary', iconBg: 'rgba(20,184,166,0.12)', iconColor: 'var(--rent-primary-text)' },
  utility_payment: { badgeType: 'warning', iconBg: 'rgba(217,119,6,0.12)', iconColor: 'var(--state-warning)' },
}
export const DEFAULT_CARD_META = {
  badgeType: 'info' as const,
  iconBg: 'rgba(14,165,233,0.12)',
  iconColor: 'var(--state-info)',
}

// 年度服务套餐价（与 banner 展示价保持一致）
export const PROMO_PRICE = 1288

// 接口状态（pending/assigned/in_progress/completed/cancelled）→ 页面展示状态
export const normalizeBookingStatus = (status?: string): Booking['status'] => {
  const v = String(status || '').toLowerCase()
  if (v === 'completed') return 'completed'
  if (v === 'cancelled') return 'cancelled'
  if (v === 'in_progress') return 'in_progress'
  return 'pending'
}

export const statusClassMap: Record<Booking['status'], string> = {
  pending: 'svc-order-status--warning',
  in_progress: 'svc-order-status--info',
  completed: 'svc-order-status--success',
  cancelled: 'svc-order-status--neutral',
}

// ===== 订阅套餐（业主专享）=====
export const PLANS: PlanItem[] = [
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
export const ORDER_STATUS_META: Record<string, { label: string; tone: string }> = {
  pending: { label: 'ownerServices.orderStatusPending', tone: 'warning' },
  assigned: { label: 'ownerServices.orderStatusAssigned', tone: 'info' },
  in_progress: { label: 'ownerServices.orderStatusInProgress', tone: 'info' },
  completed: { label: 'ownerServices.orderStatusCompleted', tone: 'success' },
  cancelled: { label: 'ownerServices.orderStatusCancelled', tone: 'neutral' },
}

export const TICKET_STATUS_META: Record<string, { label: string; tone: string }> = {
  open: { label: 'ownerServices.ticketStatusOpen', tone: 'warning' },
  assigned: { label: 'ownerServices.orderStatusAssigned', tone: 'info' },
  in_progress: { label: 'ownerServices.ticketStatusInProgress', tone: 'info' },
  resolved: { label: 'ownerServices.ticketStatusResolved', tone: 'success' },
  closed: { label: 'ownerServices.ticketStatusClosed', tone: 'neutral' },
}

export const PRIORITY_LABEL: Record<string, string> = {
  low: 'ownerServices.priorityLow',
  medium: 'ownerServices.priorityMedium',
  high: 'ownerServices.priorityHigh',
  urgent: 'ownerServices.priorityUrgent',
}

export const TICKET_FILTERS: { value: TicketFilter; label: string }[] = [
  { value: 'all', label: 'ownerServices.filterAll' },
  { value: 'processing', label: 'ownerServices.filterProcessing' },
  { value: 'completed', label: 'ownerServices.filterCompleted' },
  { value: 'pending', label: 'ownerServices.filterPending' },
]

export const tagColorOf = (tone: string) =>
  tone === 'success' ? 'success' : tone === 'warning' ? 'warning' : tone === 'info' ? 'processing' : 'default'

export const packageTypeLabel = (t: (k: string) => string, type: string) =>
  type === 'full_service' ? t('ownerServices.pkgFullService') : t('ownerServices.pkgAnnualManagement')
export const packageStatusLabel = (t: (k: string) => string, s: string) => {
  const map: Record<string, { label: string; tone: 'success' | 'info' | 'warning' | 'neutral' }> = {
    active: { label: t('ownerServices.pkgStatusActive'), tone: 'success' },
    pending: { label: t('ownerServices.pkgStatusPending'), tone: 'warning' },
    expired: { label: t('ownerServices.pkgStatusExpired'), tone: 'neutral' },
    cancelled: { label: t('ownerServices.pkgStatusCancelled'), tone: 'neutral' },
  }
  return map[s] || { label: s, tone: 'neutral' as const }
}

export const fmtMoney = (v: number, currency = 'THB') => {
  const sym = currency === 'THB' ? '฿' : currency === 'MYR' || currency === 'RM' ? 'RM' : currency
  return `${sym} ${Number(v || 0).toLocaleString()}`
}

export const formatAmount = (amount?: number) => `฿${Number(amount || 0).toLocaleString()}`
export const formatDateTime = (v?: string) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '—')
