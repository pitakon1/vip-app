/**
 * 租客/业主服务页的页面私有类型。
 * 纯结构拆分自 pages/Tenant/Services.tsx，字段定义保持不变。
 */

/** GET /billing/pricing → service_catalog 的单项（真实价目，不含税） */
export interface CatalogItem {
  code: string
  label_zh?: string
  label_en?: string
  label_th?: string
  unit?: string
  base_price?: number
}

export interface Booking {
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
export interface PropertyOption {
  id: string
  label: string
  monthly_rent?: number
  currency?: string
}

/** GET /service-packages/me 的订阅套餐（业主专享管理合约） */
export interface PackageItem {
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
export interface TicketItem {
  id: string
  property_id?: string
  title: string
  description?: string
  priority: string
  status: string
  created_at?: string
}

export type IconType = 'cleaning' | 'ac' | 'wifi' | 'utility' | 'other'

/** 订阅套餐（业主专享） */
export interface PlanItem {
  id: string
  name: string
  price: string
  unit: string
  features: string[]
  recommended: boolean
}

export interface TicketRow {
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

export type TicketFilter = 'all' | 'processing' | 'completed' | 'pending'

export interface ServicesPayload {
  catalog: CatalogItem[]
  orders: any[]
  leaseProperty: PropertyOption | null
  packages: PackageItem[]
  tickets: TicketItem[]
  ownerProperties: PropertyOption[]
}
