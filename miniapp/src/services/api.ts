import { request } from '@/lib/api'

export const authApi = {
  login: (email: string, password: string) =>
    request({
      url: '/auth/login',
      method: 'POST',
      // 后端 login 使用 OAuth2PasswordRequestForm（表单格式），需 username/password
      data: `username=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`,
      header: { 'Content-Type': 'application/x-www-form-urlencoded' }
    }),
  register: (data: any) => request({ url: '/auth/register', method: 'POST', data }),
  me: () => request({ url: '/auth/me', method: 'GET' })
}

export const propertiesApi = {
  list: (params?: any) => request({ url: '/properties', method: 'GET', data: params })
}

// 公司信息（公开接口）：仅取真实版本号供「我的 - 关于」展示，避免写死版本
export const companyApi = {
  info: () => request({ url: '/company/info', method: 'GET' })
}

// ============ 客户线索（CRM）============
export const leadsApi = {
  list: (params?: any) => request({ url: '/leads', method: 'GET', data: params }),
  updateStatus: (id: string, data: any) => request({ url: `/leads/${id}`, method: 'PATCH', data })
}

export const leasesApi = {
  list: (params?: any) => request({ url: '/leases', method: 'GET', data: params }),
  mine: () => request({ url: '/leases/me', method: 'GET' }),
  renew: (id: string, data: any) =>
    request({ url: `/leases/${id}/renew`, method: 'POST', data })
}

export const paymentsApi = {
  mine: () => request({ url: '/payments/me', method: 'GET' }),
  // 收款列表（员工日历页取租金到期用，支持 status/payment_type/lease_id 等筛选）
  list: (params?: any) => request({ url: `/payments${qs(params)}`, method: 'GET' }),
  pay: (id: string, data: any) => request({ url: `/payments/${id}/pay`, method: 'POST', data }),
  receipt: (id: string) => request({ url: `/payments/${id}/receipt`, method: 'GET' }),
  invoice: (id: string) => request({ url: `/payments/${id}/invoice`, method: 'GET' })
}

export const viewingsApi = {
  create: (data: any) => request({ url: '/viewings', method: 'POST', data }),
  mine: () => request({ url: '/viewings/mine', method: 'GET' }),
  list: (params?: any) => request({ url: '/viewings', method: 'GET', data: params }),
  updateStatus: (id: string, data: any) => request({ url: `/viewings/${id}`, method: 'PATCH', data })
}

export const documentsApi = {
  list: (params?: any) => request({ url: '/documents', method: 'GET', data: params })
}

export const serviceOrdersApi = {
  list: (params?: any) => request({ url: '/service-orders', method: 'GET', data: params }),
  create: (data: any) => request({ url: '/service-orders', method: 'POST', data })
}

export const maintenanceApi = {
  list: (params?: any) => request({ url: '/maintenance-tickets', method: 'GET', data: params }),
  create: (data: any) => request({ url: '/maintenance-tickets', method: 'POST', data }),
  rate: (id: string, data: { rating: number; feedback?: string }) =>
    request({ url: `/maintenance-tickets/${id}/rate`, method: 'POST', data })
}

// ============ 收藏 ============
export const favoritesApi = {
  list: (params?: any) => request({ url: '/favorites', method: 'GET', data: params }),
  status: (propertyId: string) =>
    request({ url: `/favorites/status/${propertyId}`, method: 'GET' }),
  add: (propertyId: string) =>
    request({ url: '/favorites', method: 'POST', data: { property_id: propertyId } }),
  remove: (propertyId: string) =>
    request({ url: `/favorites/${propertyId}`, method: 'DELETE' })
}

export const notificationsApi = {
  mine: () => request({ url: '/notifications/me', method: 'GET' }),
  readAll: () => request({ url: '/notifications/read-all', method: 'POST' })
}

export const ownerApi = {
  properties: () => request({ url: '/owners/me/properties', method: 'GET' }),
  income: () => request({ url: '/owners/me/income', method: 'GET' }),
  marketing: () => request({ url: '/owners/me/marketing', method: 'GET' }),
  pricingSuggestion: () => request({ url: '/owners/me/pricing-suggestion', method: 'GET' }),
  annualFinancialSummary: (year?: number) =>
    request({ url: '/owners/me/annual-financial-summary', method: 'GET', data: { year } })
}

// 员工端：工作台（含租约临期 SLA 跟进）与同事通讯录
export const employeesApi = {
  me: () => request({ url: '/employees/me', method: 'GET' }),
  leaderboard: () => request({ url: '/employees/leaderboard', method: 'GET' }),
  workbench: () => request({ url: '/employees/workbench', method: 'GET' }),
  list: (params?: any) => request({ url: '/employees', method: 'GET', data: params })
}

