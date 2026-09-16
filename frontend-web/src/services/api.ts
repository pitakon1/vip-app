import api from '@/lib/api'

/**
 * 查询串参数：只透传给 axios，不做业务校验。
 * 保留标量联合而不是 `Record<string, any>`，避免把 any 继续扩散到调用方。
 */
export type QueryParams = Record<string, string | number | boolean | undefined | null>

/** 请求体：形状由各接口自己的 Pydantic 模型保证，封装层不猜，故用 unknown。 */
export type RequestBody = unknown

// Auth
export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', `username=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }),
  register: (data: RequestBody) => api.post('/auth/register', data),
  me: () => api.get('/auth/me'),
}

// Dashboard
export const dashboardApi = {
  summary: () => api.get('/dashboard/summary'),
  recentPayments: () => api.get('/dashboard/recent-payments'),
  expiringLeases: () => api.get('/dashboard/expiring-leases'),
  propertyStatus: () => api.get('/dashboard/property-status-distribution'),
}

// Properties
export const propertiesApi = {
  list: (params?: QueryParams) => api.get('/properties', { params }),
  get: (id: string) => api.get(`/properties/${id}`),
  create: (data: RequestBody) => api.post('/properties', data),
  update: (id: string, data: RequestBody) => api.patch(`/properties/${id}`, data),
  delete: (id: string) => api.delete(`/properties/${id}`),
}

// Leases
export const leasesApi = {
  list: (params?: QueryParams) => api.get('/leases', { params }),
  get: (id: string) => api.get(`/leases/${id}`),
  create: (data: RequestBody) => api.post('/leases', data),
  renew: (id: string, data: RequestBody) => api.post(`/leases/${id}/renew`, data),
  terminate: (id: string, data: RequestBody) =>
    api.post(`/leases/${id}/terminate`, data),
}

// CRM / Leads
export const leadsApi = {
  list: (params?: QueryParams) => api.get('/leads', { params }),
  get: (id: string) => api.get(`/leads/${id}`),
  create: (data: RequestBody) => api.post('/leads', data),
  update: (id: string, data: RequestBody) => api.patch(`/leads/${id}`, data),
}

// Payments
export const paymentsApi = {
  list: (params?: QueryParams) => api.get('/payments', { params }),
  get: (id: string) => api.get(`/payments/${id}`),
  refund: (id: string, reason: string) =>
    api.post(`/payments/${id}/refund`, { reason }),
  // 减免逾期滞纳金；amount 不传表示全额减免剩余部分
  waiveLateFee: (id: string, amount: number | null, reason: string) =>
    api.post(`/payments/${id}/late-fee/waive`, { amount: amount ?? undefined, reason }),
}

// Projects
export const projectsApi = {
  list: (params?: QueryParams) => api.get('/projects', { params }),
  get: (id: string) => api.get(`/projects/${id}`),
  create: (data: RequestBody) => api.post('/projects', data),
  update: (id: string, data: RequestBody) => api.patch(`/projects/${id}`, data),
  // 用项目名称/地址调用后端地理编码，回填 lat/lng（用于地图找房）
  geocode: (id: string) => api.post(`/projects/${id}/geocode`),
}

// Documents
export const documentsApi = {
  list: (params?: QueryParams) => api.get('/documents', { params }),
  get: (id: string) => api.get(`/documents/${id}`),
}

// Service Orders
export const serviceOrdersApi = {
  list: (params?: QueryParams) => api.get('/service-orders', { params }),
  create: (data: RequestBody) => api.post('/service-orders', data),
  updateStatus: (id: string, status: string) =>
    api.patch(`/service-orders/${id}/status`, { status }),
}

// Maintenance
export const maintenanceApi = {
  list: (params?: QueryParams) => api.get('/maintenance-tickets', { params }),
  create: (data: RequestBody) => api.post('/maintenance-tickets', data),
  update: (id: string, data: RequestBody) =>
    api.patch(`/maintenance-tickets/${id}`, data),
}

// Employees
export const employeesApi = {
  list: (params?: QueryParams) => api.get('/employees', { params }),
  // 同事通讯录（全体员工可见，仅协作联系方式）
  directory: (params?: QueryParams) => api.get('/employees/directory', { params }),
  me: () => api.get('/employees/me'),
  leaderboard: () => api.get('/employees/leaderboard'),
  workbench: () => api.get('/employees/workbench'),
}

// 业主端：房源营销 / 定价建议 / 年度财务导出
export const ownersApi = {
  marketing: () => api.get('/owners/me/marketing'),
  pricingSuggestion: () => api.get('/owners/me/pricing-suggestion'),
  annualFinancialSummary: (year?: number) =>
    api.get('/owners/me/annual-financial-summary', { params: { year } }),
}

