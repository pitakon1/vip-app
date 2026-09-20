import api, { API_BASE_URL } from '@/lib/api';
import { tokenStorage } from '@/lib/storage';

export const authApi = {
  // 后端 login 使用 OAuth2PasswordRequestForm（表单格式），与 Web 端保持一致
  login: (email: string, password: string) =>
    api.post('/auth/login', `username=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }),
  register: (data: any) => api.post('/auth/register', data),
  // 手机号/邮箱验证码：发送 OTP（dev/未配短信凭据时明文码在响应 dev_code 里）
  requestOtp: (recipient: string, channel: string) =>
    api.post('/auth/otp/request', { recipient, channel }),
  // 手机号+验证码登录
  loginByOtp: (phone: string, code: string) =>
    api.post('/auth/login/otp', { phone, code }),
  me: () => api.get('/auth/me'),
  // 「我的」账户/设置自助
  updateMe: (data: any) => api.patch('/auth/me', data),
  changePassword: (data: { old_password: string; new_password: string }) =>
    api.post('/auth/me/password', data),
  preferences: () => api.get('/auth/me/preferences'),
  updatePreferences: (data: any) => api.patch('/auth/me/preferences', data),
};

export const propertiesApi = {
  list: (params?: any) => api.get('/properties', { params }),
  get: (id: string) => api.get(`/properties/${id}`),
  // 房源编辑补全：PATCH /properties/{id}，接受普通编辑字段（如 monthly_rent、status 租态）。
  // 注意：已移除 listing_status 发布态，删除即下架。
  update: (id: string, data: any) => api.patch(`/properties/${id}`, data),
  // 照片上传/删除（multipart，后端先传后保存 url 列表到 photos）
  uploadPhotos: (id: string, files: any[]) => {
    const fd = new FormData()
    files.forEach((f) => fd.append('files', f as any))
    return api.post(`/properties/${id}/photos`, fd)
  },
  deletePhoto: (id: string, url: string) =>
    api.delete(`/properties/${id}/photos`, { params: { url } }),
  // 关联租约（返回 tenant_name，业主详情页取租客姓名的唯一来源）
  leases: (id: string) => api.get(`/properties/${id}/leases`),
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
  // 管理端手动记账 / 确认到账
  create: (data: any) => api.post('/payments', data),
  confirm: (id: string, data: any = {}) => api.post(`/payments/${id}/confirm`, data),
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

// 服务订单 / 套餐购买请求体类型（对应后端 ServiceOrderCreate 的购买计费字段）
export interface ServiceOrderCreatePayload {
  orderer_id?: string;
  orderer_type?: string;
  property_id: string;
  service_type: string;
  scheduled_at?: string;
  provider_id?: string;
  amount?: number;
  currency?: string;
  notes?: string;
  // 三种计费方式：按月/按次/按年（billing_model: monthly | per_use | annual）
  billing_model?: 'monthly' | 'per_use' | 'annual';
  billing_interval?: number; // monthly/annual 周期数；per_use 忽略
  billing_amount?: number; // 本次结算金额（= 单价）
  service_package_id?: string; // 关联的按次套餐
}

export const serviceOrdersApi = {
  list: (params?: any) => api.get('/service-orders', { params }),
  create: (data: ServiceOrderCreatePayload) => api.post('/service-orders', data),
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
  // 业主新增/编辑房源：owner_id 由后端按当前用户自动绑定
  create: (data: any) => api.post('/properties', data),
  update: (id: string, data: any) => api.patch(`/properties/${id}`, data),
  remove: (id: string) => api.delete(`/properties/${id}`),
  // 照片上传/删除（与 propertiesApi 同实现，直接复用）
  uploadPhotos: propertiesApi.uploadPhotos,
  deletePhoto: propertiesApi.deletePhoto,
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
  list: (params?: any) => api.get('/employees', { params }),
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
  /** 即时聊天 WebSocket 地址（含鉴权 token）；发送走 REST，WS 仅用于接收实时消息。 */
  async wsUrl(id: string): Promise<string> {
    const token = (await tokenStorage.get()) || '';
    const base = API_BASE_URL.replace(/^http(s)?:\/\//i, (_m, s) => (s ? 'wss://' : 'ws://'));
    return `${base}/chat/ws/chat/${id}?token=${encodeURIComponent(token)}`;
  },
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
    api.patch(`/property-deals/${id}/status`, null, { params: { status } }),
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

// 客户线索（用于撮合与跟进）
export const leadsApi = {
  list: (params?: any) => api.get('/leads', { params }),
  create: (data: any) => api.post('/leads', data),
  update: (id: string, data: any) => api.patch(`/leads/${id}`, data),
  delete: (id: string) => api.delete(`/leads/${id}`),
};

// 管理端账号操作
export const usersAdminApi = {
  list: (params?: any) => api.get('/admin/users', { params }),
  create: (data: any) => api.post('/admin/users', data),
  deleteUser: (id: string) => api.delete(`/admin/users/${id}`),
};