// 管理端：运营概览 / 财务对账 / 运营趋势
export const dashboardApi = {
  summary: () => request({ url: '/dashboard/summary', method: 'GET' }),
  recentPayments: () => request({ url: '/dashboard/recent-payments', method: 'GET' }),
  expiringLeases: () => request({ url: '/dashboard/expiring-leases', method: 'GET' }),
  propertyStatusDistribution: () => request({ url: '/dashboard/property-status-distribution', method: 'GET' }),
  financialReconciliation: () => request({ url: '/dashboard/financial-reconciliation', method: 'GET' }),
  trend: (params?: any) => request({ url: '/dashboard/trend', method: 'GET', data: params })
}

// 管理端：审计日志
export const auditApi = {
  list: (params?: any) => request({ url: '/audit-logs', method: 'GET', data: params }),
  summary: () => request({ url: '/audit-logs/summary', method: 'GET' })
}

// 管理端：佣金规则配置
export const commissionRulesApi = {
  list: (params?: any) => request({ url: '/commission-rules', method: 'GET', data: params }),
  create: (data: any) => request({ url: '/commission-rules', method: 'POST', data }),
  update: (id: string, data: any) =>
    request({ url: `/commission-rules/${id}`, method: 'PATCH', data }),
  remove: (id: string) => request({ url: `/commission-rules/${id}`, method: 'DELETE' })
}

// v1.8 新增增强接口
export const attendanceApi = {
  checkIn: (data: any) => request({ url: '/attendance/check-in', method: 'POST', data }),
  checkOut: (data: any) => request({ url: '/attendance/check-out', method: 'POST', data }),
  today: () => request({ url: '/attendance/today', method: 'GET' }),
  // 我的考勤明细（按日期倒序），用于本月统计与考勤记录列表
  myAttendance: (params?: any) => request({ url: `/attendance/me${qs(params)}`, method: 'GET' }),
  // 500KM 外需填外勤申请
  externalTrips: (params?: any) => request({ url: '/attendance/external-trips', method: 'GET', data: params }),
  createExternalTrip: (data: any) => request({ url: '/attendance/external-trips', method: 'POST', data }),
  approveExternalTrip: (id: string) => request({ url: `/attendance/external-trips/${id}/approve`, method: 'POST' })
}

export const chatApi = {
  conversations: (params?: any) => request({ url: '/chat/conversations', method: 'GET', data: params }),
  createConversation: (data: any) => request({ url: '/chat/conversations', method: 'POST', data }),
  messages: (id: string, params?: any) =>
    request({ url: `/chat/conversations/${id}/messages`, method: 'GET', data: params }),
  sendMessage: (id: string, data: any) =>
    request({ url: `/chat/conversations/${id}/messages`, method: 'POST', data })
}

export const contractsApi = {
  list: (params?: any) => request({ url: '/contracts', method: 'GET', data: params }),
  get: (id: string) => request({ url: `/contracts/${id}`, method: 'GET' }),
  generate: (data: any) => request({ url: '/contracts/generate', method: 'POST', data }),
  addParty: (id: string, data: any) => request({ url: `/contracts/${id}/parties`, method: 'POST', data }),
  sign: (id: string, partyId: string) =>
    request({ url: `/contracts/${id}/sign`, method: 'POST', data: { party_id: partyId } })
}

export const aiApi = {
  health: () => request({ url: '/ai/health', method: 'GET' }),
  chat: (messages: any[]) => request({ url: '/ai/chat', method: 'POST', data: { messages } })
}

export const backupApi = {
  run: () => request({ url: '/backup/run', method: 'POST' }),
  jobs: (params?: any) => request({ url: '/backup/jobs', method: 'GET', data: params })
}

export const geoApi = {
  geocode: (address: string) => request({ url: '/geo/geocode', method: 'POST', data: { address } }),
  reverse: (lat: number, lng: number) => request({ url: '/geo/reverse', method: 'POST', data: { lat, lng } }),
  distance: (from: any, to: any) => request({ url: '/geo/distance', method: 'POST', data: { from, to } }),
  attendance: (lat: number, lng: number) => request({ url: '/geo/attendance', method: 'POST', data: { lat, lng } })
}

export const translateApi = {
  translate: (text: string, target: string, source?: string) =>
    request({ url: '/translate', method: 'POST', data: { text, target, source } })
}

// 查询参数拼接（FastAPI Query 接口需拼进 URL）
const qs = (params?: any) => {
  if (!params) return ''
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
  return parts.length ? `?${parts.join('&')}` : ''
}

// ============ 员工业绩与佣金 ============
// 业绩：本月汇总 / 历史月度 / 排行榜
export const performanceApi = {
  me: (params?: any) => request({ url: `/performance/me${qs(params)}`, method: 'GET' }),
  leaderboard: (params?: any) => request({ url: `/performance/leaderboard${qs(params)}`, method: 'GET' })
}

// 我的佣金结算明细
export const commissionsApi = {
  mine: (params?: any) => request({ url: `/commissions/me${qs(params)}`, method: 'GET' })
}

