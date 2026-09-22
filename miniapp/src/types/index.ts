// ============ 用户相关 ============
export type UserRole = 'owner' | 'tenant' | 'admin' | 'agent' | 'employee'

export interface User {
  id: number
  username: string
  name: string
  role: UserRole
  phone?: string
  email?: string
  avatar?: string
  avatar_url?: string
}

// ============ 房产相关 ============
export interface Project {
  id: number
  name: string
  address: string
  city?: string
  district?: string
}

export type PropertyStatus = 'vacant' | 'rented' | 'reserved'

export interface Property {
  id: number
  code: string
  projectId: number
  projectName?: string
  layout: string
  area: number
  floor?: string
  orientation?: string
  status: PropertyStatus
  rentPrice?: number
}

// ============ 租客相关 ============
export interface Tenant {
  id: number
  name: string
  phone: string
  idCard?: string
  email?: string
}

// ============ 合同相关 ============
export type LeaseStatus = 'active' | 'expired' | 'terminated'

export interface Lease {
  id: number
  propertyId: number
  tenantId: number
  startDate: string
  endDate: string
  monthlyRent: number
  deposit: number
  status: LeaseStatus
}

// ============ 支付相关 ============
export type PaymentType = 'rent' | 'deposit' | 'refund'
export type PaymentStatus = 'pending' | 'paid' | 'overdue'

export interface Payment {
  id: number
  leaseId: number
  amount: number
  type: PaymentType
  status: PaymentStatus
  dueDate: string
  paidDate?: string
}

// ============ 文档相关 ============
export interface Document {
  id: number
  name: string
  type: string
  url: string
  uploadDate: string
}

// ============ 维修工单相关 ============
// MaintenanceStatus 必须与后端 `app/models/maintenance_ticket.py::TicketStatus` 逐字一致：
// open / assigned / in_progress / resolved / closed。
// 此前这里是 submitted/accepted（后端不存在这两个值），导致新建工单（后端默认 open）
// 在小程序里匹配不到任何状态 Tab，且 Tab 计数恒为 0。
export type MaintenanceStatus = 'open' | 'assigned' | 'in_progress' | 'resolved' | 'closed'
export type MaintenancePriority = 'low' | 'medium' | 'high' | 'urgent'

export interface MaintenanceTicket {
  id: number
  propertyId: number
  tenantId: number
  title: string
  description: string
  status: MaintenanceStatus
  priority: MaintenancePriority
  createdAt: string
  updatedAt?: string
}

// ============ 通知相关 ============
export type NotificationType = 'payment' | 'lease' | 'maintenance' | 'system'

export interface Notification {
  id: number
  userId: number
  type: NotificationType
  title: string
  content: string
  read: boolean
  createdAt: string
}

// ============ 服务相关 ============
export interface ServiceItem {
  id: number
  name: string
  description: string
  price: number
  icon?: string
}

// ============ 收入汇总 ============
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
