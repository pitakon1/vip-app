import { request } from '@/lib/api'

export const authApi = {
  login: (email: string, password: string) =>
    request({ url: '/auth/login', method: 'POST', data: { email, password } }),
  me: () => request({ url: '/auth/me', method: 'GET' })
}

export const propertiesApi = {
  list: (params?: any) => request({ url: '/properties', method: 'GET', data: params })
}

export const leasesApi = {
  list: (params?: any) => request({ url: '/leases', method: 'GET', data: params })
}

export const paymentsApi = {
  mine: () => request({ url: '/payments/me', method: 'GET' })
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
  create: (data: any) => request({ url: '/maintenance-tickets', method: 'POST', data })
}

export const notificationsApi = {
  mine: () => request({ url: '/notifications/me', method: 'GET' }),
  readAll: () => request({ url: '/notifications/read-all', method: 'POST' })
}

export const ownerApi = {
  properties: () => request({ url: '/owners/me/properties', method: 'GET' }),
  income: () => request({ url: '/owners/me/income', method: 'GET' })
}

export default {
  authApi,
  propertiesApi,
  leasesApi,
  paymentsApi,
  documentsApi,
  serviceOrdersApi,
  maintenanceApi,
  notificationsApi,
  ownerApi
}
