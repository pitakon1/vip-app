/**
 * 小程序核心模型定义。
 *
 * 口径：与后端 JSON 逐字一致（snake_case、UUID 字符串 id）。
 * 此前这里混用了 camelCase + number id（如 `Property.projectId`、`Lease.monthlyRent`、
 * `MaintenanceTicket.createdAt`），和后端返回的 `project_id` / `monthly_rent` /
 * `created_at` 完全对不上，页面读到的值恒为 undefined。
 */

// ============ 用户相关 ============
export type UserRole = 'owner' | 'tenant' | 'admin' | 'agent' | 'employee' | 'partner_admin'

/** 用户摘要，与后端 `core/auth.py::serialize_user` 的字段完全一致。 */
export interface User {
  id: string
  email?: string
  full_name?: string
  role: UserRole
  phone?: string
  avatar_url?: string
  preferred_language?: string
}

// ============ 楼盘/房产相关 ============
export interface Project {
  id: string
  name: string
  address: string
  city?: string
  district?: string
  province?: string
  country?: string
  nearest_subway?: string
  developer?: string
  created_at?: string
  updated_at?: string
}

// 与后端 PropertyStatus 严格对齐：vacant / rented / renewing / maintenance
// （后端枚举无 reserved，筛选与提交都只能使用这四项）
export type PropertyStatus = 'vacant' | 'rented' | 'renewing' | 'maintenance'

export interface Property {
  id: string
  project_id?: string
  owner_id: string
  room_number: string
  building?: string
  address: string
  floor?: number
  property_type: string
  monthly_rent?: number
  currency: string
  deposit_amount?: number
  size_sqm?: number
  bedrooms?: number
  bathrooms?: number
  status: PropertyStatus
  description?: string
  photos?: string[]
  furnished?: boolean
  orientation?: string
  decoration?: string
  amenities?: string[]
  available_from?: string
  created_at?: string
  updated_at?: string
}

// ============ 租客相关 ============
export interface Tenant {
  id: string
  user_id: string
  // 关联用户档案的展示字段（后端 Tenant 本身只存证件/收入等，姓名来自 User）
  full_name?: string
  phone?: string
  nationality?: string
  monthly_income?: number
  tenant_credit_score?: number
  created_at?: string
  updated_at?: string
}

// ============ 合同相关 ============
// 与后端 LeaseStatus 对齐（含 pending）
export type LeaseStatus = 'active' | 'expired' | 'terminated' | 'pending'

export interface Lease {
  id: string
  lease_no?: string
  property_id: string
  tenant_id: string
  owner_id: string
  agent_id?: string
  start_date: string
  end_date: string
  monthly_rent: number
  currency: string
  deposit_amount: number
  deposit_status: string
  status: LeaseStatus
  contract_url?: string
  special_terms?: string
  renewed_from_lease_id?: string
  created_at?: string
  updated_at?: string
}

// ============ 支付相关 ============
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
export type PaymentDisplayStatus = 'paid' | 'pending' | 'overdue' | 'refunded'

// 列表筛选项：后端额外接受 overdue（pending 且已过截止日）作为派生筛选值
export type PaymentStatusFilter = PaymentStatus | 'overdue'

export interface Payment {
  id: string
  receipt_no?: string
  lease_id?: string
  property_id?: string
  payer_id: string
  payee_id?: string
  amount: number
  currency: string
  payment_type: PaymentType
  status: PaymentStatus
  channel?: string
  due_date?: string
  paid_at?: string
  receipt_url?: string
  description?: string
  failure_reason?: string
  late_fee_accrued?: number
  late_fee_waived?: number
  created_at?: string
  updated_at?: string
}

// ============ 文档相关 ============
// 与后端 `models/document.py::DocumentType` 一致
export type DocumentType =
  | 'contract'
  | 'receipt'
  | 'inspection_photo'
  | 'tax_invoice'
  | 'wht_certificate'
  | 'property_certificate'
  | 'owner_id_card'
  | 'other'

export interface Document {
  id: string
  owner_id: string
  property_id?: string
  lease_id?: string
  type: DocumentType
  title: string
  file_url: string
  file_size?: number
  mime_type?: string
  uploaded_by: string
  tags?: string[]
  created_at?: string
  updated_at?: string
}

// ============ 维修工单相关 ============
// MaintenanceStatus 必须与后端 `app/models/maintenance_ticket.py::TicketStatus` 逐字一致：
// open / assigned / in_progress / resolved / closed。
// 此前这里是 submitted/accepted（后端不存在这两个值），导致新建工单（后端默认 open）
// 在小程序里匹配不到任何状态 Tab，且 Tab 计数恒为 0。
export type MaintenanceStatus = 'open' | 'assigned' | 'in_progress' | 'resolved' | 'closed'
export type MaintenancePriority = 'low' | 'medium' | 'high' | 'urgent'

export interface MaintenanceTicket {
  id: string
  property_id: string
  tenant_id?: string
  owner_id?: string
  lease_id?: string
  title: string
  description: string
  photos?: string[]
  priority: MaintenancePriority
  status: MaintenanceStatus
  assigned_to?: string
  resolved_at?: string
  resolution_notes?: string
  cost?: number
  rating?: number
  feedback?: string
  created_at?: string
  updated_at?: string
}

// ============ 通知相关 ============
export type NotificationType = 'payment' | 'lease' | 'maintenance' | 'system'

export interface Notification {
  id: string
  user_id: string
  channel: string
  template_key?: string
  recipient: string
  subject?: string
  content: string
  status: string
  sent_at?: string
  read_at?: string
  related_entity_type?: string
  related_entity_id?: string
  created_at?: string
}

// ============ 服务相关 ============
// 本地服务目录视图模型（非后端模型，服务项由前端配置）
export interface ServiceItem {
  id: number
  name: string
  description: string
  price: number
  icon?: string
}

// ============ 收入汇总 ============
// 本地聚合视图模型（由多个接口汇总而来，非后端单表模型）
export interface IncomeSummary {
  totalIncome: number
  monthlyIncome: number
  pendingIncome: number
  overdueIncome: number
  details: Array<{
    month: string
    income: number
    propertyCount: number
  }>
}
