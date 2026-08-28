import api from '@/lib/api'

// Auth
export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', `username=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }),
  register: (data: any) => api.post('/auth/register', data),
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
  list: (params?: any) => api.get('/properties', { params }),
  get: (id: string) => api.get(`/properties/${id}`),
  create: (data: any) => api.post('/properties', data),
  update: (id: string, data: any) => api.patch(`/properties/${id}`, data),
  delete: (id: string) => api.delete(`/properties/${id}`),
}

// Leases
export const leasesApi = {
  list: (params?: any) => api.get('/leases', { params }),
  get: (id: string) => api.get(`/leases/${id}`),
  create: (data: any) => api.post('/leases', data),
  renew: (id: string, data: any) => api.post(`/leases/${id}/renew`, data),
  terminate: (id: string, data: any) =>
    api.post(`/leases/${id}/terminate`, data),
}

// CRM / Leads
export const leadsApi = {
  list: (params?: any) => api.get('/leads', { params }),
  get: (id: string) => api.get(`/leads/${id}`),
  create: (data: any) => api.post('/leads', data),
  update: (id: string, data: any) => api.patch(`/leads/${id}`, data),
}

// Payments
export const paymentsApi = {
  list: (params?: any) => api.get('/payments', { params }),
  get: (id: string) => api.get(`/payments/${id}`),
  refund: (id: string, reason: string) =>
    api.post(`/payments/${id}/refund`, { reason }),
}

// Projects
export const projectsApi = {
  list: (params?: any) => api.get('/projects', { params }),
  get: (id: string) => api.get(`/projects/${id}`),
  create: (data: any) => api.post('/projects', data),
}

// Documents
export const documentsApi = {
  list: (params?: any) => api.get('/documents', { params }),
  get: (id: string) => api.get(`/documents/${id}`),
}

// Service Orders
export const serviceOrdersApi = {
  list: (params?: any) => api.get('/service-orders', { params }),
  create: (data: any) => api.post('/service-orders', data),
  updateStatus: (id: string, status: string) =>
    api.patch(`/service-orders/${id}/status`, { status }),
}

// Maintenance
export const maintenanceApi = {
  list: (params?: any) => api.get('/maintenance-tickets', { params }),
  create: (data: any) => api.post('/maintenance-tickets', data),
  update: (id: string, data: any) =>
    api.patch(`/maintenance-tickets/${id}`, data),
}

// Employees
export const employeesApi = {
  list: (params?: any) => api.get('/employees', { params }),
  me: () => api.get('/employees/me'),
  leaderboard: () => api.get('/employees/leaderboard'),
}

// Company
export const companyApi = {
  info: () => api.get('/company/info'),
  update: (data: any) => api.put('/company/info', data),
}

// Notifications
export const notificationsApi = {
  mine: (params?: any) => api.get('/notifications/me', { params }),
  read: (id: string) => api.patch(`/notifications/${id}/read`),
  readAll: () => api.post('/notifications/read-all'),
}
