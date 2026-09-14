import api from '@/lib/api';

export const authApi = {
  // 后端 login 使用 OAuth2PasswordRequestForm（表单格式），与 Web 端保持一致
  login: (email: string, password: string) =>
    api.post('/auth/login', `username=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }),
  register: (data: any) => api.post('/auth/register', data),
  me: () => api.get('/auth/me'),
};

export const propertiesApi = {
  list: (params?: any) => api.get('/properties', { params }),
  get: (id: string) => api.get(`/properties/${id}`),
};

export const projectsApi = {
  list: (params?: any) => api.get('/projects', { params }),
};

export const leasesApi = {
  list: (params?: any) => api.get('/leases', { params }),
  mine: () => api.get('/leases/me'),
  get: (id: string) => api.get(`/leases/${id}`),
  renew: (id: string, data: any) => api.post(`/leases/${id}/renew`, data),
  terminate: (id: string, data: any) => api.post(`/leases/${id}/terminate`, data),
  // 退租押金结算
  depositSettlement: (id: string, data: any) =>
    api.post(`/leases/${id}/deposit-settlement`, data),
};

export const paymentsApi = {
  list: (params?: any) => api.get('/payments', { params }),
  mine: () => api.get('/payments/me'),
  pay: (id: string, channel: string) => api.post(`/payments/${id}/pay`, { channel }),
  receipt: (id: string) => api.get(`/payments/${id}/receipt`),
  invoice: (id: string) => api.get(`/payments/${id}/invoice`),
};

// 管理端：运营概览 / 财务对账 / 运营趋势
export const dashboardApi = {
  summary: () => api.get('/dashboard/summary'),
  expiringLeases: () => api.get('/dashboard/expiring-leases'),
  financialReconciliation: () => api.get('/dashboard/financial-reconciliation'),
  trend: (params?: any) => api.get('/dashboard/trend', { params }),
};

// 管理端：审计日志
export const auditApi = {
  list: (params?: any) => api.get('/audit-logs', { params }),
  summary: () => api.get('/audit-logs/summary'),
};

// 管理端：佣金规则配置
export const commissionRulesApi = {
  list: (params?: any) => api.get('/commission-rules', { params }),
  create: (data: any) => api.post('/commission-rules', data),
  update: (id: string, data: any) => api.patch(`/commission-rules/${id}`, data),
  remove: (id: string) => api.delete(`/commission-rules/${id}`),
};

// 收藏
export const favoritesApi = {
  mine: (params?: any) => api.get('/favorites', { params }),
  toggle: (propertyId: string) =>
    api.post('/favorites', { property_id: propertyId }),
  remove: (propertyId: string) =>
    api.delete(`/favorites/${propertyId}`),
  status: (propertyId: string) =>
    api.get(`/favorites/status/${propertyId}`),
};

// v1.9 预约看房
export const viewingsApi = {
  create: (data: any) => api.post('/viewings', data),
  mine: () => api.get('/viewings/mine'),
  list: (params?: any) => api.get('/viewings', { params }),
  updateStatus: (id: string, data: any) =>
    api.patch(`/viewings/${id}`, data),
};

export const documentsApi = {
  list: (params?: any) => api.get('/documents', { params }),
};

export const serviceOrdersApi = {
  list: (params?: any) => api.get('/service-orders', { params }),
  create: (data: any) => api.post('/service-orders', data),
};

export const maintenanceApi = {
  list: (params?: any) => api.get('/maintenance-tickets', { params }),
  create: (data: any) => api.post('/maintenance-tickets', data),
  rate: (id: string, data: any) =>
    api.post(`/maintenance-tickets/${id}/rate`, data),
};

export const notificationsApi = {
  mine: () => api.get('/notifications/me'),
  readAll: () => api.post('/notifications/read-all'),
};

export const ownerApi = {
  properties: () => api.get('/owners/me/properties'),
  income: () => api.get('/owners/me/income'),
};

// v1.9 房东工作台
export const ownersApi = {
  marketing: () => api.get('/owners/me/marketing', { params: { page: 1, limit: 100 } }),
  pricingSuggestion: () => api.get('/owners/me/pricing-suggestion'),
  annualSummary: (year?: number) =>
    api.get('/owners/me/annual-financial-summary', {
      params: year ? { year } : {},
    }),
};

export const tenantApi = {
  me: () => api.get('/tenants/me'),
};

export const attendanceApi = {
  checkIn: (data: any) => api.post('/attendance/check-in', data),
  checkOut: (data: any) => api.post('/attendance/check-out', data),
  today: () => api.get('/attendance/today'),
  // v1.8：超出打卡半径需填外勤申请
  externalTrips: (params?: any) => api.get('/attendance/external-trips', { params }),
  createExternalTrip: (data: any) => api.post('/attendance/external-trips', data),
  approveExternalTrip: (id: string) => api.post(`/attendance/external-trips/${id}/approve`),
};

export const employeesApi = {
  mine: () => api.get('/employees/me'),
  leaderboard: () => api.get('/employees/leaderboard'),
  workbench: () => api.get('/employees/workbench'),
};

export const performanceApi = {
  mine: () => api.get('/performance/me'),
};

// v1.8 新增增强接口
export const chatApi = {
  conversations: (params?: any) => api.get('/chat/conversations', { params }),
  createConversation: (data: any) => api.post('/chat/conversations', data),
  messages: (id: string, params?: any) => api.get(`/chat/conversations/${id}/messages`, { params }),
  sendMessage: (id: string, data: any) => api.post(`/chat/conversations/${id}/messages`, data),
};

export const contractsApi = {
  list: (params?: any) => api.get('/contracts', { params }),
  get: (id: string) => api.get(`/contracts/${id}`),
  generate: (data: any) => api.post('/contracts/generate', data),
  addParty: (id: string, data: any) => api.post(`/contracts/${id}/parties`, data),
  sign: (id: string, partyId: string) => api.post(`/contracts/${id}/sign`, { party_id: partyId }),
};

export const aiApi = {
  health: () => api.get('/ai/health'),
  chat: (messages: any[]) => api.post('/ai/chat', { messages }),
};

export const backupApi = {
  run: () => api.post('/backup/run'),
  jobs: (params?: any) => api.get('/backup/jobs', { params }),
};

export const geoApi = {
  geocode: (address: string) => api.post('/geo/geocode', { address }),
  reverse: (lat: number, lng: number) => api.post('/geo/reverse', { lat, lng }),
  distance: (from: any, to: any) => api.post('/geo/distance', { from, to }),
  attendance: (lat: number, lng: number) => api.post('/geo/attendance', { lat, lng }),
};

export const translateApi = {
  translate: (text: string, target: string, source?: string) =>
    api.post('/translate', { text, target, source }),
};

// —— 战略：买卖交易闭环 · 挂牌 ——
export const saleListingApi = {
  list: (params?: any) => api.get('/sale-listings', { params }),
  create: (data: any) => api.post('/sale-listings', data),
  update: (id: string, data: any) => api.patch(`/sale-listings/${id}`, data),
  changeStatus: (id: string, status: string) =>
    api.post(`/sale-listings/${id}/status`, null, { params: { status } }),
  // AVM 估价
  createValuation: (id: string, data: any) =>
    api.post(`/sale-listings/${id}/valuations`, data),
  valuations: (id: string) => api.get(`/sale-listings/${id}/valuations`),
};

// —— 战略：买卖交易闭环 · 成交/托管/按揭 ——
export const propertyDealApi = {
  list: (params?: any) => api.get('/property-deals', { params }),
  create: (data: any) => api.post('/property-deals', data),
  changeStatus: (id: string, status: string) =>
    api.post(`/property-deals/${id}/status`, null, { params: { status } }),
  // 定金(Iscrow)托管
  createEscrow: (data: any) => api.post('/property-deals/escrows', data),
  escrows: (dealId: string) => api.get(`/property-deals/escrows/${dealId}`),
  releaseEscrow: (id: string) => api.post(`/property-deals/escrows/${id}/release`),
  refundEscrow: (id: string) => api.post(`/property-deals/escrows/${id}/refund`),
  // 按揭
  createMortgage: (data: any) => api.post('/property-deals/mortgages', data),
  myMortgages: (params?: any) => api.get('/property-deals/mortgages/mine', { params }),
  updateMortgageStatus: (id: string, status: string) =>
    api.patch(`/property-deals/mortgages/${id}/status`, null, { params: { status } }),
};

// —— 战略：分销体系 ——
export const brokerApi = {
  list: (params?: any) => api.get('/brokers', { params }),
  create: (data: any) => api.post('/brokers', data),
  me: () => api.get('/brokers/me'),
  approve: (id: string, data: any) => api.post(`/brokers/${id}/approve`, data),
  suspend: (id: string) => api.post(`/brokers/${id}/suspend`),
  invite: (code: string) => api.get(`/brokers/invite/${code}`),
  // 转介绍
  createReferral: (params?: any) => api.post('/brokers/referrals', null, { params }),
  myReferrals: () => api.get('/brokers/referrals/mine'),
  // 联合单分成
  createSplitDeal: (data: any) => api.post('/brokers/split-deals', data),
};

// —— 战略：多国市场 ——
export const marketApi = {
  list: (params?: any) => api.get('/markets', { params }),
  create: (data: any) => api.post('/markets', data),
  channels: (marketCode?: string) =>
    api.get('/markets/channels', { params: marketCode ? { market_code: marketCode } : {} }),
  createChannel: (data: any) => api.post('/markets/channels', data),
  compliance: (marketCode?: string) =>
    api.get('/markets/compliance', { params: marketCode ? { market_code: marketCode } : {} }),
  createCompliance: (data: any) => api.post('/markets/compliance', data),
};

// —— 战略：数据决策 ——
export const marketDataApi = {
  indices: (params?: any) => api.get('/market-data/indices', { params }),
  createIndex: (data: any) => api.post('/market-data/indices', data),
  reports: (params?: any) => api.get('/market-data/reports', { params }),
  createReport: (data: any) => api.post('/market-data/reports', data),
  churnSignals: (params?: any) => api.get('/market-data/churn-signals', { params }),
  createChurnSignal: (data: any) => api.post('/market-data/churn-signals', data),
  resolveChurnSignal: (id: string) => api.post(`/market-data/churn-signals/${id}/resolve`),
};
