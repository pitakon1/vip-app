import Taro from '@tarojs/taro'
import { chatWsUrl, request } from '@/lib/api'

// 全局注入的 API 地址（构建期由 Taro 注入，同 lib/api.ts 的 use）
declare const API_BASE: string

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
  // 微信一键登录：Taro.login() 的 code 换 openid，按 openid 找/建用户并返回 token
  // 本地未配置微信凭据时后端返回 503，此处保留 statusCode 便于页面友好提示
  wxLogin: async (data: { code: string; nickname?: string }) => {
    const baseURL = typeof API_BASE !== 'undefined' ? API_BASE : ''
    const res = await Taro.request({
      url: `${baseURL}/auth/wx/login`,
      method: 'POST',
      data: data as Record<string, unknown>,
      header: { 'Content-Type': 'application/json' }
    })
    if (res.statusCode === 503) {
      const err = new Error('微信登录暂不可用（服务端未配置微信凭据）') as Error & {
        statusCode?: number
      }
      err.statusCode = 503
      throw err
    }
    if (res.statusCode >= 200 && res.statusCode < 300) {
      return res.data as any
    }
    const body = res?.data as any
    const detail = body && typeof body === 'object' ? body.detail : undefined
    throw new Error(detail ? String(detail) : `微信登录失败，状态码：${res.statusCode}`)
  },
  // 微信手机号快捷绑定（需登录态）：code 来自 getPhoneNumber 按钮回调 e.detail.code
  wxBindPhone: (data: { code: string }) =>
    request({ url: '/auth/wx/bind-phone', method: 'POST', data }),
  // 手机号+验证码兜底：验证码获取（channel: sms）
  requestOtp: (data: { recipient: string; channel?: string }) =>
    request({ url: '/auth/otp/request', method: 'POST', data }),
  loginByOtp: (data: { phone: string; code: string }) =>
    request({ url: '/auth/login/otp', method: 'POST', data }),
  me: () => request({ url: '/auth/me', method: 'GET' }),
  // 「我的」账户/设置自助
  updateMe: (data: any) => request({ url: '/auth/me', method: 'PATCH', data }),
  changePassword: (data: { old_password: string; new_password: string }) =>
    request({ url: '/auth/me/password', method: 'POST', data }),
  preferences: () => request({ url: '/auth/me/preferences', method: 'GET' }),
  updatePreferences: (data: any) => request({ url: '/auth/me/preferences', method: 'PATCH', data })
}

export const propertiesApi = {
  list: (params?: any) => request({ url: '/properties', method: 'GET', data: params }),
  get: (id: string) => request({ url: `/properties/${id}`, method: 'GET' }),
  update: (id: string, data: any) =>
    request({ url: `/properties/${id}`, method: 'PATCH', data }),
  // 照片上传（multipart，后端先传后保存 url 列表到 photos）
  uploadPhotos: (id: string, files: any[]) =>
    Taro.uploadFile({
      url: `/properties/${id}/photos`,
      filePath: files[0].url,
      name: 'files',
      header: { Authorization: `Bearer ${Taro.getStorageSync('token')}` }
    }),
  deletePhoto: (id: string, url: string) =>
    request({ url: `/properties/${id}/photos?url=${encodeURIComponent(url)}`, method: 'DELETE' })
}

// 公司信息（公开接口）：仅取真实版本号供「我的 - 关于」展示，避免写死版本
export const companyApi = {
  info: () => request({ url: '/company/info', method: 'GET' })
}

// ============ 客户线索（CRM）============
export const leadsApi = {
  list: (params?: any) => request({ url: '/leads', method: 'GET', data: params }),
  get: (id: string) => request({ url: `/leads/${id}`, method: 'GET' }),
  create: (data: any) => request({ url: '/leads', method: 'POST', data }),
  update: (id: string, data: any) => request({ url: `/leads/${id}`, method: 'PATCH', data }),
  delete: (id: string) => request({ url: `/leads/${id}`, method: 'DELETE' })
}

export const leasesApi = {
  list: (params?: any) => request({ url: '/leases', method: 'GET', data: params }),
  mine: () => request({ url: '/leases/me', method: 'GET' }),
  get: (id: string) => request({ url: `/leases/${id}`, method: 'GET' }),
  renew: (id: string, data: any) =>
    request({ url: `/leases/${id}/renew`, method: 'POST', data })
}

