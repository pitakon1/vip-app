// 业绩类型文案与佣金构成配色
export const DEAL_LABELS: Record<string, string> = {
  new_rental: 'employeePerformance.dealNewRental',
  renewal: 'employeePerformance.dealRenewal',
  management: 'employeePerformance.dealManagement',
}

export const BREAKDOWN_COLORS = ['var(--rent-primary)', 'var(--state-info)', 'var(--state-warning)']

export const STATUS_LABELS: Record<string, { text: string; tone: string }> = {
  pending: { text: 'employeePerformance.stPending', tone: 'warning' },
  approved: { text: 'employeePerformance.stApproved', tone: 'info' },
  paid: { text: 'employeePerformance.stPaid', tone: 'success' },
}
