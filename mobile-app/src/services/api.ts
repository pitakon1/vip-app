import api, { API_BASE_URL } from '@/lib/api';
import { tokenStorage } from '@/lib/storage';

export const authApi = {
  // 后端 login 使用 OAuth2PasswordRequestForm（表单格式），与 Web 端保持一致
  login: (email: string, password: string) =>
    api.post('/auth/login', `username=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }),
  register: (data: any) => api.post('/auth/register', data),
  // Google / Apple 一键登录（OAuth status 含 enabled/mock 开关，mock 分支供本地无凭据时兜底）
  oauthStatus: () => api.get('/auth/oauth/status'),
  oauthGoogle: (data: { id_token?: string; mock_email?: string }) =>
    api.post('/auth/oauth/google', data),
  oauthApple: (data: { id_token?: string; mock_email?: string }) =>
    api.post('/auth/oauth/apple', data),
  // 手机号/邮箱验证码：发送 OTP（dev/未配短信凭据时明文码在响应 dev_code 里）
  requestOtp: (recipient: string, channel: string) =>
    api.post('/auth/otp/request', { recipient, channel }),
  // 手机号+验证码登录
  loginByOtp: (phone: string, code: string) =>
    api.post('/auth/login/otp', { phone, code }),
  me: () => api.get('/auth/me'),
  // 「我的」账户/设置自助
  updateMe: (data: any) => api.patch('/auth/me', data),
  // 头像上传（multipart）：后端校验、落盘到 /uploads/avatars 并回写 avatar_url，返回最新用户
  uploadAvatar: (file: any) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post('/auth/me/avatar', fd);
  },
  changePassword: (data: { old_password: string; new_password: string }) =>
    api.post('/auth/me/password', data),
  preferences: () => api.get('/auth/me/preferences'),
  updatePreferences: (data: any) => api.patch('/auth/me/preferences', data),
};

export const propertiesApi = {
  list: (params?: any) => api.get('/properties', { params }),
  get: (id: string) => api.get(`/properties/${id}`),
  // 新建房源（管理端「新增房源」）。created_by 由服务端按当前登录账号写入，
  // 客户端不传——房源归属必须由 token 决定，不能由调用方指定。
  create: (data: any) => api.post('/properties', data),
  remove: (id: string) => api.delete(`/properties/${id}`),
  // 指派房源归属人（管理员专用）。传 null 收回归属，房源回到管理员池。
  assign: (id: string, createdBy: string | null) =>
    api.post(`/properties/${id}/assign`, { created_by: createdBy }),
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
  // 批量收藏状态（列表页一次请求，替代逐条 N+1）
  batchStatus: (propertyIds: string[]) =>
    api.get('/favorites/status', {
      params: { property_ids: propertyIds.join(',') },
    }),
};

// 降价提醒
export const priceAlertsApi = {
  subscribe: (data: { property_id: string; listing_id?: string }) =>
    api.post('/price-alerts', data),
  unsubscribe: (propertyId: string) =>
    api.delete(`/price-alerts/${propertyId}`),
  mine: (params?: any) => api.get('/price-alerts', { params }),
  status: (propertyId: string) =>
    api.get(`/price-alerts/status/${propertyId}`),
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
  // 四种计费方式：按月/按日/按次/按年（billing_model: monthly | daily | per_use | annual）
  billing_model?: 'monthly' | 'daily' | 'per_use' | 'annual';
  billing_interval?: number; // monthly/daily/annual 周期数（月/天/年）；per_use 忽略
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
  properties: (params?: any) => api.get('/owners/me/properties', { params }),
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
  // 业主检索（员工侧）：代业主发布上架单时选择「归属业主」用，返回 Owner.id
  list: (params?: any) => api.get('/owners', { params }),
  marketing: () => api.get('/owners/me/marketing', { params: { page: 1, limit: 100 } }),
  pricingSuggestion: () => api.get('/owners/me/pricing-suggestion'),
  annualSummary: (year?: number) =>
    api.get('/owners/me/annual-financial-summary', {
      params: year ? { year } : {},
    }),
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
  /** 当前用户与「平台客服」的会话（无则创建），IM 客服入口使用 */
  support: () => api.get('/chat/support'),
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

export const geoApi = {
  geocode: (address: string) => api.post('/geo/geocode', { address }),
  reverse: (lat: number, lng: number) => api.post('/geo/reverse', { lat, lng }),
  distance: (a: { lat: number; lng: number }, b: { lat: number; lng: number }) =>
    api.post('/geo/distance', { a, b }),
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
  get: (id: string) => api.get(`/property-deals/${id}`),
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

// —— 房源上架单（发布/我的上架）——
export const listingApi = {
  list: (params?: any) => api.get('/listings', { params }),
  get: (id: string) => api.get(`/listings/${id}`),
  create: (data: any) => api.post('/listings', data),
  update: (id: string, data: any) => api.patch(`/listings/${id}`, data),
  // 下架/成交关闭：{sold:true}(卖→sold) / {rented:true}(租→rented)，否则 status=closed
  close: (id: string, body: any = {}) => api.post(`/listings/${id}/close`, body),
};

// —— 战略：分销体系 ——
export const brokerApi = {
  list: (params?: any) => api.get('/brokers', { params }),
  create: (data: any) => api.post('/brokers', data),
  me: () => api.get('/brokers/me'),
  approve: (id: string, data: any) => api.post(`/brokers/${id}/approve`, data),
  suspend: (id: string) => api.post(`/brokers/${id}/suspend`),
  invite: (code: string) => api.get(`/brokers/invite/${code}`),
  // 协议在线签约：两份状态查询 / 生成（role: listing_agent | distributor）
  agreements: (id: string) => api.get(`/brokers/${id}/agreements`),
  createAgreement: (id: string, role: string) =>
    api.post(`/brokers/${id}/agreements`, { role }),
  // 转介绍
  createReferral: (params?: any) => api.post('/brokers/referrals', null, { params }),
  myReferrals: () => api.get('/brokers/referrals/mine'),
  // 联合单分成
  createSplitDeal: (data: any) => api.post('/brokers/split-deals', data),
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
  // 编辑账号（资料 / 角色 / 启停）。此前 App 端只封装了增删，
  // 导致账号建好后角色无法修改，只能删了重建。
  update: (id: string, data: any) => api.patch(`/admin/users/${id}`, data),
  deleteUser: (id: string) => api.delete(`/admin/users/${id}`),
};

// 管理端：角色权限配置（权限点分组 + 各角色已分配；可编辑保存，保存后即时生效）
export const permissionsAdminApi = {
  /** 权限点分组（categories）+ 每个角色当前分配（roles） */
  list: () => api.get('/admin/permissions'),
  role: (role: string) => api.get(`/admin/permissions/roles/${role}`),
  /** 覆盖设置某角色权限点（先清后设，后端随即失效权限缓存） */
  setRole: (role: string, codes: string[]) =>
    api.put(`/admin/permissions/roles/${role}`, { codes }),
};

// 公司资料与系统配置（管理端「我的 - 业务设置」读写：租金/合同提醒天数、自动催缴）
export const companyApi = {
  info: () => api.get('/company/info'),
  update: (data: any) => api.put('/company/info', data),
  settings: () => api.get('/company/settings'),
  updateSettings: (data: any) => api.put('/company/settings', data),
};
