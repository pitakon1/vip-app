export type DealType = 'new_rental' | 'renewal' | 'management'
export type Scope = 'all_employees' | 'by_department' | 'by_employee' | 'by_broker' | 'by_partner'

// 分佣拆分规则（对应后端 /commission-split-rules）
export type SplitRole = 'listing_agent' | 'client_agent' | 'handler' | 'partner_company' | 'platform'
export type SplitScope = 'all' | 'by_partner'

export interface SplitRule {
  id: string
  deal_type: DealType
  role: SplitRole
  percent: number
  scope: SplitScope
  partner_id?: string
  is_active: boolean
  effective_from?: string
  effective_to?: string
  created_at?: string
}

export interface SplitForm {
  deal_type: DealType
  role: SplitRole
  percent: number
  scope: SplitScope
  partner_id: string
  is_active: boolean
  effective_from?: string
  effective_to?: string
}

export interface CommissionRule {
  id: string
  name: string
  deal_type: DealType
  rate: number
  scope: Scope
  department?: string
  employee_id?: string
  employee_name?: string
  broker_id?: string
  broker_name?: string
  partner_id?: string
  partner_name?: string
  cap_amount?: number
  minimum_amount?: number
  description?: string
  is_active: boolean
}

export interface FormState {
  name: string
  deal_type: DealType
  rate: string
  scope: Scope | 'broker_employee'
  department: string
  employee_id: string
  broker_id: string
  partner_id: string
  broker_employee_id: string
  cap_amount: string
  minimum_amount: string
  description: string
  is_active: boolean
}

export interface Employee {
  id: string
  full_name: string
  department: string
  broker_id?: string
}

export interface Broker {
  id: string
  partner_name: string
}

export interface DropOpt {
  value: string
  label: string
}
