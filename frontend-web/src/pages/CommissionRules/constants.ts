import type { FormState } from './types'

// 佣金角色文案
export const ROLE_LABELS: Record<string, string> = {
  listing_agent: 'commissionSplit.role.listingAgent',
  client_agent: 'commissionSplit.role.clientAgent',
  handler: 'commissionSplit.role.handler',
  partner_company: 'commissionSplit.role.partnerCompany',
  platform: 'commissionSplit.role.platform',
}
export const SCOPE_LABELS: Record<string, string> = {
  all: 'commissionSplit.scope.all',
  by_partner: 'commissionSplit.scope.byPartner',
}

// 适用对象层级：管理员可配置全部；分销商管理员仅本渠道及本渠道员工
export const emptyForm = (): FormState => ({
  name: '',
  deal_type: 'new_rental',
  rate: '',
  scope: 'all_employees',
  department: '',
  employee_id: '',
  broker_id: '',
  partner_id: '',
  broker_employee_id: '',
  cap_amount: '',
  minimum_amount: '',
  description: '',
  is_active: true,
})