// Company
export const companyApi = {
  info: () => api.get('/company/info'),
  update: (data: RequestBody) => api.put('/company/info', data),
}

// Notifications
export const notificationsApi = {
  mine: (params?: QueryParams) => api.get('/notifications/me', { params }),
  read: (id: string) => api.patch(`/notifications/${id}/read`),
  readAll: () => api.post('/notifications/read-all'),
}

// ===== v1.8 新增 7 项增强特性 =====

// 1. 即时聊天
export const chatApi = {
  conversations: (params?: QueryParams) => api.get('/chat/conversations', { params }),
  createConversation: (data: RequestBody) => api.post('/chat/conversations', data),
  messages: (id: string, params?: QueryParams) =>
    api.get(`/chat/conversations/${id}/messages`, { params }),
  sendMessage: (id: string, data: RequestBody) =>
    api.post(`/chat/conversations/${id}/messages`, data),
  wsUrl: (id: string) => {
    const token = localStorage.getItem('token') || ''
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    return `${proto}://${window.location.host}/api/v1/chat/ws/chat/${id}?token=${token}`
  },
}

// 2. 电子签合同
export const contractsApi = {
  list: (params?: QueryParams) => api.get('/contracts', { params }),
  get: (id: string) => api.get(`/contracts/${id}`),
  generate: (data: RequestBody) => api.post('/contracts/generate', data),
  addParty: (id: string, data: RequestBody) => api.post(`/contracts/${id}/parties`, data),
  sign: (id: string, partyId: string) =>
    api.post(`/contracts/${id}/sign`, { party_id: partyId }),
}

// 3. AI 应用接口预留
export const aiApi = {
  health: () => api.get('/ai/health'),
  chat: (messages: unknown[]) => api.post('/ai/chat', { messages }),
}

// 4. 数据备份/每日同步
export const backupApi = {
  run: () => api.post('/backup/run'),
  jobs: (params?: QueryParams) => api.get('/backup/jobs', { params }),
}

// 5. 地图（Google Map）定位距离
export const geoApi = {
  geocode: (address: string) => api.post('/geo/geocode', { address }),
  reverse: (lat: number, lng: number) => api.post('/geo/reverse', { lat, lng }),
  distance: (from: unknown, to: unknown) => api.post('/geo/distance', { from, to }),
  attendance: (lat: number, lng: number) => api.post('/geo/attendance', { lat, lng }),
}

// 6. 多语言翻译（Google 翻译按钮）
export const translateApi = {
  translate: (text: string, target: string, source?: string) =>
    api.post('/translate', { text, target, source }),
  bulk: (keyed_texts: Record<string, string>, target: string, source?: string) =>
    api.post('/translate/bulk', { keyed_texts, target, source }),
}

// 7. GPS 考勤（500KM 半径 + 外勤申请）
// ===== 管理端 v1.9 新增：审计 / 看房 / 对账 / 趋势 / 佣金规则 =====

// 审计日志
export const auditLogsApi = {
  list: (params?: QueryParams) => api.get('/audit-logs', { params }),
  summary: () => api.get('/audit-logs/summary'),
}

// 预约看房管理
export const viewingsApi = {
  list: (params?: QueryParams) => api.get('/viewings', { params }),
  updateStatus: (id: string, status: string) =>
    api.patch(`/viewings/${id}`, { status }),
}

// 财务对账 + 运营趋势
export const financialApi = {
  reconciliation: () => api.get('/dashboard/financial-reconciliation'),
  trend: (params?: QueryParams) => api.get('/dashboard/trend', { params }),
}

// 佣金规则配置
export const commissionRulesApi = {
  list: (params?: QueryParams) => api.get('/commission-rules', { params }),
  create: (data: RequestBody) => api.post('/commission-rules', data),
  update: (id: string, data: RequestBody) => api.patch(`/commission-rules/${id}`, data),
  delete: (id: string) => api.delete(`/commission-rules/${id}`),
}

// 7. GPS 考勤（500KM 半径 + 外勤申请）
export const attendanceApi = {
  checkIn: (data: RequestBody) => api.post('/attendance/check-in', data),
  checkOut: (data: RequestBody) => api.post('/attendance/check-out', data),
  today: () => api.get('/attendance/today'),
  // 我的考勤记录（倒序全量，前端按需截取/按月聚合）
  me: () => api.get('/attendance/me'),
  externalTrips: (params?: QueryParams) => api.get('/attendance/external-trips', { params }),
  createExternalTrip: (data: RequestBody) => api.post('/attendance/external-trips', data),
  approveExternalTrip: (id: string) =>
    api.post(`/attendance/external-trips/${id}/approve`),
}

// ===== 四大战略维度（买卖交易 / 分销体系 / 多国市场 / 数据决策）=====

