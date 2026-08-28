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

export type PropertyStatus = 'vacant' | 'rented' | 'reserved' | 'maintenance'

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

export type LeaseStatus = 'active' | 'expired' | 'terminated'

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
  [key: string]: any
}

export type PaymentType = 'rent' | 'deposit' | 'refund'
export type PaymentStatus =
  | 'pending'
  | 'paid'
  | 'overdue'
  | 'succeeded'
  | 'failed'

export interface Payment {
  id: string
  lease_id: string
  property_id: string
  amount: number
  currency: string
  status: string
  channel: string
  payment_type: string
  due_date: string
  paid_at: string
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

export type EmployeeStatus = 'active' | 'inactive'

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
