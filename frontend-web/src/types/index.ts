export interface User {
  id: string
  full_name: string
  email: string
  role: string
  [key: string]: any
}

export interface Project {
  id: string
  name: string
  address: string
  city: string
  district: string
  country: string
  developer: string
  property_management_company: string
  [key: string]: any
}

// 与后端 PropertyStatus 严格对齐：vacant / rented / renewing / maintenance
export type PropertyStatus = 'vacant' | 'rented' | 'renewing' | 'maintenance'

export interface Property {
  id: string
  room_number: string
  project_id: string
  owner_id: string
  status: string
  monthly_rent: number
  currency: string
  deposit_amount: number
  size_sqm: number
  bedrooms: number
  bathrooms: number
  floor: number
  building: string
  address: string
  property_type: string
  furnished: boolean
  listing_no?: string
  orientation?: string
  decoration?: string
  min_lease_months?: number
  description?: string
  photos?: string[]
  amenities?: string[]
  available_from?: string
  created_at?: string
  updated_at?: string
  [key: string]: any
}

export interface Tenant {
  id: string
  name: string
  phone: string
  idCard?: string
  email?: string
  [key: string]: any
}

// 与后端 LeaseStatus 对齐（含 pending）
export type LeaseStatus = 'active' | 'expired' | 'terminated' | 'pending'

export interface Lease {
  id: string
  property_id: string
  tenant_id: string
  owner_id: string
  status: string
  start_date: string
  end_date: string
  monthly_rent: number
  deposit_amount: number
  currency: string
  deposit_status: string
  lease_no?: string
  contract_no?: string
  agent_id?: string
  contract_url?: string
  special_terms?: string
  renewed_from_lease_id?: string
  created_at?: string
  updated_at?: string
  [key: string]: any
}

// 与后端 PaymentType 对齐
export type PaymentType =
  | 'rent'
  | 'deposit'
  | 'commission'
  | 'service_fee'
  | 'utility'
  | 'tax'
  | 'refund'
// 后端枚举（backend/app/models/payment.py::PaymentStatus），接口只返回以下 7 个值
export type PaymentStatus =
  | 'pending'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'refunded'
  | 'disputed'
  | 'expired'
// 展示派生态：由前端按后端状态 + 截止时间派生，不属于后端枚举
export type PaymentDisplayStatus = 'completed' | 'pending' | 'overdue' | 'refunded'
// 列表筛选项：后端额外接受 overdue（pending 且已过截止日）作为派生筛选值
export type PaymentStatusFilter = PaymentStatus | 'overdue'

export interface Payment {
  id: string
  lease_id: string
  property_id: string
  amount: number
  currency: string
  status: PaymentStatus
  channel: string
  payment_type: string
  due_date: string
  paid_at: string
  receipt_no?: string
  payer_id?: string
  payee_id?: string
  receipt_url?: string
  description?: string
  failure_reason?: string
  // 逾期滞纳金：应缴 = amount + (late_fee_accrued - late_fee_waived)
  late_fee_accrued?: number
  late_fee_waived?: number
  late_fee_updated_at?: string
  created_at?: string
  updated_at?: string
  [key: string]: any
}

export type LeadStatus =
  | 'new'
  | 'following'
  | 'converted'
  | 'lost'
  | 'inquiring'
  | 'viewing_scheduled'
  | 'negotiating'
  | 'pending_contract'
  | 'closed'

export interface Lead {
  id: string
  name: string
  nationality: string
  phone: string
  email: string
  source: string
  stage: string
  budget_min: number
  budget_max: number
  budget_currency: string
  assigned_to: string
  notes: string
  [key: string]: any
}

export type EmployeeStatus = 'active' | 'inactive' | 'probation'

export interface Employee {
  id: string
  full_name: string
  phone: string
  position: string
  department: string
  status: string
  email: string
  [key: string]: any
}

export interface Document {
  id: string
  name: string
  type: string
  url: string
  uploadDate: string
  [key: string]: any
}

export interface CompanyInfo {
  id?: string
  name?: string
  address?: string
  phone?: string
  email?: string
  website?: string
  wechat?: string
  whatsapp?: string
  facebook?: string
  instagram?: string
  reg_no?: string
  currency?: string
  timezone?: string
  logo_url?: string
  updated_at?: string
  [key: string]: any
}

export interface DashboardSummary {
  total_properties: number
  vacant: number
  rented: number
  expiring_leases: number
  upcoming_payments?: number
  [key: string]: any
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  total_pages: number
  [key: string]: any
}