// 1. 买卖交易闭环：售房/求购挂牌
export const saleListingApi = {
  list: (params?: QueryParams) => api.get('/sale-listings', { params }),
  get: (id: string) => api.get(`/sale-listings/${id}`),
  create: (data: RequestBody) => api.post('/sale-listings', data),
  update: (id: string, data: RequestBody) => api.patch(`/sale-listings/${id}`, data),
  updateStatus: (id: string, status: string) =>
    api.post(`/sale-listings/${id}/status`, null, { params: { status } }),
  valuations: (id: string) => api.get(`/sale-listings/${id}/valuations`),
  addValuation: (id: string, data: RequestBody) =>
    api.post(`/sale-listings/${id}/valuations`, data),
}

// 2. 买卖交易闭环：产权成交 + 定金托管 + 按揭
export const propertyDealApi = {
  list: (params?: QueryParams) => api.get('/property-deals', { params }),
  get: (id: string) => api.get(`/property-deals/${id}`),
  create: (data: RequestBody) => api.post('/property-deals', data),
  updateStatus: (id: string, status: string) =>
    api.patch(`/property-deals/${id}/status`, null, { params: { status } }),
  createEscrow: (data: RequestBody) => api.post('/property-deals/escrows', data),
  listEscrows: (dealId: string) =>
    api.get(`/property-deals/escrows/${dealId}`),
  releaseEscrow: (id: string) =>
    api.post(`/property-deals/escrows/${id}/release`),
  refundEscrow: (id: string) =>
    api.post(`/property-deals/escrows/${id}/refund`),
  createMortgage: (data: RequestBody) => api.post('/property-deals/mortgages', data),
  myMortgages: () => api.get('/property-deals/mortgages/mine'),
  updateMortgageStatus: (id: string, status: string) =>
    api.patch(`/property-deals/mortgages/${id}/status`, null, {
      params: { status },
    }),
}

// 3. 分销体系
export const brokerApi = {
  list: (params?: QueryParams) => api.get('/brokers', { params }),
  me: () => api.get('/brokers/me'),
  create: (data: RequestBody) => api.post('/brokers', data),
  approve: (id: string, data: RequestBody) => api.post(`/brokers/${id}/approve`, data),
  suspend: (id: string) => api.post(`/brokers/${id}/suspend`),
  invite: (code: string) => api.get(`/brokers/invite/${code}`),
  createReferral: (params: QueryParams) =>
    api.post('/brokers/referrals', null, { params }),
  myReferrals: () => api.get('/brokers/referrals/mine'),
  createSplitDeal: (data: { participants?: unknown[]; [key: string]: unknown }) => {
    const { participants, ...rest } = data
    // FastAPI 以 list 查询参数接收参与人，序列化为 JSON 字符串
    return api.post('/brokers/split-deals', null, {
      params: { ...rest, participants: JSON.stringify(participants || []) },
    })
  },
}

// 4. 多国市场
export const marketApi = {
  list: (params?: QueryParams) => api.get('/markets', { params }),
  create: (data: RequestBody) => api.post('/markets', data),
  channels: (market_code?: string) =>
    api.get('/markets/channels', { params: { market_code } }),
  createChannel: (data: RequestBody) => api.post('/markets/channels', data),
  compliance: (market_code?: string) =>
    api.get('/markets/compliance', { params: { market_code } }),
  createCompliance: (data: RequestBody) => api.post('/markets/compliance', data),
}

// 5. 数据决策（市场指数 / 报告 / 匹配评分 / 流失预警）
export const marketDataApi = {
  indices: (params?: QueryParams) => api.get('/market-data/indices', { params }),
  createIndex: (data: RequestBody) => api.post('/market-data/indices', data),
  reports: (params?: QueryParams) => api.get('/market-data/reports', { params }),
  createReport: (data: RequestBody) => api.post('/market-data/reports', data),
  computeMatches: (params: QueryParams) =>
    api.post('/market-data/matches/compute', null, { params }),
  listMatches: (params?: QueryParams) => api.get('/market-data/matches', { params }),
  // 把匹配结果推送给租客（user_id 缺省时用匹配记录上的接收人，重复推送幂等）
  notifyMatch: (id: string, data?: RequestBody) =>
    api.post(`/market-data/matches/${id}/notify`, data ?? {}),
  churnSignals: (params?: QueryParams) =>
    api.get('/market-data/churn-signals', { params }),
  createChurnSignal: (params: QueryParams) =>
    api.post('/market-data/churn-signals', null, { params }),
  // 把流失预警派发给员工跟进（assignee_id 缺省时取租约负责员工）
  assignChurnSignal: (id: string, data?: RequestBody) =>
    api.post(`/market-data/churn-signals/${id}/assign`, data ?? {}),
  resolveChurnSignal: (id: string) =>
    api.post(`/market-data/churn-signals/${id}/resolve`),
}