export const paymentsApi = {
  mine: () => request({ url: '/payments/me', method: 'GET' }),
  // 收款列表（员工日历页取租金到期用，支持 status/payment_type/lease_id 等筛选）
  list: (params?: any) => request({ url: `/payments${qs(params)}`, method: 'GET' }),
  // 手动记账 / 确认到账（管理端写操作）
  create: (data: any) => request({ url: '/payments', method: 'POST', data }),
  get: (id: string) => request({ url: `/payments/${id}`, method: 'GET' }),
  confirm: (id: string, data: any) =>
    request({ url: `/payments/${id}/confirm`, method: 'POST', data }),
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
  // 业主自建房源：owner_id 由后端按当前用户自动绑定，客户端不传
  create: (data: any) => request({ url: '/properties', method: 'POST', data }),
  // 编辑名下房源（后端已放开 owner 对 PATCH /properties/{id} 的权限）
  update: (id: string, data: any) =>
    request({ url: `/properties/${id}`, method: 'PATCH', data }),
  // 照片上传（multipart，与 propertiesApi 同实现，直接复用）
  uploadPhotos: propertiesApi.uploadPhotos,
  deletePhoto: propertiesApi.deletePhoto,
  income: () => request({ url: '/owners/me/income', method: 'GET' }),
  marketing: () => request({ url: '/owners/me/marketing', method: 'GET' }),
  pricingSuggestion: () => request({ url: '/owners/me/pricing-suggestion', method: 'GET' }),
  annualFinancialSummary: (year?: number) =>
    request({ url: '/owners/me/annual-financial-summary', method: 'GET', data: { year } }),
  remove: (id: string) => request({ url: `/properties/${id}`, method: 'DELETE' })
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

// 管理端：账号管理（列表 / 开通 / 编辑 / 启停 / 删除）
export const adminUsersApi = {
  list: (params?: any) => request({ url: '/admin/users', method: 'GET', data: params }),
  create: (data: any) => request({ url: '/admin/users', method: 'POST', data }),
  update: (id: string, data: any) =>
    request({ url: `/admin/users/${id}`, method: 'PATCH', data }),
  deleteUser: (id: string) => request({ url: `/admin/users/${id}`, method: 'DELETE' }),
  me: () => request({ url: '/admin/users/me', method: 'GET' })
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
    request({ url: `/chat/conversations/${id}/messages`, method: 'POST', data }),
  wsUrl: (id: string | number) => chatWsUrl(id)
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
  get: (id: string) => request({ url: `/property-deals/${id}`, method: 'GET' }),
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

// ============ 房源上架单（发布 / 我的上架单 / 平台审核 / 关闭） ============
export const listingApi = {
  create: (data: any) => request({ url: '/listings', method: 'POST', data }),
  list: (params?: any) => request({ url: `/listings${qs(params)}`, method: 'GET' }),
  get: (id: string) => request({ url: `/listings/${id}`, method: 'GET' }),
  update: (id: string, data: any) => request({ url: `/listings/${id}`, method: 'PATCH', data }),
  // 平台上架审核：decision=approved|rejected，附 note
  review: (id: string, data: { decision: string; note?: string }) =>
    request({ url: `/listings/${id}/review`, method: 'POST', data }),
  // 下架/成交关闭：{sold?}{rented?}
  close: (id: string, data: any = {}) =>
    request({ url: `/listings/${id}/close`, method: 'POST', data })
}

// ============ 经纪人协议（在线签约：listing_agent / distributor） ============
export const brokerAgreementApi = {
  agreements: (brokerId: string) =>
    request({ url: `/brokers/${brokerId}/agreements`, method: 'GET' }),
  create: (brokerId: string, role: 'listing_agent' | 'distributor') =>
    request({ url: `/brokers/${brokerId}/agreements`, method: 'POST', data: { role } })
}

// ============ 去重审核（staff：疑似重复合并/驳回） ============
export const dedupeReviewApi = {
  list: (params?: any) => request({ url: `/dedupe-reviews${qs(params)}`, method: 'GET' }),
  merge: (id: string, note?: string) =>
    request({ url: `/dedupe-reviews/${id}/merge`, method: 'POST', data: { note } }),
  dismiss: (id: string, note?: string) =>
    request({ url: `/dedupe-reviews/${id}/dismiss`, method: 'POST', data: { note } })
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
  adminUsersApi,
  commissionRulesApi,
  saleListingApi,
  propertyDealApi,
  brokerApi,
  marketApi,
  listingApi,
  brokerAgreementApi,
  dedupeReviewApi
}