// ============ 买卖交易闭环（挂牌 / 成交 / 托管 / 按揭） ============
export const saleListingApi = {
  list: (params?: any) => request({ url: `/sale-listings${qs(params)}`, method: 'GET' }),
  create: (data: any) => request({ url: '/sale-listings', method: 'POST', data }),
  updateStatus: (id: string, status: string) =>
    request({ url: `/sale-listings/${id}/status${qs({ status })}`, method: 'POST' }),
  valuations: (id: string) => request({ url: `/sale-listings/${id}/valuations`, method: 'GET' })
}

export const propertyDealApi = {
  list: (params?: any) => request({ url: `/property-deals${qs(params)}`, method: 'GET' }),
  create: (data: any) => request({ url: '/property-deals', method: 'POST', data }),
  updateStatus: (id: string, status: string) =>
    request({ url: `/property-deals/${id}/status${qs({ status })}`, method: 'PATCH' }),
  createEscrow: (data: any) => request({ url: '/property-deals/escrows', method: 'POST', data }),
  listEscrows: (dealId: string) => request({ url: `/property-deals/escrows/${dealId}`, method: 'GET' }),
  releaseEscrow: (id: string) => request({ url: `/property-deals/escrows/${id}/release`, method: 'POST' }),
  refundEscrow: (id: string) => request({ url: `/property-deals/escrows/${id}/refund`, method: 'POST' }),
  createMortgage: (data: any) => request({ url: '/property-deals/mortgages', method: 'POST', data }),
  myMortgages: () => request({ url: '/property-deals/mortgages/mine', method: 'GET' })
}

// ============ 分销体系（渠道商 / 转介绍 / 联合单分成） ============
export const brokerApi = {
  list: (params?: any) => request({ url: `/brokers${qs(params)}`, method: 'GET' }),
  me: () => request({ url: '/brokers/me', method: 'GET' }),
  create: (data: any) => request({ url: '/brokers', method: 'POST', data }),
  approve: (id: string, data: any) => request({ url: `/brokers/${id}/approve`, method: 'POST', data }),
  suspend: (id: string) => request({ url: `/brokers/${id}/suspend`, method: 'POST' }),
  createReferral: (params: any) => request({ url: `/brokers/referrals${qs(params)}`, method: 'POST' }),
  myReferrals: () => request({ url: '/brokers/referrals/mine', method: 'GET' }),
  createSplitDeal: (data: any) => {
    const { participants, ...rest } = data
    const p = { ...rest, participants: JSON.stringify(participants || []) }
    return request({ url: `/brokers/split-deals${qs(p)}`, method: 'POST' })
  }
}

// ============ 多国市场配置 ============
export const marketApi = {
  list: (params?: any) => request({ url: `/markets${qs(params)}`, method: 'GET' }),
  create: (data: any) => request({ url: '/markets', method: 'POST', data }),
  channels: (market_code?: string) =>
    request({ url: `/markets/channels${qs({ market_code })}`, method: 'GET' }),
  createChannel: (data: any) => request({ url: '/markets/channels', method: 'POST', data }),
  compliance: (market_code?: string) =>
    request({ url: `/markets/compliance${qs({ market_code })}`, method: 'GET' }),
  createCompliance: (data: any) => request({ url: '/markets/compliance', method: 'POST', data })
}

// ============ 数据决策（指数 / 报告 / 匹配 / 流失预警） ============
export const marketDataApi = {
  indices: (params?: any) => request({ url: `/market-data/indices${qs(params)}`, method: 'GET' }),
  reports: (params?: any) => request({ url: `/market-data/reports${qs(params)}`, method: 'GET' }),
  computeMatches: (params: any) => request({ url: `/market-data/matches/compute${qs(params)}`, method: 'POST' }),
  listMatches: (params?: any) => request({ url: `/market-data/matches${qs(params)}`, method: 'GET' }),
  notifyMatch: (id: string, data?: any) => request({ url: `/market-data/matches/${id}/notify`, method: 'POST', data: data ?? {} }),
  churnSignals: (params?: any) => request({ url: `/market-data/churn-signals${qs(params)}`, method: 'GET' }),
  createChurnSignal: (params: any) => request({ url: `/market-data/churn-signals${qs(params)}`, method: 'POST' }),
  assignChurnSignal: (id: string, data?: any) => request({ url: `/market-data/churn-signals/${id}/assign`, method: 'POST', data: data ?? {} }),
  resolveChurnSignal: (id: string) => request({ url: `/market-data/churn-signals/${id}/resolve`, method: 'POST' })
}

export default {
  authApi,
  propertiesApi,
  companyApi,
  leadsApi,
  leasesApi,
  paymentsApi,
  documentsApi,
  serviceOrdersApi,
  maintenanceApi,
  favoritesApi,
  notificationsApi,
  ownerApi,
  attendanceApi,
  performanceApi,
  commissionsApi,
  chatApi,
  contractsApi,
  aiApi,
  backupApi,
  geoApi,
  translateApi,
  viewingsApi,
  employeesApi,
  dashboardApi,
  auditApi,
  commissionRulesApi,
  saleListingApi,
  propertyDealApi,
  brokerApi,
  marketApi,
  marketDataApi
}
